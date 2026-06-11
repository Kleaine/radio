// music.service.ts — QQ音乐服务（Mock + Python 桥接 双实现）
// 增加了重试逻辑，解决 qimei 设备指纹请求偶尔 ConnectionResetError 的问题

import { execFile } from "child_process";
import path from "path";
import type { MusicService, Song, SongUrlResult, LyricResult } from "../interface/music.service.interface";

const BRIDGE = path.resolve(__dirname, "..", "..", "..", "..", "data", "qq_bridge.py");
const PYTHON_PATHS = [
  process.env.PYTHON_PATH,
  "C:\\Users\\Administrator\\AppData\\Local\\Programs\\Python\\Python312\\python.exe",
  "python",
  "python3",
].filter(Boolean) as string[];

const MAX_BRIDGE_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

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
  return "python";
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callBridge(subcmd: string, arg: string, limit?: number): Promise<any> {
  const python = await findPython();
  const args = limit ? [BRIDGE, subcmd, arg, String(limit)] : [BRIDGE, subcmd, arg];

  for (let attempt = 1; attempt <= MAX_BRIDGE_RETRIES; attempt++) {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        execFile(python, args, {
          maxBuffer: 2 * 1024 * 1024,
          timeout: 60000,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        }, (err, stdout) => {
          if (err) {
            reject(err);
            return;
          }
          try {
            const parsed = JSON.parse(stdout);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`JSON parse failed: ${String(e).slice(0, 200)}`));
          }
        });
      });
      return result;
    } catch (err: any) {
      const msg = String(err?.message || err || "").toLowerCase();
      const isRetryable = msg.includes("connection") || msg.includes("reset") ||
        msg.includes("timeout") || msg.includes("timed out") || msg.includes("econn") ||
        msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504") ||
        msg.includes("json parse") || msg.includes("exit code");
      if (isRetryable && attempt < MAX_BRIDGE_RETRIES) {
        console.warn(`[bridge] 第 ${attempt} 次调用失败: ${msg.slice(0, 120)}，${RETRY_DELAY_MS}ms 后重试`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.error(`[bridge] 调用失败 (${subcmd}): ${msg.slice(0, 200)}`);
      return null;
    }
  }
  return null;
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

  async getMyPlaylists(): Promise<Array<{ id: number; name: string; count: number }>> {
    const data = await callBridge("playlists", "");
    return (data && Array.isArray(data)) ? data : [];
  }

  async getPlaylistSongs(plId: number, limit = 50): Promise<Array<{ mid: string; title: string; artist: string }>> {
    const data = await callBridge("pl_songs", String(plId), limit);
    return (data && Array.isArray(data)) ? data : [];
  }
}

// ── 真实实现：Python 桥接到 qqmusic_api（扫码登录后可用）──

export class QQMusicService implements MusicService {
  private urlCache: Map<string, string> = new Map();

  constructor(_cookie?: string) {
    // 参数保留用于向后兼容（旧的 cookie 方式不再使用，改为 Python 桥接 + credential 文件）
  }

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
    if (this.urlCache.has(songId)) {
      return { url: this.urlCache.get(songId)!, br: 320 };
    }
    const map = await callBridge("url", songId);
    if (map && map[songId]) {
      return { url: map[songId], br: 320 };
    }
    return { url: "/static/music/demo.wav", br: 128 };
  }

  async getLyric(_songId: string): Promise<LyricResult> {
    return { lrc: "[00:00.00]暂无歌词" };
  }

  async getMyPlaylists(): Promise<Array<{ id: number; name: string; count: number }>> {
    const data = await callBridge("playlists", "");
    return (data && Array.isArray(data)) ? data : [];
  }

  async getPlaylistSongs(plId: number, limit = 50): Promise<Array<{ mid: string; title: string; artist: string }>> {
    const data = await callBridge("pl_songs", String(plId), limit);
    return (data && Array.isArray(data)) ? data : [];
  }
}
