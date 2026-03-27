import { getProduct } from '../../actions';
import Link from 'next/link';

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  const mp = await getProduct(id);

  if (!mp) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '0.5rem' }}>Product not found</h1>
        <Link href="/products" style={{ color: '#714b67' }}>← Back to products</Link>
      </div>
    );
  }

  const margin = mp.fob > 0 && mp.retail > 0
    ? ((1 - mp.fob * 1.34 / mp.retail) * 100).toFixed(0) : null;
  const landed = mp.fob > 0 ? (mp.fob * (1 + (mp.duty || 24) / 100) * 1.08).toFixed(2) : null;

  return (
    <div>
      <Link href="/products" style={{ fontSize: '0.82rem', color: '#714b67', textDecoration: 'none' }}>← Back to products</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{mp.name}</h1>
          <div style={{ fontSize: '0.85rem', color: '#5f6880', marginTop: '0.2rem' }}>
            {mp.code} · {mp.category} · {mp.vendor_id || 'No vendor'}
          </div>
        </div>
        <div style={{
          padding: '0.3rem 0.75rem', borderRadius: 6,
          background: '#f0f2f5', fontSize: '0.78rem', fontWeight: 600,
          color: '#5f6880',
        }}>
          {(mp.phase || 'in_store').replace(/_/g, ' ')}
        </div>
      </div>

      {/* Key metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem', marginBottom: '1.5rem' }}>
        <Metric label="FOB" value={`$${mp.fob}`} />
        <Metric label="Retail" value={`$${mp.retail}`} />
        <Metric label="Margin" value={margin ? `${margin}%` : '—'} color={margin >= 55 ? '#16a34a' : '#ca8a04'} />
        <Metric label="Landed" value={landed ? `$${landed}` : '—'} />
        <Metric label="Lead" value={mp.lead_days ? `${mp.lead_days}d` : '—'} />
        <Metric label="MOQ" value={mp.moq || '—'} />
        <Metric label="Duty" value={mp.duty ? `${mp.duty}%` : '—'} />
        <Metric label="Stock" value={mp.total_inventory || 0} color={mp.total_inventory > 0 ? '#16a34a' : '#dc2626'} />
      </div>

      {/* Fits & Sizes */}
      {(mp.fits?.length > 0 || mp.sizes) && (
        <Section title="Fits & Sizes">
          {mp.fits?.length > 0 && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {mp.fits.map(f => <Tag key={f}>{f}</Tag>)}
            </div>
          )}
          {mp.sizes && <div style={{ fontSize: '0.82rem', color: '#5f6880' }}>Size group: {mp.sizes}</div>}
        </Section>
      )}

      {/* Product Stack (Tech Pack) */}
      <Section title="Product Stack">
        {mp.stack ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.82rem' }}>
            <StackField label="Fabric" value={mp.stack.fabric_type} />
            <StackField label="Weight" value={mp.stack.fabric_weight} />
            <StackField label="Composition" value={mp.stack.fabric_comp} />
            <StackField label="Mill" value={mp.stack.fabric_mill} />
            <StackField label="Lining" value={mp.stack.lining} />
            <StackField label="Buttons" value={mp.stack.buttons} />
            <StackField label="Origin" value={mp.stack.country_of_origin} />
            <StackField label="AQL" value={mp.stack.aql_level} />
          </div>
        ) : (
          <div style={{ color: '#9ba3b5', fontSize: '0.85rem' }}>No stack data yet</div>
        )}
        {mp.stack?.completeness > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#5f6880', marginBottom: '0.25rem' }}>
              Completeness: {mp.stack.completeness}%
            </div>
            <div style={{ height: 6, background: '#f0f2f5', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${mp.stack.completeness}%`,
                background: mp.stack.completeness >= 80 ? '#16a34a' : mp.stack.completeness >= 50 ? '#ca8a04' : '#dc2626',
                borderRadius: 3,
              }} />
            </div>
          </div>
        )}
      </Section>

      {/* Purchase Orders */}
      <Section title={`Purchase Orders (${mp.purchaseOrders?.length || 0})`}>
        {mp.purchaseOrders?.length > 0 ? (
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e8ed' }}>
                <th style={thStyle}>PO ID</th>
                <th style={thStyle}>Stage</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Units</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>FOB Total</th>
                <th style={thStyle}>ETD</th>
              </tr>
            </thead>
            <tbody>
              {mp.purchaseOrders.map(po => (
                <tr key={po.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                  <td style={tdStyle}>{po.id}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '0.12rem 0.4rem', borderRadius: 3, fontSize: '0.72rem',
                      fontWeight: 600, background: '#f0f2f5', color: '#5f6880',
                    }}>
                      {(po.stage || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{po.units}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                    ${parseFloat(po.fob_total || 0).toLocaleString()}
                  </td>
                  <td style={{ ...tdStyle, color: '#5f6880' }}>
                    {po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ color: '#9ba3b5', fontSize: '0.85rem' }}>No purchase orders</div>
        )}
      </Section>

      {/* PLM History */}
      {mp.plmHistory?.length > 0 && (
        <Section title="PLM History">
          <div style={{ fontSize: '0.82rem' }}>
            {mp.plmHistory.map((h, i) => (
              <div key={i} style={{
                padding: '0.4rem 0', borderBottom: '1px solid #f0f2f5',
                display: 'flex', justifyContent: 'space-between',
              }}>
                <span>
                  {h.from_phase?.replace(/_/g, ' ') || '—'} → <strong>{h.to_phase?.replace(/_/g, ' ')}</strong>
                </span>
                <span style={{ color: '#9ba3b5', fontSize: '0.75rem' }}>
                  {new Date(h.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Metric({ label, value, color }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e8ed', borderRadius: 8,
      padding: '0.65rem 0.85rem',
    }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: color || '#1e2330', marginTop: '0.1rem' }}>{value}</div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
      padding: '1rem 1.15rem', marginBottom: '1rem',
    }}>
      <h2 style={{
        fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem',
        paddingBottom: '0.5rem', borderBottom: '1px solid #f0f2f5',
      }}>{title}</h2>
      {children}
    </div>
  );
}

function StackField({ label, value }) {
  return (
    <div style={{ padding: '0.35rem 0' }}>
      <span style={{ color: '#9ba3b5', fontSize: '0.75rem' }}>{label}: </span>
      <span style={{ color: value ? '#1e2330' : '#d5d9e0' }}>{value || '—'}</span>
    </div>
  );
}

function Tag({ children }) {
  return (
    <span style={{
      padding: '0.2rem 0.55rem', borderRadius: 4,
      background: '#f0f2f5', fontSize: '0.78rem', color: '#5f6880',
    }}>{children}</span>
  );
}

const thStyle = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase' };
const tdStyle = { padding: '0.5rem 0.6rem' };
