// context.service.ts — 上下文组装
// 把时间、天气、日程、播放历史、用户画像拼成文本，注入 LLM prompt

import type { WeatherService, WeatherData } from "./weather.service";
import type { CalendarService, CalendarEvent } from "./calendar.service";
import { readAllProfiles } from "./memory-writer";

export interface ContextConfig {
  weatherService: WeatherService;
  calendarService: CalendarService;
  /** 最近播放记录，由后端 DB 提供 */
  recentPlays?: string[];
  /** 最近跳过的歌 */
  recentSkips?: string[];
}

export interface ContextService {
  build(input?: string, scene?: string): Promise<string>;
}

export function createContextService(config: ContextConfig): ContextService {
  const { weatherService, calendarService } = config;

  async function getWeatherText(): Promise<string> {
    try {
      const w: WeatherData = await weatherService.getCurrent();
      return `${w.city} ${w.temp}°C ${w.description}`;
    } catch {
      return "";
    }
  }

  async function getCalendarText(): Promise<string> {
    try {
      const events: CalendarEvent[] = await calendarService.getTodayEvents();
      if (events.length === 0) return "";
      const lines = events.map(e => {
        if (e.start && e.end) return `${e.start}-${e.end} ${e.title}`;
        if (e.start) return `${e.start} ${e.title}`;
        return e.title;
      });
      return lines.join("，");
    } catch {
      return "";
    }
  }

  async function getProfileText(): Promise<string> {
    try {
      const profiles = readAllProfiles();
      const parts: string[] = [];
      if (profiles.taste?.trim()) {
        parts.push(`用户音乐偏好：${profiles.taste.trim().replace(/\n- /g, "、").replace(/^- /, "")}`);
      }
      if (profiles.routines?.trim()) {
        parts.push(`用户作息习惯：${profiles.routines.trim().replace(/\n- /g, "、").replace(/^- /, "")}`);
      }
      if (profiles.moodrules?.trim()) {
        parts.push(`用户情绪规则：${profiles.moodrules.trim().replace(/\n- /g, "、").replace(/^- /, "")}`);
      }
      return parts.join("\n");
    } catch {
      return "";
    }
  }

  return {
    async build(input?: string, scene?: string): Promise<string> {
      const now = new Date();
      const timeStr = now.toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        hour12: false,
      });

      const parts: string[] = [];
      parts.push(`当前时间：${timeStr}`);

      // 天气
      const weather = await getWeatherText();
      if (weather) parts.push(`天气：${weather}`);

      // 日程
      const calendar = await getCalendarText();
      if (calendar) parts.push(`今日日程：${calendar}`);

      // 播放历史
      if (config.recentPlays?.length) {
        parts.push(`最近播放：${config.recentPlays.slice(0, 10).join("、")}`);
      }
      if (config.recentSkips?.length) {
        parts.push(`最近跳过：${config.recentSkips.slice(0, 5).join("、")}`);
      }

      // 用户画像
      const profile = await getProfileText();
      if (profile) parts.push(profile);

      // 当前场景
      if (scene) parts.push(`当前场景：${scene}`);

      // 用户输入
      if (input) parts.push(`用户说：${input}`);

      return parts.join("\n");
    },
  };
}
