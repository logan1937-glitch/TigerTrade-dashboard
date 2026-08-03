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
// NO FMP HERE, DELIBERATELY. This account's plan cannot answer for an
// off-universe name, verified twice against the live API: per-symbol `earnings`
// → ACCESS DENIED (as do `income-statement` and `financial-estimates`), and the
// date-range `earnings-calendar` it does serve returned 21 mega-cap names for a
// 17-day window with no NBIS in it — and those mega-caps are already in the
// nightly snapshot, so it could never add anything this endpoint exists for.
// Calling it was two guaranteed-failing round trips per request. It is gone.
//
// FINNHUB IS THE ONE TO SET UP. Its earnings calendar takes a symbol filter, so
// one request answers for one name — including the off-universe listings FMP
// refuses — and it ships the forward EPS/revenue estimate with the date. It is a
// documented, supported API rather than an endpoint that can change shape
// without notice, which is what makes it dependable. Free tier; set
// FINNHUB_API_KEY in the Vercel env and it becomes the primary source. Without
// the key it is skipped entirely and nothing below changes.
//
// BEHIND IT, TWO YAHOO DOORS, CHEAPEST FIRST.
//   1. chart (v8) — no cookie, no crumb, one request. The same endpoint
//      /api/yahoo and the nightly snapshot already hit ~500 times a night from
//      this deployment, so it is the Yahoo path known to be reachable here.
//      Asked with `events=earn` it carries report dates too.
//   2. quoteSummary (v10) — richer (estimate flag, EPS history, revenue) but
//      crumb-gated since 2023, so it costs a two-request handshake before it can
//      even be tried, and Yahoo rate-limits datacenter egress. Asked only when
//      the chart came back without a date, or without a reported quarter.
//
// AND A CACHE THAT REMEMBERS. Rate limits are per-IP and intermittent, so a
// resolved date is written to Vercel Blob (the store the snapshot already uses):
// ONE success from any region at any time is served to everyone afterwards
// instead of being re-earned per request. A warm cache hit costs no upstream
// call at all. When both doors fail, a stale cached date is served rather than a
// blank, flagged `stale`.
//
// If a listing defeats both doors, the UI lets you set the date on the position
// yourself — labelled as yours, never as confirmed.
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
  // one crumbed attempt and one bare one — the second gateway almost never
  // answers when the first refuses, and this path is already the slow one
  const attempts = cred ? [["query2", true], ["query1", false]] : [["query2", false]];

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

/* ── the keyed door: Finnhub ─────────────────────────────────────────────────
   The only source here that is a documented, supported API rather than an
   undocumented endpoint that can change shape without notice. Its calendar takes
   a symbol filter directly, so one request answers for one name — including the
   off-universe listings FMP's plan will not serve — and it carries the forward
   EPS/revenue estimates alongside the date. Free tier, but it needs a key, so it
   is skipped entirely when FINNHUB_API_KEY is absent and Yahoo carries on as
   before. When the key IS set this runs first and Yahoo becomes the backup. */
function parseFinnhub(j, today) {
  const rows = j && Array.isArray(j.earningsCalendar) ? j.earningsCalendar : null;
  if (!rows || !rows.length) return null;
  let d = null, t = null, last = null;
  for (const e of rows) {
    const day = String((e && e.date) || "").slice(0, 10);
    if (!day) continue;
    if (day >= today) {
      if (!d || day < d) { d = day; t = /^(bmo|amc)$/i.test(e.hour || "") ? String(e.hour).toLowerCase() : null; }
      continue;
    }
    const epsA = num(e.epsActual);
    if (epsA == null) continue;
    // Finnhub dates the row by the announcement day, so this is a real
    // "reported on", not a fiscal period end
    if (!last || day > last.d) {
      last = { d: day, epsA, epsE: num(e.epsEstimate), revA: num(e.revenueActual), revE: num(e.revenueEstimate), qEnd: false };
    }
  }
  if (!d && !last) return null;
  return { d, t, est: false, src: "finnhub", last };
}

async function finnhubEarnings(sym, today, diag) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const from = iso(Date.now() - 98 * 86400000);
  const to = iso(Date.now() + 150 * 86400000);
  const url = `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}`
    + `&symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    diag?.push({ step: "finnhub", sym, status: r.status });
    if (!r.ok) return null;                       // 401 bad key, 429 over the free-tier rate
    const rec = parseFinnhub(await r.json(), today);
    diag?.push({ step: "finnhub:parsed", sym, d: rec?.d ?? null, hasLast: !!rec?.last });
    return rec;
  } catch (e) { diag?.push({ step: "finnhub", sym, error: errText(e) }); return null; }
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

// Chart first: it is one request with no cookie/crumb handshake in front of it,
// on the endpoint this deployment already reaches ~500 times a night. quoteSummary
// is asked only when the chart yields no date — it is richer (estimate flag, EPS
// history, revenue) but costs a two-request handshake before it can even be tried.
async function resolve(sym, today, diag) {
  // a supported API with a key beats two undocumented endpoints, when there is one
  const fh = await finnhubEarnings(sym, today, diag);
  if (fh && fh.d) return fh;
  const y = await yahooEarnings(sym, today, diag);
  if (!y) return fh;
  if (!fh) return y;
  return { ...y, last: fh.last || y.last };       // keep Finnhub's revenue figures
}

async function yahooEarnings(sym, today, diag) {
  const ch = await yahooChart(sym, today, diag);
  if (ch && ch.d && ch.last) return ch;
  const qs = await yahooQuoteSummary(sym, today, diag);
  if (!qs) return ch;
  if (!ch) return qs;
  return { ...qs, d: ch.d || qs.d, est: ch.d ? false : qs.est, last: qs.last || ch.last };
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
  const today = iso(Date.now());
  diag?.push({ step: "start", today, symbols: want, blob: hasBlob, finnhubKey: !!process.env.FINNHUB_API_KEY, refresh, node: process.version });

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
    const got = await Promise.all(ask.map((sym) => resolve(sym, today, diag).catch((e) => {
      diag?.push({ step: "resolve", sym, error: errText(e) });
      return null;
    })));
    ask.forEach((sym, i) => { if (got[i]) out[sym] = got[i]; });

    // A symbol every upstream just refused falls back to whatever the
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
