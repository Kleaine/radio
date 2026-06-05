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
    SELECT song_title FROM plays
    WHERE user_id = ? AND skipped = 0
    ORDER BY played_at DESC LIMIT 10
  `).all(userId).map((r: any) => r.song_title);

  const recentSkips = db.prepare(`
    SELECT song_title FROM plays
    WHERE user_id = ? AND skipped = 1
    ORDER BY played_at DESC LIMIT 5
  `).all(userId).map((r: any) => r.song_title);

  const contextService = createContextService({
    weatherService,
    calendarService,
    memoryWriter,
    recentPlays,
    recentSkips,
  });

  const llmService = createLlmService({
    apiKey: process.env.DOUBAO_API_KEY || "",
    model: process.env.DOUBAO_MODEL || "doubao-lite-128k",
  });

  // 音乐服务
  const musicService = process.env.QQ_MUSIC_COOKIE
    ? new QQMusicService(process.env.QQ_MUSIC_COOKIE)
    : new MockMusicService();

  return { contextService, llmService, musicService, memoryWriter };
}

// ASR 模拟（真实场景需对接 ASR 服务）
async function performASR(audioBuffer: Buffer, mimeType: string): Promise<string> {
  // TODO: 对接分工3 ASR 服务
  // 当前返回 Mock 结果
  console.log(`[asr] 收到音频: ${mimeType}, 大小: ${audioBuffer.length} bytes`);
  return "帮我看看接下来的日程并放首歌。";
}

// TTS 调用
async function callTTS(text: string, voiceStyle: string): Promise<string> {
  const TTS_SERVICE_URL = process.env.TTS_SERVICE_URL || "http://127.0.0.1:8000";

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
