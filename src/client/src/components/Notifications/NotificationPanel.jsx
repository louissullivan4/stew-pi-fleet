import React, { useState, useEffect } from 'react';
import { Button, Loading } from '@carbon/react';
import {
  Close, CheckmarkOutline, TrashCan,
  ErrorFilled, WarningFilled, InformationFilled, CheckmarkFilled,
} from '@carbon/icons-react';
import { notifications as notifApi } from '../../api';
import { useNotif } from '../../App';

const SEVERITY_ICON = {
  critical: ErrorFilled,
  warning:  WarningFilled,
  info:     InformationFilled,
};

const SEVERITY_COLOR = {
  critical: '#fa4d56',
  warning:  '#f1c21b',
  info:     '#4589ff',
};

function timeAgo(unixSeconds) {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function NotificationPanel() {
  const { closePanel, setUnreadCount } = useNotif();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    notifApi.list(100, 0).then(({ notifications, unread }) => {
      setItems(notifications);
      setUnreadCount(unread);
    }).finally(() => setLoading(false));
  }, []);

  const markAll = async () => {
    await notifApi.markAll();
    setItems(prev => prev.map(n => ({ ...n, read_at: Math.floor(Date.now() / 1000) })));
    setUnreadCount(0);
  };

  const markOne = async id => {
    await notifApi.markRead(id);
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: Math.floor(Date.now() / 1000) } : n));
    setUnreadCount(c => Math.max(0, c - 1));
  };

  const deleteOne = async id => {
    await notifApi.remove(id);
    setItems(prev => {
      const deleted = prev.find(n => n.id === id);
      if (deleted && !deleted.read_at) setUnreadCount(c => Math.max(0, c - 1));
      return prev.filter(n => n.id !== id);
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={closePanel}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 7999,
        }}
      />

      <div className="notification-panel">
        <div className="notification-panel__header">
          <p className="notification-panel__title">
            Notifications
            {items.filter(n => !n.read_at).length > 0 && (
              <span style={{
                marginLeft: '0.5rem',
                background: '#fa4d56',
                color: '#fff',
                borderRadius: '10px',
                padding: '0 0.4rem',
                fontSize: '0.6875rem',
              }}>
                {items.filter(n => !n.read_at).length}
              </span>
            )}
          </p>
          <div style={{ display: 'flex', gap: '0.25rem' }}>
            <Button
              kind="ghost" size="sm"
              renderIcon={CheckmarkOutline}
              iconDescription="Mark all read"
              hasIconOnly
              tooltipPosition="left"
              onClick={markAll}
              disabled={items.every(n => n.read_at)}
            />
            <Button
              kind="ghost" size="sm"
              renderIcon={Close}
              iconDescription="Close"
              hasIconOnly
              onClick={closePanel}
            />
          </div>
        </div>

        {loading && (
          <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
            <Loading small withOverlay={false} />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6f6f6f', fontSize: '0.875rem' }}>
            No notifications
          </div>
        )}

        {items.map(n => {
          const Icon = SEVERITY_ICON[n.severity] || InformationFilled;
          const color = SEVERITY_COLOR[n.severity] || '#4589ff';
          const unread = !n.read_at;

          return (
            <div
              key={n.id}
              className={`notification-item${unread ? ` notification-item--unread notification-item--${n.severity}` : ''}`}
              onClick={() => unread && markOne(n.id)}
              style={{ cursor: unread ? 'pointer' : 'default' }}
            >
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Icon size={16} style={{ color, flexShrink: 0, marginTop: '0.1rem' }} />
                <div style={{ flex: 1 }}>
                  <p className="notification-item__title">{n.title}</p>
                  <p className="notification-item__message">{n.message}</p>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="notification-item__meta">
                      {n.pi_id && <span style={{ marginRight: '0.5rem' }}>{n.pi_id}</span>}
                      {timeAgo(n.created_at)}
                    </span>
                    <Button
                      kind="ghost" size="sm"
                      renderIcon={TrashCan}
                      iconDescription="Delete"
                      hasIconOnly
                      onClick={e => { e.stopPropagation(); deleteOne(n.id); }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
