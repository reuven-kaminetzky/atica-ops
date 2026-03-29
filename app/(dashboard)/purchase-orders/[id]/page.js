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

  if (loading) return <div className="py-12 text-center text-text-tertiary text-sm">Loading...</div>;
  if (!po) return (
    <div className="py-12">
      <p className="text-danger mb-3 text-sm">{error || 'PO not found'}</p>
      <Link href="/purchase-orders" className="text-brand text-sm">← Purchase Orders</Link>
    </div>
  );

  const currentIdx = STAGES.indexOf(po.stage);
  const next = STAGES[currentIdx + 1];
  const needsGate = next && GATES[next];
  const isComplete = currentIdx >= STAGES.length - 1;

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/purchase-orders" className="text-brand no-underline hover:underline">Purchase Orders</Link>
        <span className="mx-2">›</span>
        <span>{po.id}</span>
      </div>

      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight mb-1">{po.id}</h1>
        <p className="text-sm text-text-tertiary">
          {po.mp_name || po.mp_id || '—'}
          {po.vendor_name && <> · {po.vendor_name}</>}
        </p>
      </div>

      {/* Summary row */}
      <div className="flex gap-6 text-sm border-b border-border pb-5 mb-6 flex-wrap">
        <div><span className="text-text-tertiary">FOB </span><span className="font-semibold">{po.fob > 0 ? `$${po.fob}` : '—'}</span></div>
        <div><span className="text-text-tertiary">Units </span><span className="font-semibold">{po.units || '—'}</span></div>
        <div><span className="text-text-tertiary">Total </span><span className="font-semibold">${parseFloat(po.fob_total || 0).toLocaleString()}</span></div>
        <div><span className="text-text-tertiary">ETD </span><span className="font-semibold">{po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
        <div><span className="text-text-tertiary">Lead </span><span className="font-semibold">{po.lead_days ? `${po.lead_days}d` : '—'}</span></div>
        {po.payments?.length > 0 && (
          <div><span className="text-text-tertiary">Payments </span><span className="font-semibold">{po.payments.length}</span></div>
        )}
      </div>

      {/* Stage track */}
      <div className="mb-4 overflow-x-auto">
        <div className="flex gap-1 min-w-[560px]">
          {STAGES.map((s, i) => {
            const done = i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={s} className={`flex-1 text-center py-1.5 rounded text-[9px] font-semibold uppercase tracking-wide ${
                active ? 'bg-brand text-white' : done ? 'bg-success/15 text-success' : 'bg-surface-sunken text-text-tertiary'
              }`}>
                {s.replace(/_/g, ' ')}
                {GATES[s] && <div className="text-[7px] opacity-60">🔒</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Advance */}
      {!isComplete && (
        <div className="mb-6">
          {needsGate && (
            <div className="mb-2">
              <label className="block text-xs text-text-secondary mb-1">{GATES[next]} reviewer name</label>
              <input value={checkedBy} onChange={e => setCheckedBy(e.target.value)} placeholder="Name"
                className="px-3 py-1.5 rounded-[--radius-sm] border border-border-strong text-sm w-48 outline-none focus:border-brand" />
            </div>
          )}
          {error && <p className="text-danger text-sm mb-2">{error}</p>}
          <button onClick={advance} disabled={isPending || (needsGate && !checkedBy.trim())}
            className="px-4 py-1.5 rounded-[--radius-sm] bg-brand text-white font-semibold text-sm hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed">
            {isPending ? 'Advancing...' : `→ ${(next || '').replace(/_/g, ' ')}`}
          </button>
        </div>
      )}

      {/* Payments */}
      {po.payments?.length > 0 && (
        <div className="mb-6">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Payments</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Label</th>
                <th className="pb-2 pr-4 font-medium text-right">Amount</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {po.payments.map(p => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-2 pr-4">{p.label || p.type}</td>
                  <td className="py-2 pr-4 text-right font-mono">${(parseFloat(p.amount) || 0).toLocaleString()}</td>
                  <td className={`py-2 pr-4 ${
                    p.status === 'paid' ? 'text-success' :
                    p.status === 'overdue' ? 'text-danger font-semibold' :
                    'text-text-secondary'
                  }`}>{p.status}</td>
                  <td className="py-2 text-text-secondary">
                    {p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Stage history */}
      {po.stageHistory?.length > 0 && (
        <details className="border border-border rounded-[--radius-sm]">
          <summary className="px-4 py-3 text-sm cursor-pointer select-none hover:bg-surface-sunken list-none text-text-secondary">
            Stage history ({po.stageHistory.length})
          </summary>
          <div className="px-4 pb-3 border-t border-border/50">
            {po.stageHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 text-sm last:border-0">
                <span>
                  <span className="text-text-tertiary">{(h.from_stage || '—').replace(/_/g, ' ')}</span>
                  <span className="text-text-tertiary mx-2">→</span>
                  <span>{(h.to_stage || '').replace(/_/g, ' ')}</span>
                </span>
                <span className="text-xs text-text-tertiary">
                  {new Date(h.changed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
