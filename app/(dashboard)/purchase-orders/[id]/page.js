'use client';

import { useState, useEffect, useTransition } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getPurchaseOrder, advancePOStage } from '../../actions';

// 12-stage lifecycle per PO_WORKFLOW_ENGINE.md
const STAGES = [
  'concept', 'design', 'sample', 'approved', 'costed', 'ordered',
  'production', 'qc', 'shipped', 'in_transit', 'received', 'distribution',
];

const STAGE_LABELS = {
  concept: 'Concept', design: 'Design', sample: 'Sample',
  approved: 'Approved', costed: 'Costed', ordered: 'Ordered',
  production: 'Production', qc: 'QC', shipped: 'Shipped',
  in_transit: 'In Transit', received: 'Received', distribution: 'Distribution',
};

// Gate owners — who must sign off to advance
const GATES = { approved: 'PD', costed: 'Finance', qc: 'PD' };

// What to call the advance button per current stage
const ADVANCE_LABELS = {
  concept: 'Start Design →',
  design: 'Request Sample →',
  sample: 'Submit for Approval →',
  approved: 'Submit for Costing →',
  costed: 'Place Order →',
  ordered: 'Mark Production Started →',
  production: 'Submit for QC →',
  qc: 'Confirm Shipped →',
  shipped: 'Mark In Transit →',
  in_transit: 'Mark Received →',
  received: 'Complete Distribution →',
};

// What the UI emphasises for each stage
const STAGE_FOCUS = {
  concept:    'Define the product, vendor, quantity and target delivery date.',
  design:     'Confirm tech pack, colorways and design specifications.',
  sample:     'Request samples from vendor. Review fit, quality and colour.',
  approved:   'PD lead sign-off. Sample approved, stack ≥ 80% complete.',
  costed:     'Finance confirms pricing, margin and payment schedule.',
  ordered:    'PO sent to vendor. Record proforma invoice and confirm deposit.',
  production: 'Track production timeline. Note expected completion date.',
  qc:         'Quality control before shipment. Upload QC report.',
  shipped:    'Record container, vessel and departure date.',
  in_transit: 'Goods at sea. Confirm ETA and notify warehouse.',
  received:   'Physical count at warehouse. Record any variances.',
  distribution: 'Allocate stock to stores. Confirm final payments.',
};

