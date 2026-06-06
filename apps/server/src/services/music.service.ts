// music.service.ts — QQ音乐服务（Mock + 真实 双实现）

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

// ── 真实实现：直接调 QQ 音乐 u.y.qq.com 新接口 ──

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

export class QQMusicService implements MusicService {
  constructor(private cookie: string) {}

  private get headers(): Record<string, string> {
    return {
      "User-Agent": UA,
      "Referer": "https://y.qq.com",
      "Cookie": this.cookie || "uin=0",
    };
  }

  async search(keyword: string, limit = 10): Promise<Song[]> {
    try {
      const body = JSON.stringify({
        req_0: {
          module: "music.search.SearchCgiService",
          method: "DoSearchForQQMusicDesktop",
          param: { num_per_page: limit, page_num: 1, query: keyword, search_type: 0 },
        },
      });
      const res = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body,
      });
      const data: any = await res.json();
      const list = data?.req_0?.data?.body?.song?.list ?? [];

      return list.map((raw: any) => ({
        id: raw.mid ?? raw.songmid ?? "",
        title: raw.name ?? raw.songname ?? raw.title ?? "",
        artist: (raw.singer ?? []).map((s: any) => s.name).join(", ") ?? raw.artist ?? "",
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

  async getSongUrl(songId: string): Promise<SongUrlResult> {
    try {
      const body = JSON.stringify({
        req_0: {
          module: "music.vkey.GetVkey",
          method: "CgiGetVkey",
          param: { guid: "10000", songmid: [songId], songtype: [0], uin: "0", platform: "20" },
        },
      });
      const res = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body,
      });
      const data: any = await res.json();
      const midInfo = data?.req_0?.data?.midurlinfo?.[0];
      const sip = data?.req_0?.data?.sip ?? [];

      if (midInfo?.purl && midInfo.purl !== "") {
        return {
          url: `${sip[0] ?? "http://ws.stream.qqmusic.qq.com"}${midInfo.purl}`,
          br: 320,
        };
      }
      return { url: "/static/music/demo.wav", br: 128 };
    } catch (e: any) {
      console.error("[music] getSongUrl failed:", e.message);
      return { url: "/static/music/demo.wav", br: 128 };
    }
  }

  async getLyric(songId: string): Promise<LyricResult> {
    try {
      const body = JSON.stringify({
        req_0: {
          module: "music.musichallSong.LyricInter",
          method: "GetLyric",
          param: { songmid: songId, platform: "yqq" },
        },
      });
      const res = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
        method: "POST",
        headers: { ...this.headers, "Content-Type": "application/json" },
        body,
      });
      const data: any = await res.json();
      const lyric = data?.req_0?.data?.lyric ?? "";
      const trans = data?.req_0?.data?.trans ?? "";
      return { lrc: lyric, tlyric: trans };
    } catch (e: any) {
      console.error("[music] getLyric failed:", e.message);
      return { lrc: "[00:00.00]暂无歌词" };
    }
  }
}
