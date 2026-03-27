import { getPurchaseOrders } from '../actions';
export const dynamic = 'force-dynamic';
import Link from 'next/link';

export default async function PurchaseOrdersPage() {
  const pos = await getPurchaseOrders();

  const stageColors = {
    concept: '#9ba3b5', design: '#0891b2', sample: '#0891b2',
    approved: '#7c3aed', costed: '#ca8a04', ordered: '#2563eb',
    production: '#2563eb', qc: '#ea580c', shipped: '#16a34a',
    in_transit: '#16a34a', received: '#16a34a', distribution: '#16a34a',
  };

  // Stage summary
  const stageCounts = {};
  for (const po of pos) {
    const s = po.stage || 'concept';
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  }

  const totalCommitted = pos.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Purchase Orders</h1>
          <p style={{ fontSize: '0.82rem', color: '#5f6880', marginTop: '0.25rem' }}>
            {pos.length} POs · ${totalCommitted.toLocaleString()} committed
          </p>
        </div>
        <Link href="/purchase-orders/new" style={{
          padding: '0.5rem 1.15rem', borderRadius: 6, border: '1px solid #714b67',
          background: '#714b67', color: 'white', fontWeight: 600, fontSize: '0.82rem',
          textDecoration: 'none',
        }}>+ Create PO</Link>
      </div>

      {/* Stage pipeline */}
      {Object.keys(stageCounts).length > 0 && (
        <div style={{
          display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap',
        }}>
          {Object.entries(stageCounts).map(([stage, count]) => (
            <div key={stage} style={{
              padding: '0.3rem 0.75rem', borderRadius: 20,
              background: (stageColors[stage] || '#9ba3b5') + '15',
              color: stageColors[stage] || '#9ba3b5',
              fontSize: '0.78rem', fontWeight: 600,
            }}>
              {stage.replace(/_/g, ' ')} ({count})
            </div>
          ))}
        </div>
      )}

      {pos.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '3rem', color: '#9ba3b5',
          background: 'white', borderRadius: 10, border: '1px solid #e5e8ed',
        }}>
          No purchase orders yet
        </div>
      ) : (
        <table style={{
          width: '100%', borderCollapse: 'separate', borderSpacing: 0,
          background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
          overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        }}>
          <thead>
            <tr style={{ background: '#f0f2f5' }}>
              <Th>PO</Th>
              <Th>Product</Th>
              <Th>Vendor</Th>
              <Th>Stage</Th>
              <Th align="right">Units</Th>
              <Th align="right">FOB Total</Th>
              <Th align="right">Payments</Th>
              <Th>ETD</Th>
            </tr>
          </thead>
          <tbody>
            {pos.map(po => (
              <tr key={po.id} style={{ borderBottom: '1px solid #e5e8ed' }}>
                <Td bold><Link href={`/purchase-orders/${encodeURIComponent(po.id)}`} style={{ color: '#714b67', textDecoration: 'none' }}>{po.id}</Link></Td>
                <Td>{po.mp_name || po.mp_id || '—'}</Td>
                <Td dim>{po.vendor_name || po.vendor_id || '—'}</Td>
                <Td>
                  <span style={{
                    padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: '0.72rem',
                    fontWeight: 600, background: (stageColors[po.stage] || '#9ba3b5') + '15',
                    color: stageColors[po.stage] || '#9ba3b5',
                  }}>
                    {(po.stage || 'concept').replace(/_/g, ' ')}
                  </span>
                </Td>
                <Td align="right" mono>{(po.units || 0).toLocaleString()}</Td>
                <Td align="right" mono bold>${parseFloat(po.fob_total || 0).toLocaleString()}</Td>
                <Td align="right">
                  {parseInt(po.overdue_payments) > 0 && (
                    <span style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 600 }}>
                      {po.overdue_payments} overdue
                    </span>
                  )}
                </Td>
                <Td dim>{po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '0.6rem 0.85rem', fontSize: '0.72rem', fontWeight: 600,
      textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5f6880',
      textAlign: align, whiteSpace: 'nowrap', borderBottom: '1px solid #e5e8ed',
    }}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', bold, dim, mono }) {
  return (
    <td style={{
      padding: '0.6rem 0.85rem', fontSize: '0.82rem', textAlign: align,
      fontWeight: bold ? 600 : 400,
      color: dim ? '#5f6880' : '#1e2330',
      fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
      borderBottom: '1px solid #f0f2f5',
    }}>
      {children}
    </td>
  );
}
