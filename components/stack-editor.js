'use client';

import { useState } from 'react';

const FIELDS = [
  { key: 'fabric_type', label: 'Fabric Type', placeholder: 'e.g. Italian wool twill' },
  { key: 'fabric_weight', label: 'Weight', placeholder: 'e.g. 260gsm' },
  { key: 'fabric_comp', label: 'Composition', placeholder: 'e.g. 100% wool' },
  { key: 'fabric_mill', label: 'Mill', placeholder: 'e.g. Vitale Barberis' },
  { key: 'lining', label: 'Lining', placeholder: 'e.g. Bemberg cupro' },
  { key: 'buttons', label: 'Buttons', placeholder: 'e.g. Real horn, 20L' },
  { key: 'interlining', label: 'Interlining', placeholder: 'e.g. Half-canvas' },
  { key: 'country_of_origin', label: 'Country of Origin', placeholder: 'e.g. China' },
  { key: 'aql_level', label: 'AQL Level', placeholder: 'e.g. 2.5' },
  { key: 'wash_care', label: 'Wash/Care', placeholder: 'e.g. Dry clean only' },
  { key: 'labels', label: 'Labels', placeholder: 'e.g. Woven neck, care, size' },
  { key: 'packaging', label: 'Packaging', placeholder: 'e.g. Individual poly bag' },
];

export default function StackEditor({ mpId, stack }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => {
    const init = {};
    for (const f of FIELDS) init[f.key] = stack?.[f.key] || '';
    return init;
  });
  const [savedStack, setSavedStack] = useState(stack);
  const [completeness, setCompleteness] = useState(stack?.completeness || 0);

  async function save() {
    setSaving(true);
    try {
      const updates = {};
      for (const f of FIELDS) {
        if (form[f.key] !== (savedStack?.[f.key] || '')) {
          updates[f.key] = form[f.key] || null;
        }
      }
      if (Object.keys(updates).length === 0) { setEditing(false); setSaving(false); return; }

      const res = await fetch(`/api/products/${encodeURIComponent(mpId)}/stack`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.completeness !== undefined) setCompleteness(data.completeness);
      setSavedStack({ ...savedStack, ...updates });
      setEditing(false);
    } catch (e) {
      console.error('Stack save failed:', e);
    }
    setSaving(false);
  }

  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
        <h2 className="text-sm font-semibold">Product Stack</h2>
        <button onClick={() => editing ? save() : setEditing(true)} disabled={saving}
          className={`text-xs font-semibold px-3 py-1 rounded cursor-pointer transition-colors ${
            editing
              ? 'bg-brand text-white hover:bg-brand-dark'
              : 'bg-surface-sunken text-text-secondary hover:bg-surface-raised'
          }`}>{saving ? 'Saving...' : editing ? 'Save' : 'Edit'}</button>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {FIELDS.map(f => (
          <div key={f.key} className="py-1">
            <span className="text-text-tertiary text-xs">{f.label}: </span>
            {editing ? (
              <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full mt-0.5 px-2 py-1 rounded border border-border-strong text-sm bg-surface outline-none focus:border-brand" />
            ) : (
              <span className={form[f.key] ? '' : 'text-border'}>{form[f.key] || '—'}</span>
            )}
          </div>
        ))}
      </div>

      {completeness > 0 && (
        <div className="mt-4">
          <div className="text-[11px] text-text-secondary mb-1">Completeness: {completeness}%</div>
          <div className="h-1.5 bg-surface-sunken rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${
              completeness >= 80 ? 'bg-success' : completeness >= 50 ? 'bg-warning' : 'bg-danger'
            }`} style={{ width: `${completeness}%` }} />
          </div>
        </div>
      )}

      {editing && (
        <button onClick={() => setEditing(false)}
          className="mt-3 text-xs text-text-tertiary hover:text-text-secondary cursor-pointer">Cancel</button>
      )}
    </div>
  );
}
