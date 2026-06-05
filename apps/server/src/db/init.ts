// db/init.ts — SQLite 数据库初始化
// 用户表 + 播放历史表 + 飞书绑定表

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(__dirname, "../../../data/radio.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    // 确保 data 目录存在
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  return db;
}

export function initDatabase(): void {
  const db = getDb();

  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 播放历史表（供 context.service 使用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS plays (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      song_id TEXT,
      song_title TEXT,
      artist TEXT,
      played_at TEXT DEFAULT (datetime('now', 'localtime')),
      skipped INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // 飞书账户绑定表
  db.exec(`
    CREATE TABLE IF NOT EXISTS feishu_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      feishu_user_id TEXT,
      feishu_access_token TEXT,
      feishu_refresh_token TEXT,
      token_expires_at TEXT,
      bound_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  console.log("[db] 表结构已就绪");
}
