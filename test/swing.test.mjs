// Unit tests for the swing-setup math behind the Playbook tab and the EMA
// Launchpad filter. These are checked against values you can verify by hand —
// constant-range and flat-price series have exact analytic answers, so a
// regression in the smoothing or the seeding shows up immediately.
//
//   npm run test:swing

import { swingMetrics, launchpad, LAUNCHPAD_MAX_SPREAD, atrTrail, ATR_TRAIL_MULT, peakSince,
  computeSignals, compactSig } from "../src/signals.js";

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
};
const near = (label, got, want, tol = 0.01) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : ` (want ≈${want})`}`);
};

// bars with a constant close and a constant high-low band: every true range is
// exactly `band`, so Wilder's ATR must converge to `band` regardless of seeding
const flat = (n, px = 100, band = 2) => {
  const highs = [], lows = [], closes = [];
  for (let i = 0; i < n; i++) { highs.push(px + band / 2); lows.push(px - band / 2); closes.push(px); }
  return { highs, lows, closes, last: px };
};

/* ── 1. ATR on an analytically known series ─────────────────────────────── */
console.log("\n— ATR(14), constant true range —");
{
  const { highs, lows, closes, last } = flat(120, 100, 2);
  const m = swingMetrics(highs, lows, closes, last);
  near("ATR equals the constant range", m.atr, 2);
  near("ATR% is ATR over price", m.atrPct, 2);
  // Chandelier = 22-day highest high − 3·ATR = 101 − 6
  near("Chandelier stop = 22d high − 3·ATR", m.stop, 95);
}

/* ── 2. EMAs on a flat series collapse onto the price ───────────────────── */
console.log("\n— EMAs, flat price —");
{
  const { highs, lows, closes, last } = flat(200, 50, 1);
  const m = swingMetrics(highs, lows, closes, last);
  near("EMA21 = price", m.e21, 50);
  near("EMA50 = price", m.e50, 50);
  near("EMA65 = price", m.e65, 50);
  eq("spread is exactly zero when all three coincide", m.emaSpread, 0);
}

/* ── 3. Not enough history returns null, never a guess ──────────────────── */
console.log("\n— short history —");
{
  const { highs, lows, closes, last } = flat(30, 100, 2);
  const m = swingMetrics(highs, lows, closes, last);
  near("ATR still computes at 30 bars", m.atr, 2);
  eq("EMA65 is null, not extrapolated", m.e65, null);
  eq("spread is null when an EMA is missing", m.emaSpread, null);
}

/* ── 4. A trending series fans the EMAs apart ───────────────────────────── */
console.log("\n— trending series —");
{
  const highs = [], lows = [], closes = [];
  let px = 100;
  for (let i = 0; i < 200; i++) { px *= 1.01; highs.push(px * 1.01); lows.push(px * 0.99); closes.push(px); }
  const m = swingMetrics(highs, lows, closes, px);
  eq("EMA21 leads EMA50 in an uptrend", m.e21 > m.e50, true);
  eq("EMA50 leads EMA65", m.e50 > m.e65, true);
  eq("spread is wide, so it is NOT coiled", m.emaSpread > LAUNCHPAD_MAX_SPREAD, true);
}

/* ── 5. The Launchpad filter itself ─────────────────────────────────────── */
console.log("\n— EMA Launchpad filter —");
{
  const row = (tk, e21, e50, e65) => ({ tk, sig: { swing: { e21, e50, e65, emaSpread: ((Math.max(e21, e50, e65) - Math.min(e21, e50, e65)) / Math.min(e21, e50, e65)) * 100 } } });
  const rows = [
    row("COILED", 100, 100.5, 101),      // 1.0% spread — inside
    row("EDGE", 100, 101, 102),          // 2.0% spread — inside (boundary is inclusive)
    row("FANNED", 100, 105, 110),        // 10% spread — out
    { tk: "NODATA", sig: { swing: { e21: null, e50: null, e65: null, emaSpread: null } } },
    { tk: "NOSIG" },
  ];
  const got = launchpad(rows).map((r) => r.tk);
  eq("keeps the coiled name", got.includes("COILED"), true);
  eq("boundary at exactly 2% is inside", got.includes("EDGE"), true);
  eq("drops the fanned name", got.includes("FANNED"), false);
  eq("drops a name with no EMA data rather than guessing", got.includes("NODATA"), false);
  eq("drops a name with no signals at all", got.includes("NOSIG"), false);
  eq("returns only the survivors", got.length, 2);
  eq("a custom threshold is honoured", launchpad(rows, 1.5).map((r) => r.tk).join(","), "COILED");
}

/* ── 6. the ATR trailing stop, measured from entry ──────────────────────── */
console.log("\n— ATR trailing stop from entry —");
{
  eq("default multiplier is 1.5", ATR_TRAIL_MULT, 1.5);
  // price 100, ATR 4 → 1.5 ATRs = 6 → trail 94, i.e. 6% under price
  const a = atrTrail({ px: 100, cost: 90, atr: 4 });
  near("distance is mult x ATR", a.dist, 6);
  near("trail sits that far under price", a.trail, 94);
  near("and that is 6% of price", a.belowPx, 6);
  // entry 90, trail 94 → stopping out LOCKS IN +4.44%
  near("from entry is measured against cost, not price", a.fromEntry, 4.44);
  eq("flagged as locked in when the trail clears entry", a.locked, true);

  // same stock bought higher: entry 100, trail 94 → a stop-out costs 6%
  const b = atrTrail({ px: 100, cost: 100, atr: 4 });
  near("a stop-out below entry reads negative", b.fromEntry, -6);
  eq("and is not flagged as locked", b.locked, false);

  const c = atrTrail({ px: 100, cost: 90, atr: 4, mult: 3 });
  near("a custom multiplier widens the stop", c.dist, 12);
  near("which pushes the trail below entry", c.fromEntry, -2.22);

  // missing inputs must yield nulls, never substitutes
  eq("no ATR means no distance", atrTrail({ px: 100, cost: 90, atr: null }).dist, null);
  eq("no cost basis means no from-entry figure", atrTrail({ px: 100, cost: null, atr: 4 }).fromEntry, null);
  eq("but the trail still computes without a cost basis", atrTrail({ px: 100, cost: null, atr: 4 }).trail, 94);
  eq("a zero/absent price yields no trail", atrTrail({ px: null, cost: 90, atr: 4 }).trail, null);
  eq("a non-positive multiplier is rejected", atrTrail({ px: 100, cost: 90, atr: 4, mult: 0 }).dist, null);

  // the number you actually set on a broker trailing stop: the WIDTH, as a
  // percent of price and in points. ATR 10 on a $100 stock → 1.5 × 10 = $15 = 15%
  const w = atrTrail({ px: 100, cost: 80, atr: 10 });
  near("trail width in points", w.dist, 15);
  near("trail width as a percent — what you'd set the stop to", w.belowPx, 15);
  near("the level it implies at today's price", w.trail, 85);
}

/* ── 7. the peak since entry, which is what a trail actually follows ────── */
console.log("\n— peak since entry —");
{
  const bars = [
    { date: "2026-06-01", high: 50, close: 49 },
    { date: "2026-06-15", high: 120, close: 119 },   // pre-entry spike — must NOT count
    { date: "2026-07-01", high: 80, close: 79 },     // entry day
    { date: "2026-07-15", high: 95, close: 94 },     // the real peak
    { date: "2026-08-01", high: 88, close: 86 },
  ];
  const p1 = peakSince(bars, "2026-07-01");
  near("peak is the highest high on or after entry", p1.peak, 95);
  eq("and it reports which day that was", p1.peakDate, "2026-07-15");
  eq("counting only bars from entry onward", p1.bars, 3);
  eq("a pre-entry spike is excluded", p1.peak < 120, true);

  eq("entering on the peak day still includes it", peakSince(bars, "2026-07-15").peak, 95);
  eq("an entry after every bar yields null, not the all-time peak",
    peakSince(bars, "2027-01-01"), null);
  eq("no entry date yields null", peakSince(bars, null), null);
  eq("a malformed date yields null", peakSince(bars, "last tuesday"), null);
  eq("no bars yields null", peakSince([], "2026-07-01"), null);

  // the trail follows that peak, not today's price
  const t = atrTrail({ px: 88, cost: 80, atr: 4 });
  near("a 1.5x ATR trail is 6 points wide", t.dist, 6);
  near("against the 95 peak that puts the stop at 89", 95 - t.dist, 89);
  eq("which is ABOVE the 88 last price — already breached", 95 - t.dist > 88, true);
}

/* ── the session's direction, and where it comes from ────────────────────────
   The Volume tab's advancing/declining filters read `chgD`. It must be derived
   from the same adjusted bars as `volD`, NOT from the quote's changePercentage:
   volume and direction that describe different moments make the pairing a lie,
   and a quote change that rounds to 0.00 across a universe silently empties both
   filters while "All" still shows every row — which is exactly how this broke. */
{
  console.log("\n— session direction (chgD) —");
  const series = (closes) => closes.map((c, i) => ({
    date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`,
    open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 + i * 1000,
  }));
  const up = computeSignals(series([...Array(80)].map((_, i) => 100 + i * 0.5)));
  near("a rising series closes up on the day", up.chgPct, (139.5 / 139 - 1) * 100);
  eq("and compactSig ships it as chgD", compactSig(up, null, 139.5).chgD > 0, true);

  const dn = computeSignals(series([...Array(80)].map((_, i) => 200 - i * 0.5)));
  eq("a falling series ships a negative chgD", compactSig(dn, null, 160.5).chgD < 0, true);

  // the quote is only a fallback, and must not overwrite the bars' own answer —
  // this is the regression that emptied both filters on the live site
  const withQuote = compactSig(dn, 0, 160.5);
  eq("a 0.00 quote change does NOT flatten a falling name", withQuote.chgD < 0, true);
  eq("a flat series reports exactly 0, not null", compactSig(computeSignals(series(Array(80).fill(50))), null, 50).chgD, 0);

  // the volume fields the same rows feed
  eq("session volume is the last bar's", up.volD, 1e6 + 79 * 1000);
  eq("and rvol is that over its own 50-day average", up.rvol > 1, true);
}

console.log(`\n${fail === 0 ? "OK" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
