// routes/audio.routes.ts — 音频代理（懒加载 + 预缓存 + 透传）
// 模仿 Claudio：服务器取 QQ 音乐 URL → 拉音频 → 透传给浏览器

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

// GET /api/audio?mid=xxx — 透传模式：服务器拉音频，浏览器直接收
audioRoutes.get("/audio", async (req: Request, res: Response) => {
  const mid = req.query.mid as string;
  if (!mid) {
    res.status(400).json({ error: "缺少 mid 参数" });
    return;
  }

  try {
    // 1. 取 QQ 音乐播放链接
    let qqUrl = urlCache.get(mid);
    if (!qqUrl) {
      const urls = await callBridge("url", mid);
      qqUrl = urls?.[mid];
      if (qqUrl) urlCache.set(mid, qqUrl);
    }
    if (!qqUrl) {
      res.status(404).json({ error: "无法获取播放链接" });
      return;
    }

    // 2. 从 QQ 音乐拉音频
    const audioRes = await fetch(qqUrl, { signal: AbortSignal.timeout(30000) });
    if (!audioRes.ok) {
      res.status(502).json({ error: "QQ 音乐返回错误" });
      return;
    }

    // 3. 读取并透传（检测格式）
    const buffer = Buffer.from(await audioRes.arrayBuffer());
    let contentType = "audio/mpeg";
    if (buffer.length >= 4) {
      const magic = buffer.toString("ascii", 0, 4);
      if (magic === "fLaC") contentType = "audio/flac";
      else if (magic === "OggS") contentType = "audio/ogg";
    }

    res.header("Content-Type", contentType);
    res.header("Accept-Ranges", "bytes");
    res.header("Content-Length", String(buffer.length));
    res.header("Cache-Control", "public, max-age=3600");
    res.send(buffer);
  } catch (err: any) {
    console.error("[audio] 代理失败:", err.message);
    res.status(500).json({ error: "音频代理失败" });
  }
});
