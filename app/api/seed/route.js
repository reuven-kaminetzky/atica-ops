import { NextResponse } from 'next/server';
// DB connection via dal

export async function POST() {
  try {
    const { MP_SEEDS } = require('../../../lib/products');
    const { sql } = require('../../../lib/dal/db');
    const db = sql();

    // Clean old data before reseeding
    await db`DELETE FROM product_stack`;
    await db`DELETE FROM master_products`;
    await db`DELETE FROM vendors`;

    // Extract vendors
    const vendorMap = {};
    for (const mp of MP_SEEDS) {
      if (mp.vendor) {
        const vid = mp.vendor.toLowerCase().replace(/\s+/g, '-');
        if (!vendorMap[vid]) vendorMap[vid] = { id: vid, name: mp.vendor, country: mp.country || null, categories: [] };
        if (!vendorMap[vid].categories.includes(mp.cat)) vendorMap[vid].categories.push(mp.cat);
      }
    }

    let vendorCount = 0;
    const vendorErrors = [];
    for (const v of Object.values(vendorMap)) {
      try {
        await db`INSERT INTO vendors (id, name, country, categories) 
          VALUES (${v.id}, ${v.name}, ${v.country}, ${v.categories}) 
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, categories = EXCLUDED.categories`;
        vendorCount++;
      } catch (e) {
        vendorErrors.push({ id: v.id, error: e.message.slice(0, 150) });
      }
    }

    let mpCount = 0;
    const mpErrors = [];
    for (const mp of MP_SEEDS) {
      const vid = mp.vendor ? mp.vendor.toLowerCase().replace(/\s+/g, '-') : null;
      try {
        await db`INSERT INTO master_products (
          id, name, code, category, vendor_id, 
          fob, retail, duty, hts, 
          lead_days, moq, country, 
          sizes, fits, features, phase
        ) VALUES (
          ${mp.id}, ${mp.name}, ${mp.code}, ${mp.cat}, ${vid}, 
          ${mp.fob || 0}, ${mp.retail || 0}, ${mp.duty || 0}, ${mp.hts || null}, 
          ${mp.lead || 0}, ${mp.moq || 0}, ${mp.country || null}, 
          ${mp.sizes || null}, ${mp.fits || []}, ${mp.features || []}, 
          ${'in_store'}
        ) ON CONFLICT (id) DO UPDATE SET 
          name = EXCLUDED.name, fob = EXCLUDED.fob, retail = EXCLUDED.retail,
          code = EXCLUDED.code, category = EXCLUDED.category, vendor_id = EXCLUDED.vendor_id`;
        mpCount++;
      } catch (e) {
        mpErrors.push({ id: mp.id, error: e.message.slice(0, 150) });
      }
    }

    let stackCount = 0;
    for (const mp of MP_SEEDS) {
      try {
        await db`INSERT INTO product_stack (mp_id) VALUES (${mp.id}) ON CONFLICT DO NOTHING`;
        stackCount++;
      } catch (e) { /* ok */ }
    }

    return NextResponse.json({ 
      seeded: true, vendors: vendorCount, products: mpCount, stacks: stackCount,
      totalSeeds: MP_SEEDS.length, vendorErrors: vendorErrors.slice(0, 5), mpErrors: mpErrors.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
