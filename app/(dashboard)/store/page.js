'use client';

import { useState, useEffect } from 'react';

const STORES = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey'];

export default function StorePage() {
  const [store, setStore] = useState('Lakewood');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoreData(store);
  }, [store]);

  async function loadStoreData(s) {
    setLoading(true);
    try {
      const res = await fetch(`/api/store/${encodeURIComponent(s)}`);
      const d = await res.json();
      setData(d);
    } catch (e) {
      setData({ error: e.message });
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Store View</h1>
        <div className="flex gap-1.5">
          {STORES.map(s => (
            <button key={s} onClick={() => setStore(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                store === s
                  ? 'bg-brand text-white'
                  : 'bg-surface-sunken text-text-secondary hover:bg-surface-raised'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-tertiary">Loading {store}...</div>
      ) : data?.error ? (
        <div className="p-4 bg-danger-light rounded-[--radius-md] border border-danger/20 text-danger text-sm">{data.error}</div>
      ) : (
        <>
          {/* Today's Sales */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <Stat label="Today Revenue" value={`$${(data?.todayRevenue || 0).toLocaleString()}`} />
            <Stat label="Transactions" value={data?.todayOrders || 0} />
            <Stat label="AOV" value={`$${(data?.todayAOV || 0).toFixed(0)}`} />
            <Stat label="Stock Items" value={(data?.totalStock || 0).toLocaleString()} />
          </div>

          {/* Incoming Transfers */}
          <Section title={`Incoming (${data?.incoming?.length || 0})`}
            empty={!data?.incoming?.length} emptyText="Nothing incoming">
            {(data?.incoming || []).map(tr => (
              <div key={tr.id} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0 text-sm">
                <div>
                  <span className="font-semibold">{tr.id}</span>
                  <span className="text-text-secondary ml-2">{tr.total_units} units</span>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  tr.status === 'in_transit' ? 'bg-info-light text-info' :
                  tr.status === 'delivered' ? 'bg-warning-light text-warning' :
                  'bg-surface-sunken text-text-tertiary'
                }`}>{tr.status === 'delivered' ? 'Confirm receipt' : tr.status?.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </Section>

          {/* Low Stock */}
          {data?.lowStock?.length > 0 && (
            <Section title={`Low Stock (${data.lowStock.length})`}>
              <table className="w-full text-sm border-collapse">
                <thead><tr className="border-b border-border">
                  <Th>Product</Th><Th right>Stock</Th><Th right>Days Left</Th><Th>Signal</Th>
                </tr></thead>
                <tbody>
                  {data.lowStock.map(mp => (
                    <tr key={mp.id} className="border-b border-border/30">
                      <td className="py-2 px-3 font-semibold">{mp.name}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${(mp.total_inventory || 0) === 0 ? 'text-danger' : 'text-warning'}`}>{mp.total_inventory || 0}</td>
                      <td className="py-2 px-3 text-right text-text-secondary">{mp.days_of_stock < 999 ? `${mp.days_of_stock}d` : '—'}</td>
                      <td className="py-2 px-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          mp.signal === 'hot' || mp.signal === 'stockout' ? 'bg-danger-light text-danger' :
                          mp.signal === 'rising' ? 'bg-warning-light text-warning' : 'bg-surface-sunken text-text-tertiary'
                        }`}>{mp.signal || 'steady'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* Upcoming POs */}
          {data?.upcomingPOs?.length > 0 && (
            <Section title={`Coming Soon (${data.upcomingPOs.length} POs)`}>
              {data.upcomingPOs.map(po => (
                <div key={po.id} className="flex items-center justify-between py-2.5 border-b border-border/30 last:border-0 text-sm">
                  <div>
                    <span className="font-semibold">{po.mp_name || po.mp_id}</span>
                    <span className="text-text-secondary ml-2">{po.units} units</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-surface-sunken text-text-secondary">
                      {po.stage?.replace(/_/g, ' ')}
                    </span>
                    {po.eta && (
                      <span className="text-xs text-text-tertiary ml-2">
                        ETA {new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-3 shadow-[--shadow-subtle]">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">{label}</div>
      <div className="text-xl font-bold tracking-tight">{value}</div>
    </div>
  );
}

function Section({ title, children, empty, emptyText }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
      <h2 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h2>
      {empty ? <p className="text-sm text-text-tertiary py-3 text-center">{emptyText}</p> : children}
    </div>
  );
}

function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
