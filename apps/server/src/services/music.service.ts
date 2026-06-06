// music.service.ts — QQ音乐服务（Mock + 真实 双实现）
// 2024/2025 最新接口：u.y.qq.com/cgi-bin/musicu.fcg

import type { MusicService, Song, SongUrlResult, LyricResult } from "../interface/music.service.interface";

// ── Mock 实现 ──

export class MockMusicService implements MusicService {
  private mockArtists = ["周杰伦", "林俊杰", "陈奕迅", "邓紫棋", "陈绮贞", "陶喆", "方大同", "孙燕姿", "五月天", "蔡健雅"];

  async search(keyword: string, limit = 10): Promise<Song[]> {
    return Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `mock_${i}`,
      title: `${keyword} - 歌曲${i + 1}`,
      artist: this.mockArtists[i % this.mockArtists.length],
      album: `Mock 专辑${i + 1}`,
      coverUrl: "",
      durationMs: 200000 + i * 30000,
    }));
  }

  async getSongUrl(_songId: string): Promise<SongUrlResult> {
    return { url: "/static/music/demo.wav", br: 128 };
  }

  async getLyric(_songId: string): Promise<LyricResult> {
    return { lrc: "[00:00.00]暂无歌词" };
  }
}

// ── 真实实现：QQ 音乐最新接口 ──

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// 通用请求头
const BASE_HEADERS = {
  "User-Agent": UA,
  "Referer": "https://y.qq.com/",
  "Origin": "https://y.qq.com",
  "Accept": "application/json",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

// 公共参数
const COMM_PARAMS = {
  ct: 24,
  cv: 0,
  qq: "",
  authst: "",
  format: "json",
  inCharset: "utf-8",
  outCharset: "utf-8",
};

// 音质映射
const QUALITY_MAP: Record<string, { prefix: string; br: number }> = {
  "0": { prefix: "M500", br: 128 },   // 标准
  "1": { prefix: "M800", br: 320 },   // 高品质
  "2": { prefix: "F000", br: 1000 },  // 无损 FLAC
};

export class QQMusicService implements MusicService {
  private quality: string;

  constructor(
    private cookie: string,
    quality: string = "1"  // 默认高品质 320kbps
  ) {
    this.quality = quality;
  }

  private get headers(): Record<string, string> {
    return {
      ...BASE_HEADERS,
      "Cookie": this.cookie || "uin=0",
    };
  }

  // 通用请求方法
  private async request(module: string, method: string, param: any): Promise<any> {
    const body = JSON.stringify({
      comm: COMM_PARAMS,
      req_0: { module, method, param },
    });

    const res = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data: any = await res.json();
    return data?.req_0?.data;
  }

  // ── 搜索歌曲 ──
  async search(keyword: string, limit = 10): Promise<Song[]> {
    try {
      const data = await this.request(
        "music.search.SearchCgiService",
        "DoSearchForQQMusicDesktop",
        {
          num_per_page: limit,
          page_num: 1,
          query: keyword,
          search_type: 0,  // 0=单曲
        }
      );

      const list = data?.body?.song?.list ?? [];

      return list.map((raw: any) => ({
        id: raw.mid ?? raw.songmid ?? "",
        title: raw.name ?? raw.songname ?? "",
        artist: (raw.singer ?? []).map((s: any) => s.name).join(", "),
        album: raw.album?.name ?? raw.albumname ?? "",
        coverUrl: raw.album?.mid
          ? `https://y.qq.com/music/photo_new/T002R300x300M000${raw.album.mid}.jpg`
          : "",
        durationMs: (raw.interval ?? 0) * 1000,
      }));
    } catch (e: any) {
      console.error("[music] search failed:", e.message);
      return [];
    }
  }

  // ── 获取歌曲播放 URL ──
  async getSongUrl(songId: string): Promise<SongUrlResult> {
    try {
      const qualityInfo = QUALITY_MAP[this.quality] || QUALITY_MAP["1"];
      const filename = `${qualityInfo.prefix}${songId}.m4a`;

      const data = await this.request(
        "music.vkey.GetVkey",
        "CgiGetVkey",
        {
          guid: "10000",
          songmid: [songId],
          songtype: [0],
          uin: "0",
          platform: "20",
          filename: [filename],
        }
      );

      const midInfo = data?.midurlinfo?.[0];
      const sip = data?.sip ?? [];

      // 检查是否有有效的播放链接
      if (midInfo?.purl && midInfo.purl !== "") {
        const url = `${sip[0] ?? "https://ws.stream.qqmusic.qq.com"}${midInfo.purl}`;
        return { url, br: qualityInfo.br };
      }

      // VIP 歌曲或无权限，降级到标准音质
      if (this.quality !== "0") {
        console.warn("[music] 高品质不可用，降级到标准音质");
        return this.getSongUrlWithQuality(songId, "0");
      }

      return { url: "/static/music/demo.wav", br: 128 };
    } catch (e: any) {
      console.error("[music] getSongUrl failed:", e.message);
      return { url: "/static/music/demo.wav", br: 128 };
    }
  }

  // 降级获取指定音质
  private async getSongUrlWithQuality(songId: string, quality: string): Promise<SongUrlResult> {
    try {
      const qualityInfo = QUALITY_MAP[quality];
      const filename = `${qualityInfo.prefix}${songId}.m4a`;

      const data = await this.request(
        "music.vkey.GetVkey",
        "CgiGetVkey",
        {
          guid: "10000",
          songmid: [songId],
          songtype: [0],
          uin: "0",
          platform: "20",
          filename: [filename],
        }
      );

      const midInfo = data?.midurlinfo?.[0];
      const sip = data?.sip ?? [];

      if (midInfo?.purl && midInfo.purl !== "") {
        return {
          url: `${sip[0] ?? "https://ws.stream.qqmusic.qq.com"}${midInfo.purl}`,
          br: qualityInfo.br,
        };
      }

      return { url: "/static/music/demo.wav", br: 128 };
    } catch {
      return { url: "/static/music/demo.wav", br: 128 };
    }
  }

  // ── 获取歌词 ──
  async getLyric(songId: string): Promise<LyricResult> {
    try {
      const data = await this.request(
        "music.musichallSong.PlayLyricInfo",
        "GetPlayLyricInfo",
        {
          songmid: songId,
          songtype: 0,
          trans: 1,     // 获取翻译歌词
          roma: 1,      // 获取罗马音
        }
      );

      return {
        lrc: data?.lyric ? this.decodeBase64(data.lyric) : "[00:00.00]暂无歌词",
        tlyric: data?.trans ? this.decodeBase64(data.trans) : undefined,
        yrc: data?.roma ? this.decodeBase64(data.roma) : undefined,
      };
    } catch (e: any) {
      console.error("[music] getLyric failed:", e.message);
      return { lrc: "[00:00.00]暂无歌词" };
    }
  }

  // Base64 解码（QQ音乐歌词是 Base64 编码的）
  private decodeBase64(str: string): string {
    try {
      return Buffer.from(str, "base64").toString("utf-8");
    } catch {
      return str;
    }
  }
}
