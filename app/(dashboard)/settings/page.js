'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [results, setResults] = useState({});
  const [loading, setLoading] = useState('');

  async function run(action) {
    setLoading(action);
    try {
      const res = await fetch(`/api/${action}`, { method: action === 'health' ? 'GET' : 'POST' });
      const data = await res.json();
      setResults(prev => ({ ...prev, [action]: data }));
    } catch (e) {
      setResults(prev => ({ ...prev, [action]: { error: e.message } }));
    }
    setLoading('');
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>

      <Section title="Database">
        <div className="flex gap-2 mb-4 flex-wrap">
          <Btn onClick={() => run('health')} loading={loading === 'health'}>Check Connection</Btn>
          <Btn onClick={() => run('migrate')} loading={loading === 'migrate'} primary>Run Migration</Btn>
          <Btn onClick={() => run('seed')} loading={loading === 'seed'}>Seed Data</Btn>
        </div>
        {results.health && <Result data={results.health} />}
        {results.migrate && <Result data={results.migrate} />}
        {results.seed && <Result data={results.seed} />}
      </Section>

      <Section title="Shopify Sync">
        <SyncPanel />
      </Section>

      <Section title="Webhooks">
        <p className="text-sm text-text-secondary mb-3">
          Register webhooks so Shopify pushes changes in real-time. No polling needed.
          Inventory updates, new orders, and product changes arrive instantly.
        </p>
        <div className="flex gap-2 mb-4">
          <Btn onClick={() => run('webhooks/register')} loading={loading === 'webhooks/register'} primary>Register Webhooks</Btn>
        </div>
        {results['webhooks/register'] && <Result data={results['webhooks/register']} />}
      </Section>

      <Section title="Data Verification">
        <p className="text-sm text-text-secondary mb-3">
          Checks all data integrity: MPs linked to Shopify, images, inventory,
          velocity, styles. Grades the system A-F. Run after every sync.
        </p>
        <div className="flex gap-2 mb-4">
          <Btn onClick={async () => {
            setLoading('verify');
            try {
              const res = await fetch('/api/verify');
              const data = await res.json();
              setResults(prev => ({ ...prev, verify: data }));
            } catch (e) { setResults(prev => ({ ...prev, verify: { error: e.message } })); }
            setLoading('');
          }} loading={loading === 'verify'} primary>Verify Data</Btn>
        </div>
        {results.verify && (
          <div className="space-y-3">
            <div className={`flex items-center gap-3 p-3 rounded-[--radius-md] ${
              results.verify.verified ? 'bg-success/10 border border-success/20' : 'bg-danger/10 border border-danger/20'
            }`}>
              <span className="text-2xl font-bold">{results.verify.grade || '?'}</span>
              <div>
                <div className="text-sm font-semibold">{results.verify.verified ? 'Data Verified' : 'Issues Found'}</div>
                <div className="text-xs text-text-secondary">Score: {results.verify.score}/100</div>
              </div>
            </div>
            {results.verify.issues?.length > 0 && (
              <div className="space-y-1">
                {results.verify.issues.map((issue, i) => (
                  <div key={i} className={`text-xs p-2 rounded ${
                    issue.severity === 'critical' ? 'bg-danger/10 text-danger' :
                    issue.severity === 'warning' ? 'bg-warning/10 text-warning' :
                    'bg-surface-sunken text-text-secondary'
                  }`}>{issue.severity.toUpperCase()}: {issue.message}</div>
                ))}
              </div>
            )}
            <Result data={results.verify} />
          </div>
        )}
      </Section>

      <Section title="Shopify Connection">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <KV label="Store URL" value="atica-brand.myshopify.com" />
          <KV label="API Version" value="2025-04" />
          <KV label="Plan" value="Shopify Plus" />
          <KV label="Auth" value="Partners App Token" />
        </div>
      </Section>

      <Section title="Architecture">
        <p className="text-sm text-text-secondary leading-relaxed">
          Next.js + Neon Postgres + Shopify REST API. Seven business domains:
          Product, Supply Chain, Inventory, Sales, Finance, Logistics, Marketing.
          Domain model in lib/domain.js (14 MP stages, 12 PO stages, 15 events).
          75 automated tests: <code className="text-xs bg-surface-sunken px-1.5 py-0.5 rounded">npm test</code>
        </p>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-5 mb-4 shadow-[--shadow-subtle]">
      <h2 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h2>
      {children}
    </div>
  );
}

