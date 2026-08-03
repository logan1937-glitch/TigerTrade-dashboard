# TigerTrade Terminal

A dark, institutional-desk **trading terminal** with two products under one
shell, switchable from the top bar. Built on the *TigerTrade Terminal* design
system (Obsidian theme): a command palette (⌘K / `/`), a polar radar scope,
right-side analysis drawers, a persistent watchlist, and animated SVG charts.

1. **Volatility & Momentum Radar** *(default)* — a macro-event surveillance
   dashboard for 2026–2027. Tracks the scheduled catalysts that
   drive cross-asset volatility, grouped into five regimes:
   - **Central Bank & Sovereign Liquidity** — FOMC, BoJ, ECB, Treasury QRA, fiscal X-dates
   - **Mechanical Flow Rebalancing** — quad witching, S&P / Nasdaq-100 / Russell reconstitutions
   - **Growth & Tech-Thematic Catalysts** — earnings seasons, NVIDIA GTC, Apple WWDC, Google I/O, mega-cap IPOs
   - **High-Impact Macro Data** — NFP, CPI/PPI, ISM PMIs
   - **Geopolitical, Commodity & Regulatory** — US midterms, OPEC+, DOJ/antitrust

   Views: **Radar** (next-catalyst card, radar scope + expandable event rows),
   **Full Timeline** (month-grouped), **Calendar** (month grid with event chips),
   and **Playbook + AI** (desk briefing + watch list). Each event opens a
   right-side drawer with historical reaction stats, a move distribution, and
   cross-asset reaction. Filter by category, minimum weight, or free-text search.

   > FOMC, quadruple-witching (3rd Friday), Russell reconstitution (last Friday
   > of June), NFP (first Friday) and the US midterms use exact dates. Items
   > marked `~` (BoJ, ECB, QRA, CPI/PPI, ISM, earnings windows, conferences,
   > OPEC+) are projected from standard schedules — verify against official
   > calendars before trading.

2. **Leadership Screener** — a relative-strength growth screener built on the
   **TigerTrade Leadership Model (LEADERS)**, our own 7-factor framework:
   **L** (Leadership / RS rank), **E** (Earnings momentum), **A** (Accumulation /
   volume demand), **D** (Durable annual growth), **E** (Emerging breakout / new
   high), **R** (Rising institutional sponsorship), **S** (Setup — market trend).
   Each name scores 0–100 with a letter grade. Features:
   - **Screener** — sortable/filterable universe with per-factor pass-fail chips,
     RS rank, and live **buy-zone** detection (Basing → Approaching → In Buy Zone
     → Extended vs. the pivot). The **Window** control (1D/1W/1M/3M/1Y) is the
     period everything is *measured and ranked* over, not just a price format:
     price change, the RS percentile, the leadership **L** chip and the score all
     recompute over it, so switching to 3M re-ranks the board on 3-month
     relative strength. It defaults to 1Y — the model's classic 12-month
     definition — and any column not showing 1Y is labelled with its window
     (`RS · 3M`, `Score · 3M`).
   - **Market Health** — the "Setup" gate: index trend vs. 50/200-DMA,
     distribution-day count, last follow-through day, and breadth. Buy only in a
     Confirmed Uptrend.
   - **Playbook** — an AI screener read plus an "actionable now" list of names in
     their buy zone.

   > The TigerTrade Leadership Model's factors follow classic leadership-investing
   > principles popularized by **William J. O'Neil**. TigerTrade is independent
   > and not affiliated with, sponsored by, or endorsed by Investor's Business
   > Daily; **CAN SLIM®** is a registered trademark of Investor's Business
   > Daily, Inc. Educational use only — not investment advice.
   - Click any row for a right-side stock drawer: price/volume chart with pivot &
     buy-zone band, RS line, buy-point analysis, the 7-criteria breakdown,
     fundamentals, and thesis.

The site uses the dark **Obsidian** terminal theme (warm amber accent) with a
token-based design system, grain overlay, and motion that respects
`prefers-reduced-motion`.

A Claude-backed serverless proxy (`/api/claude`) is available for AI features so
the Anthropic API key never reaches the browser.

### Live market data (recommended before trading)
The screener attempts to load **live quotes** on every visit. Its data state is
shown in the Leadership Screener hero line:

- **Live prices · as of … · N/N live** (green pulse) — price and % change are
  live and recompute the **buy-zone status in real time** (live price vs. pivot).
- **Demo prices · not live** (red) — the live feed is unavailable, so the screener
  falls back to an illustrative dataset that is **clearly labeled and never
  presented as real**.

