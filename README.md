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

2. **CANSLIM RS Dashboard** — a CANSLIM-inspired relative strength trading
   dashboard with per-stock AI scorecards.

Both share a Claude-backed serverless proxy (`/api/claude`) so the Anthropic
API key never reaches the browser.

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
cd canslim-dashboard
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
│   └── claude.js            ← Serverless proxy (keeps API key secure)
├── src/
│   ├── main.jsx             ← React entry point
│   ├── App.jsx              ← Product switcher shell
│   ├── EventDashboard.jsx   ← Volatility & Momentum Radar (default)
│   └── Dashboard.jsx        ← CANSLIM RS dashboard
├── index.html
├── package.json
├── vercel.json
└── vite.config.js
```

---

## Features
- Industry group RS rankings (15 groups)
- Watchlist with CANSLIM scoring for 8 stocks
- Click any stock → full C-A-N-S-L-I-M scorecard
- AI analysis per stock via Claude API
- AI screener — ask anything about current market leaders
- Live market status bar
- Sort/filter by RS, composite rating, % change
