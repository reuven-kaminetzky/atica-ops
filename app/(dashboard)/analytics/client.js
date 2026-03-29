'use client';

import { useState, useTransition } from 'react';
import { getDataBreakdown } from '../actions';
import Link from 'next/link';

const DIMENSIONS = [
  { id: 'category', label: 'Category' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'mp',       label: 'Product' },
  { id: 'style',    label: 'Style' },
  { id: 'location', label: 'Location' },
  { id: 'grade',    label: 'Grade' },
];

const COLUMNS = [
  { id: 'stock',    label: 'Stock' },
  { id: 'incoming', label: 'Inc' },
  { id: 'sales',    label: 'Sales' },
  { id: 'velocity', label: 'Vel/wk' },
  { id: 'days',     label: 'Days' },
  { id: 'x_rate',   label: 'Sell-thru' },
  { id: 'revenue',  label: 'Revenue' },
];

const DEFAULT_COLS = ['stock', 'incoming', 'sales', 'velocity', 'days'];

export default function AnalyticsClient({ initial }) {
  const [data, setData] = useState(initial || { rows: [], totals: {} });
  const [groupBy, setGroupBy] = useState('category');
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [showColPicker, setShowColPicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  function fetch(newGroupBy, newCols) {
    startTransition(async () => {
      const result = await getDataBreakdown({
        groupBy: newGroupBy,
        columns: newCols,
      });
      if (!result.error) setData(result);
    });
  }

  function changeGroupBy(dim) {
    setGroupBy(dim);
    fetch(dim, cols);
  }

  function toggleCol(id) {
    const next = cols.includes(id) ? cols.filter(c => c !== id) : [...cols, id];
    setCols(next);
    fetch(groupBy, next);
  }

  const rows = data.rows || [];
  const totals = data.totals || {};
  const visibleCols = COLUMNS.filter(c => cols.includes(c.id));

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        {isPending && <span className="text-xs text-text-tertiary">Loading...</span>}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider">Group by</span>
        {DIMENSIONS.map(d => (
          <button key={d.id} onClick={() => changeGroupBy(d.id)}
            disabled={isPending}
            className={`px-3 py-1 rounded text-[12px] font-medium transition-colors disabled:opacity-50 ${
              groupBy === d.id
                ? 'bg-brand text-white'
                : 'bg-surface-sunken text-text-secondary hover:bg-surface-raised'
            }`}>
            {d.label}
          </button>
        ))}

        <div className="relative ml-auto">
          <button onClick={() => setShowColPicker(p => !p)}
            className="px-3 py-1 rounded text-[12px] text-text-secondary bg-surface-sunken hover:bg-surface-raised">
            Columns
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-8 bg-surface border border-border rounded shadow-[--shadow-card] p-3 z-10 min-w-[130px]">
              {COLUMNS.map(c => (
                <label key={c.id} className="flex items-center gap-2 py-1 cursor-pointer text-sm">
                  <input type="checkbox" checked={cols.includes(c.id)} onChange={() => toggleCol(c.id)}
                    className="accent-brand" />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <p className="text-text-tertiary text-sm py-8">
          {data.error ? `Error: ${data.error}` : 'No data — run sync first.'}
        </p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
              <th className="pb-2 pr-4 font-medium">
                {DIMENSIONS.find(d => d.id === groupBy)?.label}
              </th>
              {visibleCols.map(c => (
                <th key={c.id} className="pb-2 pr-4 font-medium text-right">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.key ?? i} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                <td className="py-2.5 pr-4 font-medium">
                  {row.mpId
                    ? <Link href={`/products/${row.mpId}`} className="text-brand no-underline hover:underline">{row.label}</Link>
                    : row.label || '—'}
                </td>
                {visibleCols.map(c => (
                  <td key={c.id} className={`py-2.5 pr-4 text-right font-mono text-[12px] ${
                    c.id === 'days' && row[c.id] > 0 && row[c.id] < 30 ? 'text-danger' :
                    c.id === 'days' && row[c.id] > 0 && row[c.id] < 60 ? 'text-warning' : ''
                  }`}>
                    {fmt(c.id, row[c.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-[12px] font-semibold">
              <td className="pt-2.5 pr-4 text-text-secondary">Total</td>
              {visibleCols.map(c => (
                <td key={c.id} className="pt-2.5 pr-4 text-right font-mono">
                  {fmt(c.id, totals[c.id])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function fmt(col, val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n)) return val;
  if (col === 'revenue') return '$' + Math.round(n).toLocaleString();
  if (col === 'x_rate')  return n.toFixed(1) + '%';
  if (col === 'velocity') return n > 0 ? n.toFixed(1) : '—';
  if (col === 'days')    return n > 0 ? `${n}d` : '—';
  return n > 0 ? n.toLocaleString() : '—';
}
