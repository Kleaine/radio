// llm.service.ts — LLM 调用封装（豆包 / 火山引擎）
// 功能：流式生成电台播报计划 + JSON 提取 + 容错降级

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { MemoryEntry } from "./memory-writer";

// ── 类型定义 ──

export interface PlayableItem {
  type: "song" | "tts";
  // song 字段
  title?: string;
  artist?: string;
  query?: string;     // 搜索关键词，enrich 阶段用
  songId?: string;    // enrich 后补全
  coverUrl?: string;  // enrich 后补全
  audioUrl?: string;  // enrich 后补全
  reason?: string;    // AI 选这首歌的理由
  // tts 字段
  text?: string;      // DJ 说话文本，分工4 TTS 合成语音
  voice?: string;     // 音色选择：gentle_female | lively_female | announcer_male
}

export interface ScheduleEntry {
  start: string;
  end: string;
  title: string;
}

export interface PlanResponse {
  summary: string;
  scene: string;
  items: PlayableItem[];   // 顺序序列：开场白(tts) → 歌 → 串场(tts) → 歌 → ...
  memory?: MemoryEntry[];
  schedule?: ScheduleEntry[];
}

// ── 配置与接口 ──

export interface LlmConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  systemPromptPath?: string;
  timeoutMs?: number;
}

export interface LlmService {
  /** 流式生成播报计划。每收到一段文本就回调 onChunk。返回完整 PlanResponse。 */
  generatePlanStream(
    trigger: "manual" | "auto" | "scheduled",
    input: string,
    context: string,
    onChunk: (text: string) => void
  ): Promise<PlanResponse>;

  /** 非流式生成播报计划。用于后台调度。 */
  generatePlan(
    trigger: "manual" | "auto" | "scheduled",
    input: string,
    context: string
  ): Promise<PlanResponse>;
}

// ── JSON 修复：LLM 偶尔会输出有微小语法错误的 JSON ──
// 修复：混合引号、单引号代替冒号、尾逗号等常见问题

function fixJson(raw: string): string {
  let s = raw.trim();

  // 1. 去掉可能的外层包裹（```json 或 ```）
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

  // 2. 找到最外层 { ... } 区间
  const firstBrace = s.indexOf("{");
  const lastBrace = s.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }

  // 3. 逐字符扫描 + 状态机：把所有字符串字面量统一用双引号
  //    - key 必须是 "key": （修复 'key': 和 'key' : 和 "key' :）
  //    - 字符串值必须是 "value"（修复 'value'）
  //    - 修复 "key' : 'value' → "key": "value"
  //    - 移除尾逗号
  let result = "";
  let i = 0;
  let inString: string | null = null;  // 当前字符串的引号类型
  let stringStart = -1;
  let stringContent: string[] = [];

  const tokens: string[] = [];  // 输出流：交替的"非字符串 token"和"字符串 token"

  // 阶段 1：把输入切成 "非字符串片段" 和 "字符串字面量片段" 的交替序列
  let currentNonString = "";
  while (i < s.length) {
    const ch = s[i];

    if (inString) {
      // 在字符串内部
      if (ch === "\\") {
        // 转义字符：原样保留
        stringContent.push(ch);
        if (i + 1 < s.length) {
          stringContent.push(s[i + 1]);
          i += 2;
          continue;
        }
        i++;
        continue;
      }
      if (ch === inString) {
        // 字符串结束
        tokens.push("STR:" + stringContent.join(""));
        inString = null;
        stringContent = [];
        i++;
        continue;
      }
      // 字符串内部的普通字符（注意：在 '...' 里的双引号或 "..." 里的单引号都当作普通字符）
      stringContent.push(ch);
      i++;
      continue;
    }

    // 不在字符串内
    if (ch === '"' || ch === "'") {
      // 字符串开始
      if (currentNonString) {
        tokens.push("TOK:" + currentNonString);
        currentNonString = "";
      }
      inString = ch;
      stringContent = [];
      i++;
      continue;
    }

    currentNonString += ch;
    i++;
  }
  if (currentNonString) tokens.push("TOK:" + currentNonString);

  // 阶段 2：重构 JSON
  // 遍历 token，对 STR 统一用双引号（并转义内部未转义的双引号）
  // 对 TOK 部分：
  //   - 修 'key': → "key":
  //   - 修 "key' → "key"
  //   - 修 ",\s*}" → "}"  (尾逗号)
  //   - 修 ",\s*]" → "]"  (尾逗号)
  //   - 修 `'value'`（作为值出现的单引号字符串）→ "value"

  let output = "";
  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t];
    const type = token.slice(0, 4);
    const content = token.slice(4);

    if (type === "STR:") {
      // 字符串字面量：强制用双引号
      // 转义内容里的未转义双引号
      const escaped = content.replace(/(?<!\\)"/g, '\\"');
      output += '"' + escaped + '"';
      continue;
    }

    // TOK 片段：非字符串的语法部分
    let part = content;

    // 修复常见的 "key' : value" 模式：把 "'" 紧跟 : 改成 ":"
    // 例如 "artist' : " → "artist" :
    part = part.replace(/"([^"]*)"\s*'\s*:/g, '"$1":');

    // 修复 "key':" （key 后直接是 '然后是 :）
    part = part.replace(/'([^']*)'\s*:/g, '"$1":');

    // 修复 "key'value" 中 ' 代替 : 的情况
    // 例: "artist' "神秘花园"" → "artist": "神秘花园""
    // 检查下一个 token 是否为 STR，如果当前 TOK 结尾是 "'"
    part = part.replace(/"([^"]*)"\s*'\s*/g, '"$1": ');

    // 修复值位置的单引号字符串：': 'value'  或 : 'value'  → : "value"
    // (这在上面状态机已经处理过了，因为单引号内容会被识别为 STR token)

    // 移除尾逗号
    part = part.replace(/,(\s*[}\]])/g, "$1");

    output += part;
  }

  return output;
}

