import { getCashFlowData } from '../actions';
import Link from 'next/link';
const { PROJECTION_WEEKS, WEEKS_PER_MONTH } = require('../../../lib/constants');

export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const { payments, activePOs, opexMonthly } = await getCashFlowData();

  const now = new Date();
  const weeks = Array.from({ length: PROJECTION_WEEKS }, (_, w) => {
    const start = new Date(now); start.setDate(now.getDate() + w * 7);
    const end   = new Date(start); end.setDate(start.getDate() + 6);
    const wkPayments = payments.filter(p => {
      if (!p.due_date) return false;
      const d = new Date(p.due_date);
      return d >= start && d <= end;
    });
    const outflow = Math.round(wkPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0));
    const opex    = Math.round(opexMonthly / WEEKS_PER_MONTH);
    return { w: w + 1, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), outflow, opex, total: outflow + opex, payments: wkPayments };
  });

  const overdue = payments.filter(p => p.status === 'overdue');

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Cash Flow</h1>
      <p className="text-sm text-text-tertiary mb-6">
        {PROJECTION_WEEKS}-week rolling projection · {activePOs.length} active POs
        {overdue.length > 0 && <span className="text-danger font-semibold ml-2">· {overdue.length} overdue</span>}
      </p>

      {/* Overdue alert */}
      {overdue.length > 0 && (
        <div className="border border-danger/20 bg-danger/5 rounded-[--radius-sm] px-4 py-3 mb-5 text-sm">
          <span className="font-semibold text-danger">{overdue.length} overdue payment{overdue.length > 1 ? 's' : ''}</span>
          <span className="text-text-secondary ml-2">
            {overdue.map(p => `${p.po_id} $${parseFloat(p.amount).toLocaleString()}`).join(' · ')}
          </span>
        </div>
      )}

      {/* Weekly projection */}
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Weekly Outflow</h2>
      <table className="w-full text-sm border-collapse mb-8">
        <thead>
          <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
            <th className="pb-2 pr-4 font-medium">Week</th>
            <th className="pb-2 pr-4 font-medium text-right">PO Payments</th>
            <th className="pb-2 pr-4 font-medium text-right">OpEx</th>
            <th className="pb-2 font-medium text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {weeks.map(w => (
            <tr key={w.w} className="border-b border-border/50">
              <td className="py-2.5 pr-4">
                <span className="font-medium">W{w.w}</span>
                <span className="text-text-tertiary text-[12px] ml-2">{w.label}</span>
              </td>
              <td className={`py-2.5 pr-4 text-right font-mono text-[12px] ${w.outflow > 0 ? 'text-danger' : 'text-text-tertiary'}`}>
                {w.outflow > 0 ? `-$${w.outflow.toLocaleString()}` : '—'}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-[12px] text-text-secondary">
                -${w.opex.toLocaleString()}
              </td>
              <td className="py-2.5 text-right font-mono text-[12px] font-semibold">
                -${w.total.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border font-semibold text-[12px]">
            <td className="pt-2.5 pr-4 text-text-secondary">Total</td>
            <td className="pt-2.5 pr-4 text-right font-mono text-danger">
              -${weeks.reduce((s, w) => s + w.outflow, 0).toLocaleString()}
            </td>
            <td className="pt-2.5 pr-4 text-right font-mono text-text-secondary">
              -${weeks.reduce((s, w) => s + w.opex, 0).toLocaleString()}
            </td>
            <td className="pt-2.5 text-right font-mono">
              -${weeks.reduce((s, w) => s + w.total, 0).toLocaleString()}
            </td>
          </tr>
        </tfoot>
      </table>

      {/* Active POs */}
      {activePOs.length > 0 && (
        <>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-text-tertiary mb-2">Active Purchase Orders</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border text-left text-[11px] text-text-tertiary uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">PO</th>
                <th className="pb-2 pr-4 font-medium">Product</th>
                <th className="pb-2 pr-4 font-medium">Stage</th>
                <th className="pb-2 pr-4 font-medium text-right">Value</th>
                <th className="pb-2 font-medium">ETA</th>
              </tr>
            </thead>
            <tbody>
              {activePOs.map(po => (
                <tr key={po.id} className="border-b border-border/50">
                  <td className="py-2.5 pr-4">
                    <Link href={`/purchase-orders/${encodeURIComponent(po.id)}`}
                      className="text-brand no-underline hover:underline font-mono text-[12px]">
                      {po.id}
                    </Link>
                  </td>
                  <td className="py-2.5 pr-4">{po.mp_name || '—'}</td>
                  <td className="py-2.5 pr-4 text-text-secondary">{(po.stage || '').replace(/_/g, ' ')}</td>
                  <td className="py-2.5 pr-4 text-right font-mono text-[12px]">
                    ${parseFloat(po.fob_total || 0).toLocaleString()}
                  </td>
                  <td className="py-2.5 text-text-secondary">
                    {po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
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
