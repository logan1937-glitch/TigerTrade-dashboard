// api/earnings.js — Vercel Serverless Function
// Earnings for arbitrary symbols the nightly snapshot doesn't cover — i.e. a
// portfolio holding outside the S&P 500. The snapshot is shared and cached for
// everyone, so it can't know about one person's positions; this fills the gap.
//
//   GET /api/earnings?symbols=NBIS,ASML
//   → { NBIS: { d: "2026-08-12", t: null, est: true, src: "yahoo",
//               last: { d, epsA, epsE, revA, revE, qEnd } } }
//
//   GET /api/earnings?symbols=NBIS&debug=1     ← every upstream status code
//   GET /api/earnings?symbols=NBIS&refresh=1   ← ignore the cache, re-ask upstream
//
// WHY NOT FMP. This account's plan cannot answer for an off-universe name,
// re-verified against the live API: per-symbol `earnings` → ACCESS DENIED, as do
// `income-statement` and `financial-estimates`, and the date-range
// `earnings-calendar` it does serve returned 21 mega-cap names for a 17-day
// window with no NBIS in it. Only `profile` and quotes come back. FMP is still
// asked first and simply starts winning again if the plan is upgraded.
//
// SO: YAHOO, BY TWO DIFFERENT DOORS.
//   1. quoteSummary (v10) — the richest answer (next date, estimate flag, EPS
//      history, revenue) but crumb-gated since 2023, and Yahoo rate-limits
//      datacenter egress, so the handshake is the step most likely to be refused
//      on Vercel. That is the suspected reason NBIS showed no date.
//   2. chart (v8) — no cookie, no crumb. This is the same endpoint /api/yahoo
//      and the nightly snapshot already hit successfully for ~500 tickers, so it
//      is the one Yahoo path this deployment is known to reach. Asked with
//      `events=earn`, it can carry the report dates too. Tried whenever door 1
//      fails to produce a date.
//
// AND A CACHE THAT REMEMBERS. Both doors are flaky by nature — rate limits are
// per-IP and intermittent. A resolved date is therefore written to Vercel Blob
// (the store the snapshot already uses), so ONE success from any region at any
// time is served to everyone afterwards instead of being re-earned per request.
// When every upstream fails, a stale cached date is served rather than a blank.
//
// Nothing is ever estimated locally. Yahoo flags its own projected dates and that
// flag is passed straight through as `est` so the UI can mark them with a "~"
// rather than presenting a guess as confirmed.

import { put, list } from "@vercel/blob";

const SAFE = /^[A-Za-z0-9_,.\-^]+$/;
const num = (v) => (v != null && Number.isFinite(+v) ? +v : null);
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const errText = (e) => String((e && e.message) || e).slice(0, 140);

// quoteSummary fields arrive as { raw, fmt } wrappers — chart events send bare numbers
const unwrap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? (v.raw ?? null) : (v ?? null));
const rnum = (v) => num(unwrap(v));
const tsDay = (v) => { const t = unwrap(v); return t == null || !Number.isFinite(+t) ? null : iso(+t * 1000); };

/* ── durable cache ───────────────────────────────────────────────────────────
   Keyed by symbol, stored as one small JSON blob. A record is re-asked once its
   entry passes TTL or its date falls into the past; until then the upstreams are
   not touched at all. Without a Blob store connected this degrades to the
   in-memory map, which still helps a warm lambda. */
const BLOB_KEY = "earnings-cache.json";
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;
const TTL = 12 * 60 * 60 * 1000;        // re-ask a resolved symbol twice a day
const MEM_TTL = 5 * 60 * 1000;
let mem = null;                          // { at, map: { SYM: { rec, at } } }

// a cached record is still usable if its next date hasn't passed; one that only
// carries a past quarter's results stays usable too — that part doesn't go stale
const usable = (rec, today) => !!rec && ((rec.d && rec.d >= today) || !!rec.last);

async function readCache(diag) {
  if (mem && Date.now() - mem.at < MEM_TTL) { diag?.push({ step: "cache:read", from: "memory", symbols: Object.keys(mem.map).length }); return mem.map; }
  if (!hasBlob) { diag?.push({ step: "cache:read", from: "none", reason: "no blob store" }); return mem ? mem.map : {}; }
  try {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) { diag?.push({ step: "cache:read", from: "blob", result: "empty" }); mem = { at: Date.now(), map: {} }; return mem.map; }
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    const map = r.ok ? await r.json() : {};
    mem = { at: Date.now(), map: map && typeof map === "object" ? map : {} };
    diag?.push({ step: "cache:read", from: "blob", status: r.status, symbols: Object.keys(mem.map).length });
    return mem.map;
  } catch (e) {
    diag?.push({ step: "cache:read", from: "blob", error: errText(e) });
    return mem ? mem.map : {};
  }
}

