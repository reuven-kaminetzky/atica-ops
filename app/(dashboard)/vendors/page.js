import { getVendors } from '../actions';

export default async function VendorsPage() {
  const vendors = await getVendors();

  const totalCommitted = vendors.reduce((s, v) => s + parseFloat(v.total_committed || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Vendors</h1>
        <p style={{ fontSize: '0.82rem', color: '#5f6880', marginTop: '0.25rem' }}>
          {vendors.length} vendors · ${totalCommitted.toLocaleString()} committed
        </p>
      </div>

      {vendors.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem', color: '#9ba3b5',
          background: 'white', borderRadius: 10, border: '1px solid #e5e8ed',
        }}>No vendors in database</div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '0.75rem',
        }}>
          {vendors.map(v => (
            <div key={v.id} style={{
              background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
              padding: '1.15rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '1rem' }}>{v.name}</div>
                  <div style={{ fontSize: '0.78rem', color: '#5f6880', marginTop: '0.15rem' }}>
                    {v.country || 'Unknown'} · {v.tier || 'standard'}
                  </div>
                </div>
                <div style={{
                  padding: '0.15rem 0.5rem', borderRadius: 4,
                  background: parseInt(v.active_pos) > 0 ? '#dbeafe' : '#f0f2f5',
                  color: parseInt(v.active_pos) > 0 ? '#1d4ed8' : '#9ba3b5',
                  fontSize: '0.72rem', fontWeight: 600,
                }}>
                  {v.active_pos} active PO{parseInt(v.active_pos) !== 1 ? 's' : ''}
                </div>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                gap: '0.5rem', marginTop: '0.85rem', fontSize: '0.82rem',
              }}>
                <div>
                  <div style={{ color: '#9ba3b5', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase' }}>Products</div>
                  <div style={{ fontWeight: 600 }}>{v.product_count}</div>
                </div>
                <div>
                  <div style={{ color: '#9ba3b5', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase' }}>Total POs</div>
                  <div style={{ fontWeight: 600 }}>{v.po_count}</div>
                </div>
                <div>
                  <div style={{ color: '#9ba3b5', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase' }}>Committed</div>
                  <div style={{ fontWeight: 600 }}>${parseFloat(v.total_committed || 0).toLocaleString()}</div>
                </div>
              </div>

              {v.categories?.length > 0 && (
                <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                  {v.categories.map(c => (
                    <span key={c} style={{
                      padding: '0.12rem 0.4rem', borderRadius: 3,
                      background: '#f0f2f5', fontSize: '0.72rem', color: '#5f6880',
                    }}>{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
