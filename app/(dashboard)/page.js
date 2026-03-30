import { getDbHealth, getOperationalSummary, getAlerts } from './actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const [health, ops, dbAlerts] = await Promise.all([
    getDbHealth(),
    getOperationalSummary(),
    getAlerts(20),
  ]);

  const inv     = ops?.inventory || {};
  const hasData = inv.linked_mps > 0;

  // Use DB alerts if available, fall back to computed from operational data
  let alerts = [];
  if (dbAlerts.length > 0) {
    alerts = dbAlerts.map(a => ({
      severity: a.severity,
      message: a.title + (a.message ? ` — ${a.message}` : ''),
      href: a.action_url || '/',
    }));
  } else {
    // Fallback: compute from operational summary until alerts table is seeded
    for (const p of (ops?.paymentsDue || [])) {
      if (p.status === 'overdue') alerts.push({ severity: 'critical', message: `${p.vendor_name || p.po_id} — $${Number(p.amount || 0).toLocaleString()} overdue`, href: '/cash-flow' });
      else if (p.status === 'due') alerts.push({ severity: 'warning', message: `${p.vendor_name || p.po_id} — $${Number(p.amount || 0).toLocaleString()} due`, href: '/cash-flow' });
    }
    for (const mp of (ops?.stockAlerts || [])) {
      if ((parseInt(mp.total_inventory) || 0) === 0) alerts.push({ severity: 'critical', message: `${mp.name} — out of stock`, href: `/products/${mp.id}` });
      else if (parseInt(mp.days_of_stock) < 14) alerts.push({ severity: 'warning', message: `${mp.name} — ${mp.days_of_stock}d cover`, href: `/products/${mp.id}` });
    }
  }

  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Atica Man</h1>
        {ops?.lastSync?.time && (
          <span className="text-xs text-text-tertiary">
            Synced {new Date(ops.lastSync.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* System alerts */}
      {health?.error && (
        <div className="border border-danger/20 bg-danger/5 rounded-[--radius-sm] px-4 py-3 mb-5 text-sm text-danger">
          Database not connected: {health.error}
        </div>
      )}

      {!hasData && !health?.error && (
        <div className="border border-warning/20 bg-warning/5 rounded-[--radius-sm] px-4 py-3 mb-5 text-sm">
          <span className="font-semibold">No data yet.</span>{' '}
          <Link href="/settings" className="text-brand underline">Settings → Run Migration → Seed → Sync</Link>
        </div>
      )}

      {/* Operational alerts */}
      {alerts.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
            Needs attention
          </div>
          <div className="space-y-1">
            {critical.map((a, i) => (
              <Link key={i} href={a.href}
                className="flex items-center gap-3 px-4 py-2.5 rounded-[--radius-sm] border border-danger/20 bg-danger/5 no-underline hover:bg-danger/10 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
                <span className="text-sm text-danger font-medium">{a.message}</span>
              </Link>
            ))}
            {warnings.map((a, i) => (
              <Link key={i} href={a.href}
                className="flex items-center gap-3 px-4 py-2.5 rounded-[--radius-sm] border border-warning/20 bg-warning/5 no-underline hover:bg-warning/10 transition-colors">
                <span className="w-1.5 h-1.5 rounded-full bg-warning flex-shrink-0" />
                <span className="text-sm text-warning">{a.message}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="space-y-5">
        <NavGroup label="Buying">
          <Tile href="/purchase-orders" icon="◫" label="Purchase Orders" accent="#2d6a4f" />
          <Tile href="/vendors"         icon="⊞" label="Vendors"          accent="#264653" />
          <Tile href="/cash-flow"       icon="◈" label="Cash Flow"        accent="#714b67" />
        </NavGroup>

        <NavGroup label="Products">
          <Tile href="/products"  icon="▤" label="Products"   accent="#1d3557" />
          <Tile href="/stock"     icon="▦" label="Stock"      accent="#6c584c" />
          <Tile href="/warehouse" icon="⊡" label="Warehouse"  accent="#6c584c" />
          <Tile href="/transfers" icon="⇄" label="Transfers"  accent="#6c584c" />
        </NavGroup>

        <NavGroup label="Retail">
          <Tile href="/store"     icon="⊟" label="Store"      accent="#457b9d" />
          <Tile href="/sales"     icon="◎" label="Sales"      accent="#2d6a4f" />
          <Tile href="/analytics" icon="◉" label="Analytics"  accent="#1d3557" />
        </NavGroup>

        <NavGroup label="System">
          <Tile href="/settings" icon="⚙" label="Settings" accent="#495057" />
        </NavGroup>
      </div>
    </div>
  );
}

function NavGroup({ label, children }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-text-tertiary mb-1.5">{label}</div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Tile({ href, icon, label, accent }) {
  return (
    <Link href={href}
      className="group relative bg-surface rounded-[--radius-sm] border border-border px-3 py-3 no-underline text-text hover:border-border-strong hover:bg-surface-raised transition-all overflow-hidden flex items-center gap-2.5">
      <span className="text-base opacity-60 group-hover:opacity-90 transition-opacity">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
      <div className="absolute top-0 right-0 w-[3px] h-full group-hover:w-1" style={{ background: accent }} />
    </Link>
  );
}
