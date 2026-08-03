// api/earnings.js — Vercel Serverless Function
// Earnings for arbitrary symbols the nightly snapshot doesn't cover — i.e. a
// portfolio holding outside the S&P 500. The snapshot is shared and cached for
// everyone, so it can't know about one person's positions; this fills the gap.
//
//   GET /api/earnings?symbols=NBIS,ASML
//   → { NBIS: { d: "2026-08-12", t: null, est: true, src: "yahoo",
//               last: { d, epsA, epsE, revA, revE, qEnd } } }
//
// WHY THREE SOURCES. FMP's per-symbol `earnings` endpoint is gated above this
// account's plan (it answers ACCESS DENIED), and the date-range
// `earnings-calendar` this plan does serve is capped to ~20 mega-cap names per
// window — NBIS and friends never appear in either. Yahoo's quoteSummary is
// therefore the one source that actually answers for an off-universe name, and
// it is the reason this endpoint returns anything at all today. FMP is still
// tried first because it carries revenue actuals and a real report date; if the
// plan is upgraded it simply starts winning.
//
// Nothing is estimated locally. Yahoo flags its own projected dates and that
// flag is passed straight through as `est` so the UI can mark them with a "~"
// rather than presenting a guess as confirmed.

const SAFE = /^[A-Za-z0-9_,.\-^]+$/;
const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// quoteSummary fields arrive as { raw, fmt } wrappers — sometimes bare
const raw = (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v.raw ?? null) : (v ?? null));
const rnum = (v) => num(raw(v));
const tsDay = (v) => { const t = raw(v); return t == null ? null : iso(+t * 1000); };

/* ── Yahoo cookie + crumb ────────────────────────────────────────────────
   quoteSummary has required a consent cookie plus a matching crumb since 2023.
   Both are fetched once and reused for the life of a warm lambda; a 401/403
   invalidates them so the next request re-handshakes. */
let yCred = null;                       // { cookie, crumb, at }
let yCredJob = null;                    // in-flight handshake, shared by the batch
const Y_TTL = 30 * 60 * 1000;

// Every symbol in a batch asks for credentials at once, so the handshake is
// de-duplicated in flight — otherwise a 10-name portfolio would run ten of them.
function yahooCreds() {
  if (yCred && Date.now() - yCred.at < Y_TTL) return Promise.resolve(yCred);
  if (yCredJob) return yCredJob;
  yCredJob = handshake().finally(() => { yCredJob = null; });
  return yCredJob;
}

async function handshake() {
  for (const seed of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    try {
      // fc.yahoo.com answers 404 but still sets the A1/A3 cookies we need
      const r = await fetch(seed, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "manual" });
      const set = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie()
        : (r.headers.get("set-cookie") ? [r.headers.get("set-cookie")] : []);
      const cookie = set.map((c) => String(c).split(";")[0]).filter((c) => /^(A1|A3|A1S|B)=/.test(c)).join("; ");
      if (!cookie) continue;
      const c = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",
        { headers: { "User-Agent": UA, Accept: "*/*", Cookie: cookie } });
      if (!c.ok) continue;
      const crumb = (await c.text()).trim();
      if (!crumb || crumb.length > 32 || /[<>\s]/.test(crumb)) continue;   // an HTML error page, not a crumb
      yCred = { cookie, crumb, at: Date.now() };
      return yCred;
    } catch { /* try the next seed */ }
  }
  return null;
}

