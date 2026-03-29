import { getPurchaseOrders } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrdersPage() {
  const pos = await getPurchaseOrders();

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Purchase Orders</h1>
        <Link href="/purchase-orders/new"
          className="px-3 py-1.5 rounded-[--radius-sm] bg-brand text-white font-semibold text-sm no-underline hover:bg-brand-dark">
          + New PO
        </Link>
      </div>

      {pos.length === 0 ? (
        <p className="text-text-secondary py-8">No purchase orders yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
              <th className="pb-2 pr-4 font-medium">PO</th>
              <th className="pb-2 pr-4 font-medium">Product</th>
              <th className="pb-2 pr-4 font-medium">Vendor</th>
              <th className="pb-2 pr-4 font-medium">Stage</th>
              <th className="pb-2 pr-4 font-medium text-right">Units</th>
              <th className="pb-2 pr-4 font-medium text-right">FOB Total</th>
              <th className="pb-2 font-medium">ETD</th>
            </tr>
          </thead>
          <tbody>
            {pos.map(po => (
              <tr key={po.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                <td className="py-2.5 pr-4">
                  <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`}
                    className="text-brand no-underline hover:underline font-mono text-[12px] font-semibold">
                    {po.id}
                  </Link>
                </td>
                <td className="py-2.5 pr-4 font-medium">{po.mp_name || po.mp_id || '—'}</td>
                <td className="py-2.5 pr-4 text-text-secondary">{po.vendor_name || '—'}</td>
                <td className="py-2.5 pr-4 text-text-secondary">{(po.stage || '').replace(/_/g, ' ')}</td>
                <td className="py-2.5 pr-4 text-right font-mono">{(po.units || 0).toLocaleString()}</td>
                <td className={`py-2.5 pr-4 text-right font-mono ${
                  parseInt(po.overdue_payments) > 0 ? 'text-danger' : ''
                }`}>${parseFloat(po.fob_total || 0).toLocaleString()}</td>
                <td className="py-2.5 text-text-secondary">
                  {po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
