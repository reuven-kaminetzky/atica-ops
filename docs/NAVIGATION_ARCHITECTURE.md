# Navigation Architecture — Flexible View Model

## The Insight (from Reuven)

The product hierarchy is fixed:
  **Type → MP → Style → Fit → Size → Length**

But the VIEW into this tree is flexible. You can start at any level
and group by any combination. "All Size 42 across all MPs" is valid.
"Grade A styles by Vendor" is valid. "Start at Length, group by Type" 
is valid.

This means the "Analytics" page and the "Products" page are the 
SAME THING with different default groupings.

## What This Means

### The sidebar isn't pages — it's saved presets.

| Sidebar Link | What It Really Is |
|---|---|
| Catalog | Group By: Type → Then By: MP (the product tree) |
| Stock | Group By: Type → Then By: MP, filtered: low stock / OOS |
| By Vendor | Group By: Vendor → Then By: MP |
| Analytics | User picks their own grouping |

Each is an entry point into ONE flexible data breakdown view.
Not 13 separate pages with separate queries.

### Two kinds of pages:

**1. Data Exploration (one flexible view)**
Products, Stock, Vendors, Analytics = same component, different presets.
Uses the Group By / Then By / Column Picker pattern.
This is the ATCM/Lightspeed R model.

**2. Operational Workflows (separate pages)**
POs, Cash Flow, Warehouse, Settings = distinct workflows.
These have their own UI because they're about DOING things,
not VIEWING data.

### Navigation tree:

```
CATALOG (data exploration — one flexible view)
  ├── Products    → Group By: Type, Then: MP
  ├── Stock       → Group By: Type, Then: MP, Filter: stock issues
  ├── Vendors     → Group By: Vendor, Then: MP
  └── Analytics   → User chooses

OPERATIONS (workflows — separate pages)
  ├── Purchase Orders  → PO list → detail → stage → payments
  ├── Cash Flow        → weekly projection table
  └── Warehouse        → receiving, shipments, transfers

SYSTEM
  └── Settings         → sync, verify, auth
```

## What Changes for Danny

Currently: 13 pages, each with its own server action and layout.
Target: 1 flexible data view component + 4 workflow pages + settings.

### Phase 1 (now): Keep separate pages, but make them consistent
Danny's already doing this — clean tables, drill-down pattern.

### Phase 2 (next): Unify data exploration pages
Build ONE DataExplorer component that:
- Accepts `defaultGroupBy` and `defaultFilters` as props
- Products page passes `{ groupBy: 'category', thenBy: ['mp'] }`
- Stock page passes `{ groupBy: 'category', filters: { lowStock: true } }`
- Vendors page passes `{ groupBy: 'vendor' }`
- Analytics page passes `{}` (user chooses)

### Phase 3 (later): Saved views
Let the user save their own Group By + Filter + Column combinations.
"My Views" in the sidebar. Like saved reports in Lightspeed R.

## What Changes for Almond

The analytics DAL already supports this — `getBreakdown(opts)` takes
any groupBy, filters, sort. No DAL changes needed for Phase 2.

For Phase 3 (saved views): need a `saved_views` table:
```sql
CREATE TABLE saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  group_by TEXT NOT NULL,
  then_by TEXT[],
  columns TEXT[],
  filters JSONB DEFAULT '{}',
  sort_column TEXT,
  sort_direction TEXT DEFAULT 'desc',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## What Changes for Bonney

Bonney already shipped variant option extraction (commit 9daad78).
This enables Fit/Size/Length dimensions in the analytics view.
Schema integration with Almond is the remaining step.

## What This is NOT

This is NOT a dashboard. There are no KPI cards. No charts popping up.
The landing page is just the sidebar navigation — entry points into
the flexible view and the workflow pages. Clean. Functional. A tool.

The data appears when you navigate TO it. Not before.
