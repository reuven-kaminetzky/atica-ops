import { getProducts } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductsPage() {
  const products = await getProducts();

  const catOrder = ['Suits', 'Blazers', 'Shirts', 'Pants', 'Outerwear', 'Shoes', 'Accessories', 'Boys', 'Other'];

  const byCategory = catOrder.reduce((acc, cat) => {
    const items = products.filter(p => (p.category || 'Other') === cat);
    if (items.length) acc.push({ cat, items });
    return acc;
  }, []);

  // Catch anything not in catOrder
  const covered = new Set(catOrder);
  const extra = products.filter(p => !covered.has(p.category || 'Other'));
  if (extra.length) byCategory.push({ cat: 'Other', items: extra });

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <span className="text-sm text-text-tertiary">{products.length} MPs</span>
      </div>

      {products.length === 0 ? (
        <p className="text-text-secondary py-8">
          No products. <Link href="/settings" className="text-brand underline">Settings → Seed Data</Link>
        </p>
      ) : (
        <div className="space-y-8">
          {byCategory.map(({ cat, items }) => (
            <section key={cat}>
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
                {cat}
              </h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                    <th className="pb-2 pr-4 font-medium">Name</th>
                    <th className="pb-2 pr-4 font-medium">Code</th>
                    <th className="pb-2 pr-4 font-medium text-right">Stock</th>
                    <th className="pb-2 pr-4 font-medium text-right">Vel/wk</th>
                    <th className="pb-2 font-medium text-right">Styles</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(mp => {
                    const stock = parseInt(mp.total_inventory) || 0;
                    const vel = parseFloat(mp.velocity_per_week) || 0;
                    const styles = parseInt(mp.style_count) || 0;
                    return (
                      <tr key={mp.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                        <td className="py-2.5 pr-4">
                          <Link href={`/products/${mp.id}`} className="font-medium text-text hover:text-brand no-underline">
                            {mp.name}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4 text-text-tertiary font-mono text-[12px]">{mp.code}</td>
                        <td className={`py-2.5 pr-4 text-right font-mono ${
                          stock === 0 ? 'text-danger' : stock < 20 ? 'text-warning' : 'text-text'
                        }`}>{stock}</td>
                        <td className="py-2.5 pr-4 text-right text-text-secondary font-mono">
                          {vel > 0 ? vel.toFixed(1) : '—'}
                        </td>
                        <td className="py-2.5 text-right text-text-secondary">{styles || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
