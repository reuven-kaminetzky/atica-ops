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
        <p className="text-sm text-text-secondary mb-3">
          Run in order. Step 1 is required. Steps 2-4 enrich the data.
        </p>
        <div className="flex gap-2 mb-4 flex-wrap">
          <Btn onClick={() => run('sync?step=products')} loading={loading === 'sync?step=products'} primary>1. Products</Btn>
          <Btn onClick={() => run('sync?step=styles')} loading={loading === 'sync?step=styles'}>2. Styles</Btn>
          <Btn onClick={() => run('sync?step=orders')} loading={loading === 'sync?step=orders'}>3. Orders</Btn>
          <Btn onClick={() => run('sync?step=inventory')} loading={loading === 'sync?step=inventory'}>4. Inventory</Btn>
        </div>
        {results['sync?step=products'] && <Result data={results['sync?step=products']} />}
        {results['sync?step=styles'] && <Result data={results['sync?step=styles']} />}
        {results['sync?step=orders'] && <Result data={results['sync?step=orders']} />}
        {results['sync?step=inventory'] && <Result data={results['sync?step=inventory']} />}
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
