// music.service.ts — QQ音乐服务（Mock + 真实 双实现）

import type { MusicService, Song, SongUrlResult, LyricResult } from "../interface/music.service.interface";

// ── Mock 实现 ──

export class MockMusicService implements MusicService {
  async search(keyword: string, limit = 10): Promise<Song[]> {
    const results: Song[] = [];
    const count = Math.min(limit, 5);
    const mockArtists = ["周杰伦", "林俊杰", "陈奕迅", "邓紫棋", "陈绮贞"];
    for (let i = 0; i < count; i++) {
      results.push({
        id: `mock_${i}`,
        title: `${keyword} - 歌曲${i + 1}`,
        artist: mockArtists[i % mockArtists.length],
        album: `Mock 专辑${i + 1}`,
        coverUrl: "",
        durationMs: 200000 + i * 30000,
      });
    }
    return results;
  }

  async getSongUrl(_songId: string): Promise<SongUrlResult> {
    return { url: null, br: 128 };
  }

  async getLyric(_songId: string): Promise<LyricResult> {
    return { lrc: "[00:00.00]暂无歌词" };
  }
}

// ── 真实实现：QQ 音乐 npm 包 ──

export class QQMusicService implements MusicService {
  private qqMusic: any = null;
  private ready = false;

  constructor(private cookie: string) {}

  private async ensureReady() {
    if (this.ready) return;
    try {
      const mod = await import("qq-music-api");
      this.qqMusic = mod.default ?? mod;
      if (this.cookie) {
        this.qqMusic.setCookie(this.cookie);
      }
      this.ready = true;
    } catch (e: any) {
      console.warn("[music] qq-music-api 未安装，使用 Mock 模式。npm install qq-music-api");
      throw e;
    }
  }

  async search(keyword: string, limit = 10): Promise<Song[]> {
    try {
      await this.ensureReady();
      const data = await this.qqMusic.api("search", {
        key: keyword,
        pageNo: 1,
        pageSize: limit,
        t: 0, // 单曲
      });
      const list = data?.list ?? data?.data?.list ?? data?.result?.list ?? [];
      return list.map((raw: any) => ({
        id: raw.songmid ?? raw.id ?? String(raw.songid ?? ""),
        title: raw.songname ?? raw.name ?? raw.title ?? "",
        artist: raw.singer?.map?.((s: any) => s.name).join(", ") ?? raw.artist ?? "",
        album: raw.albumname ?? raw.album ?? "",
        coverUrl: raw.cover ?? raw.picUrl ?? raw.albummid
          ? `https://y.qq.com/music/photo_new/T002R300x300M000${raw.albummid}.jpg`
          : "",
        durationMs: (raw.interval ?? raw.duration ?? 0) * 1000,
      }));
    } catch (e: any) {
      console.error("[music] search failed:", e.message);
      return [];
    }
  }

  async getSongUrl(songId: string): Promise<SongUrlResult> {
    try {
      await this.ensureReady();
      const data = await this.qqMusic.api("song/url", { id: songId });
      const url = data?.data?.[songId] ?? data?.url ?? data?.data?.url ?? null;
      return { url, br: 320 };
    } catch (e: any) {
      console.error("[music] getSongUrl failed:", e.message);
      return { url: null, br: 128 };
    }
  }

  async getLyric(songId: string): Promise<LyricResult> {
    try {
      await this.ensureReady();
      const data = await this.qqMusic.api("lyric", { songmid: songId });
      return {
        lrc: data?.lyric ?? data?.lrc?.lyric ?? "[00:00.00]暂无歌词",
        tlyric: data?.tlyric?.lyric,
        yrc: data?.yrc?.lyric,
      };
    } catch (e: any) {
      console.error("[music] getLyric failed:", e.message);
      return { lrc: "[00:00.00]暂无歌词" };
    }
  }
}
