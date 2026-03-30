import { getVendor, getVendorScore } from '../../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const TIER_COLOR = {
  gold:     'text-yellow-600',
  silver:   'text-text-secondary',
  bronze:   'text-orange-600',
  watch:    'text-danger',
  unscored: 'text-text-tertiary',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function VendorDetailPage({ params }) {
  const { id } = await params;
  const [vendor, scoreData] = await Promise.all([
    getVendor(id),
    getVendorScore(id),
  ]);

  if (!vendor) return (
    <div className="py-12">
      <p className="text-text-secondary text-sm">Vendor not found.</p>
      <Link href="/vendors" className="text-brand text-sm">← Vendors</Link>
    </div>
  );

  const pos = vendor.purchaseOrders || [];
  const activePOs = pos.filter(p => !['received', 'distribution'].includes(p.stage));
  const completedPOs = pos.filter(p => ['received', 'distribution'].includes(p.stage));
  const totalCommitted = pos.reduce((s, p) => s + parseFloat(p.fob_total || 0), 0);

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/vendors" className="text-brand no-underline hover:underline">Vendors</Link>
        <span className="mx-2">›</span>
        <span>{vendor.name}</span>
      </div>

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight mb-1">{vendor.name}</h1>
        <p className="text-sm text-text-tertiary">
          {vendor.country || '—'}
          {vendor.preferred_terms && <> · {vendor.preferred_terms} terms</>}
          {vendor.avg_lead_days > 0 && <> · {vendor.avg_lead_days}d avg lead</>}
        </p>
      </div>

      {/* Summary row */}
      <div className="flex gap-6 text-sm border-b border-border pb-4 mb-6 flex-wrap">
        <div><span className="text-text-tertiary">POs </span><span className="font-semibold">{pos.length}</span></div>
        <div><span className="text-text-tertiary">Active </span><span className="font-semibold">{activePOs.length}</span></div>
        <div><span className="text-text-tertiary">Committed </span><span className="font-semibold">${Math.round(totalCommitted).toLocaleString()}</span></div>
        {scoreData?.score != null && (
          <div>
            <span className="text-text-tertiary">Score </span>
            <span className={`font-bold ${TIER_COLOR[scoreData.tier]}`}>
              {scoreData.score} — {scoreData.tier}
            </span>
          </div>
        )}
      </div>

      {/* Vendor score breakdown */}
      {scoreData?.score != null && scoreData.poCount > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
            Performance Score
          </h2>
          <div className="flex gap-6 text-sm">
            <div>
              <span className="text-text-tertiary">On-time </span>
              <span className="font-semibold">{scoreData.metrics.onTimeRate}%</span>
            </div>
            <div>
              <span className="text-text-tertiary">Lead accuracy </span>
              <span className="font-semibold">{scoreData.metrics.leadAccuracy}%</span>
            </div>
            <div>
              <span className="text-text-tertiary">QC pass </span>
              <span className="font-semibold">{scoreData.metrics.qcRate}%</span>
            </div>
            <div>
              <span className="text-text-tertiary">Comm. </span>
              <span className="font-semibold">{scoreData.metrics.communication}/5</span>
            </div>
          </div>
          <p className="text-xs text-text-tertiary mt-2">Based on {scoreData.poCount} completed POs.</p>
        </div>
      )}

      {/* Active POs */}
      {activePOs.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
            Active POs
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 text-left font-medium">PO</th>
                <th className="pb-2 pr-4 text-left font-medium">Product</th>
                <th className="pb-2 pr-4 text-left font-medium">Stage</th>
                <th className="pb-2 pr-4 text-right font-medium">Units</th>
                <th className="pb-2 pr-4 text-right font-medium">Value</th>
                <th className="pb-2 text-left font-medium">ETD</th>
              </tr>
            </thead>
            <tbody>
              {activePOs.map(po => (
                <tr key={po.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                  <td className="py-2.5 pr-4">
                    <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`}
                      className="text-brand no-underline hover:underline font-mono text-[12px]">
                      {po.id}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 font-medium">{po.mp_name || '—'}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{(po.stage || '').replace(/_/g, ' ')}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{po.units || '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">
                    ${parseFloat(po.fob_total || 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 text-text-secondary text-[12px]">{fmtDate(po.etd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Completed POs */}
      {completedPOs.length > 0 && (
        <details className="border border-border rounded-[--radius-sm]">
          <summary className="px-4 py-3 text-sm text-text-secondary cursor-pointer select-none hover:bg-surface-sunken list-none">
            Completed POs ({completedPOs.length})
          </summary>
          <div className="px-4 pb-3 pt-1 border-t border-border/50">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                  <th className="pb-2 pr-4 text-left font-medium">PO</th>
                  <th className="pb-2 pr-4 text-left font-medium">Product</th>
                  <th className="pb-2 pr-4 text-right font-medium">Units</th>
                  <th className="pb-2 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {completedPOs.map(po => (
                  <tr key={po.id} className="border-b border-border/40">
                    <td className="py-2 pr-4">
                      <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`}
                        className="text-brand no-underline hover:underline font-mono text-[12px]">
                        {po.id}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 text-text-secondary">{po.mp_name || '—'}</td>
                    <td className="py-2 pr-4 text-right font-mono text-[12px]">{po.units || '—'}</td>
                    <td className="py-2 text-right font-mono text-[12px]">
                      ${parseFloat(po.fob_total || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {pos.length === 0 && (
        <p className="text-text-tertiary text-sm">No purchase orders yet.</p>
      )}
    </div>
  );
}
