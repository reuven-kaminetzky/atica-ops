import { getWarehouseData } from '../actions';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
  const { dashboard, receivingQueue, pendingTransfers, unconfirmed, activeRoutes, incomingShipments } = await getWarehouseData();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Warehouse</h1>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Receiving Queue" value={dashboard.receivingQueue ?? 0} color={dashboard.receivingQueue > 0 ? 'text-warning' : ''} />
        <Stat label="Pending Transfers" value={dashboard.pendingTransfers ?? 0} color={dashboard.pendingTransfers > 0 ? 'text-info' : ''} />
        <Stat label="Unconfirmed" value={dashboard.unconfirmedDeliveries ?? 0} color={dashboard.unconfirmedDeliveries > 0 ? 'text-danger' : ''} />
        <Stat label="Active Routes" value={dashboard.activeRoutes ?? 0} />
      </div>

      {/* Incoming Shipments */}
      <Section title={`Incoming Shipments (${incomingShipments.length})`}
        empty={incomingShipments.length === 0} emptyText="No shipments in transit">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b border-border">
            <Th>PO</Th><Th>Product</Th><Th>Vendor</Th><Th>Stage</Th><Th right>Units</Th><Th>ETA</Th>
          </tr></thead>
          <tbody>
            {incomingShipments.map(po => (
              <tr key={po.id} className="border-b border-border/30">
                <td className="py-2 px-3 font-semibold text-brand">{po.id}</td>
                <td className="py-2 px-3">{po.mp_name || '—'}</td>
                <td className="py-2 px-3 text-text-secondary">{po.vendor_name || '—'}</td>
                <td className="py-2 px-3">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    po.stage === 'in_transit' ? 'bg-success-light text-success' : 'bg-info-light text-info'
                  }`}>{po.stage?.replace(/_/g, ' ')}</span>
                </td>
                <td className="py-2 px-3 text-right">{(po.units || 0).toLocaleString()}</td>
                <td className="py-2 px-3 text-text-secondary">
                  {po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Receiving Queue */}
      <Section title={`Receiving Queue (${receivingQueue.length})`}
        empty={receivingQueue.length === 0} emptyText="Nothing to receive">
        {receivingQueue.map(r => (
          <div key={r.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
            <div>
              <div className="font-semibold text-sm">{r.id}</div>
              <div className="text-xs text-text-secondary mt-0.5">
                PO {r.po_id || '—'} · {r.container || 'No container'} · {r.mp_name || ''}
              </div>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
              r.status === 'in_progress' ? 'bg-warning-light text-warning' : 'bg-surface-sunken text-text-tertiary'
            }`}>{r.status}</span>
          </div>
        ))}
      </Section>

      {/* Pending Transfers */}
      <Section title={`Pending Transfers (${pendingTransfers.length})`}
        empty={pendingTransfers.length === 0} emptyText="No transfers queued">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b border-border">
            <Th>Transfer</Th><Th>To</Th><Th>Status</Th><Th right>Units</Th><Th>Created</Th>
          </tr></thead>
          <tbody>
            {pendingTransfers.map(tr => (
              <tr key={tr.id} className="border-b border-border/30">
                <td className="py-2 px-3 font-semibold">{tr.id}</td>
                <td className="py-2 px-3">{tr.to_location}</td>
                <td className="py-2 px-3">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-info-light text-info">{tr.status}</span>
                </td>
                <td className="py-2 px-3 text-right">{tr.total_units}</td>
                <td className="py-2 px-3 text-text-secondary text-xs">
                  {new Date(tr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Unconfirmed Deliveries */}
      {unconfirmed.length > 0 && (
        <Section title={`⚠ Unconfirmed Deliveries (${unconfirmed.length})`}>
          {unconfirmed.map(tr => {
            const hours = tr.delivered_at ? Math.round((Date.now() - new Date(tr.delivered_at)) / 3600000) : 0;
            return (
              <div key={tr.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                <div>
                  <div className="font-semibold text-sm">{tr.id} → {tr.to_location}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    {tr.total_units} units · Delivered {hours}h ago
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  hours >= 4 ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning'
                }`}>
                  {hours >= 4 ? 'ESCALATE' : 'Waiting'}
                </span>
              </div>
            );
          })}
        </Section>
      )}

      {/* Active Van Routes */}
      <Section title={`Van Routes (${activeRoutes.length})`}
        empty={activeRoutes.length === 0} emptyText="No active routes">
        {activeRoutes.map(route => (
          <div key={route.id} className="py-3 border-b border-border/30 last:border-0">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">{route.id} — {route.route_date}</div>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                route.status === 'departed' ? 'bg-success-light text-success' :
                route.status === 'loading' ? 'bg-warning-light text-warning' :
                'bg-surface-sunken text-text-tertiary'
              }`}>{route.status}</span>
            </div>
            <div className="text-xs text-text-secondary mt-1">
              {route.driver || 'No driver'} · {route.total_units} units · {route.total_transfers} stops
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-3 shadow-[--shadow-subtle]">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-xl font-bold tracking-tight ${color || ''}`}>{value}</div>
    </div>
  );
}

function Section({ title, children, empty, emptyText }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
      <h2 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h2>
      {empty ? <p className="text-sm text-text-tertiary py-4 text-center">{emptyText}</p> : children}
    </div>
  );
}

function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
