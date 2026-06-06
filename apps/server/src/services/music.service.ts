// music.service.ts — QQ音乐服务（Mock + Python 桥接 双实现）

import { execFile } from "child_process";
import path from "path";
import type { MusicService, Song, SongUrlResult, LyricResult } from "../interface/music.service.interface";

const BRIDGE = path.resolve(__dirname, "..", "..", "..", "..", "data", "qq_bridge.py");
// 按优先级尝试找 Python（先读环境变量，再试常见路径，最后 fallback 到 python 命令）
const PYTHON_PATHS = [
  process.env.PYTHON_PATH,
  "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
  "python3",
  "python",
].filter(Boolean) as string[];

let _pythonPath: string | null = null;
async function findPython(): Promise<string> {
  if (_pythonPath) return _pythonPath;
  for (const p of PYTHON_PATHS) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(p, ["--version"], { timeout: 5000 }, (err) => err ? reject(err) : resolve());
      });
      _pythonPath = p;
      return p;
    } catch {}
  }
  return "python"; // fallback
}

async function callBridge(subcmd: string, arg: string, limit?: number): Promise<any> {
  const python = await findPython();
  return new Promise((resolve) => {
    const args = limit ? [BRIDGE, subcmd, arg, String(limit)] : [BRIDGE, subcmd, arg];
    execFile(python, args, { maxBuffer: 2 * 1024 * 1024, timeout: 60000, env: { ...process.env, PYTHONIOENCODING: "utf-8" } }, (err, stdout) => {
      if (err) { console.error("[bridge] execFile error:", err.message); resolve(null); return; }
      try { resolve(JSON.parse(stdout)); } catch (e) { console.error("[bridge] JSON parse error:", String(e)); resolve(null); }
    });
  });
}

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

// ── 真实实现：Python 桥接到 qqmusic_api（扫码登录后可用）──

export class QQMusicService implements MusicService {
  private urlCache: Map<string, string> = new Map();

  async search(keyword: string, limit = 10): Promise<Song[]> {
    const data = await callBridge("search", keyword, limit);
    if (!data || !Array.isArray(data)) return [];
    return data.map((raw: any) => {
      if (raw.url) this.urlCache.set(raw.mid, raw.url);
      return {
        id: raw.mid ?? "",
        title: raw.title ?? "",
        artist: raw.artist ?? "",
        album: "",
        coverUrl: raw.cover ?? "",
        durationMs: raw.duration ?? 0,
      };
    });
  }

  async getSongUrl(songId: string): Promise<SongUrlResult> {
    // 先从缓存取（search 时已拿到 URL）
    if (this.urlCache.has(songId)) {
      return { url: this.urlCache.get(songId)!, br: 320 };
    }
    // 缓存没有再去 bridge 查
    const map = await callBridge("url", songId);
    if (map && map[songId]) {
      return { url: map[songId], br: 320 };
    }
    return { url: "/static/music/demo.wav", br: 128 };
  }

  async getLyric(_songId: string): Promise<LyricResult> {
    return { lrc: "[00:00.00]暂无歌词" };
  }
}
