#!/usr/bin/env node
// scripts/shots.mjs — screenshot the real app, headless, for visual verification.
//
//   npm run shots                      every view, dark theme
//   npm run shots -- --theme both      dark + light
//   npm run shots -- --views screener,portfolio
//   npm run shots -- --width 420       mobile widths (the layout has real breakpoints)
//   npm run shots -- --scroll 700      shoot a section below the fold
//   npm run shots -- --live            hit the real /api/* instead of the fixture
//
//   SHOTS_YAHOO_DOWN=1 npm run shots -- --views screener
//     makes /api/yahoo answer 429 for every symbol. The intraday quote path is
//     the one that degrades in production (Yahoo rate-limits unkeyed calls from
//     datacenter IPs unless MASSIVE_PROXY_BULK routes them), and the degraded
//     render — the tape's "intraday quotes unavailable" banner plus its fall back
//     to the snapshot's session figures — is otherwise impossible to photograph.
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
import { TT } from "../src/tt.js";
import { mergeEcon } from "../src/econ.js";

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
const SCROLL = +arg("scroll", 0);            // inspect a below-the-fold section

/* ── the views worth looking at ─────────────────────────────────────────
   `state` seeds localStorage before first paint; `act` runs after load for
   anything that isn't persisted (the screener's sub-tab is local state). */
// one in-universe holding, one OFF-universe holding with a date the user typed
const HOLDINGS = [
  { tk: "NVDA", shares: 100, cost: 62, ern: null, entry: new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), at: 1767225600000 },
  { tk: "NBIS", shares: null, cost: null, ern: new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10), at: 1767225600000 },
];

/* A live economic calendar. The radar merges these in as extra events, and they
   exist ONLY in that merge — which is exactly why starring one used to vanish
   from the watchlist. The fixture carries them so the merged path is in a shot
   rather than only the curated template. */
const ECON_FEED = [
  { date: new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10) + " 14:00:00", event: "Michigan Consumer Sentiment Prel", country: "US", impact: "High", previous: 61.2, estimate: 62, actual: null, unit: "" },
  { date: new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10) + " 12:30:00", event: "Housing Starts", country: "US", impact: "High", previous: 1.32, estimate: 1.35, actual: null, unit: "M" },
];
// derived through mergeEcon itself, so the star key can never drift from the id
// the app actually assigns
const LIVE_EV = mergeEcon(TT.EVENTS, ECON_FEED.map((e) => ({
  date: new Date(e.date.replace(" ", "T") + "Z"), event: e.event, country: e.country,
  impact: e.impact.toLowerCase(), previous: e.previous, estimate: e.estimate, actual: e.actual, unit: e.unit,
}))).events.find((e) => e.live && String(e.id).startsWith("econ:"));
const WATCHED = [
  { key: "ev:2", kind: "event", ref: 2, name: "FOMC Rate Decision", at: 1767225600000 },
  ...(LIVE_EV ? [{ key: "ev:" + LIVE_EV.id, kind: "event", ref: LIVE_EV.id, name: LIVE_EV.title, at: 1767225600001 }] : []),
  // a star whose release has left the calendar window — kept and stated, not
  // dropped, and the row that proves it is in the shot
  { key: "ev:econ:2020-01-02:retired-release", kind: "event", ref: "econ:2020-01-02:retired-release", name: "Retired Release", at: 1767225600002 },
  { key: "tk:NVDA", kind: "stock", ref: "NVDA", at: 1767225600003 },
];

