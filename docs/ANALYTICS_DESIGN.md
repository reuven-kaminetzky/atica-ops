# Analytics Design Spec — Flexible Data Breakdown

## Reference

- Screenshot: aticm.com/#/data (ATCM analytics module)
- Lightspeed R Analytics: drill-down reports with configurable dimensions
- Reuven: "flexible, not hardcoded hierarchy and grouping"

## What Reuven wants

ONE data breakdown view where you choose how to slice the data.
Not 5 separate pages. Not hardcoded reports. A single flexible tool.

## The pattern (from ATCM screenshot)

### 1. Group By selector (top bar)
Horizontal pills: Category | Vendor | Sub-Category | Product | Color | Fit | Size | Length | Location

User clicks one → that becomes the primary grouping.
Each row in the table is one value of that dimension.

### 2. THEN BY chain (stackable)
Dropdown selectors that chain: "THEN BY Product", "THEN BY Fit", "THEN BY Size"

This creates the tree. Example:
  Group by Category → THEN BY Product → THEN BY Fit → THEN BY Size

Result: a collapsible tree like:
  ▶ SUITS (6095 skus) — Stock: 7,583 | Sales: 1,417 | Vel: 45.52
    ▶ ZEGNA | PEAK LAPEL | NAVY SHARKSKIN — Stock: 13 | Sales: 1
      ▼ LORENZO / DROP 6 — Stock: 10
        SIZE 46 — Stock: 1
        SIZE 44 — Stock: 2
        SIZE 42 — Stock: 4

### 3. Columns (configurable)
User picks which metrics to show. In the screenshot:
  Stock | INC (incoming) | Sales | VEL (velocity) | X RATE (sell-through)

We'd show: Stock | Incoming | Sales | Vel/wk | Days | Signal

### 4. Filters (top bar)
  Date range (Last 30 Days dropdown)
  Quick filters (Out of Stock button)
  Advanced Filters panel

### 5. Expand/collapse
Each row with children has a ▶ arrow. Click to expand.
The tree goes as deep as the THEN BY chain allows.

## How this maps to our data model

Our hierarchy: Product Type → MP → Style → Fit → Size → Length

The "Group By" dimensions we support:

| Dimension | Source | SQL |
|-----------|--------|-----|
| Category | master_products.category | GROUP BY category |
| MP (Product) | master_products.name | GROUP BY mp_id |
| Vendor | master_products.vendor_id → vendors.name | GROUP BY vendor_id |
| Style (Color) | styles.title / colorway | GROUP BY style_id |
| Fit | TBD — not stored as separate entity yet | needs schema |
| Size | TBD — variant option1/option2 | needs schema |
| Length | TBD — variant option3 | needs schema |
| Location | store_inventory.location | GROUP BY location |

## What's missing in the schema

To support Size/Fit/Length grouping, we need variant-level data.
Currently we only have product-level (styles) and MP-level data.

**Needed:** A variants or sku_details table, or at minimum:
- Fit extracted from Shopify variant option (e.g., "Lorenzo 6 Drop")
- Size extracted from variant option (e.g., "42")
- Length if applicable

This is a **schema decision** — Almond's scope.
Design it before building it.

## What this means for Danny

The current separate pages (products, stock, analytics) still exist
for simple navigation. But the Analytics page becomes the power tool:

**Analytics page = the flexible data breakdown.**

Components needed:
1. GroupByBar — horizontal pill selector for primary dimension
2. ThenByChain — stackable dropdown selectors
3. ColumnPicker — checkboxes for which metrics to show
4. FilterBar — date range, out of stock, advanced
5. TreeTable — collapsible rows, sortable columns, aggregated numbers

This is a significant frontend build. Danny should:
1. Start with GroupByBar + a flat table (no tree, just GROUP BY one dimension)
2. Add ThenByChain (one level of nesting)
3. Add expand/collapse
4. Add column picker
5. Add filters

## Data contract

Danny needs a server action that accepts:

```javascript
getDataBreakdown({
  groupBy: 'category',           // primary dimension
  thenBy: ['mp', 'fit', 'size'], // nested dimensions (optional)
  columns: ['stock', 'incoming', 'sales', 'velocity', 'x_rate'],
  filters: {
    dateRange: { start: '2026-03-01', end: '2026-03-29' },
    outOfStock: false,
    category: null,  // filter to specific category
    vendor: null,
  },
  sort: { column: 'sales', direction: 'desc' },
})
```

Returns:

```javascript
{
  rows: [
    {
      label: 'SUITS',
      count: 6095,          // number of SKUs
      stock: 7583,
      incoming: 15,
      sales: 1417,
      velocity: 45.52,
      x_rate: 5.4,
      children: [           // populated if thenBy has more levels
        {
          label: 'ZEGNA | PEAK LAPEL | NAVY',
          stock: 13,
          sales: 1,
          velocity: 0.03,
          x_rate: 13.0,
          children: [...]
        }
      ]
    }
  ],
  totals: { stock: 7983, sales: 1500, velocity: 50.2 },
  dimensions: ['category', 'mp', 'fit', 'size'],
}
```

## Almond builds the DAL method

This is a dynamic GROUP BY query. Almond writes:
`lib/dal/analytics.js` → `getBreakdown(groupBy, thenBy, filters)`

The query uses dynamic column selection based on the groupBy parameter.
This is the most complex DAL method in the system.

## Implementation order

1. Peter: This design spec (done)
2. Almond: `lib/dal/analytics.js` with getBreakdown()
3. Almond: Server action in actions.js
4. Danny: GroupByBar + flat table (MVP)
5. Danny: ThenByChain + tree expansion
6. Danny: Column picker + filters
7. Bonney: Ensure variant data is synced (fit/size/length from Shopify)
