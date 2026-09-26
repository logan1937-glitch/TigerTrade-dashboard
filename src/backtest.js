// ── Does the LEADERS score actually rank? ─────────────────────────────────────
//
// The score is the one thing this product asks you to believe, and until now it
// was an assertion: a number with a methodology and no evidence. This file is
// the evidence, and it is deliberately built so that it cannot flatter itself.
//
// THREE RULES MAKE IT HONEST, and each is a thing a vendor backtest usually
// gets wrong:
//
// 1. IT RUNS THE PRODUCTION SCORER. `computeSignals`, `rsRatings` and
//    `momentumScore` are imported, not reimplemented. A backtest of a
//    reimplementation measures the reimplementation — the same trap that put
//    `isLaunchpad` behind a named export after the tests were found to cover a
//    copy the app never ran.
//
// 2. NO LOOKAHEAD, enforced structurally rather than by care. A rebalance date
//    slices every name's bars to `date <= D` BEFORE anything is computed, so
//    the scorer is handed a series that physically cannot contain the future.
//    Slicing is by DATE, not by index: names have different bar counts (listings,
//    halts, thin history) and an index offset would silently score different
//    names as of different days.
//
// 3. IT REPORTS THE WHOLE LADDER, not the top bucket. One good bucket is what
//    noise looks like when you go looking for it. A monotonic gradient across
//    all five — where each is worse than the one above — is the claim worth
//    making, and `monotone` below counts the adjacent pairs that actually hold
//    so the UI can state it as a fraction rather than as an adjective.
//
// AND ONE BIAS IT CANNOT FIX, which the UI must therefore state: the universe is
// TODAY's membership. A name that was in the index through last year and got
// removed is not here, and a name added last month is here for the whole window.
// Index additions are past winners, so this bias runs in the flattering
// direction. It is not correctable from any feed this app has — the fix needs
// point-in-time constituent history — so it is labelled, not hidden. See
// `CAVEATS`, which ships with the result rather than living in a doc.

import { computeSignals, momentumScore, rsRatings } from "./signals.js";

export const REBAL_GAP = 21;    // sessions between rebalances (~1 month)
export const HOLD = 21;         // sessions of forward return measured
export const MIN_BARS = 200;    // trailing history a name needs to be scored
export const BUCKETS = 5;       // quintiles: ~100 names each on the core universe

/* The caveats travel WITH the numbers. A backtest's honesty lives in what it
   says about itself, and a caveat in a README is a caveat nobody reading the
   chart will see. The view renders these; it does not get to pick a subset. */
export const CAVEATS = [
  ["Survivorship", "The universe is today's index membership. Names removed over the window are absent and names added are present for all of it — and additions are past winners, so this bias flatters the result. Fixing it needs point-in-time constituent history, which no feed here provides."],
  ["No costs", "Returns are gross. No commission, no spread, no slippage, no borrow. A monthly rebalance of a hundred names is not free."],
  ["Gross of taxes", "Every rebalance is a taxable event in a taxable account."],
  ["Short window", "Measured over the bars the nightly pass can fetch, not over a full cycle. A year of monthly rebalances is twelve observations — enough to see a gradient, not enough to call it durable."],
  ["Not a strategy", "This measures whether the SCORE ranks forward returns. It is not a portfolio, it has no risk control, and nothing here is a recommendation."],
];

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/* Forward return over `hold` sessions from the bar at `i`, in percent.
   Returns null rather than a number when the window runs off the end of the
   series — a name that stops trading mid-window has no forward return, and
   substituting 0 would score a delisting as a flat month. */
function fwdRet(closes, i, hold) {
  const j = i + hold;
  if (j >= closes.length) return null;
  const a = closes[i], b = closes[j];
  if (!(a > 0) || !(b > 0)) return null;
  return ((b / a) - 1) * 100;
}

/* One rebalance: score every name that has enough history as of `date`, bucket
   by score, and measure what each bucket did over the next `hold` sessions. */
