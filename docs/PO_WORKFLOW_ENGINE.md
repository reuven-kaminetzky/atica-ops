# PO Workflow Engine — Design Spec

## Why This Matters

A PO at $7.5M revenue isn't a form submission. It's a 3-4 month process
that touches PD, Finance, Analytics, Warehouse, and Marketing. Each stage
has different owners, required documents, approvals, cash flow impacts,
and deadlines. The current "Create PO" form + "Advance Stage" button
is a toy. This is the real design.

## The Process Flow

```
Analytics shows reorder signal
    ↓
PD creates PO concept (quantity from velocity data)
    ↓ requires: Product Stack is READY
PD builds/confirms tech pack (design → sample → approved)
    ↓ requires: sample photos, PD sign-off
Finance costs the PO (costed)
    ↓ requires: margin check passes, Finance sign-off
PD orders from vendor (ordered)
    ↓ triggers: deposit payment, cash flow commitment
Vendor produces (production → QC)
    ↓ requires: QC report, PD sign-off
Vendor ships (shipped → in_transit)
    ↓ triggers: production payment, shipment tracking
Warehouse receives (received)
    ↓ requires: physical count, damage report
Operations distributes (distribution)
    ↓ triggers: balance payment, store allocations
```

## Stage-by-Stage Requirements

### Stage 1: CONCEPT
**Owner:** PD (triggered by Analytics reorder signal)
**Entry:** Automatic — created from reorder suggestion or manually.
**Required to advance:**
- MP selected (which product)
- Vendor selected (who makes it)
- Target quantity (from velocity × cover weeks)
- Target delivery date
- Product Stack status = READY (see Product Stack spec)

**Cash flow impact:** None yet. Projected only.
**Deadline:** N/A — this is the starting point.

**What the UI shows:**
- Pre-filled from the reorder suggestion (MP, vendor, quantity, FOB)
- Stack completeness indicator — green if ready, red if gaps
- Link to the Product Stack editor for this MP

---

### Stage 2: DESIGN
**Owner:** PD
**Purpose:** For new products: build the tech pack. For reorders: confirm specs unchanged.
**Required to advance:**
- For NEW products: Stack sections Construction + Fit & Sizing must be complete
- For REORDERS: confirmation that specs match previous PO
- Colorways specified for this order (which colors, how many of each)

**Data captured:**
- `po.styles` = JSONB array of { colorway, quantity, sku_prefix }
- `po.design_confirmed_by` = PD person name
- `po.design_confirmed_at` = timestamp
- `po.is_reorder` = boolean (skips some requirements)

**Cash flow impact:** None.
**Deadline:** Target delivery date - lead_days - 14 days (2 weeks for sampling)

---

### Stage 3: SAMPLE
**Owner:** PD
**Purpose:** Vendor produces samples. PD reviews quality.
**Required to advance:**
- Sample request sent to vendor (date recorded)
- Sample received (date recorded)
- Sample photos uploaded (at least 1)
- Sample review notes (fit, quality, color accuracy)

**Data captured:**
- `po.sample_requested_at` = date
- `po.sample_received_at` = date
- `po.sample_images` = TEXT[] (URLs)
- `po.sample_notes` = TEXT
- `po.sample_approved` = boolean

**Cash flow impact:** None.
**Deadline:** Target delivery date - lead_days - 7 days

---

### Stage 4: APPROVED (PD Gate)
**Owner:** PD lead
**Purpose:** PD lead signs off that the product is ready for production.
**Required to advance:**
- Stack completeness ≥ 80%
- Sample approved = true
- Checked by PD lead (name recorded — existing gate)

**Data captured:**
- `po.approved_by` = TEXT (PD lead name)
- `po.approved_at` = TIMESTAMPTZ

**Cash flow impact:** None yet, but Finance is next.
**Deadline:** Target delivery date - lead_days

---

### Stage 5: COSTED (Finance Gate)
**Owner:** Finance
**Purpose:** Finance reviews pricing, calculates margin, approves the spend.
**Required to advance:**
- FOB confirmed (not $0)
- Landed cost calculated (FOB × (1 + duty%) × freight multiplier)
- Margin check: (retail - landed) / retail ≥ minimum threshold
- If margin below threshold: requires Finance override with reason
- Payment schedule generated (deposit + production + balance)
- Checked by Finance person (name recorded — existing gate)

**Data captured:**
- `po.costed_by` = TEXT (Finance person)
- `po.costed_at` = TIMESTAMPTZ
- `po.margin_pct` = NUMERIC (calculated)
- `po.margin_override_reason` = TEXT (if below threshold)
- Payment records auto-generated in po_payments table

