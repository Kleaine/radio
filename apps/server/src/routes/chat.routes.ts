// routes/chat.routes.ts — 语音智能多模态核心交互接口
// ASR → 上下文组装 → LLM → TTS → 返回控制数据链

import { Router, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { getDb } from "../db/init";

// 引入已有 services
import { createLlmService } from "../services/llm.service";
import { createContextService } from "../services/context.service";
import { createWeatherService } from "../services/weather.service";
import { createCalendarService } from "../services/calendar.service";
import { createMemoryWriter } from "../services/memory-writer";
import { MockMusicService, QQMusicService } from "../services/music.service";
import { enrichItems } from "../services/plan-enrich";

export const chatRoutes = Router();

// 文件上传配置（内存存储，处理完即释放）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/wav", "audio/mp3", "audio/mpeg", "audio/ogg", "audio/webm"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("不支持的音频格式"));
    }
  },
});

// 初始化 services
function initServices(userId: number) {
  const weatherService = createWeatherService({
    openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
    city: process.env.CITY || "Beijing",
  });

  const calendarService = createCalendarService();
  const memoryWriter = createMemoryWriter();

  // 获取最近播放记录
  const db = getDb();
  const recentPlays = db.prepare(`
    SELECT song_title, artist FROM plays
    WHERE user_id = ? AND skipped = 0
    ORDER BY played_at DESC LIMIT 10
  `).all(userId).map((r: any) => ({ title: r.song_title, artist: r.artist }));

  const recentSkips = db.prepare(`
    SELECT song_title FROM plays
    WHERE user_id = ? AND skipped = 1
    ORDER BY played_at DESC LIMIT 5
  `).all(userId).map((r: any) => r.song_title);

  const topArtists = db.prepare(`
    SELECT artist, COUNT(*) as cnt FROM plays
    WHERE user_id = ? AND skipped = 0 AND artist != ''
    GROUP BY artist ORDER BY cnt DESC LIMIT 10
  `).all(userId).map((r: any) => r.artist);

  // AI 记忆从文件读取
  const aiMemoryPath = path.resolve(__dirname, "..", "..", "..", "..", "user", "last_ai_message.txt");
  let lastAiOpening = "";
  try { lastAiOpening = fs.readFileSync(aiMemoryPath, "utf-8").trim(); } catch {}

  const contextService = createContextService({
    weatherService,
    calendarService,
    memoryWriter,
    recentPlays,
    recentSkips,
    topArtists,
    lastAiOpening,
  });

  const llmService = createLlmService({
    apiKey: process.env.DOUBAO_API_KEY || "",
    model: process.env.DOUBAO_MODEL || "doubao-lite-128k",
  });

  // 音乐服务
  const musicService = new QQMusicService(process.env.QQ_MUSIC_COOKIE || "");

  return { contextService, llmService, musicService, memoryWriter };
}

// ASR 语音识别 — 调用分工3 封装的 Whisper+标点服务
async function performASR(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const ASR_URL = process.env.ASR_SERVICE_URL || "http://localhost:5000";
  console.log(`[asr] 收到音频: ${mimeType}, 大小: ${audioBuffer.length} bytes, 调用 ${ASR_URL}/recognize/file`);

  if (audioBuffer.length < 1024) {
    console.warn(`[asr] 音频文件过小 (${audioBuffer.length} bytes)，可能录音失败`);
    return "（未能识别出语音内容，请试着重新说一次）";
  }

  try {
    // —— 用 Node.js 内置 fetch + FormData 上传 multipart/form-data ——
    //    替代之前的 form-data + http.request，更简洁可靠
    const formData = new FormData();
    const ext = mimeType.includes("wav") ? "wav" : "webm";
    formData.append(
      "file",
      new Blob([audioBuffer], { type: mimeType || "audio/wav" }),
      `voice_${Date.now()}.${ext}`
    );

    const response = await fetch(`${ASR_URL}/recognize/file`, {
      method: "POST",
      body: formData as any, // Node.js fetch 的 FormData 和浏览器兼容
    });

    if (!response.ok) {
      throw new Error(`ASR HTTP ${response.status}: ${await response.text().then(t => t.slice(0, 200))}`);
    }

    const asrResult = await response.json();
    console.log(`[asr] ASR 服务响应: status=${asrResult.status}, text="${asrResult.text || ''}", audio_duration=${asrResult.audio_duration || 'N/A'}`);
    console.log(`[asr] results.google:`, JSON.stringify(asrResult.results?.google).slice(0, 200));

    // —— 关键修复：优先用 results.google.text（Google 识别 + 独立标点后处理）
    //    而不是顶层 text 或 results.whisper.text（Whisper 自带标点会出问题）
    if (asrResult?.results?.google?.status === 'success' && asrResult.results.google.text?.trim()) {
        console.log(`[asr] 使用 Google 识别结果: "${asrResult.results.google.text.trim()}"`);
        return asrResult.results.google.text.trim();
    }

    // fallback：顶层 text 字段
    if (asrResult?.status === 'ok' && asrResult.text?.trim()) {
        console.log(`[asr] fallback: 顶层 text: "${asrResult.text.trim()}"`);
        return asrResult.text.trim();
    }

    // fallback：whisper 结果
    if (asrResult?.results?.whisper?.text?.trim()) {
        console.log(`[asr] fallback whisper: "${asrResult.results.whisper.text.trim()}"`);
        return asrResult.results.whisper.text.trim();
    }

    console.warn(`[asr] 未能识别出文字:`, JSON.stringify(asrResult).slice(0, 300));
    return "（未能识别出语音内容，请试着重新说一次）";
  } catch (err: any) {
    console.error(`[asr] 调用失败:`, err?.message || err);
    return "（语音识别服务未就绪，请稍后再试，或直接在下方输入框打字）";
  }
}

