// memory-writer.ts — 用户偏好记忆
// AI 在回复中发现新偏好后，自动追加到本地用户画像文件

import fs from "fs";
import path from "path";

const USER_DIR = path.resolve(process.cwd(), "user");

const FILE_MAP: Record<string, string> = {
  taste: "taste.md",
  routines: "routines.md",
  moodrules: "mood-rules.md",
};

export interface MemoryEntry {
  file: "taste" | "routines" | "moodrules";
  add: string;
}

/** 确保 user 目录和必要文件存在 */
function ensureUserDir() {
  if (!fs.existsSync(USER_DIR)) {
    fs.mkdirSync(USER_DIR, { recursive: true });
  }
  for (const filename of Object.values(FILE_MAP)) {
    const filePath = path.join(USER_DIR, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, "", "utf-8");
    }
  }
}

/** 追加一条记忆到对应用户画像文件 */
export function writeMemory(entry: MemoryEntry) {
  if (!entry.add.trim()) return;

  ensureUserDir();
  const filePath = path.join(USER_DIR, FILE_MAP[entry.file]);
  if (!filePath) return;

  const line = `- ${entry.add.trim()}\n`;
  fs.appendFileSync(filePath, line, "utf-8");
}

/** 批量写入 */
export function writeMemories(entries: MemoryEntry[]) {
  for (const entry of entries) {
    writeMemory(entry);
  }
}

/** 读取所有用户画像文件内容 */
export function readAllProfiles(): Record<string, string> {
  ensureUserDir();
  const result: Record<string, string> = {};
  for (const [key, filename] of Object.entries(FILE_MAP)) {
    const filePath = path.join(USER_DIR, filename);
    try {
      result[key] = fs.readFileSync(filePath, "utf-8");
    } catch {
      result[key] = "";
    }
  }
  return result;
}
