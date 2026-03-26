import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { neon } = require('@netlify/neon');
    const { MP_SEEDS } = require('../../../lib/products');
    const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ error: 'No DATABASE_URL' }, { status: 500 });

    const sql = neon(url);

    // Extract vendors
    const vendorMap = {};
    for (const mp of MP_SEEDS) {
      if (mp.vendor) {
        const vid = mp.vendor.toLowerCase().replace(/\s+/g, '-');
        if (!vendorMap[vid]) vendorMap[vid] = { id: vid, name: mp.vendor, country: mp.country, categories: [] };
        if (!vendorMap[vid].categories.includes(mp.cat)) vendorMap[vid].categories.push(mp.cat);
      }
    }

    // Seed vendors
    let vendorCount = 0;
    for (const v of Object.values(vendorMap)) {
      try {
        await sql`
          INSERT INTO vendors (id, name, country, categories)
          VALUES (${v.id}, ${v.name}, ${v.country || null}, ${v.categories})
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, categories = EXCLUDED.categories
        `;
        vendorCount++;
      } catch (e) { /* skip */ }
    }

    // Seed MPs
    let mpCount = 0;
    for (const mp of MP_SEEDS) {
      const vendorId = mp.vendor ? mp.vendor.toLowerCase().replace(/\s+/g, '-') : null;
      try {
        await sql`
          INSERT INTO master_products (id, name, code, category, vendor_id, fob, retail, duty, hts, lead_days, moq, country, sizes, fits, features, phase)
          VALUES (${mp.id}, ${mp.name}, ${mp.code}, ${mp.cat}, ${vendorId}, ${mp.fob || 0}, ${mp.retail || 0}, ${mp.duty || 0}, ${mp.hts || null}, ${mp.lead || 0}, ${mp.moq || 0}, ${mp.country || null}, ${mp.sizes || null}, ${mp.fits || []}, ${mp.features || []}, 'in_store')
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, fob = EXCLUDED.fob, retail = EXCLUDED.retail
        `;
        mpCount++;
      } catch (e) { /* skip */ }
    }

    // Seed product stacks
    let stackCount = 0;
    for (const mp of MP_SEEDS) {
      try {
        await sql`INSERT INTO product_stack (mp_id) VALUES (${mp.id}) ON CONFLICT DO NOTHING`;
        stackCount++;
      } catch (e) { /* skip */ }
    }

    // Insert default settings
    try {
      await sql`INSERT INTO app_settings (key, value) VALUES ('opex_monthly', '25000') ON CONFLICT DO NOTHING`;
      await sql`INSERT INTO app_settings (key, value) VALUES ('target_cover_weeks', '20') ON CONFLICT DO NOTHING`;
    } catch (e) { /* skip */ }

    return NextResponse.json({
      seeded: true,
      vendors: vendorCount,
      products: mpCount,
      stacks: stackCount,
      totalSeeds: MP_SEEDS.length,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
