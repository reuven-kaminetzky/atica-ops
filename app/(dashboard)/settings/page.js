'use client';

import { useState } from 'react';

export default function SettingsPage() {
  const [migrationResult, setMigrationResult] = useState(null);
  const [seedResult, setSeedResult] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [loading, setLoading] = useState('');

  async function checkDb() {
    setLoading('db');
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setDbStatus(data);
    } catch (e) {
      setDbStatus({ error: e.message });
    }
    setLoading('');
  }

  async function runMigration() {
    setLoading('migrate');
    try {
      const res = await fetch('/api/migrate', { method: 'POST' });
      const data = await res.json();
      setMigrationResult(data);
    } catch (e) {
      setMigrationResult({ error: e.message });
    }
    setLoading('');
  }

  async function runSeed() {
    setLoading('seed');
    try {
      const res = await fetch('/api/seed', { method: 'POST' });
      const data = await res.json();
      setSeedResult(data);
    } catch (e) {
      setSeedResult({ error: e.message });
    }
    setLoading('');
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Settings</h1>

      {/* Database */}
      <Section title="Database">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <Btn onClick={checkDb} loading={loading === 'db'}>Check Connection</Btn>
          <Btn onClick={runMigration} loading={loading === 'migrate'} variant="primary">Run Migration</Btn>
          <Btn onClick={runSeed} loading={loading === 'seed'}>Seed Data</Btn>
        </div>

        {dbStatus && (
          <Result data={dbStatus} />
        )}
        {migrationResult && (
          <Result data={migrationResult} label="Migration" />
        )}
        {seedResult && (
          <Result data={seedResult} label="Seed" />
        )}
      </Section>

      {/* Shopify */}
      <Section title="Shopify Connection">
        <div style={{ fontSize: '0.85rem', color: '#5f6880' }}>
          Shopify connection is managed via environment variables.
          The lib/shopify.js client auto-detects the store URL and API version.
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
          marginTop: '0.75rem', fontSize: '0.82rem',
        }}>
          <div style={kvStyle}><span style={kStyle}>Store URL</span> atica-brand.myshopify.com</div>
          <div style={kvStyle}><span style={kStyle}>API Version</span> 2025-04</div>
          <div style={kvStyle}><span style={kStyle}>Plan</span> Shopify Plus</div>
          <div style={kvStyle}><span style={kStyle}>Auth</span> Partners App Token</div>
        </div>
      </Section>

      {/* Architecture */}
      <Section title="Architecture">
        <div style={{ fontSize: '0.82rem', color: '#5f6880', lineHeight: 1.6 }}>
          Next.js + Supabase/Neon Postgres + Shopify REST API.
          Domain model in lib/domain.js (14 MP stages, 12 PO stages, 15 events).
          Compute in lib/workflow.js. Side effects in lib/effects.js.
          75 automated tests: <code>npm test</code>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h2 style={{
        fontSize: '0.92rem', fontWeight: 600, marginBottom: '0.75rem',
        paddingBottom: '0.5rem', borderBottom: '1px solid #e5e8ed',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Btn({ children, onClick, loading, variant }) {
  const isPrimary = variant === 'primary';
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: '0.45rem 1rem', borderRadius: 6, fontSize: '0.82rem',
      fontWeight: 500, cursor: loading ? 'wait' : 'pointer',
      border: isPrimary ? '1px solid #714b67' : '1px solid #d5d9e0',
      background: isPrimary ? '#714b67' : 'white',
      color: isPrimary ? 'white' : '#1e2330',
      opacity: loading ? 0.6 : 1,
    }}>
      {loading ? 'Working...' : children}
    </button>
  );
}

function Result({ data, label }) {
  return (
    <pre style={{
      padding: '0.75rem', background: '#f0f2f5', borderRadius: 6,
      fontSize: '0.75rem', overflow: 'auto', marginBottom: '0.75rem',
      border: data.error ? '1px solid #fecaca' : '1px solid #e5e8ed',
    }}>
      {label && <strong>{label}: </strong>}
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

const kvStyle = { padding: '0.5rem 0.75rem', background: '#f0f2f5', borderRadius: 6 };
const kStyle = { color: '#9ba3b5', fontSize: '0.72rem', display: 'block', marginBottom: '0.1rem' };
