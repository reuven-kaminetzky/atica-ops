'use client';

import { useState, useEffect, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getPurchaseOrder, advancePOStage } from '../../actions';

const STAGES = [
  'concept', 'design', 'sample', 'approved', 'costed', 'ordered',
  'production', 'qc', 'shipped', 'in_transit', 'received', 'distribution',
];
const GATES = { approved: 'PD', costed: 'Finance', qc: 'PD' };

export default function PODetailPage() {
  const { id } = useParams();
  const [po, setPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [checkedBy, setCheckedBy] = useState('');
  const [error, setError] = useState(null);

  async function load() {
    try {
      const data = await getPurchaseOrder(id);
      if (!data) throw new Error('PO not found');
      setPo(data);
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  function advance() {
    setError(null);
    startTransition(async () => {
      const next = STAGES[STAGES.indexOf(po.stage) + 1];
      const body = {};
      if (GATES[next]) body.checkedBy = checkedBy;
      body.advancedBy = checkedBy || 'system';

      const result = await advancePOStage(id, body);
      if (result.error) { setError(result.error); return; }
      await load();
      setCheckedBy('');
    });
  }

  if (loading) return <div className="py-12 text-center text-text-tertiary">Loading...</div>;
  if (!po) return (
    <div className="py-12 text-center">
      <p className="text-danger mb-3">{error || 'PO not found'}</p>
      <Link href="/purchase-orders" className="text-brand text-sm">← Back</Link>
    </div>
  );

  const currentIdx = STAGES.indexOf(po.stage);
  const next = STAGES[currentIdx + 1];
  const needsGate = next && GATES[next];
  const isComplete = currentIdx >= STAGES.length - 1;

  return (
    <div>
      <Link href="/purchase-orders" className="text-sm text-brand no-underline hover:underline">← Back to POs</Link>

      <div className="flex items-start justify-between mt-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{po.id}</h1>
          <p className="text-sm text-text-secondary mt-0.5">{po.mp_name || po.mp_id || '—'} · {po.vendor_name || '—'}</p>
        </div>
      </div>

      {/* Stage Track */}
      <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 overflow-x-auto shadow-[--shadow-subtle]">
        <div className="flex gap-1 min-w-[600px]">
          {STAGES.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s} className={`flex-1 text-center py-2 px-1 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                active ? 'bg-brand text-white' : done ? 'bg-success-light text-success' : 'bg-surface-sunken text-text-tertiary'
              }`}>
                {s.replace(/_/g, ' ')}
                {GATES[s] && <div className="text-[8px] opacity-60 mt-0.5">🔒 {GATES[s]}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Advance */}
      {!isComplete && (
        <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
          <div className="text-sm font-semibold mb-2">
            Advance to: <span className="text-brand">{next?.replace(/_/g, ' ')}</span>
          </div>
          {needsGate && (
            <div className="mb-2">
              <label className="block text-xs font-semibold text-text-secondary mb-1">{GATES[next]} reviewer name *</label>
              <input value={checkedBy} onChange={e => setCheckedBy(e.target.value)} placeholder="Name"
                className="px-3 py-2 rounded-[--radius-sm] border border-border-strong text-sm w-full max-w-[300px] outline-none focus:border-brand" />
            </div>
          )}
          {error && <p className="text-danger text-sm mb-2">{error}</p>}
          <button onClick={advance} disabled={isPending || (needsGate && !checkedBy.trim())}
            className="px-5 py-2 rounded-[--radius-sm] bg-brand text-white font-semibold text-sm hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">
            {isPending ? 'Advancing...' : `Advance to ${next?.replace(/_/g, ' ')}`}
          </button>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-3">
        <Stat label="FOB" value={`$${po.fob}`} />
        <Stat label="Units" value={po.units} />
        <Stat label="FOB Total" value={`$${parseFloat(po.fob_total || 0).toLocaleString()}`} />
        <Stat label="Landed" value={po.landed_cost ? `$${po.landed_cost}` : '—'} />
        <Stat label="Lead" value={po.lead_days ? `${po.lead_days}d` : '—'} />
        <Stat label="ETD" value={po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'} />
      </div>

      {/* Payments */}
      {po.payments?.length > 0 && (
        <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle] overflow-auto">
          <h2 className="text-sm font-semibold mb-3">Payments ({po.payments.length})</h2>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-border">
              <Th>Type</Th><Th>Label</Th><Th right>Amount</Th><Th>Status</Th><Th>Due</Th>
            </tr></thead>
            <tbody>
              {po.payments.map(p => (
                <tr key={p.id} className="border-b border-border/30">
                  <td className="py-2 px-3">{p.type}</td>
                  <td className="py-2 px-3 text-text-secondary">{p.label}</td>
                  <td className="py-2 px-3 text-right font-semibold">${(parseFloat(p.amount) || 0).toLocaleString()}</td>
                  <td className="py-2 px-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      p.status === 'paid' ? 'bg-success-light text-success' :
                      p.status === 'overdue' ? 'bg-danger-light text-danger' :
                      'bg-surface-sunken text-text-secondary'
                    }`}>{p.status}</span>
                  </td>
                  <td className="py-2 px-3 text-text-secondary">{p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage History */}
      {po.stageHistory?.length > 0 && (
        <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle]">
          <h2 className="text-sm font-semibold mb-3">Stage History</h2>
          {po.stageHistory.map((h, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-border/30 text-sm last:border-0">
              <span>
                <span className="text-text-secondary">{(h.from_stage || '—').replace(/_/g, ' ')}</span>
                <span className="text-text-tertiary mx-1.5">→</span>
                <span className="font-semibold">{(h.to_stage || '').replace(/_/g, ' ')}</span>
              </span>
              <span className="text-xs text-text-tertiary">
                {new Date(h.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-2.5">
      <div className="text-[9px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</div>
      <div className="text-base font-bold tracking-tight mt-0.5">{value}</div>
    </div>
  );
}

function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
