import { NextResponse } from 'next/server';
import { neon } from '@netlify/neon';

export async function POST() {
  try {
    const { MP_SEEDS } = require('../../../lib/products');
    const sql = neon();

    // Extract vendors
    const vendorMap = {};
    for (const mp of MP_SEEDS) {
      if (mp.vendor) {
        const vid = mp.vendor.toLowerCase().replace(/\s+/g, '-');
        if (!vendorMap[vid]) vendorMap[vid] = { id: vid, name: mp.vendor, country: mp.country || null, categories: [] };
        if (!vendorMap[vid].categories.includes(mp.cat)) vendorMap[vid].categories.push(mp.cat);
      }
    }

    // Seed vendors first
    let vendorCount = 0;
    const vendorErrors = [];
    for (const v of Object.values(vendorMap)) {
      try {
        await sql`INSERT INTO vendors (id, name, country, categories) 
          VALUES (${v.id}, ${v.name}, ${v.country}, ${v.categories}) 
          ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, categories = EXCLUDED.categories`;
        vendorCount++;
      } catch (e) {
        vendorErrors.push({ id: v.id, error: e.message.slice(0, 150) });
      }
    }

    // Seed master products
    let mpCount = 0;
    const mpErrors = [];
    for (const mp of MP_SEEDS) {
      const vid = mp.vendor ? mp.vendor.toLowerCase().replace(/\s+/g, '-') : null;
      try {
        await sql`INSERT INTO master_products (
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
          name = EXCLUDED.name, fob = EXCLUDED.fob, retail = EXCLUDED.retail`;
        mpCount++;
      } catch (e) {
        mpErrors.push({ id: mp.id, error: e.message.slice(0, 150) });
      }
    }

    // Seed product stacks
    let stackCount = 0;
    for (const mp of MP_SEEDS) {
      try {
        await sql`INSERT INTO product_stack (mp_id) VALUES (${mp.id}) ON CONFLICT DO NOTHING`;
        stackCount++;
      } catch (e) { /* ok to skip */ }
    }

    return NextResponse.json({ 
      seeded: true, 
      vendors: vendorCount, 
      products: mpCount, 
      stacks: stackCount,
      totalSeeds: MP_SEEDS.length,
      vendorErrors: vendorErrors.slice(0, 5),
      mpErrors: mpErrors.slice(0, 5),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
