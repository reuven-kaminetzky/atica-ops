import { getDbHealth, getOperationalSummary } from './actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const [health, ops] = await Promise.all([
    getDbHealth(),
    getOperationalSummary(),
  ]);

  const inv = ops?.inventory || {};
  const hasData = inv.linked_mps > 0;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-text">Atica Man</h1>
        {ops?.lastSync?.time && (
          <div className="text-xs text-text-tertiary">
            Synced {new Date(ops.lastSync.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </div>
        )}
      </div>

      {health?.error && (
        <div className="p-4 rounded-[--radius-md] bg-danger-light border border-danger/20 text-danger text-sm mb-6">
          Database not connected: {health.error}
        </div>
      )}

      {!hasData && !health?.error && (
        <div className="p-4 rounded-[--radius-md] bg-warning-light border border-warning/20 text-sm mb-6">
          <span className="font-semibold">No data yet.</span>{' '}
          <Link href="/settings" className="text-brand underline">Settings → Run Migration → Seed → Sync</Link>
        </div>
      )}

      {/* Main navigation groups */}
      <div className="space-y-6">
        <NavGroup label="Buying">
          <Tile href="/purchase-orders" icon="◫" label="Purchase Orders" desc="Pipeline · stages · payments" accent="#2d6a4f" />
          <Tile href="/vendors" icon="⊞" label="Vendors" desc="Supplier cards · terms · history" accent="#264653" />
          <Tile href="/cash-flow" icon="◈" label="Cash Flow" desc="Projections · AP · OTB" accent="#714b67" />
        </NavGroup>

        <NavGroup label="Products">
          <Tile href="/products" icon="▤" label="Master Products" desc="Catalog · styles · matching" accent="#1d3557" />
          <Tile href="/stock" icon="▦" label="Stock" desc="Inventory · reorder · alerts" accent="#6c584c" />
          <Tile href="/warehouse" icon="⊡" label="Warehouse" desc="Receiving · transfers · bins" accent="#6c584c" />
        </NavGroup>

        <NavGroup label="Retail">
          <Tile href="/store" icon="⊟" label="Store" desc="Operations · daily · by location" accent="#457b9d" />
          <Tile href="/analytics" icon="◉" label="Analytics" desc="Velocity · sell-through · demand" accent="#1d3557" />
        </NavGroup>

        <NavGroup label="System">
          <Tile href="/settings" icon="⚙" label="Settings" desc="Sync · webhooks · verify · migrate" accent="#495057" />
        </NavGroup>
      </div>
    </div>
  );
}

function NavGroup({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-2 pl-1">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {children}
      </div>
    </div>
  );
}

function Tile({ href, icon, label, desc, accent }) {
  return (
    <Link
      href={href}
      className="group relative bg-surface rounded-[--radius-md] border border-border p-4 no-underline text-text shadow-[--shadow-subtle] hover:shadow-[--shadow-card] hover:border-border-strong transition-all overflow-hidden"
    >
      <div className="text-xl mb-2 opacity-70 group-hover:opacity-100 transition-opacity">{icon}</div>
      <div className="text-sm font-semibold leading-tight">{label}</div>
      <div className="text-[11px] text-text-secondary mt-0.5 leading-tight">{desc}</div>
      <div className="absolute top-0 right-0 w-[3px] h-full transition-all group-hover:w-1.5" style={{ background: accent }} />
    </Link>
  );
}

