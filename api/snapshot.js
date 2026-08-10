// api/snapshot.js — Vercel Serverless Function (precompute snapshot)
// Computes the universe's quote + momentum signals and serves a single payload.
//
// Durable storage (optional): when a Vercel Blob store is connected
// (BLOB_READ_WRITE_TOKEN present), the daily cron writes the computed snapshot
// to Blob and normal reads return it INSTANTLY — no per-request recompute, no
// timeout risk as the universe grows. Without Blob it falls back to computing on
// demand and edge-caching, so it works with zero setup.

import { TT } from "../src/tt.js";
import { computeSignals, computeMarketHealth, compactSig } from "../src/signals.js";
import { SP500 } from "../src/sp500.js";
import { INDEX_FALLBACK } from "../src/indices.js";
import { put, list } from "@vercel/blob";
import { bulkFetch } from "./_upstream.js";
import { quoteFromChart } from "./_quote.js";

// index set for market health; ETF proxies cover any index symbol Yahoo denies
const INDICES = [
  { sym: "^GSPC", proxy: "SPY", label: "S&P 500" },
  { sym: "^IXIC", proxy: "QQQ", label: "Nasdaq" },
  { sym: "^RUT",  proxy: "IWM", label: "Russell 2000" },
  { sym: "^DJI",  proxy: "DIA", label: "Dow" },
];

export const maxDuration = 60;

const BLOB_KEY = "snapshot.json";
/* Payload shape version. A stored snapshot is only useful while it has the
   fields the current client reads, and Blob serves it verbatim — so after a
   deploy that ADDS a field (silver, crypto, the swing block…) the old snapshot
   would be served unchanged until the next cron, and the new section would just
   be missing with nothing to explain why. Bump this whenever compute() gains or
   renames a field: a mismatch makes the stored copy stale by definition and the
   first request after deploy recomputes and rewrites it. */
const SCHEMA = 11;   // 11: idx tags now populate from the committed index lists
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const fin = (v) => (v == null || Number.isNaN(+v) ? null : +v);

/* Without a Blob store, a normal read falls straight through to a full compute,
   and each compute spends ~13 FMP calls on the macro board, VIX and earnings
   calendar before it even touches quotes. At s-maxage=300 that is a recompute
   every five minutes per edge region — thousands of upstream calls a day against
   a quota of a few hundred. That is how the macro board, VIX and the S&P
   earnings dates all go blank at once: the plan's quota is spent, not the code.
   So a warm lambda keeps its own last result, and concurrent requests share one
   compute instead of each paying for their own. */
let memSnap = null;                     // { at, body }
let computeJob = null;                  // in-flight compute, shared by a burst
let memExt = null, extJob = null;       // same, for the extended tier
const MEM_TTL = 30 * 60 * 1000;

async function readBlob(key = BLOB_KEY) {
  if (!hasBlob) return null;
  try {
    const { blobs } = await list({ prefix: key, limit: 1 });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { console.error("blob read:", e); return null; }
}

async function writeBlob(obj, key = BLOB_KEY) {
  if (!hasBlob) return;
  try {
    await put(key, JSON.stringify(obj), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
  } catch (e) { console.error("blob write:", e); }
}

async function yahooBars(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const r = await bulkFetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TigerTrade/1.0)", "Accept": "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return null;
    const meta = res.meta || {};
    const ts = res.timestamp || [];
    const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
    const adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0] && res.indicators.adjclose[0].adjclose;
    const rows = [];
    for (let i = 0; i < ts.length; i++) {
      const close = adj && adj[i] != null ? adj[i] : (q.close ? q.close[i] : null);
      if (close == null) continue;
      rows.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        open: fin(q.open ? q.open[i] : null), high: fin(q.high ? q.high[i] : null),
        low: fin(q.low ? q.low[i] : null), close: fin(close), volume: fin(q.volume ? q.volume[i] : null) });
    }
    // one implementation, shared with /api/yahoo — see api/_quote.js for why
    return { rows, quote: quoteFromChart(meta, rows) };
  } catch { return null; }
}

// concurrency pool with an optional soft deadline (ms since start). When the
// deadline passes, in-flight work finishes but no new items start — so a large
// universe degrades to PARTIAL coverage instead of a function timeout.
async function pool(items, worker, c = 6, deadline = Infinity) {
  const q = [...items];
  const start = Date.now();
  await Promise.all(Array.from({ length: Math.min(c, q.length) }, async () => {
    while (q.length && Date.now() - start < deadline) await worker(q.shift());
  }));
}

