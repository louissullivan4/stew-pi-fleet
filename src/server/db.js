'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/fleet.db');

// Ensure parent directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS metrics (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pi_id       TEXT    NOT NULL,
    collected_at INTEGER NOT NULL DEFAULT (unixepoch()),
    cpu_percent  REAL,
    mem_used_mb  INTEGER,
    mem_total_mb INTEGER,
    disk_used_pct REAL,
    disk_used_gb  REAL,
    disk_total_gb REAL,
    temperature_c REAL,
    load_1        REAL,
    load_5        REAL,
    load_15       REAL,
    uptime_s      INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_metrics_pi_time
    ON metrics (pi_id, collected_at DESC);

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    pi_id       TEXT,
    type        TEXT    NOT NULL,  -- offline|disk|temperature|service|info
    severity    TEXT    NOT NULL DEFAULT 'warning',  -- info|warning|critical
    title       TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    details     TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    read_at     INTEGER,
    resolved_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_created
    ON notifications (created_at DESC);

  CREATE TABLE IF NOT EXISTS scheduled_actions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    pi_id           TEXT    NOT NULL,
    action_type     TEXT    NOT NULL,  -- reboot|update-check|custom
    cron_expression TEXT    NOT NULL,
    enabled         INTEGER NOT NULL DEFAULT 1,
    label           TEXT,
    last_run_at     INTEGER,
    last_run_status TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS alert_state (
    pi_id       TEXT    NOT NULL,
    alert_key   TEXT    NOT NULL,  -- e.g. "offline", "disk", "temp", "svc:nginx"
    last_fired  INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (pi_id, alert_key)
  );
`);

// Prepared statements exposed for use across the app
const stmts = {
  insertMetric: db.prepare(`
    INSERT INTO metrics
      (pi_id, cpu_percent, mem_used_mb, mem_total_mb, disk_used_pct,
       disk_used_gb, disk_total_gb, temperature_c, load_1, load_5, load_15, uptime_s)
    VALUES
      (@pi_id, @cpu_percent, @mem_used_mb, @mem_total_mb, @disk_used_pct,
       @disk_used_gb, @disk_total_gb, @temperature_c, @load_1, @load_5, @load_15, @uptime_s)
  `),

  getMetrics: db.prepare(`
    SELECT * FROM metrics
    WHERE pi_id = ? AND collected_at >= ?
    ORDER BY collected_at ASC
  `),

  getLatestMetric: db.prepare(`
    SELECT * FROM metrics WHERE pi_id = ? ORDER BY collected_at DESC LIMIT 1
  `),

  pruneMetrics: db.prepare(`
    DELETE FROM metrics WHERE collected_at < ?
  `),

  insertNotification: db.prepare(`
    INSERT INTO notifications (pi_id, type, severity, title, message, details)
    VALUES (@pi_id, @type, @severity, @title, @message, @details)
  `),

  getNotifications: db.prepare(`
    SELECT * FROM notifications ORDER BY created_at DESC LIMIT ? OFFSET ?
  `),

  getUnreadCount: db.prepare(`
    SELECT COUNT(*) as count FROM notifications WHERE read_at IS NULL
  `),

  markRead: db.prepare(`
    UPDATE notifications SET read_at = unixepoch() WHERE id = ?
  `),

  markAllRead: db.prepare(`
    UPDATE notifications SET read_at = unixepoch() WHERE read_at IS NULL
  `),

  deleteNotification: db.prepare(`DELETE FROM notifications WHERE id = ?`),

  upsertAlertState: db.prepare(`
    INSERT INTO alert_state (pi_id, alert_key, last_fired)
    VALUES (?, ?, unixepoch())
    ON CONFLICT (pi_id, alert_key) DO UPDATE SET last_fired = unixepoch()
  `),

  getAlertState: db.prepare(`
    SELECT last_fired FROM alert_state WHERE pi_id = ? AND alert_key = ?
  `),

  clearAlertState: db.prepare(`
    DELETE FROM alert_state WHERE pi_id = ? AND alert_key = ?
  `),

  getSchedules: db.prepare(`SELECT * FROM scheduled_actions ORDER BY pi_id, action_type`),
  getSchedulesByPi: db.prepare(`SELECT * FROM scheduled_actions WHERE pi_id = ?`),
  getSchedule: db.prepare(`SELECT * FROM scheduled_actions WHERE id = ?`),

  insertSchedule: db.prepare(`
    INSERT INTO scheduled_actions (pi_id, action_type, cron_expression, enabled, label)
    VALUES (@pi_id, @action_type, @cron_expression, @enabled, @label)
  `),

  updateSchedule: db.prepare(`
    UPDATE scheduled_actions
    SET cron_expression = @cron_expression,
        enabled         = @enabled,
        label           = @label,
        updated_at      = unixepoch()
    WHERE id = @id
  `),

  updateScheduleRun: db.prepare(`
    UPDATE scheduled_actions
    SET last_run_at = unixepoch(), last_run_status = ?, updated_at = unixepoch()
    WHERE id = ?
  `),

  deleteSchedule: db.prepare(`DELETE FROM scheduled_actions WHERE id = ?`),
};

module.exports = { db, stmts };
