'use strict';

const { stmts } = require('../db');

// In-memory broadcast subscribers (WebSocket connections listening for events)
const subscribers = new Set();

function subscribe(fn) { subscribers.add(fn); }
function unsubscribe(fn) { subscribers.delete(fn); }

function broadcast(event) {
  for (const fn of subscribers) {
    try { fn(event); } catch {}
  }
}

/**
 * Fire an alert, but only if the cooldown has expired.
 * Returns true if the alert was created, false if suppressed.
 */
function fireAlert({ piId, key, type, severity, title, message, details }) {
  const cooldownMinutes = parseInt(process.env.ALERT_COOLDOWN_MINUTES, 10) || 30;
  const cooldownSeconds = cooldownMinutes * 60;
  const now = Math.floor(Date.now() / 1000);

  const last = stmts.getAlertState.get(piId, key);
  if (last && now - last.last_fired < cooldownSeconds) return false;

  stmts.upsertAlertState.run(piId, key);
  const result = stmts.insertNotification.run({
    pi_id: piId,
    type,
    severity,
    title,
    message,
    details: details ? JSON.stringify(details) : null,
  });

  const notification = {
    id:         result.lastInsertRowid,
    pi_id:      piId,
    type,
    severity,
    title,
    message,
    created_at: now,
    read_at:    null,
  };

  broadcast({ event: 'notification', data: notification });

  // Send external alerts (webhook / email) — fire and forget
  sendExternalAlerts(notification).catch(() => {});

  return true;
}

/** Clear an alert state so it can fire again immediately next time. */
function clearAlert(piId, key) {
  stmts.clearAlertState.run(piId, key);
}

/** Create an informational notification (no cooldown, no external alert). */
function info(piId, title, message) {
  const result = stmts.insertNotification.run({
    pi_id:    piId,
    type:     'info',
    severity: 'info',
    title,
    message,
    details:  null,
  });
  broadcast({
    event: 'notification',
    data:  { id: result.lastInsertRowid, pi_id: piId, type: 'info', severity: 'info', title, message, created_at: Math.floor(Date.now() / 1000) },
  });
}

// ─── Condition checkers (called by scheduler) ──────────────────────────────

function checkOffline(pi) {
  fireAlert({
    piId:     pi.id,
    key:      'offline',
    type:     'offline',
    severity: 'critical',
    title:    `${pi.name} is offline`,
    message:  `Cannot reach ${pi.ip} on port ${pi.ssh_port || 22}.`,
  });
}

function checkOnline(pi) {
  // Clear offline alert state when Pi comes back
  clearAlert(pi.id, 'offline');
  info(pi.id, `${pi.name} is back online`, `${pi.ip} is reachable again.`);
}

function checkDisk(pi, metrics) {
  const threshold = parseInt(process.env.DISK_ALERT_THRESHOLD, 10) || 90;
  if (metrics.disk_used_pct >= threshold) {
    fireAlert({
      piId:     pi.id,
      key:      'disk',
      type:     'disk',
      severity: metrics.disk_used_pct >= 95 ? 'critical' : 'warning',
      title:    `Disk usage high on ${pi.name}`,
      message:  `Root filesystem is ${metrics.disk_used_pct}% full (${metrics.disk_used_gb} GB / ${metrics.disk_total_gb} GB).`,
    });
  } else {
    clearAlert(pi.id, 'disk');
  }
}

function checkTemperature(pi, metrics) {
  const threshold = parseInt(process.env.TEMP_ALERT_THRESHOLD, 10) || 80;
  if (metrics.temperature_c >= threshold) {
    fireAlert({
      piId:     pi.id,
      key:      'temperature',
      type:     'temperature',
      severity: metrics.temperature_c >= 85 ? 'critical' : 'warning',
      title:    `High temperature on ${pi.name}`,
      message:  `CPU temperature is ${metrics.temperature_c}°C (threshold: ${threshold}°C).`,
    });
  } else {
    clearAlert(pi.id, 'temperature');
  }
}

function checkServices(pi, serviceStatuses, previousStatuses) {
  for (const [name, status] of Object.entries(serviceStatuses)) {
    const prev = previousStatuses?.[name];
    const key = `svc:${name}`;

    if (status === 'failed' || (prev === 'active' && status !== 'active')) {
      fireAlert({
        piId:     pi.id,
        key,
        type:     'service',
        severity: 'warning',
        title:    `Service ${name} is ${status} on ${pi.name}`,
        message:  `The ${name} service changed from "${prev ?? 'unknown'}" to "${status}".`,
        details:  { service: name, status, previous: prev },
      });
    } else if (status === 'active') {
      clearAlert(pi.id, key);
    }
  }
}

// ─── External delivery ──────────────────────────────────────────────────────

async function sendExternalAlerts(notification) {
  await Promise.allSettled([
    sendWebhook(notification),
    sendEmail(notification),
  ]);
}

async function sendWebhook(notification) {
  const url = process.env.WEBHOOK_URL;
  if (!url) return;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      source:   'pi-fleet',
      ...notification,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) throw new Error(`Webhook returned ${res.status}`);
}

async function sendEmail(notification) {
  if (!process.env.SMTP_HOST || !process.env.ALERT_EMAIL_TO) return;

  // Lazy-load nodemailer only when needed
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth:   process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from:    process.env.ALERT_EMAIL_FROM || 'pi-fleet@localhost',
    to:      process.env.ALERT_EMAIL_TO,
    subject: `[Pi Fleet] ${notification.severity.toUpperCase()}: ${notification.title}`,
    text:    `${notification.message}\n\nTime: ${new Date(notification.created_at * 1000).toISOString()}`,
  });
}

module.exports = {
  subscribe,
  unsubscribe,
  broadcast,
  fireAlert,
  clearAlert,
  info,
  checkOffline,
  checkOnline,
  checkDisk,
  checkTemperature,
  checkServices,
};
