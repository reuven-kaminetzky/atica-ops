import { getProducts } from '../actions';

export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const products = await getProducts();

  const totalStock = products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0), 0);
  const lowStock = products.filter(p => (parseInt(p.total_inventory) || 0) > 0 && (parseInt(p.days_of_stock) || 999) <= 60);
  const outOfStock = products.filter(p => (parseInt(p.total_inventory) || 0) === 0);

  const signalColors = { hot: 'bg-danger-light text-danger', rising: 'bg-orange-100 text-orange-700', steady: 'bg-success-light text-success', slow: 'bg-info-light text-info', stockout: 'bg-danger-light text-danger' };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Stock</h1>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
        <Stat label="Total Units" value={totalStock.toLocaleString()} />
        <Stat label="Products" value={products.length} />
        <Stat label="Low Stock" value={lowStock.length} color={lowStock.length > 0 ? 'text-warning' : 'text-success'} />
        <Stat label="Out of Stock" value={outOfStock.length} color={outOfStock.length > 0 ? 'text-danger' : 'text-success'} />
        <Stat label="Stores" value="5" />
      </div>
      <div className="bg-surface rounded-[--radius-md] border border-border shadow-[--shadow-subtle] overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead><tr className="bg-surface-raised">
            <Th>Product</Th><Th>Category</Th><Th right>Stock</Th><Th right>Days Left</Th><Th>Signal</Th><Th right>Vel/wk</Th><Th right>POs</Th>
          </tr></thead>
          <tbody>
            {products.sort((a, b) => (parseInt(a.total_inventory) || 0) - (parseInt(b.total_inventory) || 0)).map(mp => {
              const stock = parseInt(mp.total_inventory) || 0;
              const days = parseInt(mp.days_of_stock) || 999;
              const signal = mp.signal || 'steady';
              const vel = parseFloat(mp.velocity_per_week) || 0;
              const stockColor = stock === 0 ? 'text-danger font-semibold' : days <= 30 ? 'text-danger' : days <= 60 ? 'text-warning' : 'text-success';
              return (
                <tr key={mp.id} className="border-b border-border/30">
                  <td className="py-2 px-3 font-semibold"><a href={`/products/${mp.id}`} className="text-text no-underline hover:text-brand">{mp.name}</a></td>
                  <td className="py-2 px-3 text-text-secondary">{mp.category}</td>
                  <td className={`py-2 px-3 text-right ${stockColor}`}>{stock}</td>
                  <td className={`py-2 px-3 text-right ${days <= 60 ? stockColor : 'text-text-secondary'}`}>{days < 999 ? days + 'd' : '—'}</td>
                  <td className="py-2 px-3"><span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${signalColors[signal] || 'bg-surface-sunken text-text-tertiary'}`}>{signal}</span></td>
                  <td className="py-2 px-3 text-right text-text-secondary">{vel > 0 ? vel.toFixed(1) : '—'}</td>
                  <td className="py-2 px-3 text-right">{parseInt(mp.active_pos || 0) > 0 ? <span className="text-info font-semibold">{mp.active_pos}</span> : '—'}</td>
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
