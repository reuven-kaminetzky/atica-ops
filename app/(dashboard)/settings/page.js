'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState('');

  async function run(action) {
    setLoading(action);
    try {
      const headers = {};
      if (action === 'seed' || action === 'migrate') {
        headers['X-Confirm-Destructive'] = 'true';
      }
      const res = await fetch(`/api/${action}`, {
        method: action === 'health' ? 'GET' : 'POST',
        headers,
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [action]: data }));
    } catch (e) {
      setResults(prev => ({ ...prev, [action]: { error: e.message } }));
    }
    setLoading('');
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-8">Settings</h1>

      {/* Database */}
      <Group title="Database">
        <div className="flex gap-2 flex-wrap mb-3">
          <Btn onClick={() => run('health')}   loading={loading === 'health'}>Check connection</Btn>
          <Btn onClick={() => run('migrate')}  loading={loading === 'migrate'}  primary>Run migration</Btn>
          <Btn onClick={() => run('seed')}     loading={loading === 'seed'}>Seed data</Btn>
        </div>
        {results.health  && <Result data={results.health} />}
        {results.migrate && <Result data={results.migrate} />}
        {results.seed    && <Result data={results.seed} />}
      </Group>

      {/* Sync */}
      <Group title="Shopify Sync">
        <SyncPanel />
      </Group>

      {/* Webhooks */}
      <Group title="Webhooks">
        <p className="text-sm text-text-secondary mb-3">
          Register webhooks so Shopify pushes changes in real-time —
          inventory updates, new orders, product changes.
        </p>
        <div className="flex gap-2 mb-3">
          <Btn onClick={() => run('webhooks/register')} loading={loading === 'webhooks/register'} primary>
            Register webhooks
          </Btn>
        </div>
        {results['webhooks/register'] && <Result data={results['webhooks/register']} />}
      </Group>

      {/* Verify */}
      <Group title="Data Verification">
        <p className="text-sm text-text-secondary mb-3">
          Grades data integrity A–F. Checks MP→Shopify links, images, inventory, velocity, styles.
          Run after every sync.
        </p>
        <div className="flex gap-2 mb-3">
          <Btn onClick={async () => {
            setLoading('verify');
            try {
              const res = await fetch('/api/verify');
              const data = await res.json();
              setResults(prev => ({ ...prev, verify: data }));
            } catch (e) { setResults(prev => ({ ...prev, verify: { error: e.message } })); }
            setLoading('');
          }} loading={loading === 'verify'} primary>
            Verify data
          </Btn>
        </div>
        {results.verify && <VerifyResult data={results.verify} />}
      </Group>

      {/* Info */}
      <Group title="Connection">
        <table className="w-full text-sm border-collapse">
          <tbody>
            {[
              ['Store',       'atica-brand.myshopify.com'],
              ['API version', '2025-04'],
              ['Plan',        'Shopify Plus'],
              ['Stack',       'Next.js · Neon Postgres · Netlify'],
              ['Monthly OpEx','$25,000 (edit in app_settings → opex_monthly)'],
            ].map(([k, v]) => (
              <tr key={k} className="border-b border-border/50 last:border-0">
                <td className="py-1.5 pr-6 text-text-tertiary text-[12px] w-32">{k}</td>
                <td className="py-1.5 font-mono text-[12px]">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Group>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="mb-8">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Btn({ children, onClick, loading, primary }) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`px-4 py-1.5 rounded-[--radius-sm] text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-wait transition-colors ${
        primary
          ? 'bg-brand text-white hover:bg-brand-dark'
          : 'bg-surface-sunken text-text border border-border-strong hover:bg-surface-raised'
      }`}>
      {loading ? 'Working…' : children}
    </button>
  );
}

