# CANSLIM RS Dashboard

A CANSLIM-inspired relative strength trading dashboard with live AI analysis powered by Claude.

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
canslim-dashboard/
├── api/
│   └── claude.js        ← Serverless proxy (keeps API key secure)
├── src/
│   ├── main.jsx         ← React entry point
│   └── Dashboard.jsx    ← Main dashboard component
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