// TTS 调用
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

    // 保存音频文件
    const audioBuffer = Buffer.from(await response.arrayBuffer());
    const filename = `intro_${uuidv4().slice(0, 8)}.wav`;
    const outputPath = path.resolve(__dirname, "../../../tts/outputs", filename);

    // 确保目录存在
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

// ── POST /api/asr ── 仅做语音识别，返回识别文本，让用户确认后再发送
chatRoutes.post("/asr", authMiddleware, upload.single("audio"), async (req: AuthRequest, res: Response) => {
  if (!req.file) {
    res.fail(400, "缺少音频文件");
    return;
  }

  try {
    const userText = await performASR(req.file.buffer, req.file.mimetype);
    res.success({ text: userText });
  } catch (err: any) {
    console.error("[asr] 识别失败:", err.message);
    res.fail(500, "语音识别失败，请稍后重试");
  }
});

// ── POST /api/chat ──
chatRoutes.post("/chat", authMiddleware, upload.single("audio"), async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const voiceStyle = req.body.voice_style || "gentle_female";

  // 校验声线参数
  const validVoices = ["gentle_female", "lively_female", "announcer_male"];
  if (!validVoices.includes(voiceStyle)) {
    res.fail(400, `无效的声线参数，可选值: ${validVoices.join(", ")}`);
    return;
  }

  if (!req.file) {
    res.fail(400, "缺少音频文件");
    return;
  }

  try {
    // 1. ASR 语音识别
    const userText = await performASR(req.file.buffer, req.file.mimetype);

    // 2. 初始化服务
    const { contextService, llmService, musicService, memoryWriter } = initServices(userId);

    // 3. 组装上下文
    const context = await contextService.build(userText);

    // 4. 调用 LLM 生成播报计划
    const plan = await llmService.generatePlan("manual", userText, context);

    // 5. 增强 items（补全歌曲信息）
    const enrichedItems = await enrichItems(plan.items, { musicService });

    // 6. TTS 合成（为第一个 tts 项生成音频）
    let audioUrl = "";
    const firstTtsItem = enrichedItems.find(item => item.type === "tts" && item.text);
    if (firstTtsItem) {
      audioUrl = await callTTS(firstTtsItem.text!, voiceStyle);
    }

    // 7. 推荐歌曲信息
    const firstSong = enrichedItems.find(item => item.type === "song");
    const recommendSong = firstSong ? {
      title: firstSong.title,
      artist: firstSong.artist,
      reason: firstSong.reason || "",
      songUrl: firstSong.audioUrl || "",
    } : null;

    // 8. 记录播放历史
    if (firstSong) {
      const db = getDb();
      db.prepare(`
        INSERT INTO plays (user_id, song_id, song_title, artist)
        VALUES (?, ?, ?, ?)
      `).run(userId, firstSong.songId || "", firstSong.title, firstSong.artist);
    }

    // 9. 处理 memory（用户偏好记忆）
    if (plan.memory && plan.memory.length > 0) {
      memoryWriter.writeAll(plan.memory);
    }

    // 10. 返回控制数据链
    res.success({
      userText,
      replyText: plan.summary || "好的，为你准备了音乐。",
      audioUrl,
      recommendSong,
    });
  } catch (err: any) {
    console.error("[chat] 处理失败:", err.message);
    res.fail(500, "语音处理失败，请稍后重试");
  }
});
