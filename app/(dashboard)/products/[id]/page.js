import { getProduct } from '../../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }) {
  const { id } = await params;
  const mp = await getProduct(id);

  if (!mp) {
    return (
      <div className="py-16">
        <p className="text-text-secondary">Product not found.</p>
        <Link href="/products" className="text-brand text-sm">← Products</Link>
      </div>
    );
  }

  const stock = parseInt(mp.total_inventory) || 0;
  const vel = parseFloat(mp.velocity_per_week) || 0;
  const days = parseInt(mp.days_of_stock) || 0;
  const styles = mp.styles || [];
  const pos = mp.purchaseOrders || [];

  return (
    <div className="max-w-3xl">
      {/* Breadcrumb */}
      <div className="text-sm text-text-tertiary mb-4">
        <Link href="/products" className="text-brand no-underline hover:underline">Products</Link>
        <span className="mx-2">›</span>
        <span>{mp.name}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-1">{mp.name}</h1>
        <p className="text-sm text-text-tertiary">
          {mp.code}
          {mp.category && <> · {mp.category}</>}
          {mp.vendor_id && <> · {mp.vendor_id}</>}
          {mp.phase && <> · {mp.phase.replace(/_/g, ' ')}</>}
        </p>
      </div>

      {/* Summary row — just the numbers you need to know it's healthy */}
      <div className="flex gap-6 text-sm border-b border-border pb-5 mb-6">
        <div>
          <span className="text-text-tertiary">Stock </span>
          <span className={`font-semibold ${stock === 0 ? 'text-danger' : stock < 20 ? 'text-warning' : ''}`}>
            {stock}
          </span>
        </div>
        <div>
          <span className="text-text-tertiary">Velocity </span>
          <span className="font-semibold">{vel > 0 ? `${vel.toFixed(1)}/wk` : '—'}</span>
        </div>
        <div>
          <span className="text-text-tertiary">Cover </span>
          <span className={`font-semibold ${days > 0 && days < 30 ? 'text-danger' : days < 60 ? 'text-warning' : ''}`}>
            {days > 0 && days < 999 ? `${days}d` : '—'}
          </span>
        </div>
        <div>
          <span className="text-text-tertiary">FOB </span>
          <span className="font-semibold">{mp.fob > 0 ? `$${mp.fob}` : '—'}</span>
        </div>
        <div>
          <span className="text-text-tertiary">Retail </span>
          <span className="font-semibold">{mp.retail > 0 ? `$${mp.retail}` : '—'}</span>
        </div>
        {styles.length > 0 && (
          <div>
            <span className="text-text-tertiary">Styles </span>
            <span className="font-semibold">{styles.length}</span>
          </div>
        )}
        {pos.length > 0 && (
          <div>
            <span className="text-text-tertiary">POs </span>
            <span className="font-semibold">{pos.length}</span>
          </div>
        )}
        <Link href={`/products/${mp.id}/inventory`} className="text-brand text-sm no-underline hover:underline ml-auto">
          Stock matrix →
        </Link>
      </div>

      {/* Collapsible sections */}
      <div className="space-y-1">

        {/* Styles */}
        <Collapsible title={`Styles (${styles.length})`} empty={styles.length === 0}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Colorway</th>
                <th className="pb-2 pr-4 font-medium text-right">Stock</th>
                <th className="pb-2 pr-4 font-medium text-right">SKUs</th>
                <th className="pb-2 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {styles.map(s => (
                <tr key={s.id} className="border-b border-border/40">
                  <td className="py-2 pr-4 font-medium">{s.colorway || s.title || s.id}</td>
                  <td className={`py-2 pr-4 text-right font-mono text-[12px] ${
                    (parseInt(s.inventory) || 0) === 0 ? 'text-danger' :
                    (parseInt(s.inventory) || 0) < 10 ? 'text-warning' : ''
                  }`}>{s.inventory || 0}</td>
                  <td className="py-2 pr-4 text-right text-text-secondary font-mono text-[12px]">{s.variant_count || '—'}</td>
                  <td className="py-2 text-text-secondary">{s.grade || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Collapsible>

        {/* Purchase Orders */}
        <Collapsible title={`Purchase Orders (${pos.length})`} empty={pos.length === 0}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">PO</th>
                <th className="pb-2 pr-4 font-medium">Stage</th>
                <th className="pb-2 pr-4 font-medium text-right">Units</th>
                <th className="pb-2 pr-4 font-medium text-right">FOB Total</th>
                <th className="pb-2 font-medium">ETD</th>
              </tr>
            </thead>
            <tbody>
              {pos.map(po => (
                <tr key={po.id} className="border-b border-border/40">
                  <td className="py-2 pr-4">
                    <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`}
                      className="text-brand no-underline hover:underline font-mono text-[12px]">
                      {po.id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">{(po.stage || '').replace(/_/g, ' ')}</td>
                  <td className="py-2 pr-4 text-right font-mono text-[12px]">{po.units}</td>
                  <td className="py-2 pr-4 text-right font-mono text-[12px]">${parseFloat(po.fob_total || 0).toLocaleString()}</td>
                  <td className="py-2 text-text-secondary">
                    {po.etd ? new Date(po.etd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3">
            <Link href={`/purchase-orders/new?mp=${mp.id}`}
              className="text-sm text-brand no-underline hover:underline">
              + New PO
            </Link>
          </div>
        </Collapsible>

        {/* Fits */}
        {mp.fits?.length > 0 && (
          <Collapsible title="Fits & Sizes">
            <div className="flex gap-2 flex-wrap text-sm">
              {mp.fits.map(f => (
                <span key={f} className="px-2.5 py-1 bg-surface-sunken rounded text-text-secondary">{f}</span>
              ))}
            </div>
            {mp.sizes && (
              <p className="text-sm text-text-secondary mt-2">Size group: {mp.sizes}</p>
            )}
          </Collapsible>
        )}

        {/* Stack */}
        {mp.stack && Object.keys(mp.stack).length > 0 && (
          <Collapsible title="Product Stack">
            <div className="space-y-1 text-sm">
              {Object.entries(mp.stack).map(([k, v]) => v ? (
                <div key={k} className="flex gap-3">
                  <span className="text-text-tertiary w-28 flex-shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                  <span>{String(v)}</span>
                </div>
              ) : null)}
            </div>
          </Collapsible>
        )}

      </div>
    </div>
  );
}

// Server-rendered collapsible — open by default, use CSS details/summary
function Collapsible({ title, children, empty }) {
  if (empty) {
    return (
      <details className="group border border-border rounded-[--radius-sm] overflow-hidden">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-surface-sunken list-none">
          <span className="text-sm font-medium">{title}</span>
          <span className="text-text-tertiary text-xs">empty</span>
        </summary>
      </details>
    );
  }
  return (
    <details className="group border border-border rounded-[--radius-sm] overflow-hidden" open>
      <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-surface-sunken list-none">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-text-tertiary text-xs group-open:hidden">show</span>
        <span className="text-text-tertiary text-xs hidden group-open:inline">hide</span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-border/50">
        {children}
      </div>
    </details>
  );
}
