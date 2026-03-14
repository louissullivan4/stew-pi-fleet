'use strict';

const cron = require('node-cron');
const { pingHost } = require('./ping');
const { collectMetrics, collectServices, saveMetrics, pruneOldMetrics, rebootPi } = require('./metrics');
const notifier = require('./notifier');
const { stmts } = require('../db');

// Global Pi config set by configure()
let piConfigs = [];

// Track per-Pi online state and last service snapshot for change detection
const onlineState = new Map();
const lastServiceState = new Map();

// Active cron tasks: key → cron.ScheduledTask
const tasks = new Map();

/** Load Pi list and start background jobs. */
function configure(pis) {
  piConfigs = pis;
  stopAll();
  _startMetricsCollection();
  _startDatabaseMaintenance();
  _loadScheduledActions();
}

/** Reload user-defined scheduled actions from the database. */
function reloadScheduledActions() {
  // Clear existing user-created tasks
  for (const [key, task] of tasks.entries()) {
    if (key.startsWith('sched:')) {
      task.stop();
      tasks.delete(key);
    }
  }
  _loadScheduledActions();
}

function stopAll() {
  for (const task of tasks.values()) task.stop();
  tasks.clear();
}

// ─── Internal ────────────────────────────────────────────────────────────────

function _startMetricsCollection() {
  // Group Pis by their health_check_interval (in minutes).
  const byInterval = new Map();
  for (const pi of piConfigs) {
    const interval = pi.health_check_interval || 5;
    if (!byInterval.has(interval)) byInterval.set(interval, []);
    byInterval.get(interval).push(pi);
  }

  for (const [intervalMins, pis] of byInterval.entries()) {
    const expr = `*/${intervalMins} * * * *`;
    const task = cron.schedule(expr, () => _collectBatch(pis));
    tasks.set(`metrics:${intervalMins}`, task);
  }
}

async function _collectBatch(pis) {
  await Promise.allSettled(pis.map(pi => _collectOne(pi)));
}

async function _collectOne(pi) {
  const wasOnline = onlineState.get(pi.id);
  const isOnline = await pingHost(pi.ip, pi.ssh_port || 22);

  if (!isOnline) {
    onlineState.set(pi.id, false);
    if (wasOnline !== false) {
      notifier.checkOffline(pi);
    }
    return;
  }

  // Pi is online
  if (wasOnline === false) notifier.checkOnline(pi);
  onlineState.set(pi.id, true);

  const [metrics, services] = await Promise.allSettled([
    collectMetrics(pi),
    collectServices(pi),
  ]);

  if (metrics.status === 'fulfilled' && metrics.value) {
    saveMetrics(pi.id, metrics.value);
    notifier.checkDisk(pi, metrics.value);
    notifier.checkTemperature(pi, metrics.value);
  }

  if (services.status === 'fulfilled') {
    notifier.checkServices(pi, services.value, lastServiceState.get(pi.id));
    lastServiceState.set(pi.id, services.value);
  }
}

function _startDatabaseMaintenance() {
  // Prune old metrics daily at 03:00
  const task = cron.schedule('0 3 * * *', () => {
    const retentionDays = 30;
    pruneOldMetrics(retentionDays);
  });
  tasks.set('db:prune', task);
}

function _loadScheduledActions() {
  const schedules = stmts.getSchedules.all();
  for (const sched of schedules) {
    if (!sched.enabled) continue;
    _registerScheduledAction(sched);
  }
}

function _registerScheduledAction(sched) {
  if (!cron.validate(sched.cron_expression)) {
    console.warn(`[scheduler] Invalid cron expression for schedule ${sched.id}: ${sched.cron_expression}`);
    return;
  }

  const pi = piConfigs.find(p => p.id === sched.pi_id);
  if (!pi) return;

  const task = cron.schedule(sched.cron_expression, async () => {
    let status = 'ok';
    try {
      if (sched.action_type === 'reboot') {
        notifier.info(pi.id, `Scheduled reboot of ${pi.name}`, 'Initiating scheduled reboot.');
        await rebootPi(pi);
      } else if (sched.action_type === 'update-check') {
        await _runUpdateCheck(pi, sched);
      }
    } catch (err) {
      status = err.message || 'error';
    }
    stmts.updateScheduleRun.run(status, sched.id);
  });

  tasks.set(`sched:${sched.id}`, task);
}

async function _runUpdateCheck(pi) {
  const { stdout } = await require('./ssh-pool').exec(
    pi.id,
    'sudo apt-get update -qq 2>/dev/null && apt-get -s upgrade 2>/dev/null | grep -c "^Inst" || echo 0',
    60_000
  );
  const count = parseInt(stdout, 10);
  if (count > 0) {
    notifier.fireAlert({
      piId:     pi.id,
      key:      'updates',
      type:     'info',
      severity: 'info',
      title:    `${count} update${count !== 1 ? 's' : ''} available on ${pi.name}`,
      message:  `apt-get reports ${count} upgradable package${count !== 1 ? 's' : ''}.`,
    });
  }
}

/** Expose for the schedules route to call after DB changes. */
function registerScheduledAction(sched) {
  _registerScheduledAction(sched);
}

function unregisterScheduledAction(schedId) {
  const key = `sched:${schedId}`;
  tasks.get(key)?.stop();
  tasks.delete(key);
}

/** Get current online state snapshot. */
function getOnlineStates() {
  return Object.fromEntries(onlineState);
}

/** Get last service state snapshot for a Pi. */
function getLastServiceState(piId) {
  return lastServiceState.get(piId) || {};
}

module.exports = {
  configure,
  reloadScheduledActions,
  registerScheduledAction,
  unregisterScheduledAction,
  stopAll,
  getOnlineStates,
  getLastServiceState,
};
