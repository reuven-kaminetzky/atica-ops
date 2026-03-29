import { getCashFlowProjection } from '../actions';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const WEEKS = 12;

export default async function CashFlowPage() {
  const { outflow, inflow, upcoming, opexMonthly } = await getCashFlowProjection(WEEKS);

  // Build a merged week-by-week table
  const now = new Date();
  const opexPerWeek = Math.round((opexMonthly || 25000) / 4.33);

  const weeks = Array.from({ length: WEEKS }, (_, w) => {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() + w * 7 - now.getDay()); // align to week boundary
    const weekKey = weekStart.toISOString().slice(0, 10);

    const out = outflow.find(r => r.week_start?.slice(0, 10) === weekKey);
    const inn = inflow.find(r => r.week_start?.slice(0, 10) === weekKey);

    const poPayments = Math.round(parseFloat(out?.planned || 0));
    const revenue    = Math.round(parseFloat(inn?.revenue || 0));
    const totalOut   = poPayments + opexPerWeek;
    const net        = revenue - totalOut;

    return {
      w: w + 1,
      label: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      revenue,
      poPayments,
      opex: opexPerWeek,
      totalOut,
      net,
    };
  });

  // Running cash position (relative — starts at 0, accumulates net each week)
  let running = 0;
  for (const w of weeks) {
    running += w.net;
    w.running = running;
  }

  const totalRevenue  = weeks.reduce((s, w) => s + w.revenue, 0);
  const totalOut      = weeks.reduce((s, w) => s + w.totalOut, 0);
  const totalNet      = weeks.reduce((s, w) => s + w.net, 0);

  const overdue = upcoming.filter(p => p.status === 'overdue');
  const due     = upcoming.filter(p => p.status === 'due');

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Cash Flow</h1>
      <p className="text-sm text-text-tertiary mb-5">
        {WEEKS}-week projection · OpEx ~${opexPerWeek.toLocaleString()}/wk
        {overdue.length > 0 && <span className="text-danger font-semibold"> · {overdue.length} overdue</span>}
        {due.length > 0 && <span className="text-warning font-semibold"> · {due.length} due</span>}
      </p>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="border border-danger/20 bg-danger/5 rounded-[--radius-sm] px-4 py-3 mb-5 text-sm">
          <span className="font-semibold text-danger">{overdue.length} overdue payment{overdue.length > 1 ? 's' : ''}</span>
          <div className="mt-1 space-y-0.5">
            {overdue.map(p => (
              <div key={p.id} className="text-text-secondary">
                <Link href={`/purchase-orders/${encodeURIComponent(p.po_id)}`} className="text-brand no-underline hover:underline">
                  {p.po_id}
                </Link>
                {' '}— ${parseFloat(p.amount || 0).toLocaleString()}
                {p.due_date && <span className="text-text-tertiary"> · due {new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly table */}
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Weekly Projection</h2>
      <div className="overflow-x-auto mb-8">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
              <th className="pb-2 pr-4 text-left font-medium">Week</th>
              <th className="pb-2 pr-4 text-right font-medium">Revenue</th>
              <th className="pb-2 pr-4 text-right font-medium">PO Payments</th>
              <th className="pb-2 pr-4 text-right font-medium">OpEx</th>
              <th className="pb-2 pr-4 text-right font-medium">Net</th>
              <th className="pb-2 text-right font-medium">Position</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.w} className="border-b border-border/50">
                <td className="py-2 pr-4">
                  <span className="font-medium">W{w.w}</span>
                  <span className="text-text-tertiary text-[11px] ml-2">{w.label}</span>
                </td>
                <td className="py-2 pr-4 text-right font-mono text-[12px] text-success">
                  {w.revenue > 0 ? `+$${w.revenue.toLocaleString()}` : '—'}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-[12px] text-danger">
                  {w.poPayments > 0 ? `-$${w.poPayments.toLocaleString()}` : '—'}
                </td>
                <td className="py-2 pr-4 text-right font-mono text-[12px] text-text-secondary">
                  -${w.opex.toLocaleString()}
                </td>
                <td className={`py-2 pr-4 text-right font-mono text-[12px] font-semibold ${w.net >= 0 ? 'text-success' : 'text-danger'}`}>
                  {w.net >= 0 ? '+' : ''}{w.net < 0 ? '-' : ''}${Math.abs(w.net).toLocaleString()}
                </td>
                <td className={`py-2 text-right font-mono text-[12px] ${w.running < 0 ? 'text-danger font-semibold' : 'text-text-secondary'}`}>
                  {w.running >= 0 ? '+' : '-'}${Math.abs(w.running).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border text-[12px] font-semibold">
              <td className="pt-2.5 pr-4 text-text-tertiary">Total</td>
              <td className="pt-2.5 pr-4 text-right font-mono text-success">+${totalRevenue.toLocaleString()}</td>
              <td className="pt-2.5 pr-4 text-right font-mono text-danger">
                -${weeks.reduce((s, w) => s + w.poPayments, 0).toLocaleString()}
              </td>
              <td className="pt-2.5 pr-4 text-right font-mono text-text-secondary">
                -${weeks.reduce((s, w) => s + w.opex, 0).toLocaleString()}
              </td>
              <td className={`pt-2.5 pr-4 text-right font-mono ${totalNet >= 0 ? 'text-success' : 'text-danger'}`}>
                {totalNet >= 0 ? '+' : '-'}${Math.abs(totalNet).toLocaleString()}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Upcoming payments */}
      {upcoming.length > 0 && (
        <>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Upcoming Payments</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 text-left font-medium">PO</th>
                <th className="pb-2 pr-4 text-left font-medium">Label</th>
                <th className="pb-2 pr-4 text-right font-medium">Amount</th>
                <th className="pb-2 pr-4 text-left font-medium">Status</th>
                <th className="pb-2 text-left font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map(p => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-2 pr-4">
                    <Link href={`/purchase-orders/${encodeURIComponent(p.po_id)}`}
                      className="text-brand no-underline hover:underline font-mono text-[12px]">
                      {p.po_id}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-text-secondary">{p.label || p.type}</td>
                  <td className="py-2 pr-4 text-right font-mono text-[12px]">
                    ${parseFloat(p.amount || 0).toLocaleString()}
                  </td>
                  <td className={`py-2 pr-4 text-[12px] ${
                    p.status === 'overdue' ? 'text-danger font-semibold' :
                    p.status === 'due'     ? 'text-warning font-semibold' :
                    'text-text-secondary'
                  }`}>{p.status}</td>
                  <td className="py-2 text-text-secondary text-[12px]">
                    {p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