const VIEWS = [
  /* the landing page. It answers "/" only for a visitor who has NOT accepted the
     disclaimer, so this view deliberately does not seed tt_disclaimer_ack_v1 —
     seeding it is exactly what would route the shot to the terminal instead. */
  { id: "landing", path: "/", noAck: true, state: { } },
  { id: "radar",     state: { tt_product: "radar",   tt_tab: "radar" } },
  { id: "timeline",  state: { tt_product: "radar",   tt_tab: "timeline" } },
  // seeded with a HELD off-universe name (NBIS, not in the S&P snapshot) carrying
  // a user-set report date — that combination is the one that has broken before,
  // so the calendar and portfolio shots both exercise it every run
  { id: "calendar",  state: { tt_product: "radar", tt_tab: "calendar", tt_positions: HOLDINGS } },
  { id: "vol",       state: { tt_product: "radar",   tt_tab: "vol" } },
  // the Volume tab's filtered branch. The two panels filter INDEPENDENTLY, so
  // this shoots opposite directions in each — a shared-state regression would
  // show up as both panels moving together.
  { id: "volsort",   state: { tt_product: "radar",   tt_tab: "vol" }, act: async (p) => {
      await p.locator('[data-panel="dv"] button', { hasText: /^Declining/ }).first().click();
      await p.locator('[data-panel="rvol"] button', { hasText: /^Advancing/ }).first().click();
      await p.waitForTimeout(400);
    } },
  // the watchlist has never been in a screenshot, and it is where a starred live
  // economic release silently disappeared for as long as the feature has existed
  { id: "watch", state: { tt_product: "radar", tt_tab: "radar", tt_watch: WATCHED },
    act: async (p) => { await p.locator(".watch-btn").first().click(); await p.waitForTimeout(500); } },
  { id: "screener",  state: { tt_product: "canslim" } },
  // the extended tier: a second payload, fetched only when this filter is picked.
  // Worth its own shot because "nothing happened" and "it merged" look identical
  // in a diff — the coverage line beside the filter is the visible proof.
  /* An index filter whose tag no name carries. It is a real production state —
     the Nasdaq and Dow constituent endpoints are gated above FMP's Starter plan
     — and it used to render as an empty board with nothing to explain it. */
  { id: "screeneridx", state: { tt_product: "canslim" }, act: async (p) => {
      await p.locator('.seg-btn', { hasText: /^Dow 30$/ }).first().click();
      await p.waitForTimeout(500);
    } },
  { id: "screenerext", state: { tt_product: "canslim" }, act: async (p) => {
      await p.locator('.seg-btn', { hasText: /^Beyond index$/ }).first().click();
      await p.waitForTimeout(700);
    } },
  /* The dead-feed states. SHOTS_DEAD_FEED=1 empties the snapshot's macro and vix
     blocks and makes ?tier=ext answer "pending" — the two panels and the screener
     state that only ever render when something upstream has failed, and which are
     therefore the least-looked-at surface in the app. */
  { id: "dead", state: { tt_product: "radar", tt_tab: "radar" }, dead: true },
  { id: "deadext", state: { tt_product: "canslim" }, dead: true, act: async (p) => {
      await p.locator('.seg-btn', { hasText: /^Beyond index$/ }).first().click();
      await p.waitForTimeout(700);
    } },
  { id: "map",       state: { tt_product: "canslim" }, act: (p) => click(p, "Market Map") },
  { id: "health",    state: { tt_product: "canslim" }, act: (p) => click(p, "Market Health") },
  { id: "portfolio", state: { tt_product: "canslim", tt_positions: HOLDINGS }, act: (p) => click(p, "Portfolio") },
  /* `tt_pb_seen` matters: the explainer auto-opens on a first visit, so without
     it every Playbook shot ever taken photographed the explainer and not the
     split pane underneath — the tiles, the EMA rail and the sizing box were
     never in a picture. `playbookhelp` keeps the explainer covered too. */
  { id: "playbook",  state: { tt_product: "canslim", tt_pb_seen: 1 }, act: async (p) => {
      await click(p, "Playbook");
      await p.locator(".pb-row").first().click().catch(() => {});
      await p.waitForTimeout(400);
    } },
  { id: "playbookhelp", state: { tt_product: "canslim" }, act: (p) => click(p, "Playbook") },
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
// the fixture prices every name at 80 + 37i; the bar series has to agree
let TK_ORDER = [];
const TK_INDEX = (sym) => { const i = TK_ORDER.indexOf(sym); return i >= 0 ? i : 0; };
// [sector, [industry groups]] — mirrors the shape normSector() produces
const FIX_SECTORS = [
  ["Technology", ["Semiconductors", "Software - Infrastructure", "Software - Application"]],
  ["Financial Services", ["Banks - Diversified", "Capital Markets"]],
  ["Healthcare", ["Biotechnology", "Medical Devices"]],
  ["Consumer Cyclical", ["Internet Retail", "Restaurants"]],
  ["Energy", ["Oil & Gas E&P"]],
  ["Industrials", ["Aerospace & Defense", "Specialty Industrial Machinery"]],
];
/* The extended tier's names — mid-caps outside the S&P, which is exactly what
   `?tier=ext` serves in production. Kept short: the point of the shot is that a
   second payload merges in and the coverage line states its size, not breadth. */
const EXT_TK = ["ALAB", "CELH", "DUOL", "RBLX", "TOST", "IOT", "CAVA", "ONON", "OKLO", "GRAL"];

/* One name's worth of snapshot record. Factored out because the extended tier is
   a SECOND payload of the same shape (api/snapshot.js?tier=ext), and a fixture
   that built it differently would stop testing the merge path the client
   actually runs on it. */
function nameRecord(t, i, idx) {
    const px = 80 + i * 37;
    const quotes = {}, sig = {}, meta = {}, earnings = {};
    quotes[t] = { price: px, changePercentage: ((i % 7) - 3) * 0.9, timestamp: 1767225600 };
    // Sector AND industry vary. Every name sharing one industry meant the
    // industry-group panel rendered a single group, so its scroller — and the
    // group ordering it exists to make navigable — were never in a shot.
    const sec = FIX_SECTORS[i % FIX_SECTORS.length];
    meta[t] = { name: `${t} Corporation`, sector: sec[0], industry: sec[1][i % sec[1].length], idx };
    earnings[t] = { d: day(2 + i * 3), t: i % 2 ? "amc" : "bmo", last: null };
    sig[t] = {
      stage: 2, stageLabel: "Advancing", off52: (i % 9) + 1, atHigh: i % 4 === 0, ret12m: 15 + i * 6,
      rsNewHigh: i % 3 === 0, rsLeads: i % 5 === 0, adrPct: 2.4, dollarVol: 9e8, distDays: i % 4,
      pocketPivot: i % 6 === 0, udVol: 1 + (i % 5) / 10, above50: true, atLow: false, asOf: day(0),
      // the RRG's 6-point tail. Without it `rrgOf` returns null for every row and
      // the whole rotation panel sat on "Waiting for live data…" in every shot —
      // a panel the harness has therefore never actually verified.
      rrg: Array.from({ length: 6 }, (_, k) => ({
        ratio: +(100 + ((i % 9) - 4) * 1.6 + k * (((i % 5) - 2) * 0.24)).toFixed(2),
        mom: +(100 + ((i % 7) - 3) * 1.3 + k * (((i % 4) - 1.5) * 0.3)).toFixed(2),
      })),
      ret: { d1: ((i % 7) - 3) * 0.9, w1: (i % 5) + 1, m1: (i % 11) + 2, m3: (i % 23) + 4, y1: 15 + i * 6 },
      // DELIBERATELY different from quotes[t].changePercentage above. The row's
      // session change must come from the bars, and a fixture where the two
      // agreed could not show which one the merge actually picked.
      chgD: +(((i % 7) - 3) * 0.9 + 0.07).toFixed(2),
      // 60 points, matching sampleSpark's real resolution, with a different
      // trajectory and amplitude per name — an identical shape on every row
      // would hide exactly the flatness the real chart is meant to reveal
      spark: (() => {
        const trend = ((i % 5) - 1.6) * 0.42;             // -0.67%..+1.4% per step
        const amp = 1.5 + (i % 4) * 2.6;                  // quiet names stay quiet
        let v = px / (1 + (trend * 60) / 100);
        return Array.from({ length: 60 }, (_, k) => {
          v *= 1 + trend / 100;
          return +(v * (1 + (amp / 100) * Math.sin((k + i * 3) / 3.7))).toFixed(2);
        });
      })(),
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
  return { quote: quotes[t], sig: sig[t], meta: meta[t], earn: earnings[t] };
}

/* Shaped like api/snapshot.js's ext payload: quotes/sig/meta only. No market,
   flow or macro — those stay measured on the core universe on purpose, and a
   fixture that carried them here would be testing a merge the app never does. */
function extFixture() {
  const quotes = {}, sig = {}, meta = {};
  EXT_TK.forEach((t, k) => {
    const r = nameRecord(t, TK_ORDER.indexOf(t), ["ext"]);
    quotes[t] = r.quote; sig[t] = r.sig; meta[t] = r.meta;
  });
  return { schema: 10, tier: "ext", generatedAt: new Date(1767225600000).toISOString(), source: "fixture",
    status: "ok", count: EXT_TK.length, total: EXT_TK.length, asOf: 1767225600000,
    screen: { minCap: 2e9, minVol: 4e5, exchanges: ["NASDAQ", "NYSE"], cap: 900 },
    quotes, sig, meta };
}

function fixture() {
  // The real snapshot covers the S&P 500 union the curated list, so nearly every
  // screener row arrives with signals. A fixture of 12 unrelated symbols left the
  // visible rows falling back to tt.js's editorial seeded curves — which made the
  // shots show the *fallback* while claiming to show the feature.
  const TK = [...new Set([
    ...TT.CANSLIM.slice(0, 40).map((s) => s.tk),
    "NVDA", "AVGO", "CRDO", "APP", "GEV", "HOOD", "MU", "ANET", "MRVL", "VRT", "NFLX", "AXON",
  ])];
  TK_ORDER = [...TK, ...EXT_TK];       // so yahooBars can price a symbol the same way
  const quotes = {}, sig = {}, meta = {}, earnings = {};
  TK.forEach((t, i) => {
    // index tags: most names are S&P 500, a slice is also Nasdaq-100, a few are
    // Dow — and some are in NO index, so "Any index" is visibly wider than "S&P 500"
    // deliberately NO "dow" anywhere: the `screeneridx` view needs a filter whose
    // tag nothing carries, which is exactly the production failure being covered
    const idx = i % 9 === 8 ? [] : ["sp500", ...(i % 3 === 0 ? ["ndx"] : [])];
    const r = nameRecord(t, i, idx);
    quotes[t] = r.quote; sig[t] = r.sig; meta[t] = r.meta; earnings[t] = r.earn;
  });
  // VIX history is [{d, v}] — the chart reads p.v, so an array of bare numbers
  // makes every point undefined, NaN the path and render an EMPTY chart with no
  // error. That is exactly what happened here and it went unnoticed across
  // several screenshot runs, because the panel's chrome still draws fine.
  const series = Array.from({ length: 66 }, (_, k) => ({
    d: new Date(Date.UTC(2026, 4, 1) + k * 864e5).toISOString().slice(0, 10),
    v: +(15 + 4 * Math.sin(k / 6) + (k % 5) / 3).toFixed(2),
  }));
  return {
    generatedAt: new Date(1767225600000).toISOString(), source: "fixture", count: TK.length,
    total: TK.length, asOf: 1767225600000, quotes, sig, meta, earnings, changes: null,
    // shapes must match what api/snapshot.js actually emits — rates carry a
    // numeric `v` + `bp`, fx/comm a numeric `v` + `chg`, cpi is a bare object,
    // and market health needs its `breadth` block (the screener reads it)
    market: {
      trend: "Confirmed Uptrend", trendNote: "Above 50-DMA", distDays: 2, distMax: 6, lastFTD: day(-28),
      // The Index Health card was rendering EMPTY in every shot because this was
      // `[]`. The Dow row deliberately carries a null change and a null 200-day
      // read: those are the paths that used to print a green +0.00% and an
      // indistinguishable "below the average" chip, and a fixture without them
      // is how that shipped in the first place.
      indexes: [
        { k: "S&P 500", price: 5820.44, chg: 0.62, above50: true, above200: true, spark: series.slice(-30).map((r) => r.v) },
        { k: "Nasdaq", price: 18944.10, chg: 0.91, above50: true, above200: true, spark: series.slice(-30).map((r) => r.v * 1.02) },
        { k: "Russell 2000", price: 2288.73, chg: -0.34, above50: false, above200: true, spark: series.slice(-30).map((r) => r.v * 0.98) },
        { k: "Dow", price: 43110.28, chg: null, above50: true, above200: null, spark: [] },
      ],
      stages: { counts: { 1: 2, 2: 7, 3: 2, 4: 1 }, n: 12 },
      breadth: { n: 12, newHighs: 3, newLows: 0, pctAbove50: 78, advDec: 2.4, upVolPct: 63 },
      asOf: 1767225600000,
    },
    macro: {
      rates: [{ k: "US 2Y", v: 4.12, bp: -3 }, { k: "US 10Y", v: 4.38, bp: 2 },
              { k: "US 30Y", v: 4.61, bp: 1 }, { k: "Fed funds", v: 4.75, bp: 0 }],
      fx: [{ k: "DXY", v: 104.2, chg: 0.18, idx: true }, { k: "EUR/USD", v: 1.0842, chg: -0.11 },
           { k: "USD/JPY", v: 151.9, chg: 0.24 }],
      comm: [{ k: "Gold", v: 2412.4, chg: 0.42 }, { k: "Silver", v: 60.15, chg: 3.96 }, { k: "Brent crude", v: 78.86, chg: -0.63 }],
      crypto: [{ k: "Bitcoin", v: 63999.34, chg: 0.84 }, { k: "Ethereum", v: 1869.64, chg: 0.6 }],
      cpi: { v: 3.1, chg: -0.1, asOf: day(-20) },
    },
    vix: { level: 16.4, chg: -2.1, avg50: 15.2, hi52: 34.8, lo52: 11.9, series },
    // mirrors vixContext() + flowBlock() in api/snapshot.js. The two lists are
    // deliberately DIFFERENT sets: heaviest-dollar-volume is the mega-caps,
    // unusual-volume is whoever spiked. A fixture where they matched would hide
    // the whole reason there are two panels.
    vol: { level: 16.4, chg: -2.1, pct1y: 38, hist: series.map((r) => ({ d: r.d, v: r.v })) },
    // mirrors sectorEtfs() in api/snapshot.js. Spread across leading and lagging
    // so the diverging bar is exercised in both directions — a fixture where
    // every sector led would never draw the left half of it.
    sectors: {
      spy: { w1: 0.9, m1: 2.4, m3: 5.1, y1: 14.2 },
      rows: [
        ["XLK", "Technology", 241.30, 0.82, 6.1], ["XLC", "Communication Services", 108.44, 0.41, 3.4],
        ["XLF", "Financial Services", 51.02, 0.18, 1.9], ["XLI", "Industrials", 142.77, -0.12, 0.7],
        ["XLY", "Consumer Cyclical", 214.05, 0.34, 0.2], ["XLV", "Healthcare", 138.61, -0.28, -0.9],
        ["XLB", "Basic Materials", 92.18, -0.44, -1.6], ["XLE", "Energy", 88.94, -1.12, -2.8],
        ["XLP", "Consumer Defensive", 79.36, -0.21, -3.5], ["XLU", "Utilities", 76.12, 0.09, -4.2],
        ["XLRE", "Real Estate", 41.88, -0.63, -5.7],
      ].map(([tk, sector, px, chg, relM1]) => ({
        tk, sector, px, chg,
        ret: { w1: +(0.9 + relM1 / 6).toFixed(2), m1: +(2.4 + relM1).toFixed(2),
               m3: +(5.1 + relM1 * 1.6).toFixed(2), y1: +(14.2 + relM1 * 2.2).toFixed(2) },
        rel: { w1: +(relM1 / 6).toFixed(2), m1: relM1,
               m3: +(relM1 * 1.6).toFixed(2), y1: +(relM1 * 2.2).toFixed(2) },
      })),
    },
    flow: (() => {
      // price and direction key off the ticker's position in TK, not its rank in
      // whichever list — a name appearing in both must carry the same figures in
      // both, or a real inconsistency bug would be invisible against the noise
      const at = (t) => TK.indexOf(t);
      const mk = (t, dv, rvol) => {
        const i = at(t), px = 80 + i * 37;
        return { tk: t, name: `${t} Corporation`, sector: "Technology", px,
          chg: ((i % 7) - 3) * 0.9, dv, vol: Math.round(dv / px), rvol, dollarVol: Math.round(dv * 0.8) };
      };
      const heavy = TK.slice(0, 30).map((t, i) => mk(t, (52 - i * 2.1) * 1e9 / 10, +(0.8 + (i % 7) * 0.14).toFixed(2)));
      const unusual = TK.slice(6, 36).map((t, i) => mk(t, (9 - i * 0.3) * 1e8, +(6.2 - i * 0.18).toFixed(2)));
      return { heavy, unusual, n: 41, totDv: 412e9, advDv: 236e9, decDv: 176e9, upShare: 57.3, liquidFloor: 5e6 };
    })(),
  };
}

// Deterministic daily bars for the /api/yahoo proxy shape. The series peaks
// mid-window so the peak-since-entry lookup has something real to find.
function yahooBars(sym) {
  const n = 120, bars = [];
  // Scaled to the SAME price the snapshot quotes for this symbol. A flat 60–100
  // series against a $339 quote made the portfolio's trail read "74% room" — the
  // arithmetic was right and the inputs were incoherent, which is the harder kind
  // of wrong to spot in a screenshot. The shape ENDS at the quoted price and
  // peaks ~2% above it, so a trail has a real high-water mark to follow and a
  // little room left: overshoot the peak and every holding reads "stop hit".
  const px = 80 + TK_INDEX(sym) * 37;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // peakSince() follows bar HIGHS, and highs are close×1.012 below — so the
    // bump has to stay under the trail width (~3.6% of price) or the peak lands
    // above price+width and every holding reads "stop hit"
    const close = px * (0.78 + 0.22 * t + 0.05 * Math.sin(t * Math.PI));
    bars.push({
      date: new Date(Date.UTC(2026, 3, 1) + i * 864e5).toISOString().slice(0, 10),
      open: +close.toFixed(2), high: +(close * 1.012).toFixed(2),
      low: +(close * 0.988).toFixed(2), close: +close.toFixed(2), volume: 1e6,
    });
  }
  const last = bars[bars.length - 1];
  // varies by symbol: this also backs the tape's intraday refresh, and a constant
  // would make 14 refreshed names print the same number — which is exactly the
  // "the tape isn't live" symptom the refresh exists to fix
  const seed = [...sym].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { symbol: sym, price: last.close, previousClose: bars[n - 2].close,
    changePercentage: +(((seed % 17) - 8) * 0.37).toFixed(2), timestamp: 1767225600, currency: "USD", bars };
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
const SNAP_EXT = JSON.stringify(extFixture());
// the same payload minus the FMP-fed blocks: macro, vix and the earnings dates
// go dark together because they ride one call, and that pairing is the thing the
// degraded copy names
const SNAP_DEAD = JSON.stringify({ ...fixture(), macro: null, vix: null, vol: null, earnings: null });
const SNAP_EXT_PENDING = JSON.stringify({ tier: "ext", status: "pending", reason: "NOT_YET_COMPUTED",
  count: 0, total: 0, quotes: {}, sig: {}, meta: {} });
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
        // tier=ext BEFORE the core test — the ext URL contains "/api/snapshot"
        // too, and answering it with the core payload would make the widened
        // universe look like it merged when nothing new arrived at all
        if (u.includes("endpoint=economic")) body = JSON.stringify(ECON_FEED);
        else if (u.includes("tier=ext")) body = v.dead ? SNAP_EXT_PENDING : SNAP_EXT;
        else if (u.includes("/api/snapshot")) body = v.dead ? SNAP_DEAD : SNAP;
        // /api/yahoo backs the peak-since-entry lookup for held positions
        else if (u.includes("/api/yahoo")) {
          // SHOTS_YAHOO_DOWN=1 — see the header. Exercises the degraded path.
          if (process.env.SHOTS_YAHOO_DOWN) return r.fulfill({ status: 429, contentType: "application/json", body: '{"error":"rate limited"}' });
          const sym = (u.match(/symbol=([^&]+)/) || [])[1] || "X";
          body = JSON.stringify(yahooBars(decodeURIComponent(sym)));
        }
        return r.fulfill({ status: 200, contentType: "application/json", body });
      });
    }
    await page.addInitScript(([state, theme, noAck]) => {
      if (!noAck) localStorage.setItem("tt_disclaimer_ack_v1", "1");   // skip the legal gate
      localStorage.setItem("tt_mode", JSON.stringify(theme));
      for (const [k, val] of Object.entries(state)) localStorage.setItem(k, JSON.stringify(val));
    }, [v.state || {}, theme, !!v.noAck]);

    try {
      await page.goto(`http://127.0.0.1:${port}${v.path || "/terminal"}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1600);                        // let the feed settle
      if (v.act) await v.act(page);
      await page.waitForTimeout(400);
      if (SCROLL) { await page.evaluate((y) => window.scrollTo(0, y), SCROLL); await page.waitForTimeout(350); }
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
