'use strict';

const router = require('express').Router();
const { requireAuth } = require('../auth');
const { stmts } = require('../db');

router.use(requireAuth);

router.get('/', (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit,  10) || 50, 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = stmts.getNotifications.all(limit, offset);
  const { count } = stmts.getUnreadCount.get();
  res.json({ notifications: rows, unread: count });
});

router.put('/read-all', (req, res) => {
  stmts.markAllRead.run();
  res.json({ success: true });
});

router.put('/:id/read', (req, res) => {
  stmts.markRead.run(parseInt(req.params.id, 10));
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  stmts.deleteNotification.run(parseInt(req.params.id, 10));
  res.json({ success: true });
});

module.exports = router;