// FMP EOD "light" history fallback for names Yahoo denied (best-effort)
async function fmpBars(symbol) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  try {
    const url = `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}&apikey=${key}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const arr = Array.isArray(j) ? j : (j && j.historical) || [];
    if (!arr.length) return null;
    // FMP returns newest-first; reverse to oldest-first and normalize
    const rows = arr.slice().reverse().map((d) => ({ date: d.date, open: fin(d.open), high: fin(d.high), low: fin(d.low), close: fin(d.price != null ? d.price : d.close), volume: fin(d.volume) }))
      .filter((d) => d.close != null);
    if (rows.length < 2) return null;
    const last = rows[rows.length - 1], prev = rows[rows.length - 2];
    return { rows, quote: { price: last.close, changePercentage: prev.close ? ((last.close - prev.close) / prev.close) * 100 : null, timestamp: null } };
  } catch { return null; }
}

// S&P 500 constituents. The committed SP500 list (full ~503 names) is the
// guaranteed source — the universe is complete even with no FMP key at runtime.
// When a key IS present we try to refresh from FMP for currency, but only accept
// a response that actually looks like the full index (>400 names). Returns
// [{ tk, name, sector, industry }].
async function fmpConstituents() {
  const key = process.env.FMP_API_KEY;
  if (key) {
    const endpoints = [
      `https://financialmodelingprep.com/stable/sp500-constituent?apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/sp500_constituent?apikey=${key}`,
    ];
    for (const url of endpoints) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        if (Array.isArray(j) && j.length > 400) {
          return j.filter((x) => x && x.symbol).map((x) => ({ tk: x.symbol, name: x.name || x.symbol, sector: x.sector || "—", industry: x.subSector || x.industry || "—" }));
        }
      } catch (e) { console.error("fmp constituents:", url, e); }
    }
  }
  return SP500.map((x) => ({ ...x }));  // committed full-index fallback
}

/* The other two US large-cap indices, for membership rather than for reach.
   MEASURED, so nobody expects otherwise: the Dow 30 is a strict subset of the
   S&P 500, and of a 29-name Nasdaq-100 sample only 12 were outside the S&P and
   only 8 outside the S&P plus this app's curated list. Fetching both grows a
   520-name universe by roughly 10–20. What it actually buys is the `idx` tag on
   every row, which is what lets the screener filter to an index — the real
   expansion (mid- and small-caps) is a compute-budget problem, not a list one.
   Best-effort: a failure leaves the tag absent, never wrong. */
async function fmpIndexMembers(slug) {
  const key = process.env.FMP_API_KEY;
  if (key) {
    for (const url of [`https://financialmodelingprep.com/stable/${slug}-constituent?apikey=${key}`,
                       `https://financialmodelingprep.com/api/v3/${slug}_constituent?apikey=${key}`]) {
      try {
        const r = await fetch(url);
        if (!r.ok) { console.log(`fmp ${slug}-constituent: ${r.status}`); continue; }
        const j = await r.json();
        if (Array.isArray(j) && j.length >= 25) return j.filter((x) => x && x.symbol).map((x) => ({ tk: x.symbol, name: x.name || x.symbol, sector: x.sector || "—", industry: x.subSector || x.industry || "—" }));
      } catch (e) { console.error(`fmp ${slug}:`, e); }
    }
  }
  /* Committed fallback, exactly as fmpConstituents() has always had for the S&P.
     Without it this returned [] on any plan below Premium — the constituent
     endpoints are gated there — so no name was tagged and the screener's Nasdaq
     and Dow filters produced zero rows with nothing on screen to explain it.
     Only the ticker is carried: name, sector and industry come from the S&P or
     curated record this name already has, and inventing them here would put a
     second, worse classification into the same taxonomy. */
  const fb = INDEX_FALLBACK[slug] || [];
  if (fb.length) console.log(`fmp ${slug}-constituent unavailable — using the committed list (${fb.length})`);
  return fb.map((tk) => ({ tk, name: tk, sector: "—", industry: "—", _fallback: true }));
}

/* ── Extended universe ───────────────────────────────────────────────────────
   The core snapshot is the S&P 500 plus this app's curated names — roughly 520.
   Momentum leaders, though, are usually mid-caps that have not been added to the
   S&P yet, so the screener was blind to exactly the stage of a company it exists
   to find. The extended tier fixes that with a second nightly pass.

   It is a SEPARATE payload on a SEPARATE blob, fetched only when the user asks
   for it, for two reasons that both matter more than the convenience of one
   file. Compute: one invocation has 60s, and the core pass already spends ~50 of
   them on ~530 symbols — a single run cannot cover 1,400 names, so the tiers are
   two crons. Transfer: a compact record costs ~1.5KB, so folding these names in
   would roughly triple the payload every visitor downloads before seeing a
   single row, to serve a filter most sessions never touch.

   Breadth, flow and market health stay computed on the CORE universe on purpose.
   They are stated as measurements of a specific universe, and silently widening
   what they measure would change what yesterday's number meant without saying
   so. RS does widen — it is explicitly a percentile "vs the tracked universe",
   and the screener says which universe is loaded. */
const EXT_BLOB_KEY = "snapshot-ext.json";
const EXT_MIN_CAP = 2e9;         // $2B — below this, a name is not institutionally tradable
const EXT_MIN_VOL = 400e3;       // shares/day; a coarse gate, real dollar volume comes from bars
const EXT_EXCHANGES = ["NASDAQ", "NYSE"];
/* Ceiling on names the pass will TRY. Sized so a normal night finishes rather
   than truncating: the pool runs 20-wide against a 50s soft deadline, and a name
   the deadline cuts off is simply absent from the payload. Raising this without
   raising the budget does not buy coverage, it buys a bigger denominator. */
const EXT_MAX = 900;

// US common stocks above a size/liquidity floor, largest first. One FMP call per
// exchange. Returns [] on any failure — the tier then reports itself unavailable
// rather than serving a partial list as if it were the screen.
async function fmpScreener() {
  const key = process.env.FMP_API_KEY;
  if (!key) return [];
  const out = [];
  for (const ex of EXT_EXCHANGES) {
    const url = `https://financialmodelingprep.com/stable/company-screener?marketCapMoreThan=${EXT_MIN_CAP}`
      + `&volumeMoreThan=${EXT_MIN_VOL}&isEtf=false&isFund=false&isActivelyTrading=true`
      + `&country=US&exchange=${ex}&limit=2000&apikey=${key}`;
    try {
      const r = await fetch(url);
      if (!r.ok) { console.error(`fmp screener ${ex}: ${r.status}`); continue; }
      const j = await r.json();
      if (Array.isArray(j)) out.push(...j);
    } catch (e) { console.error(`fmp screener ${ex}:`, e); }
  }
  return out;
}

