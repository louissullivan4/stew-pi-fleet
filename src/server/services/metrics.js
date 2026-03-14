'use strict';

const sshPool = require('./ssh-pool');
const { stmts } = require('../db');

// Single bash one-liner that reads /proc directly — no dependencies required.
// Outputs: cpu|mem_used_kb mem_total_kb|disk_used_kb disk_total_kb disk_pct|temp|uptime_s|load1 load5 load15
const METRICS_CMD = `
cpu=$(awk '/^cpu /{
  idle=$5; total=0;
  for(i=2;i<=NF;i++) total+=$i;
  if(total>0) printf "%.1f", (1-(idle/total))*100; else print "0"
}' /proc/stat) && \
mem=$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2}
  END{printf "%d %d", t-a, t}' /proc/meminfo) && \
disk=$(df / 2>/dev/null | awk 'NR==2{
  gsub(/%/,"",$5); printf "%d %d %d",$3,$2,$5
}') && \
temp=$(awk '{printf "%.1f",$1/1000}' /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0) && \
uptime=$(awk '{printf "%.0f",$1}' /proc/uptime) && \
load=$(awk '{printf "%s %s %s",$1,$2,$3}' /proc/loadavg) && \
echo "$cpu|$mem|$disk|$temp|$uptime|$load"
`.replace(/\n/g, ' ').trim();

const SERVICE_CMD = name =>
  `systemctl is-active ${name} 2>/dev/null || echo inactive`;

/**
 * Collect current metrics from a Pi via SSH.
 * Returns a metrics object or null on failure.
 */
async function collectMetrics(pi) {
  try {
    const { stdout } = await sshPool.exec(pi.id, METRICS_CMD, 15_000);
    const parts = stdout.split('|');
    if (parts.length < 6) throw new Error('Unexpected metrics output');

    const cpu = parseFloat(parts[0]) || 0;
    const [memUsedKb, memTotalKb] = parts[1].trim().split(' ').map(Number);
    const [diskUsedKb, diskTotalKb, diskPct] = parts[2].trim().split(' ').map(Number);
    const temp = parseFloat(parts[3]) || 0;
    const uptime = parseInt(parts[4], 10) || 0;
    const [load1, load5, load15] = parts[5].trim().split(' ').map(parseFloat);

    return {
      cpu_percent:   cpu,
      mem_used_mb:   Math.round(memUsedKb / 1024),
      mem_total_mb:  Math.round(memTotalKb / 1024),
      disk_used_pct: diskPct,
      disk_used_gb:  parseFloat((diskUsedKb / 1024 / 1024).toFixed(2)),
      disk_total_gb: parseFloat((diskTotalKb / 1024 / 1024).toFixed(2)),
      temperature_c: temp,
      load_1:        load1,
      load_5:        load5,
      load_15:       load15,
      uptime_s:      uptime,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Collect service statuses for a Pi.
 * Returns { serviceName: 'active'|'inactive'|'failed'|'unknown' }
 */
async function collectServices(pi) {
  if (!pi.services?.length) return {};

  const cmd = pi.services
    .map(s => `printf "${s}="; systemctl is-active ${s} 2>/dev/null || echo inactive`)
    .join('; ');

  try {
    const { stdout } = await sshPool.exec(pi.id, cmd, 20_000);
    const result = {};
    for (const line of stdout.split('\n')) {
      const [name, status] = line.split('=');
      if (name && status) result[name.trim()] = status.trim();
    }
    return result;
  } catch {
    return Object.fromEntries(pi.services.map(s => [s, 'unknown']));
  }
}

/**
 * Store a metrics snapshot in SQLite.
 */
function saveMetrics(piId, metrics) {
  stmts.insertMetric.run({ pi_id: piId, ...metrics });
}

/**
 * Retrieve historical metrics for a Pi.
 * @param {string} piId
 * @param {number} hours - how many hours back to retrieve
 */
function getHistory(piId, hours = 24) {
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  return stmts.getMetrics.all(piId, since);
}

/**
 * Delete metrics older than retentionDays.
 */
function pruneOldMetrics(retentionDays = 30) {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
  stmts.pruneMetrics.run(cutoff);
}

/**
 * Control a systemd service. action: start|stop|restart
 * Requires the SSH user to have passwordless sudo for systemctl.
 */
async function controlService(pi, serviceName, action) {
  const allowed = ['start', 'stop', 'restart'];
  if (!allowed.includes(action)) throw new Error(`Invalid action: ${action}`);

  // Sanitise service name (alphanumeric, dashes, dots, @, :)
  if (!/^[\w\-.@:]+$/.test(serviceName)) {
    throw new Error(`Invalid service name: ${serviceName}`);
  }

  const { code, stderr } = await sshPool.exec(
    pi.id,
    `sudo systemctl ${action} ${serviceName}`,
    15_000
  );

  if (code !== 0) throw new Error(stderr || `systemctl ${action} failed (exit ${code})`);
}

/**
 * Reboot a Pi.
 */
async function rebootPi(pi) {
  await sshPool.exec(pi.id, 'sudo reboot', 5_000).catch(() => {});
  sshPool.disconnect(pi.id);
}

module.exports = {
  collectMetrics,
  collectServices,
  saveMetrics,
  getHistory,
  pruneOldMetrics,
  controlService,
  rebootPi,
};
