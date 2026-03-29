import { NextResponse } from 'next/server';
// DB connection via dal

export async function POST(request) {
  try {
    const { requireAuth } = require('../../../lib/auth');
    await requireAuth(request, 'admin');

    // Extra guard: destructive endpoint requires confirmation header
    if (request.headers.get('x-confirm-destructive') !== 'true') {
      return NextResponse.json({
        error: 'Destructive operation. Pass header X-Confirm-Destructive: true',
        warning: 'This will delete and re-seed all master products, vendors, and product stacks.',
      }, { status: 400 });
    }

    const { MP_SEEDS } = require('../../../lib/products');
    const { sql } = require('../../../lib/dal/db');
    const db = sql();

    // Extract vendors from seeds
    const vendorMap = {};
    for (const mp of MP_SEEDS) {
      if (mp.vendor) {
        const vid = mp.vendor.toLowerCase().replace(/\s+/g, '-');
        if (!vendorMap[vid]) vendorMap[vid] = { id: vid, name: mp.vendor, country: mp.country || null, categories: [] };
        if (!vendorMap[vid].categories.includes(mp.cat)) vendorMap[vid].categories.push(mp.cat);
      }
    }

    // Upsert vendors
    let vendorCount = 0;
    const vendorErrors = [];
    for (const v of Object.values(vendorMap)) {
      try {
        await db`INSERT INTO vendors (id, name, country, categories)
          VALUES (${v.id}, ${v.name}, ${v.country}, ${v.categories})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, categories = EXCLUDED.categories`;
        vendorCount++;
      } catch (e) {
        vendorErrors.push({ id: v.id, error: e.message.slice(0, 150) });
      }
    }

    // Upsert master products — preserves synced data (external_ids, images, inventory, velocity)
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
          name = EXCLUDED.name, code = EXCLUDED.code, category = EXCLUDED.category,
          vendor_id = EXCLUDED.vendor_id, fob = EXCLUDED.fob, retail = EXCLUDED.retail,
          duty = EXCLUDED.duty, hts = EXCLUDED.hts, lead_days = EXCLUDED.lead_days,
          moq = EXCLUDED.moq, country = EXCLUDED.country, sizes = EXCLUDED.sizes,
          fits = EXCLUDED.fits, features = EXCLUDED.features`;
        mpCount++;
      } catch (e) {
        mpErrors.push({ id: mp.id, error: e.message.slice(0, 150) });
      }
    }

    // Upsert product stacks
    let stackCount = 0;
    for (const mp of MP_SEEDS) {
      try {
        await db`INSERT INTO product_stack (mp_id) VALUES (${mp.id}) ON CONFLICT DO NOTHING`;
        stackCount++;
      } catch (e) { /* ok */ }
    }

    const log = require('../../../lib/logger');
    log.info('seed.complete', { vendors: vendorCount, products: mpCount, stacks: stackCount });

    return NextResponse.json({
      seeded: true, vendors: vendorCount, products: mpCount, stacks: stackCount,
      totalSeeds: MP_SEEDS.length, vendorErrors: vendorErrors.slice(0, 5), mpErrors: mpErrors.slice(0, 5),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
