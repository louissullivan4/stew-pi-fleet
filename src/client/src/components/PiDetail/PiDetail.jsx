import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Tabs, TabList, Tab, TabPanels, TabPanel,
  Button, Tag, Loading, InlineNotification, Modal,
} from '@carbon/react';
import {
  ArrowLeft, Renew, Power, ChartArea, List, Terminal as TerminalIcon, Time,
  Network_1, Home, MediaPlayer, DataStorage, Cpu,
} from '@carbon/icons-react';
import { pis as pisApi } from '../../api';
import { CpuMemChart, DiskTempChart } from './MetricsChart';
import ServiceList from './ServiceList';
import SchedulePanel from './SchedulePanel';
import Terminal from '../Terminal/Terminal';

const ROLE_ICONS = {
  network:           Network_1,
  'home-automation': Home,
  media:             MediaPlayer,
  storage:           DataStorage,
  'ai-brain':        Cpu,
};

function formatBytes(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

function StatTile({ label, value, unit }) {
  return (
    <div className="stat-tile">
      <p className="stat-tile__label">{label}</p>
      <p className="stat-tile__value" style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
        {value}
        {unit && <span className="stat-tile__unit">{unit}</span>}
      </p>
    </div>
  );
}

export default function PiDetail() {
  const { id } = useParams();

  const [pi, setPi]               = useState(null);
  const [history, setHistory]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [rebootModal, setRebootModal] = useState(false);
  const [rebooting, setRebooting] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const [detail, hist] = await Promise.all([
        pisApi.get(id),
        pisApi.getMetrics(id, 24),
      ]);
      setPi(detail);
      setHistory(hist);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh metrics every 60 seconds while on this page
  useEffect(() => {
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  const handleReboot = async () => {
    setRebooting(true);
    try {
      await pisApi.reboot(id);
      setRebootModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setRebooting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loading description="Loading Pi details…" withOverlay={false} />
      </div>
    );
  }

  if (error && !pi) {
    return (
      <div style={{ padding: '1.5rem' }}>
        <InlineNotification kind="error" title="Error" subtitle={error} lowContrast />
      </div>
    );
  }

  if (!pi) return null;

  const { metrics, serviceStatuses, online } = pi;
  const RoleIcon = ROLE_ICONS[pi.role] || Cpu;

  return (
    <div className="detail-page">
      {/* Breadcrumb / back */}
      <div style={{ marginBottom: '1rem' }}>
        <Button as={Link} to="/dashboard" kind="ghost" size="sm" renderIcon={ArrowLeft}>
          All Pis
        </Button>
      </div>

      {error && (
        <InlineNotification
          kind="error" title="Error" subtitle={error} lowContrast
          style={{ marginBottom: '1rem' }} onClose={() => setError('')}
        />
      )}

      {/* Header */}
      <div className="detail-page__header">
        <RoleIcon size={32} style={{ color: '#8d8d8d', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <h1 className="detail-page__title">{pi.name}</h1>
          <p className="detail-page__subtitle">{pi.ip}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className={`online-dot online-dot--${online === true ? 'online' : online === false ? 'offline' : 'unknown'}`} />
          <Tag type={online === true ? 'green' : online === false ? 'red' : 'gray'} size="sm">
            {online === true ? 'Online' : online === false ? 'Offline' : 'Unknown'}
          </Tag>
          <Tag type="outline" size="sm">{pi.role}</Tag>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            kind="ghost" size="sm"
            renderIcon={Renew}
            iconDescription="Refresh"
            hasIconOnly
            onClick={() => load(true)}
            disabled={refreshing}
          />
          <Button
            kind="danger--ghost" size="sm"
            renderIcon={Power}
            onClick={() => setRebootModal(true)}
            disabled={online !== true}
          >
            Reboot
          </Button>
        </div>
      </div>

      {/* Quick stats */}
      {metrics && (
        <div className="stat-grid">
          <StatTile label="CPU" value={metrics.cpu_percent?.toFixed(1)} unit="%" />
          <StatTile
            label="Memory"
            value={`${formatBytes(metrics.mem_used_mb)} / ${formatBytes(metrics.mem_total_mb)}`}
          />
          <StatTile label="Disk" value={metrics.disk_used_pct?.toFixed(0)} unit="%" />
          {metrics.temperature_c > 0 && (
            <StatTile label="Temp" value={metrics.temperature_c?.toFixed(1)} unit="°C" />
          )}
          <StatTile label="Load" value={metrics.load_1?.toFixed(2)} />
          <StatTile label="Uptime" value={formatUptime(metrics.uptime_s)} />
        </div>
      )}

      {/* Tabs */}
      <Tabs>
        <TabList aria-label="Pi detail sections" contained>
          <Tab renderIcon={ChartArea}>Metrics</Tab>
          <Tab renderIcon={List}>Services</Tab>
          <Tab renderIcon={TerminalIcon}>Terminal</Tab>
          <Tab renderIcon={Time}>Schedules</Tab>
        </TabList>

        <TabPanels>
          {/* Metrics */}
          <TabPanel style={{ padding: '1rem 0' }}>
            {history.length > 0 ? (
              <>
                <CpuMemChart  data={history} />
                <DiskTempChart data={history} />
              </>
            ) : (
              <p style={{ color: '#8d8d8d', fontSize: '0.875rem' }}>
                No historical data yet. Metrics are collected on each health-check interval.
              </p>
            )}
          </TabPanel>

          {/* Services */}
          <TabPanel style={{ padding: '1rem 0' }}>
            <ServiceList pi={pi} initialStatuses={serviceStatuses} />
          </TabPanel>

          {/* Terminal */}
          <TabPanel style={{ padding: '1rem 0' }}>
            {online === true
              ? <Terminal piId={pi.id} piName={pi.name} />
              : <p style={{ color: '#8d8d8d', fontSize: '0.875rem' }}>
                  Terminal unavailable — host is offline.
                </p>
            }
          </TabPanel>

          {/* Schedules */}
          <TabPanel style={{ padding: '1rem 0' }}>
            <SchedulePanel pi={pi} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Reboot confirmation modal */}
      <Modal
        open={rebootModal}
        danger
        modalHeading={`Reboot ${pi.name}?`}
        primaryButtonText={rebooting ? 'Rebooting…' : 'Reboot'}
        secondaryButtonText="Cancel"
        onRequestClose={() => setRebootModal(false)}
        onRequestSubmit={handleReboot}
        primaryButtonDisabled={rebooting}
      >
        <p>
          This will immediately reboot <strong>{pi.name}</strong> ({pi.ip}).
          All running services will be interrupted.
        </p>
      </Modal>
    </div>
  );
}