function Result({ data }) {
  return (
    <pre className={`p-3 rounded-[--radius-sm] text-[11px] overflow-auto font-mono mb-3 leading-relaxed ${
      data?.error ? 'bg-danger/5 border border-danger/20 text-danger' : 'bg-surface-sunken border border-border text-text-secondary'
    }`}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function VerifyResult({ data }) {
  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-[--radius-sm] border ${
        data.verified ? 'border-success/20 bg-success/5' : 'border-danger/20 bg-danger/5'
      }`}>
        <span className="text-2xl font-bold">{data.grade || '?'}</span>
        <div>
          <div className="text-sm font-semibold">{data.verified ? 'Verified' : 'Issues found'}</div>
          <div className="text-xs text-text-secondary">Score: {data.score}/100</div>
        </div>
      </div>
      {data.issues?.length > 0 && (
        <div className="space-y-1">
          {data.issues.map((issue, i) => (
            <div key={i} className={`text-xs px-3 py-2 rounded-[--radius-sm] ${
              issue.severity === 'critical' ? 'bg-danger/8 text-danger' :
              issue.severity === 'warning'  ? 'bg-warning/8 text-warning' :
              'bg-surface-sunken text-text-secondary'
            }`}>
              <span className="font-semibold uppercase">{issue.severity}: </span>{issue.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SyncPanel() {
  const [status,  setStatus]  = useState(null);
  const [polling, setPolling] = useState(false);

  async function checkStatus() {
    try {
      const res = await fetch('/api/sync/status');
      const data = await res.json();
      setStatus(data);
      return data;
    } catch (e) {
      setStatus({ status: 'error', error: e.message });
      return null;
    }
  }

  async function triggerSync() {
    setStatus({ status: 'starting' });
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.error) { setStatus({ status: 'failed', error: data.error }); return; }

      setPolling(true);
      const poll = setInterval(async () => {
        const s = await checkStatus();
        if (s?.status === 'done' || s?.status === 'failed') {
          clearInterval(poll);
          setPolling(false);
        }
      }, 3000);
      setTimeout(() => { clearInterval(poll); setPolling(false); }, 300000);
    } catch (e) {
      setStatus({ status: 'failed', error: e.message });
    }
  }

  const STEP_LABELS = {
    connecting:        'Connecting to Shopify…',
    fetching_products: 'Fetching products…',
    matching:          'Matching to MPs…',
    updating_mps:      'Updating master products…',
    creating_styles:   'Creating styles…',
    fetching_orders:   'Fetching 30-day orders…',
    computing_velocity:'Computing velocity…',
  };

  const isDone    = status?.status === 'done';
  const isFailed  = status?.status === 'failed';
  const isRunning = ['running', 'starting', 'triggering'].includes(status?.status);

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">
        Pulls all products, inventory and 30-day orders from Shopify.
        Runs as a background job — up to 15 minutes.
      </p>

      <div className="flex gap-2 mb-4">
        <Btn onClick={triggerSync} loading={isRunning} primary>
          {isRunning ? 'Syncing…' : 'Sync from Shopify'}
        </Btn>
        <Btn onClick={checkStatus}>Check status</Btn>
      </div>

      {status && (
        <div className={`px-4 py-3 rounded-[--radius-sm] border mb-3 ${
          isDone   ? 'bg-success/5 border-success/20' :
          isFailed ? 'bg-danger/5  border-danger/20' :
                     'bg-info/5    border-info/20'
        }`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-sm font-semibold ${isDone ? 'text-success' : isFailed ? 'text-danger' : 'text-info'}`}>
              {isDone ? '✓ Sync complete' : isFailed ? '✗ Failed' : '↻ Syncing…'}
            </span>
            {status.elapsed && <span className="text-xs text-text-tertiary">{status.elapsed}</span>}
          </div>

          {isRunning && status.step && (
            <p className="text-sm text-text-secondary">{STEP_LABELS[status.step] || status.step}</p>
          )}
          {isRunning && status.progress && (
            <p className="text-xs text-text-tertiary mt-0.5">{status.progress}</p>
          )}

          {isDone && status.results && (
            <div className="flex gap-5 mt-2 text-sm">
              {[
                ['Matched',  status.results.matched],
                ['Styles',   status.results.stylesCreated],
                ['Orders',   status.results.orders],
                ['Velocity', status.results.velocityUpdated],
              ].map(([label, val]) => (
                <div key={label}>
                  <span className="text-text-tertiary">{label} </span>
                  <span className="font-semibold">{val ?? '—'}</span>
                </div>
              ))}
            </div>
          )}

          {isFailed && status.error && (
            <p className="text-sm text-danger mt-1">{status.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
