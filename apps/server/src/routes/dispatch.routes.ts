// routes/dispatch.routes.ts — 三层意图分发路由
// 第1层：正则指令 → 播放器控制
// 第2层：正则搜索 → 音乐搜索
// 第3层：自然语言 → LLM 流式生成

import { Router, Request, Response } from "express";
import path from "path";
import { getDb } from "../db/init";
import { authMiddleware, AuthRequest } from "../middleware/auth";

// 引入 services
import { createLlmService, PlanResponse } from "../services/llm.service";
import { createContextService } from "../services/context.service";
import { createWeatherService } from "../services/weather.service";
import { createCalendarService } from "../services/calendar.service";
import { createMemoryWriter } from "../services/memory-writer";
import { MockMusicService, QQMusicService } from "../services/music.service";
import { enrichItems } from "../services/plan-enrich";
import { preWarmUrls } from "./audio.routes";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";

export const dispatchRoutes = Router();

// TTS 调用函数
async function callTTS(text: string, voiceStyle: string): Promise<string> {
  const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || "http://127.0.0.1:8008";

  try {
    const response = await fetch(`${TTS_SERVICE_URL}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: voiceStyle }),
    });

    if (!response.ok) {
      throw new Error(`TTS 服务返回错误: ${response.status}`);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const filename = `tts_${uuidv4().slice(0, 8)}.wav`;
    const outputPath = path.resolve(__dirname, "../../../tts/outputs", filename);

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, audioBuffer);
    return `/static/${filename}`;
  } catch (err: any) {
    console.error("[tts] 调用失败:", err.message);
    return "";
  }
}

// ── 第1层：指令匹配正则 ──
const COMMAND_PATTERNS = [
  { regex: /下一首|切歌|next|skip/i, action: "next" },
  { regex: /上一首|previous|prev/i, action: "prev" },
  { regex: /^暂停$|^pause$/i, action: "pause" },
  { regex: /^播放$|^play$|^继续$|^resume$/i, action: "play" },
  { regex: /随机|shuffle/i, action: "shuffle" },
  { regex: /循环|单曲循环|repeat/i, action: "repeat" },
];

// ── 第2层：搜索意图正则 ──
const SEARCH_PATTERNS = [
  { regex: /^(播放|搜索|搜|找|来一?首|听)\s*(.+)/, group: 2 },
  { regex: /^(.+)的歌$/, group: 1 },
];

// 检查是否匹配搜索 — 只匹配极简指令如"播放晴天"
function matchSearch(message: string): string | null {
  // 带任何标点、复杂表达的走 AI，不走搜索
  if (/[，。,！？、《》]/.test(message)) return null;

  for (const { regex, group } of SEARCH_PATTERNS) {
    const match = message.match(regex);
    if (match?.[group]) {
      const kw = match[group].trim();
      if (kw.length <= 10) return kw;
    }
  }
  return null;
}

// 检查是否匹配指令
function matchCommand(message: string): string | null {
  for (const { regex, action } of COMMAND_PATTERNS) {
    if (regex.test(message)) return action;
  }
  return null;
}

// AI 记忆：记录上一次的完整开场白，下次对话时让 LLM 知道自己说过什么
let lastAiOpening: string = "";

function setLastAiOpening(opening: string) {
  lastAiOpening = opening;
}

// 懒加载单例 — 首次请求时初始化，之后复用
// 不能放在模块顶层，因为 dotenv 尚未加载
let _weatherService: ReturnType<typeof createWeatherService> | null = null;
let _calendarService: ReturnType<typeof createCalendarService> | null = null;
let _memoryWriter: ReturnType<typeof createMemoryWriter> | null = null;
let _llmService: ReturnType<typeof createLlmService> | null = null;
let _musicService: QQMusicService | null = null;

function getWeatherService() {
  if (!_weatherService) {
    _weatherService = createWeatherService({
      openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
      city: process.env.CITY || "Beijing",
    });
  }
  return _weatherService;
}
function getCalendarService() {
  if (!_calendarService) _calendarService = createCalendarService();
  return _calendarService;
}
function getMemoryWriter() {
  if (!_memoryWriter) _memoryWriter = createMemoryWriter();
  return _memoryWriter;
}
function getLlmService() {
  if (!_llmService) {
    _llmService = createLlmService({
      apiKey: process.env.DOUBAO_API_KEY || "",
      model: process.env.DOUBAO_MODEL || "doubao-lite-128k",
    });
  }
  return _llmService;
}
function getMusicService() {
  if (!_musicService) _musicService = new QQMusicService(process.env.QQ_MUSIC_COOKIE || "");
  return _musicService;
}

function buildContextForUser(userId: number | undefined) {
  let recentPlays: Array<{ title: string; artist: string }> = [];
  let recentSkips: string[] = [];
  let topArtists: string[] = [];

  if (userId) {
    const db = getDb();
    recentPlays = db.prepare(`
      SELECT song_title, artist FROM plays
      WHERE user_id = ? AND skipped = 0
      ORDER BY played_at DESC LIMIT 25
    `).all(userId).map((r: any) => ({ title: r.song_title, artist: r.artist }));

    recentSkips = db.prepare(`
      SELECT song_title FROM plays
      WHERE user_id = ? AND skipped = 1
      ORDER BY played_at DESC LIMIT 5
    `).all(userId).map((r: any) => r.song_title);

    topArtists = db.prepare(`
      SELECT artist, COUNT(*) as cnt FROM plays
      WHERE user_id = ? AND skipped = 0 AND artist != ''
      GROUP BY artist ORDER BY cnt DESC LIMIT 10
    `).all(userId).map((r: any) => r.artist);
  }

  return createContextService({
    weatherService: getWeatherService(),
    calendarService: getCalendarService(),
    memoryWriter: getMemoryWriter(),
    recentPlays,
    recentSkips,
    topArtists,
    lastAiOpening,
  });
}

// ── POST /api/dispatch ──
// SSE 流式响应
dispatchRoutes.post("/dispatch", async (req: Request, res: Response) => {
  const { message } = req.body;

  if (!message || typeof message !== "string") {
    res.fail(400, "缺少 message 参数");
    return;
  }

  console.log("[dispatch] 收到消息:", message);

  // 设置 SSE 响应头
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  // 发送 SSE 事件的辅助函数
  const sendEvent = (event: string, data: string) => {
    res.write(`event: ${event}\ndata: ${data}\n\n`);
  };

  // 第1层：指令匹配
  const command = matchCommand(message);
  console.log("[dispatch] 指令匹配结果:", command);
  if (command) {
    sendEvent("done", JSON.stringify({
      type: "command",
      action: command,
      message: `执行指令: ${command}`,
    }));
    res.end();
    return;
  }

  // 第2层：搜索意图
  const searchKeyword = matchSearch(message);
  console.log("[dispatch] 搜索匹配结果:", searchKeyword);
  if (searchKeyword) {
    try {
      const songs = await getMusicService().search(searchKeyword, 10);
      sendEvent("done", JSON.stringify({
        type: "search",
        keyword: searchKeyword,
        results: songs.map(s => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          album: s.album,
          coverUrl: s.coverUrl,
          durationMs: s.durationMs,
        })),
      }));
    } catch (err: any) {
      sendEvent("done", JSON.stringify({
        type: "error",
        message: "搜索失败，请稍后重试",
      }));
    }

    res.end();
    return;
  }

  // 第3层：自然语言 → LLM
  const userId = (req as AuthRequest).userId;
  const contextService = buildContextForUser(userId);

  try {
    // 立即告知前端正在处理（模仿 Claude Code 的即时反馈）
    sendEvent("status", "DJ 正在为您准备...");

    // 组装上下文（天气走缓存，首次调用后不再阻塞）
    const context = await contextService.build(message);

    // 流式调用 LLM
    let jsonStarted = false;
    const plan = await getLlmService().generatePlanStream(
      "manual",
      message,
      context,
      (chunk: string) => {
        if (!jsonStarted) {
          let text = chunk;
          for (const marker of ["```json", "```"]) {
            const idx = text.indexOf(marker);
            if (idx >= 0) {
              jsonStarted = true;
              text = text.substring(0, idx);
              break;
            }
          }
          if (text.trim()) sendEvent("chunk", text);
        }
      }
    );

    // 增强 items（TTS 合成 + 搜歌 ID/封面，播放链接走 /api/audio 懒加载）
    const voiceStyle = req.body.voice || "gentle_female";
    const enrichedItems = await enrichItems(plan.items, {
      musicService: getMusicService(),
      ttsService: {
        synthesize: (text: string, voice?: string) => callTTS(text, voice || voiceStyle),
      },
    });

    // 后台预缓存所有歌曲的播放链接，点播时秒出
    const songMids = enrichedItems
      .filter(i => i.type === "song" && i.songId)
      .map(i => i.songId!);
    if (songMids.length > 0) {
      preWarmUrls(songMids).catch(err => console.error("[dispatch] 预缓存失败:", err));
    }

    // 处理 memory
    if (plan.memory && plan.memory.length > 0) {
      getMemoryWriter().writeAll(plan.memory);
    }

    // 处理 schedule
    if (plan.schedule && plan.schedule.length > 0) {
      await getCalendarService().updateEvents(plan.schedule);
    }

    // 记录播放历史
    if (userId) {
      const db = getDb();
      for (const item of enrichedItems) {
        if (item.type === "song" && item.title) {
          db.prepare(`
            INSERT INTO plays (user_id, song_id, song_title, artist)
            VALUES (?, ?, ?, ?)
          `).run(userId, item.songId || "", item.title, item.artist);
        }
      }
    }

    // 发送完成事件
    sendEvent("done", JSON.stringify({
      type: "plan",
      summary: plan.summary,
      scene: plan.scene,
      items: enrichedItems,
    }));

    // 记录 AI 说了什么，下次对话时避免重复
    const allTtsTexts = plan.items
      .filter(i => i.type === "tts" && i.text)
      .map(i => i.text!)
      .join(" | ");
    setLastAiOpening(allTtsTexts);
  } catch (err: any) {
    console.error("[dispatch] LLM 处理失败:", err.message);
    sendEvent("done", JSON.stringify({
      type: "error",
      message: "AI 处理失败，请稍后重试",
    }));
  }

  res.end();
});
