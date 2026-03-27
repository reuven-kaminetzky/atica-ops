/**
 * Master Products — Seeds, Title Matchers, Categories
 * 
 * Product Type → Master Product → Style → Fit → Size → Length → SKU
 * 
 * MP = one construction, one factory spec, one FOB, one vendor relationship.
 * Style = a colorway of an MP (one Shopify product = one style).
 * Grade = A/B/C/D — how core a style is (drives reorder priority).
 * 
 * MATCHING RULES (from Reuven, March 2026):
 *   - HC suits split by VENDOR not price. Shandong/WZ = Half Canvas $360.
 *     JYY/Barberis/Italian = Italian Half Canvas $480.
 *   - Shirts: Londoner is own MP. Milano/Edinburgh/Royal Oxford = White Dress.
 *     Bengal/Windowpane/etc = Colored Dress. Knit ≠ Polo (separate MPs).
 *   - Pants: Parkway + Essential = one MP. Luxury Performance = one MP.
 *   - Boys: Suits separate from Shirts. Blazers + pants go with suits.
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

// ── Grades ──────────────────────────────────────────────────
// A = core (deepest buy, always reorder). B = strong. C = marginal. D = test/seasonal.
const GRADES = ['A', 'B', 'C', 'D'];

// ── Title Matchers ──────────────────────────────────────────
// ORDER MATTERS — first match wins. More specific matchers go first.

const TITLE_MATCHERS = {
  // ── Shirts (6 MPs) ──
  //   Londoner = own MP. White dress = Milano/Edinburgh/RoyalOxford/Tuxedo/BandCollar.
  //   Colored dress = Bengal/Windowpane/Pinpoint/OxfordBD/Brooklyner/generic dress.
  //   Knit = knit fabric shirts (not polo). Polo = polo. Everyday = performance/linen/casual.
  'londoner':       t => /londoner/i.test(t) && !/boys/i.test(t),
  'polo':           t => (/\bpolo\b/i.test(t) || /buttonless.*polo/i.test(t)) && !/boys/i.test(t) && !/do not use/i.test(t),
  'knit':           t => /knit.*shirt/i.test(t) && !/polo/i.test(t) && !/boys/i.test(t) && !/suit/i.test(t),
  'everyday':       t => (/performance.*(shirt|tee)/i.test(t) || /linen.*shirt/i.test(t) || /casual.*shirt/i.test(t)) && !/do not use/i.test(t) && !/boys/i.test(t),
  'white-dress':    t => (/milano/i.test(t) || /edinburgh/i.test(t) || /royal\s+oxford/i.test(t) || /tuxedo\s+shirt/i.test(t) || /band\s+collar/i.test(t)) && !/boys/i.test(t),
  'colored-dress':  t => (/bengal/i.test(t) || /windowpane/i.test(t) || /pinpoint/i.test(t) || /oxford\s+button/i.test(t) || /brooklyner/i.test(t) || /herringbone/i.test(t) || (/dress\s+(shirt|collar)/i.test(t) || /CML\s+MC\s+Shirt/i.test(t)) && !/milano/i.test(t) && !/edinburgh/i.test(t) && !/royal\s+oxford/i.test(t) && !/tuxedo/i.test(t) && !/band\s+collar/i.test(t)) && !/boys/i.test(t) && !/performance/i.test(t) && !/do not use/i.test(t),

  // ── Suits (5 MPs) ──
  //   Split by vendor/identity, not price. Shandong/WZ = Half Canvas.
  //   JYY/Barberis/Italian = Italian Half Canvas. Full Canvas = new.
  'full-canvas':    t => /full\s+canvas/i.test(t) && !/boys/i.test(t) && !/do not use/i.test(t),
  'italian-hc':     (t, p) => (/half\s+canvas/i.test(t) || /barberis/i.test(t)) && (/italian/i.test(t) || /barberis/i.test(t) || /jyy/i.test(t) || p > 400) && !/boys/i.test(t) && !/do not use/i.test(t),
  'hc-suit':        (t, p) => (/half\s+canvas\s+(suit|pant)/i.test(t)) && !/italian/i.test(t) && !/barberis/i.test(t) && !/boys/i.test(t) && !/do not use/i.test(t) && p <= 400,
  'wash-suit':      t => /washable\s+suit/i.test(t) && !/boys/i.test(t),
  'summer-suit':    t => /summer.*suit/i.test(t) || /linen.*suit/i.test(t),

  // ── Blazers ──
  'wash-blazer':    t => /parkway.*blazer/i.test(t) || (/travel\s+blazer/i.test(t) && !/cerruti/i.test(t)),
  'travel-blazer':  t => /cerruti/i.test(t),
  'maggia':         t => /maggia/i.test(t),

  // ── Pants (3 MPs) ──
  //   Parkway + Essential = one MP. Luxury Performance = one MP. Cotton = new.
  'cotton-pant':    t => /cotton.*(pant|trouser|chino)/i.test(t) && !/boys/i.test(t),
  'luxury-pant':    t => (/luxury.*performance.*pant/i.test(t) || /parkway.*dress.*pant/i.test(t)) && !/boys/i.test(t),
  'parkway':        t => ((/parkway/i.test(t) && /pant|stretch/i.test(t)) || /essential.*stretch/i.test(t)) && !/dress.*pant/i.test(t) && !/boys/i.test(t),
  'suit-pant':      t => /suit\s+pant/i.test(t) && !/boys/i.test(t) && !/do not use/i.test(t) && !/essential/i.test(t) && !/parkway/i.test(t) && !/half\s+canvas/i.test(t),

  // ── Outerwear ──
  'kapote':         t => /kapote/i.test(t) && !/silk/i.test(t),
  'silk-kapote':    t => /silk.*kapote/i.test(t),
  'raincoat':       t => /overcoat/i.test(t) || /raincoat/i.test(t),
  'sweater':        t => (/cardigan|pullover|zip.?up/i.test(t) || (/\bknit\b/i.test(t) && !/shirt/i.test(t) && !/suit/i.test(t) && !/half/i.test(t) && !/polo/i.test(t))) && !/boys/i.test(t),

  // ── Accessories ──
  'ties':           t => /\btie\b/i.test(t) || /\bties\b/i.test(t),
  'belts':          t => /\bbelt\b/i.test(t),
  'socks':          t => /\bsock/i.test(t),
  'cufflinks':      t => /cufflink/i.test(t),
  'hats':           t => /\bcap\b/i.test(t) || /\bhat\b/i.test(t),

  // ── Shoes ──
  'dress-shoe':     t => /oxford.*shoe/i.test(t) || /wholecut/i.test(t) || /dress\s+shoe/i.test(t) || /brogue/i.test(t),
  'luxury-shoe':    t => /loafer/i.test(t) || /beatle/i.test(t) || /monk/i.test(t) || /chelsea/i.test(t) || /buckle\s+strap/i.test(t) || /brace\s+/i.test(t),

  // ── Boys (2 MPs) ── suits+blazers+pants together, shirts separate
  'boys-suit':      t => /boys.*(suit|half\s+canvas|blazer|pant|trouser)/i.test(t) && !/shirt/i.test(t) && !/do not use/i.test(t),
  'boys-shirt':     t => /boys.*(shirt|londoner|polo)/i.test(t) && !/do not use/i.test(t),
};

// Aliases — redirect to canonical MP
const ALIASES = {
  // Old IDs that other code might reference → new canonical IDs
  'hc360':          'hc-suit',
  'hc480':          'italian-hc',
  '5pkt':           'parkway',
  'dress':          'colored-dress',
  'milano':         'white-dress',
  'edinburgh':      'white-dress',
  'bengal':         'colored-dress',
  'oxford-bd':      'colored-dress',
  'linen-shirt':    'everyday',
  'perf-shirt':     'everyday',
  'tuxedo-shirt':   'white-dress',
  'band-collar':    'white-dress',
  'windowpane':     'colored-dress',
  'herringbone':    'colored-dress',
  'royal-oxford':   'white-dress',
  'pinpoint':       'colored-dress',
  'boys-blazer':    'boys-suit',
  'boys-pant':      'boys-suit',
  'shoes-ital':     'dress-shoe',
  'shoes-lux':      'luxury-shoe',
};

// ── MP Seeds ────────────────────────────────────────────────
// Corrected March 2026 per Reuven.

const MP_SEEDS = [
  // ── Shirts (6 MPs) ──
  { id: 'londoner',      name: 'The Londoner',              code: 'LON',   cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 12.50, retail: 56,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6205.20.2015', duty: 20,   fits: ['Modern (Extra Slim)', 'Contemporary (Slim)', 'Classic With Pocket', 'Classic No Pocket'] },
  { id: 'white-dress',   name: 'White Dress Shirts',        code: 'WDS',   cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 15,    retail: 68,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6205.20',      duty: 20,   fits: ['Modern (Extra Slim)', 'Contemporary (Slim)', 'Classic'] },
  { id: 'colored-dress', name: 'Colored Dress Shirts',      code: 'CDS',   cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 14,    retail: 60,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6205.20',      duty: 20,   fits: ['Modern (Extra Slim)', 'Contemporary (Slim)', 'Classic'] },
  { id: 'knit',          name: 'Knit Shirts',               code: 'KNT',   cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 13,    retail: 52,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6105.10',      duty: 27.5, fits: [] },
  { id: 'polo',          name: 'Polo Shirts',               code: 'POLO',  cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 11,    retail: 40,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6105.10.0010', duty: 27.5, fits: ['S', 'M', 'L', 'XL', 'XXL'] },
  { id: 'everyday',      name: 'Everyday Shirts',           code: 'EVD',   cat: 'Shirts',      vendor: 'The Orient Apparel (TAL)', fob: 16,    retail: 68,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6205.20',      duty: 20,   fits: [] },

  // ── Suits (5 MPs) ──
  { id: 'hc-suit',       name: 'Half Canvas Suit',          code: 'HC',    cat: 'Suits',       vendor: 'Shandong (DY17)',          fob: 41.50, retail: 360, lead: 90,  moq: 50,  sizes: 'suits',  hts: '6203.11.9010', duty: 17.5, fits: ['Lorenzo 6', 'Lorenzo 4', 'Alexander 4', 'Alexander 2'] },
  { id: 'italian-hc',    name: 'Italian Half Canvas',       code: 'IHC',   cat: 'Suits',       vendor: 'Wenzhou JYY Garments',     fob: 62,    retail: 480, lead: 90,  moq: 50,  sizes: 'suits',  hts: '6203.11.9010', duty: 17.5, fits: ['Lorenzo 6', 'Lorenzo 4', 'Alexander 4', 'Alexander 2'] },
  { id: 'full-canvas',   name: 'Full Canvas Luxury',        code: 'FC',    cat: 'Suits',       vendor: '',                         fob: 90,    retail: 650, lead: 120, moq: 30,  sizes: 'suits',  hts: '6203.11.9010', duty: 17.5, fits: [] },
  { id: 'wash-suit',     name: 'Washable Suit',             code: 'WSUIT', cat: 'Suits',       vendor: 'Shandong (DY17)',          fob: 33.50, retail: 420, lead: 90,  moq: 50,  sizes: 'suits',  hts: '6203.11.9010', duty: 17.5, fits: [] },
  { id: 'summer-suit',   name: 'Summer Weight Suit',        code: 'SWS',   cat: 'Suits',       vendor: 'Ningbo Youngor (YGR)',     fob: 65,    retail: 295, lead: 90,  moq: 50,  sizes: 'suits',  hts: '6203.11',      duty: 17.5, fits: [] },

  // ── Blazers ──
  { id: 'wash-blazer',   name: 'Parkway Travel Blazer',     code: 'PARK',  cat: 'Blazers',     vendor: 'Shandong (DY17)',          fob: 33.50, retail: 179, lead: 90,  moq: 50,  sizes: 'suits',  hts: '6203.31.9010', duty: 17.5, fits: [] },
  { id: 'travel-blazer', name: 'Cerruti Travel Blazer',     code: 'CERR',  cat: 'Blazers',     vendor: 'Sharmoon',                 fob: 95,    retail: 360, lead: 90,  moq: 50,  sizes: 'suits',  hts: '6203.31.9010', duty: 17.5, fits: [] },
  { id: 'maggia',        name: 'Maggia Knit Blazer',        code: 'MAG',   cat: 'Blazers',     vendor: 'Maglificio Maggia',        fob: 50,    retail: 198, lead: 90,  moq: 30,  sizes: 'suits',  hts: '6104.33',      duty: 28.2, fits: [] },

  // ── Pants (3 + suit-pant) ──
  { id: 'parkway',       name: 'Parkway & Essential Pants',  code: 'PKWY', cat: 'Pants',       vendor: 'Shandong (DY17)',          fob: 13.95, retail: 75,  lead: 90,  moq: 200, sizes: 'pants',  hts: '6203.42.4010', duty: 24.1, fits: ['Slim', 'Regular', 'Relaxed'] },
  { id: 'luxury-pant',   name: 'Luxury Performance Pants',   code: 'LUXP', cat: 'Pants',       vendor: 'The Orient Apparel (TAL)', fob: 14,    retail: 125, lead: 90,  moq: 50,  sizes: 'pants',  hts: '6203.42.4010', duty: 24.1, fits: [] },
  { id: 'cotton-pant',   name: 'Cotton Pants',               code: 'COTN', cat: 'Pants',       vendor: '',                         fob: 12,    retail: 65,  lead: 90,  moq: 100, sizes: 'pants',  hts: '6203.42',      duty: 24.1, fits: [] },
  { id: 'suit-pant',     name: 'Suit Separates Pants',       code: 'SPNT', cat: 'Pants',       vendor: 'Shandong (DY17)',          fob: 16,    retail: 72,  lead: 90,  moq: 100, sizes: 'pants',  hts: '6203.42',      duty: 24.1, fits: [] },

  // ── Outerwear / Kapote ──
  { id: 'kapote',        name: 'Kapote',                     code: 'KAP',  cat: 'Kapote',      vendor: 'Wenzhou JYY Garments',     fob: 72,    retail: 340, lead: 105, moq: 50,  sizes: 'kapote', hts: '6201.11.0000', duty: 14,   fits: [] },
  { id: 'silk-kapote',   name: 'Silk Kapote',                code: 'SKP',  cat: 'Kapote',      vendor: 'Wenzhou JYY Garments',     fob: 72,    retail: 295, lead: 90,  moq: 20,  sizes: 'kapote', hts: '6201.19',      duty: 8.5,  fits: [] },
  { id: 'raincoat',      name: 'Wool Raincoat',              code: 'RNC',  cat: 'Outerwear',   vendor: 'Shandong (DY17)',          fob: 75,    retail: 295, lead: 75,  moq: 50,  sizes: 'suits',  hts: '6201.11',      duty: 17.5, fits: [] },
  { id: 'sweater',       name: 'Knit Sweaters',              code: 'SWT',  cat: 'Outerwear',   vendor: '',                         fob: 18,    retail: 89,  lead: 90,  moq: 50,  sizes: 'shirts', hts: '6110.20',      duty: 17.5, fits: [] },

  // ── Accessories ──
  { id: 'ties',          name: "Men's Ties",                 code: 'TIE',  cat: 'Accessories', vendor: 'Hefei Easy Way',           fob: 5.95,  retail: 45,  lead: 60,  moq: 100, sizes: 'one-size', hts: '6215.20.0000', duty: 7,  fits: [] },
  { id: 'belts',         name: 'Leather Belts',              code: 'BELT', cat: 'Accessories', vendor: 'Scime',                    fob: 16.60, retail: 58,  lead: 60,  moq: 50,  sizes: 'one-size', hts: '4203.20.4000', duty: 18.7, fits: [] },
  { id: 'socks',         name: 'Everyday Comfort Socks',     code: 'SCK',  cat: 'Accessories', vendor: '',                         fob: 2.5,   retail: 8,   lead: 60,  moq: 200, sizes: 'socks',    hts: '6115.95',      duty: 12.8, fits: [] },
  { id: 'hats',          name: 'Hats & Caps',                code: 'HAT',  cat: 'Accessories', vendor: '',                         fob: 8,     retail: 64,  lead: 60,  moq: 50,  sizes: 'onesize',  hts: '6505.00',      duty: 7.9,  fits: [] },
  { id: 'cufflinks',     name: 'Cufflinks',                  code: 'CLK',  cat: 'Accessories', vendor: '',                         fob: 6,     retail: 48,  lead: 60,  moq: 50,  sizes: 'onesize',  hts: '7117.19',      duty: 11,   fits: [] },

  // ── Shoes ──
  { id: 'dress-shoe',    name: 'Italian Dress Shoes',        code: 'SHO',  cat: 'Shoes',       vendor: 'Dino Draghi',              fob: 62,    retail: 245, lead: 120, moq: 30,  sizes: 'shoes',  hts: '6403.59',      duty: 8.5,  fits: [] },
  { id: 'luxury-shoe',   name: 'Luxury Italian Shoes',       code: 'LXS',  cat: 'Shoes',       vendor: 'Manifattura Italiana Calzature', fob: 95, retail: 395, lead: 120, moq: 20, sizes: 'shoes', hts: '6403.59', duty: 8.5, fits: [] },

  // ── Boys (2 MPs) — suits+blazers+pants together, shirts separate ──
  { id: 'boys-suit',     name: 'Boys Suits & Sets',          code: 'BSUIT', cat: 'Boys',       vendor: 'Shandong (DY17)',          fob: 41.5,  retail: 180, lead: 95,  moq: 50,  sizes: 'boys',   hts: '6203.11.9010', duty: 17.5, fits: [] },
  { id: 'boys-shirt',    name: 'Boys Shirts',                code: 'BSHRT', cat: 'Boys',       vendor: 'The Orient Apparel (TAL)', fob: 11,    retail: 40,  lead: 90,  moq: 50,  sizes: 'boys',   hts: '6205.20.2015', duty: 20,   fits: [] },
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
