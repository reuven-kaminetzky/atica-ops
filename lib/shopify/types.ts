// ═══════════════════════════════════════════════════════════════
// Stallon: Shopify type definitions for Atica Man
// ═══════════════════════════════════════════════════════════════

// ── Raw Shopify API types ──────────────────────────────────────

export interface ShopifyShop {
  id: number;
  name: string;
  domain: string;
  email: string;
  plan_name: string;
  plan_display_name: string;
  currency: string;
  created_at: string;
}

export interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  sku: string;
  price: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  inventory_item_id: number;
  inventory_quantity: number;
  weight: number;
  weight_unit: string;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOption {
  id: number;
  product_id: number;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyImage {
  id: number;
  product_id: number;
  src: string;
  alt: string | null;
  position: number;
  width: number;
  height: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string;
  product_type: string;
  status: string;
  tags: string;
  options: ShopifyOption[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  created_at: string;
  updated_at: string;
}

export interface ShopifyLineItem {
  id: number;
  product_id: number;
  variant_id: number;
  title: string;
  variant_title: string;
  sku: string;
  quantity: number;
  price: string;
  total_discount: string;
}

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
}

export interface ShopifyAddress {
  city: string;
  province: string;
  country: string;
  zip: string;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  email: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  shipping_address: ShopifyAddress | null;
  created_at: string;
  closed_at: string | null;
  source_name: string;
}

export interface ShopifyLocation {
  id: number;
  name: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  active: boolean;
}

export interface ShopifyInventoryLevel {
  inventory_item_id: number;
  location_id: number;
  available: number;
  updated_at: string;
}

export interface ShopifyWebhook {
  id: number;
  topic: string;
  address: string;
  format: string;
}

// ── Mapped Atica types ─────────────────────────────────────────

export interface AticaVariant {
  variantId: number;
  sku: string;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  price: string;
  inventoryItemId: number;
  inventoryQty: number;
}

export interface AticaProduct {
  shopifyId: number;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  status: string;
  tags: string;
  options: { name: string; values: string[] }[];
  variants: AticaVariant[];
  images: { id: number; src: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface AticaLineItem {
  sku: string;
  title: string;
  variantTitle: string;
  quantity: number;
  price: string;
  productId: number;
  variantId: number;
}

export interface AticaCustomer {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  ordersCount: number;
  totalSpent: string;
}

export interface AticaOrder {
  shopifyId: number;
  name: string;
  email: string;
  totalPrice: string;
  subtotalPrice: string;
  totalTax: string;
  totalDiscount: string;
  currency: string;
  financialStatus: string;
  fulfillmentStatus: string | null;
  lineItems: AticaLineItem[];
  customer: AticaCustomer | null;
  shippingAddress: { city: string; province: string; country: string; zip: string } | null;
  createdAt: string;
  closedAt: string | null;
}

export interface AticaLedgerEntry {
  date: string;
  orderId: number;
  orderName: string;
  customer: string;
  subtotal: string;
  tax: string;
  discount: string;
  total: string;
  items: number;
  status: string;
}

export interface AticaSKU {
  shopifyProductId: number;
  shopifyVariantId: number;
  sku: string;
  productTitle: string;
  variantTitle: string;
  price: string;
  inventoryItemId: number;
}

export interface AticaInventoryLocation {
  locationId: number;
  locationName: string;
  levels: {
    inventoryItemId: number;
    available: number;
    updatedAt: string;
  }[];
}

export interface VelocityEntry {
  sku: string;
  title: string;
  units: number;
  revenue: number;
  unitsPerDay: number;
}

export interface DailySales {
  date: string;
  revenue: number;
  orders: number;
  units: number;
}

export interface SalesSummary {
  days: number;
  totalRevenue: number;
  totalOrders: number;
  totalUnits: number;
  avgOrderValue: number;
  dailySales: DailySales[];
}

export interface SnapshotProduct {
  id: number;
  title: string;
  totalInventory: number;
  variants: {
    sku: string;
    title: string;
    inventory: number;
    price: string;
  }[];
}

// ── Product Tree (MP → Style → Fit → Size) ────────────────────

export interface FitNode {
  name: string;
  variants: AticaVariant[];
  totalQty: number;
  sizes: string[];
}

export interface StyleNode {
  name: string;
  color: string;
  sku: string;
  fits: FitNode[];
  totalQty: number;
  price: number;
}

export interface ProductTree {
  shopifyId: number;
  title: string;
  handle: string;
  productType: string;
  styles: StyleNode[];
  totalQty: number;
  optionNames: string[];
}

// ── Client config ──────────────────────────────────────────────

export interface ShopifyClientConfig {
  shop: string;
  accessToken: string;
  apiVersion?: string;
}

export interface ConnectionStatus {
  connected: boolean;
  shop?: string;
  domain?: string;
  plan?: string;
  currency?: string;
  message?: string;
}
