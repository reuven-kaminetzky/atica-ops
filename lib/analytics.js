/**
 * Order analytics — velocity, sales rollups, daily aggregation
 * Shared logic used by multiple Shopify endpoints
 */

function sinceDate(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function buildVelocity(orders, days) {
  const bySku = {};
  for (const order of orders) {
    for (const li of order.line_items) {
      const sku = li.sku || `variant-${li.variant_id}`;
      const entry = bySku[sku] || (bySku[sku] = { sku, title: li.title, units: 0, revenue: 0 });
      entry.units += li.quantity;
      entry.revenue += parseFloat(li.price) * li.quantity;
    }
  }
  return Object.values(bySku)
    .map(v => ({ ...v, unitsPerDay: +(v.units / days).toFixed(2) }))
    .sort((a, b) => b.units - a.units);
}

function buildSalesSummary(orders, days) {
  let totalRevenue = 0, totalUnits = 0;
  const byDay = {};

  for (const order of orders) {
    totalRevenue += parseFloat(order.total_price);
    const day = order.created_at.slice(0, 10);
    const bucket = byDay[day] || (byDay[day] = { date: day, revenue: 0, orders: 0, units: 0 });
    bucket.revenue += parseFloat(order.total_price);
    bucket.orders++;
    for (const li of order.line_items) {
      totalUnits += li.quantity;
      bucket.units += li.quantity;
    }
  }

  const totalOrders = orders.length;
  return {
    days,
    totalRevenue:  +totalRevenue.toFixed(2),
    totalOrders,
    totalUnits,
    avgOrderValue: totalOrders ? +(totalRevenue / totalOrders).toFixed(2) : 0,
    dailySales:    Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

module.exports = { sinceDate, buildVelocity, buildSalesSummary };
