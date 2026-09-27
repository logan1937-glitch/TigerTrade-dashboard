// ── The LEADERS track record: a third nightly pass, a third blob ─────────────
//
// `CLAUDE.md` has said for a while that the strongest credibility feature this
// product could have is a track record for the model, "computable from bars
// already stored: without it the score is an assertion". This is that, and the
// reason it is a separate pass rather than part of the snapshot is the same
// reason the extended tier is:
//
//   COMPUTE — the core pass already spends ~50 of its 60 seconds on ~530
//   symbols. This needs 2 YEARS of bars for the same names (one full trailing
//   window before the earliest rebalance, plus the rebalances), so it cannot
//   share an invocation with anything.
//
//   CADENCE — the answer changes once a month at most. Recomputing it nightly
//   is already generous; recomputing it per request would be absurd.
//
// Yahoo only, no FMP fallback, for the reason the extended tier gives: a
// per-name FMP fallback across 530 symbols would drain the quota the macro
// board, VIX and the earnings calendar run on.
//
// NEVER COMPUTED ON DEMAND. A cold pass is ~530 upstream fetches; serving that
// to a visitor would time their request out and spend the night's budget. Until
// the cron has run it answers `status: "pending"` and the view says so — the
// same contract `?tier=ext` has.

import { list, put } from "@vercel/blob";
import { SP500 } from "../src/sp500.js";
import { runBacktest, CAVEATS, MIN_BARS, HOLD, REBAL_GAP } from "../src/backtest.js";
import { fetchBars, pool } from "./_bars.js";

/* Bump when the SHAPE of the payload changes. Blob serves the stored copy
   verbatim, so without a bump a new field is simply absent until the next cron
   with nothing on screen to explain why. */
const SCHEMA = 1;
const BLOB_KEY = "leaders-backtest-v1.json";
const hasBlob = !!process.env.BLOB_READ_WRITE_TOKEN;

// One invocation has 60s. Leave room for the ~2.3s of scoring plus the write.
const FETCH_DEADLINE = 45_000;
const BENCH = "SPY";

let mem = null;                      // { at, body } — a warm lambda's own copy
const MEM_TTL = 6 * 60 * 60 * 1000;  // the answer moves monthly; six hours is plenty

async function readBlob() {
  if (!hasBlob) return null;
  try {
    const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { console.error("backtest blob read:", e); return null; }
}

async function writeBlob(obj) {
  if (!hasBlob) return;
  try {
    await put(BLOB_KEY, JSON.stringify(obj), {
      access: "public", contentType: "application/json",
      addRandomSuffix: false, allowOverwrite: true,
    });
  } catch (e) { console.error("backtest blob write:", e); }
}

async function compute() {
  const tickers = SP500.map((x) => x.tk).filter(Boolean);
  const barsByTk = new Map();
  let refused = 0;

  // adjusted-only: an unadjusted series would read a split as a crash
  const spy = await fetchBars(BENCH, "2y", true);
  if (!spy || spy.length < MIN_BARS + HOLD + REBAL_GAP) {
    return {
      schema: SCHEMA, generatedAt: new Date().toISOString(), status: "insufficient",
      reason: `The benchmark (${BENCH}) returned ${spy ? spy.length : 0} bars; the study needs at least `
        + `${MIN_BARS + HOLD + REBAL_GAP}. Nothing is computed from a partial benchmark, because RS is measured against it.`,
      caveats: CAVEATS,
    };
  }

  await pool(tickers, async (tk) => {
    const rows = await fetchBars(tk, "2y", true);
    if (rows && rows.length >= MIN_BARS) barsByTk.set(tk, rows);
    else refused++;
  }, 6, FETCH_DEADLINE);

  const res = runBacktest(barsByTk, spy);
  return {
    schema: SCHEMA, generatedAt: new Date().toISOString(), source: "Yahoo",
    benchmark: BENCH,
    /* Coverage is reported because it bounds the claim. If Yahoo refused a
       third of the universe the study is of the two-thirds it served, and a
       reader is entitled to know that before reading the gradient. */
    universe: tickers.length, covered: barsByTk.size, refused,
    caveats: CAVEATS,
    ...res,
  };
}

export default async function handler(req, res) {
  const refresh = req.query && (req.query.refresh === "1" || req.query.refresh === "true");

  if (!refresh && mem && Date.now() - mem.at < MEM_TTL) {
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("X-Backtest-Source", "memory");
    return res.status(200).json(mem.body);
  }

  const stored = await readBlob();
  if (!refresh) {
    if (stored && stored.schema === SCHEMA) {
      mem = { at: Date.now(), body: stored };
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      res.setHeader("X-Backtest-Source", "blob");
      return res.status(200).json(stored);
    }
    /* Deliberately NOT computed here — see the header. A schema mismatch waits
       for the cron rather than making a visitor pay for ~530 upstream fetches,
       which is the one place this differs from the core snapshot's behaviour. */
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.setHeader("X-Backtest-Source", "pending");
    return res.status(200).json({
      schema: SCHEMA, status: "pending", caveats: CAVEATS,
      reason: stored ? "SCHEMA_STALE" : "NOT_YET_COMPUTED",
    });
  }

  try {
    const body = await compute();
    await writeBlob(body);
    mem = { at: Date.now(), body };
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Backtest-Source", "computed");
    return res.status(200).json(body);
  } catch (e) {
    console.error("backtest compute:", e);
    // a failed recompute must not replace a good stored study with an error
    if (stored) { res.setHeader("X-Backtest-Source", "blob-after-error"); return res.status(200).json(stored); }
    return res.status(200).json({ schema: SCHEMA, status: "error", reason: String(e && e.message || e), caveats: CAVEATS });
  }
}
