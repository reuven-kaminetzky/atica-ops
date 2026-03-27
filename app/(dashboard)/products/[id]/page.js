import { getProduct } from '../../actions';
import Link from 'next/link';

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  const mp = await getProduct(id);

  if (!mp) {
    return (
      <div className="text-center py-16">
        <h1 className="text-lg font-bold mb-2">Product not found</h1>
        <Link href="/products" className="text-brand text-sm">← Back to products</Link>
      </div>
    );
  }

  const margin = mp.fob > 0 && mp.retail > 0 ? ((1 - mp.fob * 1.34 / mp.retail) * 100).toFixed(0) : null;
  const landed = mp.fob > 0 ? (mp.fob * (1 + (mp.duty || 24) / 100) * 1.08).toFixed(2) : null;

  return (
    <div>
      <Link href="/products" className="text-sm text-brand no-underline hover:underline">← Back to products</Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{mp.name}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{mp.code} · {mp.category} · {mp.vendor_id || 'No vendor'}</p>
        </div>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-surface-sunken text-text-secondary">
          {(mp.phase || 'in_store').replace(/_/g, ' ')}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 mb-5">
        <Stat label="FOB" value={`$${mp.fob}`} />
        <Stat label="Retail" value={`$${mp.retail}`} />
        <Stat label="Margin" value={margin ? `${margin}%` : '—'} color={margin >= 55 ? 'text-success' : 'text-warning'} />
        <Stat label="Landed" value={landed ? `$${landed}` : '—'} />
        <Stat label="Lead" value={mp.lead_days ? `${mp.lead_days}d` : '—'} />
        <Stat label="MOQ" value={mp.moq || '—'} />
        <Stat label="Duty" value={mp.duty ? `${mp.duty}%` : '—'} />
        <Stat label="Stock" value={mp.total_inventory || 0} color={mp.total_inventory > 0 ? 'text-success' : 'text-danger'} />
      </div>

      {/* Fits */}
      {mp.fits?.length > 0 && (
        <Section title="Fits & Sizes">
          <div className="flex gap-1.5 flex-wrap">
            {mp.fits.map(f => <span key={f} className="text-xs px-2.5 py-1 rounded bg-surface-sunken text-text-secondary">{f}</span>)}
          </div>
          {mp.sizes && <div className="text-sm text-text-secondary mt-2">Size group: {mp.sizes}</div>}
        </Section>
      )}

      {/* Stack */}
      <Section title="Product Stack">
        {mp.stack ? (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <Field label="Fabric" value={mp.stack.fabric_type} />
              <Field label="Weight" value={mp.stack.fabric_weight} />
              <Field label="Composition" value={mp.stack.fabric_comp} />
              <Field label="Mill" value={mp.stack.fabric_mill} />
              <Field label="Lining" value={mp.stack.lining} />
              <Field label="Buttons" value={mp.stack.buttons} />
              <Field label="Origin" value={mp.stack.country_of_origin} />
              <Field label="AQL" value={mp.stack.aql_level} />
            </div>
            {mp.stack.completeness > 0 && (
              <div className="mt-4">
                <div className="text-[11px] text-text-secondary mb-1">Completeness: {mp.stack.completeness}%</div>
                <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    mp.stack.completeness >= 80 ? 'bg-success' : mp.stack.completeness >= 50 ? 'bg-warning' : 'bg-danger'
                  }`} style={{ width: `${mp.stack.completeness}%` }} />
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-text-tertiary">No stack data yet</p>
        )}
      </Section>

      {/* POs */}
      <Section title={`Purchase Orders (${mp.purchaseOrders?.length || 0})`}>
        {mp.purchaseOrders?.length > 0 ? (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary py-2">PO ID</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary py-2">Stage</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-text-tertiary py-2">Units</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-text-tertiary py-2">FOB Total</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-text-tertiary py-2">ETD</th>
              </tr>
            </thead>
            <tbody>
              {mp.purchaseOrders.map(po => (
                <tr key={po.id} className="border-b border-border/30">
                  <td className="py-2 font-semibold">
                    <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`} className="text-brand no-underline hover:underline">{po.id}</Link>
                  </td>
                  <td className="py-2">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-surface-sunken text-text-secondary font-semibold">
                      {(po.stage || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2 text-right">{po.units}</td>
                  <td className="py-2 text-right font-semibold">${parseFloat(po.fob_total || 0).toLocaleString()}</td>
                  <td className="py-2 text-text-secondary">
                    {po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-text-tertiary">No purchase orders</p>
        )}
      </Section>

      {/* PLM History */}
      {mp.plmHistory?.length > 0 && (
        <Section title="PLM History">
          {mp.plmHistory.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 text-sm last:border-0">
              <span>
                <span className="text-text-secondary">{h.from_phase?.replace(/_/g, ' ') || '—'}</span>
                <span className="text-text-tertiary mx-1.5">→</span>
                <span className="font-semibold">{h.to_phase?.replace(/_/g, ' ')}</span>
              </span>
              <span className="text-xs text-text-tertiary">
                {new Date(h.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-2.5">
      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold tracking-tight mt-0.5 ${color || ''}`}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
      <h2 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="py-1">
      <span className="text-text-tertiary text-xs">{label}: </span>
      <span className={value ? '' : 'text-border'}>{value || '—'}</span>
    </div>
  );
}
