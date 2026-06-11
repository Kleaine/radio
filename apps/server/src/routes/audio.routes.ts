// routes/audio.routes.ts — 音频代理（懒加载 + 预缓存 + 透传）
// 增加重试逻辑，解决 qimei 设备指纹请求偶尔 ConnectionResetError 的问题

import { Router, Request, Response } from "express";
import { execFile } from "child_process";
import path from "path";

export const audioRoutes = Router();

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

async function callBridge(subcmd: string, arg: string): Promise<any> {
  const python = await findPython();
  for (let attempt = 1; attempt <= MAX_BRIDGE_RETRIES; attempt++) {
    try {
      const result = await new Promise<any>((resolve, reject) => {
        execFile(python, [BRIDGE, subcmd, arg], {
          maxBuffer: 2 * 1024 * 1024,
          timeout: 30000,
          env: { ...process.env, PYTHONIOENCODING: "utf-8" },
        }, (err, stdout) => {
          if (err) { reject(err); return; }
          try { resolve(JSON.parse(stdout)); }
          catch (e) { reject(new Error(`JSON parse failed: ${String(e).slice(0, 200)}`)); }
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
        console.warn(`[audio-bridge] 第 ${attempt} 次失败: ${msg.slice(0, 120)}，${RETRY_DELAY_MS}ms 后重试`);
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      console.error(`[audio-bridge] 调用失败 (${subcmd}): ${msg.slice(0, 200)}`);
      return null;
    }
  }
  return null;
}

// ── URL 预缓存（最多 200 条，超了清最旧的）──
const urlCache = new Map<string, string>();
const MAX_CACHE = 200;

function cacheSet(mid: string, url: string) {
  if (urlCache.size >= MAX_CACHE) {
    const first = urlCache.keys().next().value;
    if (first) urlCache.delete(first);
  }
  urlCache.set(mid, url);
}

export async function preWarmUrls(mids: string[]): Promise<void> {
  const uncached = mids.filter(m => !urlCache.has(m));
  if (uncached.length === 0) return;

  const results = await Promise.allSettled(
    uncached.map(async (mid) => {
      try {
        const urls = await callBridge("url", mid);
        if (urls && typeof urls === "object" && urls[mid]) {
          cacheSet(mid, urls[mid]);
        }
      } catch (err: any) {
        console.error(`[audio] 预缓存失败 ${mid}:`, err.message);
      }
    })
  );
}

// GET /api/audio?mid=xxx — 透传模式：服务器拉音频，浏览器直接收
audioRoutes.get("/audio", async (req: Request, res: Response) => {
  const mid = req.query.mid as string;
  if (!mid) {
    res.status(400).json({ error: "缺少 mid 参数" });
    return;
  }

  try {
    let qqUrl = urlCache.get(mid);
    if (!qqUrl) {
      const urls = await callBridge("url", mid);
      qqUrl = urls?.[mid];
      if (qqUrl) cacheSet(mid, qqUrl);
    }
    if (!qqUrl) {
      res.status(404).json({ error: "无法获取播放链接" });
      return;
    }

    try {
      const audioRes = await fetch(qqUrl, { signal: AbortSignal.timeout(15000) });
      if (!audioRes.ok) throw new Error("fetch failed");
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
    } catch {
      res.redirect(302, qqUrl);
    }
  } catch (err: any) {
    console.error("[audio] 代理失败:", err.message);
    res.status(500).json({ error: "音频代理失败" });
  }
});
