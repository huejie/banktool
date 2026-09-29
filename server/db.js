import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'bank-tool.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// node:sqlite 无内建事务辅助，封装同步事务
export function inTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

db.exec(`
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  gender TEXT DEFAULT '',
  birthday TEXT DEFAULT '',
  company TEXT DEFAULT '',
  title TEXT DEFAULT '',
  risk_level TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  preferences TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')),
  updated_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  category TEXT DEFAULT '其他',
  product_name TEXT DEFAULT '',
  amount REAL DEFAULT 0,
  start_date TEXT DEFAULT '',
  maturity_date TEXT DEFAULT '',
  rate TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  record_date TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_assets_customer ON assets(customer_id);

CREATE TABLE IF NOT EXISTS ocr_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_path TEXT DEFAULT '',
  mode TEXT DEFAULT '',
  result TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS analysis_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT DEFAULT '',
  analysis_type TEXT DEFAULT '',
  masked INTEGER DEFAULT 1,
  content TEXT DEFAULT '',
  model TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT DEFAULT '',
  suggest_new TEXT DEFAULT '',
  extracted TEXT DEFAULT '',
  applied INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_chat_customer ON chat_messages(customer_id);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT '理财',
  code TEXT DEFAULT '',
  risk_level TEXT DEFAULT '',
  expected_rate TEXT DEFAULT '',
  term TEXT DEFAULT '',
  min_amount REAL DEFAULT 0,
  highlights TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

// 旧库迁移：chat_messages 增加 extracted / applied 列
try {
  db.exec("ALTER TABLE chat_messages ADD COLUMN extracted TEXT DEFAULT ''");
} catch {}
try {
  db.exec('ALTER TABLE chat_messages ADD COLUMN applied INTEGER DEFAULT 0');
} catch {}

export function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value ?? ''));
}