/* Pure: screener rows → the extended ticker list. Exported for the tests.
   Drops anything the core pass already covers (paying twice would cost coverage
   at the far end of the list), anything with a dot in the symbol (FMP's foreign
   and preferred listings, which Yahoo does not resolve), and sorts by market cap
   so a truncation at EXT_MAX cuts the smallest names rather than an arbitrary
   slice of the alphabet. */
export function extUniverse(rows, coreSet, max = EXT_MAX) {
  const seen = new Set();
  return (rows || [])
    .filter((x) => x && typeof x.symbol === "string" && !x.symbol.includes(".")
      && !coreSet.has(x.symbol) && fin(x.marketCap) != null)
    .sort((a, b) => (+b.marketCap || 0) - (+a.marketCap || 0))
    .filter((x) => (seen.has(x.symbol) ? false : (seen.add(x.symbol), true)))
    .slice(0, max)
    .map((x) => ({ tk: x.symbol, name: x.companyName || x.symbol,
      sector: normSector(x.sector), industry: x.industry || "—", mktCap: +x.marketCap }));
}

// earnings per universe ticker, from the FMP calendar: the NEXT confirmed report
// date (forward ~5 weeks) plus the MOST RECENTLY REPORTED quarter's actual vs
// estimate (back ~14 weeks, so every name has its latest print). Best-effort:
// returns null (feature hidden on the client) when there's no key or the tier
// lacks the endpoint.
//   { TK: { d, t, last: { d, epsA, epsE, revA, revE } } }
// d = ISO date, t = "bmo"/"amc" when provided; `last` omitted until a name has
// a reported quarter in the window. Nothing is estimated or filled in locally.
async function fmpEarnings(tickers) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const want = new Set(tickers);
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  const today = iso(Date.now());
  // includeReportTimes adds time ("bmo"/"amc") + confirmed to each record —
  // verified available on this account's tier via the FMP calendar API
  const fetchWindow = async (from, to) => {
    const endpoints = [
      `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${key}`,
    ];
    for (const url of endpoints) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        if (Array.isArray(j) && j.length) return j;
      } catch (e) { console.error("fmp earnings:", url, e); }
    }
    return null;
  };

  const [fwd, back] = await Promise.all([
    fetchWindow(today, iso(Date.now() + 35 * 86400000)),
    fetchWindow(iso(Date.now() - 98 * 86400000), today),
  ]);
  if (!fwd && !back) return null;

  const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
  const out = {};
  // next confirmed report date
  for (const e of fwd || []) {
    const tk = e.symbol;
    if (!tk || !want.has(tk) || !e.date) continue;
    const d = String(e.date).slice(0, 10);
    if (d < today) continue;
    const t = e.time && /bmo|amc/i.test(e.time) ? String(e.time).toLowerCase() : null;
    if (!out[tk] || out[tk].d == null || d < out[tk].d) out[tk] = { ...(out[tk] || {}), d, t };
  }
  // most recent REPORTED quarter — rows without an actual haven't printed yet
  for (const e of back || []) {
    const tk = e.symbol;
    if (!tk || !want.has(tk) || !e.date) continue;
    const d = String(e.date).slice(0, 10);
    if (d > today) continue;
    const epsA = num(e.epsActual), revA = num(e.revenueActual);
    if (epsA == null && revA == null) continue;
    const prev = out[tk] && out[tk].last;
    if (prev && prev.d >= d) continue;
    out[tk] = { d: null, t: null, ...(out[tk] || {}), last: { d, epsA, epsE: num(e.epsEstimated), revA, revE: num(e.revenueEstimated) } };
  }
  return Object.keys(out).length ? out : null;
}

