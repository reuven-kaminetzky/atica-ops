# Strategic Design — Ahead of the Game

## The $11M Problem

At $7.5M growing 50%, next year is $11.25M, the year after is ~$17M.
What works at $7.5M breaks at $11M. Design for $17M, build for $11M.

---

## 1. PO Impact Simulation

### The Problem
At $11M you have $3M+ in inventory at any time. You're placing POs
3-4 months before revenue arrives. A big PO + a slow season = cash
crunch. You need to see the impact BEFORE you commit.

### The Feature
When creating a PO, before clicking "Order," the system shows:

```
This PO: HC Suit × 200 units = $8,300 FOB
  Deposit (30%):    $2,490 due on order
  Production (40%): $3,320 due in ~60 days
  Balance (30%):    $2,490 due in ~120 days

Impact on cash position:
  Week 4:  Current projection: +$12,400 → After this PO: +$9,910
  Week 8:  Current projection: +$8,200  → After this PO: +$4,880
  Week 12: Current projection: +$15,600 → After this PO: +$13,110

✓ Cash stays positive. Safe to order.
```

If cash goes negative:
```
⚠ WARNING: This PO pushes cash negative in Week 8.
  Week 8 position: -$3,200
  Options:
    - Delay order by 2 weeks (cash stays positive)
    - Reduce quantity to 150 (deposit drops to $1,868)
    - Split across 2 POs (stagger payments)
```

### How It Works
1. Get current cash flow projection (from CASH_FLOW_PROJECTION.md)
2. Add the new PO's payment schedule to the projection
3. Recalculate running cash position
4. Highlight weeks where position goes negative
5. Show on the PO creation form BEFORE "Order" is clicked

### Data Contract
```javascript
simulatePOImpact({
  fob: 41.50,
  units: 200,
  paymentTerms: 'standard',  // 30/40/30
  leadDays: 90,
  orderDate: '2026-04-01',
})
// Returns:
{
  payments: [
    { type: 'deposit', amount: 2490, dueDate: '2026-04-01' },
    { type: 'production', amount: 3320, dueDate: '2026-06-01' },
    { type: 'balance', amount: 2490, dueDate: '2026-07-30' },
  ],
  impact: [
    { week: 4, before: 12400, after: 9910, safe: true },
    { week: 8, before: 8200, after: 4880, safe: true },
    ...
  ],
  safe: true,
  firstNegativeWeek: null,
}
```

### Owner
- Logic: Almond (lib/finance/ — extend getCashFlowProjection)
- UI: Danny (PO creation form — show impact before submit)

---

## 2. Collection Planning (Season Lifecycle)

### The Problem
At $11M you're buying for Fall/Winter 2026 while selling Spring 2026.
You need to plan 6 months ahead. New products need to go through
the full stack → sample → approve → cost → order pipeline. 
Currently there's no way to plan a collection — you just create
individual POs reactively.

### The Feature
A "Collection" is a group of POs for a specific season:

```
Fall/Winter 2026
  Status: PLANNING (target ship: Aug 2026)
  ──────────────────────────────────────
  HC Suit - 3 new colorways      [Design]
  Italian HC - reorder 200       [Ready to order]
  Londoner Shirt - new stripe    [Sample received]
  Casual Blazer - reorder 100    [Costed]
  ──────────────────────────────────────
  Total committed: $42,500
  Total projected retail: $145,000
  Target margin: 71%
```

### Schema
```sql
CREATE TABLE collections (
  id TEXT PRIMARY KEY,          -- 'FW-2026'
  name TEXT NOT NULL,           -- 'Fall/Winter 2026'
  season TEXT,                  -- 'FW' or 'SS'
  year INTEGER,
  target_ship_date DATE,
  status TEXT DEFAULT 'planning', -- planning, ordering, in_production, shipping, delivered
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- POs link to collection
ALTER TABLE purchase_orders ADD COLUMN 
  collection_id TEXT REFERENCES collections(id);
```

### What This Enables
- See all POs for a season in one view
- Track collection-level margin and committed spend
- Plan new products (Stack → Sample → Approve) before ordering
- Season-over-season comparison
- "Did FW-2025 sell through faster than FW-2024?"

### Owner
- Schema: Almond
- UI: Danny (new Collection view, PO grouping)
- Data: Bonney (no sync needed — collections are internal)

---

## 3. What Breaks at Scale

