'use strict';

const router = require('express').Router();
const { signToken, verifyCredentials, requireAuth } = require('../auth');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  const ok = await verifyCredentials(username, password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken(username);
  res.json({ token, username });
});

router.get('/verify', requireAuth, (req, res) => {
  res.json({ username: req.user.sub });
});

module.exports = router;
