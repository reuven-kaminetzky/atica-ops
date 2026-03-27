# Product Hierarchy & Grouping Structure

## The Hierarchy (top to bottom)

Product Type → Master Product → Style → Fit → Size → Length → SKU

### 1. Product Type
Broadest category. Suits, Shirts, Pants, Blazers, Kapote, Boys, Accessories.
"How are we doing in Suits" is a product-type question.

### 2. Master Product (MP)
One factory spec sheet. One FOB, one HTS, one duty, one lead time, one vendor.
HC360 and HC480 are different MPs — same product type (Suits), different
constructions, different price points.

Every MP belongs to exactly one product type. A PO is placed against an MP.

### 3. Style (MISSING FROM CURRENT MODEL)
A colorway of an MP. Same construction, different fabric color or pattern.
One style = one Shopify product listing = one set of SKUs.

Example under HC360: Navy solid, Charcoal herringbone, Lt. grey glen plaid.

THIS IS THE LEVEL WE'RE LOSING. Currently matchProduct maps Shopify → MP
and collapses all styles. We can't answer "which colorway to reorder" or
"how is Navy doing across all suits."

### 4. Fit
Silhouette or body cut within a style.
Suits: Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2
Shirts: Modern (Extra Slim), Contemporary (Slim), Classic
Pants: Slim, Regular, Relaxed

### 5. Size
Numeric measurement. Meaning varies by product type:
Suits = chest (36, 38, 40...), Shirts = neck (15, 15.5, 16...),
Pants = waist (32, 34, 36...)

### 6. Length
Inseam or body length. Suits = S/R/L suffix (38S, 38R, 38L).
Pants = inseam measurement. Currently baked into size codes.

## Cross-Cutting Dimensions (not nested)

### Grade (at style level)
How core a style is. Drives depth of buy, reorder priority, floor space.
Same color can have same grade across different MPs within a product type.
NEED FROM REUVEN: What are the actual grade names?

### Color (cross-MP within product type)
Groups styles that share a color identity across MPs.
Navy HC360 + Navy HC480 + Navy Washable = all "Navy" within Suits.
Lets you ask "how is Navy doing across the whole Suits range."
Color groups are per product type, not global.

## What This Means for the Data Model

Current: master_products → (many Shopify products collapse into one MP)
Needed:  master_products → styles → (each style = one Shopify product)

The styles table needs:
  - id (Shopify product ID or slug)
  - mp_id (FK to master_products)
  - name (the colorway name: "Navy Solid", "Charcoal Herringbone")
  - shopify_product_id
  - hero_image
  - grade (Core/Shoulder/Test/Seasonal — TBD from Reuven)
  - color_group (Navy, Charcoal, Grey — TBD from Reuven)
  - status (active, discontinued, seasonal)

## Questions for Reuven (BLOCKING)

1. Fit names per product type — are the current ones correct?
2. Grade names — Core/Shoulder/Test/Seasonal or different?
3. Color group names — formal list or inferred from titles?
4. HC360/HC480 price split — still $400?
5. FOB changes since seeds?
6. New Shopify products without matchers?
7. Londoner + Bengal stripe rule — enforced where?
