import React, { useState, useEffect } from 'react';
import {
  Button, Select, SelectItem, TextInput, Toggle,
  InlineNotification, Loading,
} from '@carbon/react';
import { Add, TrashCan } from '@carbon/icons-react';
import { schedules as schedulesApi } from '../../api';

const ACTION_TYPES = [
  { value: 'reboot',       label: 'Automatic Reboot' },
  { value: 'update-check', label: 'Update Check' },
];

const CRON_PRESETS = [
  { label: 'Every night at 3am',   value: '0 3 * * *' },
  { label: 'Every Sunday at 4am',  value: '0 4 * * 0' },
  { label: 'Every day at midnight',value: '0 0 * * *' },
  { label: 'Every 6 hours',        value: '0 */6 * * *' },
  { label: 'Custom…',              value: 'custom' },
];

function formatNextRun(sched) {
  if (!sched.last_run_at) return 'Never run';
  return `Last: ${new Date(sched.last_run_at * 1000).toLocaleString()}`;
}

export default function SchedulePanel({ pi }) {
  const [scheduleList, setScheduleList] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [showForm, setShowForm]         = useState(false);
  const [error, setError]               = useState('');

  const [actionType, setActionType]     = useState('reboot');
  const [cronPreset, setCronPreset]     = useState('0 3 * * *');
  const [cronCustom, setCronCustom]     = useState('');
  const [label, setLabel]               = useState('');
  const [saving, setSaving]             = useState(false);

  const isCustom = cronPreset === 'custom';
  const cronExpr = isCustom ? cronCustom : cronPreset;

  useEffect(() => {
    load();
  }, [pi.id]);

  async function load() {
    setLoading(true);
    try {
      const data = await schedulesApi.forPi(pi.id);
      setScheduleList(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await schedulesApi.create({
        pi_id:           pi.id,
        action_type:     actionType,
        cron_expression: cronExpr,
        label:           label || null,
        enabled:         true,
      });
      setShowForm(false);
      setLabel('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(sched, enabled) {
    try {
      await schedulesApi.update(sched.id, { enabled });
      setScheduleList(list => list.map(s => s.id === sched.id ? { ...s, enabled: enabled ? 1 : 0 } : s));
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await schedulesApi.remove(id);
      setScheduleList(list => list.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) {
    return <Loading description="Loading schedules…" withOverlay={false} small />;
  }

  return (
    <div style={{ paddingBottom: '1rem' }}>
      {error && (
        <InlineNotification
          kind="error"
          title="Error"
          subtitle={error}
          lowContrast
          onClose={() => setError('')}
          style={{ marginBottom: '1rem' }}
        />
      )}

      {/* Existing schedules */}
      {scheduleList.length === 0 && !showForm && (
        <p style={{ color: '#8d8d8d', fontSize: '0.875rem', marginBottom: '1rem' }}>
          No scheduled actions configured.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#393939', marginBottom: '1rem' }}>
        {scheduleList.map(sched => (
          <div
            key={sched.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              background: '#262626', padding: '0.875rem 1rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#f4f4f4', fontWeight: 500 }}>
                {sched.label || ACTION_TYPES.find(a => a.value === sched.action_type)?.label || sched.action_type}
              </p>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#8d8d8d', fontFamily: 'monospace' }}>
                {sched.cron_expression} · {formatNextRun(sched)}
                {sched.last_run_status && sched.last_run_status !== 'ok' && (
                  <span style={{ color: '#fa4d56', marginLeft: '0.5rem' }}>
                    ({sched.last_run_status})
                  </span>
                )}
              </p>
            </div>

            <Toggle
              id={`sched-toggle-${sched.id}`}
              size="sm"
              toggled={!!sched.enabled}
              onToggle={v => handleToggle(sched, v)}
              labelA="Off"
              labelB="On"
              hideLabel
            />

            <Button
              kind="ghost"
              size="sm"
              renderIcon={TrashCan}
              iconDescription="Delete"
              hasIconOnly
              tooltipPosition="top"
              onClick={() => handleDelete(sched.id)}
            />
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="schedule-form">
          <p className="schedule-form__title">New Scheduled Action</p>
          <form onSubmit={handleCreate}>
            <Select
              id="action-type"
              labelText="Action"
              value={actionType}
              onChange={e => setActionType(e.target.value)}
              style={{ marginBottom: '1rem' }}
            >
              {ACTION_TYPES.map(a => (
                <SelectItem key={a.value} value={a.value} text={a.label} />
              ))}
            </Select>

            <Select
              id="cron-preset"
              labelText="Schedule"
              value={cronPreset}
              onChange={e => setCronPreset(e.target.value)}
              style={{ marginBottom: isCustom ? '0.75rem' : '1rem' }}
            >
              {CRON_PRESETS.map(p => (
                <SelectItem key={p.value} value={p.value} text={p.label} />
              ))}
            </Select>

            {isCustom && (
              <TextInput
                id="cron-custom"
                labelText="Cron expression"
                placeholder="0 4 * * 0"
                value={cronCustom}
                onChange={e => setCronCustom(e.target.value)}
                helperText="Standard 5-field cron: minute hour dom month dow"
                style={{ marginBottom: '1rem' }}
              />
            )}

            <TextInput
              id="sched-label"
              labelText="Label (optional)"
              value={label}
              onChange={e => setLabel(e.target.value)}
              style={{ marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button type="submit" size="sm" disabled={saving || (!cronExpr && isCustom)}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <Button
          kind="tertiary"
          size="sm"
          renderIcon={Add}
          onClick={() => setShowForm(true)}
        >
          Add scheduled action
        </Button>
      )}
    </div>
  );
}
