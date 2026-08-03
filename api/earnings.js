// api/earnings.js — Vercel Serverless Function
// Earnings for arbitrary symbols the nightly snapshot doesn't cover — i.e. a
// portfolio holding outside the S&P 500. The snapshot is shared and cached for
// everyone, so it can't know about one person's positions; this fills the gap.
//
//   GET /api/earnings?symbols=NBIS,ASML
//   → { NBIS: { d: "2026-08-12", t: null, est: true, src: "yahoo",
//               last: { d, epsA, epsE, revA, revE, qEnd } } }
//
//   GET /api/earnings?symbols=NBIS&debug=1
//   → { result: {...}, diag: { steps: [...] } }   ← every upstream status code,
//     so a failure here is diagnosable from a browser instead of silent. No
//     key, cookie or crumb VALUE is ever echoed — only presence and length.
//
// WHY YAHOO. FMP on this account's plan cannot answer for an off-universe name,
// verified endpoint by endpoint: per-symbol `earnings` → ACCESS DENIED,
// `income-statement` → ACCESS DENIED, `financial-estimates` → ACCESS DENIED, and
// the date-range `earnings-calendar` it does serve is capped to ~20 mega-cap
// names per window. Only `profile` and quotes come back. Yahoo's quoteSummary is
// therefore the one source that answers for NBIS and friends. FMP is still tried
// first and simply starts winning again if the plan is upgraded.
//
// Nothing is estimated locally. Yahoo flags its own projected dates and that
// flag is passed straight through as `est` so the UI can mark them with a "~"
// rather than presenting a guess as confirmed.

const SAFE = /^[A-Za-z0-9_,.\-^]+$/;
const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const errText = (e) => String((e && e.message) || e).slice(0, 140);

// quoteSummary fields arrive as { raw, fmt } wrappers — sometimes bare
const unwrap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v.raw ?? null) : (v ?? null));
const rnum = (v) => num(unwrap(v));
const tsDay = (v) => { const t = unwrap(v); return t == null ? null : iso(+t * 1000); };

/* ── Yahoo cookie + crumb ────────────────────────────────────────────────
   quoteSummary has required a consent cookie plus a matching crumb since 2023.
   Both are fetched once and reused for the life of a warm lambda; a 401/403
   invalidates them so the next request re-handshakes. Yahoo is also known to
   rate-limit datacenter egress, so every failure mode is recorded rather than
   swallowed — that is what `debug=1` surfaces. */
let yCred = null;                       // { cookie, crumb, at }
let yCredJob = null;                    // in-flight handshake, shared by the batch
const Y_TTL = 30 * 60 * 1000;

// Every symbol in a batch asks for credentials at once, so the handshake is
// de-duplicated in flight — otherwise a 10-name portfolio would run ten of them.
function yahooCreds(diag) {
  if (yCred && Date.now() - yCred.at < Y_TTL) { diag?.push({ step: "yahoo:creds", cached: true }); return Promise.resolve(yCred); }
  if (yCredJob) return yCredJob;
  yCredJob = handshake(diag).finally(() => { yCredJob = null; });
  return yCredJob;
}

async function handshake(diag) {
  for (const seed of ["https://fc.yahoo.com/", "https://finance.yahoo.com/"]) {
    let cookie = "";
    try {
      // fc.yahoo.com answers 404 but still sets the A1/A3 cookies we need
      const r = await fetch(seed, { headers: { "User-Agent": UA, Accept: "*/*" }, redirect: "manual" });
      const set = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie()
        : (r.headers.get("set-cookie") ? String(r.headers.get("set-cookie")).split(/,(?=\s*\w+=)/) : []);
      const picked = set.map((c) => String(c).split(";")[0].trim()).filter((c) => /^(A1|A3|A1S|B)=/.test(c));
      cookie = picked.join("; ");
      diag?.push({ step: "yahoo:seed", host: new URL(seed).host, status: r.status, setCookies: set.length, picked: picked.map((c) => c.split("=")[0]) });
    } catch (e) { diag?.push({ step: "yahoo:seed", host: new URL(seed).host, error: errText(e) }); continue; }
    if (!cookie) continue;

    try {
      const c = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",
        { headers: { "User-Agent": UA, Accept: "*/*", Cookie: cookie } });
      const text = c.ok ? (await c.text()).trim() : "";
      const ok = !!text && text.length <= 32 && !/[<>\s]/.test(text);   // an HTML error page is not a crumb
      diag?.push({ step: "yahoo:crumb", status: c.status, len: text.length, usable: ok });
      if (!ok) continue;
      yCred = { cookie, crumb: text, at: Date.now() };
      return yCred;
    } catch (e) { diag?.push({ step: "yahoo:crumb", error: errText(e) }); }
  }
  diag?.push({ step: "yahoo:creds", result: "unavailable" });
  return null;
}

