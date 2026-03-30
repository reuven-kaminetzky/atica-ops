import { getProduct, getStockByMP, getFitSizeMatrix } from '../../../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const LOCATIONS = ['LKW', 'FLT', 'CRH', 'MNS', 'WH', 'ONL'];
const LOC_LABELS = { LKW: 'Lakewood', FLT: 'Flatbush', CRH: 'Crown Heights', MNS: 'Monsey', WH: 'Warehouse', ONL: 'Online' };

export default async function ProductInventoryPage({ params }) {
  const { id } = await params;
  const [mp, stockRows, skuMatrix] = await Promise.all([
    getProduct(id),
    getStockByMP(id),
    getFitSizeMatrix(id),
  ]);

  if (!mp) return (
    <div className="py-12">
      <p className="text-text-secondary text-sm">Product not found.</p>
      <Link href="/products" className="text-brand text-sm">← Products</Link>
    </div>
  );

  // Build lookup: colorway → fit → size → location → on_hand
  const stockMap = {};
  for (const row of stockRows) {
    const key = `${row.colorway}|${row.fit || ''}|${row.size}`;
    if (!stockMap[key]) stockMap[key] = {};
    stockMap[key][row.location_code] = parseInt(row.on_hand) || 0;
  }

  // Group skus by colorway → fit → sizes
  const colorways = {};
  for (const sku of skuMatrix) {
    const cw = sku.colorway || sku.style_title || 'Default';
    if (!colorways[cw]) colorways[cw] = {};
    const fit = sku.fit || '—';
    if (!colorways[cw][fit]) colorways[cw][fit] = new Set();
    colorways[cw][fit].add(sku.size);
  }

  // Collect all sizes across all fits for column headers
  const allSizes = [...new Set(skuMatrix.map(s => s.size))].sort((a, b) => {
    const na = parseFloat(a), nb = parseFloat(b);
    return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
  });

  const hasData = stockRows.length > 0;

  return (
    <div className="max-w-5xl">
      {/* Breadcrumb */}
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/products" className="text-brand no-underline hover:underline">Products</Link>
        <span className="mx-2">›</span>
        <Link href={`/products/${id}`} className="text-brand no-underline hover:underline">{mp.name}</Link>
        <span className="mx-2">›</span>
        <span>Inventory</span>
      </div>

      <h1 className="text-2xl font-bold tracking-tight mb-1">{mp.name} — Inventory</h1>
      <p className="text-sm text-text-tertiary mb-6">
        {mp.category} · stock per location, fit and size
      </p>

      {!hasData ? (
        <div className="border border-border rounded-[--radius-sm] px-4 py-8 text-center">
          <p className="text-text-tertiary text-sm">No inventory events yet.</p>
          <p className="text-text-tertiary text-xs mt-1">Run sync to seed inventory from Shopify.</p>
        </div>
      ) : (
        <>
          {/* Per-location totals summary */}
          <div className="mb-6">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">By Location</h2>
            <div className="flex gap-4 flex-wrap text-sm">
              {LOCATIONS.map(loc => {
                const total = stockRows
                  .filter(r => r.location_code === loc)
                  .reduce((s, r) => s + (parseInt(r.on_hand) || 0), 0);
                if (total === 0) return null;
                return (
                  <div key={loc}>
                    <span className="text-text-tertiary">{LOC_LABELS[loc]} </span>
                    <span className={`font-semibold ${total < 5 ? 'text-warning' : ''}`}>{total}</span>
                  </div>
                );
              }).filter(Boolean)}
              <div>
                <span className="text-text-tertiary">Total </span>
                <span className="font-bold">
                  {stockRows.reduce((s, r) => s + (parseInt(r.on_hand) || 0), 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Matrix: for each colorway → each fit → sizes × locations */}
          {Object.entries(colorways).map(([colorway, fits]) => {
            // Which locations have any stock for this colorway?
            const activeLocs = LOCATIONS.filter(loc =>
              Object.keys(fits).some(fit =>
                [...fits[fit]].some(size => {
                  const key = `${colorway}|${fit === '—' ? '' : fit}|${size}`;
                  return (stockMap[key]?.[loc] || 0) > 0;
                })
              )
            );
            if (activeLocs.length === 0 && skuMatrix.length > 0) {
              // Show structure even with no stock
            }

            const locsToShow = activeLocs.length > 0 ? activeLocs : LOCATIONS.slice(0, 4);

            return (
              <div key={colorway} className="mb-8">
                <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
                  {colorway}
                </h2>
                <div className="overflow-x-auto">
                  <table className="text-sm border-collapse min-w-max">
                    <thead>
                      <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                        <th className="pb-2 pr-6 text-left font-medium w-24">Fit</th>
                        <th className="pb-2 pr-4 text-left font-medium w-16">Size</th>
                        {locsToShow.map(loc => (
                          <th key={loc} className="pb-2 px-3 text-right font-medium w-20">
                            {LOC_LABELS[loc]}
                          </th>
                        ))}
                        <th className="pb-2 pl-3 text-right font-medium w-16">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(fits).map(([fit, sizeSet]) =>
                        [...sizeSet].sort((a, b) => {
                          const na = parseFloat(a), nb = parseFloat(b);
                          return isNaN(na) || isNaN(nb) ? a.localeCompare(b) : na - nb;
                        }).map((size, si) => {
                          const key = `${colorway}|${fit === '—' ? '' : fit}|${size}`;
                          const locStocks = locsToShow.map(loc => stockMap[key]?.[loc] || 0);
                          const total = locStocks.reduce((s, v) => s + v, 0);
                          return (
                            <tr key={`${fit}-${size}`} className="border-b border-border/40">
                              <td className="py-2 pr-6 text-text-secondary">
                                {si === 0 ? fit : ''}
                              </td>
                              <td className="py-2 pr-4 font-mono text-[12px]">{size}</td>
                              {locStocks.map((qty, li) => (
                                <td key={li} className={`py-2 px-3 text-right font-mono text-[12px] ${
                                  qty === 0 ? 'text-text-tertiary' :
                                  qty <= 2  ? 'text-danger' :
                                  qty <= 5  ? 'text-warning' : ''
                                }`}>
                                  {qty || '—'}
                                </td>
                              ))}
                              <td className={`py-2 pl-3 text-right font-mono text-[12px] font-semibold ${
                                total === 0 ? 'text-text-tertiary' : ''
                              }`}>
                                {total || '—'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
