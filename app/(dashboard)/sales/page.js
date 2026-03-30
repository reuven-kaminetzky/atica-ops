import { getOrdersSummary, getRevenueByChannel } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const CHANNEL_LABELS = {
  retail:    'Retail (POS)',
  online:    'Online',
  wholesale: 'Wholesale',
  reserve:   'Reserve',
};

export default async function SalesPage() {
  const [summary, byChannel] = await Promise.all([
    getOrdersSummary(30),
    getRevenueByChannel(30).catch(() => []),
  ]);

  const hasData = (summary?.order_count || 0) > 0;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Sales</h1>
      <p className="text-sm text-text-tertiary mb-6">Last 30 days</p>

      {!hasData ? (
        <div className="border border-border rounded-[--radius-sm] px-4 py-8 text-center">
          <p className="text-text-tertiary text-sm">No orders yet.</p>
          <p className="text-text-tertiary text-xs mt-1">Run sync to pull orders from Shopify.</p>
        </div>
      ) : (
        <>
          {/* Summary row */}
          <div className="flex gap-6 text-sm border-b border-border pb-4 mb-6 flex-wrap">
            <div>
              <span className="text-text-tertiary">Orders </span>
              <span className="font-semibold">{(summary.order_count || 0).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-text-tertiary">Revenue </span>
              <span className="font-semibold">
                ${Math.round(parseFloat(summary.total_revenue || 0)).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">AOV </span>
              <span className="font-semibold">
                ${Math.round(parseFloat(summary.avg_order_value || 0)).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-text-tertiary">Items/order </span>
              <span className="font-semibold">
                {parseFloat(summary.avg_items || 0).toFixed(1)}
              </span>
            </div>
          </div>

          {/* By channel */}
          {byChannel.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">
                By Channel
              </h2>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                    <th className="pb-2 pr-4 text-left font-medium">Channel</th>
                    <th className="pb-2 pr-4 text-right font-medium">Orders</th>
                    <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
                    <th className="pb-2 text-right font-medium">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {byChannel.map(row => (
                    <tr key={row.channel} className="border-b border-border/50">
                      <td className="py-2.5 pr-4 font-medium">
                        {CHANNEL_LABELS[row.channel] || row.channel}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-[12px]">
                        {(parseInt(row.order_count) || 0).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono text-[12px]">
                        ${Math.round(parseFloat(row.total_revenue || 0)).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono text-[12px] text-text-secondary">
                        ${Math.round(parseFloat(row.avg_order_value || 0)).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-text-tertiary">
            Drill into{' '}
            <Link href="/analytics" className="text-brand no-underline hover:underline">Analytics</Link>
            {' '}for velocity and sell-through by product, fit and size.
          </p>
        </>
      )}
    </div>
  );
}
