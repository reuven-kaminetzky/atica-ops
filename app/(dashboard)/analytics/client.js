'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

const DIMENSIONS = [
  { id: 'category', label: 'Category' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'product',  label: 'Product' },
  // Future: Fit, Size, Length need variant data (Bonney task 8 + Almond schema)
];

const COLUMNS = [
  { id: 'stock',    label: 'Stock' },
  { id: 'velocity', label: 'Vel/wk' },
  { id: 'days',     label: 'Days' },
  { id: 'oos',      label: 'OOS' },
  { id: 'cost',     label: 'Cost value' },
  { id: 'retail',   label: 'Retail value' },
];

function groupProducts(products, dimension) {
  const groups = {};
  for (const mp of products) {
    let key;
    if (dimension === 'category') key = mp.category || 'Other';
    else if (dimension === 'vendor') key = mp.vendor_id || 'No vendor';
    else if (dimension === 'product') key = mp.name;
    else key = 'All';

    if (!groups[key]) groups[key] = {
      label: key,
      count: 0,
      stock: 0,
      oos: 0,
      velocity: 0,
      cost: 0,
      retail: 0,
      days: 0,
      daysCount: 0,
      mpId: null,
    };

    const g = groups[key];
    const stock = parseInt(mp.total_inventory) || 0;
    const vel = parseFloat(mp.velocity_per_week) || 0;
    const d = parseInt(mp.days_of_stock) || 0;

    g.count++;
    g.stock += stock;
    g.oos += (stock === 0 && mp.external_ids?.length > 0) ? 1 : 0;
    g.velocity += vel;
    g.cost += stock * (parseFloat(mp.fob) || 0);
    g.retail += stock * (parseFloat(mp.retail) || 0);
    if (d > 0 && d < 999) { g.days += d; g.daysCount++; }
    if (dimension === 'product') g.mpId = mp.id;
  }

  return Object.values(groups)
    .map(g => ({ ...g, days: g.daysCount > 0 ? Math.round(g.days / g.daysCount) : 0 }))
    .sort((a, b) => b.stock - a.stock);
}

export default function AnalyticsClient({ products }) {
  const [groupBy, setGroupBy] = useState('category');
  const [cols, setCols] = useState(['stock', 'velocity', 'days', 'oos']);
  const [showColPicker, setShowColPicker] = useState(false);

  const rows = useMemo(() => groupProducts(products, groupBy), [products, groupBy]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    stock: acc.stock + r.stock,
    velocity: acc.velocity + r.velocity,
    oos: acc.oos + r.oos,
    cost: acc.cost + r.cost,
    retail: acc.retail + r.retail,
  }), { stock: 0, velocity: 0, oos: 0, cost: 0, retail: 0 }), [rows]);

  const visibleCols = COLUMNS.filter(c => cols.includes(c.id));

  function toggleCol(id) {
    setCols(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  }

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <span className="text-sm text-text-tertiary">{products.length} products</span>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        {/* Group By pills */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-text-tertiary uppercase tracking-wider mr-1">Group by</span>
          {DIMENSIONS.map(d => (
            <button key={d.id} onClick={() => setGroupBy(d.id)}
              className={`px-3 py-1 rounded text-[12px] font-medium transition-colors ${
                groupBy === d.id
                  ? 'bg-brand text-white'
                  : 'bg-surface-sunken text-text-secondary hover:bg-surface-raised'
              }`}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Column picker */}
        <div className="relative ml-auto">
          <button onClick={() => setShowColPicker(p => !p)}
            className="px-3 py-1 rounded text-[12px] text-text-secondary bg-surface-sunken hover:bg-surface-raised">
            Columns
          </button>
          {showColPicker && (
            <div className="absolute right-0 top-8 bg-surface border border-border rounded shadow-[--shadow-card] p-3 z-10 min-w-[140px]">
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
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
            <th className="pb-2 pr-4 font-medium">
              {DIMENSIONS.find(d => d.id === groupBy)?.label}
            </th>
            <th className="pb-2 pr-4 font-medium text-right">MPs</th>
            {visibleCols.map(c => (
              <th key={c.id} className="pb-2 pr-4 font-medium text-right">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.label} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
              <td className="py-2.5 pr-4 font-medium">
                {row.mpId
                  ? <Link href={`/products/${row.mpId}`} className="text-brand no-underline hover:underline">{row.label}</Link>
                  : row.label}
              </td>
              <td className="py-2.5 pr-4 text-right text-text-secondary">{row.count}</td>
              {visibleCols.map(c => (
                <td key={c.id} className={`py-2.5 pr-4 text-right font-mono text-[12px] ${
                  c.id === 'oos' && row.oos > 0 ? 'text-danger font-semibold' :
                  c.id === 'days' && row.days > 0 && row.days < 30 ? 'text-danger' :
                  c.id === 'days' && row.days > 0 && row.days < 60 ? 'text-warning' : ''
                }`}>
                  {c.id === 'stock'    ? row.stock.toLocaleString() :
                   c.id === 'velocity' ? (row.velocity > 0 ? row.velocity.toFixed(1) : '—') :
                   c.id === 'days'     ? (row.days > 0 ? `${row.days}d` : '—') :
                   c.id === 'oos'      ? (row.oos || '—') :
                   c.id === 'cost'     ? `$${Math.round(row.cost).toLocaleString()}` :
                   c.id === 'retail'   ? `$${Math.round(row.retail).toLocaleString()}` : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {/* Totals row */}
        <tfoot>
          <tr className="border-t-2 border-border text-[12px] font-semibold">
            <td className="pt-2.5 pr-4 text-text-secondary">Total</td>
            <td className="pt-2.5 pr-4 text-right text-text-secondary">{products.length}</td>
            {visibleCols.map(c => (
              <td key={c.id} className="pt-2.5 pr-4 text-right font-mono">
                {c.id === 'stock'    ? totals.stock.toLocaleString() :
                 c.id === 'velocity' ? totals.velocity.toFixed(1) :
                 c.id === 'oos'      ? (totals.oos || '—') :
                 c.id === 'cost'     ? `$${Math.round(totals.cost).toLocaleString()}` :
                 c.id === 'retail'   ? `$${Math.round(totals.retail).toLocaleString()}` : '—'}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>

      {products.length === 0 && (
        <p className="text-text-tertiary text-sm mt-8">No data. Run sync first.</p>
      )}

      {/* TODO: ThenByChain + tree expansion — needs Almond's getBreakdown() DAL */}
      {/* TODO: Fit/Size/Length dimensions — needs Bonney's variant sync (task 8) */}
    </div>
  );
}
