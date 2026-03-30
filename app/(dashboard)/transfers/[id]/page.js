'use client';

import { useState, useEffect, useTransition } from 'react';
import { useParams } from 'next/navigation';
import { advanceTransfer } from '../../actions';
import Link from 'next/link';

const STATUS_FLOW = ['planned', 'picked', 'loaded', 'in_transit', 'delivered', 'confirmed'];
const ADVANCE_LABEL = {
  planned:    'Mark Picked →',
  picked:     'Mark Loaded →',
  loaded:     'Depart →',
  in_transit: 'Mark Delivered →',
  delivered:  'Confirm Receipt →',
};

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function TransferDetailPage() {
  const { id } = useParams();
  const [transfer, setTransfer] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  async function load() {
    try {
      const res = await fetch(`/api/transfers?id=${encodeURIComponent(id)}`);
      if (res.ok) {
        const data = await res.json();
        setTransfer(Array.isArray(data) ? data.find(t => t.id === id) : data);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  function advance() {
    if (!transfer) return;
    const currentIdx = STATUS_FLOW.indexOf(transfer.status);
    const nextStatus = STATUS_FLOW[currentIdx + 1];
    if (!nextStatus) return;
    setError(null);
    startTransition(async () => {
      const result = await advanceTransfer(id, nextStatus, 'ops');
      if (result?.error) { setError(result.error); return; }
      await load();
    });
  }

  if (loading) return <div className="py-12 text-sm text-text-tertiary">Loading…</div>;
  if (!transfer) return (
    <div className="py-12">
      <p className="text-text-secondary text-sm mb-3">{error || 'Transfer not found.'}</p>
      <Link href="/transfers" className="text-brand text-sm">← Transfers</Link>
    </div>
  );

  const statusIdx = STATUS_FLOW.indexOf(transfer.status);
  const isDone    = transfer.status === 'confirmed';
  const items     = typeof transfer.items === 'string' ? JSON.parse(transfer.items) : (transfer.items || []);

  return (
    <div className="max-w-2xl">
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/transfers" className="text-brand no-underline hover:underline">Transfers</Link>
        <span className="mx-2">›</span>
        <span>{id}</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-1">{id}</h1>
      <p className="text-sm text-text-tertiary mb-5">
        {transfer.from_location} → {transfer.to_location}
        {transfer.created_by && <> · {transfer.created_by}</>}
      </p>

      {/* Status bar */}
      <div className="overflow-x-auto mb-5">
        <div className="flex gap-1 min-w-[400px]">
          {STATUS_FLOW.map((s, i) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full ${
              i < statusIdx  ? 'bg-success' :
              i === statusIdx ? 'bg-brand' : 'bg-border'
            }`} />
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-text-tertiary">
          <span>{transfer.status.replace(/_/g, ' ')}</span>
          <span>{statusIdx + 1}/{STATUS_FLOW.length}</span>
        </div>
      </div>

      {/* Items */}
      {items.length > 0 && (
        <div className="mb-5">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Items</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 text-left font-medium">Product</th>
                <th className="pb-2 text-right font-medium">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td className="py-2 pr-4">{item.mpName || item.sku || `Item ${i + 1}`}</td>
                  <td className="py-2 text-right font-mono text-[12px]">{item.qty}</td>
                </tr>
              ))}
              <tr>
                <td className="pt-2 text-text-tertiary text-[12px]">Total</td>
                <td className="pt-2 text-right font-mono text-[12px] font-semibold">{transfer.total_units}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Timeline */}
      <div className="mb-5">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Timeline</h2>
        <div className="space-y-1 text-sm">
          {[
            ['Created',   transfer.created_at,  transfer.created_by],
            ['Picked',    transfer.picked_at,   transfer.picked_by],
            ['Departed',  transfer.departed_at, null],
            ['Delivered', transfer.delivered_at, null],
            ['Confirmed', transfer.confirmed_at, transfer.confirmed_by],
          ].filter(([, date]) => date).map(([label, date, by]) => (
            <div key={label} className="flex justify-between">
              <span className="text-text-secondary">{label}{by ? ` — ${by}` : ''}</span>
              <span className="text-text-tertiary text-[12px]">{fmtDate(date)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Advance */}
      {!isDone && ADVANCE_LABEL[transfer.status] && (
        <div>
          {error && <p className="text-danger text-sm mb-2">{error}</p>}
          <button onClick={advance} disabled={isPending}
            className="px-4 py-1.5 bg-brand text-white rounded-[--radius-sm] text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {isPending ? 'Updating…' : ADVANCE_LABEL[transfer.status]}
          </button>
        </div>
      )}

      {isDone && (
        <div className="border border-success/20 bg-success/5 rounded-[--radius-sm] px-4 py-2.5 text-sm text-success font-semibold">
          ✓ Confirmed — transfer complete
        </div>
      )}
    </div>
  );
}
