const path = require('node:path');
const fs = require('node:fs');

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('donor','recipient','courier','admin')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','rejected')),
    phone TEXT,
    address TEXT,
    lat REAL,
    lng REAL,
    org_name TEXT,
    capacity INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS food_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT,
    portions INTEGER NOT NULL CHECK (portions > 0),
    expiry_at TEXT NOT NULL,
    photo_path TEXT,
    lat REAL,
    lng REAL,
    status TEXT NOT NULL DEFAULT 'available'
      CHECK (status IN ('available','matched','picked_up','delivered','verified','expired','cancelled')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS food_needs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    portions_needed INTEGER NOT NULL CHECK (portions_needed > 0),
    urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low','medium','high','critical')),
    note TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','fulfilled','expired')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES food_listings(id),
    need_id INTEGER NOT NULL REFERENCES food_needs(id),
    courier_id INTEGER NOT NULL REFERENCES users(id),
    score REAL NOT NULL,
    score_expiry REAL NOT NULL,
    score_distance REAL NOT NULL,
    score_urgency REAL NOT NULL,
    score_capacity REAL NOT NULL,
    distance_km REAL NOT NULL,
    route_json TEXT,
    status TEXT NOT NULL DEFAULT 'proposed'
      CHECK (status IN ('proposed','accepted','picked_up','delivered','verified','cancelled')),
    photo_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_active_listing
    ON matches(listing_id) WHERE status != 'cancelled'`,
  `CREATE TABLE IF NOT EXISTS otp_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    match_id INTEGER REFERENCES matches(id),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    detail TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
   BEFORE UPDATE ON audit_logs
   BEGIN
     SELECT RAISE(ABORT, 'audit_logs is immutable');
   END`,
  `CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
   BEFORE DELETE ON audit_logs
   BEGIN
     SELECT RAISE(ABORT, 'audit_logs is immutable');
   END`,
];

const cloudUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_DATABASE_URL || null;
const cloudToken = process.env.TURSO_AUTH_TOKEN || process.env.LIBSQL_AUTH_TOKEN || null;

let localDb = null;
let cloudClient = null;
let readyPromise = null;

function normalizeResult(result) {
  return {
    rows: (result.rows || []).map((r) => ({ ...r })),
    lastInsertRowid: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : null,
    changes: result.rowsAffected != null ? Number(result.rowsAffected) : 0,
  };
}

async function init() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (cloudUrl) {
      const { createClient } = require('@libsql/client');
      cloudClient = createClient({ url: cloudUrl, authToken: cloudToken || undefined });
      for (const sql of SCHEMA_STATEMENTS) {
        await cloudClient.execute(sql);
      }
      return;
    }

    const { DatabaseSync } = require('node:sqlite');
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    localDb = new DatabaseSync(path.join(dataDir, 'food_rescue.db'));
    localDb.exec('PRAGMA foreign_keys = ON;');
    localDb.exec('PRAGMA journal_mode = WAL;');
    for (const sql of SCHEMA_STATEMENTS) {
      localDb.exec(sql);
    }
  })();
  return readyPromise;
}

async function all(sql, params = []) {
  await init();
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    return normalizeResult(r).rows;
  }
  return localDb.prepare(sql).all(...params).map((r) => ({ ...r }));
}

async function get(sql, params = []) {
  await init();
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    const rows = normalizeResult(r).rows;
    return rows[0] ?? null;
  }
  const row = localDb.prepare(sql).get(...params);
  return row ? { ...row } : null;
}

async function run(sql, params = []) {
  await init();
  if (cloudClient) {
    const r = await cloudClient.execute({ sql, args: params });
    return normalizeResult(r);
  }
  const r = localDb.prepare(sql).run(...params);
  return { rows: [], lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
}

async function exec(sql) {
  await init();
  if (cloudClient) {
    await cloudClient.execute(sql);
    return;
  }
  localDb.exec(sql);
}

async function isCloud() {
  await init();
  return !!cloudClient;
}

module.exports = { all, get, run, exec, init, isCloud, SCHEMA_STATEMENTS };