async function writeCache(map, diag) {
  mem = { at: Date.now(), map };
  if (!hasBlob) return;
  try {
    await put(BLOB_KEY, JSON.stringify(map), { access: "public", contentType: "application/json", addRandomSuffix: false, allowOverwrite: true });
    diag?.push({ step: "cache:write", symbols: Object.keys(map).length });
  } catch (e) { diag?.push({ step: "cache:write", error: errText(e) }); }
}

/* ── Yahoo cookie + crumb ────────────────────────────────────────────────
   quoteSummary has required a consent cookie plus a matching crumb since 2023.
   Both are fetched once and reused for the life of a warm lambda; a 401/403
   invalidates them so the next request re-handshakes. Every failure mode is
   recorded rather than swallowed — that is what `debug=1` surfaces. */
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

/* ── door 1: quoteSummary (crumb-gated, richest) ─────────────────────────── */
function parseQuoteSummary(j, today) {
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

async function yahooQuoteSummary(sym, today, diag) {
  const cred = await yahooCreds(diag);
  const path = `/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents%2CearningsHistory%2Cearnings`;
  // Both gateways, with the crumb when we have one and bare afterwards — they
  // don't fail identically. Costs nothing when the first attempt succeeds.
  const attempts = cred
    ? [["query2", true], ["query1", true], ["query2", false], ["query1", false]]
    : [["query2", false], ["query1", false]];

  for (const [host, withCrumb] of attempts) {
    if (withCrumb && !yCred) continue;                                   // crumb went stale mid-ladder
    const url = `https://${host}.finance.yahoo.com${path}${withCrumb ? `&crumb=${encodeURIComponent(cred.crumb)}` : ""}`;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", ...(withCrumb ? { Cookie: cred.cookie } : {}) },
      });
      diag?.push({ step: "yahoo:quoteSummary", sym, host, crumb: withCrumb, status: r.status });
      if (r.status === 401 || r.status === 403) { yCred = null; continue; }   // creds went stale
      if (!r.ok) continue;
      const rec = parseQuoteSummary(await r.json(), today);
      if (rec) { diag?.push({ step: "yahoo:parsed", sym, d: rec.d, est: rec.est, hasLast: !!rec.last }); return rec; }
      diag?.push({ step: "yahoo:parsed", sym, result: "no usable fields" });
    } catch (e) { diag?.push({ step: "yahoo:quoteSummary", sym, host, error: errText(e) }); }
  }
  return null;
}

/* ── door 2: chart events (no cookie, no crumb) ──────────────────────────────
   The same v8 endpoint /api/yahoo and the snapshot already reach from this
   deployment, asked over a window that runs into the future so an upcoming
   report falls inside it. Yahoo returns the events block keyed by timestamp on
   some responses and as an array on others; both shapes are accepted, and its
   absence is recorded rather than treated as "no earnings". */
function parseChart(j, today, sym, diag) {
  const res = j && j.chart && Array.isArray(j.chart.result) && j.chart.result[0];
  const ev = res && res.events && res.events.earnings;
  if (!ev) { diag?.push({ step: "yahoo:chart", sym, result: "no earnings events block" }); return null; }
  const rows = Array.isArray(ev) ? ev : Object.values(ev);

  let d = null, last = null;
  for (const e of rows) {
    if (!e || typeof e !== "object") continue;
    const day = tsDay(e.date != null ? e.date : e.earningsDate);
    if (!day) continue;
    if (day >= today) { if (!d || day < d) d = day; continue; }
    // chart events are announcement days, so this one really is "reported on"
    const epsA = rnum(e.epsActual);
    if (epsA == null) continue;
    if (!last || day > last.d) last = { d: day, epsA, epsE: rnum(e.epsEstimate), revA: null, revE: null, qEnd: false };
  }
  if (!d && !last) { diag?.push({ step: "yahoo:chart", sym, result: "events block held no dated rows" }); return null; }
  return { d, t: null, est: false, src: "yahoo-chart", last };
}

