import { getProducts, getPurchaseOrders } from '../actions';
import Link from 'next/link';
const { LANDED_COST_FACTOR } = require("../../../lib/constants");

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const [products, pos] = await Promise.all([getProducts(), getPurchaseOrders()]);

  // Category stats with inventory value
  const catStats = {};
  for (const mp of products) {
    const cat = mp.category || 'Other';
    if (!catStats[cat]) catStats[cat] = { count: 0, stock: 0, oos: 0, costValue: 0, retailValue: 0, velocity: 0 };
    const stock = parseInt(mp.total_inventory) || 0;
    const fob = parseFloat(mp.fob) || 0;
    const retail = parseFloat(mp.retail) || 0;
    const vel = parseFloat(mp.velocity_per_week) || 0;
    catStats[cat].count++;
    catStats[cat].stock += stock;
    if (stock === 0 && mp.external_ids?.length > 0) catStats[cat].oos++;
    catStats[cat].costValue += stock * fob;
    catStats[cat].retailValue += stock * retail;
    catStats[cat].velocity += vel;
  }

  // Top and bottom performers
  const withVelocity = products.filter(p => parseFloat(p.velocity_per_week) > 0);
  const topSellers = [...withVelocity].sort((a, b) => parseFloat(b.velocity_per_week) - parseFloat(a.velocity_per_week)).slice(0, 8);
  const slowMovers = [...products].filter(p => (parseInt(p.total_inventory) || 0) > 50 && (parseFloat(p.velocity_per_week) || 0) < 1).sort((a, b) => (parseInt(b.total_inventory) || 0) - (parseInt(a.total_inventory) || 0)).slice(0, 8);

  // PO pipeline
  const stageCounts = {};
  for (const po of pos) {
    const s = (po.stage || 'concept').replace(/_/g, ' ');
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  }

  const totalStock = products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0), 0);
  const totalCostValue = products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0) * (parseFloat(p.fob) || 0), 0);
  const totalRetailValue = products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0) * (parseFloat(p.retail) || 0), 0);
  const totalPOValue = pos.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Analytics</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Total Units" value={totalStock.toLocaleString()} />
        <Stat label="Cost Value" value={`$${Math.round(totalCostValue).toLocaleString()}`} />
        <Stat label="Retail Value" value={`$${Math.round(totalRetailValue).toLocaleString()}`} />
        <Stat label="PO Pipeline" value={`$${Math.round(totalPOValue).toLocaleString()}`} />
      </div>

      {/* Category breakdown with investment */}
      <Section title="Category Investment">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b border-border">
            <Th>Category</Th><Th right>MPs</Th><Th right>Units</Th><Th right>Cost Value</Th><Th right>Retail Value</Th><Th right>Vel/wk</Th><Th right>OOS</Th>
          </tr></thead>
          <tbody>
            {Object.entries(catStats).sort((a, b) => b[1].retailValue - a[1].retailValue).map(([cat, s]) => (
              <tr key={cat} className="border-b border-border/30">
                <td className="py-2 px-3 font-semibold">{cat}</td>
                <td className="py-2 px-3 text-right">{s.count}</td>
                <td className="py-2 px-3 text-right">{s.stock.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-mono">${Math.round(s.costValue).toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-mono">${Math.round(s.retailValue).toLocaleString()}</td>
                <td className="py-2 px-3 text-right">{s.velocity > 0 ? s.velocity.toFixed(1) : '—'}</td>
                <td className={`py-2 px-3 text-right ${s.oos > 0 ? 'text-danger font-semibold' : 'text-success'}`}>{s.oos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Top sellers */}
        <Section title="Top Sellers (by velocity)">
          {topSellers.length > 0 ? topSellers.map((mp, i) => (
            <Link key={mp.id} href={`/products/${mp.id}`} className="flex items-center gap-3 py-2 no-underline text-text hover:bg-surface-sunken -mx-2 px-2 rounded transition-colors">
              <span className="text-xs font-bold text-text-tertiary w-4">{i + 1}</span>
              {mp.hero_image ? <img src={mp.hero_image} alt="" className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 rounded bg-surface-sunken" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{mp.name}</div>
                <div className="text-xs text-text-secondary">{mp.category}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold">{parseFloat(mp.velocity_per_week).toFixed(1)}/wk</div>
                <div className="text-xs text-text-secondary">{mp.total_inventory} units</div>
              </div>
            </Link>
          )) : <p className="text-sm text-text-tertiary">No velocity data yet. Run Sync → 3. Orders.</p>}
        </Section>

        {/* Slow movers (high stock, low velocity) */}
        <Section title="Slow Movers (high stock, low velocity)">
          {slowMovers.length > 0 ? slowMovers.map(mp => (
            <Link key={mp.id} href={`/products/${mp.id}`} className="flex items-center justify-between py-2 no-underline text-text hover:bg-surface-sunken -mx-2 px-2 rounded transition-colors">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{mp.name}</div>
                <div className="text-xs text-text-secondary">{mp.category}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm text-warning font-bold">{mp.total_inventory} units</div>
                <div className="text-xs text-text-tertiary">{parseFloat(mp.velocity_per_week || 0).toFixed(1)}/wk</div>
              </div>
            </Link>
          )) : <p className="text-sm text-text-tertiary">No slow movers detected.</p>}
        </Section>
      </div>

      {/* PO Pipeline */}
      {Object.keys(stageCounts).length > 0 && (
        <Section title="PO Pipeline">
          <div className="flex gap-2 flex-wrap">
            {Object.entries(stageCounts).map(([stage, count]) => (
              <div key={stage} className="bg-surface-sunken rounded-[--radius-sm] px-4 py-3 text-center min-w-[80px]">
                <div className="text-lg font-bold">{count}</div>
                <div className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">{stage}</div>
              </div>
            ))}
          </div>
        </Section>
      )}
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
function Section({ title, children }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle] mb-4">
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}
function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
