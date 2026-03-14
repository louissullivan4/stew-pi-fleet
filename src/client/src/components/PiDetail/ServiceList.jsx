import React, { useState } from 'react';
import {
  Button, Tag, Loading, InlineNotification, OverflowMenu, OverflowMenuItem,
} from '@carbon/react';
import { Play, Stop, Restart } from '@carbon/icons-react';
import { pis as pisApi } from '../../api';

const STATUS_TAG = {
  active:   { type: 'green',  label: 'Active' },
  inactive: { type: 'gray',   label: 'Inactive' },
  failed:   { type: 'red',    label: 'Failed' },
  unknown:  { type: 'outline', label: 'Unknown' },
};

function ActionButton({ icon: Icon, label, onClick, disabled, kind = 'ghost' }) {
  return (
    <Button
      kind={kind}
      size="sm"
      renderIcon={Icon}
      iconDescription={label}
      hasIconOnly
      tooltipPosition="top"
      onClick={onClick}
      disabled={disabled}
    />
  );
}

export default function ServiceList({ pi, initialStatuses = {} }) {
  const [statuses, setStatuses]   = useState(initialStatuses);
  const [pending, setPending]     = useState({}); // serviceName -> true
  const [error, setError]         = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const services = pi.services || [];

  const runAction = async (service, action) => {
    setPending(p => ({ ...p, [service]: true }));
    setError('');
    try {
      await pisApi.serviceAction(pi.id, service, action);
      // Re-fetch statuses after action
      await refresh();
    } catch (err) {
      setError(`Failed to ${action} ${service}: ${err.message}`);
    } finally {
      setPending(p => ({ ...p, [service]: false }));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const fresh = await pisApi.getServices(pi.id);
      setStatuses(fresh);
    } catch {
      /* keep old */
    } finally {
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    setStatuses(initialStatuses);
  }, [initialStatuses]);

  if (services.length === 0) {
    return (
      <p style={{ color: '#8d8d8d', fontSize: '0.875rem', padding: '1rem 0' }}>
        No services configured for this Pi.
      </p>
    );
  }

  return (
    <div>
      {error && (
        <InlineNotification
          kind="error"
          title="Action failed"
          subtitle={error}
          lowContrast
          style={{ marginBottom: '1rem' }}
          onClose={() => setError('')}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75rem' }}>
        <Button kind="ghost" size="sm" onClick={refresh} disabled={refreshing}>
          {refreshing ? <Loading small withOverlay={false} /> : 'Refresh statuses'}
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: '#393939' }}>
        {services.map(svc => {
          const status = statuses[svc] || 'unknown';
          const { type, label } = STATUS_TAG[status] || STATUS_TAG.unknown;
          const isPending = !!pending[svc];
          const isActive  = status === 'active';

          return (
            <div
              key={svc}
              style={{
                display:         'flex',
                alignItems:      'center',
                background:      '#262626',
                padding:         '0.75rem 1rem',
                gap:             '1rem',
              }}
            >
              {/* Service name */}
              <span style={{
                flex: 1,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: '0.875rem',
                color: '#f4f4f4',
              }}>
                {svc}
              </span>

              {/* Status badge */}
              <Tag type={type} size="sm">{label}</Tag>

              {/* Controls */}
              <div className="service-actions">
                {isPending
                  ? <Loading small withOverlay={false} style={{ width: 20, height: 20 }} />
                  : (
                    <>
                      <ActionButton
                        icon={Play}
                        label="Start"
                        onClick={() => runAction(svc, 'start')}
                        disabled={isActive}
                      />
                      <ActionButton
                        icon={Stop}
                        label="Stop"
                        onClick={() => runAction(svc, 'stop')}
                        disabled={!isActive}
                      />
                      <ActionButton
                        icon={Restart}
                        label="Restart"
                        onClick={() => runAction(svc, 'restart')}
                      />
                    </>
                  )
                }
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