// ── JSON 提取（多层回退 + 修复）──

function extractJson(text: string): Record<string, any> | null {
  // 候选 JSON 文本列表：按可能性从高到低尝试
  const candidates: string[] = [];

  // 候选 1：直接全文
  candidates.push(text);

  // 候选 2：```json ... ``` 代码块
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch?.[1]) candidates.push(codeMatch[1].trim());

  // 候选 3：第一个 { ... } 区间
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    candidates.push(text.slice(start, end + 1));
  }

  // 对每个候选，先尝试直接解析，再尝试修复后解析
  for (const raw of candidates) {
    // 尝试 1：直接解析
    try {
      return JSON.parse(raw);
    } catch {}

    // 尝试 2：修复后解析
    try {
      const fixed = fixJson(raw);
      const result = JSON.parse(fixed);
      if (result && typeof result === "object") {
        console.log("[llm] JSON 修复成功：原始有语法错误，已修复");
        return result;
      }
    } catch {}
  }

  return null;
}

// ── 解析 LLM 回复为 PlanResponse ──

function parsePlan(json: Record<string, any>): PlanResponse {
  const rawItems = Array.isArray(json.items) ? json.items : [];
  const items: PlayableItem[] = rawItems.map((item: any) => {
    if (item.type === "tts") {
      return { type: "tts", text: item.text ?? "", voice: item.voice ?? undefined };
    }
    return {
      type: "song",
      title: item.title ?? "",
      artist: item.artist ?? "",
      query: item.query ?? `${item.title ?? ""} ${item.artist ?? ""}`.trim(),
      reason: item.reason ?? "",
      coverUrl: item.coverUrl ?? undefined,
      audioUrl: item.audioUrl ?? undefined,
    };
  });

  const schedule: ScheduleEntry[] = (json.schedule ?? []).map((s: any) => ({
    start: s.start ?? s.time ?? "",
    end: s.end ?? "",
    title: s.title ?? "",
  }));

  return {
    summary: json.summary ?? "今日播报计划",
    scene: json.scene ?? "default",
    items,
    memory: json.memory ?? [],
    schedule,
  };
}