// macro board: US Treasury yields, key FX, and the CPI-YoY nowcast + trend.
// Baked into the nightly snapshot (EOD-consistent with the rest of the app);
// every piece degrades independently — a failed fetch drops that block, never
// fabricates. Endpoints verified available on this account's tier.
async function fmpMacro() {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const jget = async (urls) => {
    for (const u of urls) {
      try { const r = await fetch(u); if (!r.ok) continue; const j = await r.json(); if (j && (Array.isArray(j) ? j.length : true)) return j; }
      catch (e) { console.error("fmp macro:", u, e); }
    }
    return null;
  };
  const out = { asOf: Date.now() };
  const tTo = new Date().toISOString().slice(0, 10);

  // Rates — Fed funds (policy) + Treasury yields. FF is a monthly print (change
  // vs prior month, bps); Treasury yields change day-over-day in bps.
  const rates = [];
  const ffFrom = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
  const ff = await jget([
    `https://financialmodelingprep.com/stable/economic-indicators?name=federalFunds&from=${ffFrom}&to=${tTo}&apikey=${key}`,
    `https://financialmodelingprep.com/stable/economics-indicators?name=federalFunds&from=${ffFrom}&to=${tTo}&apikey=${key}`,
  ]);
  if (Array.isArray(ff) && ff.length) {
    const v = +ff[0].value, prev = ff[1] != null ? +ff[1].value : null;
    if (Number.isFinite(v)) rates.push({ k: "Fed funds", v, bp: prev != null ? Math.round((v - prev) * 100) : null });
  }
  const tFrom = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const tr = await jget([`https://financialmodelingprep.com/stable/treasury-rates?from=${tFrom}&to=${tTo}&apikey=${key}`]);
  if (Array.isArray(tr) && tr.length) {
    const cur = tr[0], prev = tr[1] || tr[0];
    for (const [k, f] of [["2Y", "year2"], ["10Y", "year10"], ["30Y", "year30"]]) {
      if (cur[f] != null) rates.push({ k, v: +cur[f], bp: prev[f] != null ? Math.round((cur[f] - prev[f]) * 100) : null });
    }
  }
  if (rates.length) out.rates = rates;

  // FX majors + DXY (index; DXY needs a higher tier — hidden gracefully if gated)
  const fx = [];
  for (const [k, sym, isIdx] of [["DXY", "DXY", true], ["EUR/USD", "EURUSD"], ["USD/JPY", "USDJPY"], ["GBP/USD", "GBPUSD"]]) {
    const q = await jget([
      `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`,
      `https://financialmodelingprep.com/stable/forex-quote?symbol=${sym}&apikey=${key}`,
      ...(isIdx ? [`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent("^DXY")}&apikey=${key}`] : []),
    ]);
    const o = Array.isArray(q) ? q[0] : q;
    if (o && o.price != null) fx.push({ k, v: +o.price, chg: o.changePercentage != null ? +(+o.changePercentage).toFixed(2) : null, idx: isIdx || undefined });
  }
  if (fx.length) out.fx = fx;

  // Commodities. Symbols verified against the live API: GCUSD gold, SIUSD silver,
  // CLUSD WTI. Each falls back to the generic quote route, and a gated one is
  // simply omitted rather than rendered empty.
  const comm = [];
  for (const [k, syms] of [["Gold", ["GCUSD"]], ["Silver", ["SIUSD"]]]) {
    const q = await jget(syms.flatMap((s) => [
      `https://financialmodelingprep.com/stable/commodities-quote?symbol=${s}&apikey=${key}`,
      `https://financialmodelingprep.com/stable/quote?symbol=${s}&apikey=${key}`,
    ]));
    const o = Array.isArray(q) ? q[0] : q;
    if (o && o.price != null) comm.push({ k, v: +o.price, chg: o.changePercentage != null ? +(+o.changePercentage).toFixed(2) : null });
  }

  // Crude oil, first contract that this plan will actually serve. CLUSD (WTI) is
  // ACCESS DENIED on Starter — verified against the live API, which is why the
  // old "WTI" row silently never appeared — while BZUSD (Brent) answers. Each
  // candidate carries its OWN label, so the row can never say WTI while showing
  // Brent; if the plan later opens CLUSD, WTI wins and relabels itself.
  for (const [k, sym] of [["WTI crude", "CLUSD"], ["Brent crude", "BZUSD"]]) {
    const q = await jget([
      `https://financialmodelingprep.com/stable/commodities-quote?symbol=${sym}&apikey=${key}`,
      `https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${key}`,
    ]);
    const o = Array.isArray(q) ? q[0] : q;
    if (o && o.price != null) { comm.push({ k, v: +o.price, chg: o.changePercentage != null ? +(+o.changePercentage).toFixed(2) : null }); break; }
  }
  if (comm.length) out.comm = comm;

  // Crypto — its own section rather than folded into commodities, because BTC
  // and ETH are not commodities and this board is read as a factual reference.
  // Two more calls per compute; with Blob connected that is two a weekday.
  const crypto = [];
  for (const [k, sym] of [["Bitcoin", "BTCUSD"], ["Ethereum", "ETHUSD"]]) {
    const q = await jget([
      `https://financialmodelingprep.com/stable/cryptocurrency-quote?symbol=${sym}&apikey=${key}`,
      `https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${key}`,
    ]);
    const o = Array.isArray(q) ? q[0] : q;
    if (o && o.price != null) crypto.push({ k, v: +o.price, chg: o.changePercentage != null ? +(+o.changePercentage).toFixed(2) : null });
  }
  if (crypto.length) out.crypto = crypto;

  // CPI YoY nowcast — daily series; value + ~1-month change + downsampled spark
  const iFrom = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  const infl = await jget([
    `https://financialmodelingprep.com/stable/economic-indicators?name=inflationRate&from=${iFrom}&to=${tTo}&apikey=${key}`,
    `https://financialmodelingprep.com/stable/economics-indicators?name=inflationRate&from=${iFrom}&to=${tTo}&apikey=${key}`,
  ]);
  if (Array.isArray(infl) && infl.length) {
    const series = infl.map((d) => +d.value).filter((v) => Number.isFinite(v));   // newest-first
    if (series.length) {
      const monthAgo = series[Math.min(series.length - 1, 21)];
      const chron = [...series].reverse();
      const step = Math.max(1, Math.floor(chron.length / 16));
      out.cpi = { v: +series[0].toFixed(2), chg: +(series[0] - monthAgo).toFixed(2),
        asOf: infl[0].date || null, spark: chron.filter((_, i) => i % step === 0).map((v) => +v.toFixed(2)) };
    }
  }

  return (out.rates || out.fx || out.comm || out.crypto || out.cpi) ? out : null;
}

