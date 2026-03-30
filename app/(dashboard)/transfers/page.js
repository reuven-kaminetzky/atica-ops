import { getAllTransfers, getProducts } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const STATUS_FLOW = ['planned', 'picked', 'loaded', 'in_transit', 'delivered', 'confirmed'];

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STORES = ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey', 'Warehouse', 'Online'];

export default async function TransfersPage() {
  const [transfers, products] = await Promise.all([
    getAllTransfers(),
    getProducts(),
  ]);

  const active    = transfers.filter(t => !['confirmed'].includes(t.status));
  const confirmed = transfers.filter(t => t.status === 'confirmed');

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Transfers</h1>
        <Link href="/transfers/new" className="px-3 py-1.5 rounded-[--radius-sm] bg-brand text-white text-sm font-semibold no-underline hover:bg-brand-dark">
          + New Transfer
        </Link>
      </div>

      {transfers.length === 0 ? (
        <p className="text-text-tertiary text-sm py-8">No transfers yet.</p>
      ) : (
        <>
          {active.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Active</h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                    <th className="pb-2 pr-4 text-left font-medium">ID</th>
                    <th className="pb-2 pr-4 text-left font-medium">From → To</th>
                    <th className="pb-2 pr-4 text-left font-medium">Status</th>
                    <th className="pb-2 pr-4 text-right font-medium">Units</th>
                    <th className="pb-2 text-left font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map(tr => (
                    <tr key={tr.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                      <td className="py-2.5 pr-4">
                        <Link href={`/transfers/${tr.id}`} className="text-brand no-underline hover:underline font-mono text-[12px]">
                          {tr.id}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className="text-text-secondary">{tr.from_location}</span>
                        <span className="text-text-tertiary mx-1.5">→</span>
                        <span className="font-medium">{tr.to_location}</span>
                      </td>
                      <td className={`py-2.5 pr-4 text-[12px] ${
                        tr.status === 'in_transit' ? 'text-brand font-semibold' :
                        tr.status === 'delivered'  ? 'text-warning font-semibold' :
                        'text-text-secondary'
                      }`}>{tr.status.replace(/_/g, ' ')}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{tr.total_units}</td>
                      <td className="py-2.5 text-text-secondary text-[12px]">{fmtDate(tr.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {confirmed.length > 0 && (
            <details className="border border-border rounded-[--radius-sm]">
              <summary className="px-4 py-3 text-sm text-text-secondary cursor-pointer select-none hover:bg-surface-sunken list-none">
                Completed ({confirmed.length})
              </summary>
              <div className="px-4 pb-3 pt-1 border-t border-border/50">
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {confirmed.slice(0, 20).map(tr => (
                      <tr key={tr.id} className="border-b border-border/40">
                        <td className="py-2 pr-4 font-mono text-[12px] text-text-secondary">{tr.id}</td>
                        <td className="py-2 pr-4 text-text-secondary">
                          {tr.from_location} → {tr.to_location}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-[12px]">{tr.total_units} units</td>
                        <td className="py-2 text-text-tertiary text-[12px]">{fmtDate(tr.confirmed_at || tr.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
