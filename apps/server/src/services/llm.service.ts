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
}

export interface ScheduleEntry {
  time: string;   // "HH:MM"
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
}

export interface LlmService {
  /**
   * 流式聊天。每收到一段文本就回调 onChunk。
   * 返回完整解析后的 ChatReply。
   */
  chat(
    userMessage: string,
    context: string,
    onChunk: (text: string) => void
  ): Promise<ChatReply>;
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

// ── 流式调用豆包 ──

async function callDoubaoStream(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userMessage: string,
  onChunk: (text: string) => void
): Promise<string> {
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    stream: true,
    max_tokens: 4096,
    temperature: 0.8,
  });

  let fullText = "";

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      onChunk(delta);
    }
  }

  return fullText;
}

// ── 加载 System Prompt ──

function loadSystemPrompt(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    // 如果文件不存在，返回内置最小版本
    return `你是小雨，用户的私人 AI 音乐电台 DJ。说话自然像真人 DJ。输出格式：先说对话文本，然后 JSON 代码块包含 say/scene/songs/segue/schedule/memory。`;
  }
}

// ── 创建 LlmService ──

export function createLlmService(config: LlmConfig): LlmService {
  const apiKey = config.apiKey;
  const baseURL = config.baseURL ?? "https://ark.cn-beijing.volces.com/api/v3";
  const model = config.model ?? "doubao-lite-128k";
  const systemPromptPath = config.systemPromptPath
    ?? path.resolve(process.cwd(), "apps/server/src/prompts", "plan-system.md");

  const client = new OpenAI({ apiKey, baseURL });
  const systemPrompt = loadSystemPrompt(systemPromptPath);

  async function chat(
    userMessage: string,
    context: string,
    onChunk: (text: string) => void
  ): Promise<ChatReply> {
    const fullMessage = context
      ? `${context}\n\n用户说：${userMessage}`
      : userMessage;

    try {
      const fullText = await callDoubaoStream(
        client, model, systemPrompt, fullMessage, onChunk
      );

      const json = extractJson(fullText);
      if (json) {
        return {
          say: json.say ?? json.summary ?? "",
          scene: json.scene ?? "default",
          songs: json.songs ?? [],
          segue: json.segue ?? "",
          schedule: json.schedule ?? [],
          memory: json.memory ?? [],
        };
      }

      // JSON 提取失败，但有对话文本
      console.warn("[llm] JSON 提取失败，使用文本部分 + 默认歌单");
      return {
        say: fullText.trim() || "好的，给你推荐几首～",
        scene: "default",
        songs: [
          { title: "晴天", artist: "周杰伦", reason: "经典好歌" },
        ],
        segue: "",
        schedule: [],
        memory: [],
      };
    } catch (e: any) {
      console.error("[llm] 豆包调用失败:", e.message);
      return fallbackReply(userMessage);
    }
  }

  return { chat };
}
