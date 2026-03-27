/**
 * lib/constants.js — Business Constants
 *
 * Every magic number lives here. If you see a raw number in code,
 * it should be a constant from this file.
 */

module.exports = {
  // Cost calculation
  FREIGHT_MULTIPLIER: 1.08,          // 8% freight on FOB
  DEFAULT_DUTY_PCT: 24,              // default HTS duty rate
  LANDED_COST_FACTOR: 1.34,          // FOB × 1.34 ≈ landed (duty + freight + misc)

  // Inventory
  TARGET_COVER_WEEKS: 20,            // reorder to cover 20 weeks
  LOW_STOCK_DAYS: 60,                // below this = low stock warning
  CRITICAL_STOCK_DAYS: 30,           // below this = urgent reorder
  REORDER_VELOCITY_DAYS: 30,         // days of sales data for velocity

  // Cash flow
  OPEX_MONTHLY_DEFAULT: 25000,       // default monthly operating expenses
  PROJECTION_WEEKS: 12,              // cash flow projection horizon
  WEEKS_PER_MONTH: 4.33,

  // Seasonal velocity multipliers by month (1=Jan, 12=Dec)
  SEASONAL_MULTIPLIERS: {
    1: 0.85, 2: 0.85, 3: 0.85,      // Spring (slower)
    4: 0.85, 5: 0.85, 6: 0.85,
    7: 1.0,                           // Summer (normal)
    8: 1.4, 9: 1.4,                   // Back to school (peak)
    10: 1.15,                         // Fall
    11: 1.6, 12: 1.6,                 // Holiday (peak)
  },

  // Demand signal thresholds
  DEMAND: {
    HOT_SELL_THROUGH: 80,             // sell-through % above this = hot
    HOT_VELOCITY: 5,                  // units/week above this = hot
    RISING_SELL_THROUGH: 60,
    RISING_VELOCITY: 3,
    SLOW_SELL_THROUGH: 40,
    SLOW_VELOCITY: 1.5,
  },

  // Distribution weights (% of new stock per store)
  DISTRIBUTION_WEIGHTS: {
    'Lakewood': 0.30,
    'Flatbush': 0.20,
    'Crown Heights': 0.15,
    'Monsey': 0.25,
    'Online': 0.10,
  },

  // Payment schedule presets
  PAYMENT_TERMS: {
    standard: [
      { type: 'deposit', pct: 30, label: 'Deposit (30%)' },
      { type: 'production', pct: 40, label: 'Production (40%)' },
      { type: 'balance', pct: 30, label: 'Balance (30%)' },
    ],
    full: [
      { type: 'full', pct: 100, label: 'Full payment' },
    ],
    net30: [
      { type: 'deposit', pct: 50, label: 'Deposit (50%)' },
      { type: 'balance', pct: 50, label: 'Balance (50%)' },
    ],
  },

  // Sync intervals
  SYNC_INTERVAL_MS: 180000,          // 3 minutes for sales pulse
  CACHE_TTL: {
    products: 300,                    // 5 min
    inventory: 120,                   // 2 min
    orders: 60,                       // 1 min
    pos: 60,                          // 1 min
  },

  // Stores
  STORES: ['Lakewood', 'Flatbush', 'Crown Heights', 'Monsey', 'Online', 'Reserve'],

  // Transfer compliance
  TRANSFER_CONFIRM_HOURS: 4,         // escalate if not confirmed within 4 hours
};
