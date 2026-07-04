// api/yahoo.js — Vercel Serverless Function
// Proxies Yahoo Finance's (unofficial) chart endpoint server-side (it sends no
// CORS headers, so the browser can't call it directly). One call returns both a
// current-ish quote and the adjusted daily OHLCV history the signal engine needs.
//
//   GET /api/yahoo?symbol=NVDA&range=1y&interval=1d
//
// NOTE: this endpoint is undocumented and may change/break; the app keeps FMP as
// a fallback. Data is typically ~15-min delayed and shows the last close outside
// market hours. Yahoo's ToS restricts commercial redistribution — fine for
// personal use, revisit before shipping as a product.

const SAFE_SYM = /^[A-Z0-9.\-^=]+$/;
const SAFE_OPT = /^[0-9a-z]+$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const symbol = (req.query.symbol || "").toString().toUpperCase();
  const range = (req.query.range || "1y").toString();
  const interval = (req.query.interval || "1d").toString();
  if (!SAFE_SYM.test(symbol)) return res.status(400).json({ error: "Invalid symbol.", code: "BAD_SYMBOL" });
  if (!SAFE_OPT.test(range) || !SAFE_OPT.test(interval)) return res.status(400).json({ error: "Invalid range/interval.", code: "BAD_PARAM" });

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TigerTrade/1.0)", "Accept": "application/json" } });
    if (!r.ok) return res.status(r.status).json({ error: "Upstream Yahoo error.", code: "UPSTREAM", status: r.status });
    const j = await r.json();
    const result = j && j.chart && j.chart.result && j.chart.result[0];
    if (!result) return res.status(404).json({ error: "No data.", code: "NO_DATA", detail: j && j.chart && j.chart.error });

    const meta = result.meta || {};
    const ts = result.timestamp || [];
    const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
    const adj = result.indicators && result.indicators.adjclose && result.indicators.adjclose[0] && result.indicators.adjclose[0].adjclose;

    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      const close = adj && adj[i] != null ? adj[i] : (q.close ? q.close[i] : null);
      if (close == null) continue;
      bars.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        open: q.open ? q.open[i] : null, high: q.high ? q.high[i] : null,
        low: q.low ? q.low[i] : null, close, volume: q.volume ? q.volume[i] : null,
      });
    }

    const price = meta.regularMarketPrice ?? null;
    // prior-session close = the bar before the last one. meta.chartPreviousClose
    // is the close before the CHART RANGE (a year ago on range=1y) — using it
    // made the "daily %" show the 12-month move. Fall back only if bars are thin.
    let prev = null;
    if (bars.length >= 2) {
      const lastClose = bars[bars.length - 1].close;
      prev = price != null && Math.abs(price - lastClose) < 1e-9
        ? bars[bars.length - 2].close      // market closed: last bar IS the price
        : lastClose;                        // market open: last full bar = yesterday
    }
    if (prev == null) prev = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const out = {
      symbol: meta.symbol || symbol,
      price,
      previousClose: prev,
      changePercentage: price != null && prev ? ((price - prev) / prev) * 100 : null,
      timestamp: meta.regularMarketTime || null,
      currency: meta.currency || null,
      bars,
    };
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json(out);
  } catch (e) {
    console.error("Yahoo proxy error:", e);
    return res.status(502).json({ error: "Upstream fetch failed.", code: "FETCH_FAILED" });
  }
}
