'use strict';

const net = require('net');

/**
 * Test reachability by attempting a TCP connection on the Pi's SSH port.
 * Uses TCP rather than ICMP so no elevated privileges are needed.
 */
function pingHost(host, port = 22, timeout = 5000) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    let done = false;

    const finish = result => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));

    socket.connect(port, host);
  });
}

/**
 * Ping all Pis in parallel. Returns a Map<piId, boolean>.
 */
async function pingAll(pis) {
  const results = await Promise.allSettled(
    pis.map(pi =>
      pingHost(pi.ip, pi.ssh_port || 22).then(online => ({ piId: pi.id, online }))
    )
  );

  const map = new Map();
  for (const r of results) {
    if (r.status === 'fulfilled') {
      map.set(r.value.piId, r.value.online);
    }
  }
  return map;
}

module.exports = { pingHost, pingAll };
