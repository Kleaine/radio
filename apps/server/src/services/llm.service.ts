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

// ── JSON 提取（三层回退）──

function extractJson(text: string): Record<string, any> | null {
  // 第 1 层：直接解析
  try {
    return JSON.parse(text);
  } catch {}

  // 第 2 层：提取 ```json ... ``` 代码块
  const codeMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch?.[1]) {
    try {
      return JSON.parse(codeMatch[1].trim());
    } catch {}
  }

  // 第 3 层：正则提取第一个 { ... } 区间
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }

  return null;
}

// ── 解析 LLM 回复为 PlanResponse ──

function parsePlan(json: Record<string, any>): PlanResponse {
  const items: PlayableItem[] = (json.items ?? []).map((item: any) => {
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
      temperature: 0.8,
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
      temperature: 0.8,
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
    ?? path.resolve(process.cwd(), "apps/server/src/prompts", "plan-system.md");

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

      console.warn("[llm] 播报计划 JSON 提取失败");
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

      console.warn("[llm] 播报计划 JSON 提取失败");
      return fallbackPlan();
    } catch (e: any) {
      console.error("[llm] 播报计划生成失败:", e.message);
      return fallbackPlan();
    }
  }

  return { generatePlanStream, generatePlan };
}
