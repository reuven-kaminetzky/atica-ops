/**
 * In-memory cache — persists within lambda container
 * Netlify reuses containers for ~5-15 min between cold starts.
 * Shared across all function modules.
 */

const _cache = {};

const CACHE_TTL = {
  status:     30,   // 30s  — connection check
  products:   300,  // 5min — products rarely change
  inventory:  120,  // 2min — inventory changes often
  orders:     60,   // 1min — orders flow in
  velocity:   180,  // 3min — aggregated, stable
  sales:      120,  // 2min — sales summary
  ledger:     120,  // 2min — ledger entries
  titles:     300,  // 5min — just titles
  'sku-map':  300,  // 5min — SKU list
  pos:        60,   // 1min — POS is real-time-ish
};

function get(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() > entry.expires) { delete _cache[key]; return null; }
  return entry.data;
}

function set(key, data, ttlSec) {
  _cache[key] = { data, expires: Date.now() + (ttlSec || 60) * 1000 };
}

function makeKey(prefix, params) {
  if (!params || Object.keys(params).length === 0) return prefix;
  // Sort keys for deterministic cache keys regardless of param order
  const sorted = Object.keys(params).sort().reduce((o, k) => {
    if (params[k] !== undefined && params[k] !== null) o[k] = params[k];
    return o;
  }, {});
  return `${prefix}:${JSON.stringify(sorted)}`;
}

function stats() {
  const entries = Object.entries(_cache);
  const result = entries.map(([key, entry]) => ({
    key: key.split(':')[0],
    expiresIn: Math.round((entry.expires - Date.now()) / 1000),
    alive: Date.now() < entry.expires,
  }));
  return { entries: result.length, alive: result.filter(s => s.alive).length, stats: result };
}

function clear() {
  const count = Object.keys(_cache).length;
  for (const k of Object.keys(_cache)) delete _cache[k];
  return { cleared: count };
}

module.exports = { get, set, makeKey, stats, clear, CACHE_TTL };
