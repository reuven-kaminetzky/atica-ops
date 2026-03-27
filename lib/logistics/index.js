/**
 * lib/logistics/index.js — Logistics Domain
 *
 * Physical movement: receiving, warehousing, transfers, van routing,
 * delivery, fulfillment. The bridge between Supply Chain and Inventory.
 *
 * Tables (to be created):
 *   bin_locations, transfers, van_routes, receiving_log
 *
 * This is a stub. The domain structure is defined in docs/ENGINEERING.md.
 * Build out receiving.js, transfers.js, routing.js as features are added.
 */

module.exports = {
  // --- Will be implemented as tables are created ---
  // receiving:  { start, verifyPackingList, flagDiscrepancy, complete }
  // transfer:   { create, pick, load, deliver, confirm, escalate }
  // van:        { planRoute, depart, complete }
  // warehouse:  { assignBin, findItem, cycleCcount }
  // fulfillment: { pick, pack, ship }

  // --- Placeholder for incoming queries ---
  // getIncomingForStore(store) → what's coming via van
  // getReceivingQueue() → containers to unpack
  // getPendingTransfers() → what needs to go out
  // getVanRouteForDate(date) → route plan
};
