#!/usr/bin/env node
// scripts/shots.mjs — screenshot the real app, headless, for visual verification.
//
//   npm run shots                      every view, dark theme
//   npm run shots -- --theme both      dark + light
//   npm run shots -- --views screener,portfolio
//   npm run shots -- --width 420       mobile widths (the layout has real breakpoints)
//   npm run shots -- --live            hit the real /api/* instead of the fixture
//
// WHY THIS EXISTS. Most of this UI only tells the truth when it renders: CSS
// specificity traps, media-query overrides, panels that skeleton forever when a
// feed is empty. Reading the diff cannot catch those; a screenshot can. Output
// lands in shots/ (gitignored) — open the PNGs, or Read them if you're an agent.
//
// It serves ./dist, so run `npm run build` first (or pass --build).
//
// By default every /api/* call is answered from a DETERMINISTIC FIXTURE, so the
// same commit always produces the same pixels and the shots work with no network
// and no API keys. That fixture is fake data used only to exercise layout — it
// never ships to a user, which is the one place in this repo where synthetic
// numbers are legitimate. Use --live to shoot against real endpoints.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "shots");

/* ── args ──────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

const WIDTH = +arg("width", 1500);
const HEIGHT = +arg("height", 1000);
const THEME = arg("theme", "dark");           // dark | light | both
const LIVE = flag("live");
const ONLY = (arg("views", "") || "").split(",").map((s) => s.trim()).filter(Boolean);

/* ── the views worth looking at ─────────────────────────────────────────
   `state` seeds localStorage before first paint; `act` runs after load for
   anything that isn't persisted (the screener's sub-tab is local state). */
// one in-universe holding, one OFF-universe holding with a date the user typed
const HOLDINGS = [
  { tk: "NVDA", shares: 100, cost: 62, ern: null, entry: new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), at: 1767225600000 },
  { tk: "NBIS", shares: null, cost: null, ern: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10), at: 1767225600000 },
];

const VIEWS = [
  { id: "radar",     state: { tt_product: "radar",   tt_tab: "radar" } },
  { id: "timeline",  state: { tt_product: "radar",   tt_tab: "timeline" } },
  // seeded with a HELD off-universe name (NBIS, not in the S&P snapshot) carrying
  // a user-set report date — that combination is the one that has broken before,
  // so the calendar and portfolio shots both exercise it every run
  { id: "calendar",  state: { tt_product: "radar", tt_tab: "calendar", tt_positions: HOLDINGS } },
  // radar tab id is still "playbook" internally, but it renders (and is labelled) Catalysts
  { id: "catalysts", state: { tt_product: "radar",   tt_tab: "playbook" } },
  { id: "screener",  state: { tt_product: "canslim" } },
  { id: "map",       state: { tt_product: "canslim" }, act: (p) => click(p, "Market Map") },
  { id: "health",    state: { tt_product: "canslim" }, act: (p) => click(p, "Market Health") },
  { id: "portfolio", state: { tt_product: "canslim", tt_positions: HOLDINGS }, act: (p) => click(p, "Portfolio") },
  { id: "playbook",  state: { tt_product: "canslim" }, act: (p) => click(p, "Playbook") },
  // the stock drawer is where most of the component surface lives
  { id: "drawer",    state: { tt_product: "canslim" }, act: async (p) => {
      await p.locator(".cs-row").first().click();
      await p.waitForSelector(".dr", { timeout: 8000 });
    } },
];

// Prefix match, not exact: sub-tabs append a count badge when they have one
// ("Portfolio" becomes "Portfolio2" once positions exist), and an anchored
// exact match silently fell through to whatever view was already open.
const click = async (p, label) => {
  const b = p.locator("button", { hasText: new RegExp(`^${label}`) }).first();
  if (!(await b.count())) throw new Error(`no button matching "${label}"`);
  await b.click();
  await p.waitForTimeout(500);
};

