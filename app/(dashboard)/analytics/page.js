import { getProducts, getPurchaseOrders } from '../actions';

export default async function AnalyticsPage() {
  const [products, pos] = await Promise.all([getProducts(), getPurchaseOrders()]);

  // Category breakdown
  const catStats = {};
  for (const mp of products) {
    const cat = mp.category || 'Other';
    if (!catStats[cat]) catStats[cat] = { count: 0, totalStock: 0, totalFOB: 0, totalRetail: 0, lowStock: 0 };
    catStats[cat].count++;
    catStats[cat].totalStock += parseInt(mp.total_inventory) || 0;
    catStats[cat].totalFOB += parseFloat(mp.fob) || 0;
    catStats[cat].totalRetail += parseFloat(mp.retail) || 0;
    if ((parseInt(mp.total_inventory) || 0) === 0) catStats[cat].lowStock++;
  }

  // PO stage pipeline
  const stageCounts = {};
  for (const po of pos) {
    const s = (po.stage || 'concept').replace(/_/g, ' ');
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  }

  // Overall metrics
  const totalProducts = products.length;
  const totalStock = products.reduce((s, p) => s + (parseInt(p.total_inventory) || 0), 0);
  const avgMargin = products.filter(p => p.fob > 0 && p.retail > 0)
    .reduce((s, p, _, arr) => s + ((1 - p.fob * 1.34 / p.retail) * 100) / arr.length, 0);
  const totalPOValue = pos.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Analytics</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', marginBottom: '1.5rem' }}>
        <Card label="Products" value={totalProducts} />
        <Card label="Total Stock" value={totalStock.toLocaleString()} />
        <Card label="Avg Margin" value={avgMargin.toFixed(0) + '%'} color={avgMargin >= 55 ? '#16a34a' : '#ca8a04'} />
        <Card label="PO Pipeline" value={pos.length} />
        <Card label="PO Value" value={'$' + totalPOValue.toLocaleString()} />
      </div>

      {/* Category breakdown */}
      <div style={{
        background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
        padding: '1rem', marginBottom: '1rem', overflow: 'auto',
      }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>Category Breakdown</h2>
        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e8ed' }}>
              <th style={th}>Category</th>
              <th style={{ ...th, textAlign: 'right' }}>Products</th>
              <th style={{ ...th, textAlign: 'right' }}>Stock</th>
              <th style={{ ...th, textAlign: 'right' }}>Out of Stock</th>
              <th style={{ ...th, textAlign: 'right' }}>Avg FOB</th>
              <th style={{ ...th, textAlign: 'right' }}>Avg Retail</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(catStats).sort((a, b) => b[1].count - a[1].count).map(([cat, stats]) => (
              <tr key={cat} style={{ borderBottom: '1px solid #f0f2f5' }}>
                <td style={{ ...td, fontWeight: 600 }}>{cat}</td>
                <td style={{ ...td, textAlign: 'right' }}>{stats.count}</td>
                <td style={{ ...td, textAlign: 'right' }}>{stats.totalStock.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right', color: stats.lowStock > 0 ? '#dc2626' : '#16a34a' }}>{stats.lowStock}</td>
                <td style={{ ...td, textAlign: 'right', color: '#5f6880' }}>${(stats.totalFOB / stats.count).toFixed(0)}</td>
                <td style={{ ...td, textAlign: 'right', color: '#5f6880' }}>${(stats.totalRetail / stats.count).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PO Pipeline */}
      {Object.keys(stageCounts).length > 0 && (
        <div style={{
          background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
          padding: '1rem',
        }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>PO Stage Pipeline</h2>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {Object.entries(stageCounts).map(([stage, count]) => (
              <div key={stage} style={{
                padding: '0.5rem 0.85rem', borderRadius: 8,
                background: '#f0f2f5', textAlign: 'center', minWidth: 80,
              }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e2330' }}>{count}</div>
                <div style={{ fontSize: '0.68rem', color: '#5f6880', textTransform: 'uppercase', fontWeight: 600 }}>{stage}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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

const th = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase' };
const td = { padding: '0.5rem 0.6rem' };
