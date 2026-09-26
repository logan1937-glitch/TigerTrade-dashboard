// Assertions on the LEADERS track record.
//
// The thing worth testing here is not "does it produce a number" — it is that
// the number cannot be produced by cheating. Two constructed universes do that:
// one where momentum genuinely persists (the ladder must appear) and one where
// forward returns are assigned by a rule the score cannot see (the ladder must
// NOT appear). A backtest that reports a gradient on the second is reading the
// future somewhere, and no amount of reading the code proves that as directly.

import { runBacktest, MIN_BARS, CAVEATS } from "../src/backtest.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
  ok ? pass++ : fail++;
};
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ": " + detail : ""}`);
  cond ? pass++ : fail++;
};

/* deterministic PRNG so a failure is reproducible — this is test scaffolding,
   never shipped, which is the one place invented numbers are legitimate */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 86400000;
const dateAt = (i, n) => new Date(Date.UTC(2024, 0, 2) + (i) * DAY).toISOString().slice(0, 10);

/* A price series with a per-name drift. `drift` is per-session log-ish return;
   `noise` is symmetric. Volume is constant and ample so the liquidity penalty
   and the pocket-pivot test do not fire differently across names for reasons
   the test is not about. */
function series(n, drift, noise, seed) {
  const r = rng(seed);
  const rows = [];
  let px = 100;
  for (let i = 0; i < n; i++) {
    px *= 1 + drift + (r() - 0.5) * noise;
    const hi = px * (1 + Math.abs(r()) * 0.004), lo = px * (1 - Math.abs(r()) * 0.004);
    rows.push({ date: dateAt(i), open: px, high: Math.max(hi, px), low: Math.min(lo, px), close: px, volume: 4_000_000 });
  }
  return rows;
}

const N = MIN_BARS + 21 * 6;   // enough for several monthly rebalances

/* ── 1. A universe where momentum PERSISTS ──────────────────────────────────
   Each name keeps the same drift for the whole window, so the names that led
   the trailing year also lead the forward month. A ranking model that works
   must find a gradient here; if it cannot, the harness is broken. */
{
  const barsByTk = new Map();
  for (let k = 0; k < 60; k++) {
    // drift spread from clearly negative to clearly positive
    const drift = -0.0010 + (k / 59) * 0.0020;
    barsByTk.set(`P${k}`, series(N, drift, 0.010, 1000 + k));
  }
  const spy = series(N, 0.0003, 0.006, 77);
  const res = runBacktest(barsByTk, spy, { buckets: 5 });

  eq("persistent universe runs", res.status, "ok");
  ok("it produced rebalances", res.rebalances >= 2, `${res.rebalances}`);
  ok("top bucket beat bottom", res.spread != null && res.spread > 0,
    res.spread == null ? "null" : res.spread.toFixed(2) + "pp");
  ok("the ladder is mostly monotone", res.monotone >= 3, `${res.monotone}/${res.monotonePairs}`);
  ok("every bucket reported a return", res.byBucket.every((b) => b.ret != null), "");
  ok("buckets are roughly equal size", res.byBucket.every((b) => b.n >= 10), "");
}

/* ── 2. A universe where the score CANNOT know the future ───────────────────
   Every name has the same drift, so trailing momentum carries no information
   about the next month; the only differences are noise. The spread between top
   and bottom bucket must be small. A large one would mean the scorer is seeing
   bars past the rebalance date — which is the single failure that would make
   every number this file produces worthless. */
{
  const barsByTk = new Map();
  for (let k = 0; k < 60; k++) barsByTk.set(`N${k}`, series(N, 0.0004, 0.012, 5000 + k));
  const spy = series(N, 0.0004, 0.006, 88);
  const res = runBacktest(barsByTk, spy, { buckets: 5 });

  eq("noise universe runs", res.status, "ok");
  // identical drift, so any spread is sampling noise on ~12 observations.
  // A lookahead leak shows up here as a large, consistent gradient.
  ok("no large spread without real signal", Math.abs(res.spread) < 3.0,
    res.spread.toFixed(2) + "pp");
}

/* ── 3. Point-in-time slicing ──────────────────────────────────────────────
   The direct check: truncating the bars AFTER the last rebalance date must not
   change any reported bucket return. If a future bar were reaching the scorer,
   removing those bars would move the numbers. */
{
  const mk = (seed) => {
    const m = new Map();
    for (let k = 0; k < 60; k++) m.set(`S${k}`, series(N, -0.0008 + (k / 59) * 0.0016, 0.010, seed + k));
    return m;
  };
  const spy = series(N, 0.0003, 0.006, 42);
  const full = runBacktest(mk(2000), spy, { buckets: 5 });
  // lop off the tail beyond what the last rebalance's forward window needs
  const trimTo = full.runs.length ? full.runs[full.runs.length - 1].date : null;
  const trimmed = new Map();
  for (const [tk, rows] of mk(2000)) {
    const cutIdx = rows.findIndex((b) => b.date === trimTo);
    trimmed.set(tk, rows.slice(0, cutIdx + 1 + 21));   // keep exactly the forward window
  }
  const spyIdx = spy.findIndex((b) => b.date === trimTo);
  const res2 = runBacktest(trimmed, spy.slice(0, spyIdx + 1 + 21), { buckets: 5 });

  ok("trimming future bars leaves the last rebalance unchanged",
    full.runs.length > 0 && res2.runs.length > 0
      && Math.abs(full.runs[full.runs.length - 1].top - res2.runs[res2.runs.length - 1].top) < 1e-9,
    `${full.runs[full.runs.length - 1].top.toFixed(4)} vs ${res2.runs[res2.runs.length - 1].top.toFixed(4)}`);
}

/* ── 4. Degradation ────────────────────────────────────────────────────────
   Thin inputs must say so rather than returning a confident-looking zero. */
{
  const thin = new Map([["A", series(50, 0.001, 0.01, 1)]]);
  const res = runBacktest(thin, series(50, 0.001, 0.01, 2));
  eq("too little history is stated, not scored", res.status, "insufficient");
  ok("and it names the reason", typeof res.reason === "string" && res.reason.length > 10, res.reason);

  const noNames = runBacktest(new Map(), series(N, 0.0003, 0.006, 3));
  eq("an empty universe is stated too", noNames.status, "insufficient");
}

/* ── 5. The caveats ship with the numbers ──────────────────────────────────
   Survivorship is the bias this cannot correct, so the one thing that must
   never quietly disappear is the label saying so. */
{
  ok("caveats travel with the module", CAVEATS.length >= 5, `${CAVEATS.length}`);
  ok("survivorship is one of them", CAVEATS.some(([k]) => /surviv/i.test(k)), "");
  ok("and it says which direction the bias runs",
    CAVEATS.some(([, v]) => /flatter/i.test(v)), "");
}

console.log(`\n${fail === 0 ? "OK" : "FAILED"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