/* ── deterministic fixture ───────────────────────────────────────────────
   Shaped exactly like /api/snapshot so the client's real merge path runs. */
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
function fixture() {
  const TK = ["NVDA", "AVGO", "CRDO", "APP", "GEV", "HOOD", "MU", "ANET", "MRVL", "VRT", "NFLX", "AXON"];
  const quotes = {}, sig = {}, meta = {}, earnings = {};
  TK.forEach((t, i) => {
    const px = 80 + i * 37;
    quotes[t] = { price: px, changePercentage: ((i % 7) - 3) * 0.9, timestamp: 1767225600 };
    meta[t] = { name: `${t} Corporation`, sector: "Technology", industry: "Semiconductors" };
    earnings[t] = { d: day(2 + i * 3), t: i % 2 ? "amc" : "bmo", last: null };
    sig[t] = {
      stage: 2, stageLabel: "Advancing", off52: (i % 9) + 1, atHigh: i % 4 === 0, ret12m: 15 + i * 6,
      rsNewHigh: i % 3 === 0, rsLeads: i % 5 === 0, adrPct: 2.4, dollarVol: 9e8, distDays: i % 4,
      pocketPivot: i % 6 === 0, udVol: 1 + (i % 5) / 10, above50: true, atLow: false, asOf: day(0),
      ret: { d1: ((i % 7) - 3) * 0.9, w1: (i % 5) + 1, m1: (i % 11) + 2, m3: (i % 23) + 4, y1: 15 + i * 6 },
      spark: Array.from({ length: 8 }, (_, k) => px * (0.9 + 0.03 * ((k + i) % 5))),
      pivot: px * 0.96, buyLo: px * 0.96, buyHi: px * 1.01, pctExt: 1.8,
      baseType: "Cup-with-handle", baseWeeks: 11, baseDepth: 24, status: "buy",
      // swing block (Playbook): spread widens across the set so some names sit
      // inside the 2% Launchpad threshold and some clearly don't
      swing: (() => {
        // EMAs stacked the way an uptrend actually stacks them — 21 above 50
        // above 65, price above all three — so the "Trend stacked" filter has
        // something to keep. Spread widens across the set, so some names fall
        // inside the 2% Launchpad threshold and some clearly don't.
        const spread = 0.4 + i * 0.55;                    // 0.4% … ~6.5%
        const e21 = px * 0.995;
        const e65 = e21 * (1 - spread / 100);
        const e50 = (e21 + e65) / 2;
        const atr = px * (0.012 + (i % 4) * 0.004);
        // Chandelier off a 22-day high just above price lands the stop BELOW
        // price for most names; one is left breached on purpose so the sizing
        // box's "already breached" branch is exercised in the shots too.
        const stop = i === 5 ? px * 1.01 : px * 1.02 - 3 * atr;
        return {
          atr: +atr.toFixed(3), atrPct: +((atr / px) * 100).toFixed(2),
          stop: +stop.toFixed(2),
          e21: +e21.toFixed(2), e50: +e50.toFixed(2), e65: +e65.toFixed(2),
          emaSpread: +spread.toFixed(2),
          cx: +(0.22 + (i % 6) * 0.13).toFixed(3),
          imp: +(4 + i * 2.5).toFixed(1),
        };
      })(),
    };
  });
  const series = Array.from({ length: 60 }, (_, k) => 15 + 4 * Math.sin(k / 6) + (k % 5) / 3);
  return {
    generatedAt: new Date(1767225600000).toISOString(), source: "fixture", count: TK.length,
    total: TK.length, asOf: 1767225600000, quotes, sig, meta, earnings, changes: null,
    // shapes must match what api/snapshot.js actually emits — rates carry a
    // numeric `v` + `bp`, fx/comm a numeric `v` + `chg`, cpi is a bare object,
    // and market health needs its `breadth` block (the screener reads it)
    market: {
      trend: "Confirmed Uptrend", trendNote: "Above 50-DMA", distDays: 2, distMax: 6, lastFTD: day(-28),
      indexes: [], stages: { counts: { 1: 2, 2: 7, 3: 2, 4: 1 }, n: 12 },
      breadth: { n: 12, newHighs: 3, newLows: 0, pctAbove50: 78, advDec: 2.4, upVolPct: 63 },
      asOf: 1767225600000,
    },
    macro: {
      rates: [{ k: "US 2Y", v: 4.12, bp: -3 }, { k: "US 10Y", v: 4.38, bp: 2 },
              { k: "US 30Y", v: 4.61, bp: 1 }, { k: "Fed funds", v: 4.75, bp: 0 }],
      fx: [{ k: "DXY", v: 104.2, chg: 0.18, idx: true }, { k: "EUR/USD", v: 1.0842, chg: -0.11 },
           { k: "USD/JPY", v: 151.9, chg: 0.24 }],
      comm: [{ k: "Gold", v: 2412.4, chg: 0.42 }, { k: "Silver", v: 60.15, chg: 3.96 }, { k: "WTI", v: 78.1, chg: -1.1 }],
      crypto: [{ k: "Bitcoin", v: 63999.34, chg: 0.84 }, { k: "Ethereum", v: 1869.64, chg: 0.6 }],
      cpi: { v: 3.1, chg: -0.1, asOf: day(-20) },
    },
    vix: { level: 16.4, chg: -2.1, avg50: 15.2, hi52: 34.8, lo52: 11.9, series },
  };
}

