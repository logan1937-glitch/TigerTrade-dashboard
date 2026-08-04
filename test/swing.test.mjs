// Unit tests for the swing-setup math behind the Playbook tab and the EMA
// Launchpad filter. These are checked against values you can verify by hand —
// constant-range and flat-price series have exact analytic answers, so a
// regression in the smoothing or the seeding shows up immediately.
//
//   npm run test:swing

import { swingMetrics, launchpad, LAUNCHPAD_MAX_SPREAD, atrTrail, ATR_TRAIL_MULT } from "../src/signals.js";

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
}

console.log(`\n${fail === 0 ? "OK" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