// CBOE VIX — the volatility gauge that anchors the cover. Quote (level, change,
// 50-day avg, 52-wk range) + ~3 months of daily history for the trend chart.
// Verified on this account's tier (unlike DXY, the ^VIX index is accessible).
async function fmpVix() {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const V = encodeURIComponent("^VIX");
  const jget = async (urls) => {
    for (const u of urls) {
      try { const r = await fetch(u); if (!r.ok) continue; const j = await r.json(); if (j && (Array.isArray(j) ? j.length : true)) return j; }
      catch (e) { console.error("fmp vix:", u, e); }
    }
    return null;
  };
  const q = await jget([`https://financialmodelingprep.com/stable/quote?symbol=${V}&apikey=${key}`]);
  const o = Array.isArray(q) ? q[0] : q;
  const from = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  const h = await jget([
    `https://financialmodelingprep.com/stable/historical-price-eod/light?symbol=${V}&from=${from}&to=${to}&apikey=${key}`,
    `https://financialmodelingprep.com/stable/historical-price-eod-light?symbol=${V}&from=${from}&to=${to}&apikey=${key}`,
  ]);
  const rows = Array.isArray(h) ? h.map((d) => ({ d: String(d.date).slice(0, 10), v: +(d.price ?? d.close) })).filter((r) => Number.isFinite(r.v)) : [];
  if (!o && rows.length < 2) return null;
  const level = o && o.price != null ? +o.price : rows[0]?.v;
  const chg = o && o.changePercentage != null ? +(+o.changePercentage).toFixed(2)
    : rows.length >= 2 ? +(((rows[0].v - rows[1].v) / rows[1].v) * 100).toFixed(2) : null;
  const series = rows.slice(0, 66).reverse().map((r) => ({ d: r.d, v: +r.v.toFixed(2) }));   // chronological
  return {
    level: level != null ? +level.toFixed(2) : null, chg,
    avg50: o && o.priceAvg50 != null ? +(+o.priceAvg50).toFixed(2) : null,
    hi52: o && o.yearHigh != null ? +o.yearHigh : null,
    lo52: o && o.yearLow != null ? +o.yearLow : null,
    series,
  };
}

/* ── volume & flow ─────────────────────────────────────────────────────────
   Who actually traded, and which way. Volume is the honest half of "what moved
   the market": the index is a weighted sum, so the names absorbing the most
   capital are the ones setting it, and heavy volume into DECLINING names is
   distribution — the thing that precedes a volatility expansion.

   NOTE ON OPTIONS FLOW. There is none here, deliberately. Neither FMP nor
   Yahoo exposes option chains, put/call ratios or unusual-options activity at
   any tier we can reach, so every figure below is share and dollar volume off
   the same daily bars the rest of the terminal uses. A "flow" panel with
   invented options data would be the worst thing this app could ship.

   `LIQUID_FLOOR` keeps the unusual-volume list honest: a thin name doubling
   its volume is a rounding error dressed as a signal. */
const LIQUID_FLOOR = 5e6;      // $5M of 20-day average dollar volume
const FLOW_N = 30;

function flowBlock(quotes, sig, meta) {
  const rows = [];
  for (const t of Object.keys(sig)) {
    const g = sig[t], q = quotes[t];
    if (!g || !q || q.price == null || g.dvD == null) continue;
    rows.push({
      tk: t, name: (meta[t] && meta[t].name) || t, sector: (meta[t] && meta[t].sector) || "—",
      px: +(+q.price).toFixed(2),
      // bars first — see the note on `chgD` in signals.js. The quote is only a
      // fallback for a record computed before that field existed.
      chg: g.chgD != null ? g.chgD
        : (q.changePercentage != null ? +(+q.changePercentage).toFixed(2) : null),
      dv: Math.round(g.dvD), vol: g.volD, rvol: g.rvol,
      dollarVol: g.dollarVol != null ? Math.round(g.dollarVol) : null,
    });
  }
  if (rows.length < 10) return null;

  // The session's dollar volume split by direction. A name with no change
  // figure is counted in the total but in neither side — it cannot vote on a
  // direction it did not report.
  let advDv = 0, decDv = 0, totDv = 0;
  for (const r of rows) {
    totDv += r.dv;
    if (r.chg == null) continue;
    if (r.chg > 0) advDv += r.dv; else if (r.chg < 0) decDv += r.dv;
  }
  const sided = advDv + decDv;

  const heavy = [...rows].sort((a, b) => b.dv - a.dv).slice(0, FLOW_N);
  const unusual = rows
    .filter((r) => r.rvol != null && (r.dollarVol == null || r.dollarVol >= LIQUID_FLOOR))
    .sort((a, b) => b.rvol - a.rvol).slice(0, FLOW_N);

  return {
    heavy, unusual, n: rows.length,
    totDv: Math.round(totDv), advDv: Math.round(advDv), decDv: Math.round(decDv),
    upShare: sided > 0 ? +((advDv / sided) * 100).toFixed(1) : null,
    liquidFloor: LIQUID_FLOOR,
  };
}

/* ── sector ETFs ───────────────────────────────────────────────────────────
   The tradeable expression of the sector map. `sector` matches the label the
   universe is bucketed under (post-normSector), so a row can filter the
   screener to the same names the map colours.

   The column that matters is EXCESS return, not raw: every sector is up in an
   up tape, and "XLK +4%" says nothing on its own about whether money is
   rotating into technology. Measured against SPY over the same windows, from
   the same bars, so the subtraction is like-for-like.

   Eleven Yahoo calls a night, crumb-free, no FMP quota. */
