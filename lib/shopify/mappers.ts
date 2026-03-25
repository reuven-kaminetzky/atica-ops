// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify → Atica data mappers
// ═══════════════════════════════════════════════════════════════

import type {
  ShopifyProduct, ShopifyOrder, ShopifyVariant, ShopifyLineItem,
  ShopifyCustomer, ShopifyAddress,
  AticaProduct, AticaOrder, AticaVariant, AticaLineItem,
  AticaCustomer, AticaLedgerEntry, AticaSKU, SnapshotProduct,
  ProductTree, StyleNode, FitNode,
} from './types';

// ── Fit detection ─────────────────────────────────────────────

const FIT_NAMES = /^(lorenzo\s*\d*|alexander\s*\d*|classic|modern|slim|regular|relaxed|tailored|standard|athletic|comfort|straight|traditional|contemporary|fitted|narrow|wide|pleated)(\s+.*)?$/i;
const SIZE_PAT = /^(\d{1,2}[xX]\d{2}|\d{2}[SRLT]|[xX]{0,2}[sSmMlLxX]{1,3}[lL]?|\d{2,3}(\.\d)?(\/\d+)?|one\s*size)$/i;

function isFitName(s: string): boolean {
  return FIT_NAMES.test(s.trim());
}

function isSizeName(s: string): boolean {
  return SIZE_PAT.test(s.trim());
}

// ── Variant mapper ────────────────────────────────────────────

export function mapVariant(v: ShopifyVariant): AticaVariant {
  return {
    variantId: v.id,
    sku: v.sku || '',
    title: v.title,
    option1: v.option1 || null,
    option2: v.option2 || null,
    option3: v.option3 || null,
    price: v.price,
    inventoryItemId: v.inventory_item_id,
    inventoryQty: v.inventory_quantity,
  };
}

// ── Product mapper ────────────────────────────────────────────