async function yahooEarnings(sym, today) {
  const cred = await yahooCreds();
  if (!cred) return null;
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}`
    + `?modules=calendarEvents%2CearningsHistory%2Cearnings&crumb=${encodeURIComponent(cred.crumb)}`;
  let j;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json", Cookie: cred.cookie } });
    if (r.status === 401 || r.status === 403) { yCred = null; return null; }   // crumb went stale
    if (!r.ok) return null;
    j = await r.json();
  } catch { return null; }

  const res = j && j.quoteSummary && Array.isArray(j.quoteSummary.result) && j.quoteSummary.result[0];
  if (!res) return null;

  // next report date — the array holds one entry, or two when Yahoo only knows
  // a window. Take the earliest that hasn't already passed.
  const ce = (res.calendarEvents && res.calendarEvents.earnings) || {};
  let d = null;
  for (const e of (Array.isArray(ce.earningsDate) ? ce.earningsDate : [])) {
    const day = tsDay(e);
    if (day && day >= today && (!d || day < d)) d = day;
  }
  const est = raw(ce.isEarningsDateEstimate) === true;

  // most recent reported quarter. NOTE: `quarter` is the fiscal period END,
  // not the day it was announced — flagged as qEnd so the UI can say so
  // instead of mislabelling it "reported on".
  let last = null;
  for (const h of ((res.earningsHistory && res.earningsHistory.history) || [])) {
    const day = tsDay(h && h.quarter);
    const epsA = rnum(h && h.epsActual);
    if (!day || epsA == null || day > today) continue;
    if (!last || day > last.d) last = { d: day, epsA, epsE: rnum(h.epsEstimate), revA: null, revE: null, qEnd: true };
  }
  // revenue for that same quarter, matched on Yahoo's "3Q2025" period label
  if (last) {
    const fc = (res.earnings && res.earnings.financialsChart && res.earnings.financialsChart.quarterly) || [];
    const dt = new Date(last.d + "T00:00:00Z");
    const label = `${Math.floor(dt.getUTCMonth() / 3) + 1}Q${dt.getUTCFullYear()}`;
    const hit = fc.find((x) => x && String(x.date) === label);
    if (hit) last.revA = rnum(hit.revenue);
  }

  if (!d && !last) return null;
  return { d, t: null, est, src: "yahoo", last };
}

/* ── FMP rows → the same record shape ───────────────────────────────────── */
function foldFmp(rows, today) {
  const out = {};
  for (const e of rows) {
    const tk = e.symbol;
    const day = String(e.date || "").slice(0, 10);
    if (!tk || !day) continue;
    const rec = out[tk] || (out[tk] = { d: null, t: null, est: false, src: "fmp", last: null });
    if (day >= today && (!rec.d || day < rec.d)) {
      rec.d = day;
      rec.t = e.time && /bmo|amc/i.test(e.time) ? String(e.time).toLowerCase() : null;
    }
    const epsA = num(e.epsActual), revA = num(e.revenueActual);
    if (day <= today && (epsA != null || revA != null) && (!rec.last || day > rec.last.d)) {
      rec.last = { d: day, epsA, epsE: num(e.epsEstimated), revA, revE: num(e.revenueEstimated), qEnd: false };
    }
  }
  for (const k of Object.keys(out)) if (!out[k].d && !out[k].last) delete out[k];
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const raws = (req.query.symbols || req.query.symbol || "").toString();
  if (!raws || !SAFE.test(raws)) return res.status(400).json({ error: "Missing or invalid `symbols`.", code: "BAD_SYMBOLS" });
  const want = [...new Set(raws.toUpperCase().split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 40);
  if (!want.length) return res.status(400).json({ error: "No symbols.", code: "BAD_SYMBOLS" });

  const key = process.env.FMP_API_KEY;          // optional — Yahoo needs no key
  const today = iso(Date.now());
  const from = iso(Date.now() - 98 * 86400000);
  const to = iso(Date.now() + 70 * 86400000);

  // Passes 1 and 2 race per symbol: FMP is preferred when it answers (real
  // report date + revenue), Yahoo is what actually covers off-universe names.
  const fmpRows = [];
  const [, yahoo] = await Promise.all([
    key ? Promise.all(want.map(async (sym) => {
      try {
        const r = await fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(sym)}&limit=16&apikey=${key}`);
        if (!r.ok) return;                        // 402/403 on plans without this endpoint
        const j = await r.json();
        if (Array.isArray(j)) for (const e of j) if (e && e.date) fmpRows.push({ ...e, symbol: e.symbol || sym });
      } catch { /* Yahoo covers it */ }
    })) : Promise.resolve(),
    Promise.all(want.map((sym) => yahooEarnings(sym, today).catch(() => null))),
  ]);

  const out = foldFmp(fmpRows, today);
  want.forEach((sym, i) => { if (!out[sym] && yahoo[i]) out[sym] = yahoo[i]; });

  // Pass 3, last resort: the market-wide FMP calendar, filtered to whatever is
  // still missing. Deliberately a single request — this plan ignores a `symbol`
  // filter here, so asking per name would pull the same payload once per symbol.
  const missing = want.filter((s) => !out[s]);
  if (key && missing.length) {
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
        Object.assign(out, foldFmp(j.filter((e) => e && e.symbol && need.has(e.symbol)), today));
        break;
      } catch { /* try the next spelling */ }
    }
  }

  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json(out);
}
