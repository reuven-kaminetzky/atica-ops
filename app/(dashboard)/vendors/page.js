import { getVendors } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function VendorsPage() {
  const vendors = await getVendors();

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Vendors</h1>

      {vendors.length === 0 ? (
        <p className="text-text-secondary py-8 text-sm">No vendors. Seed the database first.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
              <th className="pb-2 pr-4 text-left font-medium">Name</th>
              <th className="pb-2 pr-4 text-left font-medium">Country</th>
              <th className="pb-2 pr-4 text-right font-medium">POs</th>
              <th className="pb-2 pr-4 text-right font-medium">Active</th>
              <th className="pb-2 pr-4 text-right font-medium">Committed</th>
              <th className="pb-2 text-right font-medium">Avg Lead</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map(v => {
              const committed = parseFloat(v.total_committed || 0);
              const active    = parseInt(v.active_pos) || 0;
              return (
                <tr key={v.id} className="border-b border-border/50 hover:bg-surface-sunken transition-colors">
                  <td className="py-2.5 pr-4">
                    <Link href={`/vendors/${v.id}`}
                      className="font-medium text-text hover:text-brand no-underline">
                      {v.name}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4 text-text-secondary">{v.country || '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">{v.po_count || '—'}</td>
                  <td className={`py-2.5 pr-4 text-right font-mono text-[12px] ${active > 0 ? 'font-semibold' : 'text-text-tertiary'}`}>
                    {active || '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">
                    {committed > 0 ? `$${Math.round(committed).toLocaleString()}` : '—'}
                  </td>
                  <td className="py-2.5 text-right text-text-secondary">
                    {v.avg_lead_days > 0 ? `${v.avg_lead_days}d` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
