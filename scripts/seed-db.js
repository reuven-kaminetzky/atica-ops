#!/usr/bin/env node
/**
 * scripts/seed-db.js — Populate database from MP_SEEDS
 * 
 * Run after migration: node scripts/seed-db.js
 * 
 * Requires: NETLIFY_DATABASE_URL or DATABASE_URL env var
 * Or pass it: DATABASE_URL=postgres://... node scripts/seed-db.js
 */

const { MP_SEEDS, CATEGORIES } = require('../lib/products');

async function seed() {
  const url = process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL or NETLIFY_DATABASE_URL');
    process.exit(1);
  }

  const { neon } = require('@netlify/neon');
  const sql = neon(url);

  console.log('Connected to Postgres');
  console.log(`Seeding ${MP_SEEDS.length} Master Products...\n`);

  // Extract unique vendors
  const vendorMap = {};
  for (const mp of MP_SEEDS) {
    if (mp.vendor && !vendorMap[mp.vendor.toLowerCase().replace(/\s+/g, '-')]) {
      vendorMap[mp.vendor.toLowerCase().replace(/\s+/g, '-')] = {
        id: mp.vendor.toLowerCase().replace(/\s+/g, '-'),
        name: mp.vendor,
        country: mp.country || null,
        categories: [],
      };
    }
    if (mp.vendor) {
      const vid = mp.vendor.toLowerCase().replace(/\s+/g, '-');
      if (!vendorMap[vid].categories.includes(mp.cat)) {
        vendorMap[vid].categories.push(mp.cat);
      }
    }
  }

  // Seed vendors first (MPs reference them)
  const vendors = Object.values(vendorMap);
  console.log(`Seeding ${vendors.length} vendors...`);
  for (const v of vendors) {
    try {
      await sql`
        INSERT INTO vendors (id, name, country, categories)
        VALUES (${v.id}, ${v.name}, ${v.country}, ${v.categories})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          country = EXCLUDED.country,
          categories = EXCLUDED.categories
      `;
    } catch (e) {
      console.error(`  ✗ vendor ${v.id}: ${e.message}`);
    }
  }
  console.log(`  ✓ ${vendors.length} vendors\n`);

  // Seed master products
  let succeeded = 0;
  for (const mp of MP_SEEDS) {
    const vendorId = mp.vendor ? mp.vendor.toLowerCase().replace(/\s+/g, '-') : null;
    try {
      await sql`
        INSERT INTO master_products (
          id, name, code, category, vendor_id,
          fob, retail, duty, hts,
          lead_days, moq, country,
          sizes, fits, features,
          phase, hero_image
        ) VALUES (
          ${mp.id}, ${mp.name}, ${mp.code}, ${mp.cat}, ${vendorId},
          ${mp.fob || 0}, ${mp.retail || 0}, ${mp.duty || 0}, ${mp.hts || null},
          ${mp.lead || 0}, ${mp.moq || 0}, ${mp.country || null},
          ${mp.sizes || null}, ${mp.fits || []}, ${mp.features || []},
          'in_store', ${mp.heroImg || null}
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          category = EXCLUDED.category,
          vendor_id = EXCLUDED.vendor_id,
          fob = EXCLUDED.fob,
          retail = EXCLUDED.retail,
          duty = EXCLUDED.duty,
          hts = EXCLUDED.hts,
          lead_days = EXCLUDED.lead_days,
          moq = EXCLUDED.moq,
          country = EXCLUDED.country,
          sizes = EXCLUDED.sizes,
          fits = EXCLUDED.fits,
          features = EXCLUDED.features,
          hero_image = EXCLUDED.hero_image
      `;
      succeeded++;
    } catch (e) {
      console.error(`  ✗ ${mp.id}: ${e.message}`);
    }
  }
  console.log(`  ✓ ${succeeded}/${MP_SEEDS.length} master products\n`);

  // Initialize empty product_stack for each MP
  console.log('Initializing product stack...');
  let stackCount = 0;
  for (const mp of MP_SEEDS) {
    try {
      await sql`
        INSERT INTO product_stack (mp_id, country_of_origin)
        VALUES (${mp.id}, ${mp.country || ''})
        ON CONFLICT (mp_id) DO NOTHING
      `;
      stackCount++;
    } catch (e) { /* ignore duplicates */ }
  }
  console.log(`  ✓ ${stackCount} product stacks\n`);

  // Verify
  const mpCount = await sql`SELECT COUNT(*) as n FROM master_products`;
  const vCount = await sql`SELECT COUNT(*) as n FROM vendors`;
  const sCount = await sql`SELECT COUNT(*) as n FROM product_stack`;

  console.log('=== Database Seeded ===');
  console.log(`  Master Products: ${mpCount[0].n}`);
  console.log(`  Vendors: ${vCount[0].n}`);
  console.log(`  Product Stacks: ${sCount[0].n}`);
  console.log(`  Tables ready: purchase_orders, po_payments, shipments,`);
  console.log(`                customers, wholesale_accounts, components,`);
  console.log(`                campaigns, attachments, audit_log, app_settings`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