function fallbackPlan(): PlanResponse {
  return {
    summary: "默认播报计划",
    scene: "default",
    items: [
      { type: "tts", text: "欢迎收听 AI 电台，接下来为你准备了几首好听的歌。" },
      { type: "song", query: "周杰伦 晴天", reason: "经典好歌" },
      { type: "tts", text: "希望你喜欢～下一首更精彩" },
      { type: "song", query: "陈奕迅 好久不见", reason: "温暖男声" },
    ],
    memory: [],
    schedule: [],
  };
}

// ── 流式调用豆包 ──

async function callDoubaoStream(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number,
  onChunk: (text: string) => void
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: true,
      max_tokens: 4096,
      temperature: 0.7,
    }, { signal: controller.signal });

    let fullText = "";

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onChunk(delta);
      }
    }

    return fullText;
  } finally {
    clearTimeout(timer);
  }
}

// ── 非流式调用豆包 ──

async function callDoubao(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userMessage: string,
  timeoutMs: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      stream: false,
      max_tokens: 4096,
      temperature: 0.7,
    }, { signal: controller.signal });

    return completion.choices?.[0]?.message?.content ?? "";
  } finally {
    clearTimeout(timer);
  }
}

// ── 加载 System Prompt ──

function loadSystemPrompt(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return `你是小雨，用户的私人 AI 音乐电台 DJ。说话自然像真人 DJ。输出格式：先说对话文本，然后 JSON 代码块包含 summary/scene/items(按序排列，type 为 song 或 tts)/schedule/memory。`;
  }
}

// ── 创建 LlmService ──

export function createLlmService(config: LlmConfig): LlmService {
  const apiKey = config.apiKey;
  const baseURL = config.baseURL ?? "https://ark.cn-beijing.volces.com/api/v3";
  const model = config.model ?? "doubao-lite-128k";
  const timeoutMs = config.timeoutMs ?? 60000;
  const systemPromptPath = config.systemPromptPath
    ?? path.resolve(__dirname, "..", "prompts", "plan-system.md");

  const client = new OpenAI({ apiKey, baseURL, timeout: timeoutMs });
  const systemPrompt = loadSystemPrompt(systemPromptPath);

  async function generatePlanStream(
    trigger: "manual" | "auto" | "scheduled",
    input: string,
    context: string,
    onChunk: (text: string) => void
  ): Promise<PlanResponse> {
    const prefix = trigger === "scheduled"
      ? "请根据当前时间和场景自动生成一段电台播报计划。"
      : "";
    const fullMessage = context
      ? `${context}\n\n${prefix}用户说：${input}`
      : `${prefix}${input}`;

    try {
      const fullText = await callDoubaoStream(
        client, model, systemPrompt, fullMessage, timeoutMs, onChunk
      );

      const json = extractJson(fullText);
      if (json) return parsePlan(json);

      console.warn("[llm] 播报计划 JSON 提取失败，模型输出末尾:", fullText.slice(-300));
      return fallbackPlan();
    } catch (e: any) {
      console.error("[llm] 播报计划流式生成失败:", e.message);
      return fallbackPlan();
    }
  }

  async function generatePlan(
    trigger: "manual" | "auto" | "scheduled",
    input: string,
    context: string
  ): Promise<PlanResponse> {
    const prefix = trigger === "scheduled"
      ? "请根据当前时间和场景自动生成一段电台播报计划。"
      : "";
    const fullMessage = context
      ? `${context}\n\n${prefix}用户说：${input}`
      : `${prefix}${input}`;

    try {
      const fullText = await callDoubao(
        client, model, systemPrompt, fullMessage, timeoutMs
      );

      const json = extractJson(fullText);
      if (json) return parsePlan(json);

      console.warn("[llm] 播报计划 JSON 提取失败，模型输出末尾:", fullText.slice(-300));
      return fallbackPlan();
    } catch (e: any) {
      console.error("[llm] 播报计划生成失败:", e.message);
      return fallbackPlan();
    }
  }

  return { generatePlanStream, generatePlan };
}
