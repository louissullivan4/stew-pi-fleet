import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const COLORS = {
  cpu:   '#33b1ff',
  mem:   '#8a3ffc',
  disk:  '#08bdba',
  temp:  '#ff7eb6',
};

function formatTime(unixSeconds, hours) {
  const d = new Date(unixSeconds * 1000);
  if (hours <= 48) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (hours <= 168) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function CustomTooltip({ active, payload, label, hours }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#393939',
      border: '1px solid #525252',
      padding: '0.5rem 0.75rem',
      fontSize: 11,
      color: '#f4f4f4',
    }}>
      <p style={{ margin: '0 0 0.5rem', color: '#8d8d8d' }}>{formatTime(label, hours)}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ margin: '0.1rem 0', color: p.color }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}{p.unit}</strong>
        </p>
      ))}
    </div>
  );
}

function chartGradient(id, color) {
  return (
    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
      <stop offset="95%" stopColor={color} stopOpacity={0} />
    </linearGradient>
  );
}

const AXIS_PROPS = {
  stroke: 'transparent',
  tick: { fill: '#6f6f6f', fontSize: 10 },
};

const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: '#393939',
};

function niceMax(dataMax) {
  if (!dataMax || dataMax <= 0) return 10;
  return Math.max(10, Math.ceil(dataMax * 1.15 / 5) * 5);
}

function SingleChart({ title, points, dataKey, name, unit, color, gradientId, hours, noDataMsg }) {
  const hasData = points.some(p => p[dataKey] != null && p[dataKey] > 0);

  return (
    <div className="chart-panel">
      <p className="chart-panel__title">{title}</p>
      {!hasData && noDataMsg ? (
        <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: '#6f6f6f', fontSize: '0.75rem', margin: 0 }}>{noDataMsg}</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <defs>{chartGradient(gradientId, color)}</defs>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="t"
              {...AXIS_PROPS}
              tickFormatter={t => formatTime(t, hours)}
              minTickGap={60}
            />
            <YAxis
              {...AXIS_PROPS}
              domain={[0, dataMax => niceMax(dataMax)]}
            />
            <Tooltip content={<CustomTooltip hours={hours} />} />
            <Area
              type="monotone" dataKey={dataKey} name={name} unit={unit}
              stroke={color} fill={`url(#${gradientId})`} strokeWidth={1.5} dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function CpuChart({ data, hours }) {
  const points = useMemo(
    () => data.map(r => ({ t: r.collected_at, cpu: r.cpu_percent })),
    [data]
  );
  return (
    <SingleChart
      title="CPU (%)" points={points} dataKey="cpu" name="CPU" unit="%"
      color={COLORS.cpu} gradientId="gcpu" hours={hours}
    />
  );
}

export function MemChart({ data, hours }) {
  const points = useMemo(
    () => data.map(r => ({
      t: r.collected_at,
      mem: r.mem_total_mb > 0 ? Math.round((r.mem_used_mb / r.mem_total_mb) * 100) : 0,
    })),
    [data]
  );
  return (
    <SingleChart
      title="Memory (%)" points={points} dataKey="mem" name="Memory" unit="%"
      color={COLORS.mem} gradientId="gmem" hours={hours}
    />
  );
}

export function DiskChart({ data, hours }) {
  const points = useMemo(
    () => data.map(r => ({ t: r.collected_at, disk: r.disk_used_pct })),
    [data]
  );
  return (
    <SingleChart
      title="Disk (%)" points={points} dataKey="disk" name="Disk" unit="%"
      color={COLORS.disk} gradientId="gdisk" hours={hours}
    />
  );
}

export function TempChart({ data, hours }) {
  const points = useMemo(
    () => data.map(r => ({ t: r.collected_at, temp: r.temperature_c })),
    [data]
  );
  return (
    <SingleChart
      title="Temperature (°C)" points={points} dataKey="temp" name="Temp" unit="°C"
      color={COLORS.temp} gradientId="gtemp" hours={hours}
      noDataMsg="No temperature sensor data available"
    />
  );
}
