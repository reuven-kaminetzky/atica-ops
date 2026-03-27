/**
 * Master Products — Seeds, Title Matchers, Categories
 * 
 * This is the root of the Atica product tree.
 * Everything flows from here: POs, production planning, cash flow, analytics.
 * 
 * MP → matched to Shopify products via title matchers
 * MP → styles from Shopify variants (color/fabric)
 * MP → fits from Shopify variant options (Lorenzo 6, Slim, etc.)
 * MP → sizes from Shopify variant options
 * 
 * HOW MATCHING WORKS:
 *   Each MP has a matcher function(title, maxPrice) → boolean
 *   On sync, we iterate all Shopify products and run each matcher.
 *   A Shopify product matches the FIRST MP whose matcher returns true.
 *   Some matchers use price (hc360 vs hc480 split at $400).
 *   "do not use" products are always excluded.
 */

// ── Categories ──────────────────────────────────────────────

const CATEGORIES = ['Shirts', 'Suits', 'Blazers', 'Pants', 'Outerwear', 'Kapote', 'Accessories', 'Shoes', 'Boys'];

const SIZE_GROUPS = {
  shirts:   { core: ['15', '15.5', '16', '16.5', '17', '17.5'], extended: ['14.5', '18', '18.5', '19'] },
  suits:    { core: ['38R', '40R', '42R', '44R', '46R'], extended: ['36S', '36R', '38S', '38L', '40S', '40L', '42S', '42L', '44S', '44L', '46S', '46L', '48R', '50R'] },
  pants:    { core: ['32', '33', '34', '36', '38', '40'], extended: ['30', '31', '35', '42', '44'] },
  boys:     { core: ['8', '10', '12', '14', '16'], extended: ['2', '4', '6', '18', '20'] },
  shoes:    { core: ['9', '9.5', '10', '10.5', '11', '11.5'], extended: ['7', '7.5', '8', '8.5', '12', '13'] },
  kapote:   { core: ['38R', '40R', '42R', '44R', '46R', '48R'], extended: ['36R', '50R'] },
  socks:    { core: ['10-13'], extended: [] },
  'one-size': { core: ['OS'], extended: [] },
  onesize:  { core: ['OS'], extended: [] },
};

// ── Title Matchers ──────────────────────────────────────────
// Each key is an MP seed ID. Each value is a function(title, maxPrice) → boolean.
// Order matters for aliases — first match wins.

