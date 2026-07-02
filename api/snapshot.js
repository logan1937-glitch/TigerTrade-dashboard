// api/snapshot.js — Vercel Serverless Function (precompute snapshot)
// Computes the universe's quote + momentum signals and serves a single payload.
//
// Durable storage (optional): when a Vercel Blob store is connected
// (BLOB_READ_WRITE_TOKEN present), the daily cron writes the computed snapshot
// to Blob and normal reads return it INSTANTLY — no per-request recompute, no
// timeout risk as the universe grows. Without Blob it falls back to computing on
// demand and edge-caching, so it works with zero setup.

import { TT } from "../src/tt.js";
import { computeSignals, computeMarketHealth } from "../src/signals.js";
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
    const prev = fin(meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose);
    return { rows, quote: { price, changePercentage: price != null && prev ? ((price - prev) / prev) * 100 : null, timestamp: meta.regularMarketTime || null } };
  } catch { return null; }
}

async function pool(items, worker, c = 6) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(c, q.length) }, async () => { while (q.length) await worker(q.shift()); }));
}

async function compute() {
  const tickers = TT.CANSLIM.map((s) => s.tk);
  const idxSyms = INDICES.flatMap((x) => [x.sym]);
  const all = [...tickers, "SPY", ...idxSyms];
  const data = {};
  await pool(all, async (t) => { const d = await yahooBars(t); if (d) data[t] = d; }, 6);
  // ETF proxy for any index Yahoo didn't return
  const misses = INDICES.filter((x) => !data[x.sym] && !data[x.proxy]).map((x) => x.proxy);
  if (misses.length) await pool(misses, async (t) => { const d = await yahooBars(t); if (d) data[t] = d; }, 4);

  const spy = data.SPY && data.SPY.rows;
  const quotes = {}, sig = {};
  for (const t of tickers) {
    const d = data[t];
    if (!d || d.quote.price == null) continue;
    quotes[t] = d.quote;
    const s = computeSignals(d.rows, spy);
    if (s) sig[t] = s;
  }
  const count = Object.keys(quotes).length;
  let asOf = 0;
  for (const t of Object.keys(quotes)) { const ts = quotes[t].timestamp; if (ts) asOf = Math.max(asOf, ts); }

  // market health from real index data + universe breadth
  const indices = INDICES.map((x) => {
    const d = data[x.sym] || data[x.proxy] || (x.proxy === "SPY" ? data.SPY : null);
    return d ? { label: x.label, price: d.quote.price, chgPct: d.quote.changePercentage, rows: d.rows } : null;
  });
  const market = computeMarketHealth(indices, tickers.map((t) => ({ chg: quotes[t]?.changePercentage, sig: sig[t] })));

  return { generatedAt: new Date().toISOString(), source: "Yahoo", count, total: tickers.length, asOf: asOf ? asOf * 1000 : null, quotes, sig, market };
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