function oneRebalance(barsByTk, spyBars, date, { hold, buckets }) {
  const spyCut = spyBars.filter((b) => b.date <= date);
  if (spyCut.length < MIN_BARS) return null;

  // score every name point-in-time
  const scored = [];
  for (const [tk, bars] of barsByTk) {
    const cut = bars.filter((b) => b.date <= date);
    if (cut.length < MIN_BARS) continue;
    // the bar we would have bought at: the last close on or before the date
    const i = cut.length - 1;
    const closes = bars.map((b) => b.close);
    const f = fwdRet(closes, i, hold);
    if (f == null) continue;                       // no measurable forward window
    const sig = computeSignals(cut, spyCut);
    if (!sig) continue;
    scored.push({ tk, sig, fwd: f });
  }
  if (scored.length < buckets * 10) return null;   // too thin to bucket meaningfully

  // RS is a percentile ACROSS THE FIELD, so it has to be computed on the
  // point-in-time field — not carried over from today's board
  const rs = rsRatings(scored, "1Y");
  for (const r of scored) r.score = momentumScore(r.sig, rs[r.tk]);
  const rank = scored.filter((r) => r.score != null).sort((a, b) => b.score - a.score);
  if (rank.length < buckets * 10) return null;

  const per = Math.floor(rank.length / buckets);
  const bucketRets = [];
  for (let b = 0; b < buckets; b++) {
    const slice = b === buckets - 1 ? rank.slice(b * per) : rank.slice(b * per, (b + 1) * per);
    bucketRets.push({ n: slice.length, ret: mean(slice.map((r) => r.fwd)) });
  }
  const uni = mean(rank.map((r) => r.fwd));
  const spyCloses = spyBars.map((b) => b.close);
  const spyFwd = fwdRet(spyCloses, spyCut.length - 1, hold);

  return { date, n: rank.length, buckets: bucketRets, uni, spy: spyFwd };
}

/* `barsByTk`: Map<ticker, rows[]> where a row is { date, open, high, low, close,
   volume } ascending by date — the same shape `computeSignals` already takes.
   `spyBars`: the same for SPY, used both as the RS benchmark inside the scorer
   and as the investable alternative the result is compared against. */
export function runBacktest(barsByTk, spyBars, opts = {}) {
  const rebalGap = opts.rebalGap || REBAL_GAP;
  const hold = opts.hold || HOLD;
  const buckets = opts.buckets || BUCKETS;
  if (!spyBars || spyBars.length < MIN_BARS + hold + rebalGap) {
    return { status: "insufficient", reason: "SPY history shorter than one trailing window plus a holding period" };
  }

  /* Rebalance dates come off SPY's calendar, walking back from the last date
     that still has a full forward window. Using a name's own calendar would let
     two names rebalance on different days and be compared as if they had not. */
  const dates = [];
  for (let i = spyBars.length - 1 - hold; i >= MIN_BARS - 1; i -= rebalGap) dates.push(spyBars[i].date);
  dates.reverse();
  if (!dates.length) return { status: "insufficient", reason: "no rebalance date has both a trailing window and a forward window" };

  const runs = [];
  for (const d of dates) {
    const r = oneRebalance(barsByTk, spyBars, d, { hold, buckets });
    if (r) runs.push(r);
  }
  if (!runs.length) return { status: "insufficient", reason: "no rebalance had enough scored names to bucket" };

  // average each bucket across rebalances; every rebalance counts once, so a
  // month with more scorable names does not dominate the mean
  const byBucket = [];
  for (let b = 0; b < buckets; b++) {
    const vals = runs.map((r) => r.buckets[b] && r.buckets[b].ret).filter((v) => v != null);
    byBucket.push({ bucket: b, ret: mean(vals), n: Math.round(mean(runs.map((r) => r.buckets[b] ? r.buckets[b].n : 0)) || 0) });
  }
  const uni = mean(runs.map((r) => r.uni).filter((v) => v != null));
  const spy = mean(runs.map((r) => r.spy).filter((v) => v != null));

  /* The gradient is the claim. Count adjacent pairs that hold in the right
     direction — 4 of 4 on quintiles is a clean ladder, 2 of 4 is noise with a
     good top bucket, and printing the fraction lets a reader tell them apart
     without taking anyone's word for it. */
  let monotone = 0;
  for (let b = 0; b < buckets - 1; b++) {
    const a = byBucket[b].ret, c = byBucket[b + 1].ret;
    if (a != null && c != null && a >= c) monotone++;
  }
  // how often the top bucket beat an equal-weight hold of the same field —
  // the honest "did the ranking add anything" count, rebalance by rebalance
  const topBeats = runs.filter((r) => r.buckets[0] && r.buckets[0].ret != null && r.uni != null && r.buckets[0].ret > r.uni).length;

  return {
    status: "ok",
    rebalances: runs.length,
    from: runs[0].date, to: runs[runs.length - 1].date,
    holdSessions: hold, rebalGap, buckets,
    byBucket, uni, spy,
    monotone, monotonePairs: buckets - 1,
    topBeats, topBeatsOf: runs.length,
    spread: byBucket[0].ret != null && byBucket[buckets - 1].ret != null
      ? byBucket[0].ret - byBucket[buckets - 1].ret : null,
    runs: runs.map((r) => ({ date: r.date, n: r.n, top: r.buckets[0].ret, bot: r.buckets[buckets - 1].ret, uni: r.uni, spy: r.spy })),
  };
}
