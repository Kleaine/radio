// context.service.ts — 上下文组装
// 把时间、天气、日程、播放历史、用户画像拼成文本，注入 LLM prompt

import type { WeatherService, WeatherData } from "./weather.service";
import type { CalendarService, CalendarEvent } from "./calendar.service";
import type { MemoryWriter } from "./memory-writer";
import { getProfileSummary } from "./profile.service";

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
  /** AI 上一次说的所有串词文本，避免重复 */
  lastAiOpening?: string;
}

export interface ContextService {
  build(input?: string, scene?: string): Promise<string>;
}

export function createContextService(config: ContextConfig): ContextService {
  const { weatherService, calendarService, memoryWriter } = config;

  async function getWeatherText(): Promise<string> {
    try {
      const w: WeatherData = await weatherService.getCurrent();
      return `${w.description}（不要报温度数字）`;
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

      // 口味画像：profile.json（长期累积）+ 数据库 Top 歌手（兜底）
      const profile = getProfileSummary();
      if (profile) {
        parts.push(profile);
      } else if (config.topArtists?.length) {
        parts.push(`常听歌手：${config.topArtists.slice(0, 10).join("、")}`);
      }
      parts.push("推荐策略：70%基于口味推荐，30%推荐没听过但风格相近的好歌");

      // AI 上一次的回复——避免重复
      if (config.lastAiOpening) {
        parts.push(`你上一次说过的内容（别重复）：${config.lastAiOpening.slice(0, 200)}`);
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
