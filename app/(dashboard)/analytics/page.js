import { getProducts, getPurchaseOrders } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const [products, pos] = await Promise.all([getProducts(), getPurchaseOrders()]);

  const catStats = {};
  for (const mp of products) {
    const cat = mp.category || 'Other';
    if (!catStats[cat]) catStats[cat] = { count: 0, stock: 0, oos: 0, fobSum: 0, retailSum: 0 };
    catStats[cat].count++;
    catStats[cat].stock += parseInt(mp.total_inventory) || 0;
    if ((parseInt(mp.total_inventory) || 0) === 0) catStats[cat].oos++;
    catStats[cat].fobSum += parseFloat(mp.fob) || 0;
    catStats[cat].retailSum += parseFloat(mp.retail) || 0;
  }

  const stageCounts = {};
  for (const po of pos) stageCounts[(po.stage || 'concept').replace(/_/g, ' ')] = (stageCounts[(po.stage || 'concept').replace(/_/g, ' ')] || 0) + 1;

  const avgMargin = products.filter(p => p.fob > 0 && p.retail > 0)
    .reduce((s, p, _, a) => s + ((1 - p.fob * 1.34 / p.retail) * 100) / a.length, 0);
  const totalPOValue = pos.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Analytics</h1>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Products" value={products.length} />
        <Stat label="Total Stock" value={products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0), 0).toLocaleString()} />
        <Stat label="Avg Margin" value={`${avgMargin.toFixed(0)}%`} color={avgMargin >= 55 ? 'text-success' : 'text-warning'} />
        <Stat label="PO Pipeline" value={pos.length} />
        <Stat label="PO Value" value={`$${totalPOValue.toLocaleString()}`} />
      </div>

      <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle] mb-4 overflow-auto">
        <h2 className="text-sm font-semibold mb-3">Category Breakdown</h2>
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b border-border">
            <Th>Category</Th><Th right>Products</Th><Th right>Stock</Th><Th right>Out of Stock</Th><Th right>Avg FOB</Th><Th right>Avg Retail</Th>
          </tr></thead>
          <tbody>
            {Object.entries(catStats).sort((a, b) => b[1].count - a[1].count).map(([cat, s]) => (
              <tr key={cat} className="border-b border-border/30">
                <td className="py-2 px-3 font-semibold">{cat}</td>
                <td className="py-2 px-3 text-right">{s.count}</td>
                <td className="py-2 px-3 text-right">{s.stock.toLocaleString()}</td>
                <td className={`py-2 px-3 text-right ${s.oos > 0 ? 'text-danger' : 'text-success'}`}>{s.oos}</td>
                <td className="py-2 px-3 text-right text-text-secondary">${(s.fobSum / s.count).toFixed(0)}</td>
                <td className="py-2 px-3 text-right text-text-secondary">${(s.retailSum / s.count).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(stageCounts).length > 0 && (
        <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle]">
          <h2 className="text-sm font-semibold mb-3">PO Stage Pipeline</h2>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(stageCounts).map(([stage, count]) => (
              <div key={stage} className="bg-surface-sunken rounded-[--radius-sm] px-4 py-3 text-center min-w-[80px]">
                <div className="text-lg font-bold">{count}</div>
                <div className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">{stage}</div>
              </div>
            ))}
          </div>
        </div>
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
function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
