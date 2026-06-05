// routes/schedule.routes.ts — 日程拉取路由
// 从飞书同步今日日程

import { Router, Response } from "express";
import { AuthRequest, authMiddleware } from "../middleware/auth";
import { getDb } from "../db/init";
import { createCalendarService } from "../services/calendar.service";

export const scheduleRoutes = Router();

// ── GET /api/schedule ──
scheduleRoutes.get("/schedule", authMiddleware, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  // 检查是否绑定飞书
  const db = getDb();
  const binding = db.prepare("SELECT * FROM feishu_bindings WHERE user_id = ?").get(userId) as any;

  if (!binding) {
    res.fail(401, "检测到您的本地账户未绑定飞书账号凭证，拒绝同步日历");
    return;
  }

  // Mock 模式：读取本地 schedule.txt
  if (!process.env.FEISHU_APP_ID || binding.feishu_access_token === "mock_access_token") {
    const calendarService = createCalendarService();
    const events = await calendarService.getTodayEvents();

    const schedule = events.map(e => ({
      time: e.start || "全天",
      content: `[本地日程] ${e.title}`,
      active: isEventActive(e.start, e.end),
    }));

    res.success(schedule);
    return;
  }

  // 真实模式：从飞书 API 拉取日程
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const calendarRes = await fetch(
      `https://open.feishu.cn/open-apis/calendar/v4/calendars/primary/events?start_time=${Math.floor(startOfDay / 1000)}&end_time=${Math.floor(endOfDay / 1000)}`,
      {
        headers: {
          Authorization: `Bearer ${binding.feishu_access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    const calendarData = await calendarRes.json() as any;
    const items = calendarData?.data?.items ?? [];

    const schedule = items.map((item: any) => {
      const start = new Date(item.start_time?.timestamp * 1000);
      const end = new Date(item.end_time?.timestamp * 1000);
      return {
        time: start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }),
        content: `[飞书同步] ${item.summary || "未命名事件"}`,
        active: isEventActive(
          start.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" }),
          end.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Shanghai" })
        ),
      };
    });

    res.success(schedule);
  } catch (err: any) {
    console.error("[schedule] 飞书日程拉取失败:", err.message);

    // 降级到本地日程
    const calendarService = createCalendarService();
    const events = await calendarService.getTodayEvents();
    const schedule = events.map(e => ({
      time: e.start || "全天",
      content: `[本地日程] ${e.title}`,
      active: isEventActive(e.start, e.end),
    }));

    res.success(schedule);
  }
});

// 判断事件是否正在进行
function isEventActive(start: string, end: string): boolean {
  if (!start) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startHour, startMin] = start.split(":").map(Number);
  const startMinutes = startHour * 60 + startMin;

  if (!end) {
    // 只有开始时间，假设持续 1 小时
    return currentMinutes >= startMinutes && currentMinutes < startMinutes + 60;
  }

  const [endHour, endMin] = end.split(":").map(Number);
  const endMinutes = endHour * 60 + endMin;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
