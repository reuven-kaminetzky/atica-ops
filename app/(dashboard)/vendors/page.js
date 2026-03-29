import { getVendors } from '../actions';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const vendors = await getVendors();
  const totalCommitted = vendors.reduce((s, v) => s + parseFloat(v.total_committed || 0), 0);
  const totalPOs = vendors.reduce((s, v) => s + (parseInt(v.po_count) || 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Vendors</h1>
        <p className="text-sm text-text-secondary mt-0.5">
          {vendors.length} vendors · {totalPOs} POs · ${Math.round(totalCommitted).toLocaleString()} committed
        </p>
      </div>

      {vendors.length === 0 ? (
        <div className="text-center py-16 bg-surface rounded-[--radius-md] border border-border text-text-secondary">
          No vendors. Seed the database first.
        </div>
      ) : (
        <div className="space-y-3">
          {vendors.map(v => {
            const committed = parseFloat(v.total_committed || 0);
            const pct = totalCommitted > 0 ? Math.round(committed / totalCommitted * 100) : 0;
            const lastPO = v.last_po_date ? new Date(v.last_po_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : null;

            return (
              <div key={v.id} className="bg-surface rounded-[--radius-md] border border-border p-5 shadow-[--shadow-subtle]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-semibold text-base">{v.name}</div>
                    <div className="text-xs text-text-secondary mt-0.5">
                      {v.country || '—'}
                      {v.preferred_terms && v.preferred_terms !== 'standard' && ` · ${v.preferred_terms} terms`}
                      {lastPO && ` · Last PO: ${lastPO}`}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {(parseInt(v.active_pos) || 0) > 0 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-info-light text-info">
                        {v.active_pos} active
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
                  <MiniStat label="Committed" value={`$${Math.round(committed).toLocaleString()}`} />
                  <MiniStat label="Share" value={`${pct}%`} />
                  <MiniStat label="Products" value={v.product_count || 0} />
                  <MiniStat label="Total POs" value={v.po_count || 0} />
                  <MiniStat label="Avg Lead" value={v.avg_lead_days > 0 ? `${v.avg_lead_days}d` : '—'} />
                </div>

                {/* Products this vendor supplies */}
                {v.product_names?.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap">
                    {v.product_names.filter(Boolean).map(name => (
                      <span key={name} className="text-[11px] px-2 py-0.5 rounded bg-surface-sunken text-text-secondary">{name}</span>
                    ))}
                  </div>
                )}

                {/* Concentration warning */}
                {pct >= 40 && (
                  <div className="mt-3 text-xs text-warning bg-warning/5 border border-warning/10 rounded p-2">
                    ⚠ {pct}% of total committed spend — high concentration risk
                  </div>
                )}
              </div>
            );
          })}
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
