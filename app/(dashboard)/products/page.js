import { getProducts } from '../actions';
const { LANDED_COST_FACTOR, DEFAULT_DUTY_PCT, FREIGHT_MULTIPLIER } = require("../../../lib/constants");
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const products = await getProducts();

  const categories = {};
  for (const p of products) {
    const cat = p.category || 'Other';
    (categories[cat] ||= []).push(p);
  }

  const catOrder = ['Shirts', 'Suits', 'Blazers', 'Pants', 'Outerwear', 'Kapote', 'Shoes', 'Accessories', 'Boys'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">Master Products</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            {products.length} products across {Object.keys(categories).length} categories
          </p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[--radius-md] border border-border">
          <p className="text-text-secondary text-lg mb-1">No products in database</p>
          <p className="text-sm text-text-tertiary">Go to Settings → Seed Data</p>
        </div>
      ) : (
        catOrder.filter(cat => categories[cat]).map(cat => (
          <div key={cat} className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary mb-3 pb-2 border-b border-border">
              {cat} <span className="text-text-tertiary font-normal">({categories[cat].length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories[cat].map(mp => <ProductCard key={mp.id} mp={mp} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ProductCard({ mp }) {
  const margin = mp.fob > 0 && mp.retail > 0
    ? ((1 - mp.fob * LANDED_COST_FACTOR / mp.retail) * 100).toFixed(0) : null;
  const stock = parseInt(mp.total_inventory) || 0;
  const stockColor = stock === 0 ? 'text-danger' : stock < 20 ? 'text-warning' : 'text-success';

  return (
    <Link href={`/products/${mp.id}`}
      className="group bg-surface rounded-[--radius-md] border border-border p-4 no-underline text-text shadow-[--shadow-subtle] hover:shadow-[--shadow-card] hover:border-border-strong transition-all"
    >
      {mp.hero_image && (
        <div className="mb-3 -mx-4 -mt-4 rounded-t-[--radius-md] overflow-hidden bg-surface-sunken h-36">
          <img src={mp.hero_image} alt={mp.name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <div className="font-semibold text-[15px] group-hover:text-brand transition-colors">{mp.name}</div>
          <div className="text-xs text-text-secondary mt-0.5">{mp.code} · {mp.vendor_id || '—'}</div>
        </div>
        {margin && (
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
            parseInt(margin) || 0 >= 55 ? 'bg-success-light text-success' : 'bg-warning-light text-warning'
          }`}>
            {margin}%
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 text-sm">
        <div>
          <span className="text-text-secondary">FOB </span>
          <span className="font-semibold">${mp.fob}</span>
          <span className="text-text-tertiary mx-1.5">·</span>
          <span className="text-text-secondary">Retail </span>
          <span className="font-semibold">${mp.retail}</span>
        </div>
        <span className={`font-semibold text-xs ${stockColor}`}>
          {stock} units
        </span>
      </div>

      <div className="flex gap-1.5 mt-3 flex-wrap">
        <span className="text-[11px] px-2 py-0.5 rounded bg-surface-sunken text-text-secondary">
          {(mp.phase || 'in_store').replace(/_/g, ' ')}
        </span>
        {(parseInt(mp.style_count) || 0) > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-brand-100 text-brand font-semibold">
            {mp.style_count} style{parseInt(mp.style_count) > 1 ? 's' : ''}
          </span>
        )}
        {(parseInt(mp.active_pos) || 0) > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-info-light text-info font-semibold">
            {mp.active_pos} PO{parseInt(mp.active_pos) > 1 ? 's' : ''}
          </span>
        )}
        {mp.completeness > 0 && (
          <span className="text-[11px] px-2 py-0.5 rounded bg-success-light text-success">
            Stack {mp.completeness}%
          </span>
        )}
      </div>
    </Link>
  );
}
