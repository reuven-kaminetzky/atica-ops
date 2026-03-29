// Daily sync — scheduled at 5:00 AM UTC (midnight ET)
// Triggers the sync-background function which has 15 min timeout

export default async (req) => {
  const { next_run } = await req.json();
  const siteUrl = Netlify.env.get('URL') || Netlify.env.get('DEPLOY_PRIME_URL') || 'https://atica-ops.netlify.app';

  console.log(JSON.stringify({
    event: 'daily-sync.triggered',
    next_run,
    ts: new Date().toISOString(),
  }));

  try {
    await fetch(`${siteUrl}/.netlify/functions/sync-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'daily-schedule', next_run }),
    });
    console.log(JSON.stringify({ event: 'daily-sync.background-triggered' }));
  } catch (e) {
    console.error(JSON.stringify({ event: 'daily-sync.error', error: e.message }));
  }
};

export const config = {
  schedule: '0 5 * * *',
};
