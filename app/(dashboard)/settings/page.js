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
          Pull products, inventory, and 30-day orders from Shopify. Updates
          product matching, stock levels, velocity, and demand signals.
        </p>
        <div className="flex gap-2 mb-4">
          <Btn onClick={() => run('sync')} loading={loading === 'sync'} primary>Sync from Shopify</Btn>
        </div>
        {results.sync && <Result data={results.sync} />}
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
