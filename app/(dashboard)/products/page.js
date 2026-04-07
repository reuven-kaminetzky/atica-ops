import { getProductList } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  let products = [];
  try {
    products = await getProductList();
  } catch { products = []; }

  if (!Array.isArray(products)) products = [];

  // Group by category
  const categories = {};
  for (const p of products) {
    const cat = p.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(p);
  }

  const catOrder = ['Suits', 'Shirts', 'Blazers', 'Pants', 'Outerwear', 'Kapote', 'Accessories', 'Shoes', 'Boys', 'Other'];
  const sorted = catOrder.filter(c => categories[c]).concat(
    Object.keys(categories).filter(c => !catOrder.includes(c))
  );

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <span className="text-sm text-text-tertiary">{products.length} master products</span>
      </div>

      {products.length === 0 ? (
        <div className="border border-border rounded-[--radius-sm] px-4 py-8 text-center">
          <p className="text-text-tertiary text-sm">No products yet.</p>
          <p className="text-text-tertiary text-xs mt-1">
            Go to <Link href="/diagnose" className="text-brand no-underline hover:underline">Diagnostics</Link> and tap &quot;Fix Everything&quot;.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sorted.map(cat => (
            <div key={cat}>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
                {cat} <span className="font-normal">({categories[cat].length})</span>
              </h2>
              <div className="border border-border rounded-[--radius-sm] overflow-hidden">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-surface-sunken text-[11px] text-text-tertiary uppercase tracking-wider">
                      <th className="py-2 px-3 text-left font-medium">Product</th>
                      <th className="py-2 px-3 text-right font-medium">Stock</th>
                      <th className="py-2 px-3 text-right font-medium">Vel</th>
                      <th className="py-2 px-3 text-right font-medium">Cover</th>
                      <th className="py-2 px-3 text-right font-medium">$</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories[cat].map(p => {
                      const stock = parseInt(p.total_inventory) || 0;
                      const vel = parseFloat(p.velocity_per_week) || 0;
                      const days = parseInt(p.days_of_stock) || 0;
                      const retail = parseFloat(p.retail) || 0;

                      return (
                        <tr key={p.id} className="border-t border-border/40 hover:bg-surface-sunken/50 transition-colors">
                          <td className="py-2.5 px-3">
                            <Link href={`/products/${p.id}`} className="no-underline hover:underline">
                              <div className="flex items-center gap-2.5">
                                {p.hero_image ? (
                                  <img src={p.hero_image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 rounded bg-surface-sunken flex-shrink-0" />
                                )}
                                <div>
                                  <div className="font-medium text-text">{p.name}</div>
                                  <div className="text-[11px] text-text-tertiary">{p.code}</div>
                                </div>
                              </div>
                            </Link>
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono text-[12px] ${stock === 0 ? 'text-danger' : stock < 20 ? 'text-warning' : ''}`}>
                            {stock > 0 ? stock.toLocaleString() : '\u2014'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[12px]">
                            {vel > 0 ? vel.toFixed(1) : '\u2014'}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono text-[12px] ${days > 0 && days < 30 ? 'text-danger' : days > 0 && days < 60 ? 'text-warning' : ''}`}>
                            {days > 0 && days < 999 ? `${days}d` : '\u2014'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-[12px]">
                            {retail > 0 ? `$${retail}` : '\u2014'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