const SECTOR_ETFS = [
  { tk: "XLK", sector: "Technology" },
  { tk: "XLF", sector: "Financial Services" },
  { tk: "XLV", sector: "Healthcare" },
  { tk: "XLY", sector: "Consumer Cyclical" },
  { tk: "XLP", sector: "Consumer Defensive" },
  { tk: "XLE", sector: "Energy" },
  { tk: "XLI", sector: "Industrials" },
  { tk: "XLB", sector: "Basic Materials" },
  { tk: "XLU", sector: "Utilities" },
  { tk: "XLRE", sector: "Real Estate" },
  { tk: "XLC", sector: "Communication Services" },
];
const RET_WINDOWS = { w1: 5, m1: 21, m3: 63, y1: 252 };

// % return over `bars` sessions of closes; null rather than 0 when the history
// is short or the base close is unusable
function retOver(closes, bars) {
  const n = closes ? closes.length : 0;
  if (n < 2) return null;
  const i = Math.max(0, n - 1 - bars);
  if (i === n - 1 || !(closes[i] > 0)) return null;
  return +(((closes[n - 1] / closes[i]) - 1) * 100).toFixed(2);
}

async function sectorEtfs(spyCloses) {
  const spyRet = {};
  for (const [k, bars] of Object.entries(RET_WINDOWS)) spyRet[k] = retOver(spyCloses, bars);

  const got = await Promise.all(SECTOR_ETFS.map(async (e) => {
    const d = await yahooBars(e.tk);
    if (!d || d.quote.price == null || d.rows.length < 2) return null;
    const closes = d.rows.map((r) => r.close);
    const ret = {}, rel = {};
    for (const [k, bars] of Object.entries(RET_WINDOWS)) {
      ret[k] = retOver(closes, bars);
      // excess vs SPY — null unless BOTH legs exist, because a difference
      // against a missing benchmark is not an excess, it is just the raw number
      rel[k] = ret[k] != null && spyRet[k] != null ? +(ret[k] - spyRet[k]).toFixed(2) : null;
    }
    return {
      tk: e.tk, sector: e.sector,
      px: +(+d.quote.price).toFixed(2),
      chg: d.quote.changePercentage != null ? +(+d.quote.changePercentage).toFixed(2) : null,
      ret, rel,
    };
  }));
  const rows = got.filter(Boolean);
  return rows.length ? { rows, spy: spyRet } : null;
}

/* A year of VIX closes, for the one VIX read the cover does not already give:
   where today's level sits in its own recent range. A level means nothing on its
   own — 18 is complacent in one regime and elevated in another. One Yahoo call,
   crumb-free, no FMP quota. */
async function vixContext() {
  const d = await yahooBars("^VIX");
  if (!d || d.quote.price == null || !d.rows.length) return null;
  const closes = d.rows.map((r) => r.close).filter((v) => v > 0);
  const level = +(+d.quote.price).toFixed(2);
  const below = closes.filter((v) => v < level).length;
  return {
    level, chg: d.quote.changePercentage != null ? +(+d.quote.changePercentage).toFixed(2) : null,
    pct1y: closes.length >= 60 ? Math.round((below / closes.length) * 100) : null,
    hist: d.rows.slice(-252).map((r) => ({ d: r.date, v: +(+r.close).toFixed(2) })),
  };
}

// unify curated sector labels with the FMP taxonomy so buckets don't split
const SECTOR_ALIAS = { Financials: "Financial Services", Materials: "Basic Materials" };
const normSector = (s) => SECTOR_ALIAS[s] || s || "—";

// day-over-day change detection: diff the previous stored snapshot's compact
// signals against today's to surface the actionable transitions. Returns null on
// the first run or when nothing changed. Each category is capped + sorted by
// liquidity so the client renders the most significant names first.
function detectChanges(prev, curSig, meta) {
  if (!prev || !prev.sig || !Object.keys(prev.sig).length) return null;
  // same trading day → same data, nothing to diff
  const dayOf = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : null);
  const prevDay = dayOf(prev.asOf) || (prev.generatedAt || "").slice(0, 10);
  const ps = prev.sig;
  const cats = { newBreakouts: [], enteredBuyZone: [], newHighs: [], rolledOver: [] };
  for (const tk of Object.keys(curSig)) {
    const c = curSig[tk], p = ps[tk];
    if (!p) continue;                       // new to the universe — not a "change"
    const m = meta[tk] || {};
    const e = { tk, name: m.name || tk, sector: m.sector || "—", dv: c.dollarVol || 0 };
    if (p.stage !== 2 && c.stage === 2) cats.newBreakouts.push(e);
    if (p.status !== undefined && p.status !== "buy" && c.status === "buy") cats.enteredBuyZone.push(e);
    if (p.atHigh !== true && c.atHigh === true) cats.newHighs.push(e);
    if (p.stage === 2 && (c.stage === 3 || c.stage === 4)) cats.rolledOver.push(e);
  }
  const cap = (arr) => ({ count: arr.length, names: arr.sort((a, b) => b.dv - a.dv).slice(0, 60).map(({ dv, ...r }) => r) });
  const out = { since: prev.asOf || prev.generatedAt || null, prevDay };
  let any = 0;
  for (const k of Object.keys(cats)) { out[k] = cap(cats[k]); any += out[k].count; }
  return any ? out : null;
}

