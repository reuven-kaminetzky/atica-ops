# Intelligence Layer — Vendor Scoring + Grade Computation

## Vendor Scoring

### Purpose
Rate vendor performance from PO data. Drives vendor selection
for future POs. Shows which vendors are reliable vs problematic.

### Metrics (all computed from PO history)

| Metric | Formula | Weight |
|--------|---------|--------|
| On-time delivery | POs delivered by ETA / total POs | 30% |
| Lead time accuracy | AVG(actual_days - quoted_lead_days) | 20% |
| QC pass rate | POs where qc_passed = true / total QC'd | 25% |
| Count accuracy | AVG(received_quantity / ordered_quantity) | 15% |
| Communication | Manual rating (1-5) by PD | 10% |

### Score = weighted average → 0-100

| Score | Tier | Meaning |
|-------|------|---------|
| 90+ | Gold | Preferred. First choice for new orders. |
| 70-89 | Silver | Reliable. Standard terms. |
| 50-69 | Bronze | Issues. Monitor closely. |
| < 50 | Watch | Consider alternatives. Flag to Reuven. |

### Data needed
- PO `eta` vs actual `received_at` (on-time calculation)
- PO `lead_days` vs actual production time
- PO `qc_passed` (from PO workflow stage 8)
- PO `received_quantity` vs `units` (count accuracy)
- Manual communication rating (new field on vendors table)

### Schema changes
```sql
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS
  score_cache JSONB DEFAULT '{}',  -- cached scoring data
  communication_rating INTEGER DEFAULT 3,  -- 1-5 manual
  last_scored_at TIMESTAMPTZ;
```

### DAL method
```javascript
// lib/dal/vendors.js
async computeScore(vendorId) {
  // Query completed POs for this vendor
  // Compute each metric
  // Return weighted score + tier
}
```

### Trigger
Recompute vendor score when:
- PO advances to 'received' (delivery data available)
- PO advances past 'qc' (quality data available)
- Manual communication rating updated

### Owner
- Schema + DAL: Almond
- PO stage triggers: Almond (in advanceStage side effects)
- Display: Danny (vendor detail page, PO creation vendor picker)

---

## Grade Computation (A/B/C/D per Style)

### Purpose
Rate each style (colorway) based on sales performance.
Drives reorder decisions: reorder Grade A heavily, reduce Grade D.

### Current state
`styles.grade` defaults to 'B'. No computation. Manual assignment.

### Target
Compute grade from actual sales velocity and sell-through.

### Algorithm

For each style:
```
velocity = units sold in last 90 days / 13 weeks
sell_through = units sold / (units sold + current stock) × 100

if (velocity ≥ 2/week AND sell_through ≥ 60%): grade = 'A'  // star performer
if (velocity ≥ 1/week AND sell_through ≥ 40%): grade = 'B'  // solid
if (velocity ≥ 0.3/week AND sell_through ≥ 20%): grade = 'C'  // slow but moving
else: grade = 'D'  // dead stock, markdown candidate
```

### Thresholds are configurable
Store in `app_settings`:
```json
{
  "grade_thresholds": {
    "A": { "min_velocity": 2, "min_sell_through": 60 },
    "B": { "min_velocity": 1, "min_sell_through": 40 },
    "C": { "min_velocity": 0.3, "min_sell_through": 20 }
  }
}
```

### Data needed
- Per-style sales velocity (from sales table grouped by style_id)
- Per-style current stock (from styles.inventory)
- Currently: sales table has `style_id` column but Bonney doesn't
  populate it during sync (only mp_id). Need to match line items
  to styles by title/SKU.

### Trigger
Recompute grades:
- After sync completes (daily)
- Grades stored on styles.grade (already exists)
- Optional: grade history for trend analysis

### Impact on reorders
- Grade A: reorder at 16-week cover (current default)
- Grade B: reorder at 12-week cover
- Grade C: reorder at 8-week cover
- Grade D: don't reorder. Flag for markdown.

### Owner
- Algorithm + DAL: Almond
- Sales-to-style matching: Bonney (during sync)
- Display: Danny (product detail, analytics Group By Grade)

---

## Implementation Priority

Neither of these should block current work. They enhance
decision-making once the basics work (sync, POs, cash flow).

| Feature | Requires | Priority |
|---------|----------|----------|
| Vendor scoring | Completed POs with dates | After first PO cycle completes |
| Grade computation | Sales-to-style matching | After sales sync is verified |
