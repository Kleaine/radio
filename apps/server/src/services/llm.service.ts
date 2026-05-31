// llm.service.ts — LLM 调用封装（豆包 / 火山引擎）
// 功能：流式聊天 + System Prompt 注入 + JSON 提取 + 容错降级

import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type { MemoryEntry } from "./memory-writer";

// ── 类型定义 ──

export interface ChatSong {
  title: string;
  artist: string;
  reason: string;
  id?: string;      // QQ音乐歌曲ID（由 enrich 阶段补全）
  cover?: string;   // 封面图URL（由 enrich 阶段补全）
}

export interface ScheduleEntry {
  start: string;   // "HH:MM"
  end: string;     // "HH:MM"，全天事件留空
  title: string;
}

export interface ChatReply {
  say: string;
  scene: string;
  songs: ChatSong[];
  segue: string;
  schedule: ScheduleEntry[];
  memory: MemoryEntry[];
}

export interface LlmConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  /** plan-system.md 的路径 */
  systemPromptPath?: string;
  /** LLM 调用超时（毫秒），默认 60000 */
  timeoutMs?: number;
}

export interface LlmService {
  /** 流式聊天。每收到一段文本就回调 onChunk。返回完整 ChatReply。 */
  chatStream(
    userMessage: string,
    context: string,
    onChunk: (text: string) => void
  ): Promise<ChatReply>;

  /** 非流式聊天。用于后台调度等无需实时推送的场景。 */
  chat(userMessage: string, context: string): Promise<ChatReply>;
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

// ── 默认回复（LLM 失败时的兜底）──

function fallbackReply(_userMessage: string): ChatReply {
  return {
    say: "抱歉，我这边信号不太好……不过歌还是能放的，先给你来几首舒缓的～",
    scene: "default",
    songs: [
      { title: "晴天", artist: "周杰伦", reason: "经典华语流行" },
      { title: "好久不见", artist: "陈奕迅", reason: "温暖男声" },
      { title: "遇见", artist: "孙燕姿", reason: "清新治愈" },
    ],
    segue: "",
    schedule: [],
    memory: [],
  };
}

// ── 解析 LLM 回复为 ChatReply ──

function parseReply(json: Record<string, any>): ChatReply {
  const songs: ChatSong[] = (json.songs ?? []).map((s: any) => ({
    title: s.title ?? s.name ?? "",
    artist: s.artist ?? "",
    reason: s.reason ?? "",
    id: s.id ?? undefined,
    cover: s.cover ?? undefined,
  }));

  // schedule 兼容两种格式：LLM 可能输出 {time, title} 或 {start, end, title}
  const schedule: ScheduleEntry[] = (json.schedule ?? []).map((s: any) => ({
    start: s.start ?? s.time ?? "",
    end: s.end ?? "",
    title: s.title ?? s.name ?? "",
  }));

  return {
    say: json.say ?? json.summary ?? "",
    scene: json.scene ?? "default",
    songs,
    segue: json.segue ?? "",
    schedule,
    memory: json.memory ?? [],
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
    return `你是小雨，用户的私人 AI 音乐电台 DJ。说话自然像真人 DJ。输出格式：先说对话文本，然后 JSON 代码块包含 say/scene/songs/segue/schedule/memory。`;
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

  const msg = (userMessage: string, context: string) =>
    context ? `${context}\n\n用户说：${userMessage}` : userMessage;

  async function chatStream(
    userMessage: string,
    context: string,
    onChunk: (text: string) => void
  ): Promise<ChatReply> {
    try {
      const fullText = await callDoubaoStream(
        client, model, systemPrompt, msg(userMessage, context), timeoutMs, onChunk
      );

      const json = extractJson(fullText);
      if (json) return parseReply(json);

      // JSON 提取失败，有文本就用文本
      console.warn("[llm] JSON 提取失败，使用文本 + 默认歌单");
      return {
        ...fallbackReply(userMessage),
        say: fullText.trim() || fallbackReply(userMessage).say,
      };
    } catch (e: any) {
      console.error("[llm] 流式调用失败:", e.message);
      return fallbackReply(userMessage);
    }
  }

  async function chat(userMessage: string, context: string): Promise<ChatReply> {
    try {
      const fullText = await callDoubao(
        client, model, systemPrompt, msg(userMessage, context), timeoutMs
      );

      const json = extractJson(fullText);
      if (json) return parseReply(json);

      console.warn("[llm] JSON 提取失败，使用文本 + 默认歌单");
      return {
        ...fallbackReply(userMessage),
        say: fullText.trim() || fallbackReply(userMessage).say,
      };
    } catch (e: any) {
      console.error("[llm] 非流式调用失败:", e.message);
      return fallbackReply(userMessage);
    }
  }

  return { chatStream, chat };
}
