'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const fs         = require('fs');
const WebSocket  = require('ws');
const yaml       = require('js-yaml');
const compression = require('compression');
const cors       = require('cors');
const url        = require('url');

const { requireAuth, verifyWsToken } = require('./auth');
const authRoute          = require('./routes/auth');
const { router: pisRoute, configure: configurePisRoute } = require('./routes/pis');
const notificationsRoute = require('./routes/notifications');
const schedulesRoute     = require('./routes/schedules');
const sshPool            = require('./services/ssh-pool');
const scheduler          = require('./services/scheduler');
const notifier           = require('./services/notifier');

// ─── Load configuration ───────────────────────────────────────────────────────

const CONFIG_PATH = process.env.CONFIG_PATH
  || path.join(__dirname, '../../config/pis.yaml');

let config;
try {
  config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
  console.error(`[config] Failed to load ${CONFIG_PATH}: ${err.message}`);
  process.exit(1);
}

const pis      = config.pis      || [];
const settings = config.settings || {};

// Apply env var overrides from settings
if (settings.alert_cooldown_minutes)     process.env.ALERT_COOLDOWN_MINUTES   = String(settings.alert_cooldown_minutes);
if (settings.disk_alert_threshold)       process.env.DISK_ALERT_THRESHOLD     = String(settings.disk_alert_threshold);
if (settings.temperature_alert_threshold) process.env.TEMP_ALERT_THRESHOLD    = String(settings.temperature_alert_threshold);

// Wire config into services
sshPool.configure(pis);
configurePisRoute(pis);
scheduler.configure(pis);

console.log(`[config] Loaded ${pis.length} Pi(s) from ${CONFIG_PATH}`);

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();

app.use(compression());
app.use(cors({ origin: process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : false }));
app.use(express.json());

// Serve built React app in production
const CLIENT_DIST = path.join(__dirname, '../client/dist');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
}

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api/auth',          authRoute);
app.use('/api/pis',           pisRoute);
app.use('/api/notifications', notificationsRoute);
app.use('/api/schedules',     schedulesRoute);

// Config endpoint: expose Pi list (without credentials) + settings
app.get('/api/config', requireAuth, (req, res) => {
  res.json({
    pis: pis.map(({ id, name, ip, role, services, health_check_interval }) =>
      ({ id, name, ip, role, services, health_check_interval })
    ),
    settings,
  });
});

// SSE endpoint: real-time notification push
app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = ({ event, data }) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  notifier.subscribe(send);

  // Keepalive ping every 25 s
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(ping);
    notifier.unsubscribe(send);
  });
});

// SPA catch-all — serve index.html for all non-API routes
if (fs.existsSync(CLIENT_DIST)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    }
  });
}

// Error handler
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss    = new WebSocket.Server({ noServer: true });

// WebSocket upgrade — handle /ws/terminal/:piId?token=...
server.on('upgrade', (req, socket, head) => {
  const parsed = url.parse(req.url, true);
  const token  = parsed.query.token;

  if (!verifyWsToken(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  // Only accept /ws/terminal/:piId paths
  const match = parsed.pathname.match(/^\/ws\/terminal\/([^/]+)$/);
  if (!match) {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
    return;
  }

  req._piId = match[1];
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', async (ws, req) => {
  const piId = req._piId;
  const pi   = pis.find(p => p.id === piId);

  if (!pi) {
    ws.close(1008, 'Unknown Pi');
    return;
  }

  let sshStream;
  try {
    sshStream = await sshPool.shell(piId);
  } catch (err) {
    ws.send(JSON.stringify({ type: 'error', message: `SSH connection failed: ${err.message}` }));
    ws.close(1011, 'SSH error');
    return;
  }

  // SSH → WebSocket
  sshStream.on('data', data => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });
  sshStream.stderr.on('data', data => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });

  // WebSocket → SSH
  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'data')   sshStream.write(msg.data);
      if (msg.type === 'resize') sshStream.setWindow(msg.rows, msg.cols, 0, 0);
    } catch {
      sshStream.write(raw);
    }
  });

  const cleanup = () => {
    try { sshStream.close(); } catch {}
    try { ws.close(); } catch {}
  };

  sshStream.on('close', () => cleanup());
  ws.on('close', () => cleanup());
  ws.on('error', () => cleanup());
});

// ─── Boot ──────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 3001;
server.listen(PORT, () => {
  console.log(`[server] Pi Fleet running on http://0.0.0.0:${PORT}`);
  console.log(`[server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[server] ${signal} received — shutting down…`);
  scheduler.stopAll();
  sshPool.disconnectAll();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
