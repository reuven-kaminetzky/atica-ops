# Store Allocation — Design Spec

## Problem

When stock arrives at the warehouse (PO stage 11: received), 
it needs to be distributed across 4 stores + online. Currently
there are static weights in constants.js:

```
Lakewood: 30%, Flatbush: 20%, Crown Heights: 15%, 
Monsey: 25%, Online: 10%
```

This is a starting point but doesn't account for:
- Which store is actually selling this product fastest
- Which store is out of stock (should get priority)
- Seasonal variation by location
- Store capacity constraints

## Design

### Two allocation strategies:

**1. Weight-based (current):** 
Simple. Fixed percentages. Good for initial distribution when no 
sales data exists for this product at this store.

**2. Velocity-based (target):**
Allocate proportional to per-store velocity for this MP.
If Lakewood sells 5/week and Flatbush sells 2/week, 
Lakewood gets 5/7 = 71% and Flatbush gets 2/7 = 29%.

### The algorithm:

```
For each store:
  velocity = sales of this MP at this store over last 30 days / 4 weeks
  current_stock = store_inventory for this MP at this store
  need = max(0, (velocity × target_weeks) - current_stock)
  
Normalize needs to sum to received_quantity.
Round to integers. Give remainder to highest-velocity store.
```

### Constraints:
- Minimum allocation: 0 (don't send stock to a store that doesn't sell this)
- Reserve: hold back 10% of received quantity for online/restock
- Override: operations can manually adjust before confirming distribution

### Data needed:
- Per-store velocity per MP (from sales table grouped by store + mp_id)
- Per-store current stock (from store_inventory table)
- Both require Bonney to sync per-location inventory from Shopify

### Schema:
The `store_inventory` table already exists but is empty.
Bonney needs to populate it during sync (per-location inventory from Shopify).

### UI:
On PO detail, stage 12 (distribution):
- Show suggested allocation per store (auto-calculated)
- Allow manual adjustment
- "Confirm Distribution" creates transfer orders
- Transfer orders update store_inventory

### Owner:
- Algorithm: Almond (lib/inventory/)
- Sync per-location: Bonney  
- UI: Danny (PO detail, distribution stage)
