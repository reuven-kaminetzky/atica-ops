'use client';

import { useState, useEffect, useTransition } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { startReceiving, completeReceiving } from '../../../actions';
import Link from 'next/link';

export default function ReceivingPage() {
  const { id } = useParams();
  const router  = useRouter();
  const [isPending, startTransition] = useTransition();
  const [receiving, setReceiving] = useState(null);
  const [counts, setCounts]       = useState({});
  const [step, setStep]           = useState('count'); // count | review | done
  const [error, setError]         = useState(null);

  useEffect(() => {
    // Load receiving log from warehouse data
    fetch(`/api/store?name=Warehouse`)
      .then(r => r.json())
      .then(d => {
        // Find this receiving record in the queue
        // For now use a simple representation
        setReceiving({ id, items: [], status: 'pending' });
      })
      .catch(() => {});
  }, [id]);

  const expectedItems = receiving?.expected_items
    ? (typeof receiving.expected_items === 'string'
        ? JSON.parse(receiving.expected_items)
        : receiving.expected_items)
    : [];

  function updateCount(itemKey, val) {
    setCounts(p => ({ ...p, [itemKey]: val }));
  }

  function handleStart() {
    startTransition(async () => {
      const result = await startReceiving(id, 'warehouse');
      if (result?.error) { setError(result.error); return; }
      setStep('count');
    });
  }

  function handleComplete() {
    const receivedItems = expectedItems.map((item, i) => {
      const key   = item.sku || item.mpId || String(i);
      const received = parseInt(counts[key]) || 0;
      const expected = parseInt(item.qty || item.quantity) || 0;
      return { ...item, expected, received, variance: received - expected };
    });

    const discrepancies = receivedItems.filter(i => i.variance !== 0);

    startTransition(async () => {
      const result = await completeReceiving(id, receivedItems, discrepancies);
      if (result?.error) { setError(result.error); return; }
      setStep('done');
    });
  }

  if (step === 'done') {
    return (
      <div className="max-w-xl">
        <div className="border border-success/20 bg-success/5 rounded-[--radius-sm] px-4 py-4 mb-6">
          <p className="text-success font-semibold">Receiving complete</p>
          <p className="text-text-secondary text-sm mt-1">Inventory updated. Discrepancies logged.</p>
        </div>
        <Link href="/warehouse" className="text-brand text-sm">← Back to Warehouse</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/warehouse" className="text-brand no-underline hover:underline">Warehouse</Link>
        <span className="mx-2">›</span>
        <span>Receive {id}</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-1">Receiving</h1>
      <p className="text-sm text-text-tertiary mb-6 font-mono">{id}</p>

      {expectedItems.length === 0 ? (
        <div className="border border-border rounded-[--radius-sm] px-4 py-6 text-center">
          <p className="text-text-secondary text-sm mb-3">
            Enter counts for each item. Compare against the packing list.
          </p>
          <div className="space-y-2 mb-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3 items-center">
                <input placeholder="Product / SKU" disabled
                  className="flex-1 px-3 py-2 border border-border rounded-[--radius-sm] text-sm bg-surface-sunken text-text-tertiary" />
                <input placeholder="Count" disabled type="number"
                  className="w-20 px-3 py-2 border border-border rounded-[--radius-sm] text-sm bg-surface-sunken text-text-tertiary" />
              </div>
            ))}
          </div>
          <p className="text-xs text-text-tertiary">
            Expected items load from the receiving log. Make sure this PO was advanced to{' '}
            <span className="font-mono">received</span> stage first.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Count Items</h2>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                  <th className="pb-2 pr-4 text-left font-medium">Item</th>
                  <th className="pb-2 pr-4 text-right font-medium">Expected</th>
                  <th className="pb-2 text-right font-medium">Received</th>
                </tr>
              </thead>
              <tbody>
                {expectedItems.map((item, i) => {
                  const key      = item.sku || item.mpId || String(i);
                  const expected = parseInt(item.qty || item.quantity) || 0;
                  const received = parseInt(counts[key]) || 0;
                  const variance = received - expected;
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium">{item.mpName || item.sku || `Item ${i + 1}`}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-[12px] text-text-secondary">{expected}</td>
                      <td className="py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          {received > 0 && variance !== 0 && (
                            <span className={`text-[11px] font-semibold ${variance > 0 ? 'text-success' : 'text-danger'}`}>
                              {variance > 0 ? '+' : ''}{variance}
                            </span>
                          )}
                          <input
                            type="number"
                            min="0"
                            value={counts[key] ?? ''}
                            onChange={e => updateCount(key, e.target.value)}
                            placeholder={String(expected)}
                            className="w-20 px-2 py-1 border border-border-strong rounded text-sm text-right bg-surface outline-none focus:border-brand font-mono"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-danger text-sm mb-3">{error}</p>}

          <button onClick={handleComplete} disabled={isPending}
            className="px-4 py-2 bg-brand text-white rounded-[--radius-sm] text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {isPending ? 'Saving…' : 'Complete Receiving'}
          </button>
        </>
      )}
    </div>
  );
}
