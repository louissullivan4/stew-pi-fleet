const BASE = '/api';

function getToken() {
  return localStorage.getItem('pi_fleet_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);

  if (res.status === 401) {
    localStorage.removeItem('pi_fleet_token');
    window.location.href = '/login';
    throw new Error('Unauthorised');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export const auth = {
  login:  (username, password) => request('POST', '/auth/login', { username, password }),
  verify: ()                   => request('GET',  '/auth/verify'),
  logout: ()                   => { localStorage.removeItem('pi_fleet_token'); },
};

// ─── Pis ──────────────────────────────────────────────────────────────────

export const pis = {
  list:           ()                => request('GET',  '/pis'),
  get:            id                => request('GET',  `/pis/${id}`),
  getMetrics:     (id, hours = 24)  => request('GET',  `/pis/${id}/metrics?hours=${hours}`),
  getLiveMetrics: id                => request('GET',  `/pis/${id}/metrics/current`),
  getServices:    id                => request('GET',  `/pis/${id}/services`),
  serviceAction:  (id, svc, action) => request('POST', `/pis/${id}/services/${svc}/${action}`),
  reboot:         id                => request('POST', `/pis/${id}/reboot`),
};

// ─── Notifications ────────────────────────────────────────────────────────

export const notifications = {
  list:     (limit = 50, offset = 0) => request('GET',  `/notifications?limit=${limit}&offset=${offset}`),
  markRead: id                        => request('PUT',  `/notifications/${id}/read`),
  markAll:  ()                        => request('PUT',  '/notifications/read-all'),
  remove:   id                        => request('DELETE', `/notifications/${id}`),
};

// ─── Schedules ────────────────────────────────────────────────────────────

export const schedules = {
  list:   ()      => request('GET',    '/schedules'),
  forPi:  piId    => request('GET',    `/schedules/${piId}`),
  create: data    => request('POST',   '/schedules', data),
  update: (id, d) => request('PUT',    `/schedules/${id}`, d),
  remove: id      => request('DELETE', `/schedules/${id}`),
};

// ─── Config ───────────────────────────────────────────────────────────────

export const config = {
  get: () => request('GET', '/config'),
};

// ─── SSE event stream ─────────────────────────────────────────────────────

export function openEventStream(onNotification, onError) {
  const token = getToken();
  const es = new EventSource(`${BASE}/events`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  es.addEventListener('notification', e => {
    try { onNotification(JSON.parse(e.data)); } catch {}
  });

  es.onerror = onError;
  return es;
}

// ─── WebSocket terminal ───────────────────────────────────────────────────

export function openTerminalSocket(piId) {
  const token   = getToken();
  const proto   = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl   = `${proto}://${location.host}/ws/terminal/${piId}?token=${encodeURIComponent(token)}`;
  return new WebSocket(wsUrl);
}