/* The core universe's `meta`: S&P 500 constituents (live from FMP) ∪ the two
   other large-cap index lists ∪ curated names, deduped, in one taxonomy. Shared
   with the extended pass, which needs exactly this set to subtract. */
async function coreMeta() {
  const [constituents, ndx, dow] = await Promise.all([
    fmpConstituents(), fmpIndexMembers("nasdaq"), fmpIndexMembers("dowjones"),
  ]);
  const meta = {};
  for (const c of constituents) meta[c.tk] = { name: c.name, sector: c.sector, industry: c.industry, idx: ["sp500"] };
  // Nasdaq-100 and Dow members the S&P list did not already carry — these ARE
  // the net-new names, and there are not many of them
  for (const [slug, list] of [["ndx", ndx], ["dow", dow]]) {
    for (const c of list) {
      if (meta[c.tk]) { if (!meta[c.tk].idx.includes(slug)) meta[c.tk].idx.push(slug); continue; }
      // A fallback entry carries a ticker and nothing else. Seeding a NEW name
      // from one would put "—" into the sector and industry the Market Map and
      // the group panel bucket on; tagging a name the S&P pass already
      // classified is free, inventing one is not.
      if (c._fallback) continue;
      meta[c.tk] = { name: c.name, sector: normSector(c.sector), industry: c.industry || "—", idx: [slug] };
    }
  }
  for (const s of TT.CANSLIM) {
    if (meta[s.tk]) continue;  // constituent classification wins for shared names
    meta[s.tk] = { name: s.name, sector: normSector(s.sector), industry: s.group || "—", idx: [] };
  }
  return meta;
}

async function compute() {
  const prev = await readBlob();   // yesterday's snapshot — for day-over-day change detection
  const meta = await coreMeta();
  const tickers = Object.keys(meta);
  const idxSyms = INDICES.map((x) => x.sym);
  const all = [...tickers, "SPY", ...idxSyms];

  // fetch bars: Yahoo first (12-wide, ~50s soft budget so we never hard-timeout),
  // FMP light-history fallback for whatever Yahoo denied.
  const data = {};
  await pool(all, async (t) => { const d = await yahooBars(t); if (d) data[t] = d; }, 12, 50000);
  const idxMiss = INDICES.filter((x) => !data[x.sym] && !data[x.proxy]).map((x) => x.proxy);
  if (idxMiss.length) await pool(idxMiss, async (t) => { const d = await yahooBars(t); if (d) data[t] = d; }, 4);
  const nameMiss = tickers.filter((t) => !data[t]);
  if (nameMiss.length) await pool(nameMiss, async (t) => { const d = await fmpBars(t); if (d) data[t] = d; }, 8, 8000);

  const spy = data.SPY && data.SPY.rows;
  const quotes = {}, sig = {};
  for (const t of tickers) {
    const d = data[t];
    if (!d || d.quote.price == null) continue;
    quotes[t] = d.quote;
    const s = computeSignals(d.rows, spy);
    const cs = compactSig(s, d.quote.changePercentage, d.quote.price);   // slim record — no heavy arrays
    if (cs) sig[t] = cs;
  }
  const count = Object.keys(quotes).length;
  let asOf = 0;
  for (const t of Object.keys(quotes)) { const ts = quotes[t].timestamp; if (ts) asOf = Math.max(asOf, ts); }

  // market health from real index data + full-universe breadth (needs the scalar
  // stage/off52/above50 fields, which compactSig preserves)
  const indices = INDICES.map((x) => {
    const d = data[x.sym] || data[x.proxy] || (x.proxy === "SPY" ? data.SPY : null);
    return d ? { label: x.label, price: d.quote.price, chgPct: d.quote.changePercentage, rows: d.rows } : null;
  });
  const market = computeMarketHealth(indices, tickers.map((t) => ({ chg: quotes[t]?.changePercentage, sig: sig[t] })));

  // keep meta only for covered names (trims payload)
  const metaOut = {};
  for (const t of Object.keys(quotes)) metaOut[t] = meta[t];

  const changes = detectChanges(prev, sig, metaOut);
  const earnings = await fmpEarnings(Object.keys(quotes));
  const macro = await fmpMacro();
  const vix = await fmpVix();
  const vol = await vixContext();
  const flow = flowBlock(quotes, sig, metaOut);
  const sectors = await sectorEtfs(spy ? spy.map((r) => r.close) : null);

  return { schema: SCHEMA, generatedAt: new Date().toISOString(), source: "Yahoo+FMP", count, total: tickers.length, asOf: asOf ? asOf * 1000 : null, quotes, sig, meta: metaOut, market, changes, earnings, macro, vix, vol, flow, sectors };
}

/* The extended pass. Same signal math on the same adjusted bars as the core — a
   name has to be rankable against the core universe on identical terms or the RS
   percentile it lands in is meaningless.

   Yahoo only, no FMP bars fallback: this pass touches up to 900 symbols and the
   fallback is per-name, so one bad night would drain the whole FMP quota that
   the macro board, VIX and the earnings calendar depend on. A name Yahoo denied
   is absent from this payload, and `count` vs `total` says how many. */
