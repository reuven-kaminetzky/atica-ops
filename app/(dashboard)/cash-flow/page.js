import { getCashFlowData } from '../actions';
const { PROJECTION_WEEKS, WEEKS_PER_MONTH } = require("../../../lib/constants");

export const dynamic = 'force-dynamic';

export default async function CashFlowPage() {
  const { payments, activePOs, opexMonthly, weeklyRevenue, salesSummary } = await getCashFlowData();

  // Build revenue lookup by week
  const revByWeek = {};
  for (const row of weeklyRevenue) {
    const key = new Date(row.week_start).toISOString().slice(0, 10);
    revByWeek[key] = { revenue: parseFloat(row.revenue) || 0, units: row.units, orders: row.orders };
  }

  // Avg weekly revenue for projection
  const avgWeeklyRev = weeklyRevenue.length > 0
    ? weeklyRevenue.reduce((s, w) => s + (parseFloat(w.revenue) || 0), 0) / weeklyRevenue.length
    : 0;

  // Build weekly projection with both inflow and outflow
  const weeks = [];
  const now = new Date();
  for (let w = 0; w < PROJECTION_WEEKS; w++) {
    const start = new Date(now); start.setDate(now.getDate() + w * 7);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const weekKey = start.toISOString().slice(0, 10);

    // Outflow: PO payments due this week
    const wkPayments = payments.filter(p => {
      if (!p.due_date) return false;
      const d = new Date(p.due_date);
      return d >= start && d <= end;
    });
    const outflow = wkPayments.reduce((s, p) => s + parseFloat(p.amount || 0), 0);
    const opex = Math.round(opexMonthly / WEEKS_PER_MONTH);

    // Inflow: actual if available, projected if future
    const actual = revByWeek[weekKey];
    const inflow = actual ? actual.revenue : Math.round(avgWeeklyRev);
    const isActual = !!actual;

    const totalOut = Math.round(outflow) + opex;
    const net = Math.round(inflow) - totalOut;

    weeks.push({
      week: w + 1,
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      inflow: Math.round(inflow),
      isActual,
      outflow: Math.round(outflow),
      opex,
      totalOut,
      net,
      payments: wkPayments,
    });
  }

  // Cumulative
  let cumulative = 0;
  weeks.forEach(w => { cumulative += w.net; w.cumulative = cumulative; });

  const totalRevenue = parseFloat(salesSummary?.total_revenue || 0);
  const totalOrders = salesSummary?.total_orders || 0;
  const totalPOValue = activePOs.reduce((s, po) => s + parseFloat(po.fob_total || 0), 0);
  const overdue = payments.filter(p => p.status === 'overdue').length;
  const netProjected = weeks.reduce((s, w) => s + w.net, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Cash Flow</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Stat label="30d Revenue" value={`$${totalRevenue.toLocaleString()}`} color="text-success" />
        <Stat label="30d Orders" value={totalOrders} />
        <Stat label="PO Committed" value={`$${Math.round(totalPOValue).toLocaleString()}`} color="text-danger" />
        <Stat label="Monthly OpEx" value={`$${opexMonthly.toLocaleString()}`} />
        <Stat label="Overdue" value={overdue} color={overdue > 0 ? 'text-danger' : 'text-success'} />
        <Stat label={`${PROJECTION_WEEKS}wk Net`} value={`${netProjected >= 0 ? '+' : ''}$${Math.abs(netProjected).toLocaleString()}`} color={netProjected >= 0 ? 'text-success' : 'text-danger'} />
      </div>

      {/* Weekly projection table */}
      <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle] mb-4 overflow-auto">
        <h2 className="text-sm font-semibold mb-3">{PROJECTION_WEEKS}-Week Projection: Inflow vs Outflow</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border">
              <Th>Week</Th>
              <Th right>Revenue</Th>
              <Th right>PO Payments</Th>
              <Th right>OpEx</Th>
              <Th right>Net</Th>
              <Th right>Cumulative</Th>
            </tr>
          </thead>
          <tbody>
            {weeks.map(w => (
              <tr key={w.week} className="border-b border-border/30">
                <td className="py-2 px-3">
                  <span className="font-semibold">W{w.week}</span>{' '}
                  <span className="text-text-tertiary text-xs">{w.label}</span>
                </td>
                <td className="py-2 px-3 text-right text-success">
                  +${w.inflow.toLocaleString()}
                  {!w.isActual && <span className="text-[10px] text-text-tertiary ml-1">est</span>}
                </td>
                <td className={`py-2 px-3 text-right ${w.outflow > 0 ? 'text-danger' : 'text-text-tertiary'}`}>
                  {w.outflow > 0 ? `-$${w.outflow.toLocaleString()}` : '—'}
                </td>
                <td className="py-2 px-3 text-right text-text-secondary">
                  -${w.opex.toLocaleString()}
                </td>
                <td className={`py-2 px-3 text-right font-semibold ${w.net >= 0 ? 'text-success' : 'text-danger'}`}>
                  {w.net >= 0 ? '+' : ''}{w.net.toLocaleString()}
                </td>
                <td className={`py-2 px-3 text-right font-bold ${w.cumulative >= 0 ? 'text-success' : 'text-danger'}`}>
                  {w.cumulative >= 0 ? '+' : ''}{w.cumulative.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active POs */}
      {activePOs.length > 0 && (
        <div className="bg-surface rounded-[--radius-md] border border-border p-4 shadow-[--shadow-subtle] overflow-auto">
          <h2 className="text-sm font-semibold mb-3">Active Purchase Orders ({activePOs.length})</h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <Th>PO</Th><Th>Product</Th><Th>Stage</Th><Th right>Value</Th><Th>ETA</Th>
              </tr>
            </thead>
            <tbody>
              {activePOs.map(po => (
                <tr key={po.id} className="border-b border-border/30">
                  <td className="py-2 px-3 font-semibold">{po.id}</td>
                  <td className="py-2 px-3">{po.mp_name || '—'}</td>
                  <td className="py-2 px-3">
                    <span className="text-[11px] px-2 py-0.5 rounded bg-surface-sunken text-text-secondary font-semibold">
                      {(po.stage || '').replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    ${parseFloat(po.fob_total || 0).toLocaleString()}
                  </td>
                  <td className="py-2 px-3 text-text-secondary">
                    {po.eta ? new Date(po.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
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
