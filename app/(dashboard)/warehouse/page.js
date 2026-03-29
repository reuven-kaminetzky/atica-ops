import { getWarehouseData } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
  const { dashboard, receivingQueue, pendingTransfers, unconfirmed, activeRoutes, incomingShipments } = await getWarehouseData();

  const alerts = [
    unconfirmed.length  > 0 && `${unconfirmed.length} unconfirmed deliver${unconfirmed.length > 1 ? 'ies' : 'y'}`,
    receivingQueue.length > 0 && `${receivingQueue.length} to receive`,
  ].filter(Boolean);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Warehouse</h1>
      <p className="text-sm text-text-tertiary mb-5">
        {pendingTransfers.length} transfers pending
        {activeRoutes.length > 0 && ` · ${activeRoutes.length} van route${activeRoutes.length > 1 ? 's' : ''} active`}
        {alerts.length > 0 && <span className="text-danger font-semibold"> · {alerts.join(' · ')}</span>}
      </p>

      {/* Unconfirmed alert */}
      {unconfirmed.length > 0 && (
        <div className="border border-danger/20 bg-danger/5 rounded-[--radius-sm] px-4 py-3 mb-5">
          <p className="text-sm font-semibold text-danger mb-2">Unconfirmed deliveries</p>
          {unconfirmed.map(tr => {
            const hours = tr.delivered_at ? Math.round((Date.now() - new Date(tr.delivered_at)) / 3600000) : 0;
            return (
              <div key={tr.id} className="flex items-center justify-between py-1.5 text-sm border-b border-danger/10 last:border-0">
                <span>
                  <span className="font-mono text-[12px]">{tr.id}</span>
                  <span className="text-text-secondary ml-2">→ {tr.to_location} · {tr.total_units} units · {hours}h ago</span>
                </span>
                <span className={`text-xs font-semibold ${hours >= 4 ? 'text-danger' : 'text-warning'}`}>
                  {hours >= 4 ? 'ESCALATE' : 'awaiting'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Incoming shipments */}
      {incomingShipments.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Incoming Shipments</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">PO</th>
                <th className="pb-2 pr-4 font-medium">Product</th>
                <th className="pb-2 pr-4 font-medium">Vendor</th>
                <th className="pb-2 pr-4 font-medium">Stage</th>
                <th className="pb-2 pr-4 font-medium text-right">Units</th>
                <th className="pb-2 font-medium">ETA</th>
              </tr>
            </thead>
            <tbody>
              {incomingShipments.map(po => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                  <td className="py-2.5 pr-4">
                    <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`}
                      className="text-brand no-underline hover:underline font-mono text-[12px]">{po.id}</Link>
                  </td>
                  <td className="py-2.5 pr-4 font-medium">{po.mp_name || '—'}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{po.vendor_name || '—'}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{po.stage?.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{(po.units || 0).toLocaleString()}</td>
                  <td className="py-2.5 text-text-secondary">
                    {po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Receiving queue */}
      {receivingQueue.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Receiving Queue</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">ID</th>
                <th className="pb-2 pr-4 font-medium">PO</th>
                <th className="pb-2 pr-4 font-medium">Container</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {receivingQueue.map(r => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-mono text-[12px]">{r.id}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{r.po_id || '—'}</td>
                  <td className="py-2.5 pr-4 text-text-secondary font-mono text-[12px]">{r.container || '—'}</td>
                  <td className={`py-2.5 ${r.status === 'in_progress' ? 'text-warning font-semibold' : 'text-text-tertiary'}`}>
                    {r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pending transfers */}
      {pendingTransfers.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Pending Transfers</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Transfer</th>
                <th className="pb-2 pr-4 font-medium">To</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium text-right">Units</th>
                <th className="pb-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {pendingTransfers.map(tr => (
                <tr key={tr.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-mono text-[12px]">{tr.id}</td>
                  <td className="py-2.5 pr-4">{tr.to_location}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{tr.status}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{tr.total_units}</td>
                  <td className="py-2.5 text-text-secondary text-[12px]">
                    {new Date(tr.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active van routes */}
      {activeRoutes.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Van Routes</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Route</th>
                <th className="pb-2 pr-4 font-medium">Date</th>
                <th className="pb-2 pr-4 font-medium">Driver</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 pr-4 font-medium text-right">Units</th>
                <th className="pb-2 font-medium text-right">Stops</th>
              </tr>
            </thead>
            <tbody>
              {activeRoutes.map(r => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-mono text-[12px]">{r.id}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{r.route_date}</td>
                  <td className="py-2.5 pr-4">{r.driver || '—'}</td>
                  <td className={`py-2.5 pr-4 ${r.status === 'departed' ? 'text-success' : r.status === 'loading' ? 'text-warning' : 'text-text-secondary'}`}>
                    {r.status}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{r.total_units}</td>
                  <td className="py-2.5 text-right text-text-secondary">{r.total_transfers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {incomingShipments.length === 0 && receivingQueue.length === 0 && pendingTransfers.length === 0 && activeRoutes.length === 0 && (
        <p className="text-text-tertiary text-sm py-8">Nothing active in warehouse.</p>
      )}
    </div>
  );
}
