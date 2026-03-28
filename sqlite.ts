import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export function openDb(sqlitePath: string) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });
  const db = new Database(sqlitePath);

  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id INTEGER PRIMARY KEY,
      step TEXT NOT NULL,
      subscribed INTEGER NOT NULL DEFAULT 0,
      lesson INTEGER NOT NULL DEFAULT 0,
      ui_state TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Миграция для старых баз (если таблица была создана до добавления ui_state).
  const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const hasUiState = cols.some((c) => c.name === "ui_state");
  if (!hasUiState) {
    db.exec(`ALTER TABLE users ADD COLUMN ui_state TEXT;`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS claim_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      username TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_claim_events_created_at ON claim_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_claim_events_telegram_id ON claim_events(telegram_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      username TEXT,
      product TEXT NOT NULL,
      amount_rub TEXT NOT NULL,
      amount_usdt TEXT NOT NULL,
      status TEXT NOT NULL,
      receipt_file_id TEXT,
      receipt_type TEXT,
      receipt_message_id INTEGER,
      admin_decision_by INTEGER,
      admin_decision_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_created_at ON payment_requests(created_at);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_telegram_id ON payment_requests(telegram_id);
  `);

  // Миграция: receipt_type для существующих баз.
  const payCols = db.prepare(`PRAGMA table_info(payment_requests)`).all() as Array<{ name: string }>;
  const hasReceiptType = payCols.some((c) => c.name === "receipt_type");
  if (!hasReceiptType) {
    db.exec(`ALTER TABLE payment_requests ADD COLUMN receipt_type TEXT;`);
  }

  return db;
}

