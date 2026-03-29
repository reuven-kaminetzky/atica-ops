import { NextResponse } from 'next/server';

/**
 * GET /api/verify
 *
 * Automated health check on data integrity.
 * Run after sync to confirm the data is trustworthy.
 * Reuven should never have to manually verify sync results.
 *
 * Returns: { verified: true/false, score: 0-100, issues: [], stats: {} }
 */
export async function GET(request) {
  try {
    const { requireAuth } = require('../../../lib/auth');
    await requireAuth(request, 'read');

    const log = require('../../../lib/logger');
    const { sql } = require('../../../lib/dal/db');
    const db = sql();

    const issues = [];
    const stats = {};

    // 1. Master products — do we have them?
    const [mpCount] = await db`SELECT COUNT(*)::int AS n FROM master_products`;
    stats.masterProducts = mpCount.n;
    if (mpCount.n === 0) issues.push({ severity: 'critical', message: 'No master products in database. Run Seed Data.' });
    if (mpCount.n < 25) issues.push({ severity: 'warning', message: `Only ${mpCount.n} MPs. Expected 30+.` });

    // 2. Shopify sync — are products linked?
    const [linkedCount] = await db`SELECT COUNT(*)::int AS n FROM master_products WHERE external_ids IS NOT NULL AND array_length(external_ids, 1) > 0`;
    stats.linkedToShopify = linkedCount.n;
    const linkedPct = mpCount.n > 0 ? Math.round(linkedCount.n / mpCount.n * 100) : 0;
    stats.linkedPct = linkedPct;
    if (linkedCount.n === 0) issues.push({ severity: 'critical', message: 'No MPs linked to Shopify. Run Sync → 1. Products.' });
    else if (linkedPct < 50) issues.push({ severity: 'warning', message: `Only ${linkedPct}% of MPs linked to Shopify (${linkedCount.n}/${mpCount.n}).` });

    // 3. Images — do synced products have hero images?
    const [imageCount] = await db`SELECT COUNT(*)::int AS n FROM master_products WHERE hero_image IS NOT NULL`;
    stats.withImages = imageCount.n;
    if (linkedCount.n > 0 && imageCount.n === 0) issues.push({ severity: 'warning', message: 'No hero images. Sync may have failed to pull images.' });

    // 4. Inventory — is total_inventory populated?
    const [invCount] = await db`SELECT COUNT(*)::int AS n FROM master_products WHERE total_inventory > 0`;
    stats.withInventory = invCount.n;
    const [totalInv] = await db`SELECT COALESCE(SUM(total_inventory), 0)::int AS n FROM master_products`;
    stats.totalUnits = totalInv.n;
    if (linkedCount.n > 0 && invCount.n === 0) issues.push({ severity: 'critical', message: 'No inventory data. Run Sync → 2. Inventory.' });

    // 5. Velocity — is velocity populated?
    const [velCount] = await db`SELECT COUNT(*)::int AS n FROM master_products WHERE velocity_per_week > 0`;
    stats.withVelocity = velCount.n;
    if (linkedCount.n > 0 && velCount.n === 0) issues.push({ severity: 'warning', message: 'No velocity data. Run Sync → 3. Orders.' });

    // 6. Styles table — does it exist and have data?
    try {
      const [styleCount] = await db`SELECT COUNT(*)::int AS n FROM styles`;
      stats.styles = styleCount.n;
      if (linkedCount.n > 0 && styleCount.n === 0) issues.push({ severity: 'warning', message: 'Styles table empty. Run Sync → 1. Products (after running migration).' });

      const [noImage] = await db`SELECT COUNT(*)::int AS n FROM styles WHERE hero_image IS NULL AND status = 'active'`;
      stats.stylesWithoutImage = noImage.n;
    } catch (e) {
      stats.styles = 'table_missing';
      issues.push({ severity: 'warning', message: 'Styles table not created yet. Run Migration.' });
    }

    // 7. Sales table
    try {
      const [salesCount] = await db`SELECT COUNT(*)::int AS n FROM sales`;
      stats.salesRecords = salesCount.n;
      if (salesCount.n > 0) {
        const [recent] = await db`SELECT MAX(ordered_at) AS latest FROM sales`;
        stats.latestSale = recent.latest;
      }
    } catch (e) {
      stats.salesRecords = 'table_missing';
      issues.push({ severity: 'info', message: 'Sales table not created yet. Run Migration then Sync → 3. Orders.' });
    }

    // 8. POs
    const [poCount] = await db`SELECT COUNT(*)::int AS n FROM purchase_orders`;
    stats.purchaseOrders = poCount.n;

    // 9. Vendors
    const [vendorCount] = await db`SELECT COUNT(*)::int AS n FROM vendors`;
    stats.vendors = vendorCount.n;

    // 10. Overdue payments
    try {
      const [overdueCount] = await db`
        SELECT COUNT(*)::int AS n FROM po_payments
        WHERE status = 'overdue' OR (status IN ('planned', 'upcoming', 'due') AND due_date < NOW())
      `;
      stats.overduePayments = overdueCount.n;
      if (overdueCount.n > 0) {
        issues.push({ severity: 'warning', message: `${overdueCount.n} overdue PO payment(s). Check accounts payable.` });
      }
    } catch (e) {
      stats.overduePayments = 0;
    }

    // 11. Auth infrastructure
    try {
      const [tokenCount] = await db`SELECT COUNT(*)::int AS n FROM api_tokens WHERE revoked_at IS NULL`;
      stats.activeApiTokens = tokenCount.n;
    } catch (e) {
      stats.activeApiTokens = 'table_missing';
      issues.push({ severity: 'info', message: 'API tokens table not created. Run Migration.' });
    }

    // 12. Store inventory table
    try {
      const [siCount] = await db`SELECT COUNT(*)::int AS n FROM store_inventory`;
      stats.storeInventoryRecords = siCount.n;
    } catch (e) {
      stats.storeInventoryRecords = 'table_missing';
    }

    // 13. Spot check — sample 5 linked MPs, verify data quality
    const spotChecks = [];
    const samples = await db`
      SELECT id, name, total_inventory, velocity_per_week, hero_image, signal, external_ids
      FROM master_products
      WHERE external_ids IS NOT NULL AND array_length(external_ids, 1) > 0
      ORDER BY RANDOM() LIMIT 5
    `;
    for (const mp of samples) {
      const check = { id: mp.id, name: mp.name };
      check.hasInventory = (mp.total_inventory || 0) > 0;
      check.hasVelocity = (mp.velocity_per_week || 0) > 0;
      check.hasImage = !!mp.hero_image;
      check.hasSignal = !!mp.signal;
      check.shopifyCount = (mp.external_ids || []).length;
      check.pass = check.hasInventory || check.hasImage;
      spotChecks.push(check);
    }
    stats.spotChecks = spotChecks;

    const spotFails = spotChecks.filter(c => !c.pass).length;
    if (spotFails > 0) issues.push({ severity: 'warning', message: `${spotFails}/5 spot checks failed — MPs linked to Shopify but missing inventory AND images.` });

    // Score: 0-100
    let score = 0;
    if (mpCount.n >= 25) score += 15;           // have MPs
    if (linkedPct >= 50) score += 20;           // linked to Shopify
    if (imageCount.n > 0) score += 10;          // have images
    if (invCount.n > 0) score += 20;            // have inventory
    if (velCount.n > 0) score += 15;            // have velocity
    if (stats.styles > 0) score += 10;          // have styles
    if (stats.salesRecords > 0) score += 10;    // have sales history

    const hasCritical = issues.some(i => i.severity === 'critical');
    const verified = score >= 65 && !hasCritical;

    const result = {
      verified,
      score,
      grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : score >= 25 ? 'D' : 'F',
      issues,
      stats,
      checkedAt: new Date().toISOString(),
    };

    log.info('verify.complete', { score, grade: result.grade, verified, issues: issues.length });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({
      verified: false, score: 0, grade: 'F',
      issues: [{ severity: 'critical', message: `Verification failed: ${e.message}` }],
      stats: {},
    }, { status: 500 });
  }
}
