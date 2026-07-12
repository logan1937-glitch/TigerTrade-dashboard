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

// S&P 500 constituents — live from FMP, committed SP500 list as fallback.
// Returns [{ tk, name, sector, industry }].
async function fmpConstituents() {
  const key = process.env.FMP_API_KEY;
  if (key) {
    try {
      const r = await fetch(`https://financialmodelingprep.com/stable/sp-500?apikey=${key}`);
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j) && j.length > 100) {
          return j.filter((x) => x && x.symbol).map((x) => ({ tk: x.symbol, name: x.name || x.symbol, sector: x.sector || "—", industry: x.subSector || x.industry || "—" }));
        }
      }
    } catch (e) { console.error("fmp constituents:", e); }
  }
  return SP500.map((x) => ({ ...x }));  // committed fallback
}

// unify curated sector labels with the FMP taxonomy so buckets don't split
const SECTOR_ALIAS = { Financials: "Financial Services", Materials: "Basic Materials" };
const normSector = (s) => SECTOR_ALIAS[s] || s || "—";

async function compute() {
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

  return { generatedAt: new Date().toISOString(), source: "Yahoo+FMP", count, total: tickers.length, asOf: asOf ? asOf * 1000 : null, quotes, sig, meta: metaOut, market };
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
