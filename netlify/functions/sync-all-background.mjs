// Full sync — background function (15 min timeout)
// Handles: full sync (all steps) or styles-only

export default async (req) => {
  const siteUrl = Netlify.env.get('URL') || 'https://atica-ops-v3.netlify.app';
  const results = {};
  const started = Date.now();

  let body = {};
  try { body = await req.json(); } catch { body = {}; }

  const stepsToRun = body.stepsToRun || ['products', 'styles-only', 'orders'];

  console.log(JSON.stringify({ event: 'sync-bg.started', steps: stepsToRun }));

  // If styles-only, fetch products and insert styles directly
  if (stepsToRun.includes('styles-only')) {
    try {
      // Dynamic imports for CommonJS modules
      const { createClient } = await import('../../lib/shopify.js');
      const productsModule = await import('../../lib/products.js');
      const { neon } = await import('@netlify/neon');
      const sql = neon();

      const client = await createClient();
      if (!client) { console.error('No Shopify client'); return; }

      const resp = await client.getProducts();
      const products = resp.products || resp || [];
      console.log(JSON.stringify({ event: 'sync-bg.styles.fetched', count: products.length }));

      let created = 0;
      for (const p of products) {
        if (/do not use/i.test(p.title)) continue;
        const maxPrice = Math.max(...(p.variants || []).map(v => parseFloat(v.price) || 0), 0);
        const mpId = productsModule.matchProduct(p.title, maxPrice);
        if (!mpId) continue;

        const totalInv = (p.variants || []).reduce((s, v) => s + (v.inventory_quantity || 0), 0);
        const colorway = p.title.includes('|') ? p.title.split('|').pop().trim() : null;

        try {
          await sql`
            INSERT INTO styles (id, mp_id, external_product_id, title, colorway, hero_image, retail, inventory, variant_count, external_handle, status)
            VALUES (${String(p.id)}, ${mpId}, ${p.id}, ${p.title}, ${colorway}, ${p.image?.src || null},
              ${maxPrice}, ${totalInv}, ${(p.variants || []).length}, ${p.handle || null},
              ${p.status === 'active' ? 'active' : 'archived'})
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title, colorway = EXCLUDED.colorway, hero_image = EXCLUDED.hero_image,
              retail = EXCLUDED.retail, inventory = EXCLUDED.inventory, variant_count = EXCLUDED.variant_count,
              status = EXCLUDED.status, updated_at = NOW()
          `;
          created++;
        } catch (e) {
          if (created === 0 && e.message.includes('does not exist')) {
            console.error(JSON.stringify({ event: 'sync-bg.styles.error', error: 'styles table missing' }));
            break;
          }
        }
      }

      results.styles = { created };
      console.log(JSON.stringify({ event: 'sync-bg.styles.done', created }));
    } catch (e) {
      results.styles = { error: e.message };
      console.error(JSON.stringify({ event: 'sync-bg.styles.error', error: e.message }));
    }
  }

  // Run sync API steps if not styles-only
  for (const step of stepsToRun.filter(s => s !== 'styles-only')) {
    try {
      const res = await fetch(`${siteUrl}/api/sync?step=${step}`, { method: 'POST' });
      const data = await res.json();
      results[step] = { ok: true, ...data };
      console.log(JSON.stringify({ event: `sync-bg.step.${step}`, ...data }));
    } catch (e) {
      results[step] = { ok: false, error: e.message };
      console.error(JSON.stringify({ event: `sync-bg.step.${step}.error`, error: e.message }));
    }
  }

  // Verify
  try {
    const res = await fetch(`${siteUrl}/api/verify`);
    const data = await res.json();
    results.verify = data;
    console.log(JSON.stringify({ event: 'sync-bg.verify', grade: data.grade, score: data.score }));
  } catch (e) {
    results.verify = { error: e.message };
  }

  console.log(JSON.stringify({
    event: 'sync-bg.complete',
    elapsed: `${Date.now() - started}ms`,
    styles: results.styles?.created,
    verified: results.verify?.verified,
    grade: results.verify?.grade,
  }));
};
