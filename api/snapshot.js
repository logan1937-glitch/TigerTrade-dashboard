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
import { put, list } from "@vercel/blob";

// index set for market health; ETF proxies cover any index symbol Yahoo denies
const INDICES = [
  { sym: "^GSPC", proxy: "SPY", label: "S&P 500" },
  { sym: "^IXIC", proxy: "QQQ", label: "Nasdaq" },
  { sym: "^RUT",  proxy: "IWM", label: "Russell 2000" },
  { sym: "^DJI",  proxy: "DIA", label: "Dow" },
];

export const maxDuration = 60;

const BLOB_KEY = "snapshot.json";
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const fin = (v) => (v == null || Number.isNaN(+v) ? null : +v);

async function readBlob() {
  if (!hasBlob) return null;
  try {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { console.error("blob read:", e); return null; }
}

async function writeBlob(obj) {
  if (!hasBlob) return;
  try {
    await put(BLOB_KEY, JSON.stringify(obj), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
  } catch (e) { console.error("blob write:", e); }
}

async function yahooBars(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TigerTrade/1.0)", "Accept": "application/json" } });
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
    const price = fin(meta.regularMarketPrice);
    // prior-session close from the bars (chartPreviousClose = range start, wrong)
    let prev = null;
    if (rows.length >= 2) {
      const lastClose = rows[rows.length - 1].close;
      prev = price != null && Math.abs(price - lastClose) < 1e-9 ? rows[rows.length - 2].close : lastClose;
    }
    if (prev == null) prev = fin(meta.previousClose != null ? meta.previousClose : meta.chartPreviousClose);
    return { rows, quote: { price, changePercentage: price != null && prev ? ((price - prev) / prev) * 100 : null, timestamp: meta.regularMarketTime || null } };
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

// next confirmed earnings date per universe ticker — one FMP calendar request
// covering the next ~5 weeks. Best-effort: returns null (feature hidden on the
// client) when there's no key or the tier lacks the endpoint. { TK: { d, t } }
// where d = ISO date and t = "bmo" / "amc" when the calendar provides it.
async function fmpEarnings(tickers) {
  const key = process.env.FMP_API_KEY;
  if (!key) return null;
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
  const want = new Set(tickers);
  // includeReportTimes adds time ("bmo"/"amc") + confirmed to each record —
  // verified available on this account's tier via the FMP calendar API
  const endpoints = [
    `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${key}`,
    `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${key}`,
  ];
  for (const url of endpoints) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      if (!Array.isArray(j) || !j.length) continue;
      const out = {};
      for (const e of j) {
        const tk = e.symbol;
        if (!tk || !want.has(tk) || !e.date) continue;
        const d = String(e.date).slice(0, 10);
        if (d < from) continue;
        if (!out[tk] || d < out[tk].d) out[tk] = { d, t: e.time && /bmo|amc/i.test(e.time) ? String(e.time).toLowerCase() : null };
      }
      if (Object.keys(out).length) return out;
    } catch (e) { console.error("fmp earnings:", url, e); }
  }
  return null;
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

  // Treasury rates — newest-first daily rows; change = today vs prior day in bps
  const tFrom = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  const tTo = new Date().toISOString().slice(0, 10);
  const tr = await jget([`https://financialmodelingprep.com/stable/treasury-rates?from=${tFrom}&to=${tTo}&apikey=${key}`]);
  if (Array.isArray(tr) && tr.length) {
    const cur = tr[0], prev = tr[1] || tr[0];
    out.rates = [["2Y", "year2"], ["10Y", "year10"], ["30Y", "year30"]]
      .filter(([, f]) => cur[f] != null)
      .map(([k, f]) => ({ k, v: +cur[f], bp: prev[f] != null ? Math.round((cur[f] - prev[f]) * 100) : null }));
  }

  // FX majors — unified quote endpoint accepts forex symbols; forex-quote fallback
  const fx = [];
  for (const [k, sym] of [["EUR/USD", "EURUSD"], ["USD/JPY", "USDJPY"], ["GBP/USD", "GBPUSD"]]) {
    const q = await jget([
      `https://financialmodelingprep.com/stable/quote?symbol=${sym}&apikey=${key}`,
      `https://financialmodelingprep.com/stable/forex-quote?symbol=${sym}&apikey=${key}`,
    ]);
    const o = Array.isArray(q) ? q[0] : q;
    if (o && o.price != null) fx.push({ k, v: +o.price, chg: o.changePercentage != null ? +(+o.changePercentage).toFixed(2) : null });
  }
  if (fx.length) out.fx = fx;

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

  return (out.rates || out.fx || out.cpi) ? out : null;
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

async function compute() {
  const prev = await readBlob();   // yesterday's snapshot — for day-over-day change detection

  // universe = S&P 500 constituents (live from FMP) ∪ curated names, deduped.
  // `meta` carries name + sector + industry for every ticker in one taxonomy.
  const constituents = await fmpConstituents();
  const meta = {};
  for (const c of constituents) meta[c.tk] = { name: c.name, sector: c.sector, industry: c.industry };
  for (const s of TT.CANSLIM) {
    if (meta[s.tk]) continue;  // constituent classification wins for shared names
    meta[s.tk] = { name: s.name, sector: normSector(s.sector), industry: s.group || "—" };
  }
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

  return { generatedAt: new Date().toISOString(), source: "Yahoo+FMP", count, total: tickers.length, asOf: asOf ? asOf * 1000 : null, quotes, sig, meta: metaOut, market, changes, earnings, macro };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const refresh = req.query.refresh != null || !!req.headers["x-vercel-cron"];

  // normal read: serve the stored snapshot instantly (no recompute)
  if (!refresh) {
    const stored = await readBlob();
    if (stored && stored.count > 0) {
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
      return res.status(200).json({ ...stored, served: "blob" });
    }
  }

  // cron refresh, or no stored snapshot yet: compute and persist
  const body = await compute();
  if (body.count > 0) await writeBlob(body);
  res.setHeader("Cache-Control", body.count > 0 ? "s-maxage=300, stale-while-revalidate=86400" : "no-store");
  return res.status(200).json({ ...body, served: refresh ? "compute-refresh" : "compute" });
}
