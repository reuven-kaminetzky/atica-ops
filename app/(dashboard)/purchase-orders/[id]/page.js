'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const STAGES = [
  'concept', 'design', 'sample', 'approved', 'costed', 'ordered',
  'production', 'qc', 'shipped', 'in_transit', 'received', 'distribution',
];
const GATE_STAGES = { approved: 'PD', costed: 'Finance', qc: 'PD' };

export default function PODetailPage() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [checkedBy, setCheckedBy] = useState('');
  const [error, setError] = useState(null);

  async function loadPO() {
    try {
      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPo(data);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  useEffect(() => { loadPO(); }, [id]);

  async function advanceStage() {
    setAdvancing(true);
    setError(null);
    try {
      const nextIdx = STAGES.indexOf(po.stage) + 1;
      const nextStage = STAGES[nextIdx];
      const body = {};
      if (GATE_STAGES[nextStage]) body.checkedBy = checkedBy;

      const res = await fetch(`/api/purchase-orders/${encodeURIComponent(id)}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await loadPO();
      setCheckedBy('');
    } catch (e) {
      setError(e.message);
    }
    setAdvancing(false);
  }

  if (loading) return <div style={{ padding: '2rem', color: '#9ba3b5' }}>Loading...</div>;
  if (error && !po) return (
    <div style={{ padding: '2rem' }}>
      <div style={{ color: '#dc2626', marginBottom: '1rem' }}>{error}</div>
      <Link href="/purchase-orders" style={{ color: '#714b67' }}>← Back</Link>
    </div>
  );
  if (!po) return null;

  const currentIdx = STAGES.indexOf(po.stage);
  const nextStage = STAGES[currentIdx + 1];
  const needsGate = nextStage && GATE_STAGES[nextStage];
  const isComplete = currentIdx >= STAGES.length - 1;

  return (
    <div>
      <Link href="/purchase-orders" style={{ fontSize: '0.82rem', color: '#714b67', textDecoration: 'none' }}>← Back to POs</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>{po.id}</h1>
          <div style={{ fontSize: '0.85rem', color: '#5f6880', marginTop: '0.2rem' }}>
            {po.mp_name || po.mp_id || '—'} · {po.vendor_name || '—'}
          </div>
        </div>
      </div>

      {/* Stage Track */}
      <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 10, padding: '1rem', marginBottom: '1rem', overflow: 'auto' }}>
        <div style={{ display: 'flex', gap: '0.25rem', minWidth: 600 }}>
          {STAGES.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s} style={{
                flex: 1, textAlign: 'center', padding: '0.5rem 0.25rem',
                borderRadius: 4, fontSize: '0.65rem', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.03em',
                background: active ? '#714b67' : done ? '#dcfce7' : '#f0f2f5',
                color: active ? 'white' : done ? '#16a34a' : '#9ba3b5',
              }}>
                {s.replace(/_/g, ' ')}
                {GATE_STAGES[s] && <div style={{ fontSize: '0.55rem', opacity: 0.7 }}>🔒 {GATE_STAGES[s]}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Advance button */}
      {!isComplete && (
        <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Advance to: <span style={{ color: '#714b67' }}>{nextStage?.replace(/_/g, ' ')}</span>
          </div>
          {needsGate && (
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', color: '#5f6880', display: 'block', marginBottom: '0.2rem' }}>
                {GATE_STAGES[nextStage]} reviewer name *
              </label>
              <input value={checkedBy} onChange={e => setCheckedBy(e.target.value)}
                placeholder="Name of reviewer" style={{
                  padding: '0.45rem 0.65rem', borderRadius: 6, border: '1px solid #d5d9e0',
                  fontSize: '0.85rem', width: '100%', maxWidth: 300, boxSizing: 'border-box',
                }} />
            </div>
          )}
          {error && <div style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: '0.5rem' }}>{error}</div>}
          <button onClick={advanceStage} disabled={advancing || (needsGate && !checkedBy.trim())} style={{
            padding: '0.5rem 1.25rem', borderRadius: 6, border: '1px solid #714b67',
            background: '#714b67', color: 'white', fontWeight: 600, fontSize: '0.82rem',
            cursor: advancing ? 'wait' : 'pointer', opacity: (advancing || (needsGate && !checkedBy.trim())) ? 0.5 : 1,
          }}>
            {advancing ? 'Advancing...' : `Advance to ${nextStage?.replace(/_/g, ' ')}`}
          </button>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem', marginBottom: '1rem' }}>
        <Metric label="FOB" value={`$${po.fob}`} />
        <Metric label="Units" value={po.units} />
        <Metric label="FOB Total" value={`$${parseFloat(po.fob_total || 0).toLocaleString()}`} />
        <Metric label="Landed" value={po.landed_cost ? `$${po.landed_cost}` : '—'} />
        <Metric label="Lead" value={po.lead_days ? `${po.lead_days}d` : '—'} />
        <Metric label="ETD" value={po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'} />
      </div>

      {/* Payments */}
      {po.payments?.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 10, padding: '1rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>Payments ({po.payments.length})</h2>
          <table style={{ width: '100%', fontSize: '0.82rem', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #e5e8ed' }}>
              <th style={th}>Type</th><th style={th}>Label</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount</th>
              <th style={th}>Status</th><th style={th}>Due</th>
            </tr></thead>
            <tbody>
              {po.payments.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f0f2f5' }}>
                  <td style={td}>{p.type}</td>
                  <td style={td}>{p.label}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>${parseFloat(p.amount).toLocaleString()}</td>
                  <td style={td}>
                    <span style={{
                      padding: '0.12rem 0.4rem', borderRadius: 3, fontSize: '0.72rem', fontWeight: 600,
                      background: p.status === 'paid' ? '#dcfce7' : p.status === 'overdue' ? '#fef2f2' : '#f0f2f5',
                      color: p.status === 'paid' ? '#16a34a' : p.status === 'overdue' ? '#dc2626' : '#5f6880',
                    }}>{p.status}</span>
                  </td>
                  <td style={{ ...td, color: '#5f6880' }}>
                    {p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage History */}
      {po.stageHistory?.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 10, padding: '1rem' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>Stage History</h2>
          {po.stageHistory.map((h, i) => (
            <div key={i} style={{ padding: '0.4rem 0', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
              <span>{(h.from_stage || '—').replace(/_/g, ' ')} → <strong>{(h.to_stage || '').replace(/_/g, ' ')}</strong></span>
              <span style={{ color: '#9ba3b5', fontSize: '0.75rem' }}>
                {new Date(h.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 8, padding: '0.65rem 0.85rem' }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700, marginTop: '0.1rem' }}>{value}</div>
    </div>
  );
}

const th = { padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.72rem', fontWeight: 600, color: '#9ba3b5', textTransform: 'uppercase' };
const td = { padding: '0.5rem 0.6rem' };
