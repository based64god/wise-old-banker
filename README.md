# Wise Old Banker

Real-time market analysis for the Old School RuneScape Grand Exchange. Tracks price trends across every tradeable item, flags surging and crashing items, and surfaces high-margin flipping opportunities — all from live data, no account or API key required.

Data comes from the [OSRS Wiki Real-time Prices API](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices) and auto-refreshes every 90 seconds.

## Features

- **Market table** — every tradeable item with current price, 1h/6h price change, buy/sell margin, 1h volume, and volume ratio vs. baseline. Sortable by any column, with an option to sort % change by absolute value (biggest movers in either direction first).
- **Signals** — each item is classified from live data:
  - `SURGING` — price up >3% in the last hour with volume holding up
  - `CRASHING` — price down >3% in the last hour
  - `HIGH_MARGIN` — buy/sell spread >5%
  - `VOLUME_SPIKE` — 1h volume >2.5× the 24h baseline
- **Filters** — search by name, filter by signal tab, and hide items below a minimum 1h volume.
- **Item detail** — click any row for price/volume charts (via lightweight-charts) at multiple time intervals.
- **Momentum score** — items are ranked by a composite momentum score so the most interesting movers surface first.

## Getting started

Requires Node.js and [pnpm](https://pnpm.io), plus Docker (or Podman) for the local database.

```bash
pnpm install

# Start a local Postgres container and set DATABASE_URL in .env
./start-database.sh

pnpm dev
```

Then open http://localhost:3000.

> **Note:** the Grand Exchange analyzer itself is stateless — it reads directly from the wiki API. The database is only used by leftover T3 scaffolding, but `DATABASE_URL` must be set for env validation to pass.

## Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Dev server with Turbo |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm preview` | Build and serve in one step |
| `pnpm check` | Lint + typecheck |
| `pnpm format:write` | Format with Prettier |
| `pnpm db:push` / `db:studio` | Drizzle schema push / studio |

## Architecture

Built on the [T3 stack](https://create.t3.gg/): Next.js 15 (App Router), tRPC v11, Drizzle ORM, Tailwind CSS v4, and TypeScript.

- `src/server/api/routers/ge.ts` — the core. Fetches the wiki's `/mapping`, `/latest`, `/1h`, `/6h`, and `/24h` endpoints (with per-endpoint cache TTLs), computes price changes, margins, volume ratios, and a momentum score per item, and classifies signals. Also serves per-item timeseries for the detail charts.
- `src/app/_components/market-dashboard.tsx` — top-level dashboard: summary cards, signal tabs, search and volume filters.
- `src/app/_components/market-table.tsx` — the sortable item table.
- `src/app/_components/item-modal.tsx` — per-item chart modal.

Outlier volumes are damped using a modified Z-score (median absolute deviation) so a single flash-trade doesn't register as a volume spike.

Signals are for informational purposes only — flip responsibly.
