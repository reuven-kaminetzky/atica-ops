// Daily sync trigger — runs at 5:00 AM UTC (midnight ET)
// Scheduled functions have 30s limit, so we just trigger the background function

export default async (req) => {
  const { next_run } = await req.json();
  const siteUrl = Netlify.env.get('URL') || 'https://atica-ops-v3.netlify.app';

  console.log(JSON.stringify({
    event: 'daily-sync.triggered',
    next_run,
    timestamp: new Date().toISOString(),
  }));

  // Trigger the background function which has 15 min timeout
  try {
    const res = await fetch(`${siteUrl}/.netlify/functions/sync-all-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'daily-schedule', next_run }),
    });
    console.log(JSON.stringify({
      event: 'daily-sync.background-triggered',
      status: res.status,
    }));
  } catch (e) {
    console.error(JSON.stringify({
      event: 'daily-sync.error',
      message: e.message,
    }));
  }
};

export const config = {
  schedule: '0 5 * * *', // 5:00 AM UTC = midnight ET
};