export function mapProduct(p: ShopifyProduct): AticaProduct {
  return {
    shopifyId: p.id,
    title: p.title,
    handle: p.handle,
    vendor: p.vendor,
    productType: p.product_type,
    status: p.status,
    tags: p.tags,
    options: (p.options || []).map(o => ({ name: o.name, values: o.values })),
    variants: p.variants.map(mapVariant),
    images: p.images.map(i => ({ id: i.id, src: i.src })),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// ── Order mappers ─────────────────────────────────────────────

export function mapLineItem(li: ShopifyLineItem): AticaLineItem {
  return {
    sku: li.sku,
    title: li.title,
    variantTitle: li.variant_title,
    quantity: li.quantity,
    price: li.price,
    productId: li.product_id,
    variantId: li.variant_id,
  };
}

function mapCustomer(c: ShopifyCustomer | null): AticaCustomer | null {
  if (!c) return null;
  return {
    id: c.id,
    email: c.email,
    firstName: c.first_name,
    lastName: c.last_name,
    ordersCount: c.orders_count,
    totalSpent: c.total_spent,
  };
}

function mapAddress(a: ShopifyAddress | null) {
  if (!a) return null;
  return { city: a.city, province: a.province, country: a.country, zip: a.zip };
}

export function mapOrder(o: ShopifyOrder): AticaOrder {
  return {
    shopifyId: o.id,
    name: o.name,
    email: o.email,
    totalPrice: o.total_price,
    subtotalPrice: o.subtotal_price,
    totalTax: o.total_tax,
    totalDiscount: o.total_discounts,
    currency: o.currency,
    financialStatus: o.financial_status,
    fulfillmentStatus: o.fulfillment_status,
    sourceName: o.source_name || null,
    lineItems: o.line_items.map(mapLineItem),
    customer: mapCustomer(o.customer),
    shippingAddress: mapAddress(o.shipping_address),
    createdAt: o.created_at,
    closedAt: o.closed_at,
  };
}

// ── Ledger mapper ─────────────────────────────────────────────

export function mapLedgerEntry(o: ShopifyOrder): AticaLedgerEntry {
  return {
    date: o.created_at.slice(0, 10),
    orderId: o.id,
    orderName: o.name,
    customer: o.customer
      ? `${o.customer.first_name} ${o.customer.last_name}`
      : 'Guest',
    subtotal: o.subtotal_price,
    tax: o.total_tax,
    discount: o.total_discounts,
    total: o.total_price,
    items: o.line_items.length,
    status: o.financial_status,
  };
}

// ── Snapshot mapper ───────────────────────────────────────────

export function mapSnapshotProduct(p: ShopifyProduct): SnapshotProduct {
  return {
    id: p.id,
    title: p.title,
    totalInventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
    variants: p.variants.map(v => ({
      sku: v.sku,
      title: v.title,
      inventory: v.inventory_quantity,
      price: v.price,
    })),
  };
}

// ── SKU mapper ────────────────────────────────────────────────

export function mapSKU(product: ShopifyProduct, variant: ShopifyVariant): AticaSKU {
  return {
    shopifyProductId: product.id,
    shopifyVariantId: variant.id,
    sku: variant.sku || '',
    productTitle: product.title,
    variantTitle: variant.title,
    price: variant.price,
    inventoryItemId: variant.inventory_item_id,
  };
}

// ═══════════════════════════════════════════════════════════════
// Product Tree mapper — builds MP → Style → Fit → Size hierarchy
// This is the core of the Atica product model on Shopify
//
// Suits:  4 fits (Lorenzo 6, Lorenzo 4, Alexander 4, Alexander 2)
// Shirts: 3 fits (Modern/Extra Slim, Contemporary/Slim, Classic)
// Pants:  2-3 fits (Slim, Regular, Relaxed)
// ═══════════════════════════════════════════════════════════════

export function buildProductTree(product: ShopifyProduct): ProductTree {
  const options = product.options || [];
  const optionNames = options.map(o => o.name);

  // Determine which option index holds Color, Fit, Size
  const colorIdx = options.findIndex(o => /color|colour|fabric|style/i.test(o.name));
  const fitIdx = options.findIndex(o => /fit/i.test(o.name));
  const sizeIdx = options.findIndex(o => /size/i.test(o.name));

  const styles: Record<string, StyleNode> = {};

  for (const v of product.variants) {
    const parts = (v.title || '').split(' / ').map(s => s.trim());

    // Extract color (style), fit, size from variant title parts
    let colorName = 'Default';
    let fitName = '—';
    let sizeName = 'OS';

    if (colorIdx >= 0 && parts[colorIdx]) {
      colorName = parts[colorIdx];
    } else {
      // Heuristic: first part that isn't a fit or size
      const colorParts = parts.filter(p => !isFitName(p) && !isSizeName(p));
      colorName = colorParts[0] || parts[0] || 'Default';
    }

    if (fitIdx >= 0 && parts[fitIdx]) {
      fitName = parts[fitIdx];
    } else {
      // Heuristic: find fit in parts
      const fitPart = parts.find(p => isFitName(p));
      if (fitPart) fitName = fitPart;
    }

    if (sizeIdx >= 0 && parts[sizeIdx]) {
      sizeName = parts[sizeIdx];
    } else {
      // Heuristic: find size in parts
      const sizePart = parts.find(p => isSizeName(p));
      if (sizePart) sizeName = sizePart;
    }

    // Build style node
    if (!styles[colorName]) {
      styles[colorName] = {
        name: colorName,
        color: guessColor(colorName),
        sku: v.sku || '',
        fits: [],
        totalQty: 0,
        price: parseFloat(v.price) || 0,
      };
    }
    const style = styles[colorName];
    style.totalQty += v.inventory_quantity || 0;

    // Find or create fit node
    let fit = style.fits.find(f => f.name === fitName);
    if (!fit) {
      fit = { name: fitName, variants: [], totalQty: 0, sizes: [] };
      style.fits.push(fit);
    }
    fit.variants.push(mapVariant(v));
    fit.totalQty += v.inventory_quantity || 0;
    if (!fit.sizes.includes(sizeName)) fit.sizes.push(sizeName);
  }

  const styleList = Object.values(styles);
  const totalQty = styleList.reduce((s, st) => s + st.totalQty, 0);

  return {
    shopifyId: product.id,
    title: product.title,
    handle: product.handle,
    productType: product.product_type,
    styles: styleList,
    totalQty,
    optionNames,
  };
}

// ── Color heuristic for style swatches ────────────────────────

function guessColor(name: string): string {
  const n = name.toLowerCase();
  const map: Record<string, string> = {
    'white': '#f8f6f0', 'black': '#1a1a1a', 'navy': '#1a2a4a',
    'charcoal': '#4a4a4a', 'grey': '#8a8a8a', 'gray': '#8a8a8a',
    'blue': '#2a5a8a', 'light blue': '#a8c8e8', 'sky': '#a0c8e8',
    'burgundy': '#6a1a2a', 'brown': '#6a4020', 'cognac': '#a06830',
    'khaki': '#c4a870', 'tan': '#c8a878', 'beige': '#d4c8a8',
    'red': '#a82020', 'green': '#2a5a2a', 'olive': '#5a6a3a',
    'pink': '#e8a0a0', 'lavender': '#c0a8d0', 'purple': '#5a3a8a',
    'cream': '#f4f0e4', 'ivory': '#f8f4e8', 'silver': '#b0b0b0',
    'gold': '#c4a060', 'stripe': '#3a5a7a', 'plaid': '#5a6a78',
    'herringbone': '#6a6a6a', 'check': '#4a5a6a',
  };
  for (const [key, color] of Object.entries(map)) {
    if (n.includes(key)) return color;
  }
  // Hash-based fallback
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 35%, 40%)`;
}
