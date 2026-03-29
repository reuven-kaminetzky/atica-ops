import { getProducts } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const TARGET_WEEKS = 12;
const LEAD_WEEKS   = 4;

export default async function StockPage() {
  const products = await getProducts();

  const rows = products.map(mp => {
    const stock = parseInt(mp.total_inventory) || 0;
    const vel   = parseFloat(mp.velocity_per_week) || 0;
    const fob   = parseFloat(mp.fob) || 0;
    const moq   = parseInt(mp.moq) || 0;
    const days  = vel > 0 ? Math.round(stock / (vel / 7)) : null;
    const target = Math.ceil(vel * (TARGET_WEEKS + LEAD_WEEKS));
    const deficit = Math.max(0, target - stock);
    const reorder = moq > 0 ? Math.max(deficit, deficit > 0 ? moq : 0) : deficit;
    let priority = 3;
    if (stock === 0 && vel > 0) priority = 0;
    else if (days != null && days <= 30) priority = 1;
    else if (days != null && days <= 60) priority = 2;
    return { ...mp, stock, vel, fob, moq, days, reorder, reorderCost: reorder * fob, priority };
  }).sort((a, b) => a.priority - b.priority || (a.days ?? 999) - (b.days ?? 999));

  const oos = rows.filter(p => p.priority === 0);

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Stock</h1>
      <p className="text-sm text-text-tertiary mb-5">
        {TARGET_WEEKS}-week cover target · {LEAD_WEEKS}-week lead buffer
        {oos.length > 0 && <span className="text-danger font-semibold ml-2">· {oos.length} out of stock</span>}
      </p>

      {/* OOS alert */}
      {oos.length > 0 && (
        <div className="border border-danger/20 bg-danger/5 rounded-[--radius-sm] px-4 py-3 mb-5 text-sm">
          <span className="font-semibold text-danger">Out of stock with velocity: </span>
          <span className="text-text-secondary">{oos.map(p => p.name).join(', ')}</span>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
            <th className="pb-2 pr-4 font-medium">Product</th>
            <th className="pb-2 pr-4 font-medium text-right">Stock</th>
            <th className="pb-2 pr-4 font-medium text-right">Days</th>
            <th className="pb-2 pr-4 font-medium text-right">Vel/wk</th>
            <th className="pb-2 pr-4 font-medium text-right">Reorder</th>
            <th className="pb-2 font-medium text-right">POs</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(mp => (
            <tr key={mp.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
              <td className="py-2.5 pr-4">
                <Link href={`/products/${mp.id}`} className="font-medium text-text hover:text-brand no-underline">
                  {mp.name}
                </Link>
                <span className="text-text-tertiary text-[11px] ml-2">{mp.category}</span>
              </td>
              <td className={`py-2.5 pr-4 text-right font-mono text-[12px] ${
                mp.priority === 0 ? 'text-danger font-bold' :
                mp.priority === 1 ? 'text-danger' :
                mp.priority === 2 ? 'text-warning' : ''
              }`}>{mp.stock}</td>
              <td className={`py-2.5 pr-4 text-right font-mono text-[12px] ${
                mp.days != null && mp.days <= 30 ? 'text-danger' :
                mp.days != null && mp.days <= 60 ? 'text-warning' : 'text-text-secondary'
              }`}>{mp.days != null ? `${mp.days}d` : '—'}</td>
              <td className="py-2.5 pr-4 text-right font-mono text-[12px] text-text-secondary">
                {mp.vel > 0 ? mp.vel.toFixed(1) : '—'}
              </td>
              <td className={`py-2.5 pr-4 text-right font-mono text-[12px] ${mp.reorder > 0 ? 'font-semibold' : 'text-text-tertiary'}`}>
                {mp.reorder > 0 ? mp.reorder.toLocaleString() : '—'}
              </td>
              <td className="py-2.5 text-right">
                {(parseInt(mp.active_pos) || 0) > 0
                  ? <Link href={`/products/${mp.id}`} className="text-brand no-underline text-[12px]">{mp.active_pos}</Link>
                  : <span className="text-text-tertiary text-[12px]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
