import { getVendors } from '../actions';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const vendors = await getVendors();
  const totalCommitted = vendors.reduce((s, v) => s + parseFloat(v.total_committed || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {vendors.length} vendors · ${totalCommitted.toLocaleString()} committed
        </p>
      </div>

      {vendors.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[--radius-md] border border-border text-text-secondary">
          No vendors in database
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {vendors.map(v => (
            <div key={v.id} className="bg-surface rounded-[--radius-md] border border-border p-5 shadow-[--shadow-subtle]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-base">{v.name}</div>
                  <div className="text-xs text-text-secondary mt-0.5">{v.country || 'Unknown'} · {v.tier || 'standard'}</div>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  parseInt(v.active_pos || 0) > 0 ? 'bg-info-light text-info' : 'bg-surface-sunken text-text-tertiary'
                }`}>
                  {v.active_pos} active PO{parseInt(v.active_pos || 0) !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4">
                <MiniStat label="Products" value={v.product_count} />
                <MiniStat label="Total POs" value={v.po_count} />
                <MiniStat label="Committed" value={`$${parseFloat(v.total_committed || 0).toLocaleString()}`} />
              </div>

              {v.categories?.length > 0 && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {v.categories.map(c => (
                    <span key={c} className="text-[11px] px-2 py-0.5 rounded bg-surface-sunken text-text-secondary">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">{label}</div>
      <div className="font-semibold text-sm mt-0.5">{value}</div>
    </div>
  );
}
