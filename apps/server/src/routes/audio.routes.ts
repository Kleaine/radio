// routes/audio.routes.ts — 音频代理（懒加载 + 预缓存播放链接）
// 模仿 Claudio 的 /api/audio 模式，加 URL 预缓存避免点播时等待

import { Router, Request, Response } from "express";
import { execFile } from "child_process";
import path from "path";

export const audioRoutes = Router();

const BRIDGE = path.resolve(__dirname, "..", "..", "..", "..", "data", "qq_bridge.py");
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
  return "python";
}

function callBridge(subcmd: string, arg: string): Promise<any> {
  return new Promise((resolve) => {
    findPython().then(python => {
      execFile(python, [BRIDGE, subcmd, arg], {
        maxBuffer: 2 * 1024 * 1024,
        timeout: 30000,
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      }, (err, stdout) => {
        if (err) { resolve(null); return; }
        try { resolve(JSON.parse(stdout)); } catch { resolve(null); }
      });
    });
  });
}

// ── URL 预缓存 ──
const urlCache = new Map<string, string>();

/** 后台预取一批歌曲的播放链接，点播时瞬间 302 */
export async function preWarmUrls(mids: string[]): Promise<void> {
  const uncached = mids.filter(m => !urlCache.has(m));
  if (uncached.length === 0) return;

  try {
    const urls = await callBridge("url", uncached.join(","));
    if (urls && typeof urls === "object") {
      for (const [mid, url] of Object.entries(urls)) {
        if (url && typeof url === "string") {
          urlCache.set(mid, url);
        }
      }
    }
  } catch (err: any) {
    console.error("[audio] 预缓存失败:", err.message);
  }
}

// GET /api/audio?mid=xxx — 先查缓存，未命中则实时取
audioRoutes.get("/audio", async (req: Request, res: Response) => {
  const mid = req.query.mid as string;
  if (!mid) {
    res.status(400).json({ error: "缺少 mid 参数" });
    return;
  }

  // 缓存命中
  const cached = urlCache.get(mid);
  if (cached) {
    res.redirect(302, cached);
    return;
  }

  // 实时获取
  try {
    const urls = await callBridge("url", mid);
    const url = urls?.[mid];
    if (url) {
      urlCache.set(mid, url);
      res.redirect(302, url);
    } else {
      res.status(404).json({ error: "无法获取播放链接" });
    }
  } catch (err: any) {
    console.error("[audio] 代理失败:", err.message);
    res.status(500).json({ error: "音频代理失败" });
  }
});