async function yahooChart(sym, today, diag) {
  const p1 = Math.floor((Date.now() - 400 * 864e5) / 1000);
  const p2 = Math.floor((Date.now() + 150 * 864e5) / 1000);
  const path = `/v8/finance/chart/${encodeURIComponent(sym)}?period1=${p1}&period2=${p2}&interval=1d&events=earn%2Cdiv%2Csplit`;
  for (const host of ["query1", "query2"]) {
    try {
      const r = await fetch(`https://${host}.finance.yahoo.com${path}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
      diag?.push({ step: "yahoo:chart", sym, host, status: r.status });
      if (!r.ok) continue;
      const rec = parseChart(await r.json(), today, sym, diag);
      if (rec) { diag?.push({ step: "yahoo:chart:parsed", sym, d: rec.d, hasLast: !!rec.last }); return rec; }
    } catch (e) { diag?.push({ step: "yahoo:chart", sym, host, error: errText(e) }); }
  }
  return null;
}

// quoteSummary first for its richer payload; the crumb-free chart covers the
// case where the handshake is refused, which is the failure this deployment hits.
async function yahooEarnings(sym, today, diag) {
  const qs = await yahooQuoteSummary(sym, today, diag);
  if (qs && qs.d) return qs;
  const ch = await yahooChart(sym, today, diag);
  if (!ch) return qs;
  if (!qs) return ch;
  return { ...ch, last: qs.last || ch.last };      // date from the chart, results from quoteSummary
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
  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  const diag = debug ? [] : null;
  const key = process.env.FMP_API_KEY;          // optional — Yahoo needs no key
  const today = iso(Date.now());
  const from = iso(Date.now() - 98 * 86400000);
  const to = iso(Date.now() + 70 * 86400000);
  diag?.push({ step: "start", today, symbols: want, fmpKey: !!key, blob: hasBlob, refresh, node: process.version });

  // Pass 0: anything the cache still vouches for is answered without touching
  // an upstream at all.
  const cache = await readCache(diag);
  const out = {};
  const ask = [];
  for (const sym of want) {
    const c = cache[sym];
    if (!refresh && c && Date.now() - c.at < TTL && usable(c.rec, today)) { out[sym] = c.rec; diag?.push({ step: "cache:hit", sym, d: c.rec.d }); }
    else ask.push(sym);
  }

  if (ask.length) {
    // Passes 1 and 2 race per symbol: FMP is preferred when it answers (real
    // report date + revenue), Yahoo is what actually covers off-universe names.
    const fmpRows = [];
    const [, yahoo] = await Promise.all([
      key ? Promise.all(ask.map(async (sym) => {
        try {
          const r = await fetch(`https://financialmodelingprep.com/stable/earnings?symbol=${encodeURIComponent(sym)}&limit=16&apikey=${key}`);
          diag?.push({ step: "fmp:earnings", sym, status: r.status });
          if (!r.ok) return;                        // 402/403 on plans without this endpoint
          const j = await r.json();
          if (Array.isArray(j)) for (const e of j) if (e && e.date) fmpRows.push({ ...e, symbol: e.symbol || sym });
        } catch (e) { diag?.push({ step: "fmp:earnings", sym, error: errText(e) }); }
      })) : Promise.resolve(),
      Promise.all(ask.map((sym) => yahooEarnings(sym, today, diag).catch((e) => {
        diag?.push({ step: "yahoo", sym, error: errText(e) });
        return null;
      }))),
    ]);

    Object.assign(out, foldFmp(fmpRows, today));
    ask.forEach((sym, i) => { if (!out[sym] && yahoo[i]) out[sym] = yahoo[i]; });

    // Pass 3, last resort: the market-wide FMP calendar, filtered to whatever is
    // still missing. Deliberately a single request — this plan ignores a `symbol`
    // filter here, so asking per name would pull the same payload once per symbol.
    const missing = ask.filter((s) => !out[s]);
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

    // Pass 4: a symbol every upstream just refused falls back to whatever the
    // cache last knew, however old — a date earned last week is still the real
    // date, and beats the blank the user has been looking at.
    for (const sym of ask) {
      if (out[sym]) continue;
      const c = cache[sym];
      if (c && usable(c.rec, today)) { out[sym] = { ...c.rec, stale: true }; diag?.push({ step: "cache:stale", sym, d: c.rec.d, age: Math.round((Date.now() - c.at) / 36e5) + "h" }); }
    }

    // remember every fresh resolution so the next request — anyone's — is free
    let dirty = false;
    for (const sym of ask) {
      const rec = out[sym];
      if (!rec || rec.stale) continue;
      cache[sym] = { rec, at: Date.now() };
      dirty = true;
    }
    if (dirty) await writeCache(cache, diag);
  }

  if (debug) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ result: out, diag: { steps: diag } });
  }
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json(out);
}
