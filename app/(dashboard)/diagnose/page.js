'use client';

import { useState } from 'react';

export default function DiagnosePage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState('');
  const [log, setLog] = useState([]);

  function addLog(msg) {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} — ${msg}`]);
  }

  async function fixEverything() {
    setLoading('fix');
    addLog('🔧 FIX EVERYTHING — running full pipeline...');
    
    // Step 1: Migrate
    addLog('Step 1/4: Running migrations...');
    try {
      const r = await fetch('/api/migrate', { method: 'POST', headers: { 'X-Confirm-Destructive': 'true' } });
      const d = await r.json();
      if (d.error) { addLog(`⚠️ Migration: ${d.error}`); } 
      else { addLog(`✅ Migrations: ${d.executed} statements, ${d.tables?.length || 0} tables`); }
    } catch (e) { addLog(`❌ Migration failed: ${e.message}`); }

    // Step 2: Seed
    addLog('Step 2/4: Seeding products...');
    try {
      const r = await fetch('/api/seed', { method: 'POST', headers: { 'X-Confirm-Destructive': 'true' } });
      const d = await r.json();
      if (d.seeded) { addLog(`✅ Seed: ${d.products} products, ${d.vendors} vendors`); }
      else { addLog(`⚠️ Seed: ${d.error || 'unknown'}`); }
    } catch (e) { addLog(`❌ Seed failed: ${e.message}`); }

    // Step 3: Sync
    addLog('Step 3/4: Syncing from Shopify...');
    try {
      await fetch('/api/sync/trigger', { method: 'POST' });
      try {
        await fetch('/.netlify/functions/sync-background', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: '{"triggeredBy":"fix-everything"}',
        });
      } catch { /* 202 */ }
      
      // Poll
      let done = false;
      for (let i = 0; i < 60 && !done; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const s = await fetch('/api/sync/status').then(r => r.json());
          addLog(`  Sync: ${s.step || s.status} ${s.progress || ''}`);
          if (s.status === 'done') {
            done = true;
            const r = s.results || {};
            addLog(`✅ Sync complete: ${r.matched || 0} matched, ${r.stylesCreated || 0} styles, ${r.salesStored || 0} sales`);
          } else if (s.status === 'failed') {
            done = true;
            addLog(`❌ Sync failed: ${s.error || 'unknown'}`);
          }
        } catch { }
      }
      if (!done) addLog('⚠️ Sync still running — check back in a minute');
    } catch (e) { addLog(`❌ Sync failed: ${e.message}`); }

    // Step 4: Register webhooks
    addLog('Step 4/4: Registering webhooks...');
    try {
      const r = await fetch('/api/webhooks/register', { method: 'POST' });
      const d = await r.json();
      if (d.registered) { addLog(`✅ Webhooks registered at ${d.address}`); }
      else { addLog(`⚠️ Webhooks: ${d.error || 'unknown'}`); }
    } catch (e) { addLog(`⚠️ Webhooks: ${e.message}`); }

    addLog('🏁 DONE — go to /products to see your data');
    setLoading('');
  }

  async function diagnose() {
    setLoading('diagnose');
    addLog('Checking database...');
    try {
      const r = await fetch('/api/diagnose');
      const d = await r.json();
      setStatus(d);
      const c = d.checks || {};
      
      // Show key findings
      if (c.mp_count !== undefined) addLog(`Master Products: ${c.mp_count}`);
      if (c.ids_column) addLog(`IDs column: ${c.ids_column}`);
      if (c.ids_populated) addLog(`Linked to Shopify: ${c.ids_populated}`);
      if (c.styles_count !== undefined) addLog(`Styles: ${c.styles_count}`);
      if (c.sales_count !== undefined) addLog(`Sales records: ${c.sales_count}`);
      if (c.vendors_count !== undefined) addLog(`Vendors: ${c.vendors_count}`);
      
      if (c.missing_tables?.length > 0) {
        addLog(`⚠️ MISSING TABLES: ${c.missing_tables.join(', ')}`);
        addLog('→ Tap "Run All Migrations" to fix');
      } else if (c.has_all_tables) {
        addLog('✅ All tables exist');
      }
      
      if (typeof c.ids_column === 'string' && c.ids_column.includes('NOT run')) {
        addLog('⚠️ Column rename migration not run — sync writes to wrong column!');
        addLog('→ Tap "Run All Migrations" to fix');
      }
      
      if (c.sync_status && typeof c.sync_status === 'object') {
        addLog(`Last sync: ${c.sync_status.status} at ${c.sync_status.updatedAt || '?'}`);
        if (c.sync_status.results) {
          const r = c.sync_status.results;
          addLog(`  Matched: ${r.matched || 0}, Styles: ${r.stylesCreated || 0}, Sales: ${r.salesStored || 0}`);
        }
      }
      
      if (d.error) addLog(`❌ ${d.error}`);
    } catch (e) {
      addLog(`Error: ${e.message}`);
    }
    setLoading('');
  }

  async function runMigrations() {
    setLoading('migrate');
    addLog('Running ALL migrations (12 files)...');
    try {
      const r = await fetch('/api/migrate', {
        method: 'POST',
        headers: { 'X-Confirm-Destructive': 'true' },
      });
      const d = await r.json();
      if (d.error) {
        addLog(`❌ Migration error: ${d.error}`);
        if (d.warning) addLog(d.warning);
        return;
      }
      addLog(`✅ Migrations done: ${d.executed || 0} statements across ${(d.files || []).length} files`);
      if (d.tables) addLog(`Tables now: ${d.tables.join(', ')}`);
      if (d.errors?.length > 0) {
        addLog(`⚠️ ${d.errors.length} non-fatal errors:`);
        d.errors.slice(0, 5).forEach(e => addLog(`  ${e.file}: ${e.error}`));
      } else {
        addLog('No errors!');
      }
      addLog('→ Now tap "Check Database" to verify, then "Sync from Shopify"');
    } catch (e) {
      addLog(`❌ Migration failed: ${e.message}`);
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
        <BigBtn onClick={fixEverything} loading={loading === 'fix'} color="#dc2626">
          🔧 FIX EVERYTHING (migrate → seed → sync → webhooks)
        </BigBtn>
        <div style={{ height: '8px' }} />
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

      {/* Raw data dump if available */}
      {status?.checks && (
        <details style={{ marginTop: '16px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '14px', color: '#666' }}>Raw diagnostics</summary>
          <pre style={{ fontSize: '11px', background: '#f5f5f5', padding: '8px', borderRadius: '6px', overflow: 'auto', maxHeight: '300px' }}>
            {JSON.stringify(status.checks, null, 2)}
          </pre>
        </details>
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
