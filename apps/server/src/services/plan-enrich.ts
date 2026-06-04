// plan-enrich.ts — 播报计划增强
// 把 AI 输出的抽象 PlanItem → 真实可播放的 EnrichedItem

import type { MusicService } from "../interface/music.service.interface";
import type { PlayableItem } from "./llm.service";

/** 增强后的播放项 */
export interface EnrichedItem {
  type: "song" | "tts";
  songId?: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  reason?: string;
  text?: string;       // tts 的 DJ 说话文本
  ttsAudioUrl?: string; // tts 合成后的音频 URL，由分工4 补全
}

export interface EnrichConfig {
  musicService: MusicService;
  /** 分工4 提供的 TTS 服务：输入 DJ 文本和音色，返回音频 URL */
  ttsService?: { synthesize: (text: string, voice?: string) => Promise<string> };
}

/** 把播报计划的 items 逐条增强为可播放项 */
export async function enrichItems(
  items: PlayableItem[],
  config: EnrichConfig
): Promise<EnrichedItem[]> {
  const { musicService, ttsService } = config;
  const enriched: EnrichedItem[] = [];

  for (const item of items) {
    if (item.type === "tts") {
      let ttsAudioUrl = "";
      if (ttsService && item.text) {
        try {
          ttsAudioUrl = await ttsService.synthesize(item.text, item.voice);
        } catch (e: any) {
          console.error("[enrich] TTS 合成失败:", e.message);
        }
      }
      enriched.push({
        type: "tts",
        title: "",
        artist: "",
        coverUrl: "",
        audioUrl: ttsAudioUrl,
        text: item.text,
        ttsAudioUrl,
      });
      continue;
    }

    // song item
    const query = item.query ?? `${item.title ?? ""} ${item.artist ?? ""}`.trim();
    try {
      const songs = await musicService.search(query, 1);
      if (songs.length > 0) {
        const song = songs[0];
        const songUrl = await musicService.getSongUrl(song.id);
        enriched.push({
          type: "song",
          songId: song.id,
          title: song.title,
          artist: song.artist,
          coverUrl: song.coverUrl,
          audioUrl: songUrl.url ?? "",
          reason: item.reason,
        });
        continue;
      }
    } catch (e: any) {
      console.error("[enrich] 歌曲搜索失败:", query, e.message);
    }

    // 搜索失败，保留原始信息
    enriched.push({
      type: "song",
      title: item.title ?? query,
      artist: item.artist ?? "",
      coverUrl: item.coverUrl ?? "",
      audioUrl: item.audioUrl ?? "",
      reason: item.reason,
    });
  }

  return enriched;
}
