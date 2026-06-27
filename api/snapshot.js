// api/snapshot.js — Vercel Serverless Function (precompute snapshot)
// Computes the whole universe's quote + momentum signals server-side in ONE
// place, then serves it edge-cached. The browser makes a single request instead
// of N Yahoo calls per visit. A daily cron (see vercel.json) warms it after the
// US close so users always hit a fresh, cached snapshot.
//
// This is the "precompute into a snapshot" step: it decouples table size from
// per-visit fetch cost, which is what unlocks growing the universe to hundreds.

import { TT } from "../src/tt.js";
import { computeSignals } from "../src/signals.js";

export const maxDuration = 60;

const fin = (v) => (v == null || Number.isNaN(+v) ? null : +v);

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

async function pool(items, worker, c = 5) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(c, q.length) }, async () => { while (q.length) await worker(q.shift()); }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const tickers = TT.CANSLIM.map((s) => s.tk);
  const all = [...tickers, "SPY"];
  const data = {};
  await pool(all, async (t) => { const d = await yahooBars(t); if (d) data[t] = d; }, 6);

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

  const body = {
    generatedAt: new Date().toISOString(),
    source: "Yahoo",
    count, total: tickers.length,
    asOf: asOf ? asOf * 1000 : null,
    quotes, sig,
  };

  // serve fresh for 6h, then serve stale up to a day while revalidating; the
  // nightly cron keeps it warm so users rarely trigger a cold recompute
  if (count > 0) res.setHeader("Cache-Control", "s-maxage=21600, stale-while-revalidate=86400");
  return res.status(200).json(body);
}