// Deterministic daily bars for the /api/yahoo proxy shape. The series peaks
// mid-window so the peak-since-entry lookup has something real to find.
function yahooBars(sym) {
  const n = 120, bars = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const close = 60 + 40 * Math.sin(t * Math.PI);            // rises, peaks, eases
    bars.push({
      date: new Date(Date.UTC(2026, 3, 1) + i * 864e5).toISOString().slice(0, 10),
      open: +close.toFixed(2), high: +(close * 1.012).toFixed(2),
      low: +(close * 0.988).toFixed(2), close: +close.toFixed(2), volume: 1e6,
    });
  }
  const last = bars[bars.length - 1];
  return { symbol: sym, price: last.close, previousClose: bars[n - 2].close,
    changePercentage: 0.4, timestamp: 1767225600, currency: "USD", bars };
}

/* ── static server for ./dist with SPA fallback ─────────────────────────── */
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "");
    let file = path.join(DIST, rel);
    if (!file.startsWith(DIST) || !rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(DIST, "index.html");                 // SPA fallback
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, port: server.address().port })));
}

/* ── playwright, wherever it lives ──────────────────────────────────────── */
async function loadChromium() {
  const candidates = ["playwright", "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
    "/usr/lib/node_modules/playwright/index.mjs"];
  for (const c of candidates) {
    try { const m = await import(c); if (m.chromium) return m.chromium; } catch { /* next */ }
  }
  console.error("\nCould not import playwright. Install it once:\n  npm i -D playwright && npx playwright install chromium\n");
  process.exit(1);
}
async function launch(chromium) {
  for (const opts of [{}, { executablePath: "/opt/pw-browsers/chromium" }, { channel: "chrome" }]) {
    try { return await chromium.launch(opts); } catch { /* next */ }
  }
  throw new Error("no usable chromium — run: npx playwright install chromium");
}

/* ── run ────────────────────────────────────────────────────────────────── */
if (flag("build")) { console.log("building…"); execSync("npm run build", { cwd: ROOT, stdio: "inherit" }); }
if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/ is empty — run `npm run build` first, or pass --build");
  process.exit(1);
}

const views = ONLY.length ? VIEWS.filter((v) => ONLY.includes(v.id)) : VIEWS;
if (!views.length) { console.error(`no matching views. known: ${VIEWS.map((v) => v.id).join(", ")}`); process.exit(1); }
const themes = THEME === "both" ? ["dark", "light"] : [THEME];

// Deliberately NOT wiped: filenames encode view/theme/width, so a re-run always
// overwrites exactly what it re-shoots. Clearing the directory meant two scoped
// runs in a row (`--views radar --theme light`, then `--width 420`) silently
// deleted the first one's output.
fs.mkdirSync(OUT, { recursive: true });

const chromium = await loadChromium();
const { server, port } = await serve();
const browser = await launch(chromium);
const SNAP = JSON.stringify(fixture());
let shot = 0, failed = 0;

for (const theme of themes) {
  for (const v of views) {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));

    if (!LIVE) {
      // ONE handler that dispatches on the URL. Two routes would be ambiguous:
      // playwright gives precedence to the LAST registered match, so a `**/api/**`
      // catch-all registered after `**/api/snapshot*` silently swallows the
      // fixture and every panel renders its feed-unavailable state instead.
      await page.route("**/api/**", (r) => {
        const u = r.request().url();
        let body = "{}";
        if (u.includes("/api/snapshot")) body = SNAP;
        // /api/yahoo backs the peak-since-entry lookup for held positions
        else if (u.includes("/api/yahoo")) {
          const sym = (u.match(/symbol=([^&]+)/) || [])[1] || "X";
          body = JSON.stringify(yahooBars(decodeURIComponent(sym)));
        }
        return r.fulfill({ status: 200, contentType: "application/json", body });
      });
    }
    await page.addInitScript(([state, theme]) => {
      localStorage.setItem("tt_disclaimer_ack_v1", "1");      // skip the legal gate
      localStorage.setItem("tt_mode", JSON.stringify(theme));
      for (const [k, val] of Object.entries(state)) localStorage.setItem(k, JSON.stringify(val));
    }, [v.state || {}, theme]);

    try {
      await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1600);                        // let the feed settle
      if (v.act) await v.act(page);
      await page.waitForTimeout(400);
      const file = path.join(OUT, `${v.id}-${theme}-${WIDTH}w.png`);
      await page.screenshot({ path: file, fullPage: flag("full") });
      shot++;
      console.log(`  ✓ ${path.relative(ROOT, file)}${errors.length ? `   ⚠ ${errors.length} page error(s): ${errors[0]}` : ""}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ ${v.id} (${theme}): ${String(e.message).split("\n")[0]}`);
    }
    await page.close();
  }
}

await browser.close();
server.close();
console.log(`\n${shot} shot${shot === 1 ? "" : "s"} in ${path.relative(ROOT, OUT)}/${failed ? `, ${failed} failed` : ""}${LIVE ? "  (live APIs)" : "  (fixture data)"}`);
process.exit(failed ? 1 : 0);
