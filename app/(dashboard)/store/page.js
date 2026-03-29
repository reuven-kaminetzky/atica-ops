'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STORES = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey'];

export default function StorePage() {
  const [store, setStore] = useState('Lakewood');
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);

  async function load(s) {
    setLoading(true);
    try {
      const res = await fetch(`/api/store?name=${encodeURIComponent(s)}`);
      setData(await res.json());
    } catch (e) { setData({ error: e.message }); }
    setLoading(false);
  }

  useEffect(() => { load(store); }, [store]);

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Store</h1>
        <div className="flex gap-1.5">
          {STORES.map(s => (
            <button key={s} onClick={() => setStore(s)}
              className={`px-3 py-1 rounded text-[12px] font-medium transition-colors ${
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
        <p className="text-text-tertiary text-sm py-8">Loading {store}...</p>
      ) : data?.error ? (
        <p className="text-danger text-sm py-4">{data.error}</p>
      ) : (
        <StoreContent store={store} data={data} reload={() => load(store)} />
      )}
    </div>
  );
}

function StoreContent({ store, data, reload }) {
  const needsConfirmation = data?.needsConfirmation || [];
  const incomingTransfers = data?.incomingTransfers || [];
  const stockAlerts       = data?.stockAlerts || [];
  const incomingPOs       = data?.incomingPOs || [];

  return (
    <>
      {/* Unconfirmed deliveries alert */}
      {needsConfirmation.length > 0 && (
        <div className="border border-warning/20 bg-warning/5 rounded-[--radius-sm] px-4 py-3 mb-5">
          <p className="text-sm font-semibold text-warning mb-2">
            {needsConfirmation.length} transfer{needsConfirmation.length > 1 ? 's' : ''} need confirmation
          </p>
          {needsConfirmation.map(tr => {
            const hours = tr.delivered_at ? Math.round((Date.now() - new Date(tr.delivered_at)) / 3600000) : 0;
            return (
              <div key={tr.id} className="flex items-center justify-between py-1.5 border-b border-warning/10 last:border-0 text-sm">
                <span>
                  <span className="font-mono text-[12px]">{tr.id}</span>
                  <span className="text-text-secondary ml-2">{tr.total_units} units · {hours}h ago</span>
                </span>
                <button
                  onClick={async () => {
                    await fetch(`/api/transfers/${encodeURIComponent(tr.id)}/confirm`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ confirmedBy: store }),
                    });
                    reload();
                  }}
                  className={`text-xs font-semibold px-3 py-1 rounded transition-colors ${
                    hours >= 4
                      ? 'bg-danger text-white hover:bg-danger/80'
                      : 'bg-warning text-white hover:bg-warning/80'
                  }`}>
                  {hours >= 4 ? 'CONFIRM — OVERDUE' : 'Confirm receipt'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Stock alerts */}
      {stockAlerts.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Stock Alerts</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Product</th>
                <th className="pb-2 pr-4 font-medium">Category</th>
                <th className="pb-2 pr-4 font-medium text-right">Stock</th>
                <th className="pb-2 font-medium text-right">Days</th>
              </tr>
            </thead>
            <tbody>
              {stockAlerts.map(mp => {
                const stock = parseInt(mp.total_inventory) || 0;
                const days  = parseInt(mp.days_of_stock) || 999;
                return (
                  <tr key={mp.id} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium">
                      <Link href={`/products/${mp.id}`} className="text-text hover:text-brand no-underline">{mp.name}</Link>
                    </td>
                    <td className="py-2.5 pr-4 text-text-secondary">{mp.category}</td>
                    <td className={`py-2.5 pr-4 text-right font-mono text-[12px] ${stock === 0 ? 'text-danger font-bold' : 'text-warning'}`}>
                      {stock}
                    </td>
                    <td className={`py-2.5 text-right font-mono text-[12px] ${days < 30 ? 'text-danger' : days < 60 ? 'text-warning' : 'text-text-secondary'}`}>
                      {days < 999 ? `${days}d` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Incoming transfers */}
      {incomingTransfers.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Incoming Deliveries</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Transfer</th>
                <th className="pb-2 pr-4 font-medium">From</th>
                <th className="pb-2 pr-4 font-medium">Status</th>
                <th className="pb-2 font-medium text-right">Units</th>
              </tr>
            </thead>
            <tbody>
              {incomingTransfers.map(tr => (
                <tr key={tr.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-mono text-[12px]">{tr.id}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{tr.from_location}</td>
                  <td className={`py-2.5 pr-4 ${tr.status === 'in_transit' ? 'text-success' : tr.status === 'delivered' ? 'text-info' : 'text-text-secondary'}`}>
                    {tr.status?.replace(/_/g, ' ')}
                  </td>
                  <td className="py-2.5 text-right font-mono text-[12px]">{tr.total_units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Incoming POs */}
      {incomingPOs.length > 0 && (
        <div className="mb-7">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Incoming from POs</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Product</th>
                <th className="pb-2 pr-4 font-medium">Stage</th>
                <th className="pb-2 pr-4 font-medium text-right">Units</th>
                <th className="pb-2 font-medium">ETA</th>
              </tr>
            </thead>
            <tbody>
              {incomingPOs.map(po => (
                <tr key={po.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 font-medium">{po.mp_name || po.mp_id || '—'}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{po.stage?.replace(/_/g, ' ')}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{(po.units || 0).toLocaleString()}</td>
                  <td className="py-2.5 text-text-secondary">
                    {po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {stockAlerts.length === 0 && incomingTransfers.length === 0 && incomingPOs.length === 0 && needsConfirmation.length === 0 && (
        <p className="text-text-tertiary text-sm py-8">All clear — nothing to action for {store}.</p>
      )}
    </>
  );
}
