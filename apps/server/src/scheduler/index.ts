// scheduler/index.ts — 定时任务调度器
// 早安电台 + 日程定时拉取

import fs from "fs";
import path from "path";
import cron from "node-cron";
import { createLlmService } from "../services/llm.service";
import { createContextService } from "../services/context.service";
import { createWeatherService } from "../services/weather.service";
import { createCalendarService } from "../services/calendar.service";
import { createMemoryWriter } from "../services/memory-writer";

// 早安电台任务
async function morningRadioTask() {
  console.log("[scheduler] 执行早安电台任务...");

  try {
    const weatherService = createWeatherService({
      openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
      city: process.env.CITY || "Beijing",
    });

    const calendarService = createCalendarService();
    const memoryWriter = createMemoryWriter();

    const contextService = createContextService({
      weatherService,
      calendarService,
      memoryWriter,
    });

    const llmService = createLlmService({
      apiKey: process.env.DOUBAO_API_KEY || "",
      model: process.env.DOUBAO_MODEL || "doubao-lite-128k",
    });

    // 组装上下文
    const context = await contextService.build("早安，今天也要元气满满哦！");

    // 生成播报计划
    const plan = await llmService.generatePlan("scheduled", "早安电台", context);

    console.log("[scheduler] 早安电台播报计划已生成:", plan.summary);
    console.log("[scheduler] 包含", plan.items.length, "个播放项");

    // TODO: 推送给前端（WebSocket/SSE）
    // 当前仅打印日志
  } catch (err: any) {
    console.error("[scheduler] 早安电台任务失败:", err.message);
  }
}

// 日程定时拉取任务
async function calendarSyncTask() {
  console.log("[scheduler] 执行日程同步任务...");

  try {
    const calendarService = createCalendarService();
    const events = await calendarService.getTodayEvents();

    console.log("[scheduler] 今日日程:", events.length, "条");
    events.forEach(e => {
      const time = e.start ? `${e.start}${e.end ? `-${e.end}` : ""}` : "全天";
      console.log(`  - ${time} ${e.title}`);
    });
  } catch (err: any) {
    console.error("[scheduler] 日程同步任务失败:", err.message);
  }
}

// 天气缓存预热任务
async function weatherWarmupTask() {
  console.log("[scheduler] 执行天气缓存预热...");

  try {
    const weatherService = createWeatherService({
      openWeatherApiKey: process.env.OPENWEATHER_API_KEY,
      city: process.env.CITY || "Beijing",
    });

    const weather = await weatherService.getCurrent();
    console.log("[scheduler] 天气预热完成:", `${weather.city} ${weather.temp}°C ${weather.description}`);
  } catch (err: any) {
    console.error("[scheduler] 天气预热失败:", err.message);
  }
}

// 启动所有定时任务
export function startScheduledTasks(): void {
  // 每天早上 7:00 执行早安电台
  cron.schedule("0 7 * * *", morningRadioTask, {
    timezone: "Asia/Shanghai",
  });
  console.log("[scheduler] 早安电台任务已注册 (每天 07:00)");

  // 每小时同步一次日程
  cron.schedule("0 * * * *", calendarSyncTask, {
    timezone: "Asia/Shanghai",
  });
  console.log("[scheduler] 日程同步任务已注册 (每小时)");

  // 每 30 分钟预热天气缓存
  cron.schedule("*/30 * * * *", weatherWarmupTask, {
    timezone: "Asia/Shanghai",
  });
  console.log("[scheduler] 天气预热任务已注册 (每 30 分钟)");

  // 启动时立即执行一次天气预热
  weatherWarmupTask();

  // 每小时清理超过 24 小时的 TTS 文件
  cron.schedule("0 * * * *", () => {
    const dir = path.resolve(__dirname, "..", "..", "..", "tts", "outputs");
    if (!fs.existsSync(dir)) return;
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    fs.readdirSync(dir).forEach(f => {
      const fp = path.join(dir, f);
      try {
        if (now - fs.statSync(fp).mtimeMs > DAY) fs.unlinkSync(fp);
      } catch {}
    });
  });
  console.log("[scheduler] TTS 文件清理任务已注册 (每小时，超过24h删除)");

  console.log("[scheduler] 所有定时任务已启动");
}