const TITLE_MATCHERS = {
  // ── Shirts ──
  'londoner':       t => /londoner/i.test(t) && !/boys/i.test(t),
  'dress':          t => (/dress\s+(shirt|collar)/i.test(t) || /brooklyner/i.test(t) || /CML\s+MC\s+Shirt/i.test(t)) && !/boys/i.test(t) && !/performance/i.test(t) && !/do not use/i.test(t),
  'knit':           t => /polo/i.test(t) && !/boys/i.test(t),
  'milano':         t => /milano/i.test(t),
  'edinburgh':      t => /edinburgh/i.test(t),
  'bengal':         t => /bengal/i.test(t),
  'oxford-bd':      t => /oxford\s+button/i.test(t),
  'linen-shirt':    t => /linen.*shirt/i.test(t),
  'perf-shirt':     t => (/performance.*(shirt|polo|tee)/i.test(t) || /buttonless.*polo/i.test(t)) && !/do not use/i.test(t),
  'tuxedo-shirt':   t => /tuxedo\s+shirt/i.test(t),
  'band-collar':    t => /band\s+collar/i.test(t),
  'windowpane':     t => /windowpane/i.test(t),
  'herringbone':    t => /herringbone/i.test(t),
  'royal-oxford':   t => /royal\s+oxford/i.test(t),
  'pinpoint':       t => /pinpoint/i.test(t) || /boston.*shirt/i.test(t),
  // ── Suits ──
  'hc360':          (t, p) => (/half\s+canvas\s+(suit|pant)/i.test(t) || /barberis.*half/i.test(t)) && !/boys/i.test(t) && !/do not use/i.test(t) && p <= 400,
  'hc480':          (t, p) => (/half\s+canvas\s+(suit|pant)/i.test(t) || /barberis.*half/i.test(t)) && !/boys/i.test(t) && !/do not use/i.test(t) && p > 400,
  'wash-suit':      t => /washable\s+suit/i.test(t) && !/boys/i.test(t),
  'summer-suit':    t => /summer.*suit/i.test(t) || /linen.*suit/i.test(t),
  // ── Blazers ──
  'wash-blazer':    t => /parkway.*blazer/i.test(t) || (/travel\s+blazer/i.test(t) && !/cerruti/i.test(t)),
  'travel-blazer':  t => /cerruti/i.test(t),
  'maggia':         t => /maggia/i.test(t),
  // ── Pants ──
  '5pkt':           t => (/parkway/i.test(t) && /pant|stretch/i.test(t)) || /essential.*stretch/i.test(t),
  'luxury-pant':    t => /parkway.*dress.*pant/i.test(t) || /luxury.*performance.*pant/i.test(t),
  'suit-pant':      t => /suit\s+pant/i.test(t) && !/boys/i.test(t) && !/do not use/i.test(t) && !/essential/i.test(t) && !/parkway/i.test(t) && !/half\s+canvas/i.test(t),
  // ── Outerwear ──
  'kapote':         t => /kapote/i.test(t) && !/silk/i.test(t),
  'silk-kapote':    t => /silk.*kapote/i.test(t),
  'raincoat':       t => /overcoat/i.test(t) || /raincoat/i.test(t),
  // ── Sweaters ──
  'sweater':        t => (/cardigan|pullover|zip.?up/i.test(t) || (/knit/i.test(t) && !/suit/i.test(t) && !/half/i.test(t))) && !/boys/i.test(t),
  // ── Accessories ──
  'ties':           t => /\btie\b/i.test(t) || /\bties\b/i.test(t),
  'belts':          t => /\bbelt\b/i.test(t),
  'socks':          t => /\bsock/i.test(t),
  'cufflinks':      t => /cufflink/i.test(t),
  'hats':           t => /\bcap\b/i.test(t) || /\bhat\b/i.test(t),
  // ── Shoes ──
  'dress-shoe':     t => /oxford/i.test(t) || /wholecut/i.test(t) || /dress\s+shoe/i.test(t) || /brogue/i.test(t),
  'luxury-shoe':    t => /loafer/i.test(t) || /beatle/i.test(t) || /monk/i.test(t) || /chelsea/i.test(t) || /buckle\s+strap/i.test(t) || /brace\s+/i.test(t),
  // ── Boys ──
  'boys-suit':      t => /boys.*(suit|half\s+canvas)/i.test(t) && !/pant/i.test(t) && !/do not use/i.test(t),
  'boys-shirt':     t => /boys.*(shirt|londoner)/i.test(t),
  'boys-blazer':    t => /boys.*blazer/i.test(t) && !/do not use/i.test(t),
  'boys-pant':      t => /boys.*(pant|trouser)/i.test(t) && !/do not use/i.test(t),
};

// Aliases — point to the same MP seed, just match more titles
const ALIASES = {
  'bengal-stripe':    'bengal',
  'oxford-btn':       'oxford-bd',
  'check-shirt':      'windowpane',
  'herring-shirt':    'herringbone',
  'maggia-blazer':    'maggia',
  'londoner-boys':    'boys-shirt',
  'wash-boys-blazer': 'boys-blazer',
  'boys-pants':       'boys-pant',
  'shoes-ital':       'dress-shoe',
  'shoes-lux':        'luxury-shoe',
};

// ── MP Seeds ────────────────────────────────────────────────
// These are the master product definitions — the PLM backbone.
// Each has: sourcing (vendor, fob, lead, moq), customs (hts, duty),
// retail, sizing, and lifecycle metadata.

