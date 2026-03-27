/**
 * lib/logger.js — Structured Logging
 * 
 * Every log is a JSON object. Netlify captures these in function logs.
 * Use: log.info('sync.complete', { matched: 350, elapsed: '12s' })
 * 
 * Output: {"level":"info","event":"sync.complete","matched":350,"elapsed":"12s","ts":"2026-03-27T21:00:00Z"}
 */

function emit(level, event, data = {}) {
  const entry = {
    level,
    event,
    ...data,
    ts: new Date().toISOString(),
  };
  if (level === 'error') console.error(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
  return entry;
}

const log = {
  info:  (event, data) => emit('info', event, data),
  warn:  (event, data) => emit('warn', event, data),
  error: (event, data) => emit('error', event, data),
  debug: (event, data) => { if (process.env.DEBUG) emit('debug', event, data); },
};

module.exports = log;
