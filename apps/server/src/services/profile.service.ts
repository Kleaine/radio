// profile.service.ts — 动态口味画像
// 模仿 Claudio ProfileService：每次播歌更新 inferredArtists，持久化到 JSON

import fs from "fs";
import path from "path";

interface Profile {
  inferredArtists: Record<string, number>;  // 歌手 → 加权播放次数
  lastUpdated: string;
}

const PROFILE_PATH = path.resolve(__dirname, "..", "..", "..", "..", "user", "profile.json");

function load(): Profile {
  try {
    if (fs.existsSync(PROFILE_PATH)) {
      return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    }
  } catch {}
  return { inferredArtists: {}, lastUpdated: "" };
}

function save(profile: Profile) {
  profile.lastUpdated = new Date().toISOString();
  const dir = path.dirname(PROFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(PROFILE_PATH, JSON.stringify(profile, null, 2), "utf-8");
}

/** 记录一次播放，更新歌手权重 */
export function recordPlay(artist: string, weight = 1) {
  if (!artist) return;
  const profile = load();
  profile.inferredArtists[artist] = (profile.inferredArtists[artist] || 0) + weight;
  // 最多保留 50 个歌手
  const entries = Object.entries(profile.inferredArtists).sort((a, b) => b[1] - a[1]);
  profile.inferredArtists = Object.fromEntries(entries.slice(0, 50));
  save(profile);
}

/** 获取口味摘要（Top 10 歌手） */
export function getProfileSummary(): string {
  const profile = load();
  const entries = Object.entries(profile.inferredArtists).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "";
  const top10 = entries.slice(0, 10).map(([artist, count]) => `${artist}(${count}次)`).join("、");
  return `口味画像（从播放记录统计）：${top10}`;
}
