// Full sync — background function (15 min timeout)
// Called by daily-sync scheduled function or manually
// Runs all sync steps + verification, logs results

export default async (req) => {
  const siteUrl = Netlify.env.get('URL') || 'https://atica-ops-v3.netlify.app';
  const results = {};
  const started = Date.now();

  console.log(JSON.stringify({ event: 'sync-all.started', timestamp: new Date().toISOString() }));

  // Run each sync step
  const steps = ['products', 'styles', 'orders'];

  for (const step of steps) {
    try {
      const res = await fetch(`${siteUrl}/api/sync?step=${step}`, { method: 'POST' });
      const data = await res.json();
      results[step] = { ok: true, ...data };
      console.log(JSON.stringify({ event: `sync-all.step.${step}`, ...data }));
    } catch (e) {
      results[step] = { ok: false, error: e.message };
      console.error(JSON.stringify({ event: `sync-all.step.${step}.error`, error: e.message }));
    }
  }

  // Run verification
  try {
    const res = await fetch(`${siteUrl}/api/verify`);
    const data = await res.json();
    results.verify = data;
    console.log(JSON.stringify({
      event: 'sync-all.verify',
      verified: data.verified,
      score: data.score,
      grade: data.grade,
      issues: data.issues?.length || 0,
    }));
  } catch (e) {
    results.verify = { error: e.message };
    console.error(JSON.stringify({ event: 'sync-all.verify.error', error: e.message }));
  }

  const elapsed = Date.now() - started;
  console.log(JSON.stringify({
    event: 'sync-all.complete',
    elapsed: `${elapsed}ms`,
    productsMatched: results.products?.matched,
    stylesCreated: results.styles?.created,
    ordersStored: results.orders?.salesStored,
    verified: results.verify?.verified,
    grade: results.verify?.grade,
  }));
};
