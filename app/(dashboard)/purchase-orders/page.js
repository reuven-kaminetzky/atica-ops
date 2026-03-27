import { getPurchaseOrders } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STAGE_COLORS = {
  concept: 'bg-surface-sunken text-text-tertiary',
  design: 'bg-info-light text-info',
  sample: 'bg-info-light text-info',
  approved: 'bg-purple-100 text-purple-700',
  costed: 'bg-warning-light text-warning',
  ordered: 'bg-blue-100 text-blue-700',
  production: 'bg-blue-100 text-blue-700',
  qc: 'bg-orange-100 text-orange-700',
  shipped: 'bg-success-light text-success',
  in_transit: 'bg-success-light text-success',
  received: 'bg-success-light text-success',
  distribution: 'bg-success-light text-success',
};

export default async function PurchaseOrdersPage() {
  const pos = await getPurchaseOrders();

  const stageCounts = {};
  for (const po of pos) stageCounts[po.stage || 'concept'] = (stageCounts[po.stage || 'concept'] || 0) + 1;
  const totalCommitted = pos.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {pos.length} POs · ${totalCommitted.toLocaleString()} committed
          </p>
        </div>
        <Link href="/purchase-orders/new"
          className="px-4 py-2 rounded-[--radius-sm] bg-brand text-white font-semibold text-sm no-underline hover:bg-brand-dark"
        >+ Create PO</Link>
      </div>

      {Object.keys(stageCounts).length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          {Object.entries(stageCounts).map(([stage, count]) => (
            <span key={stage} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STAGE_COLORS[stage] || 'bg-surface-sunken text-text-tertiary'}`}>
              {stage.replace(/_/g, ' ')} ({count})
            </span>
          ))}
        </div>
      )}

      {pos.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[--radius-md] border border-border">
          <p className="text-text-secondary">No purchase orders yet</p>
        </div>
      ) : (
        <div className="bg-surface rounded-[--radius-md] border border-border shadow-[--shadow-subtle] overflow-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-surface-raised">
                <Th>PO</Th><Th>Product</Th><Th>Vendor</Th><Th>Stage</Th>
                <Th right>Units</Th><Th right>FOB Total</Th><Th right>Payments</Th><Th>ETD</Th>
              </tr>
            </thead>
            <tbody>
              {pos.map(po => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-surface-raised/50">
                  <td className="px-3.5 py-2.5 text-sm font-semibold">
                    <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`} className="text-brand no-underline hover:underline">{po.id}</Link>
                  </td>
                  <td className="px-3.5 py-2.5 text-sm">{po.mp_name || po.mp_id || '—'}</td>
                  <td className="px-3.5 py-2.5 text-sm text-text-secondary">{po.vendor_name || '—'}</td>
                  <td className="px-3.5 py-2.5">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${STAGE_COLORS[po.stage] || 'bg-surface-sunken text-text-tertiary'}`}>
                      {(po.stage || 'concept').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-3.5 py-2.5 text-sm text-right font-mono">{(po.units || 0).toLocaleString()}</td>
                  <td className="px-3.5 py-2.5 text-sm text-right font-semibold font-mono">${parseFloat(po.fob_total || 0).toLocaleString()}</td>
                  <td className="px-3.5 py-2.5 text-right">
                    {parseInt(po.overdue_payments) || 0 > 0 && (
                      <span className="text-[11px] font-semibold text-danger">{po.overdue_payments} overdue</span>
                    )}
                  </td>
                  <td className="px-3.5 py-2.5 text-sm text-text-secondary">
                    {po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className={`px-3.5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}
