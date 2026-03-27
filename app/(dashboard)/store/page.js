'use client';

import { useState, useEffect } from 'react';

const STORES = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey'];

export default function StorePage() {
  const [store, setStore] = useState('Lakewood');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  async function load(s) {
    setLoading(true);
    try {
      // Call server action via API-style fetch since we're client component
      const res = await fetch(`/api/store?name=${encodeURIComponent(s)}`);
      const d = await res.json();
      setData(d);
    } catch (e) {
      setData({ error: e.message });
    }
    setLoading(false);
  }

  useEffect(() => { load(store); }, [store]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Store View</h1>
        <select value={store} onChange={e => { setStore(e.target.value); }}
          className="px-3 py-2 rounded-[--radius-sm] border border-border-strong text-sm bg-surface font-semibold">
          {STORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-text-tertiary">Loading {store}...</div>
      ) : data?.error ? (
        <div className="p-4 rounded-[--radius-md] bg-danger-light text-danger text-sm">{data.error}</div>
      ) : (
        <>
          {/* Confirmation alerts */}
          {data.needsConfirmation?.length > 0 && (
            <div className="bg-warning-light border border-warning/20 rounded-[--radius-md] p-4 mb-4">
              <h2 className="text-sm font-bold text-warning mb-2">⚠ Transfers need your confirmation</h2>
              {data.needsConfirmation.map(tr => {
                const hours = tr.delivered_at ? Math.round((Date.now() - new Date(tr.delivered_at)) / 3600000) : 0;
                return (
                  <div key={tr.id} className="flex items-center justify-between py-2 border-b border-warning/10 last:border-0">
                    <div className="text-sm">
                      <span className="font-semibold">{tr.id}</span>
                      <span className="text-text-secondary ml-2">{tr.total_units} units · {hours}h ago</span>
                    </div>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                      hours >= 4 ? 'bg-danger text-white' : 'bg-warning text-white'
                    }`}>{hours >= 4 ? 'OVERDUE' : 'Confirm'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Incoming transfers (van) */}
          <Section title="Incoming Deliveries" empty={!data.incomingTransfers?.length} emptyText="No deliveries scheduled">
            {data.incomingTransfers?.map(tr => (
              <div key={tr.id} className="flex items-center justify-between py-3 border-b border-border/30 last:border-0">
                <div>
                  <div className="font-semibold text-sm">{tr.id}</div>
                  <div className="text-xs text-text-secondary mt-0.5">
                    From {tr.from_location} · {tr.total_units} units
                  </div>
                  {tr.items && (
                    <div className="text-xs text-text-tertiary mt-1">
                      {(typeof tr.items === 'string' ? JSON.parse(tr.items) : tr.items)
                        .slice(0, 3).map(i => `${i.qty}× ${i.mpName || i.mpId}`).join(', ')}
                      {(typeof tr.items === 'string' ? JSON.parse(tr.items) : tr.items).length > 3 && ' ...'}
                    </div>
                  )}
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                  tr.status === 'in_transit' ? 'bg-success-light text-success' :
                  tr.status === 'delivered' ? 'bg-info-light text-info' :
                  'bg-surface-sunken text-text-tertiary'
                }`}>{tr.status?.replace(/_/g, ' ')}</span>
              </div>
            ))}
          </Section>

          {/* Stock alerts */}
          <Section title="Stock Alerts" empty={!data.stockAlerts?.length} emptyText="All stock levels healthy">
            <table className="w-full text-sm border-collapse">
              <thead><tr className="border-b border-border">
                <Th>Product</Th><Th>Category</Th><Th right>Stock</Th><Th right>Days</Th><Th>Signal</Th>
              </tr></thead>
              <tbody>
                {data.stockAlerts?.map(mp => {
                  const stock = parseInt(mp.total_inventory) || 0;
                  const days = parseInt(mp.days_of_stock) || 999;
                  return (
                    <tr key={mp.id} className="border-b border-border/30">
                      <td className="py-2 px-3 font-semibold">{mp.name}</td>
                      <td className="py-2 px-3 text-text-secondary">{mp.category}</td>
                      <td className={`py-2 px-3 text-right font-semibold ${stock === 0 ? 'text-danger' : 'text-warning'}`}>{stock}</td>
                      <td className="py-2 px-3 text-right text-text-secondary">{days < 999 ? days + 'd' : '—'}</td>
                      <td className="py-2 px-3">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                          stock === 0 ? 'bg-danger-light text-danger' : 'bg-warning-light text-warning'
                        }`}>{stock === 0 ? 'OUT' : 'LOW'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>

          {/* PO awareness */}
          <Section title="Coming Soon (POs)" empty={!data.incomingPOs?.length} emptyText="No shipments expected">
            {data.incomingPOs?.map(po => (
              <div key={po.id} className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 text-sm">
                <div>
                  <span className="font-semibold">{po.mp_name || po.mp_id || '—'}</span>
                  <span className="text-text-secondary ml-2">{(po.units || 0).toLocaleString()} units</span>
                </div>
                <div className="text-right">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                    po.stage === 'in_transit' ? 'bg-success-light text-success' : 'bg-surface-sunken text-text-tertiary'
                  }`}>{po.stage?.replace(/_/g, ' ')}</span>
                  {po.eta && (
                    <span className="text-xs text-text-tertiary ml-2">
                      ETA {new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children, empty, emptyText }) {
  return (
    <div className="bg-surface rounded-[--radius-md] border border-border p-4 mb-3 shadow-[--shadow-subtle]">
      <h2 className="text-sm font-semibold mb-3 pb-2 border-b border-border/50">{title}</h2>
      {empty ? <p className="text-sm text-text-tertiary py-4 text-center">{emptyText}</p> : children}
    </div>
  );
}

function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