function deadlineFor(stage, po) {
  const base = po.target_delivery_date || po.eta;
  if (!base) return null;
  const d = new Date(base);
  const lead = parseInt(po.lead_days) || 90;
  const offsets = {
    concept: -lead - 38, design: -lead - 38, sample: -lead - 31,
    approved: -lead - 25, costed: -lead - 24, ordered: -lead - 24,
    production: -lead - 24, qc: -24, shipped: -21,
    in_transit: 0, received: 0, distribution: 0,
  };
  d.setDate(d.getDate() + (offsets[stage] ?? 0));
  return d;
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysFromNow(d) {
  if (!d) return null;
  return Math.round((new Date(d) - new Date()) / 86400000);
}

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
      const result = await advancePOStage(id, { advancedBy: checkedBy || 'system', checkedBy });
      if (result?.error) { setError(result.error); return; }
      await load();
      setCheckedBy('');
    });
  }

  if (loading) return <div className="py-12 text-sm text-text-tertiary">Loading...</div>;
  if (!po) return (
    <div className="py-12">
      <p className="text-danger text-sm mb-3">{error || 'PO not found'}</p>
      <Link href="/purchase-orders" className="text-brand text-sm">← Purchase Orders</Link>
    </div>
  );

  const stageIdx     = STAGES.indexOf(po.stage);
  const nextStage    = STAGES[stageIdx + 1];
  const isComplete   = stageIdx >= STAGES.length - 1;
  const needsGate    = nextStage && GATES[nextStage];
  const currentDeadline = deadlineFor(po.stage, po);
  const daysLeft     = daysFromNow(currentDeadline);
  const isLate       = daysLeft != null && daysLeft < 0;

  const paidTotal    = (po.payments || []).filter(p => p.status === 'paid').reduce((s, p) => s + parseFloat(p.amount || 0), 0);
  const pendingTotal = (po.payments || []).filter(p => p.status !== 'paid').reduce((s, p) => s + parseFloat(p.amount || 0), 0);

  return (
    <div className="max-w-2xl">
      {/* Breadcrumb */}
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/purchase-orders" className="text-brand no-underline hover:underline">Purchase Orders</Link>
        <span className="mx-2">›</span>
        <span>{po.id}</span>
      </div>

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-bold tracking-tight">{po.id}</h1>
          {isLate && (
            <span className="text-danger text-xs font-semibold">
              {Math.abs(daysLeft)}d overdue
            </span>
          )}
          {!isLate && daysLeft != null && daysLeft <= 7 && (
            <span className="text-warning text-xs font-semibold">
              Due in {daysLeft}d
            </span>
          )}
        </div>
        <p className="text-sm text-text-tertiary mt-0.5">
          {po.mp_name || po.mp_id || '—'}
          {po.vendor_name && <> · {po.vendor_name}</>}
        </p>
      </div>

      {/* Summary row */}
      <div className="flex gap-5 text-sm border-b border-border pb-4 mb-5 flex-wrap">
        <div><span className="text-text-tertiary">Units </span><span className="font-semibold">{po.units || '—'}</span></div>
        <div><span className="text-text-tertiary">FOB </span><span className="font-semibold">{po.fob > 0 ? `$${po.fob}` : '—'}</span></div>
        <div><span className="text-text-tertiary">Total </span><span className="font-semibold">${parseFloat(po.fob_total || 0).toLocaleString()}</span></div>
        {po.etd && <div><span className="text-text-tertiary">ETD </span><span className="font-semibold">{fmtDate(po.etd)}</span></div>}
        {po.eta && <div><span className="text-text-tertiary">ETA </span><span className="font-semibold">{fmtDate(po.eta)}</span></div>}
      </div>

      {/* Stage track */}
      <div className="overflow-x-auto mb-5">
        <div className="flex gap-1 min-w-[480px]">
          {STAGES.map((s, i) => (
            <div key={s} title={STAGE_LABELS[s]}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                i < stageIdx  ? 'bg-success' :
                i === stageIdx ? 'bg-brand' :
                'bg-border'
              }`}
            />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-text-tertiary">
          <span>{STAGE_LABELS[po.stage]}</span>
          <span>{stageIdx + 1} / {STAGES.length}</span>
        </div>
      </div>

      {/* Current stage panel */}
      {!isComplete && (
        <div className="border border-border rounded-[--radius-sm] mb-5">
          <div className="px-4 py-3 border-b border-border/50 bg-surface-sunken">
            <div className="text-xs font-bold uppercase tracking-widest text-text-tertiary">
              {STAGE_LABELS[po.stage]}
            </div>
            <p className="text-sm text-text-secondary mt-0.5">{STAGE_FOCUS[po.stage]}</p>
          </div>

          {/* Stage-specific fields — expand as Almond adds columns */}
          {po.stage === 'shipped' && (
            <div className="px-4 py-3 border-b border-border/50 grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-text-tertiary">Container </span><span className="font-mono">{po.container || '—'}</span></div>
              <div><span className="text-text-tertiary">Vessel </span><span>{po.vessel || '—'}</span></div>
            </div>
          )}
          {po.stage === 'in_transit' && (
            <div className="px-4 py-3 border-b border-border/50 text-sm">
              <div className="flex gap-6">
                <div><span className="text-text-tertiary">Container </span><span className="font-mono">{po.container || '—'}</span></div>
                <div><span className="text-text-tertiary">ETA </span><span className="font-semibold">{fmtDate(po.eta)}</span></div>
              </div>
            </div>
          )}

          {/* Deadline */}
          {currentDeadline && (
            <div className={`px-4 py-2.5 border-b border-border/50 text-sm ${isLate ? 'bg-danger/5' : ''}`}>
              <span className="text-text-tertiary">Stage deadline </span>
              <span className={`font-semibold ${isLate ? 'text-danger' : daysLeft != null && daysLeft <= 7 ? 'text-warning' : ''}`}>
                {fmtDate(currentDeadline)}
              </span>
              {daysLeft != null && (
                <span className={`ml-2 text-xs ${isLate ? 'text-danger' : 'text-text-tertiary'}`}>
                  {isLate ? `${Math.abs(daysLeft)}d late` : `${daysLeft}d remaining`}
                </span>
              )}
            </div>
          )}

          {/* Advance */}
          <div className="px-4 py-3">
            {needsGate && (
              <div className="mb-3">
                <label className="block text-xs text-text-secondary mb-1">
                  {GATES[nextStage]} reviewer name
                </label>
                <input value={checkedBy} onChange={e => setCheckedBy(e.target.value)}
                  placeholder="Enter name"
                  className="px-3 py-1.5 rounded-[--radius-sm] border border-border-strong text-sm w-48 outline-none focus:border-brand bg-surface" />
              </div>
            )}
            {error && <p className="text-danger text-xs mb-2">{error}</p>}
            <button onClick={advance}
              disabled={isPending || (needsGate && !checkedBy.trim())}
              className="px-4 py-1.5 rounded-[--radius-sm] bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {isPending ? 'Advancing...' : (ADVANCE_LABELS[po.stage] || `→ ${STAGE_LABELS[nextStage] || 'Complete'}`)}
            </button>
          </div>
        </div>
      )}

      {isComplete && (
        <div className="border border-success/20 bg-success/5 rounded-[--radius-sm] px-4 py-3 mb-5 text-sm font-semibold text-success">
          ✓ Complete — all stages done
        </div>
      )}

      {/* Cash flow impact */}
      {(po.payments || []).length > 0 && (
        <div className="mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
            Cash Flow Impact
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Payment</th>
                <th className="pb-2 pr-4 font-medium text-right">Amount</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {po.payments.map(p => (
                <tr key={p.id} className="border-b border-border/40">
                  <td className="py-2 pr-4">{p.label || p.type}</td>
                  <td className="py-2 pr-4 text-right font-mono text-[12px]">
                    ${parseFloat(p.amount || 0).toLocaleString()}
                  </td>
                  <td className={`py-2 pr-4 text-[12px] ${
                    p.status === 'paid'    ? 'text-success' :
                    p.status === 'overdue' ? 'text-danger font-semibold' :
                    p.status === 'upcoming' ? 'text-warning' :
                    'text-text-tertiary'
                  }`}>{p.status}</td>
                  <td className="py-2 text-text-secondary text-[12px]">
                    {fmtDate(p.due_date)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border text-[12px]">
                <td className="pt-2 pr-4 text-text-tertiary">Paid</td>
                <td className="pt-2 pr-4 text-right font-mono text-success font-semibold">
                  ${Math.round(paidTotal).toLocaleString()}
                </td>
                <td colSpan={2} className="pt-2 text-right text-text-tertiary">
                  ${Math.round(pendingTotal).toLocaleString()} remaining
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Stage history */}
      {(po.stageHistory || []).length > 0 && (
        <details className="border border-border rounded-[--radius-sm]">
          <summary className="px-4 py-3 text-sm text-text-secondary cursor-pointer select-none hover:bg-surface-sunken list-none">
            History ({po.stageHistory.length})
          </summary>
          <div className="px-4 pb-3 pt-2 border-t border-border/50 space-y-1.5">
            {po.stageHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span>
                  <span className="text-text-tertiary">{(h.from_stage || '—').replace(/_/g, ' ')}</span>
                  <span className="text-text-tertiary mx-2">→</span>
                  <span className="font-medium">{(h.to_stage || '').replace(/_/g, ' ')}</span>
                  {h.checked_by && <span className="text-text-tertiary ml-2 text-xs">by {h.checked_by}</span>}
                </span>
                <span className="text-xs text-text-tertiary">{fmtDate(h.changed_at)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
