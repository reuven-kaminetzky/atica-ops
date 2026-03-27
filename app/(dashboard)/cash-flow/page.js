import { getCashFlowData } from '../actions';

export default async function CashFlowPage() {
  const { payments, activePOs, opexMonthly } = await getCashFlowData();

  // Build 12-week projection
  const weeks = [];
  const now = new Date();
  for (let w = 0; w < 12; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const weekPayments = payments.filter(p => {
      if (!p.due_date) return false;
      const d = new Date(p.due_date);
      return d >= weekStart && d <= weekEnd;
    });

    const outflow = weekPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const weeklyOpex = opexMonthly / 4.33;

    weeks.push({
      week: w + 1,
      label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      outflow: Math.round(outflow),
      opex: Math.round(weeklyOpex),
      total: Math.round(outflow + weeklyOpex),
      payments: weekPayments,
    });
  }

  const totalProjected = weeks.reduce((s, w) => s + w.total, 0);
  const totalPOValue = activePOs.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);

  // Payment status summary
  const overdue = payments.filter(p => p.status === 'overdue');
  const due = payments.filter(p => p.status === 'due');
  const upcoming = payments.filter(p => p.status === 'upcoming' || p.status === 'planned');

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Cash Flow</h1>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.65rem', marginBottom: '1.5rem' }}>
        <Card label="Active POs" value={activePOs.length} />
        <Card label="Committed" value={'$' + totalPOValue.toLocaleString()} />
        <Card label="12-Week Projected" value={'$' + totalProjected.toLocaleString()} />
        <Card label="Monthly OpEx" value={'$' + opexMonthly.toLocaleString()} />
        <Card label="Overdue" value={overdue.length} color={overdue.length > 0 ? '#dc2626' : '#16a34a'} />
        <Card label="Due" value={due.length} color={due.length > 0 ? '#ca8a04' : '#5f6880'} />
      </div>

      {/* 12-week projection table */}
      <div style={{
        background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
        padding: '1rem', marginBottom: '1.5rem', overflow: 'auto',
      }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>12-Week Projection</h2>
        <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e8ed' }}>
              <th style={th}>Week</th>
              <th style={{ ...th, textAlign: 'right' }}>PO Payments</th>
              <th style={{ ...th, textAlign: 'right' }}>OpEx</th>
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.week} style={{ borderBottom: '1px solid #f0f2f5' }}>
                <td style={td}><strong>W{w.week}</strong> <span style={{ color: '#9ba3b5' }}>{w.label}</span></td>
                <td style={{ ...td, textAlign: 'right', color: w.outflow > 0 ? '#dc2626' : '#9ba3b5' }}>
                  {w.outflow > 0 ? '-$' + w.outflow.toLocaleString() : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#5f6880' }}>
                  -${w.opex.toLocaleString()}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                  -${w.total.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active POs */}
      {activePOs.length > 0 && (
        <div style={{
          background: 'white', border: '1px solid #e5e8ed', borderRadius: 10,
          padding: '1rem',
        }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
            Active Purchase Orders ({activePOs.length})
          </h2>
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e8ed' }}>
                <th style={th}>PO</th>
                <th style={th}>Product</th>
                <th style={th}>Stage</th>
                <th style={{ ...th, textAlign: 'right' }}>Value</th>
                <th style={th}>ETA</th>
              </tr>
            </thead>
            <tbody>
              {activePOs.map(po => (
                <tr key={po.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{po.id}</td>
                  <td style={td}>{po.mp_name || '—'}</td>
                  <td style={td}>
                    <span style={{ padding: '0.12rem 0.4rem', borderRadius: 3, background: '#f0f2f5', fontSize: '0.72rem', fontWeight: 600, color: '#5f6880' }}>
                      {(po.stage || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>${parseFloat(po.fob_total || 0).toLocaleString()}</td>
                  <td style={{ ...td, color: '#5f6880' }}>
                    {po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
