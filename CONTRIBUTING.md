# Contributing to Atica Ops

## Branch rules — read before touching anything

**Never push directly to `main`.** It's protected. Use your branch.

| Session | Branch | Owns |
|---------|--------|------|
| Shrek | `feat/shrek-mps` | Master products, styles, product stack |
| Deshawn | `feat/deshawn-cashflow` | Cash flow, POs, stage gates, AP |
| Stallon | `feat/stallon-api` | Netlify functions, Shopify API layer, `/api/*` routes |
| Nikita | `feat/nikita-modules` | Module split, v2 architecture, `modules/` |
| Oboosu | `feat/oboosu-backend` | Backend infra, `lib/`, caching, data layer |

## Workflow

```
1. Pull main into your branch before starting work
   git checkout feat/your-branch
   git pull origin main

2. Make your changes

3. Push to your branch (NOT main)
   git push origin feat/your-branch

4. Open a PR → main when ready
```

## Files — who owns what

- `atica_app.html` — **everyone touches this, everyone must pull first**
- `netlify.toml` — **Stallon only**. Do not touch this without pulling.
- `netlify/functions/shopify.js` — Stallon
- `netlify/functions/products|orders|inventory|pos|ledger|status.js` — Stallon/Oboosu
- `modules/cash-flow.js` — Deshawn
- `modules/marketplace.js` — Shrek
- `lib/` — Oboosu
- `modules/event-bus.js` — Nikita

## Critical: `netlify.toml` must always have

1. `included_files = ["lib/**"]` under `[functions]`
2. SPA fallback at the bottom:
```toml
[[redirects]]
  from   = "/*"
  to     = "/atica_app.html"
  status = 200
```

Removing either breaks the entire site.

## Data version

`DATA_VERSION` in `window.onload` controls localStorage cache invalidation.
Bump it (v31 → v32 etc.) only when seed data structure changes.
**One bump per deploy max** — coordinate with Deshawn before bumping.