### At $11M (next year):
| Issue | Impact | Design |
|-------|--------|--------|
| More staff | Need user roles, not just one password | Almond: user accounts table + role-based access |
| 5th store possible | Allocation algorithm must handle N stores | Already designed — STORE_ALLOCATION.md is flexible |
| 2000+ SKUs | Matcher must scale, analytics must handle volume | Bonney: paginated sync. Almond: analytics query performance |
| Bigger PO pipeline | 20+ active POs simultaneously | Cash flow simulation critical |
| More vendors | Vendor scoring becomes essential | Already designed — INTELLIGENCE_LAYER.md |
| Accountant needs reports | QuickBooks integration | Future — export-first (CSV), then API |

### At $17M (2 years):
| Issue | Impact | Design |
|-------|--------|--------|
| Wholesale channel | Different pricing, B2B portal | New module — not yet designed |
| International shipping | Duties per destination, multi-currency | Pricing model needs rework |
| Multiple warehouses | Inventory across 2+ warehouses | store_inventory already location-based |
| Mobile workforce | Store managers check stock on phone | Mobile-first redesign of key pages |
| Data volume | 50K+ orders/year | Database indexing, query optimization |

---

## 4. Returns Processing

### The Problem
At $7.5M with 4 stores + online, returns are significant.
A return affects: inventory (goes up), cash flow (goes down),
product grading (return rate is a quality signal), and customer
relationship.

### The Flow
```
Customer returns item
  ↓
Store records return (which item, reason, condition)
  ↓
Inventory adjusts (stock goes back up at that location)
  ↓
Revenue adjusts (negative sale in sales table)
  ↓
Grade impact (high return rate = lower grade)
  ↓
If damaged: markdown or write-off
```

### Data
```sql
CREATE TABLE returns (
  id SERIAL PRIMARY KEY,
  order_id TEXT,             -- original order
  style_id TEXT,             -- what was returned
  mp_id TEXT,
  store TEXT,                -- where returned
  quantity INTEGER,
  reason TEXT,               -- didn't fit, wrong color, quality, etc.
  condition TEXT,            -- resellable, damaged, defective
  refund_amount NUMERIC(10,2),
  action TEXT,               -- restock, markdown, write_off
  processed_at TIMESTAMPTZ DEFAULT NOW(),
  processed_by TEXT
);
```

### Impact
- Velocity adjusts downward (net sales, not gross)
- Grade factors in return rate
- Cash flow shows refunds as negative inflow
- Analytics shows return rate per MP, per store, per reason

### Owner
- Schema + DAL: Almond
- Shopify webhook: Bonney (refunds/create webhook)
- UI: Danny (returns tab on product detail, return rate in analytics)

---

## 5. Markdown Lifecycle

### The Problem
Grade D products sit. They need to be marked down systematically.
Currently there's no process — Reuven decides ad hoc.

### The Design
```
Product aged 90+ days with < 0.3 velocity
  ↓ System flags as markdown candidate
  ↓
Reuven reviews (approve/reject/override)
  ↓
If approved: markdown schedule applied
  ↓ 90 days: 20% off
  ↓ 180 days: 40% off  
  ↓ 270 days: 60% off
  ↓ 360 days: final clearance or write-off
  ↓
Price change pushed to Shopify via API
  ↓
Margin recalculates. Cash flow adjusts.
```

### Schema
```sql
ALTER TABLE master_products ADD COLUMN
  markdown_status TEXT,         -- null, candidate, approved, active, cleared
  markdown_approved_at TIMESTAMPTZ,
  markdown_schedule JSONB,      -- { "90": 20, "180": 40, "270": 60 }
  original_retail NUMERIC(10,2);
```

### Owner
- Logic: Almond (markdown rules in lib/product/)
- Shopify price update: Bonney (write to Shopify API)
- UI: Danny (markdown candidates list, approval flow)

---

## Priority Order

| # | Feature | Revenue Impact | Build Time | When |
|---|---------|---------------|------------|------|
| 1 | PO Impact Simulation | Prevents cash crunches | 1 sprint | NOW |
| 2 | Collection Planning | Organizes seasonal buying | 1 sprint | Next month |
| 3 | Returns Processing | Accurate velocity + grades | 1 sprint | When grades ship |
| 4 | Markdown Lifecycle | Recovers dead stock capital | 1 sprint | When grades ship |
| 5 | User Roles | Staff can use system safely | 2 sprints | Before adding staff |
| 6 | Wholesale | New revenue channel | 3 sprints | When B2B demand exists |
