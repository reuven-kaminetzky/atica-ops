import { getProducts } from '../actions';
import Link from 'next/link';

export default async function ProductsPage() {
  const products = await getProducts();

  // Group by category
  const categories = {};
  for (const p of products) {
    const cat = p.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }

  const catOrder = ['Dress Shirts', 'Suits', 'Blazers', 'Pants', 'Outerwear', 'Sweaters', 'Knits', 'Accessories', 'Boys'];

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Master Products</h1>
          <p style={{ fontSize: '0.82rem', color: '#5f6880', marginTop: '0.25rem' }}>
            {products.length} products across {Object.keys(categories).length} categories
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem', color: '#9ba3b5',
          background: 'white', borderRadius: 10, border: '1px solid #e5e8ed',
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No products in database</p>
          <p style={{ fontSize: '0.85rem' }}>Run the seed script: <code>node scripts/seed-db.js</code></p>
        </div>
      ) : (
        catOrder.filter(cat => categories[cat]).map(cat => (
          <div key={cat} style={{ marginBottom: '2rem' }}>
            <h2 style={{
              fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.06em', color: '#5f6880', marginBottom: '0.75rem',
              paddingBottom: '0.5rem', borderBottom: '1px solid #e5e8ed',
            }}>
              {cat} <span style={{ color: '#9ba3b5', fontWeight: 400 }}>({categories[cat].length})</span>
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '0.75rem',
            }}>
              {categories[cat].map(mp => (
                <ProductCard key={mp.id} mp={mp} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ProductCard({ mp }) {
  const margin = mp.fob > 0 && mp.retail > 0
    ? ((1 - mp.fob * 1.34 / mp.retail) * 100).toFixed(0)
    : null;

  const stockColor = (mp.total_inventory || 0) === 0 ? '#dc2626'
    : mp.total_inventory < 20 ? '#ca8a04' : '#16a34a';

  return (
    <Link href={`/products/${mp.id}`} style={{
      display: 'block', background: 'white', border: '1px solid #e5e8ed',
      borderRadius: 10, padding: '1rem', textDecoration: 'none', color: '#1e2330',
      transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{mp.name}</div>
          <div style={{ fontSize: '0.78rem', color: '#5f6880', marginTop: '0.15rem' }}>
            {mp.code} · {mp.vendor_id || '—'}
          </div>
        </div>
        {margin && (
          <div style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem',
            borderRadius: 4, background: parseInt(margin) >= 55 ? '#dcfce7' : '#fef3c7',
            color: parseInt(margin) >= 55 ? '#16a34a' : '#ca8a04',
          }}>
            {margin}%
          </div>
        )}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: '0.75rem', fontSize: '0.82rem',
      }}>
        <div>
          <span style={{ color: '#5f6880' }}>FOB </span>
          <span style={{ fontWeight: 600 }}>${mp.fob}</span>
          <span style={{ color: '#5f6880', margin: '0 0.5rem' }}>·</span>
          <span style={{ color: '#5f6880' }}>Retail </span>
          <span style={{ fontWeight: 600 }}>${mp.retail}</span>
        </div>
        <div style={{ fontWeight: 600, color: stockColor, fontSize: '0.78rem' }}>
          {mp.total_inventory || 0} units
        </div>
      </div>

      <div style={{
        display: 'flex', gap: '0.5rem', marginTop: '0.65rem',
        alignItems: 'center', fontSize: '0.72rem',
      }}>
        <span style={{
          padding: '0.12rem 0.45rem', borderRadius: 3,
          background: '#f0f2f5', color: '#5f6880',
        }}>
          {mp.phase?.replace(/_/g, ' ') || 'in store'}
        </span>
        {parseInt(mp.active_pos) > 0 && (
          <span style={{
            padding: '0.12rem 0.45rem', borderRadius: 3,
            background: '#dbeafe', color: '#1d4ed8',
          }}>
            {mp.active_pos} PO{parseInt(mp.active_pos) > 1 ? 's' : ''}
          </span>
        )}
        {mp.completeness > 0 && (
          <span style={{
            padding: '0.12rem 0.45rem', borderRadius: 3,
            background: '#f0fdf4', color: '#16a34a',
          }}>
            Stack {mp.completeness}%
          </span>
        )}
      </div>
    </Link>
  );
}
