'use client';

import { useState } from 'react';

export default function DiagnosePage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState('');
  const [log, setLog] = useState([]);

  function addLog(msg) {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }

  async function diagnose() {
    setLoading('diagnose');
    addLog('Checking database...');
    try {
      const r = await fetch('/api/verify');
      const d = await r.json();
      setStatus(d);
      addLog(`Done. ${d.stats?.masterProducts || 0} MPs, ${d.issues?.length || 0} issues`);
    } catch (e) {
      addLog(`Error: ${e.message}`);
    }
    setLoading('');
  }

  async function runMigrations() {
    setLoading('migrate');
    addLog('Running ALL migrations...');
    try {
      const r = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'X-Confirm-Destructive': 'true' },
      });
      const d = await r.json();
      addLog(`Migrations done: ${d.executed || 0} statements, ${d.errors?.length || 0} errors`);
      if (d.tables) addLog(`Tables: ${d.tables.join(', ')}`);
      if (d.errors?.length > 0) {
        d.errors.slice(0, 5).forEach(e => addLog(`  ⚠ ${e.file}: ${e.error}`));
      }
      setStatus(prev => ({ ...prev, migration: d }));
    } catch (e) {
      addLog(`Migration error: ${e.message}`);
    }
    setLoading('');
  }

  async function runSeed() {
    setLoading('seed');
    addLog('Seeding 41 MPs + 10 vendors...');
    try {
      const r = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'X-Confirm-Destructive': 'true' },
      });
      const d = await r.json();
      addLog(`Seed: ${d.seeded ? 'OK' : 'FAILED'} — ${d.products || 0} products, ${d.vendors || 0} vendors`);
    } catch (e) {
      addLog(`Seed error: ${e.message}`);
    }
    setLoading('');
  }

  async function runSync() {
    setLoading('sync');
    addLog('Triggering sync...');
    try {
      // Set status
      await fetch('/api/sync/trigger', { method: 'POST' });
      addLog('Trigger OK. Calling background function...');
      
      // Call background function directly
      try {
        await fetch('/.netlify/functions/sync-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ triggeredBy: 'diagnose' }),
        });
      } catch { /* background returns 202 */ }
      
      addLog('Sync started. Polling...');
      
      // Poll for completion
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const s = await fetch('/api/sync/status').then(r => r.json());
          const step = s.step || s.status || 'unknown';
          const progress = s.progress || '';
          addLog(`Sync: ${step} ${progress}`);
          
          if (s.status === 'done') {
            clearInterval(poll);
            setLoading('');
            addLog(`✅ SYNC COMPLETE — matched: ${s.results?.matched || '?'}, styles: ${s.results?.stylesCreated || '?'}, sales: ${s.results?.salesStored || '?'}`);
            if (s.results?.optionPatterns) {
              addLog(`Option patterns: ${JSON.stringify(s.results.optionPatterns)}`);
            }
          } else if (s.status === 'failed') {
            clearInterval(poll);
            setLoading('');
            addLog(`❌ SYNC FAILED: ${s.error || 'unknown'}`);
          }
        } catch (e) {
          addLog(`Poll error: ${e.message}`);
        }
        if (attempts > 60) { // 5 min max
          clearInterval(poll);
          setLoading('');
          addLog('Polling timed out after 5 min');
        }
      }, 5000);
    } catch (e) {
      addLog(`Sync error: ${e.message}`);
      setLoading('');
    }
  }

  async function registerWebhooks() {
    setLoading('webhooks');
    addLog('Registering webhooks...');
    try {
      const r = await fetch('/api/webhooks/register', { method: 'POST' });
      const d = await r.json();
      addLog(`Webhooks: ${d.registered ? 'OK' : 'FAILED'}`);
      if (d.results) {
        d.results.forEach(w => addLog(`  ${w.topic}: ${w.status}`));
      }
      if (d.error) addLog(`Error: ${d.error}`);
    } catch (e) {
      addLog(`Webhook error: ${e.message}`);
    }
    setLoading('');
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '16px' }}>Atica OPS — Diagnostics</h1>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
        <BigBtn onClick={diagnose} loading={loading === 'diagnose'} color="#3b82f6">
          1. Check Database
        </BigBtn>
        <BigBtn onClick={runMigrations} loading={loading === 'migrate'} color="#8b5cf6">
          2. Run All Migrations
        </BigBtn>
        <BigBtn onClick={runSeed} loading={loading === 'seed'} color="#f59e0b">
          3. Seed Products (41 MPs)
        </BigBtn>
        <BigBtn onClick={runSync} loading={loading === 'sync'} color="#10b981">
          4. Sync from Shopify
        </BigBtn>
        <BigBtn onClick={registerWebhooks} loading={loading === 'webhooks'} color="#6366f1">
          5. Register Webhooks
        </BigBtn>
      </div>

      {/* Live log */}
      <div style={{ 
        background: '#111', color: '#0f0', padding: '12px', borderRadius: '8px',
        fontSize: '13px', fontFamily: 'monospace', maxHeight: '400px', overflowY: 'auto',
        lineHeight: '1.6'
      }}>
        {log.length === 0 && <span style={{ color: '#555' }}>Tap a button above to start...</span>}
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* Quick stats if we have them */}
      {status?.stats && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#f8f8f8', borderRadius: '8px', fontSize: '14px' }}>
          <div><strong>Master Products:</strong> {status.stats.masterProducts}</div>
          <div><strong>Linked to Shopify:</strong> {status.stats.linkedToShopify} ({status.stats.linkedPct}%)</div>
          <div><strong>With Images:</strong> {status.stats.withImages}</div>
          <div><strong>Styles:</strong> {status.stats.styles}</div>
          <div><strong>Sales:</strong> {status.stats.sales}</div>
          {status.issues?.length > 0 && (
            <div style={{ marginTop: '8px', color: '#dc2626' }}>
              <strong>Issues:</strong>
              {status.issues.map((i, idx) => <div key={idx}>• {i.message}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BigBtn({ onClick, loading, color, children }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        padding: '16px 20px',
        fontSize: '16px',
        fontWeight: '600',
        color: 'white',
        background: loading ? '#999' : color,
        border: 'none',
        borderRadius: '10px',
        cursor: loading ? 'wait' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? 'Working...' : children}
    </button>
  );
}
