# TigerTrade Dashboards

Two trading dashboards in one app, switchable from the top bar:

1. **Volatility & Momentum Radar** *(default)* — the Master Volatility & Growth
   Momentum Event Template for 2026–2027. Tracks the scheduled catalysts that
   drive cross-asset volatility, grouped into five regimes:
   - **Central Bank & Sovereign Liquidity** — FOMC, BoJ, ECB, Treasury QRA, fiscal X-dates
   - **Mechanical Flow Rebalancing** — quad witching, S&P / Nasdaq-100 / Russell reconstitutions
   - **Growth & Tech-Thematic Catalysts** — earnings seasons, NVIDIA GTC, Apple WWDC, Google I/O, mega-cap IPOs
   - **High-Impact Macro Data** — NFP, CPI/PPI, ISM PMIs
   - **Geopolitical, Commodity & Regulatory** — US midterms, OPEC+, DOJ/antitrust

   Views: **Radar** (countdown to upcoming events), **Full Timeline** (grouped by
   month), **Calendar** (month grid with event dots), and **Playbook + AI**
   (regime reference + a Claude-generated volatility briefing). Filter by
   category, minimum weight, or free-text search.

   > FOMC, quadruple-witching (3rd Friday), Russell reconstitution (last Friday
   > of June), NFP (first Friday) and the US midterms use exact dates. Items
   > marked `~` (BoJ, ECB, QRA, CPI/PPI, ISM, earnings windows, conferences,
   > OPEC+) are projected from standard schedules — verify against official
   > calendars before trading.

2. **CANSLIM Screener** — a methodology-faithful CAN SLIM relative-strength
   screener. Each name is scored on all seven criteria — **C** (current
   earnings), **A** (annual earnings), **N** (new high / catalyst), **S** (supply
   & demand / accumulation), **L** (leader RS rank), **I** (institutional
   sponsorship), **M** (market direction) — into a 0–100 composite and letter
   grade. Features:
   - **Screener** — sortable/filterable universe with per-letter pass-fail chips,
     RS rank, and live **buy-zone** detection (Basing → Approaching → In Buy Zone
     → Extended vs. the pivot)
   - **Market Health** — the "M" gate: index trend vs. 50/200-DMA, distribution-day
     count, last follow-through day, and breadth. CAN SLIM says buy only in a
     Confirmed Uptrend.
   - **Playbook** — the seven criteria plus O'Neil's buy/sell rules
   - Click any row for a full scorecard, an auto-generated **trade plan** (5% buy
     zone, –8% stop, +20–25% targets), and a Claude **AI trade analysis**.

The whole site uses a crisp blue / orange / white design.

Both dashboards share a Claude-backed serverless proxy (`/api/claude`) so the
Anthropic API key never reaches the browser.

### Optional: live market data
The screener ships with a realistic **demo dataset** so it works with zero setup.
To wire in live quotes, set `FMP_API_KEY` in your Vercel project env vars (get a
key at https://site.financialmodelingprep.com); requests route through the
`/api/fmp` proxy. Note that batch quotes, index quotes and the stock screener
require a **paid FMP tier** — the free tier is limited.

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
the fetch URL in Dashboard.jsx from `/api/claude` to `/.netlify/functions/claude`.

---

## Project structure

```
tigertrade-dashboard/
├── api/
│   ├── claude.js            ← Claude proxy (keeps Anthropic key secure)
│   └── fmp.js               ← Optional live market-data proxy (FMP)
├── src/
│   ├── main.jsx             ← React entry point
│   ├── App.jsx              ← Product switcher shell
│   ├── EventDashboard.jsx   ← Volatility & Momentum Radar (default)
│   └── Dashboard.jsx        ← CANSLIM Screener
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```

---

## Features
- Two dashboards in one app with a crisp blue / orange / white UI
- **Volatility Radar:** 2026–2027 event calendar with countdowns, timeline,
  month-grid calendar, category/weight filters, and an AI volatility briefing
- **CANSLIM Screener:** full 7-criteria scoring → composite + letter grade,
  buy-zone detection, RS ranking, market-health gate, sortable/filterable table
- Click any stock → CAN SLIM scorecard, auto trade plan, and Claude AI analysis
- AI features via Claude API; optional live quotes via FMP
