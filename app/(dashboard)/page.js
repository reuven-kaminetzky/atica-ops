import { getDbHealth } from './actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const TILES = [
  { href: '/products', label: 'Master Products', desc: 'Catalog, PLM stages, tech packs', icon: '▤', accent: '#1d3557' },
  { href: '/purchase-orders', label: 'Purchase Orders', desc: '12-stage pipeline with gate checks', icon: '◫', accent: '#2d6a4f' },
  { href: '/cash-flow', label: 'Cash Flow', desc: '12-week projection, AP/AR', icon: '◈', accent: '#714b67' },
  { href: '/stock', label: 'Stock', desc: 'Inventory by product and store', icon: '▦', accent: '#6c584c' },
  { href: '/vendors', label: 'Vendors', desc: 'Vendor cards, PO rollup', icon: '⊞', accent: '#264653' },
  { href: '/analytics', label: 'Analytics', desc: 'Velocity, demand, margins', icon: '◩', accent: '#495057' },
];

export default async function DashboardHome() {
  const health = await getDbHealth();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-text mb-6">Operations Dashboard</h1>

      {health.error ? (
        <div className="p-4 rounded-[--radius-md] bg-danger-light border border-danger/20 text-danger text-sm mb-6">
          Database not connected: {health.error}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
          <Stat label="Products" value={health.products} />
          <Stat label="Vendors" value={health.vendors} />
          <Stat label="Active POs" value={health.active_pos} />
          <Stat label="Payments Due" value={health.payments_due} color={health.payments_due > 0 ? 'text-danger' : null} />
          <Stat label="Shipments" value={health.shipments} />
          <Stat label="Database" value="Postgres" color="text-success" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {TILES.map(t => (
          <Link key={t.href} href={t.href}
            className="group relative bg-surface rounded-[--radius-md] border border-border p-5 no-underline text-text shadow-[--shadow-subtle] hover:shadow-[--shadow-card] hover:border-border-strong transition-all overflow-hidden min-h-[120px] flex flex-col"
          >
            <div className="text-2xl mb-2 opacity-80 group-hover:opacity-100 transition-opacity">{t.icon}</div>
            <div className="text-[15px] font-semibold mb-0.5">{t.label}</div>
            <div className="text-xs text-text-secondary leading-relaxed">{t.desc}</div>
            <div className="absolute top-0 right-0 w-[3px] h-full transition-all group-hover:w-1.5" style={{ background: t.accent }} />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-3 shadow-[--shadow-subtle]">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-xl font-bold tracking-tight ${color || 'text-text'}`}>{value ?? '—'}</div>
    </div>
  );
}
