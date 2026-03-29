import { getProducts } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const TARGET_COVER_WEEKS = 12;
const LEAD_BUFFER_WEEKS = 4;

export default async function StockPage() {
  const products = await getProducts();

  const enriched = products.map(mp => {
    const stock = parseInt(mp.total_inventory) || 0;
    const vel = parseFloat(mp.velocity_per_week) || 0;
    const fob = parseFloat(mp.fob) || 0;
    const retail = parseFloat(mp.retail) || 0;
    const moq = parseInt(mp.moq) || 0;
    const days = vel > 0 ? Math.round(stock / (vel / 7)) : 999;
    const signal = mp.signal || (stock === 0 ? 'stockout' : 'steady');

    const targetUnits = Math.ceil(vel * (TARGET_COVER_WEEKS + LEAD_BUFFER_WEEKS));
    const deficit = Math.max(0, targetUnits - stock);
    const reorderQty = moq > 0 ? Math.max(deficit, deficit > 0 ? moq : 0) : deficit;
    const reorderCost = reorderQty * fob;

    let priority = 3;
    if (stock === 0 && vel > 0) priority = 0;
    else if (days <= 30 && vel > 0) priority = 1;
    else if (days <= 60) priority = 2;

    return { ...mp, stock, vel, fob, retail, days, signal, moq, reorderQty, reorderCost, priority };
  });

  enriched.sort((a, b) => a.priority - b.priority || a.days - b.days);

  const totalStock = enriched.reduce((s, p) => s + p.stock, 0);
  const totalValue = enriched.reduce((s, p) => s + p.stock * p.fob, 0);
  const needsReorder = enriched.filter(p => p.reorderQty > 0);
  const totalReorderCost = needsReorder.reduce((s, p) => s + p.reorderCost, 0);
  const outOfStock = enriched.filter(p => p.stock === 0 && p.vel > 0);

  const sigColors = { hot: 'bg-red-100 text-red-700', rising: 'bg-orange-100 text-orange-700', steady: 'bg-green-100 text-green-700', slow: 'bg-blue-100 text-blue-700', stockout: 'bg-red-100 text-red-800' };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Stock & Reorder</h1>
      <p className="text-sm text-text-secondary mb-5">{TARGET_COVER_WEEKS}-week cover target + {LEAD_BUFFER_WEEKS}-week lead buffer</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Total Units" value={totalStock.toLocaleString()} />
        <Stat label="FOB Value" value={`$${Math.round(totalValue).toLocaleString()}`} />
        <Stat label="Need Reorder" value={needsReorder.length} color={needsReorder.length > 3 ? 'text-warning' : ''} />
        <Stat label="Reorder Cost" value={`$${Math.round(totalReorderCost).toLocaleString()}`} color={totalReorderCost > 50000 ? 'text-danger' : ''} />
      </div>

      {outOfStock.length > 0 && (
        <div className="bg-danger/5 border border-danger/20 rounded-[--radius-md] p-3 mb-4">
          <div className="text-sm font-bold text-danger mb-1">Out of Stock — Products with velocity</div>
          <div className="text-xs text-text-secondary">{outOfStock.map(p => p.name).join(', ')}</div>
        </div>
      )}

      <div className="bg-surface rounded-[--radius-md] border border-border shadow-[--shadow-subtle] overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-surface-raised">
            <Th>Product</Th><Th right>Stock</Th><Th right>Days</Th><Th>Signal</Th><Th right>Vel/wk</Th><Th right>Reorder</Th><Th right>Cost</Th><Th right>POs</Th>
          </tr></thead>
          <tbody>
            {enriched.map(mp => {
              const sc = mp.priority === 0 ? 'text-danger font-bold' : mp.priority === 1 ? 'text-danger' : mp.priority === 2 ? 'text-warning' : '';
              const rb = mp.priority === 0 ? 'bg-danger/5' : mp.priority === 1 ? 'bg-danger/[0.02]' : '';
              return (
                <tr key={mp.id} className={`border-b border-border/30 ${rb}`}>
                  <td className="py-2.5 px-3">
                    <Link href={`/products/${mp.id}`} className="text-text no-underline hover:text-brand font-semibold text-sm">{mp.name}</Link>
                    <div className="text-[11px] text-text-tertiary">{mp.category} · {mp.vendor_id || '—'}</div>
                  </td>
                  <td className={`py-2.5 px-3 text-right ${sc}`}>{mp.stock}</td>
                  <td className={`py-2.5 px-3 text-right ${mp.days < 999 ? sc : 'text-text-tertiary'}`}>{mp.days < 999 ? `${mp.days}d` : '—'}</td>
                  <td className="py-2.5 px-3"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${sigColors[mp.signal] || 'bg-surface-sunken text-text-tertiary'}`}>{mp.signal}</span></td>
                  <td className="py-2.5 px-3 text-right text-text-secondary">{mp.vel > 0 ? mp.vel.toFixed(1) : '—'}</td>
                  <td className={`py-2.5 px-3 text-right font-semibold ${mp.reorderQty > 0 ? 'text-brand' : 'text-text-tertiary'}`}>{mp.reorderQty > 0 ? mp.reorderQty : '—'}</td>
                  <td className="py-2.5 px-3 text-right text-text-secondary">{mp.reorderCost > 0 ? `$${Math.round(mp.reorderCost).toLocaleString()}` : '—'}</td>
                  <td className="py-2.5 px-3 text-right">{(parseInt(mp.active_pos) || 0) > 0 ? <span className="text-info font-semibold">{mp.active_pos}</span> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-3">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-xl font-bold tracking-tight ${color || ''}`}>{value}</div>
    </div>
  );
}
function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
