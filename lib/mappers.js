/**
 * Shopify → Atica data mappers
 * Clean transforms from Shopify's snake_case API to our camelCase models
 */

const mapVariant = v => ({
  variantId:       v.id,
  sku:             v.sku,
  title:           v.title,
  price:           v.price,
  inventoryItemId: v.inventory_item_id,
  inventoryQty:    v.inventory_quantity,
});

const mapProduct = p => ({
  shopifyId:   p.id,
  title:       p.title,
  handle:      p.handle,
  vendor:      p.vendor,
  productType: p.product_type,
  status:      p.status,
  tags:        p.tags,
  variants:    p.variants.map(mapVariant),
  images:      p.images.map(i => ({ id: i.id, src: i.src })),
  createdAt:   p.created_at,
  updatedAt:   p.updated_at,
});

const mapLineItem = li => ({
  sku:          li.sku,
  title:        li.title,
  variantTitle: li.variant_title,
  quantity:     li.quantity,
  price:        li.price,
  productId:    li.product_id,
  variantId:    li.variant_id,
});

const mapCustomer = c => c ? ({
  id:          c.id,
  email:       c.email,
  firstName:   c.first_name,
  lastName:    c.last_name,
  ordersCount: c.orders_count,
  totalSpent:  c.total_spent,
}) : null;

const mapAddress = a => a ? ({
  city:     a.city,
  province: a.province,
  country:  a.country,
  zip:      a.zip,
}) : null;

const mapOrder = o => ({
  shopifyId:         o.id,
  name:              o.name,
  email:             o.email,
  totalPrice:        o.total_price,
  subtotalPrice:     o.subtotal_price,
  totalTax:          o.total_tax,
  totalDiscount:     o.total_discounts,
  currency:          o.currency,
  financialStatus:   o.financial_status,
  fulfillmentStatus: o.fulfillment_status,
  lineItems:         o.line_items.map(mapLineItem),
  customer:          mapCustomer(o.customer),
  shippingAddress:   mapAddress(o.shipping_address),
  createdAt:         o.created_at,
  closedAt:          o.closed_at,
});

const mapLedgerEntry = o => ({
  date:      o.created_at.slice(0, 10),
  orderId:   o.id,
  orderName: o.name,
  customer:  o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : 'Guest',
  subtotal:  o.subtotal_price,
  tax:       o.total_tax,
  discount:  o.total_discounts,
  total:     o.total_price,
  items:     o.line_items.length,
  status:    o.financial_status,
});

const mapSnapshotProduct = p => ({
  id:             p.id,
  title:          p.title,
  totalInventory: p.variants.reduce((sum, v) => sum + (v.inventory_quantity || 0), 0),
  variants:       p.variants.map(v => ({
    sku:       v.sku,
    title:     v.title,
    inventory: v.inventory_quantity,
    price:     v.price,
  })),
});

const mapSKU = (product, variant) => ({
  shopifyProductId: product.id,
  shopifyVariantId: variant.id,
  sku:              variant.sku || '',
  productTitle:     product.title,
  variantTitle:     variant.title,
  price:            variant.price,
  inventoryItemId:  variant.inventory_item_id,
});

module.exports = {
  mapProduct,
  mapVariant,
  mapOrder,
  mapLineItem,
  mapCustomer,
  mapAddress,
  mapLedgerEntry,
  mapSnapshotProduct,
  mapSKU,
};
