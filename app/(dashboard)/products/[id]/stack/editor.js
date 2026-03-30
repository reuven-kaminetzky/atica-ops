'use client';

import { useState, useTransition } from 'react';
import { updateStack } from '../../../actions';

export default function StackEditor({ mpId, sections, initialStack, category }) {
  const [stack, setStack]       = useState(initialStack || {});
  const [open, setOpen]         = useState({});
  const [dirty, setDirty]       = useState({});
  const [saving, setSaving]     = useState(null);
  const [saved, setSaved]       = useState({});
  const [isPending, startTransition] = useTransition();

  function update(sectionId, key, val) {
    setStack(prev => ({ ...prev, [key]: val }));
    setDirty(prev => ({ ...prev, [sectionId]: true }));
    setSaved(prev => ({ ...prev, [sectionId]: false }));
  }

  function saveSection(sectionId, fields) {
    setSaving(sectionId);
    const updates = {};
    fields.forEach(f => {
      if (stack[f.key] !== undefined) updates[f.key] = stack[f.key];
    });
    startTransition(async () => {
      await updateStack(mpId, updates);
      setSaving(null);
      setSaved(prev => ({ ...prev, [sectionId]: true }));
      setDirty(prev => ({ ...prev, [sectionId]: false }));
    });
  }

  function isRequired(field, sec) {
    if (field.required) return true;
    // Category-conditional (construction fields for suits)
    if (field.key === 'lining_type' && ['Suits', 'Outerwear'].includes(category)) return true;
    if (field.key === 'interlining' && category === 'Suits') return true;
    return false;
  }

  function sectionComplete(sec) {
    return sec.fields.filter(f => isRequired(f, sec)).every(f => {
      const v = stack[f.key];
      return v !== undefined && v !== '' && v !== null;
    });
  }

  return (
    <div className="space-y-1">
      {sections.map(sec => {
        const isOpen  = open[sec.id];
        const isDone  = sectionComplete(sec);
        const isDirty = dirty[sec.id];
        const wasSaved = saved[sec.id];
        const isSaving = saving === sec.id;

        return (
          <div key={sec.id} className="border border-border rounded-[--radius-sm] overflow-hidden">
            <button
              onClick={() => setOpen(p => ({ ...p, [sec.id]: !p[sec.id] }))}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface-sunken transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isDone ? 'bg-success' : 'bg-border'}`} />
                <span className="text-sm font-medium">{sec.label}</span>
                {sec.weight > 0 && <span className="text-text-tertiary text-[11px]">{sec.weight}%</span>}
              </div>
              <div className="flex items-center gap-2">
                {wasSaved && <span className="text-success text-[11px]">saved</span>}
                {isDirty && <span className="text-warning text-[11px]">unsaved</span>}
                <span className="text-text-tertiary text-xs">{isOpen ? '▲' : '▼'}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border/50 px-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {sec.fields.map(field => {
                    const req = isRequired(field, sec);
                    const val = stack[field.key] ?? '';
                    const missing = req && !val;

                    return (
                      <div key={field.key} className={field.type === 'textarea' ? 'sm:col-span-2' : ''}>
                        <label className="block text-[11px] font-medium text-text-secondary mb-1">
                          {field.label}
                          {req && <span className="text-danger ml-1">*</span>}
                        </label>
                        {field.type === 'select' ? (
                          <select value={val} onChange={e => update(sec.id, field.key, e.target.value)}
                            className={`w-full px-2.5 py-1.5 text-sm border rounded bg-surface outline-none focus:border-brand ${missing ? 'border-danger/40' : 'border-border-strong'}`}>
                            <option value="">—</option>
                            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : field.type === 'textarea' ? (
                          <textarea value={val} rows={3}
                            onChange={e => update(sec.id, field.key, e.target.value)}
                            placeholder={field.placeholder || ''}
                            className={`w-full px-2.5 py-1.5 text-sm border rounded bg-surface outline-none focus:border-brand resize-y ${missing ? 'border-danger/40' : 'border-border-strong'}`}
                          />
                        ) : (
                          <input type={field.type === 'number' ? 'number' : 'text'}
                            value={val}
                            onChange={e => update(sec.id, field.key, e.target.value)}
                            placeholder={field.placeholder || ''}
                            className={`w-full px-2.5 py-1.5 text-sm border rounded bg-surface outline-none focus:border-brand ${missing ? 'border-danger/40' : 'border-border-strong'}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => saveSection(sec.id, sec.fields)}
                  disabled={isSaving || isPending || !isDirty}
                  className="px-3 py-1.5 bg-brand text-white text-sm font-semibold rounded-[--radius-sm] hover:bg-brand-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
