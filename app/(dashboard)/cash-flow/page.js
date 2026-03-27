import { getCashFlowData } from '../actions';
const { PROJECTION_WEEKS, WEEKS_PER_MONTH } = require("../../../lib/constants");

export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const { payments, activePOs, opexMonthly } = await getCashFlowData();

  const weeks = [];
  const now = new Date();
  for (let w = 0; w < PROJECTION_WEEKS; w++) {
    const start = new Date(now); start.setDate(now.getDate() + w * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const wkPayments = payments.filter(p => {
      if (!p.due_date) return false;
      const d = new Date(p.due_date);
      return d >= start && d <= end;
    });
    const outflow = wkPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    weeks.push({ week: w + 1, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), outflow: Math.round(outflow), opex: Math.round(opexMonthly / WEEKS_PER_MONTH), payments: wkPayments });
  }
  weeks.forEach(w => w.total = w.outflow + w.opex);

  const totalProjected = weeks.reduce((s, w) => s + w.total, 0);
  const totalPOValue = activePOs.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);
  const overdue = payments.filter(p => p.status === 'overdue').length;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Cash Flow</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="Active POs" value={activePOs.length} />
        <Stat label="Committed" value={`$${totalPOValue.toLocaleString()}`} />
        <Stat label="Projected Outflow" value={`$${totalProjected.toLocaleString()}`} />
        <Stat label="Monthly OpEx" value={`$${opexMonthly.toLocaleString()}`} />
        <Stat label="Overdue" value={overdue} color={overdue > 0 ? 'text-danger' : 'text-success'} />
        <Stat label="Payments" value={payments.length} />
      </div>

      <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle] mb-4 overflow-auto">
        <h2 className="text-sm font-semibold mb-3">Rolling Projection</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th>Week</Th><Th right>PO Payments</Th><Th right>OpEx</Th><Th right>Total Outflow</Th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.week} className="border-b border-border/30">
                <td className="py-2 px-3"><span className="font-semibold">W{w.week}</span> <span className="text-text-tertiary text-xs">{w.label}</span></td>
                <td className={`py-2 px-3 text-right ${w.outflow > 0 ? 'text-danger' : 'text-text-tertiary'}`}>{w.outflow > 0 ? `-$${w.outflow.toLocaleString()}` : '—'}</td>
                <td className="py-2 px-3 text-right text-text-secondary">-${w.opex.toLocaleString()}</td>
                <td className="py-2 px-3 text-right font-semibold">-${w.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {activePOs.length > 0 && (
        <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle] overflow-auto">
          <h2 className="text-sm font-semibold mb-3">Active Purchase Orders ({activePOs.length})</h2>
          <table className="w-full text-sm border-collapse">
            <thead><tr className="border-b border-border"><Th>PO</Th><Th>Product</Th><Th>Stage</Th><Th right>Value</Th><Th>ETA</Th></tr></thead>
            <tbody>
              {activePOs.map(po => (
                <tr key={po.id} className="border-b border-border/30">
                  <td className="py-2 px-3 font-semibold">{po.id}</td>
                  <td className="py-2 px-3">{po.mp_name || '—'}</td>
                  <td className="py-2 px-3"><span className="text-[11px] px-2 py-0.5 rounded bg-surface-sunken text-text-secondary font-semibold">{(po.stage || '').replace(/_/g, ' ')}</span></td>
                  <td className="py-2 px-3 text-right font-semibold">${parseFloat(po.fob_total || 0).toLocaleString()}</td>
                  <td className="py-2 px-3 text-text-secondary">{po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-surface rounded-[--radius-sm] border border-border p-3">
      <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-xl font-bold tracking-tight ${color || ''}`}>{value}</div>
    </div>
  );
}

function Th({ children, right }) {
  return <th className={`py-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary border-b border-border ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}
