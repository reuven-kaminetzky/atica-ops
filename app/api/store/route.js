import { NextResponse } from 'next/server';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get('name') || 'Lakewood';

    const logistics = require('../../../lib/logistics');
    const product = require('../../../lib/product');
    const sc = require('../../../lib/supply-chain');

    const [incomingTransfers, unconfirmed, allProducts, activePOs] = await Promise.all([
      logistics.transfer.getForStore(store).catch(() => []),
      logistics.transfer.getUnconfirmed().catch(() => []),
      product.getAll().catch(() => []),
      sc.po.getActive().catch(() => []),
    ]);

    const stockAlerts = allProducts
      .filter(p => (parseInt(p.total_inventory) || 0) === 0 || (parseInt(p.days_of_stock) || 999) <= 30)
      .slice(0, 10);

    const incomingPOs = activePOs
      .filter(po => po.stage === 'shipped' || po.stage === 'in_transit' || po.stage === 'received')
      .slice(0, 5);

    const needsConfirmation = unconfirmed.filter(t => t.to_location === store);

    return NextResponse.json({
      store,
      incomingTransfers,
      needsConfirmation,
      stockAlerts,
      incomingPOs,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
