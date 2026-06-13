// api/fmp.js — Vercel Serverless Function
// Optional live-data proxy for Financial Modeling Prep. Keeps your FMP API key
// on the server, never exposed to the browser. The dashboard runs fully on its
// built-in demo dataset; this endpoint lets you wire in live quotes when a key
// is configured (set FMP_API_KEY in your Vercel project env vars).
//
// Usage from the client:
//   GET /api/fmp?path=quote/NVDA
//   GET /api/fmp?path=quote/NVDA,AVGO,MRVL
// `path` is the FMP stable-API path after the version segment.
//
// Note: batch quotes, the stock screener and index quotes require a paid FMP
// tier. The free tier is limited — verify your plan at
// https://site.financialmodelingprep.com/developer/docs/pricing

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const key = process.env.FMP_API_KEY;
  if (!key) {
    return res.status(501).json({ error: "FMP_API_KEY not configured — dashboard is running on demo data." });
  }

  const path = (req.query.path || "").toString().replace(/^\/+/, "");
  if (!path || !/^[a-zA-Z0-9/_,.\-^%]+$/.test(path)) {
    return res.status(400).json({ error: "Missing or invalid `path` query parameter." });
  }

  try {
    const url = `https://financialmodelingprep.com/stable/${path}${path.includes("?") ? "&" : "?"}apikey=${key}`;
    const r = await fetch(url);
    const data = await r.json();
    // cache at the edge for 60s to conserve API calls
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(r.status).json(data);
  } catch (e) {
    console.error("FMP proxy error:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
}
