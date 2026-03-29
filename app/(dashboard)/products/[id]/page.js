import { getProduct } from '../../actions';
const { LANDED_COST_FACTOR, DEFAULT_DUTY_PCT, FREIGHT_MULTIPLIER } = require("../../../../lib/constants");
import StackEditor from '../../../../components/stack-editor';
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

  const margin = mp.fob > 0 && mp.retail > 0 ? ((1 - mp.fob * LANDED_COST_FACTOR / mp.retail) * 100).toFixed(0) : null;
  const landed = mp.fob > 0 ? (mp.fob * (1 + (mp.duty || DEFAULT_DUTY_PCT) / 100) * FREIGHT_MULTIPLIER).toFixed(2) : null;

  // Reorder calculation
  const vel = parseFloat(mp.velocity_per_week) || 0;
  const stock = parseInt(mp.total_inventory) || 0;
  const targetWeeks = 16; // 12 cover + 4 lead buffer
  const targetUnits = Math.ceil(vel * targetWeeks);
  const deficit = Math.max(0, targetUnits - stock);
  const moq = parseInt(mp.moq) || 0;
  const reorderQty = moq > 0 && deficit > 0 ? Math.max(deficit, moq) : deficit;

  return (
    <div>
      <Link href="/products" className="text-sm text-brand no-underline hover:underline">← Back to products</Link>

      {mp.hero_image && (
        <div className="mt-3 mb-4 rounded-[--radius-md] overflow-hidden bg-surface-sunken h-48 sm:h-64">
          <img src={mp.hero_image} alt={mp.name} className="w-full h-full object-cover" />
        </div>
      )}

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
        <Stat label="Margin" value={margin ? `${margin}%` : '—'} color={parseInt(margin) >= 55 ? 'text-success' : 'text-warning'} />
        <Stat label="Landed" value={landed ? `$${landed}` : '—'} />
        <Stat label="Stock" value={mp.total_inventory || 0} color={(parseInt(mp.total_inventory) || 0) > 0 ? 'text-success' : 'text-danger'} />
        <Stat label="Vel/wk" value={parseFloat(mp.velocity_per_week) > 0 ? parseFloat(mp.velocity_per_week).toFixed(1) : '—'} />
        <Stat label="Days Left" value={parseInt(mp.days_of_stock) > 0 && parseInt(mp.days_of_stock) < 999 ? `${mp.days_of_stock}d` : '—'} color={parseInt(mp.days_of_stock) < 30 ? 'text-danger' : parseInt(mp.days_of_stock) < 60 ? 'text-warning' : ''} />
        <Stat label="Signal" value={mp.signal || '—'} color={mp.signal === 'hot' ? 'text-danger' : mp.signal === 'rising' ? 'text-warning' : mp.signal === 'slow' ? 'text-info' : ''} />
      </div>

      {/* Reorder suggestion */}
      {reorderQty > 0 && (
        <div className="bg-brand/5 border border-brand/20 rounded-[--radius-md] p-4 mb-5 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-brand">Reorder Suggested</div>
            <div className="text-xs text-text-secondary mt-0.5">
              {reorderQty} units · ${Math.round(reorderQty * mp.fob).toLocaleString()} FOB · {mp.lead_days || 90}d lead time
            </div>
          </div>
          <Link href={`/purchase-orders/new?mp=${mp.id}`}
            className="px-3 py-1.5 rounded-[--radius-sm] bg-brand text-white text-sm font-semibold no-underline hover:bg-brand-dark">
            Create PO
          </Link>
        </div>
      )}

      {/* Fits */}
      {mp.fits?.length > 0 && (
        <Section title="Fits & Sizes">
          <div className="flex gap-1.5 flex-wrap">
            {mp.fits.map(f => <span key={f} className="text-xs px-2.5 py-1 rounded bg-surface-sunken text-text-secondary">{f}</span>)}
          </div>
          {mp.sizes && <div className="text-sm text-text-secondary mt-2">Size group: {mp.sizes}</div>}
        </Section>
      )}

      {/* Stack — editable */}
      <StackEditor mpId={mp.id} stack={mp.stack} />

      {/* Styles (colorways from Shopify) */}
      {mp.styles?.length > 0 && (
        <Section title={`Styles — ${mp.styles.length} colorways`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {mp.styles.map(s => (
              <div key={s.id} className="flex items-start gap-3 p-3 rounded-[--radius-sm] border border-border/50 hover:border-border transition-colors">
                {s.hero_image && (
                  <div className="w-14 h-14 rounded bg-surface-sunken overflow-hidden flex-shrink-0">
                    <img src={s.hero_image} alt={s.colorway || s.title} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{s.colorway || s.title}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-secondary">
                    <span>${parseFloat(s.retail || 0).toFixed(0)}</span>
                    <span className="text-text-tertiary">·</span>
                    <span className={(parseInt(s.inventory) || 0) === 0 ? 'text-danger font-semibold' : (parseInt(s.inventory) || 0) < 10 ? 'text-warning' : ''}>{s.inventory || 0} units</span>
                    <span className="text-text-tertiary">·</span>
                    <span>{s.variant_count || 0} SKUs</span>
                  </div>
                  {s.grade && (
                    <span className={`mt-1 inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      s.grade === 'A' ? 'bg-success-light text-success' :
                      s.grade === 'B' ? 'bg-info-light text-info' :
                      s.grade === 'C' ? 'bg-warning-light text-warning' :
                      'bg-surface-sunken text-text-tertiary'
                    }`}>Grade {s.grade}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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
