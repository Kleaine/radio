// calendar.service.ts — 日程服务
// 读 data/schedule.txt，支持 LLM 聊天更新日程

import fs from "fs";
import path from "path";

const SCHEDULE_PATH = path.resolve(process.cwd(), "data", "schedule.txt");

export interface CalendarEvent {
  start: string;  // "HH:MM"
  end: string;    // "HH:MM"，全天事件则为空
  title: string;
}

export interface CalendarService {
  getTodayEvents(): Promise<CalendarEvent[]>;
  updateEvents(events: CalendarEvent[]): Promise<void>;
}

/** 解析 schedule.txt，格式宽容 */
function parseSchedule(text: string): CalendarEvent[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const [time, ...rest] = line.split(/\s+/);
      const title = rest.join(" ");
      if (time?.includes("-")) {
        const [start, end] = time.split("-");
        return { start, end, title };
      }
      // 没有时间范围，只有开始时间
      if (time?.includes(":")) {
        return { start: time, end: "", title };
      }
      // 全天事件
      return { start: "", end: "", title: `${time} ${title}`.trim() };
    });
}

/** 将事件数组格式化为 txt */
function formatEvents(events: CalendarEvent[]): string {
  return events
    .map(e => {
      if (e.start && e.end) return `${e.start}-${e.end} ${e.title}`;
      if (e.start) return `${e.start} ${e.title}`;
      return e.title;
    })
    .join("\n") + "\n";
}

const calendarService: CalendarService = {
  async getTodayEvents(): Promise<CalendarEvent[]> {
    try {
      const text = fs.readFileSync(SCHEDULE_PATH, "utf-8");
      return parseSchedule(text);
    } catch {
      return [];
    }
  },

  async updateEvents(events: CalendarEvent[]): Promise<void> {
    const dir = path.dirname(SCHEDULE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(SCHEDULE_PATH, formatEvents(events), "utf-8");
  },
};

export default calendarService;
