// context.service.ts — 上下文组装
// 把时间、天气、日程、播放历史、用户画像拼成文本，注入 LLM prompt

import type { WeatherService, WeatherData } from "./weather.service";
import type { CalendarService, CalendarEvent } from "./calendar.service";
import type { MemoryWriter } from "./memory-writer";

export interface ContextConfig {
  weatherService: WeatherService;
  calendarService: CalendarService;
  memoryWriter: MemoryWriter;
  /** 最近播放记录（歌名+歌手），由后端 DB 提供 */
  recentPlays?: Array<{ title: string; artist: string }>;
  /** 最近跳过的歌 */
  recentSkips?: string[];
  /** 常听歌手 Top 10 */
  topArtists?: string[];
  /** AI 最近的回复摘要，避免重复 */
  aiMemory?: string[];
}

export interface ContextService {
  build(input?: string, scene?: string): Promise<string>;
}

export function createContextService(config: ContextConfig): ContextService {
  const { weatherService, calendarService, memoryWriter } = config;

  async function getWeatherText(): Promise<string> {
    try {
      const w: WeatherData = await weatherService.getCurrent();
      return `${w.description}，约${w.temp}度（仅供参考，不需要每次都提天气）`;
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
      const profiles = memoryWriter.readAll();
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

      const hour = now.getHours();
      const timeHint = hour < 6 ? "凌晨" : hour < 9 ? "早晨" : hour < 12 ? "上午" : hour < 14 ? "中午" : hour < 18 ? "下午" : hour < 22 ? "晚上" : "深夜";

      const parts: string[] = [];
      parts.push(`当前时间：${timeStr}（${timeHint}）`);

      // 天气
      const weather = await getWeatherText();
      if (weather) parts.push(`天气：${weather}`);

      // 日程
      const calendar = await getCalendarText();
      if (calendar) parts.push(`今日日程：${calendar}`);

      // 常听歌手（口味画像）
      if (config.topArtists?.length) {
        parts.push(`用户常听歌手：${config.topArtists.join("、")}`);
      }

      // AI 最近的回复——避免重复话题
      if (config.aiMemory?.length) {
        parts.push(`你最近几次的回复摘要（不要重复这些内容）：${config.aiMemory.join("；")}`);
      }

      // 最近播放——避免重复推荐
      if (config.recentPlays?.length) {
        const playlist = config.recentPlays.map(p => `${p.title}(${p.artist})`).join("、");
        parts.push(`最近 25 首已听过（不要再推荐这些歌）：${playlist}`);
      }
      if (config.recentSkips?.length) {
        parts.push(`最近跳过（不要再推）：${config.recentSkips.join("、")}`);
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