async function computeExt() {
  const core = await coreMeta();
  const coreSet = new Set(Object.keys(core));
  const picks = extUniverse(await fmpScreener(), coreSet);
  if (!picks.length) {
    // no screen means no list — say so rather than emit an empty universe that
    // reads on screen as "there is nothing out there"
    return { schema: SCHEMA, tier: "ext", generatedAt: new Date().toISOString(),
      status: "unavailable", reason: process.env.FMP_API_KEY ? "SCREEN_EMPTY" : "NO_FMP_KEY",
      count: 0, total: 0, quotes: {}, sig: {}, meta: {} };
  }

  const meta = {};
  for (const p of picks) meta[p.tk] = { name: p.name, sector: p.sector, industry: p.industry, idx: ["ext"], mktCap: p.mktCap };
  const tickers = picks.map((p) => p.tk);

  const data = {};
  // 20-wide rather than the core pass's 12: nearly twice the names in the same
  // 60s envelope. The soft deadline still governs — this degrades to partial
  // coverage, never to a function timeout.
  await pool(["SPY", ...tickers], async (t) => { const d = await yahooBars(t); if (d) data[t] = d; }, 20, 50000);

  const spy = data.SPY && data.SPY.rows;
  const quotes = {}, sig = {};
  for (const t of tickers) {
    const d = data[t];
    if (!d || d.quote.price == null) continue;
    const cs = compactSig(computeSignals(d.rows, spy), d.quote.changePercentage, d.quote.price);
    if (!cs) continue;                 // not enough history to measure — drop, don't pad
    quotes[t] = d.quote;
    sig[t] = cs;
  }
  const metaOut = {};
  for (const t of Object.keys(quotes)) metaOut[t] = meta[t];
  let asOf = 0;
  for (const t of Object.keys(quotes)) { const ts = quotes[t].timestamp; if (ts) asOf = Math.max(asOf, ts); }

  return { schema: SCHEMA, tier: "ext", generatedAt: new Date().toISOString(), source: "Yahoo",
    status: "ok", count: Object.keys(quotes).length, total: tickers.length,
    asOf: asOf ? asOf * 1000 : null,
    screen: { minCap: EXT_MIN_CAP, minVol: EXT_MIN_VOL, exchanges: EXT_EXCHANGES, cap: EXT_MAX },
    quotes, sig, meta: metaOut };
}

// the extended tier is its own blob, its own cron and its own read path — see
// the block comment above EXT_BLOB_KEY for why it is not folded into the core
async function handleExt(req, res, refresh) {
  if (!refresh) {
    const stored = await readBlob(EXT_BLOB_KEY);
    if (stored && stored.schema === SCHEMA) {
      res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");
      return res.status(200).json({ ...stored, blob: hasBlob, served: "blob" });
    }
    if (memExt && Date.now() - memExt.at < MEM_TTL) {
      res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=86400");
      return res.status(200).json({ ...memExt.body, blob: hasBlob, served: "memory" });
    }
    /* Deliberately NOT computed on demand, on ANY read path — including a schema
       mismatch, which is the one the core tier does recompute on. A cold extended
       pass is ~900 upstream fetches and 50 seconds; serving that to a user who
       flipped a filter would time out their request and spend the night's budget
       at the same time. Until the cron has run, the tier reports itself pending
       and the screener says so, instead of quietly falling back to the core list
       under a label that claims to be wider than it is. */
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ tier: "ext", status: "pending",
      reason: stored ? "SCHEMA_STALE" : "NOT_YET_COMPUTED",
      count: 0, total: 0, quotes: {}, sig: {}, meta: {}, blob: hasBlob, served: "none" });
  }
  if (!extJob) extJob = computeExt().finally(() => { extJob = null; });
  const body = await extJob;
  if (body.count > 0) { memExt = { at: Date.now(), body }; await writeBlob(body, EXT_BLOB_KEY); }
  res.setHeader("Cache-Control", body.count > 0 ? "s-maxage=900, stale-while-revalidate=86400" : "no-store");
  return res.status(200).json({ ...body, blob: hasBlob, served: "compute" });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const refresh = req.query.refresh != null || !!req.headers["x-vercel-cron"];
  if (req.query.tier === "ext") return handleExt(req, res, refresh);

  // normal read: serve the stored snapshot instantly (no recompute) — but only
  // while its shape still matches what this build emits
  if (!refresh) {
    const stored = await readBlob();
    if (stored && stored.count > 0 && stored.schema === SCHEMA) {
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
      return res.status(200).json({ ...stored, blob: hasBlob, served: "blob" });
    }
    if (stored && stored.count > 0) {
      console.log(`snapshot: stored schema ${stored.schema ?? "none"} != ${SCHEMA} — recomputing`);
    }
    // no Blob store connected: serve this lambda's own last compute rather than
    // buying a fresh one — the alternative is spending upstream quota per request
    if (memSnap && memSnap.body.count > 0 && Date.now() - memSnap.at < MEM_TTL) {
      res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=86400");
      return res.status(200).json({ ...memSnap.body, blob: hasBlob, served: "memory" });
    }
  }

  // cron refresh, or nothing cached yet: compute once, however many asked at once
  if (!computeJob) computeJob = compute().finally(() => { computeJob = null; });
  const body = await computeJob;
  if (body.count > 0) {
    memSnap = { at: Date.now(), body };
    await writeBlob(body);
  }
  // a deployment with no Blob store has only the edge cache standing between it
  // and its upstream quota, so it holds the result far longer
  res.setHeader("Cache-Control", body.count > 0
    ? (hasBlob ? "s-maxage=300, stale-while-revalidate=86400" : "s-maxage=1800, stale-while-revalidate=86400")
    : "no-store");
  return res.status(200).json({ ...body, blob: hasBlob, served: refresh ? "compute-refresh" : "compute" });
}
