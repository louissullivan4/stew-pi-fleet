import React, { useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const COLORS = {
  cpu:   '#33b1ff',
  mem:   '#8a3ffc',
  disk:  '#08bdba',
  temp:  '#ff7eb6',
};

const CHART_STYLE = {
  background:  '#262626',
  border:      '1px solid #393939',
  borderRadius: 0,
  color:       '#c6c6c6',
  fontSize:    11,
};

function formatTime(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#393939',
      border: '1px solid #525252',
      padding: '0.5rem 0.75rem',
      fontSize: 11,
      color: '#f4f4f4',
    }}>
      <p style={{ margin: '0 0 0.5rem', color: '#8d8d8d' }}>{formatTime(label)}</p>
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

export function CpuMemChart({ data }) {
  const points = useMemo(
    () => data.map(r => ({
      t:   r.collected_at,
      cpu: r.cpu_percent,
      mem: r.mem_total_mb > 0
        ? Math.round((r.mem_used_mb / r.mem_total_mb) * 100)
        : 0,
    })),
    [data]
  );

  return (
    <div className="chart-panel">
      <p className="chart-panel__title">CPU &amp; Memory (%)</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {chartGradient('gcpu', COLORS.cpu)}
            {chartGradient('gmem', COLORS.mem)}
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="t" {...AXIS_PROPS} tickFormatter={formatTime} minTickGap={60} />
          <YAxis {...AXIS_PROPS} domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#8d8d8d' }} />
          <Area
            type="monotone" dataKey="cpu" name="CPU" unit="%"
            stroke={COLORS.cpu} fill="url(#gcpu)" strokeWidth={1.5} dot={false}
          />
          <Area
            type="monotone" dataKey="mem" name="Memory" unit="%"
            stroke={COLORS.mem} fill="url(#gmem)" strokeWidth={1.5} dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DiskTempChart({ data }) {
  const points = useMemo(
    () => data.map(r => ({
      t:    r.collected_at,
      disk: r.disk_used_pct,
      temp: r.temperature_c,
    })),
    [data]
  );

  const hasTemp = points.some(p => p.temp > 0);

  return (
    <div className="chart-panel">
      <p className="chart-panel__title">Disk (%) {hasTemp && '& Temperature (°C)'}</p>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={points} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <defs>
            {chartGradient('gdisk', COLORS.disk)}
            {chartGradient('gtemp', COLORS.temp)}
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="t" {...AXIS_PROPS} tickFormatter={formatTime} minTickGap={60} />
          <YAxis {...AXIS_PROPS} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#8d8d8d' }} />
          <Area
            type="monotone" dataKey="disk" name="Disk" unit="%"
            stroke={COLORS.disk} fill="url(#gdisk)" strokeWidth={1.5} dot={false}
          />
          {hasTemp && (
            <Area
              type="monotone" dataKey="temp" name="Temp" unit="°C"
              stroke={COLORS.temp} fill="url(#gtemp)" strokeWidth={1.5} dot={false}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
