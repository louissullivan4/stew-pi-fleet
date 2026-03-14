import React, { useState, useEffect, useCallback } from 'react';
import { Button, Loading, InlineNotification } from '@carbon/react';
import { Renew } from '@carbon/icons-react';
import { pis as pisApi } from '../../api';
import PiCard from './PiCard';

export default function Dashboard() {
  const [piList, setPiList]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const data = await pisApi.list();
      setPiList(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const online  = piList.filter(p => p.online === true).length;
  const offline = piList.filter(p => p.online === false).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
        <Loading description="Loading fleet…" withOverlay={false} />
      </div>
    );
  }

  return (
    <div>
      {/* Page header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1.5rem 1.5rem 0',
        marginBottom: '0.5rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 400, color: '#f4f4f4', margin: 0 }}>
            Fleet Overview
          </h1>
          <p style={{ fontSize: '0.75rem', color: '#8d8d8d', margin: '0.25rem 0 0' }}>
            {piList.length} host{piList.length !== 1 ? 's' : ''}
            {' · '}
            <span style={{ color: '#42be65' }}>{online} online</span>
            {offline > 0 && (
              <span style={{ color: '#fa4d56' }}> · {offline} offline</span>
            )}
          </p>
        </div>

        <Button
          kind="ghost"
          size="sm"
          renderIcon={Renew}
          iconDescription="Refresh"
          hasIconOnly={refreshing}
          onClick={() => load(true)}
          disabled={refreshing}
        >
          {refreshing ? '' : 'Refresh'}
        </Button>
      </div>

      {error && (
        <InlineNotification
          kind="error"
          title="Failed to load fleet"
          subtitle={error}
          style={{ margin: '1rem 1.5rem' }}
          lowContrast
        />
      )}

      {piList.length === 0 && !error ? (
        <div style={{ padding: '4rem 1.5rem', textAlign: 'center', color: '#8d8d8d' }}>
          <p style={{ margin: 0 }}>No Pis configured.</p>
          <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem' }}>
            Edit <code style={{ color: '#c6c6c6' }}>config/pis.yaml</code> to add hosts.
          </p>
        </div>
      ) : (
        <div className="pi-grid">
          {piList.map(pi => (
            <PiCard key={pi.id} pi={pi} />
          ))}
        </div>
      )}
    </div>
  );
}
