import { getDbHealth } from './actions';

export default async function DashboardHome() {
  const health = await getDbHealth();

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>
        Operations Dashboard
      </h1>

      {health.error ? (
        <div style={{
          padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: 8, color: '#dc2626', marginBottom: '1rem',
        }}>
          Database not connected: {health.error}
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem', marginBottom: '2rem',
        }}>
          <StatCard label="Master Products" value={health.products} />
          <StatCard label="Vendors" value={health.vendors} />
          <StatCard label="Active POs" value={health.activePOs} />
          <StatCard label="Payments Due" value={health.paymentsDue} />
          <StatCard label="Shipments" value={health.shipments} />
          <StatCard label="Database" value="Postgres" color="#16a34a" />
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
        gap: '0.85rem',
      }}>
        <NavTile href="/products" label="Master Products" desc="Product catalog, PLM stages, tech packs" icon="▤" color="#1d3557" />
        <NavTile href="/purchase-orders" label="Purchase Orders" desc="Create, track, advance through 12 stages" icon="◫" color="#2d6a4f" />
        <NavTile href="/cash-flow" label="Cash Flow" desc="Revenue vs costs, payment projections" icon="◈" color="#714b67" />
        <NavTile href="/stock" label="Stock" desc="Inventory by product and store" icon="▦" color="#6c584c" />
        <NavTile href="/analytics" label="Analytics" desc="Velocity, demand signals, trends" icon="◩" color="#264653" />
        <NavTile href="/settings" label="Settings" desc="Shopify, database, sync" icon="⚙" color="#495057" />
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
      padding: '1rem 1.15rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        fontSize: '0.72rem', fontWeight: 600, color: '#9ba3b5',
        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem',
      }}>
        {label}
      </div>
      <div style={{
        fontSize: '1.35rem', fontWeight: 700, color: color || '#1e2330',
        letterSpacing: '-0.02em',
      }}>
        {value ?? '—'}
      </div>
    </div>
  );
}

function NavTile({ href, label, desc, icon, color }) {
  return (
    <a href={href} style={{
      display: 'flex', flexDirection: 'column', padding: '1.25rem',
      borderRadius: 10, border: '1px solid #e5e8ed', background: 'white',
      textDecoration: 'none', color: '#1e2330', transition: 'all 0.15s',
      position: 'relative', overflow: 'hidden', minHeight: 120,
    }}>
      <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem', opacity: 0.85 }}>{icon}</div>
      <div style={{ fontSize: '0.92rem', fontWeight: 600, marginBottom: '0.2rem' }}>{label}</div>
      <div style={{ fontSize: '0.75rem', color: '#5f6880', lineHeight: 1.4 }}>{desc}</div>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 3, height: '100%', background: color,
      }} />
    </a>
  );
}
