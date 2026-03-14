import React from 'react';
import { Link } from 'react-router-dom';
import { Tag } from '@carbon/react';

const ROLE_COLORS = {
  network:           'blue',
  'home-automation': 'green',
  media:             'purple',
  storage:           'teal',
  'ai-brain':        'magenta',
};

function metricColor(value, warn = 70, crit = 90) {
  if (value >= crit) return '#fa4d56';
  if (value >= warn) return '#f1c21b';
  return '#42be65';
}

function MetricRow({ label, value, max = 100, unit = '%' }) {
  const pct = Math.min((value / max) * 100, 100);
  const color = metricColor(pct, 70, 90);

  return (
    <div className="metric-row">
      <span className="metric-row__label">{label}</span>
      <div className="metric-bar">
        <div
          className="metric-bar__fill"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="metric-row__value">
        {typeof value === 'number' ? `${value.toFixed(0)}${unit}` : '—'}
      </span>
    </div>
  );
}

function ServiceDot({ name, status }) {
  const colors = {
    active:   '#42be65',
    inactive: '#8d8d8d',
    failed:   '#fa4d56',
    unknown:  '#6f6f6f',
  };
  return (
    <span
      title={`${name}: ${status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: '0.6875rem',
        color: '#8d8d8d',
      }}
    >
      <span
        style={{
          width: 6, height: 6,
          borderRadius: '50%',
          backgroundColor: colors[status] || colors.unknown,
          flexShrink: 0,
        }}
      />
      {name}
    </span>
  );
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function PiCard({ pi }) {
  const { id, name, ip, role, online, metrics, serviceStatuses = {} } = pi;

  const statusClass = online === true ? '' : online === false ? 'pi-card--offline' : '';

  return (
    <Link to={`/pi/${id}`} className={`pi-card ${statusClass}`}>
      {/* Header row */}
      <div className="pi-card__header">
        <div>
          <p className="pi-card__name">{name}</p>
          <p className="pi-card__ip">{ip}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem' }}>
          <span
            className={`online-dot online-dot--${
              online === true ? 'online' : online === false ? 'offline' : 'unknown'
            }`}
          />
          <span style={{ fontSize: '0.6875rem', color: '#8d8d8d' }}>
            {online === true ? 'Online' : online === false ? 'Offline' : 'Unknown'}
          </span>
        </div>
      </div>

      {/* Role tag */}
      <div className="pi-card__role">
        <Tag type={ROLE_COLORS[role] || 'gray'} size="sm">{role}</Tag>
        {metrics?.uptime_s > 0 && (
          <span style={{ fontSize: '0.6875rem', color: '#8d8d8d', marginLeft: '0.5rem' }}>
            up {formatUptime(metrics.uptime_s)}
          </span>
        )}
      </div>

      {/* Metric bars */}
      {metrics ? (
        <div className="pi-card__metrics">
          <MetricRow label="CPU"  value={metrics.cpu_percent} />
          <MetricRow
            label="RAM"
            value={Math.round((metrics.mem_used_mb / metrics.mem_total_mb) * 100)}
          />
          <MetricRow label="Disk" value={metrics.disk_used_pct} />
          {metrics.temperature_c > 0 && (
            <MetricRow
              label="Temp"
              value={metrics.temperature_c}
              max={100}
              unit="°C"
            />
          )}
        </div>
      ) : (
        <div style={{ padding: '0.75rem 0', color: '#6f6f6f', fontSize: '0.75rem' }}>
          {online === false ? 'No metrics — host unreachable' : 'Waiting for metrics…'}
        </div>
      )}

      {/* Service health dots */}
      {Object.keys(serviceStatuses).length > 0 && (
        <div className="pi-card__services">
          {Object.entries(serviceStatuses).map(([name, status]) => (
            <ServiceDot key={name} name={name} status={status} />
          ))}
        </div>
      )}
    </Link>
  );
}
