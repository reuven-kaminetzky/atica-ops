'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getProductList, createPurchaseOrder } from '../../actions';

export default function NewPOPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    mpId: '', vendor: '', fob: '', units: '', moq: '',
    lead: '', duty: '24', hts: '', etd: '', notes: '', paymentTerms: 'standard',
  });

  useEffect(() => {
    getProductList().then(setProducts).catch(() => {});
  }, []);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function selectProduct(mpId) {
    const mp = products.find(p => p.id === mpId);
    if (mp) {
      setForm(prev => ({
        ...prev, mpId: mp.id,
        vendor: mp.vendor_id || prev.vendor,
        fob: mp.fob > 0 ? String(mp.fob) : prev.fob,
        duty: mp.duty > 0 ? String(mp.duty) : prev.duty,
        hts: mp.hts || prev.hts,
        lead: mp.lead_days > 0 ? String(mp.lead_days) : prev.lead,
        moq: mp.moq > 0 ? String(mp.moq) : prev.moq,
      }));
    } else { u('mpId', mpId); }
  }

  const fobTotal = (parseFloat(form.fob) || 0) * (parseInt(form.units) || 0);

  async function submit(e) {
    e.preventDefault();
    if (!form.vendor) { setError('Vendor required'); return; }
    setError(null);

    startTransition(async () => {
      const selectedMP = products.find(p => p.id === form.mpId);
      const result = await createPurchaseOrder({
        mpId: form.mpId || null,
        mpName: selectedMP?.name || null,
        mpCode: selectedMP?.code || null,
        category: selectedMP?.category || null,
        vendor: form.vendor, vendorName: form.vendor,
        vendorId: selectedMP?.vendor_id || null,
        fob: parseFloat(form.fob) || 0, units: parseInt(form.units) || 0,
        moq: parseInt(form.moq) || 0, lead: parseInt(form.lead) || 0,
        duty: parseFloat(form.duty) || 0, hts: form.hts,
        etd: form.etd || null, notes: form.notes,
        paymentTerms: form.paymentTerms,
      });

      if (result.error) { setError(result.error); return; }
      router.push(`/purchase-orders/${result.po.id}`);
    });
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Create Purchase Order</h1>

      {error && <div className="mb-4 p-3 bg-danger/10 text-danger rounded-[--radius-md] text-sm">{error}</div>}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary mb-1">Master Product</label>
          <select value={form.mpId} onChange={e => selectProduct(e.target.value)}
            className="w-full p-2 border border-border-strong rounded bg-surface text-sm outline-none focus:border-brand">
            <option value="">— Select MP —</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Vendor" value={form.vendor} onChange={v => u('vendor', v)} required />
          <Field label="Payment Terms" value={form.paymentTerms} onChange={v => u('paymentTerms', v)} select
            options={[['standard', 'Standard (30/40/30)'], ['net30', 'Net 30 (50/50)'], ['full', 'Full Payment']]} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="FOB ($)" value={form.fob} onChange={v => u('fob', v)} type="number" />
          <Field label="Units" value={form.units} onChange={v => u('units', v)} type="number" />
          <Field label="MOQ" value={form.moq} onChange={v => u('moq', v)} type="number" />
        </div>

        {fobTotal > 0 && (
          <div className="text-sm text-text-secondary bg-surface-sunken p-3 rounded-[--radius-sm]">
            FOB Total: <span className="font-semibold text-text">${fobTotal.toLocaleString()}</span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="Lead Days" value={form.lead} onChange={v => u('lead', v)} type="number" />
          <Field label="Duty %" value={form.duty} onChange={v => u('duty', v)} type="number" />
          <Field label="HTS Code" value={form.hts} onChange={v => u('hts', v)} />
        </div>

        <Field label="ETD" value={form.etd} onChange={v => u('etd', v)} type="date" />
        <Field label="Notes" value={form.notes} onChange={v => u('notes', v)} textarea />

        <button type="submit" disabled={isPending}
          className="w-full py-2.5 px-4 bg-brand text-white rounded-[--radius-md] font-semibold text-sm hover:bg-brand-dark disabled:opacity-50 cursor-pointer">
          {isPending ? 'Creating...' : 'Create PO'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required, textarea, select, options }) {
  const cls = "w-full p-2 border border-border-strong rounded bg-surface text-sm outline-none focus:border-brand";
  return (
    <div>
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}</label>
      {select ? (
        <select value={value} onChange={e => onChange(e.target.value)} className={cls}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} className={cls} rows={3} />
      ) : (
        <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} className={cls} />
      )}
    </div>
  );
}
