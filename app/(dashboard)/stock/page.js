import { getProducts } from '../actions';
export const dynamic = 'force-dynamic';

export default async function StockPage() {
  const products = await getProducts();

  const stores = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey', 'Online'];
  const totalStock = products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0), 0);
  const lowStock = products.filter(p => (parseInt(p.total_inventory) || 0) > 0 && (parseInt(p.days_of_stock) || 999) <= 60);
  const outOfStock = products.filter(p => (parseInt(p.total_inventory) || 0) === 0);

  // Group by category
  const categories = {};
  for (const p of products) {
    const cat = p.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Stock</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.65rem', marginBottom: '1.5rem' }}>
        <Card label="Total Units" value={totalStock.toLocaleString()} />
        <Card label="Products" value={products.length} />
        <Card label="Low Stock" value={lowStock.length} color={lowStock.length > 0 ? '#ca8a04' : '#16a34a'} />
        <Card label="Out of Stock" value={outOfStock.length} color={outOfStock.length > 0 ? '#dc2626' : '#16a34a'} />
        <Card label="Stores" value={stores.length} />
      </div>

      <div style={{
        background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
        padding: '1rem', overflow: 'auto',
      }}>
        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e8ed' }}>
              <th style={th}>Product</th>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: 'right' }}>Stock</th>
              <th style={{ ...th, textAlign: 'right' }}>Days Left</th>
              <th style={th}>Signal</th>
              <th style={{ ...th, textAlign: 'right' }}>Vel/wk</th>
              <th style={{ ...th, textAlign: 'right' }}>Active POs</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(categories).sort().map(([cat, prods]) => (
              prods.sort((a, b) => (parseInt(a.total_inventory) || 0) - (parseInt(b.total_inventory) || 0)).map((mp, i) => {
                const stock = parseInt(mp.total_inventory) || 0;
                const days = parseInt(mp.days_of_stock) || 999;
                const signal = mp.signal || 'steady';
                const vel = parseFloat(mp.velocity_per_week) || 0;

                const stockColor = stock === 0 ? '#dc2626' : days <= 30 ? '#dc2626' : days <= 60 ? '#ca8a04' : '#16a34a';
                const signalColors = { hot: '#dc2626', rising: '#ea580c', steady: '#16a34a', slow: '#0891b2', stockout: '#dc2626' };

                return (
                  <tr key={mp.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                    <td style={{ ...td, fontWeight: 600 }}>
                      <a href={'/products/' + mp.id} style={{ color: '#1e2330', textDecoration: 'none' }}>{mp.name}</a>
                    </td>
                    <td style={{ ...td, color: '#5f6880' }}>{mp.category}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: stockColor }}>{stock}</td>
                    <td style={{ ...td, textAlign: 'right', color: days <= 60 ? stockColor : '#5f6880' }}>
                      {days < 999 ? days + 'd' : '—'}
                    </td>
                    <td style={td}>
                      <span style={{
                        padding: '0.12rem 0.4rem', borderRadius: 3, fontSize: '0.72rem',
                        fontWeight: 600, background: (signalColors[signal] || '#9ba3b5') + '15',
                        color: signalColors[signal] || '#9ba3b5',
                      }}>
                        {signal}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right', color: '#5f6880' }}>{vel > 0 ? vel.toFixed(1) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {parseInt(mp.active_pos) > 0 ? (
                        <span style={{ color: '#1d4ed8', fontWeight: 600 }}>{mp.active_pos}</span>
                      ) : '—'}
                    </td>
                  </tr>
                );
              })
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ label, value, color }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: color || '#1e2330', marginTop: '0.1rem' }}>{value}</div>
    </div>
  );
}

const th = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const td = { padding: '0.5rem 0.6rem' };