function Btn({ children, onClick, loading, primary }) {
  return (
    <button onClick={onClick} disabled={loading}
      className={`px-4 py-2 rounded-[--radius-sm] text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-wait transition-colors ${
        primary
          ? 'bg-brand text-white border border-brand hover:bg-brand-dark'
          : 'bg-surface text-text border border-border-strong hover:bg-surface-raised'
      }`}
    >
      {loading ? 'Working...' : children}
    </button>
  );
}

function Result({ data }) {
  return (
    <pre className={`p-3 rounded-[--radius-sm] text-xs overflow-auto font-mono mb-3 leading-relaxed ${
      data.error ? 'bg-danger-light border border-danger/20' : 'bg-surface-sunken border border-border'
    }`}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function KV({ label, value }) {
  return (
    <div className="bg-surface-sunken rounded-[--radius-sm] p-3">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function SyncPanel() {
  const [status, setStatus] = useState(null);
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
    setStatus({ status: 'triggering' });
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      const data = await res.json();
      if (data.error) { setStatus({ status: 'failed', error: data.error }); return; }

      // Start polling
      setPolling(true);
      setStatus({ status: 'starting' });

      const poll = setInterval(async () => {
        const s = await checkStatus();
        if (s && (s.status === 'done' || s.status === 'failed')) {
          clearInterval(poll);
          setPolling(false);
        }
      }, 3000);

      // Safety: stop polling after 5 minutes
      setTimeout(() => { clearInterval(poll); setPolling(false); }, 300000);
    } catch (e) {
      setStatus({ status: 'failed', error: e.message });
    }
  }

  const stepLabels = {
    connecting: 'Connecting to Shopify...',
    fetching_products: 'Fetching products from Shopify...',
    matching: 'Matching products to MPs...',
    updating_mps: 'Updating master products...',
    creating_styles: 'Creating style records...',
    fetching_orders: 'Fetching recent orders...',
    computing_velocity: 'Computing velocity & demand signals...',
  };

  const isDone = status?.status === 'done';
  const isFailed = status?.status === 'failed';
  const isRunning = status?.status === 'running' || status?.status === 'starting' || status?.status === 'triggering';

  return (
    <div>
      <p className="text-sm text-text-secondary mb-3">
        Pulls all products, inventory, and 30-day orders from Shopify.
        Runs as a background job (up to 15 minutes).
      </p>

      <div className="flex gap-2 mb-4">
        <button onClick={triggerSync} disabled={isRunning}
          className="px-4 py-2 rounded-[--radius-sm] text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-wait bg-brand text-white border border-brand hover:bg-brand-dark transition-colors">
          {isRunning ? 'Syncing...' : 'Sync from Shopify'}
        </button>
        <button onClick={checkStatus}
          className="px-4 py-2 rounded-[--radius-sm] text-sm font-semibold cursor-pointer bg-surface text-text border border-border-strong hover:bg-surface-raised transition-colors">
          Check Status
        </button>
      </div>

      {status && (
        <div className={`p-4 rounded-[--radius-md] border mb-3 ${
          isDone ? 'bg-success/5 border-success/20' :
          isFailed ? 'bg-danger/5 border-danger/20' :
          'bg-info/5 border-info/20'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold ${isDone ? 'text-success' : isFailed ? 'text-danger' : 'text-info'}`}>
              {isDone ? '✓ Sync Complete' : isFailed ? '✗ Sync Failed' : '↻ Syncing...'}
            </span>
            {status.elapsed && <span className="text-xs text-text-tertiary">({status.elapsed})</span>}
          </div>

          {isRunning && status.step && (
            <div className="text-sm text-text-secondary">{stepLabels[status.step] || status.step}</div>
          )}
          {isRunning && status.progress && (
            <div className="text-xs text-text-tertiary mt-1">{status.progress}</div>
          )}

          {isDone && status.results && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
              <MiniStat label="Matched" value={status.results.matched || 0} />
              <MiniStat label="Styles" value={status.results.stylesCreated || 0} />
              <MiniStat label="Orders" value={status.results.orders || 0} />
              <MiniStat label="Velocity" value={status.results.velocityUpdated || 0} />
            </div>
          )}

          {isFailed && status.error && (
            <div className="text-sm text-danger mt-1">{status.error}</div>
          )}
        </div>
      )}

      {status && <Result data={status} />}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="bg-surface/50 rounded-[--radius-sm] p-2 text-center">
      <div className="text-xs text-text-tertiary">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}
