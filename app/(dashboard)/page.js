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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-text">Operations Dashboard</h1>
        {ops?.lastSync?.time && (
          <div className="text-xs text-text-tertiary">
            Last sync: {new Date(ops.lastSync.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            <span className="ml-1 text-text-secondary">
              ({[
                ops.lastSync.matched != null && `${ops.lastSync.matched} matched`,
                ops.lastSync.stylesCreated != null && `${ops.lastSync.stylesCreated} styles`,
                ops.lastSync.orders != null && `${ops.lastSync.orders} orders`,
              ].filter(Boolean).join(' · ')})
            </span>
          </div>
        )}
      </div>

      {health?.error ? (
        <div className="p-4 rounded-[--radius-md] bg-danger-light border border-danger/20 text-danger text-sm mb-6">
          Database not connected: {health.error}
        </div>
      ) : !hasData ? (
        <div className="p-4 rounded-[--radius-md] bg-warning-light border border-warning/20 text-sm mb-6">
          <span className="font-semibold">No Shopify data yet.</span>{' '}Go to{' '}
          <Link href="/settings" className="text-brand underline">Settings</Link>{' '}→ Run Migration → Seed Data → Sync Products.
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top velocity */}
        <Card title="Top Selling Products" link="/analytics">
          {(ops?.topVelocity || []).length > 0 ? (
            <div className="space-y-2">
              {ops.topVelocity.map((mp, i) => (
                <Link key={mp.id} href={`/products/${mp.id}`} className="flex items-center gap-3 py-2 no-underline text-text hover:bg-surface-sunken -mx-2 px-2 rounded transition-colors">
                  <span className="text-xs font-bold text-text-tertiary w-4">{i + 1}</span>
                  {mp.hero_image ? (
                    <img src={mp.hero_image} alt="" className="w-8 h-8 rounded object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded bg-surface-sunken" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{mp.name}</div>
                    <div className="text-xs text-text-secondary">{mp.category}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">{mp.velocity_per_week}/wk</div>
                    <div className="text-xs text-text-secondary">{mp.total_inventory} in stock</div>
                  </div>
                  {mp.signal && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      mp.signal === 'hot' ? 'bg-success-light text-success' :
                      mp.signal === 'rising' ? 'bg-info-light text-info' :
                      mp.signal === 'slow' ? 'bg-danger-light text-danger' :
                      'bg-surface-sunken text-text-secondary'
                    }`}>{mp.signal}</span>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <Empty>Run Sync → 3. Orders to compute velocity</Empty>
          )}
        </Card>

        {/* Stock alerts */}
        <Card title="Stock Alerts" link="/stock">
          {(ops?.stockAlerts || []).length > 0 ? (
            <div className="space-y-2">
              {ops.stockAlerts.map(mp => (
                <Link key={mp.id} href={`/products/${mp.id}`} className="flex items-center justify-between py-2 no-underline text-text hover:bg-surface-sunken -mx-2 px-2 rounded transition-colors">
                  <div>
                    <div className="text-sm font-semibold">{mp.name}</div>
                    <div className="text-xs text-text-secondary">{mp.category} · {mp.velocity_per_week}/wk velocity</div>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    (mp.total_inventory || 0) === 0 ? 'bg-danger text-white' : 'bg-warning text-white'
                  }`}>{(mp.total_inventory || 0) === 0 ? 'OUT' : `${mp.days_of_stock}d left`}</span>
                </Link>
              ))}
            </div>
          ) : (
            <Empty>No stock alerts — looking good</Empty>
          )}
        </Card>

        {/* PO Pipeline */}
        <Card title="PO Pipeline" link="/purchase-orders">
          {(ops?.pipeline || []).length > 0 ? (
            <div className="space-y-1.5">
              {ops.pipeline.map(s => (
                <div key={s.stage} className="flex items-center justify-between py-1.5">
                  <span className="text-sm capitalize">{s.stage.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-text-secondary">${Number(s.value || 0).toLocaleString()}</span>
                    <span className="text-sm font-bold bg-surface-sunken px-2 py-0.5 rounded">{s.count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No purchase orders yet. <Link href="/purchase-orders/new" className="text-brand underline">Create one →</Link></Empty>
          )}
        </Card>

        {/* Payments due */}
        <Card title="Payments Due" link="/cash-flow">
          {(ops?.paymentsDue || []).length > 0 ? (
            <div className="space-y-2">
              {ops.paymentsDue.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1.5">
                  <div>
                    <div className="text-sm font-semibold">{p.po_id}</div>
                    <div className="text-xs text-text-secondary">{p.vendor_name} · {p.label}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">${Number(p.amount || 0).toLocaleString()}</div>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      p.status === 'overdue' ? 'bg-danger text-white' :
                      p.status === 'due' ? 'bg-warning text-white' :
                      'bg-surface-sunken text-text-secondary'
                    }`}>{p.status}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty>No payments due</Empty>
          )}
        </Card>
      </div>

      {/* Navigation tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {TILES.map(t => (
          <Link key={t.href} href={t.href}
            className="group relative bg-surface rounded-[--radius-md] border border-border p-4 no-underline text-text shadow-[--shadow-subtle] hover:shadow-[--shadow-card] hover:border-border-strong transition-all overflow-hidden"
          >
            <div className="text-xl mb-1 opacity-80 group-hover:opacity-100 transition-opacity">{t.icon}</div>
            <div className="text-sm font-semibold">{t.label}</div>
            <div className="text-[11px] text-text-secondary mt-0.5">{t.desc}</div>
            <div className="absolute top-0 right-0 w-[3px] h-full transition-all group-hover:w-1.5" style={{ background: t.accent }} />
          </Link>
        ))}
      </div>
    </div>
  );
}

const TILES = [
  { href: '/products', label: 'Products', desc: 'Catalog & PLM', icon: '▤', accent: '#1d3557' },
  { href: '/purchase-orders', label: 'Purchase Orders', desc: 'Pipeline', icon: '◫', accent: '#2d6a4f' },
  { href: '/cash-flow', label: 'Cash Flow', desc: 'Projection', icon: '◈', accent: '#714b67' },
  { href: '/stock', label: 'Stock', desc: 'Inventory', icon: '▦', accent: '#6c584c' },
  { href: '/vendors', label: 'Vendors', desc: 'Supplier cards', icon: '⊞', accent: '#264653' },
  { href: '/warehouse', label: 'Warehouse', desc: 'Receiving & transfers', icon: '⊡', accent: '#6c584c' },
  { href: '/store', label: 'Store', desc: 'Store operations', icon: '⊟', accent: '#457b9d' },
  { href: '/settings', label: 'Settings', desc: 'Sync & config', icon: '⚙', accent: '#495057' },
];

function Card({ title, link, children }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
        <h2 className="text-sm font-semibold">{title}</h2>
        {link && <Link href={link} className="text-[11px] text-brand no-underline hover:underline">View all →</Link>}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-sm text-text-tertiary py-3">{children}</p>;
}

function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString();
}