To turn the feed on, set `FMP_API_KEY` in your Vercel project env vars (get a key
at https://site.financialmodelingprep.com); requests route through the `/api/fmp`
proxy (your key never reaches the browser). Single-symbol quotes work on the free
tier; the dashboard tries a batch call first and falls back to per-symbol quotes
automatically.

**What's live vs. analyst-maintained:** prices, % moves, off-52-week-high and
relative volume come live from FMP. The slower-moving Leadership-model inputs —
earnings growth, RS rank, institutional read, pivot, base pattern and catalyst —
are maintained in the editorial dataset and labeled as model inputs, not live
quotes. Verify against your broker before trading.

### Precompute snapshot + durable storage (optional, for scale)
`/api/snapshot` computes the whole universe's quotes + momentum signals server-side
and serves them in one request, so the browser doesn't fetch every name. A daily
**cron** (`vercel.json`, weekdays 22:00 UTC) refreshes it after the US close.

By default the snapshot is edge-cached. To make it **durable** (the cron writes it
once; user requests only *read* it, never recompute — needed as the universe grows
to hundreds), connect a **Vercel Blob** store:
1. Vercel → your project → **Storage → Create → Blob** → connect it.
2. Vercel auto-adds the `BLOB_READ_WRITE_TOKEN` env var. Redeploy.
3. The snapshot now reads/writes Blob automatically; without it, it falls back to
   compute-on-demand + edge cache (zero setup, still works).

### Report dates for names outside the S&P 500
The shared snapshot is the same for everyone, so it can't carry report dates for
*your* holdings outside the tracked universe. `/api/earnings?symbols=NBIS,ASML`
fills that gap, trying each source in turn and stopping at the first real answer:

| # | Source | Cost | Notes |
|---|--------|------|-------|
| 1 | Blob cache | 0 requests | A date resolved once is served to everyone afterwards. |
| 2 | Yahoo `chart` `events=earn` | 1 request | No cookie, no crumb. The same endpoint the snapshot already reaches ~500×/night, so it's the Yahoo path known to work from this deployment. |
| 3 | Yahoo `quoteSummary` | 3 requests | Richer (projected-date flag, EPS history, revenue) but cookie+crumb gated, so it costs a handshake first. Asked only when the chart returns no date or no reported quarter. |
| 4 | Stale cache | 0 requests | A date from an earlier read, flagged `stale`, rather than a blank. |

**FMP is deliberately not in this list.** Verified twice against the live API:
per-symbol `earnings`, `income-statement` and `financial-estimates` all answer
ACCESS DENIED on this plan, and the `earnings-calendar` it does serve returned 21
mega-cap names for a 17-day window — names the nightly snapshot already carries.
It could never answer for the off-universe holdings this endpoint exists for, so
calling it was two guaranteed-failing round trips per request.

Every result is written back to the Blob store, so one success anywhere is
permanent. Add `&debug=1` to see the status code of every upstream hop (no
cookie or crumb value is ever echoed), or `&refresh=1` to bypass the cache.

If every source is silent for a listing — which happens, these are free feeds —
set the date yourself on the position (**Portfolio → add**, or **Edit position**
in the stock drawer). It's stored on-device with the rest of the position and
shown tagged `yours` everywhere, never as a confirmed date.

---

## Deploy to Vercel (recommended — free, ~5 minutes)

### Step 1 — Get your Anthropic API key
1. Go to https://console.anthropic.com
2. Click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Install Vercel CLI
```bash
npm install -g vercel
```

### Step 3 — Deploy
```bash
cd TigerTrade-dashboard
npm install
vercel
```

Follow the prompts:
- Set up and deploy? **Y**
- Which scope? Pick your account
- Link to existing project? **N**
- Project name: `canslim-dashboard` (or anything)
- Directory: **./** (default)
- Override settings? **N**

### Step 4 — Add your API key to Vercel
```bash
vercel env add ANTHROPIC_API_KEY
```
Paste your key when prompted. Select **Production**, **Preview**, and **Development**.

### Step 5 — Redeploy with the env variable
```bash
vercel --prod
```

Your dashboard is now live at `https://canslim-dashboard-[yourname].vercel.app` 🎉

---

## Run locally (for development)

```bash
npm install
```

Create a `.env` file:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Then run:
```bash
npm run dev
```

Open http://localhost:5173

---

## Alternative: Deploy to Netlify

1. Push this folder to a GitHub repo
2. Go to https://netlify.com → **Add new site** → **Import from Git**
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Add environment variable: `ANTHROPIC_API_KEY` = your key
6. Deploy

For Netlify, rename `api/claude.js` to `netlify/functions/claude.js` and update
any `/api/claude` fetch URL to `/.netlify/functions/claude`.

---

## Project structure

```
tigertrade-dashboard/
├── api/
│   ├── claude.js            ← Claude proxy (keeps Anthropic key secure)
│   └── fmp.js               ← Live market-data proxy (FMP)
├── src/
│   ├── main.jsx             ← React entry point (imports terminal.css)
│   ├── terminal.css         ← Design tokens + all terminal styling
│   ├── App.jsx              ← Terminal shell: routing, state, drawers, watchlist
│   ├── tt.js                ← Data namespace (events, stats, CANSLIM dataset)
│   ├── liveData.js          ← Live FMP quote fetch + merge
│   ├── components.jsx       ← Top bar, hero, stat strip, radar view, watch ctx
│   ├── radarScope.jsx       ← Polar event radar scope
│   ├── charts.jsx           ← SVG chart primitives
│   ├── views.jsx            ← Calendar / Timeline / Playbook
│   ├── commandPalette.jsx   ← ⌘K command palette
│   ├── drawer.jsx           ← Drawer shell + event / stock / watchlist bodies
│   └── canslim.jsx          ← CANSLIM screener / market health / playbook
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```

---

## Features
- **TigerTrade Terminal** — dark Obsidian theme, token-based design system,
  grain overlay, reduced-motion-aware animations
- **Command palette** (⌘K / `/`) — jump to any view, toggle filters, or open any
  event drawer
- **Volatility Radar:** next-catalyst card, polar **radar scope**, expandable
  event rows, timeline, month-grid calendar, category/weight filters, and an
  event drawer with historical reaction stats + move distribution
- **Leadership Screener:** 7-factor (LEADERS) scoring → composite + grade, per-row trend
  sparklines, **live buy-zone detection**, RS ranking, market-health cards, and a
  full stock drawer (price/volume chart, RS line, buy-point analysis)
- **Persistent watchlist** — star any event or ticker; survives reloads
- **Live prices** via FMP (price & % change drive the buy zone); honest
  live/demo state, never fake-as-real
- AI proxy (`/api/claude`) available for future AI features
