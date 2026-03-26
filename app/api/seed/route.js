import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { neon } = require('@netlify/neon');
    const { MP_SEEDS } = require('../../../lib/products');
    const sql = neon();

    const vendorMap = {};
    for (const mp of MP_SEEDS) {
      if (mp.vendor) {
        const vid = mp.vendor.toLowerCase().replace(/\s+/g, '-');
        if (!vendorMap[vid]) vendorMap[vid] = { id: vid, name: mp.vendor, country: mp.country, categories: [] };
        if (!vendorMap[vid].categories.includes(mp.cat)) vendorMap[vid].categories.push(mp.cat);
      }
    }

    let vendorCount = 0;
    for (const v of Object.values(vendorMap)) {
      try {
        await sql`INSERT INTO vendors (id, name, country, categories) VALUES (${v.id}, ${v.name}, ${v.country || null}, ${v.categories}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, categories = EXCLUDED.categories`;
        vendorCount++;
      } catch (e) { /* skip */ }
    }

    let mpCount = 0;
    for (const mp of MP_SEEDS) {
      const vid = mp.vendor ? mp.vendor.toLowerCase().replace(/\s+/g, '-') : null;
      try {
        await sql`INSERT INTO master_products (id, name, code, category, vendor_id, fob, retail, duty, hts, lead_days, moq, country, sizes, fits, features, phase) VALUES (${mp.id}, ${mp.name}, ${mp.code}, ${mp.cat}, ${vid}, ${mp.fob || 0}, ${mp.retail || 0}, ${mp.duty || 0}, ${mp.hts || null}, ${mp.lead || 0}, ${mp.moq || 0}, ${mp.country || null}, ${mp.sizes || null}, ${mp.fits || []}, ${mp.features || []}, 'in_store') ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, fob = EXCLUDED.fob, retail = EXCLUDED.retail`;
        mpCount++;
      } catch (e) { /* skip */ }
    }

    let stackCount = 0;
    for (const mp of MP_SEEDS) {
      try { await sql`INSERT INTO product_stack (mp_id) VALUES (${mp.id}) ON CONFLICT DO NOTHING`; stackCount++; } catch (e) { /* skip */ }
    }

    return NextResponse.json({ seeded: true, vendors: vendorCount, products: mpCount, stacks: stackCount });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
