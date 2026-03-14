import React, { useEffect, useRef, useState } from 'react';
import { Button, InlineNotification } from '@carbon/react';
import { Renew, Close } from '@carbon/icons-react';
import { openTerminalSocket } from '../../api';

// xterm is imported lazily to avoid SSR issues and keep the main bundle lighter.
let xtermLoaded = false;
let Terminal_, FitAddon_, WebLinksAddon_;

async function loadXterm() {
  if (xtermLoaded) return;
  const [xterm, fit, links] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-web-links'),
  ]);
  // Also load the xterm stylesheet once
  await import('@xterm/xterm/css/xterm.css');
  Terminal_      = xterm.Terminal;
  FitAddon_      = fit.FitAddon;
  WebLinksAddon_ = links.WebLinksAddon;
  xtermLoaded    = true;
}

export default function TerminalPanel({ piId, piName }) {
  const containerRef = useRef(null);
  const termRef      = useRef(null);
  const fitRef       = useRef(null);
  const wsRef        = useRef(null);
  const observerRef  = useRef(null);

  const [status, setStatus]   = useState('idle'); // idle|connecting|connected|error|closed
  const [error, setError]     = useState('');
  const [loaded, setLoaded]   = useState(false);

  // Load xterm dynamically, then mark ready
  useEffect(() => {
    loadXterm().then(() => setLoaded(true));
    return () => disconnect();
  }, []);

  function disconnect() {
    observerRef.current?.disconnect();
    try { wsRef.current?.close(); } catch {}
    try { termRef.current?.dispose(); } catch {}
    termRef.current = null;
    wsRef.current   = null;
  }

  function connect() {
    if (!loaded || !containerRef.current) return;
    disconnect();
    setError('');
    setStatus('connecting');

    // Create terminal
    const term = new Terminal_({
      theme: {
        background: '#0d0d0d',
        foreground: '#f4f4f4',
        cursor:     '#f4f4f4',
        black:      '#262626',
        red:        '#fa4d56',
        green:      '#42be65',
        yellow:     '#f1c21b',
        blue:       '#4589ff',
        magenta:    '#8a3ffc',
        cyan:       '#08bdba',
        white:      '#c6c6c6',
        brightBlack:  '#525252',
        brightRed:    '#ff8389',
        brightGreen:  '#6fdc8c',
        brightYellow: '#ffd966',
        brightBlue:   '#78a9ff',
        brightMagenta: '#be95ff',
        brightCyan:   '#3ddbd9',
        brightWhite:  '#f4f4f4',
      },
      fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace",
      fontSize:   14,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 2000,
    });

    const fitAddon  = new FitAddon_();
    const linksAddon = new WebLinksAddon_();
    term.loadAddon(fitAddon);
    term.loadAddon(linksAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    termRef.current = term;
    fitRef.current  = fitAddon;

    // Resize observer
    const obs = new ResizeObserver(() => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          cols: term.cols,
          rows: term.rows,
        }));
      }
    });
    obs.observe(containerRef.current);
    observerRef.current = obs;

    // Connect WebSocket
    const ws = openTerminalSocket(piId);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      // Send initial window size
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    };

    ws.onmessage = e => {
      if (typeof e.data === 'string') {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'error') {
            term.write(`\r\n\x1b[31mError: ${msg.message}\x1b[0m\r\n`);
            setError(msg.message);
            return;
          }
        } catch {}
        term.write(e.data);
      } else {
        e.data.arrayBuffer().then(buf => term.write(new Uint8Array(buf)));
      }
    };

    ws.onerror = () => {
      setStatus('error');
      setError('WebSocket connection error');
      term.write('\r\n\x1b[31mConnection error\x1b[0m\r\n');
    };

    ws.onclose = () => {
      setStatus('closed');
      term.write('\r\n\x1b[33m[Connection closed]\x1b[0m\r\n');
    };

    // Terminal → WebSocket
    term.onData(data => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'data', data }));
      }
    });
  }

  // Auto-connect once xterm is loaded
  useEffect(() => {
    if (loaded) connect();
  }, [loaded]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#8d8d8d' }}>
          {piName} — SSH terminal
        </span>
        <span style={{
          fontSize: '0.6875rem',
          padding: '0.1rem 0.4rem',
          background: status === 'connected' ? '#24a14820' : '#393939',
          color:      status === 'connected' ? '#42be65' : '#8d8d8d',
          fontFamily: 'monospace',
        }}>
          {status}
        </span>
        <div style={{ flex: 1 }} />
        <Button
          kind="ghost" size="sm"
          renderIcon={Renew}
          iconDescription="Reconnect"
          hasIconOnly
          onClick={connect}
          disabled={status === 'connecting'}
        />
        <Button
          kind="ghost" size="sm"
          renderIcon={Close}
          iconDescription="Disconnect"
          hasIconOnly
          onClick={disconnect}
          disabled={status === 'idle' || status === 'closed'}
        />
      </div>

      {error && (
        <InlineNotification
          kind="error"
          title="Terminal error"
          subtitle={error}
          lowContrast
          onClose={() => setError('')}
          style={{ marginBottom: '0.5rem' }}
        />
      )}

      <div
        ref={containerRef}
        className="terminal-wrapper"
        style={{ opacity: !loaded ? 0.3 : 1 }}
      />
    </div>
  );
}