const MP_SEEDS = [
  // ── Shirts ──
  { id: 'londoner',      name: 'The Londoner Shirt',        code: 'LON',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 12.50, retail: 56,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20.2015', duty: 20,   fits: ['Modern (Extra Slim)', 'Contemporary (Slim)', 'Classic With Pocket', 'Classic No Pocket'] },
  { id: 'dress',         name: 'Dress Shirt Collection',    code: 'DRS',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 15,    retail: 56,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20.2015', duty: 20,   fits: ['Modern (Extra Slim)', 'Contemporary (Slim)', 'Classic'] },
  { id: 'knit',          name: 'Polo Shirt Collection',     code: 'POLO', cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 11,    retail: 40,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6105.10.0010', duty: 27.5, fits: ['S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'milano',        name: 'Milano Dress Shirt',        code: 'MIL',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 15,    retail: 68,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'edinburgh',     name: 'Edinburgh Shirt',           code: 'EDN',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 16,    retail: 72,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'bengal',        name: 'Bengal Stripe Shirt',       code: 'BNG',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 14,    retail: 64,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'oxford-bd',     name: 'Oxford Button-Down',        code: 'OXF',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 13,    retail: 52,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'linen-shirt',   name: 'Linen Summer Shirt',        code: 'LNS',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 16,    retail: 68,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'perf-shirt',    name: 'Performance Tech Shirt',    code: 'PRF',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 18,    retail: 76,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'tuxedo-shirt',  name: 'Tuxedo Shirt',              code: 'TXS',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 22,    retail: 96,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'band-collar',   name: 'Band Collar Shirt',         code: 'BCS',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 14,    retail: 58,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'windowpane',    name: 'Windowpane Check Shirt',    code: 'WPC',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 14,    retail: 56,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'herringbone',   name: 'Herringbone Weave Shirt',   code: 'HBW',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 15,    retail: 62,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'royal-oxford',  name: 'Royal Oxford Shirt',        code: 'ROX',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 17,    retail: 72,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  { id: 'pinpoint',      name: 'Pinpoint Oxford Shirt',     code: 'PPO',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 13,    retail: 54,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6205.20',      duty: 20,   fits: [] },
  // ── Suits ──
  { id: 'hc360',         name: 'Half Canvas Suit $360',     code: 'HC360', cat: 'Suits',      vendor: 'Shandong (DY17)',          fob: 41.50, retail: 360, lead: 90,  moq: 50,  sizes: 'suits',     hts: '6203.11.9010', duty: 17.5, fits: ['Lorenzo 6', 'Lorenzo 4', 'Alexander 4', 'Alexander 2'] },
  { id: 'hc480',         name: 'Half Canvas Suit $480',     code: 'HC480', cat: 'Suits',      vendor: 'Wenzhou JYY Garments',     fob: 62,    retail: 480, lead: 90,  moq: 50,  sizes: 'suits',     hts: '6203.11.9010', duty: 17.5, fits: ['Lorenzo 6', 'Lorenzo 4', 'Alexander 4', 'Alexander 2'] },
  { id: 'wash-suit',     name: 'Washable Suit',             code: 'WSUIT', cat: 'Suits',      vendor: 'Shandong (DY17)',          fob: 33.50, retail: 420, lead: 90,  moq: 50,  sizes: 'suits',     hts: '6203.11.9010', duty: 17.5, fits: [] },
  { id: 'summer-suit',   name: 'Summer Weight Suit',        code: 'SWS',  cat: 'Suits',       vendor: 'Ningbo Youngor (YGR)',     fob: 65,    retail: 295, lead: 90,  moq: 50,  sizes: 'suits',     hts: '6203.11',      duty: 17.5, fits: [] },
  // ── Blazers ──
  { id: 'wash-blazer',   name: 'Parkway Travel Blazer',     code: 'PARK', cat: 'Blazers',     vendor: 'Shandong (DY17)',          fob: 33.50, retail: 179, lead: 90,  moq: 50,  sizes: 'suits',     hts: '6203.31.9010', duty: 17.5, fits: [] },
  { id: 'travel-blazer', name: 'Cerruti Travel Blazer',     code: 'CERR', cat: 'Blazers',     vendor: 'Sharmoon',                 fob: 95,    retail: 360, lead: 90,  moq: 50,  sizes: 'suits',     hts: '6203.31.9010', duty: 17.5, fits: [] },
  { id: 'maggia',        name: 'Maggia Knit Blazer',        code: 'MAG',  cat: 'Blazers',     vendor: 'Maglificio Maggia',        fob: 50,    retail: 198, lead: 90,  moq: 30,  sizes: 'suits',     hts: '6104.33',      duty: 28.2, fits: [] },
  // ── Pants ──
  { id: '5pkt',          name: 'Parkway Stretch Pants',     code: 'PKWY', cat: 'Pants',       vendor: 'Shandong (DY17)',          fob: 13.95, retail: 75,  lead: 90,  moq: 200, sizes: 'pants',     hts: '6203.42.4010', duty: 24.1, fits: ['Slim', 'Regular', 'Relaxed'] },
  { id: 'luxury-pant',   name: 'Parkway Dress Pants',       code: 'PKDR', cat: 'Pants',       vendor: 'Shandong (DY17)',          fob: 16,    retail: 72,  lead: 90,  moq: 100, sizes: 'pants',     hts: '6203.42',      duty: 24.1, fits: [] },
  { id: 'suit-pant',     name: 'Luxury Performance Pants',  code: 'LUXP', cat: 'Pants',       vendor: 'The Orient Apparel (TAL)', fob: 14,    retail: 125, lead: 90,  moq: 50,  sizes: 'pants',     hts: '6203.42.4010', duty: 24.1, fits: [] },
  // ── Outerwear / Kapote ──
  { id: 'kapote',        name: 'Kapote',                    code: 'KAP',  cat: 'Kapote',      vendor: 'Wenzhou JYY Garments',     fob: 72,    retail: 340, lead: 105, moq: 50,  sizes: 'kapote',    hts: '6201.11.0000', duty: 14,   fits: [] },
  { id: 'silk-kapote',   name: 'Silk Kapote',               code: 'SKP',  cat: 'Kapote',      vendor: 'Wenzhou JYY Garments',     fob: 72,    retail: 295, lead: 90,  moq: 20,  sizes: 'kapote',    hts: '6201.19',      duty: 8.5,  fits: [] },
  { id: 'raincoat',      name: 'Wool Raincoat',             code: 'RNC',  cat: 'Outerwear',   vendor: 'Shandong (DY17)',          fob: 75,    retail: 295, lead: 75,  moq: 50,  sizes: 'suits',     hts: '6201.11',      duty: 17.5, fits: [] },
  { id: 'sweater',       name: 'Knit Sweaters',             code: 'KNT',  cat: 'Outerwear',   vendor: '',                         fob: 18,    retail: 89,  lead: 90,  moq: 50,  sizes: 'shirts',    hts: '6110.20',      duty: 17.5, fits: [] },
  // ── Accessories ──
  { id: 'ties',          name: "Men's Ties",                code: 'TIE',  cat: 'Accessories', vendor: 'Hefei Easy Way',           fob: 5.95,  retail: 45,  lead: 60,  moq: 100, sizes: 'one-size',  hts: '6215.20.0000', duty: 7,    fits: [] },
  { id: 'belts',         name: 'Leather Belts',             code: 'BELT', cat: 'Accessories', vendor: 'Scime',                    fob: 16.60, retail: 58,  lead: 60,  moq: 50,  sizes: 'one-size',  hts: '4203.20.4000', duty: 18.7, fits: [] },
  { id: 'socks',         name: 'Everyday Comfort Socks',    code: 'SCK',  cat: 'Accessories', vendor: '',                         fob: 2.5,   retail: 8,   lead: 60,  moq: 200, sizes: 'socks',     hts: '6115.95',      duty: 12.8, fits: [] },
  { id: 'hats',          name: 'Hats & Caps',               code: 'HAT',  cat: 'Accessories', vendor: '',                         fob: 8,     retail: 64,  lead: 60,  moq: 50,  sizes: 'onesize',   hts: '6505.00',      duty: 7.9,  fits: [] },
  { id: 'cufflinks',     name: 'Cufflinks',                 code: 'CLK',  cat: 'Accessories', vendor: '',                         fob: 6,     retail: 48,  lead: 60,  moq: 50,  sizes: 'onesize',   hts: '7117.19',      duty: 11,   fits: [] },
  // ── Shoes ──
  { id: 'dress-shoe',    name: 'Italian Dress Shoes',       code: 'SHO',  cat: 'Shoes',       vendor: 'Dino Draghi',              fob: 62,    retail: 245, lead: 120, moq: 30,  sizes: 'shoes',     hts: '6403.59',      duty: 8.5,  fits: [] },
  { id: 'luxury-shoe',   name: 'Luxury Italian Shoes',      code: 'LXS',  cat: 'Shoes',       vendor: 'Manifattura Italiana Calzature', fob: 95, retail: 395, lead: 120, moq: 20, sizes: 'shoes',  hts: '6403.59',      duty: 8.5,  fits: [] },
  // ── Boys ──
  { id: 'boys-suit',     name: 'Boys Suit Sets',            code: 'BSUIT', cat: 'Boys',       vendor: 'Shandong (DY17)',          fob: 41.5,  retail: 180, lead: 95,  moq: 50,  sizes: 'boys',      hts: '6203.11.9010', duty: 17.5, fits: [] },
  { id: 'boys-shirt',    name: 'Gentlo Boys Shirt',         code: 'GNTLO', cat: 'Boys',       vendor: 'The Orient Apparel (TAL)', fob: 11,    retail: 40,  lead: 90,  moq: 50,  sizes: 'boys',      hts: '6205.20.2015', duty: 20,   fits: [] },
  { id: 'boys-blazer',   name: 'Boys Washable Blazer',      code: 'BWB',  cat: 'Boys',        vendor: 'Shandong (DY17)',          fob: 35,    retail: 125, lead: 75,  moq: 30,  sizes: 'boys',      hts: '6203.11',      duty: 17.5, fits: [] },
  { id: 'boys-pant',     name: 'Boys Essential Pants',      code: 'BEP',  cat: 'Boys',        vendor: 'Serena',                   fob: 10,    retail: 39,  lead: 60,  moq: 100, sizes: 'boys',      hts: '6203.42',      duty: 16.5, fits: [] },
];

// Build lookup maps
const MP_BY_ID = {};
for (const mp of MP_SEEDS) MP_BY_ID[mp.id] = mp;

// ── Matching engine ─────────────────────────────────────────

/**
 * Match a Shopify product to an MP seed ID.
 * @param {string} title - Shopify product title
 * @param {number} maxPrice - Max variant price (for hc360 vs hc480 split)
 * @returns {string|null} MP seed ID, or null if no match
 */
function matchProduct(title, maxPrice = 0) {
  if (/do not use/i.test(title)) return null;

  for (const [seedId, matcher] of Object.entries(TITLE_MATCHERS)) {
    try {
      if (matcher(title, maxPrice)) return seedId;
    } catch (e) { /* skip broken matchers */ }
  }
  return null;
}

/**
 * Resolve an alias to its canonical MP seed ID.
 * @param {string} id - MP seed ID or alias
 * @returns {string} Canonical MP seed ID
 */
function resolveAlias(id) {
  return ALIASES[id] || id;
}

/**
 * Match all Shopify products to MPs and return the grouped result.
 * @param {Array} shopifyProducts - Raw Shopify products
 * @returns {{ matched: Object, unmatched: Array }}
 */
function matchAll(shopifyProducts) {
  const matched = {};   // { seedId: [shopifyProduct, ...] }
  const unmatched = []; // Shopify products that didn't match any MP

  for (const sp of shopifyProducts) {
    const maxPrice = Math.max(...(sp.variants || []).map(v => parseFloat(v.price) || 0), 0);
    const seedId = matchProduct(sp.title, maxPrice);

    if (seedId) {
      const canonical = resolveAlias(seedId);
      if (!matched[canonical]) matched[canonical] = [];
      matched[canonical].push(sp);
    } else {
      unmatched.push(sp);
    }
  }

  return { matched, unmatched };
}

/**
 * PLM Lifecycle stages — derived from canonical domain model.
 * MP_LIFECYCLE is the source of truth (lib/domain.js).
 * PLM_STAGES is the backward-compatible export for existing code.
 */
const { MP_LIFECYCLE } = require('./domain');
const PLM_STAGES = MP_LIFECYCLE.map(s => ({
  id: s.id,
  name: s.name,
  gate: s.gate,
  desc: s.desc,
  canCreatePO: s.canCreatePO,
  artifacts: s.artifacts,
}));

// ── Exports ─────────────────────────────────────────────────

// ── Seasonal Multipliers ────────────────────────────────────
const { SEASONAL_MULTIPLIERS, DEMAND, DISTRIBUTION_WEIGHTS, LANDED_COST_FACTOR } = require('./constants');

function getSeasonalMultiplier(month) {
  return SEASONAL_MULTIPLIERS[month || new Date().getMonth() + 1] || 1.0;
}

function adjustVelocity(baseVelocity, month) {
  return baseVelocity * getSeasonalMultiplier(month);
}

// ── Demand Signals ──────────────────────────────────────────
// Classify MPs by sell-through + velocity. From original prototype.

function classifyDemand(sellThrough, velocityPerWeek) {
  if (sellThrough >= DEMAND.HOT_SELL_THROUGH && velocityPerWeek >= DEMAND.HOT_VELOCITY) return 'hot';
  if (sellThrough >= DEMAND.RISING_SELL_THROUGH && velocityPerWeek >= DEMAND.RISING_VELOCITY) return 'rising';
  if (sellThrough < DEMAND.SLOW_SELL_THROUGH && velocityPerWeek < DEMAND.SLOW_VELOCITY) return 'slow';
  return 'steady';
}

// ── Distribution Weights ────────────────────────────────────

function suggestDistribution(totalUnits) {
  const result = {};
  let remaining = totalUnits;
  const stores = Object.entries(DISTRIBUTION_WEIGHTS);
  for (let i = 0; i < stores.length; i++) {
    const [store, weight] = stores[i];
    if (i === stores.length - 1) {
      result[store] = remaining; // last store gets remainder to avoid rounding gaps
    } else {
      const qty = Math.round(totalUnits * weight);
      result[store] = qty;
      remaining -= qty;
    }
  }
  return result;
}

// ── Landed Cost ─────────────────────────────────────────────

function landedCost(fob, dutyPct, freightPct = 8) {
  return fob * (1 + (dutyPct || 0) / 100 + freightPct / 100);
}

// ── Reorder Quantity ────────────────────────────────────────

function reorderQuantity(mp, { coverWeeks } = {}) {
  const { TARGET_COVER_WEEKS } = require('./constants');
  const weeks = coverWeeks || TARGET_COVER_WEEKS;
  const velocity = mp.velocity_per_week || 0;
  const stock = mp.total_inventory || 0;
  const incoming = mp.incoming_units || 0; // from active POs
  const target = Math.ceil(velocity * weeks);
  const deficit = target - stock - incoming;
  return Math.max(0, deficit);
}

module.exports = {
  CATEGORIES,
  SIZE_GROUPS,
  TITLE_MATCHERS,
  ALIASES,
  MP_SEEDS,
  MP_BY_ID,
  PLM_STAGES,
  SEASONAL_MULTIPLIERS,
  DISTRIBUTION_WEIGHTS,
  matchProduct,
  resolveAlias,
  matchAll,
  getSeasonalMultiplier,
  adjustVelocity,
  classifyDemand,
  suggestDistribution,
  landedCost,
  reorderQuantity,
};
