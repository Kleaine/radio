// memory-writer.ts — 用户偏好记忆
// AI 在回复中发现新偏好后，自动追加到本地用户画像文件

import fs from "fs";
import path from "path";

const FILE_MAP: Record<string, string> = {
  taste: "taste.md",
  routines: "routines.md",
  moodrules: "mood-rules.md",
};

export interface MemoryEntry {
  file: "taste" | "routines" | "moodrules";
  add: string;
}

export interface MemoryWriter {
  write(entry: MemoryEntry): void;
  writeAll(entries: MemoryEntry[]): void;
  readAll(): Record<string, string>;
}

export function createMemoryWriter(userDir?: string): MemoryWriter {
  const dir = path.resolve(userDir ?? process.cwd(), "user");

  function ensureDir() {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    for (const filename of Object.values(FILE_MAP)) {
      const filePath = path.join(dir, filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, "", "utf-8");
      }
    }
  }

  function write(entry: MemoryEntry) {
    if (!entry?.add?.trim()) return;

    const filename = FILE_MAP[entry.file];
    if (!filename) return;

    ensureDir();
    const filePath = path.join(dir, filename);
    const line = `- ${entry.add.trim()}\n`;
    fs.appendFileSync(filePath, line, "utf-8");
  }

  function writeAll(entries: MemoryEntry[]) {
    for (const entry of entries) {
      write(entry);
    }
  }

  function readAll(): Record<string, string> {
    ensureDir();
    const result: Record<string, string> = {};
    for (const [key, filename] of Object.entries(FILE_MAP)) {
      const filePath = path.join(dir, filename);
      try {
        result[key] = fs.readFileSync(filePath, "utf-8");
      } catch {
        result[key] = "";
      }
    }
    return result;
  }

  return { write, writeAll, readAll };
}
