'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewPOPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({
    mpId: '', vendor: '', fob: '', units: '', moq: '',
    lead: '', duty: '24', hts: '', etd: '', notes: '', paymentTerms: 'standard',
  });

  useEffect(() => {
    fetch('/api/products').then(r => r.json()).then(d => {
      setProducts(d.products || []);
    }).catch(() => {});
  }, []);

  const u = (k, v) => setForm(p => ({ ...p, [k]: v }));

  function selectProduct(mpId) {
    const mp = products.find(p => p.id === mpId);
    if (mp) {
      setForm(prev => ({
        ...prev,
        mpId: mp.id,
        vendor: mp.vendor_id || prev.vendor,
        fob: mp.fob > 0 ? String(mp.fob) : prev.fob,
        duty: mp.duty > 0 ? String(mp.duty) : prev.duty,
        hts: mp.hts || prev.hts,
        lead: mp.lead_days > 0 ? String(mp.lead_days) : prev.lead,
        moq: mp.moq > 0 ? String(mp.moq) : prev.moq,
      }));
    } else {
      u('mpId', mpId);
    }
  }

  const fobTotal = (parseFloat(form.fob) || 0) * (parseInt(form.units) || 0);

  async function submit(e) {
    e.preventDefault();
    if (!form.vendor) { setError('Vendor required'); return; }
    setLoading(true); setError(null);
    try {
      const selectedMP = products.find(p => p.id === form.mpId);
      const res = await fetch('/api/purchase-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpId: form.mpId || null,
          mpName: selectedMP?.name || null,
          mpCode: selectedMP?.code || null,
          category: selectedMP?.category || null,
          vendor: form.vendor, vendorName: form.vendor,
          vendorId: selectedMP?.vendor_id || null,
          fob: parseFloat(form.fob) || 0, units: parseInt(form.units) || 0,
          moq: parseInt(form.moq) || 0, lead: parseInt(form.lead) || 0,
          duty: parseFloat(form.duty) || 0 || 0, hts: form.hts || null,
          etd: form.etd || null, notes: form.notes, paymentTerms: form.paymentTerms,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push('/purchase-orders');
    } catch (e) { setError(e.message); }
    setLoading(false);
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Create Purchase Order</h1>

      {error && (
        <div className="p-3 rounded-[--radius-sm] bg-danger-light border border-danger/20 text-danger text-sm mb-4">{error}</div>
      )}

      <form onSubmit={submit}>
        <Card title="Product & Vendor">
          <div className="mb-2">
            <label className="block text-xs font-semibold text-text-secondary mb-1">Product</label>
            <select value={form.mpId} onChange={e => selectProduct(e.target.value)}
              className="w-full px-3 py-2 rounded-[--radius-sm] border border-border-strong text-sm bg-surface">
              <option value="">— Select product (optional) —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.code}) — ${p.fob} FOB</option>
              ))}
            </select>
          </div>
          <Input label="Vendor" value={form.vendor} onChange={v => u('vendor', v)} placeholder="e.g. TAL Group" required />
        </Card>

        <Card title="Pricing & Quantity">
          <div className="grid grid-cols-2 gap-3">
            <Input label="FOB ($)" value={form.fob} onChange={v => u('fob', v)} type="number" placeholder="0.00" />
            <Input label="Units" value={form.units} onChange={v => u('units', v)} type="number" placeholder="0" />
            <Input label="MOQ" value={form.moq} onChange={v => u('moq', v)} type="number" placeholder="0" />
            <Input label="Duty (%)" value={form.duty} onChange={v => u('duty', v)} type="number" placeholder="24" />
          </div>
          {fobTotal > 0 && (
            <div className="mt-3 p-3 bg-surface-sunken rounded-[--radius-sm] text-sm">
              <span className="font-semibold">FOB Total: ${fobTotal.toLocaleString()}</span>
              {form.duty && (
                <span className="ml-4 text-text-secondary">
                  Landed: ${(fobTotal * (1 + parseFloat(form.duty) || 0 / 100)).toLocaleString()}
                </span>
              )}
            </div>
          )}
        </Card>

        <Card title="Logistics">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Lead Time (days)" value={form.lead} onChange={v => u('lead', v)} type="number" placeholder="90" />
            <Input label="HTS Code" value={form.hts} onChange={v => u('hts', v)} placeholder="6203.42.40" />
            <Input label="ETD" value={form.etd} onChange={v => u('etd', v)} type="date" />
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Payment Terms</label>
              <select value={form.paymentTerms} onChange={e => u('paymentTerms', e.target.value)}
                className="w-full px-3 py-2 rounded-[--radius-sm] border border-border-strong text-sm bg-surface">
                <option value="standard">Standard (30/40/30)</option>
                <option value="full">Full upfront</option>
                <option value="net30">Net 30</option>
              </select>
            </div>
          </div>
        </Card>

        <Card title="Notes">
          <textarea value={form.notes} onChange={e => u('notes', e.target.value)}
            rows={3} placeholder="Any notes..."
            className="w-full px-3 py-2 rounded-[--radius-sm] border border-border-strong text-sm bg-surface resize-y" />
        </Card>

        <div className="flex gap-3 mt-4">
          <button type="submit" disabled={loading}
            className="px-6 py-2.5 rounded-[--radius-sm] bg-brand text-white font-semibold text-sm hover:bg-brand-dark disabled:opacity-50 disabled:cursor-wait">
            {loading ? 'Creating...' : 'Create PO'}
          </button>
          <button type="button" onClick={() => router.push('/purchase-orders')}
            className="px-6 py-2.5 rounded-[--radius-sm] border border-border-strong text-text-secondary font-medium text-sm hover:bg-surface-raised">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
      <h2 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h2>
      {children}
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', placeholder, required }) {
  return (
    <div className="mb-2">
      <label className="block text-xs font-semibold text-text-secondary mb-1">{label}{required && ' *'}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full px-3 py-2 rounded-[--radius-sm] border border-border-strong text-sm bg-surface outline-none focus:border-brand" />
    </div>
  );
}
