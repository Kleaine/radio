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

  // 并行处理所有 items：TTS 合成 + 歌曲搜索同时进行
  const tasks = items.map(async (item, index) => {
    if (item.type === "tts") {
      let ttsAudioUrl = "";
      if (ttsService && item.text) {
        try {
          ttsAudioUrl = await ttsService.synthesize(item.text, item.voice);
        } catch (e: any) {
          console.error("[enrich] TTS 合成失败:", e.message);
        }
      }
      return {
        index,
        data: {
          type: "tts" as const,
          title: "",
          artist: "",
          coverUrl: "",
          audioUrl: ttsAudioUrl,
          text: item.text,
          ttsAudioUrl,
        },
      };
    }

    // song item
    const artist = item.artist ?? "";
    const title = item.title ?? "";
    // 搜索关键词始终包含歌手名，避免"沙滩"匹配到洛克王国之类的
    const query = item.query ?? `${artist} ${title}`.trim();
    try {
      // 多搜几首，排除 Live/现场版/有声书/播客/小说，优先取正式音乐
      const allSongs = await musicService.search(query, 8);
      const badPattern = /live|现场|演唱会|feat\.|remix|伴奏|纯音乐|cover|翻唱|有声|小说|广播剧|评书|脱口秀|相声|喜马拉雅|播客|podcast|电台|故事|童话|儿歌|胎教/i;
      // 优先匹配歌手+歌名都对的正式版
      // 括号统一化：QQ音乐有时用中文括号，LLM可能输出英文括号
      const normalize = (s: string) => s.replace(/[（(]/g, '(').replace(/[）)]/g, ')').toLowerCase();
      const normTitle = normalize(title);
      const artistLower = artist.toLowerCase();
      const exactMatch = allSongs.find(s => {
        const nt = normalize(s.title);
        return !badPattern.test(s.title) &&
          (nt.includes(normTitle) || normTitle.includes(nt)) &&
          (!artistLower || s.artist.toLowerCase().includes(artistLower) || artistLower.includes(s.artist.toLowerCase()));
      });
      // 歌手匹配但歌名不对的不要——搜"借过一下"不能返回"红颜"
      const titleMatch = allSongs.find(s => {
        const nt = normalize(s.title);
        return !badPattern.test(s.title) &&
          (nt.includes(normTitle) || normTitle.includes(nt));
      });
      const song = exactMatch ?? titleMatch ?? null;
      // 搜不到确切匹配就不强行匹配，保留原始搜索信息让用户知道没找到
      if (song) {
        // 播放链接懒加载：不在这里取 URL，点播放时走 /api/audio?mid=xxx 代理
        return {
          index,
          data: {
            type: "song" as const,
            songId: song.id,
            title: song.title,
            artist: song.artist,
            coverUrl: song.coverUrl,
            audioUrl: `/api/audio?mid=${encodeURIComponent(song.id)}`,
            reason: item.reason,
          },
        };
      }
    } catch (e: any) {
      console.error("[enrich] 歌曲搜索失败:", query, e.message);
    }

    // 搜索失败，保留原始信息
    return {
      index,
      data: {
        type: "song" as const,
        title: item.title ?? query,
        artist: item.artist ?? "",
        coverUrl: item.coverUrl ?? "",
        audioUrl: item.audioUrl ?? "",
        reason: item.reason,
      },
    };
  });

  const results = await Promise.all(tasks);

  // 按原始 index 排序，保证 items 顺序不变
  results.sort((a, b) => a.index - b.index);
  return results.map(r => r.data as EnrichedItem);
}
