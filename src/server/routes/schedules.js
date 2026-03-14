'use strict';

const router = require('express').Router();
const cron = require('node-cron');
const { requireAuth } = require('../auth');
const { stmts } = require('../db');
const scheduler = require('../services/scheduler');

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(stmts.getSchedules.all());
});

router.get('/:piId', (req, res) => {
  res.json(stmts.getSchedulesByPi.all(req.params.piId));
});

router.post('/', (req, res) => {
  const { pi_id, action_type, cron_expression, label } = req.body;

  if (!pi_id || !action_type || !cron_expression) {
    return res.status(400).json({ error: 'pi_id, action_type, and cron_expression are required' });
  }
  if (!cron.validate(cron_expression)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  const allowed = ['reboot', 'update-check', 'custom'];
  if (!allowed.includes(action_type)) {
    return res.status(400).json({ error: `action_type must be one of: ${allowed.join(', ')}` });
  }

  const result = stmts.insertSchedule.run({
    pi_id,
    action_type,
    cron_expression,
    enabled: 1,
    label: label || null,
  });

  const sched = stmts.getSchedule.get(result.lastInsertRowid);
  scheduler.registerScheduledAction(sched);

  res.status(201).json(sched);
});

router.put('/:id', (req, res) => {
  const { cron_expression, enabled, label } = req.body;
  const id = parseInt(req.params.id, 10);

  const existing = stmts.getSchedule.get(id);
  if (!existing) return res.status(404).json({ error: 'Schedule not found' });

  if (cron_expression && !cron.validate(cron_expression)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  stmts.updateSchedule.run({
    id,
    cron_expression: cron_expression ?? existing.cron_expression,
    enabled:         enabled !== undefined ? (enabled ? 1 : 0) : existing.enabled,
    label:           label !== undefined ? label : existing.label,
  });

  // Re-register with new settings
  scheduler.unregisterScheduledAction(id);
  const updated = stmts.getSchedule.get(id);
  if (updated.enabled) scheduler.registerScheduledAction(updated);

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  scheduler.unregisterScheduledAction(id);
  stmts.deleteSchedule.run(id);
  res.json({ success: true });
});

module.exports = router;
