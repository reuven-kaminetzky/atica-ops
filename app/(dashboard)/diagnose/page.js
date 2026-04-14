'use client';

import { useState, useRef, useEffect } from 'react';

export default function DiagnosePage() {
  const [loading, setLoading] = useState('');
  const [log, setLog] = useState([]);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function add(msg) {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()} ${msg}`]);
  }

  async function api(path, method = 'GET', headers = {}) {
    const r = await fetch(path, { method, headers });
    return r.json();
  }

  async function fixEverything() {
    setLoading('fix');
    setLog([]);
    add('🔧 STARTING FULL PIPELINE...');
    add('');

    // ── STEP 1: MIGRATE ──
    add('━━━ STEP 1: DATABASE MIGRATIONS ━━━');
    try {
      const d = await api('/api/migrate', 'POST', { 'X-Confirm-Destructive': 'true' });
      if (d.error) {
        add(`❌ ${d.error}`);
        if (d.warning) add(`   ${d.warning}`);
      } else {
        add(`✅ ${d.executed} SQL statements executed`);
        add(`   ${d.tables?.length || 0} tables now exist`);
        add(`   ${d.mpCount || 0} master products in DB`);
        add(`   IDs column: ${d.idsColumn || 'unknown'}`);
        if (d.errors?.length > 0) {
          add(`   ⚠️ ${d.errors.length} non-fatal errors`);
          d.errors.slice(0, 3).forEach(e => add(`     ${e.file}: ${e.error}`));
        }
      }
    } catch (e) { add(`❌ Migration failed: ${e.message}`); }
    add('');

    // ── STEP 2: SEED ──
    add('━━━ STEP 2: SEED PRODUCTS ━━━');
    try {
      const d = await api('/api/seed', 'POST', { 'X-Confirm-Destructive': 'true' });
      if (d.seeded) {
        add(`✅ ${d.products} master products, ${d.vendors} vendors, ${d.stacks} stacks`);
      } else {
        add(`❌ Seed failed: ${d.error || JSON.stringify(d)}`);
      }
    } catch (e) { add(`❌ Seed failed: ${e.message}`); }
    add('');

    // ── STEP 3: SYNC ──
    add('━━━ STEP 3: SYNC FROM SHOPIFY ━━━');
    try {
      // Set status via trigger
      const trigger = await api('/api/sync/trigger', 'POST');
      add(`Trigger: ${trigger.message || trigger.error || 'OK'}`);

      // Call background function directly (bypasses site password)
      add('Calling background sync function...');
      try {
        await fetch('/.netlify/functions/sync-background', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ triggeredBy: 'fix-everything' }),
        });
      } catch { /* 202 accepted */ }

      // Poll for completion
      add('Polling for completion (this takes 1-3 minutes)...');
      let done = false;
      let lastStep = '';
      for (let i = 0; i < 60 && !done; i++) {
        await new Promise(r => setTimeout(r, 5000));
        try {
          const s = await api('/api/sync/status');
          const step = s.step || s.status || '?';
          const progress = s.progress || '';
          if (step !== lastStep) {
            add(`  → ${step} ${progress}`);
            lastStep = step;
          }
          if (s.status === 'done') {
            done = true;
            const r = s.results || {};
            add(`✅ SYNC COMPLETE`);
            add(`   Matched: ${r.matched || 0} products to MPs`);
            add(`   Unmatched: ${r.unmatched || 0}`);
            add(`   Styles created: ${r.stylesCreated || 0}`);
            add(`   Sales stored: ${r.salesStored || 0}`);
            add(`   MPs updated: ${r.mpsUpdated || 0}`);
            add(`   Velocity updated: ${r.velocityUpdated || 0}`);
            if (r.optionPatterns) {
              add(`   Option patterns found:`);
              for (const [k, v] of Object.entries(r.optionPatterns)) {
                add(`     [${k}] × ${v}`);
              }
            }
          } else if (s.status === 'failed') {
            done = true;
            add(`❌ SYNC FAILED: ${s.error || 'unknown'}`);
          }
        } catch (e) { /* keep polling */ }
      }
      if (!done) add('⏳ Sync still running — check back in a minute');
    } catch (e) { add(`❌ Sync failed: ${e.message}`); }
    add('');

    // ── STEP 4: WEBHOOKS ──
    add('━━━ STEP 4: REGISTER WEBHOOKS ━━━');
    try {
      const d = await api('/api/webhooks/register', 'POST');
      if (d.registered) {
        add(`✅ Webhooks registered at:`);
        add(`   ${d.address}`);
        d.results?.forEach(w => add(`   ${w.topic}: ${w.status}`));
      } else {
        add(`⚠️ ${d.error || JSON.stringify(d)}`);
      }
    } catch (e) { add(`⚠️ Webhooks: ${e.message}`); }
    add('');

    // ── STEP 5: VERIFY ──
    add('━━━ STEP 5: VERIFY ━━━');
    try {
      const d = await api('/api/diagnose');
      const c = d.checks || {};
      add(`Master Products: ${c.mp_count}`);
      add(`IDs column: ${c.ids_column}`);
      add(`Linked to Shopify: ${c.ids_populated}`);
      add(`Styles: ${c.styles_count}`);
      add(`Sales: ${c.sales_count}`);
      if (c.missing_tables?.length > 0) {
        add(`⚠️ Missing tables: ${c.missing_tables.join(', ')}`);
      } else {
        add(`✅ All expected tables exist`);
      }
      if (c.mp_sample?.length > 0) {
        add('Sample products:');
        c.mp_sample.forEach(p => add(`  ${p.name}: stock=${p.total_inventory}, img=${p.has_image}`));
      }
    } catch (e) { add(`Verify: ${e.message}`); }
    add('');
    add('🏁 DONE. Go to /products to see your data.');

    setLoading('');
  }

  async function checkOnly() {
    setLoading('check');
    setLog([]);
    add('Checking database...');
    try {
      const d = await api('/api/diagnose');
      const c = d.checks || {};
      add(`Tables: ${Array.isArray(c.tables) ? c.tables.join(', ') : c.tables}`);
      add(`MP columns: ${Array.isArray(c.mp_columns) ? c.mp_columns.join(', ') : c.mp_columns}`);
      add(`MPs: ${c.mp_count}`);
      add(`IDs: ${c.ids_column}`);
      add(`Shopify linked: ${c.ids_populated}`);
      add(`Styles: ${c.styles_count}`);
      add(`Sales: ${c.sales_count}`);
      add(`Vendors: ${c.vendors_count}`);
      add(`Missing tables: ${c.missing_tables?.length ? c.missing_tables.join(', ') : 'none'}`);
      if (c.sync_status) add(`Sync: ${JSON.stringify(c.sync_status).slice(0, 200)}`);
      if (c.mp_sample) c.mp_sample.forEach(p => add(`  ${p.name}: inv=${p.total_inventory} img=${p.has_image}`));
    } catch (e) { add(`Error: ${e.message}`); }
    setLoading('');
  }

  return (
    <div style={{ padding: '16px', fontFamily: 'system-ui', maxWidth: '600px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '4px' }}>Diagnostics</h1>
      <p style={{ fontSize: '13px', color: '#888', marginBottom: '16px' }}>
        Fix Everything runs: migrations → seed → sync → webhooks → verify
      </p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        <button onClick={fixEverything} disabled={!!loading}
          style={{ padding: '18px', fontSize: '18px', fontWeight: 'bold', color: 'white',
            background: loading ? '#999' : '#dc2626', border: 'none', borderRadius: '12px',
            cursor: loading ? 'wait' : 'pointer' }}>
          {loading === 'fix' ? '⏳ Working...' : '🔧 FIX EVERYTHING'}
        </button>
        <button onClick={checkOnly} disabled={!!loading}
          style={{ padding: '12px', fontSize: '14px', fontWeight: '600', color: 'white',
            background: loading ? '#999' : '#3b82f6', border: 'none', borderRadius: '10px',
            cursor: loading ? 'wait' : 'pointer' }}>
          {loading === 'check' ? '⏳ Checking...' : '🔍 Check Database Only'}
        </button>
      </div>

      <div ref={logRef} style={{ 
        background: '#0a0a0a', color: '#22c55e', padding: '12px', borderRadius: '10px',
        fontSize: '12px', fontFamily: 'monospace', maxHeight: '500px', overflowY: 'auto',
        lineHeight: '1.7', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
      }}>
        {log.length === 0 && <span style={{ color: '#444' }}>Tap a button to start...</span>}
        {log.map((l, i) => <div key={i}>{l}</div>)}
      </div>
    </div>
  );
}
