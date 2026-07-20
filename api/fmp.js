// api/fmp.js — Vercel Serverless Function
// Live-data proxy for Financial Modeling Prep. Keeps your FMP API key on the
// server, never exposed to the browser. The screener pulls live quotes through
// this endpoint; if no key is configured it returns 501 and the dashboard shows
// a loud "DEMO — NOT LIVE" state (it never fabricates numbers).
//
// Usage from the client:
//   GET /api/fmp?endpoint=quote&symbol=NVDA
//   GET /api/fmp?endpoint=batch-quote&symbols=NVDA,AVGO,MRVL
// `endpoint` is the FMP stable-API path; all other query params are forwarded.
//
// Note: batch quotes and index quotes may require a paid FMP tier. Single-symbol
// quotes work on the free tier — verify your plan at
// https://site.financialmodelingprep.com/developer/docs/pricing

const SAFE = /^[A-Za-z0-9_,.\-^/]+$/;

// Whitelisted endpoints (exact match or `<prefix>/...`). Keeps the proxy from
// being used as an open relay to arbitrary FMP routes.
const ALLOWED = [
  "quote",
  "quote-short",
  "batch-quote",
  "profile",
  "income-statement",
  "ratios-ttm",
  "key-metrics-ttm",
  "historical-price-eod/light",
  "historical-price-eod-light",
  "historical-price-eod-full",
  "historical-price-eod-dividend-adjusted",
  "economic-calendar",
  "economics-calendar",
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const key = process.env.FMP_API_KEY;
  if (!key) {
    return res.status(501).json({ error: "FMP_API_KEY not configured — dashboard is in demo mode.", code: "NO_KEY" });
  }

  // accept `endpoint` (preferred) or legacy `path`
  const endpoint = (req.query.endpoint || req.query.path || "").toString().replace(/^\/+/, "");
  if (!endpoint || !SAFE.test(endpoint)) {
    return res.status(400).json({ error: "Missing or invalid `endpoint`.", code: "BAD_ENDPOINT" });
  }
  if (!ALLOWED.some((e) => endpoint === e || endpoint.startsWith(e + "/"))) {
    return res.status(403).json({ error: `Endpoint not allowed: ${endpoint}`, code: "FORBIDDEN" });
  }

  // forward every other query param, sanitized
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (k === "endpoint" || k === "path") continue;
    const val = Array.isArray(v) ? v.join(",") : String(v);
    if (!SAFE.test(val)) {
      return res.status(400).json({ error: `Invalid value for query param "${k}".`, code: "BAD_PARAM" });
    }
    params.set(k, val);
  }
  params.set("apikey", key);

  try {
    const url = `https://financialmodelingprep.com/stable/${endpoint}?${params.toString()}`;
    const r = await fetch(url);
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) {
      return res.status(r.status).json({ error: "Upstream FMP error.", code: "UPSTREAM", status: r.status, detail: data });
    }
    // cache at the edge to conserve API calls
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    return res.status(200).json(data);
  } catch (e) {
    console.error("FMP proxy error:", e);
    return res.status(502).json({ error: "Upstream fetch failed.", code: "FETCH_FAILED" });
  }
}
