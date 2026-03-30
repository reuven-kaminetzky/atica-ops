'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTransfer } from '../../actions';
import Link from 'next/link';

const STORES = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey', 'Warehouse'];

export default function NewTransferPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [from, setFrom]     = useState('Warehouse');
  const [to, setTo]         = useState('Lakewood');
  const [items, setItems]   = useState([{ mpName: '', qty: '' }]);
  const [error, setError]   = useState(null);

  function addItem() { setItems(p => [...p, { mpName: '', qty: '' }]); }
  function removeItem(i) { setItems(p => p.filter((_, j) => j !== i)); }
  function updateItem(i, field, val) {
    setItems(p => p.map((it, j) => j === i ? { ...it, [field]: val } : it));
  }

  function submit() {
    const validItems = items.filter(it => it.mpName.trim() && parseInt(it.qty) > 0);
    if (!validItems.length) { setError('Add at least one item with a quantity.'); return; }
    if (from === to) { setError('From and To must be different locations.'); return; }
    setError(null);

    startTransition(async () => {
      const result = await createTransfer({
        fromLocation: from,
        toLocation: to,
        items: validItems.map(it => ({ mpName: it.mpName.trim(), qty: parseInt(it.qty) })),
        createdBy: 'ops',
      });
      if (result?.error) { setError(result.error); return; }
      router.push('/transfers');
    });
  }

  return (
    <div className="max-w-xl">
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/transfers" className="text-brand no-underline hover:underline">Transfers</Link>
        <span className="mx-2">›</span>
        <span>New</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-6">New Transfer</h1>

      {/* From / To */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">From</label>
          <select value={from} onChange={e => setFrom(e.target.value)}
            className="w-full px-3 py-2 border border-border-strong rounded-[--radius-sm] text-sm bg-surface outline-none focus:border-brand">
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">To</label>
          <select value={to} onChange={e => setTo(e.target.value)}
            className="w-full px-3 py-2 border border-border-strong rounded-[--radius-sm] text-sm bg-surface outline-none focus:border-brand">
            {STORES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Items */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Items</label>
          <button onClick={addItem} className="text-xs text-brand hover:underline">+ Add item</button>
        </div>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={item.mpName}
                onChange={e => updateItem(i, 'mpName', e.target.value)}
                placeholder="Product name"
                className="flex-1 px-3 py-2 border border-border-strong rounded-[--radius-sm] text-sm bg-surface outline-none focus:border-brand"
              />
              <input
                type="number"
                value={item.qty}
                onChange={e => updateItem(i, 'qty', e.target.value)}
                placeholder="Qty"
                min="1"
                className="w-20 px-3 py-2 border border-border-strong rounded-[--radius-sm] text-sm bg-surface outline-none focus:border-brand"
              />
              {items.length > 1 && (
                <button onClick={() => removeItem(i)} className="text-text-tertiary hover:text-danger text-sm px-1">×</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      <button onClick={submit} disabled={isPending}
        className="px-4 py-2 bg-brand text-white rounded-[--radius-sm] text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors">
        {isPending ? 'Creating…' : 'Create Transfer'}
      </button>
    </div>
  );
}