**Cash flow impact:** Payment schedule becomes REAL (not projected).
Deposit = 30% due on order. Production = 40% due on shipment.
Balance = 30% due 30 days after delivery.

**Deadline:** Target delivery date - lead_days + 1 day

---

### Stage 6: ORDERED
**Owner:** PD (executes), Finance (payment)
**Purpose:** PO sent to vendor. Deposit paid.
**Required to advance:**
- PI (Proforma Invoice) reference recorded
- Deposit payment status = 'paid' or 'upcoming' with due date

**Data captured:**
- `po.pi_reference` = TEXT (vendor's PI number)
- `po.ordered_at` = TIMESTAMPTZ
- First po_payment (deposit) status → 'upcoming' with due date

**Cash flow impact:** Deposit payment triggers. Shows in cash flow as committed outflow.
**Deadline:** Target delivery date - lead_days

---

### Stage 7: PRODUCTION
**Owner:** PD monitors
**Purpose:** Vendor is manufacturing. PD tracks timeline.
**Required to advance:**
- Production start date recorded
- Expected completion date recorded
- Inline inspection scheduled (for orders > $5,000)

**Data captured:**
- `po.production_started_at` = DATE
- `po.production_expected_at` = DATE
- `po.inline_inspection_date` = DATE (optional, for large orders)

**Cash flow impact:** Production payment schedule becomes 'upcoming'.
**Deadline:** po.production_expected_at

---

### Stage 8: QC (PD Gate)
**Owner:** PD
**Purpose:** Quality control before shipment. PD must sign off.
**Required to advance:**
- QC report uploaded or notes recorded
- Defect rate recorded
- If defect rate > AQL level from Stack: PD must approve with override
- Checked by PD (name recorded — existing gate)

**Data captured:**
- `po.qc_by` = TEXT
- `po.qc_at` = TIMESTAMPTZ
- `po.qc_report_url` = TEXT
- `po.qc_defect_rate` = NUMERIC
- `po.qc_passed` = BOOLEAN
- `po.qc_override_reason` = TEXT (if defect rate > AQL)

**Cash flow impact:** Production payment triggers if not already paid.
**Deadline:** ETD - 3 days

---

### Stage 9: SHIPPED
**Owner:** Logistics / PD
**Purpose:** Goods leave the factory. Container/vessel recorded.
**Required to advance:**
- Container number recorded (or tracking reference)
- ETD set
- ETA calculated

**Data captured:**
- `po.container` = TEXT
- `po.vessel` = TEXT
- `po.etd` = DATE
- `po.eta` = DATE (ETD + transit days)

**Cash flow impact:** Production payment triggers (if on-shipment terms).
**Side effect:** Shipment record auto-created (existing behavior).
**Deadline:** ETD is the deadline itself.

---

### Stage 10: IN TRANSIT
**Owner:** Logistics
**Purpose:** Goods are on the water. Warehouse prepares.
**Required to advance:**
- ETA confirmed or updated
- Warehouse notified (notification sent to warehouse team)

**Data captured:**
- `po.eta_confirmed` = BOOLEAN
- `po.warehouse_notified_at` = TIMESTAMPTZ

**Cash flow impact:** Balance payment becomes 'upcoming' with due date = ETA + 30.
**Side effect:** Warehouse page shows incoming shipment.
**Deadline:** ETA

---

### Stage 11: RECEIVED
**Owner:** Warehouse
**Purpose:** Physical goods arrive. Count and inspect.
**Required to advance:**
- Received date recorded
- Physical count recorded
- Count matches PO quantity (or variance noted)
- Damage report (if any)

**Data captured:**
- `po.received_at` = TIMESTAMPTZ
- `po.received_quantity` = INTEGER
- `po.count_variance` = INTEGER (received - ordered)
- `po.damage_notes` = TEXT
- `po.received_by` = TEXT

**Cash flow impact:** Balance payment due date confirmed.
**Side effect:** Inventory updated (total_inventory on MP).
**Deadline:** N/A — happens when goods arrive.

---

### Stage 12: DISTRIBUTION
**Owner:** Operations / Warehouse
**Purpose:** Allocate received stock to stores.
**Required to advance:** (This is the final stage — no advancement needed)

**Data captured:**
- Distribution plan: { store: quantity } based on weights + per-store velocity
- Transfer orders created for each store
- Balance payment marked 'paid' when payment clears

**Cash flow impact:** Balance payment triggers (30 days after receipt).
**Side effect:** store_inventory updated per location.

---

## Deadlines — Backward Calculation

All deadlines derive from the TARGET DELIVERY DATE:

```
Target delivery date                    = D
  ↑ Distribution (D)                    = D
  ↑ Received (D - 0)                    = D
  ↑ In transit (D - transit_days)       = D - 21 (typical sea freight)
  ↑ Shipped / ETD (D - transit_days)    = D - 21
  ↑ QC (ETD - 3 days)                  = D - 24
  ↑ Production complete                = D - 24 (same as QC)
  ↑ Production start (- lead_days)     = D - 24 - lead_days
  ↑ Ordered                            = D - 24 - lead_days
  ↑ Costed                             = D - 24 - lead_days - 1
  ↑ Approved                           = D - 24 - lead_days - 1
  ↑ Sample                             = D - 24 - lead_days - 7
  ↑ Design                             = D - 24 - lead_days - 14
  ↑ Concept                            = NOW (or earlier)
```

The PO detail page should show:
- Current stage + time spent in this stage
- Deadline for THIS stage (are we on time or late?)
- Timeline bar showing all stages with past/current/future
- Red flags on any stage that's past its deadline

---

## Payment Schedule Mapping

| PO Stage | Payment Triggered | Typical % | Due When |
|----------|-------------------|-----------|----------|
| Ordered | Deposit | 30% | On order |
| Shipped | Production | 40% | On shipment |
| Received + 30d | Balance | 30% | 30 days after delivery |

These percentages come from `po.payment_terms`:
- `standard` = 30/40/30
- `50_50` = 50% on order, 50% on delivery
- `100_upfront` = 100% on order (for small orders)
- `custom` = manually specified

---

## Schema Changes Needed

New columns on `purchase_orders`:
```sql
-- Design stage
is_reorder BOOLEAN DEFAULT false,
design_confirmed_by TEXT,
design_confirmed_at TIMESTAMPTZ,

-- Sample stage
sample_requested_at DATE,
sample_received_at DATE,
sample_images TEXT[] DEFAULT '{}',
sample_notes TEXT DEFAULT '',
sample_approved BOOLEAN DEFAULT false,

-- Approved stage
approved_by TEXT,
approved_at TIMESTAMPTZ,

-- Costed stage
costed_by TEXT,
costed_at TIMESTAMPTZ,
margin_pct NUMERIC(6,2),
margin_override_reason TEXT,

-- Ordered stage
pi_reference TEXT,
ordered_at TIMESTAMPTZ,

-- Production stage
production_started_at DATE,
production_expected_at DATE,
inline_inspection_date DATE,

-- QC stage
qc_by TEXT,
qc_at TIMESTAMPTZ,
qc_report_url TEXT,
qc_defect_rate NUMERIC(5,2),
qc_passed BOOLEAN,
qc_override_reason TEXT,

-- Received stage
received_at TIMESTAMPTZ,
received_quantity INTEGER,
count_variance INTEGER,
damage_notes TEXT,
received_by TEXT,

-- Deadline tracking
target_delivery_date DATE,
current_deadline DATE,
is_overdue BOOLEAN DEFAULT false,

-- Existing fields kept: etd, eta, container, vessel, check_ins
```

---

## UI Design (for Danny)

The PO detail page becomes a **stage-specific workflow view**:

1. **Stage track** at the top (existing — keep it)
2. **Current stage panel** — shows ONLY the fields relevant to THIS stage
   - Concept: MP, vendor, quantity, target date, stack readiness
   - Design: colorway allocation, design confirmation
   - Sample: sample dates, photos, review
   - Approved: PD sign-off
   - Costed: margin calculation, payment schedule, Finance sign-off
   - etc.
3. **Timeline panel** — deadlines, on-time/late indicators
4. **Cash flow impact panel** — this PO's payment schedule with status
5. **History** — who did what, when (from po_stage_history)

The "Advance" button changes label per stage:
- "Submit for Design" → "Request Sample" → "Submit for Approval" → etc.
And it ONLY enables when the required fields are filled.

---

## Implementation Order

1. Peter: This design spec (done)
2. Almond: Migration adding new columns to purchase_orders
3. Almond: Update PO DAL with stage-specific validation
4. Danny: Rebuild PO detail page as stage-specific workflow
5. Danny: Connect cash flow panel to po_payments
6. Bonney: Webhook for inventory update on stage 11 (received)
