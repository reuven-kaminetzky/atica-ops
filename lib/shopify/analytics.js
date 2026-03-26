// ═══════════════════════════════════════════════════════════════
// Order analytics — velocity, sales rollups (plain JS)
// Original: Stallon (TypeScript), compiled by: Nikita
// ═══════════════════════════════════════════════════════════════

function sinceDate(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function buildVelocity(orders, days) {
  const bySku = {};

  for (const order of orders) {
    for (const li of order.line_items) {
      const sku = li.sku || `variant-${li.variant_id}`;
      if (!bySku[sku]) bySku[sku] = { sku, title: li.title, units: 0, revenue: 0 };
      bySku[sku].units += li.quantity;
      bySku[sku].revenue += parseFloat(li.price) * li.quantity;
    }
  }

  return Object.values(bySku)
    .map(v => ({ ...v, unitsPerDay: +(v.units / days).toFixed(2) }))
    .sort((a, b) => b.units - a.units);
}

function buildSalesSummary(orders, days) {
  let totalRevenue = 0;
  let totalUnits = 0;
  const byDay = {};

  for (const order of orders) {
    totalRevenue += parseFloat(order.total_price);
    const day = order.created_at.slice(0, 10);

    if (!byDay[day]) byDay[day] = { date: day, revenue: 0, orders: 0, units: 0 };
    byDay[day].revenue += parseFloat(order.total_price);
    byDay[day].orders++;

    for (const li of order.line_items) {
      totalUnits += li.quantity;
      byDay[day].units += li.quantity;
    }
  }

  const totalOrders = orders.length;
  return {
    days,
    totalRevenue: +totalRevenue.toFixed(2),
    totalOrders,
    totalUnits,
    avgOrderValue: totalOrders ? +(totalRevenue / totalOrders).toFixed(2) : 0,
    dailySales: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

module.exports = { sinceDate, buildVelocity, buildSalesSummary };
