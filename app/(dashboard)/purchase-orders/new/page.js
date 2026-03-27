'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NewPOPage() {
  const router = useRouter();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    mpId: '', vendor: '', fob: '', units: '', moq: '',
    lead: '', duty: '', hts: '', etd: '', notes: '', paymentTerms: 'standard',
  });

  useEffect(() => {
    fetch('/api/shopify/products').then(r => r.json()).then(d => {
      // Also load from DB
      fetch('/api/health').catch(() => null);
    }).catch(() => null);

    // Load MPs from database for the dropdown
    const loadProducts = async () => {
      try {
        const res = await fetch('/api/purchase-orders');
        // Just need products list — use a simple query
      } catch (e) {}
    };
  }, []);

  const selectedMP = products.find(p => p.id === form.mpId);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.vendor && !form.mpId) {
      setError('Vendor or product required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mpId: form.mpId || null,
          vendor: form.vendor,
          vendorName: form.vendor,
          fob: parseFloat(form.fob) || 0,
          units: parseInt(form.units) || 0,
          moq: parseInt(form.moq) || 0,
          lead: parseInt(form.lead) || 0,
          duty: parseFloat(form.duty) || 0,
          hts: form.hts || null,
          etd: form.etd || null,
          notes: form.notes,
          paymentTerms: form.paymentTerms,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push('/purchase-orders');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const fobTotal = (parseFloat(form.fob) || 0) * (parseInt(form.units) || 0);

  return (
    <div style={{ maxWidth: 600 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Create Purchase Order</h1>

      {error && (
        <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#dc2626', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Section title="Product & Vendor">
          <Field label="Vendor *" value={form.vendor} onChange={v => update('vendor', v)} placeholder="e.g. TAL Group" />
          <Field label="Product ID" value={form.mpId} onChange={v => update('mpId', v)} placeholder="e.g. londoner (optional)" />
        </Section>

        <Section title="Pricing & Quantity">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Field label="FOB ($)" value={form.fob} onChange={v => update('fob', v)} type="number" placeholder="0.00" />
            <Field label="Units" value={form.units} onChange={v => update('units', v)} type="number" placeholder="0" />
            <Field label="MOQ" value={form.moq} onChange={v => update('moq', v)} type="number" placeholder="0" />
            <Field label="Duty (%)" value={form.duty} onChange={v => update('duty', v)} type="number" placeholder="24" />
          </div>
          {fobTotal > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.65rem', background: '#f0f2f5', borderRadius: 6, fontSize: '0.85rem' }}>
              <strong>FOB Total:</strong> ${fobTotal.toLocaleString()}
              {form.duty && <span style={{ marginLeft: '1rem', color: '#5f6880' }}>
                Landed: ${(fobTotal * (1 + parseFloat(form.duty) / 100)).toLocaleString()}
              </span>}
            </div>
          )}
        </Section>

        <Section title="Logistics">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <Field label="Lead Time (days)" value={form.lead} onChange={v => update('lead', v)} type="number" placeholder="90" />
            <Field label="HTS Code" value={form.hts} onChange={v => update('hts', v)} placeholder="6203.42.40" />
            <Field label="ETD" value={form.etd} onChange={v => update('etd', v)} type="date" />
            <div>
              <label style={labelStyle}>Payment Terms</label>
              <select value={form.paymentTerms} onChange={e => update('paymentTerms', e.target.value)} style={inputStyle}>
                <option value="standard">Standard (30/40/30)</option>
                <option value="full">Full upfront</option>
                <option value="net30">Net 30</option>
              </select>
            </div>
          </div>
        </Section>

        <Section title="Notes">
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)}
            rows={3} placeholder="Any notes..." style={{ ...inputStyle, resize: 'vertical' }} />
        </Section>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button type="submit" disabled={loading} style={{
            padding: '0.6rem 1.5rem', borderRadius: 6, border: '1px solid #714b67',
            background: '#714b67', color: 'white', fontWeight: 600, fontSize: '0.85rem',
            cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? 'Creating...' : 'Create PO'}
          </button>
          <button type="button" onClick={() => router.push('/purchase-orders')} style={{
            padding: '0.6rem 1.5rem', borderRadius: 6, border: '1px solid #d5d9e0',
            background: 'white', color: '#5f6880', fontWeight: 500, fontSize: '0.85rem', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e8ed', borderRadius: 10, padding: '1rem 1.15rem', marginBottom: '1rem' }}>
      <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f0f2f5' }}>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} style={inputStyle} />
    </div>
  );
}

const labelStyle = { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#5f6880', marginBottom: '0.25rem' };
const inputStyle = {
  width: '100%', padding: '0.5rem 0.65rem', borderRadius: 6, border: '1px solid #d5d9e0',
  fontSize: '0.85rem', background: 'white', outline: 'none', boxSizing: 'border-box',
};
