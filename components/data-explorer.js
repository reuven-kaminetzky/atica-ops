'use client';

import { useState, useTransition } from 'react';
import { getDataBreakdown } from '../app/(dashboard)/actions';
import Link from 'next/link';

const ALL_DIMENSIONS = [
  { id: 'category', label: 'Category' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'mp',       label: 'Product' },
  { id: 'style',    label: 'Style' },
  { id: 'location', label: 'Location' },
  { id: 'grade',    label: 'Grade' },
];

const ALL_COLUMNS = [
  { id: 'stock',    label: 'Stock' },
  { id: 'incoming', label: 'Inc' },
  { id: 'sales',    label: 'Sales' },
  { id: 'velocity', label: 'Vel/wk' },
  { id: 'days',     label: 'Days' },
  { id: 'x_rate',   label: 'Sell-thru' },
  { id: 'revenue',  label: 'Revenue' },
];

const DEFAULT_COLS = ['stock', 'incoming', 'sales', 'velocity', 'days'];

export default function DataExplorer({
  initial,
  title,
  defaultGroupBy = 'category',
  defaultThenBy = [],
  defaultSort,
  showAllDimensions = false,
}) {
  const [data,    setData]    = useState(initial || { rows: [], totals: {} });
  const [groupBy, setGroupBy] = useState(defaultGroupBy);
  const [thenBy,  setThenBy]  = useState(defaultThenBy);
  const [cols,    setCols]    = useState(
    initial?.columns || DEFAULT_COLS
  );
  const [showCols,  setShowCols]  = useState(false);
  const [expanded,  setExpanded]  = useState({});
  const [isPending, startTransition] = useTransition();

  // Which dimensions to expose in the GroupBy bar
  const dimensions = showAllDimensions
    ? ALL_DIMENSIONS
    : ALL_DIMENSIONS.filter(d => ['category', 'vendor', 'mp', 'style', 'location', 'grade'].includes(d.id));

  function fetch(newGroupBy, newCols, newThenBy) {
    startTransition(async () => {
      const result = await getDataBreakdown({
        groupBy: newGroupBy,
        thenBy: newThenBy || [],
        columns: newCols,
      });
      if (!result?.error) {
        setData(result);
        setExpanded({});
      }
    });
  }

  function changeGroupBy(dim) {
    setGroupBy(dim);
    setThenBy([]);
    fetch(dim, cols, []);
  }

  function toggleCol(id) {
    const next = cols.includes(id) ? cols.filter(c => c !== id) : [...cols, id];
    setCols(next);
    fetch(groupBy, next, thenBy);
  }

  const rows       = data.rows || [];
  const totals     = data.totals || {};
  const visibleCols = ALL_COLUMNS.filter(c => cols.includes(c.id));
  const dimLabel   = ALL_DIMENSIONS.find(d => d.id === groupBy)?.label || groupBy;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {isPending && <span className="text-xs text-text-tertiary">Loading…</span>}
      </div>

      {/* Group By + Column Picker */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[11px] text-text-tertiary uppercase tracking-wider">Group by</span>
        {dimensions.map(d => (
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
          <button onClick={() => setShowCols(p => !p)}
            className="px-3 py-1 rounded text-[12px] text-text-secondary bg-surface-sunken hover:bg-surface-raised">
            Columns
          </button>
          {showCols && (
            <div className="absolute right-0 top-8 bg-surface border border-border rounded shadow-[--shadow-card] p-3 z-10 min-w-[130px]">
              {ALL_COLUMNS.map(c => (
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
            <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
              <th className="pb-2 pr-4 text-left font-medium">{dimLabel}</th>
              {visibleCols.map(c => (
                <th key={c.id} className="pb-2 pr-4 text-right font-medium">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <Row
                key={row.key ?? i}
                row={row}
                cols={visibleCols}
                expanded={expanded}
                setExpanded={setExpanded}
                depth={0}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-[12px] font-semibold">
              <td className="pt-2.5 pr-4 text-text-tertiary">Total</td>
              {visibleCols.map(c => (
                <td key={c.id} className="pt-2.5 pr-4 text-right font-mono">
                  {fmtVal(c.id, totals[c.id])}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function Row({ row, cols, expanded, setExpanded, depth }) {
  const key      = row.key ?? row.label;
  const isOpen   = expanded[key];
  const hasKids  = row.children?.length > 0;
  const indent   = depth * 20;

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
        <td className="py-2.5 pr-4">
          <span style={{ paddingLeft: indent }} className="flex items-center gap-1.5">
            {hasKids && (
              <button
                onClick={() => setExpanded(p => ({ ...p, [key]: !p[key] }))}
                className="text-text-tertiary text-[10px] w-4 text-center flex-shrink-0 cursor-pointer bg-transparent border-none"
              >
                {isOpen ? '▼' : '▶'}
              </button>
            )}
            {!hasKids && <span className="w-4 flex-shrink-0" />}
            {row.mpId
              ? <Link href={`/products/${row.mpId}`} className="font-medium text-brand no-underline hover:underline">{row.label || '—'}</Link>
              : <span className={depth === 0 ? 'font-medium' : 'text-text-secondary'}>{row.label || '—'}</span>
            }
          </span>
        </td>
        {cols.map(c => (
          <td key={c.id} className={`py-2.5 pr-4 text-right font-mono text-[12px] ${
            c.id === 'days' && row[c.id] > 0 && row[c.id] < 30 ? 'text-danger' :
            c.id === 'days' && row[c.id] > 0 && row[c.id] < 60 ? 'text-warning' : ''
          }`}>
            {fmtVal(c.id, row[c.id])}
          </td>
        ))}
      </tr>
      {isOpen && hasKids && row.children.map((child, j) => (
        <Row
          key={child.key ?? j}
          row={child}
          cols={cols}
          expanded={expanded}
          setExpanded={setExpanded}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

function fmtVal(col, val) {
  if (val == null || val === '') return '—';
  const n = Number(val);
  if (isNaN(n) || n === 0) return '—';
  if (col === 'revenue')  return '$' + Math.round(n).toLocaleString();
  if (col === 'x_rate')   return n.toFixed(1) + '%';
  if (col === 'velocity') return n.toFixed(1);
  if (col === 'days')     return `${n}d`;
  return n.toLocaleString();
}
