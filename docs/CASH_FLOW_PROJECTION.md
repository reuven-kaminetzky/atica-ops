# Cash Flow Projection — Design Spec

## What Reuven Needs

"Where's my money? What's coming in, what's going out, when?"

The cash flow page answers: for each week over the next 12 weeks,
what's the projected inflow (sales revenue) vs outflow (PO payments
+ operating expenses), and what's the running cash position?

## The Algorithm

```
For each week W (1 through 12):

  INFLOW:
    Weekly revenue = average weekly revenue over last 30 days
                   × seasonal multiplier for that week's month
    Source: sales table → SUM(total) / 4 weeks
    Adjustment: SEASONAL_MULTIPLIERS[month]

  OUTFLOW:
    PO payments due this week = SUM(po_payments.amount)
      WHERE due_date falls within this week
      AND status IN ('planned', 'upcoming', 'due')
    
    Operating expenses = monthly OpEx / 4.33
      Source: app_settings key 'opex_monthly' (currently $25,000)

  NET = inflow - outflow
  
  RUNNING POSITION = previous week position + NET
```

## Data Sources

| Metric | Source | Query |
|--------|--------|-------|
| Weekly revenue | sales table | SUM(total) WHERE ordered_at > NOW() - 30d / 4 |
| Revenue by week | sales table | GROUP BY date_trunc('week', ordered_at) |
| PO payments due | po_payments | WHERE due_date BETWEEN week_start AND week_end |
| PO payments by status | po_payments | GROUP BY status (planned/upcoming/due/overdue/paid) |
| OpEx monthly | app_settings | key = 'opex_monthly' |
| Seasonal multiplier | lib/constants.js | SEASONAL_MULTIPLIERS[month] |

## What Already Exists

Almond built:
- `lib/dal/sales.js` — getRevenueSummary(days), getRevenueByWeek(days)
- `lib/dal/payments.js` — getPaymentsDue(), getPaymentsByWeek()
- `lib/finance/index.js` — getOpex(), getCashFlowProjection()

Danny has:
- `app/(dashboard)/cash-flow/page.js` — weekly table showing outflow

## What's Missing

1. **Revenue inflow** — the current cash flow page only shows OUTFLOW.
   It doesn't show what's COMING IN from sales. Half the picture.

2. **Running cash position** — no cumulative balance. You can't see
   "I'll be $50K short in week 6" without a running total.

3. **Seasonal adjustment** — revenue projection should adjust for
   seasonal patterns (August = 1.4×, February = 0.85×).

4. **Actual vs projected** — for past weeks, show what ACTUALLY happened
   vs what was projected. This builds trust in the projections.

## Cash Flow Table Design

| Week | Date | Revenue In | PO Payments | OpEx | Net | Running |
|------|------|-----------|-------------|------|-----|---------|
| W1 | Apr 1 | $14,400 | -$8,500 | -$5,770 | +$130 | $130 |
| W2 | Apr 8 | $14,400 | -$0 | -$5,770 | +$8,630 | $8,760 |
| W3 | Apr 15 | $14,400 | -$22,000 | -$5,770 | -$13,370 | -$4,610 |
| ... | | | | | | |

Color coding:
- Net positive = green
- Net negative = red
- Running position negative = red bold (cash crunch warning)

## Payment Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| planned | gray | Projected, not yet confirmed |
| upcoming | blue | Confirmed, due within 14 days |
| due | orange | Due this week |
| overdue | red | Past due date, not paid |
| paid | green | Settled |

## Overdue Alert

If any payment is overdue, show a banner at the top:
"2 payments overdue totaling $12,500 — [View]"

## Server Action

```javascript
getCashFlowProjection({ weeks: 12, startingBalance: 0 })
// Returns:
{
  weeks: [
    { weekNum: 1, startDate: '2026-04-01', 
      revenueIn: 14400, poPayments: 8500, opex: 5770,
      net: 130, running: 130,
      payments: [{ id, po_id, type, amount, status, due_date }] },
    ...
  ],
  totals: { revenueIn: 172800, poPayments: 45000, opex: 69240, net: 58560 },
  overdue: [{ id, po_id, amount, due_date, mp_name }],
  avgWeeklyRevenue: 14400,
  seasonalMonth: 4,
  seasonalMultiplier: 0.85,
}
```

## Owner

- DAL: Almond (already built — may need refinement)
- Page: Danny (rebuild with inflow + outflow + running position)
- Revenue data: Bonney (sales table must be populated from sync)
