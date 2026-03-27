# Atica Ops — System Architecture

> This is the foundation. Every decision flows from here.

## The System

Atica Ops is an operations platform for a menswear business with
4 retail stores, wholesale, and e-commerce. It manages the full lifecycle:
product development, sourcing, production, logistics, distribution,
sales, marketing, reorder.

## Pattern: Hexagonal + Event-Driven

```
               ┌───────────────────────────┐
               │       PERSPECTIVES        │
               │ Admin·Finance·PD·Marketing │
               │ Sales·Warehouse·Executive  │
               └─────────────┬─────────────┘
                             │
               ┌─────────────▼─────────────┐
               │       APPLICATION          │
               │  Commands · Queries · Views │
               └─────────────┬─────────────┘
                             │
     ┌───────────────────────▼───────────────────────┐
     │                DOMAIN CORE                     │
     │                                                │
     │  Entities: MP, PO, Shipment, Payment, Customer │
     │  Events: po.created, sale.recorded, ...        │
     │  Services: computeStatus, projectCashFlow      │
     │                                                │
     │  ZERO external dependencies. Pure logic.       │
     └──────┬────────────────────────────┬────────────┘
            │                            │
  ┌─────────▼──────────┐     ┌───────────▼───────────┐
  │   DRIVEN PORTS     │     │    DRIVING PORTS       │
  │ (domain talks TO)  │     │ (world talks TO domain)│
  │                    │     │                        │
  │ ProductRepo        │     │ HTTP API               │
  │ OrderRepo          │     │ Shopify Webhooks       │
  │ PaymentRepo        │     │ POS Events             │
  │ InventoryTracker   │     │ RFID Scanner           │
  │ MarketingPlatform  │     │ Cron Jobs              │
  │ NotificationSender │     │ Manual UI              │
  └─────────┬──────────┘     └───────────┬───────────┘
            │                            │
  ┌─────────▼────────────────────────────▼───────────┐
  │                  ADAPTERS                         │
  │                                                   │
  │ PostgresAdapter  — all repositories               │
  │ ShopifyAdapter   — bidirectional sync              │
  │ ShopifyPOS       — real-time store feed            │
  │ GoogleAdsAdapter — campaigns, ROAS, attribution    │
  │ MetaAdsAdapter   — FB/IG campaigns                 │
  │ RFIDAdapter      — item-level tracking (future)    │
  │ EmailAdapter     — alerts, reports                 │
  │                                                   │
  │ Each adapter is REPLACEABLE. Swap one, domain      │
  │ doesn't know.                                      │
  └───────────────────────────────────────────────────┘
```

## Core Principles

### 1. Domain Core Has ZERO Dependencies
Never imports database, HTTP, or external API libraries.
Defines interfaces (ports). Adapters implement them.
Entire business logic testable with `node test.js`.

### 2. Everything Is an Event
When something happens, a domain event is emitted.
Integrations subscribe. Decoupled by design.

```
Sale at POS
  → event: sale.recorded
    → inventory.deduct
    → cashflow.inflow
    → velocity.update
    → marketing.attribute
    → customer.update
    → reorder.check
```

Adding RFID? Write adapter, emit inventory.scanned. Nothing else changes.

### 3. Perspectives, Not Permissions
Each role has a different VIEW, not just access control.

| Role | Primary View | Actions |
|------|-------------|---------|
| Admin | System health | Everything |
| Finance | Cash flow, AP/AR | Mark paid, approve cost |
| PD | PLM pipeline | Advance phase, approve sample |
| Buyer | PO pipeline | Create PO, advance stage |
| Sales | POS, customers | Customer lookup, stock check |
| Marketing | Campaigns, ROAS | Launch campaign, budget |
| Warehouse | Receiving, RFID | Receive, transfer |

### 4. Adapters Are Swappable
Port = interface. Adapter = implementation.
Change platform = change adapter. Domain untouched.

## Directory Structure

```
lib/
  domain/
    entities.js        — MP, PO, Shipment, Payment, Customer, Vendor
    events.js          — event definitions, emitter, subscriber registry
    services.js        — computeMPStatus, projectCashFlow, etc.

  ports/
    repositories.js    — ProductRepo, OrderRepo, PaymentRepo interfaces
    integrations.js    — InventoryTracker, MarketingPlatform, etc.

  adapters/
    postgres/          — implements repositories
    shopify/           — bidirectional: read + write back
    google-ads/        — campaigns, ROAS
    meta-ads/          — FB/IG campaigns
    rfid/              — future
    email/             — notifications

  registry.js          — wires adapters to ports at startup

app/
  api/                 — thin HTTP layer
  (dashboard)/         — default perspective (admin)
  middleware.js        — auth + role routing

components/
  ui/                  — primitives
  shared/              — cross-role components
```

## Event Categories

Product: mp.created, mp.phase_changed, stack.updated
PO: po.created, po.stage_advanced, po.received
Inventory: inventory.synced, inventory.adjusted, inventory.low_stock
Sales: sale.recorded, sale.refunded, pos.transaction
Shipment: shipment.created, shipment.arrived
Marketing: campaign.launched, ad.spend_recorded
Customer: customer.created, customer.tier_changed

## Integration Roadmap

Phase 1: Ports + adapters for existing code (Postgres + Shopify read)
Phase 2: Event bus + wire side effects through events
Phase 3: Shopify write-back (push inventory, prices)
Phase 4: Perspectives (admin → finance → PD)
Phase 5: Marketing adapters (Google, Meta)
Phase 6: RFID adapter
Phase 7: Auth + RLS

Each phase is additive. Nothing gets rewritten.
