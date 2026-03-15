'use strict';

const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const DEFAULT_KEY_PATH = process.env.SSH_KEY_PATH || path.join(process.env.HOME || '/root', '.ssh/pi_fleet_rsa');
const CONNECT_TIMEOUT = 10_000;
const EXEC_TIMEOUT = 30_000;
const RECONNECT_DELAY = 15_000;

class SSHPool extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, { client: Client, status: string, config: object }>} */
    this._pool = new Map();
    /** @type {Map<string, object>} piId → pi config */
    this._configs = new Map();
    /** @type {Set<string>} piIds currently reconnecting */
    this._reconnecting = new Set();
  }

  /** Load Pi configurations from the config object. */
  configure(pis) {
    for (const pi of pis) {
      this._configs.set(pi.id, pi);
    }
  }

  /** Return current connection status for a Pi. */
  status(piId) {
    return this._pool.get(piId)?.status ?? 'disconnected';
  }

  /** Get or open a connection to a Pi. Resolves with the ssh2 Client. */
  async connect(piId) {
    const existing = this._pool.get(piId);
    if (existing?.status === 'connected') return existing.client;

    const pi = this._configs.get(piId);
    if (!pi) throw new Error(`Unknown Pi: ${piId}`);

    return this._open(pi);
  }

  /** Execute a command on a Pi, returns { stdout, stderr, code }. */
  async exec(piId, command, timeout = EXEC_TIMEOUT) {
    const client = await this.connect(piId);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`SSH exec timeout on ${piId}`)), timeout);

      client.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); return reject(err); }

        let stdout = '';
        let stderr = '';

        stream.on('data', d => { stdout += d; });
        stream.stderr.on('data', d => { stderr += d; });
        stream.on('close', code => {
          clearTimeout(timer);
          resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code });
        });
      });
    });
  }

  /** Open an interactive shell stream for terminal use. Prefers zsh, falls back to bash. */
  async shell(piId, windowOpts = { term: 'xterm-256color', cols: 80, rows: 24 }) {
    const client = await this.connect(piId);
    return new Promise((resolve, reject) => {
      client.exec('exec zsh || exec bash', { pty: windowOpts }, (err, stream) => {
        if (err) return reject(err);
        resolve(stream);
      });
    });
  }

  /** Close and remove one connection. */
  disconnect(piId) {
    const entry = this._pool.get(piId);
    if (entry) {
      try { entry.client.end(); } catch {}
      this._pool.delete(piId);
    }
  }

  /** Close all connections. */
  disconnectAll() {
    for (const piId of this._pool.keys()) this.disconnect(piId);
  }

  // ─── private ────────────────────────────────────────────────────────────────

  _open(pi) {
    return new Promise((resolve, reject) => {
      const client = new Client();
      const entry = { client, status: 'connecting', config: pi };
      this._pool.set(pi.id, entry);

      const connectCfg = {
        host:         pi.ip,
        port:         pi.ssh_port || 22,
        username:     pi.ssh_user,
        readyTimeout: CONNECT_TIMEOUT,
        keepaliveInterval: 10_000,
        keepaliveCountMax: 3,
      };

      // Key resolution order: per-Pi key → env key → default path
      const keyPath = pi.ssh_key_path || DEFAULT_KEY_PATH;
      if (keyPath && fs.existsSync(keyPath)) {
        connectCfg.privateKey = fs.readFileSync(keyPath);
      } else if (pi.ssh_password) {
        connectCfg.password = pi.ssh_password;
      } else {
        return reject(new Error(`No SSH credentials for ${pi.id}. Provide a key at ${keyPath}.`));
      }

      client.once('ready', () => {
        entry.status = 'connected';
        this.emit('connected', pi.id);
        resolve(client);
      });

      client.once('error', err => {
        entry.status = 'error';
        this.emit('error', { piId: pi.id, error: err });
        this._pool.delete(pi.id);
        reject(err);
        this._scheduleReconnect(pi);
      });

      const onClose = () => {
        entry.status = 'disconnected';
        this._pool.delete(pi.id);
        this.emit('disconnected', pi.id);
        this._scheduleReconnect(pi);
      };
      client.once('end', onClose);
      client.once('close', onClose);

      client.connect(connectCfg);
    });
  }

  _scheduleReconnect(pi) {
    if (this._reconnecting.has(pi.id)) return;
    this._reconnecting.add(pi.id);
    setTimeout(() => {
      this._reconnecting.delete(pi.id);
      if (!this._pool.has(pi.id)) {
        this._open(pi).catch(() => {}); // silently retry; errors emitted via event
      }
    }, RECONNECT_DELAY);
  }
}

module.exports = new SSHPool();
