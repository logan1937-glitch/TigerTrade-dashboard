// api/earnings.js — Vercel Serverless Function
// Earnings for arbitrary symbols the nightly snapshot doesn't cover — i.e. a
// portfolio holding outside the S&P 500. The snapshot is shared and cached for
// everyone, so it can't know about one person's positions; this fills the gap.
//
//   GET /api/earnings?symbols=NBIS,ASML
//   → { NBIS: { d: "2026-08-12", t: "amc"|null,
//               last: { d, epsA, epsE, revA, revE } } }
//
// Two sources, in order: the cheap per-symbol `earnings` endpoint, then the
// date-range `earnings-calendar` (the spelling this account's tier is known to
// serve) filtered down to whatever the first pass missed. Symbols with no
// calendar entry are simply absent — nothing is estimated.

const SAFE = /^[A-Za-z0-9_,.\-^]+$/;
const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const key = process.env.FMP_API_KEY;
  if (!key) return res.status(501).json({ error: "FMP_API_KEY not configured.", code: "NO_KEY" });

  const raw = (req.query.symbols || req.query.symbol || "").toString();
  if (!raw || !SAFE.test(raw)) return res.status(400).json({ error: "Missing or invalid `symbols`.", code: "BAD_SYMBOLS" });
  const want = [...new Set(raw.toUpperCase().split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 40);
  if (!want.length) return res.status(400).json({ error: "No symbols.", code: "BAD_SYMBOLS" });

  const today = iso(Date.now());
  const from = iso(Date.now() - 98 * 86400000);
  const to = iso(Date.now() + 70 * 86400000);
  const rows = [];

  // 1) per-symbol — small and precise, but gated on some tiers
  await Promise.all(want.map(async (sym) => {
    try {
      const r = await fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(sym)}&limit=16&apikey=${key}`);
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j)) for (const e of j) if (e && e.date) rows.push({ ...e, symbol: e.symbol || sym });
    } catch { /* fall through to the calendar */ }
  }));

  // 2) whatever that didn't cover: one market-wide calendar sweep, filtered
  //    down to the stragglers. Deliberately a single request — the calendar
  //    ignores a `symbol` filter on this tier, so asking per name would just
  //    pull the same full payload once per symbol.
  const covered = new Set(rows.map((r) => r.symbol));
  const missing = want.filter((s) => !covered.has(s));
  if (missing.length) {
    const need = new Set(missing);
    for (const url of [
      `https://financialmodelingprep.com/stable/earnings-calendar?from=${from}&to=${to}&includeReportTimes=true&apikey=${key}`,
      `https://financialmodelingprep.com/api/v3/earning_calendar?from=${from}&to=${to}&apikey=${key}`,
    ]) {
      try {
        const r = await fetch(url);
        if (!r.ok) continue;
        const j = await r.json();
        if (!Array.isArray(j) || !j.length) continue;
        for (const e of j) if (e && e.symbol && need.has(e.symbol) && e.date) rows.push(e);
        break;
      } catch { /* try the next spelling */ }
    }
  }

  const out = {};
  for (const e of rows) {
    const tk = e.symbol;
    const d = String(e.date || "").slice(0, 10);
    if (!tk || !d) continue;
    const rec = out[tk] || (out[tk] = { d: null, t: null, last: null });
    if (d >= today && (!rec.d || d < rec.d)) {
      rec.d = d;
      rec.t = e.time && /bmo|amc/i.test(e.time) ? String(e.time).toLowerCase() : null;
    }
    const epsA = num(e.epsActual), revA = num(e.revenueActual);
    if (d <= today && (epsA != null || revA != null) && (!rec.last || d > rec.last.d)) {
      rec.last = { d, epsA, epsE: num(e.epsEstimated), revA, revE: num(e.revenueEstimated) };
    }
  }
  for (const k of Object.keys(out)) if (!out[k].d && !out[k].last) delete out[k];

  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json(out);
}
