# Shopify Data Reality — What the Actual Data Looks Like

Source: Reuven's Shopify exports (March 2026)
- Inventory export (variant-level with locations)
- Sales by product variant SKU (1 year)

## Option Structures (from real Shopify data)

| Product Type | Option 1 | Option 2 | Option 3 | Example |
|---|---|---|---|---|
| Suits | Fit | Size | Length | Alexander / Drop 4 / 32 / Short |
| Dress Shirts | Fit | Size | Sleeve Length | Modern (Extra Slim) / 15.5 / Medium (32-33) |
| Dress Shirts (old) | Size | Sleeve Length | — | 14.5 / Medium (32-33) |
| Pants | Fit | Size | — | (Slim / 32) |
| Accessories | Color | Size | — | Black/Navy / One Size |

**CRITICAL: Dress shirts HAVE 3 options, not 2.**
Sleeve Length = Short (30-31), Medium (32-33), Long (34-35), Extra Long (36-37)

## Fit Values (from real data)

**Suits:** Alexander / Drop 4, Alexander / Drop 2, Lorenzo / Drop 6, Lorenzo / Drop 4
**Shirts:** Classic, Classic No Pocket, Classic With Pocket, Contemporary (Slim), Modern (Extra Slim), Modern (Extra slim), Modern
**Pants:** Slim, Regular, Relaxed

**NOTE:** Inconsistent capitalization in Shopify: "Extra Slim" vs "Extra slim". The sync regex must be case-insensitive.

## Size Values

**Suits:** 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52 (chest measurement)
**Shirts:** 13.5, 14, 14.5, 15, 15.5, 16, 16.5, 17, 17.5, 18, 18.5, 19 (collar, half-inch increments)
**Pants:** 28, 29, 30, 31, 32, 33, 34, 36, 38, 40 (waist)
**Accessories:** One Size, S, M, L, XL

## Length Values

**Suits:** Short, Regular, Long
**Shirts:** Short (30-31), Medium (32-33), Long (34-35), Extra Long (36-37)
  Note: Some products use "/" separator: Medium (32/33)
  Note: Some products use different ranges: Medium (33-34)
**Pants:** No length option in data

## Shopify Location Names → Our Codes

| Shopify Name | Our Code | Notes |
|---|---|---|
| Lakewood - Flagship | LKW | Main store, ~30% of sales |
| AveJ | FLT | Flatbush / Avenue J location |
| Crown Heights | CRH | |
| Monsey | MNS | |
| Main Warehouse | WH | Receiving and distribution center |
| Studio (internal) | WH | Maps to warehouse |
| (Online — no physical location) | ONL | Shopify online orders |

**BUG FOUND AND FIXED:** "AveJ" was not in the location mapping. 
Flatbush inventory would have been silently skipped during sync.

## SKU Encoding (from real SKUs)

Format: `@{YY}{Collection}{Fit}{Sleeve}{Size}`

Examples:
- `@15C3COB145` = @15 + C3 + CO(Contemporary) + B(Medium) + 145(14.5)
- `16E3MOA14` = 16 + E3 + MO(Modern) + A(Short) + 14
- `16E3CLB16` = 16 + E3 + CL(Classic) + B(Medium) + 16

Fit codes: CO=Contemporary, MO=Modern, CL=Classic
Sleeve codes: A=Short, B=Medium, C=Long, (D=Extra Long?)

## Sales Data Summary (last 12 months)

- 480 unique variant/SKU combinations in the sales report
- 86 variants are 2-part (Size / SleeveLength) — older single-fit products
- 394 variants are 3-part (Fit / Size / SleeveLength) — current products
- Data shows significant returns (negative net items sold on some variants)

## What This Means for the Sync

The sync's option regex (`/fit|drop|style/`, `/size/`, `/length|inseam/`) 
correctly handles all three structures. The option NAMES in Shopify are 
consistent: "Fit", "Size", "Length". The option VALUES vary (see above).

The sync must handle:
1. Products with 3 options (suits, dress shirts) → fit + size + length
2. Products with 2 options (pants, older shirts) → fit + size OR size + length
3. Products with 2 options (accessories) → color + size
4. Case-insensitive matching for fit values
5. Sleeve length formatting inconsistency (32-33 vs 32/33 vs 33-34)