function parseYahoo(j, today) {
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
  const est = unwrap(ce.isEarningsDateEstimate) === true;

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

async function yahooEarnings(sym, today, diag) {
  const cred = await yahooCreds(diag);
  const path = `/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents%2CearningsHistory%2Cearnings`;
  // Both hosts, with the crumb when we have one and bare as a last resort —
  // Yahoo's gateways don't fail identically and a bare call still answers for
  // some regions. Costs nothing when the first attempt succeeds.
  const attempts = cred
    ? [["query2", true], ["query1", true], ["query2", false]]
    : [["query2", false], ["query1", false]];

  for (const [host, withCrumb] of attempts) {
    const url = `https://${host}.finance.yahoo.com${path}${withCrumb ? `&crumb=${encodeURIComponent(cred.crumb)}` : ""}`;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...(withCrumb ? { Cookie: cred.cookie } : {}) },
      });
      diag?.push({ step: "yahoo:quoteSummary", sym, host, crumb: withCrumb, status: r.status });
      if (r.status === 401 || r.status === 403) { yCred = null; continue; }   // creds went stale
      if (!r.ok) continue;
      const rec = parseYahoo(await r.json(), today);
      if (rec) { diag?.push({ step: "yahoo:parsed", sym, d: rec.d, est: rec.est, hasLast: !!rec.last }); return rec; }
      diag?.push({ step: "yahoo:parsed", sym, result: "no usable fields" });
    } catch (e) { diag?.push({ step: "yahoo:quoteSummary", sym, host, error: errText(e) }); }
  }
  return null;
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

  const debug = req.query.debug === "1" || req.query.debug === "true";
  const diag = debug ? [] : null;
  const key = process.env.FMP_API_KEY;          // optional — Yahoo needs no key
  const today = iso(Date.now());
  const from = iso(Date.now() - 98 * 86400000);
  const to = iso(Date.now() + 70 * 86400000);
  diag?.push({ step: "start", today, symbols: want, fmpKey: !!key, node: process.version });

  // Passes 1 and 2 race per symbol: FMP is preferred when it answers (real
  // report date + revenue), Yahoo is what actually covers off-universe names.
  const fmpRows = [];
  const [, yahoo] = await Promise.all([
    key ? Promise.all(want.map(async (sym) => {
      try {
        const r = await fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(sym)}&limit=16&apikey=${key}`);
        diag?.push({ step: "fmp:earnings", sym, status: r.status });
        if (!r.ok) return;                        // 402/403 on plans without this endpoint
        const j = await r.json();
        if (Array.isArray(j)) for (const e of j) if (e && e.date) fmpRows.push({ ...e, symbol: e.symbol || sym });
      } catch (e) { diag?.push({ step: "fmp:earnings", sym, error: errText(e) }); }
    })) : Promise.resolve(),
    Promise.all(want.map((sym) => yahooEarnings(sym, today, diag).catch((e) => {
      diag?.push({ step: "yahoo", sym, error: errText(e) });
      return null;
    }))),
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
        const j = r.ok ? await r.json() : null;
        const hits = Array.isArray(j) ? j.filter((e) => e && e.symbol && need.has(e.symbol)) : [];
        diag?.push({ step: "fmp:calendar", status: r.status, rows: Array.isArray(j) ? j.length : 0, matched: hits.length });
        if (!Array.isArray(j) || !j.length) continue;
        Object.assign(out, foldFmp(hits, today));
        break;
      } catch (e) { diag?.push({ step: "fmp:calendar", error: errText(e) }); }
    }
  }

  if (debug) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ result: out, diag: { steps: diag } });
  }
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json(out);
}
