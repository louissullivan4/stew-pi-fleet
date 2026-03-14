'use strict';

const router = require('express').Router();
const { requireAuth } = require('../auth');
const { stmts } = require('../db');
const { pingHost } = require('../services/ping');
const {
  collectMetrics,
  collectServices,
  saveMetrics,
  getHistory,
  controlService,
  rebootPi,
} = require('../services/metrics');
const scheduler = require('../services/scheduler');
const notifier = require('../services/notifier');

// All Pi routes require authentication
router.use(requireAuth);

// Config is injected by the server at startup
let _pis = [];
function configure(pis) { _pis = pis; }

function findPi(id) {
  const pi = _pis.find(p => p.id === id);
  if (!pi) throw Object.assign(new Error('Pi not found'), { status: 404 });
  return pi;
}

// ─── List all Pis with their current status ──────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const onlineStates = scheduler.getOnlineStates();
    const pis = _pis.map(pi => {
      const latest = stmts.getLatestMetric.get(pi.id);
      return {
        id:       pi.id,
        name:     pi.name,
        ip:       pi.ip,
        role:     pi.role,
        services: pi.services || [],
        online:   onlineStates[pi.id] ?? null,
        metrics:  latest || null,
        serviceStatuses: scheduler.getLastServiceState(pi.id),
      };
    });
    res.json(pis);
  } catch (err) { next(err); }
});

// ─── Single Pi ────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res, next) => {
  try {
    const pi = findPi(req.params.id);
    const [isOnline, metrics, services] = await Promise.allSettled([
      pingHost(pi.ip, pi.ssh_port || 22),
      collectMetrics(pi),
      collectServices(pi),
    ]);

    const metricsData = metrics.status === 'fulfilled' ? metrics.value : null;
    if (metricsData) saveMetrics(pi.id, metricsData);

    res.json({
      ...pi,
      online:          isOnline.value ?? false,
      metrics:         metricsData,
      serviceStatuses: services.status === 'fulfilled' ? services.value : {},
    });
  } catch (err) { next(err); }
});

// ─── Metrics history ─────────────────────────────────────────────────────────

router.get('/:id/metrics', (req, res, next) => {
  try {
    findPi(req.params.id);
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 168);
    res.json(getHistory(req.params.id, hours));
  } catch (err) { next(err); }
});

// ─── Current live metrics (on-demand) ────────────────────────────────────────

router.get('/:id/metrics/current', async (req, res, next) => {
  try {
    const pi = findPi(req.params.id);
    const metrics = await collectMetrics(pi);
    if (!metrics) return res.status(503).json({ error: 'Could not collect metrics' });
    saveMetrics(pi.id, metrics);
    res.json(metrics);
  } catch (err) { next(err); }
});

// ─── Service status ───────────────────────────────────────────────────────────

router.get('/:id/services', async (req, res, next) => {
  try {
    const pi = findPi(req.params.id);
    const statuses = await collectServices(pi);
    res.json(statuses);
  } catch (err) { next(err); }
});

// ─── Service control ─────────────────────────────────────────────────────────

router.post('/:id/services/:service/:action', async (req, res, next) => {
  try {
    const pi = findPi(req.params.id);
    const { service, action } = req.params;

    await controlService(pi, service, action);

    notifier.info(
      pi.id,
      `Service ${action} on ${pi.name}`,
      `${service} was ${action}ed by ${req.user.sub}.`
    );

    res.json({ success: true, service, action });
  } catch (err) { next(err); }
});

// ─── Reboot ───────────────────────────────────────────────────────────────────

router.post('/:id/reboot', async (req, res, next) => {
  try {
    const pi = findPi(req.params.id);
    notifier.info(pi.id, `Rebooting ${pi.name}`, `Reboot initiated by ${req.user.sub}.`);
    res.json({ success: true, message: `Reboot command sent to ${pi.name}` });
    rebootPi(pi).catch(() => {});
  } catch (err) { next(err); }
});

module.exports = { router, configure };
