// index.ts — AI DJ 后端服务入口
// Express + TypeScript + SQLite

// 全局兜底：防止第三方包内部未处理异常导致进程崩溃
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

import dotenv from "dotenv";
import path from "path";

// 加载 .env（从 apps/server/ 目录）
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import express from "express";
import cors from "cors";
import { initDatabase } from "./db/init";
import { authRoutes } from "./routes/auth.routes";
import { feishuRoutes } from "./routes/feishu.routes";
import { scheduleRoutes } from "./routes/schedule.routes";
import { chatRoutes } from "./routes/chat.routes";
import { dispatchRoutes } from "./routes/dispatch.routes";
import { playerRoutes } from "./routes/player.routes";
import { audioRoutes } from "./routes/audio.routes";
import { errorHandler } from "./middleware/error-handler";
import { responseWrapper } from "./middleware/response-wrapper";
import { startScheduledTasks } from "./scheduler";

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// ── 中间件 ──

// CORS（允许前端跨域访问）
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// JSON 解析
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件（TTS 音频、音乐文件）
app.use("/static", express.static(path.resolve(__dirname, "../../tts/outputs")));
app.use("/static/music", express.static(path.resolve(__dirname, "../../../data/music")));
app.use(express.static(path.resolve(__dirname, "../../web")));

// 统一响应封装
app.use(responseWrapper);

// ── 路由 ──

app.use("/api", authRoutes);
app.use("/api/feishu", feishuRoutes);
app.use("/api", scheduleRoutes);
app.use("/api", chatRoutes);
app.use("/api", dispatchRoutes);
app.use("/api/player", playerRoutes);
app.use("/api", audioRoutes);

// 健康检查
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── 错误处理 ──
app.use(errorHandler);

// ── 启动 ──

async function main() {
  try {
    // 初始化数据库
    initDatabase();
    console.log("[db] 数据库初始化完成");

    // 启动定时任务
    startScheduledTasks();
    console.log("[scheduler] 定时任务已启动");

    // 启动服务器
    app.listen(PORT, () => {
      console.log(`[server] AI DJ 后端服务已启动: http://localhost:${PORT}`);
      console.log(`[server] 环境: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (err) {
    console.error("[server] 启动失败:", err);
    process.exit(1);
  }
}

main();
