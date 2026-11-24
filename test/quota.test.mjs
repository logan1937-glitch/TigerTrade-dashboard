// The FMP quota latch in api/snapshot.js.
//
// The thing worth asserting is not "does it fetch" — it is that a SPENT cap
// stops costing more than a healthy one. Every FMP helper in that file walks a
// fallback chain of two or three URLs and advances on `!r.ok`, so once the
// quota is gone a run that can retrieve nothing burns roughly forty upstream
// calls where a working run burns thirteen: the failure spending the very
// budget that caused it, on every recompute, all day. That is how the macro
// board, the VIX panel and the S&P earnings dates go blank together and stay
// blank past the daily reset.
//
// The second assertion matters just as much. A latch that never lets go trades
// one silent failure for a longer one — FMP's cap rolls over, and a stuck flag
// would hold the board dark through a day whose quota had already come back.
//
//   npm run test:quota

import { fmpFetch, resetFmpLatch, FMP_BACKOFF } from "../api/snapshot.js";

let pass = 0, fail = 0;
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ": " + detail : ""}`);
  cond ? pass++ : fail++;
};
const eq = (label, got, want) => ok(label, got === want, `${got}${got === want ? "" : ` (want ${want})`}`);

const realFetch = globalThis.fetch;
let calls = 0;
const stub = (status) => { globalThis.fetch = async () => { calls++; return { ok: status === 200, status }; }; };

/* ── 1. A 429 stops the bleeding ──────────────────────────────────────────── */
{
  resetFmpLatch(); calls = 0; stub(429);
  const first = await fmpFetch("https://financialmodelingprep.com/stable/treasury-rates");
  eq("the 429 itself reaches upstream once", calls, 1);
  eq("and is reported as nothing rather than a response", first, null);

  // the rest of a run: every later helper's whole fallback chain
  for (let i = 0; i < 40; i++) await fmpFetch(`https://financialmodelingprep.com/stable/x${i}`);
  eq("forty later calls cost zero upstream requests", calls, 1);
}

/* ── 2. It lets go ────────────────────────────────────────────────────────── */
{
  resetFmpLatch(); calls = 0; stub(429);
  await fmpFetch("https://financialmodelingprep.com/stable/a");
  eq("latched", calls, 1);

  // travel past the backoff rather than sleeping through it
  const realNow = Date.now;
  Date.now = () => realNow() + FMP_BACKOFF + 1000;
  stub(200);
  const after = await fmpFetch("https://financialmodelingprep.com/stable/b");
  Date.now = realNow;

  eq("a call after the backoff is attempted again", calls, 2);
  ok("and a success comes back as a response", after != null && after.ok === true);
  ok("the backoff is well under FMP's daily reset", FMP_BACKOFF < 24 * 3600 * 1000,
    `${FMP_BACKOFF / 60000} min`);
}

/* ── 3. A non-quota failure must NOT latch ────────────────────────────────── */
{
  // 402 is a restricted ENDPOINT, not a spent budget — the other endpoints on
  // the same key still work, and latching on it would blank the whole board
  // because one gated feature was asked for. This is the distinction the
  // screener's NO_BLOB_STORE change was about, one layer down.
  resetFmpLatch(); calls = 0; stub(402);
  await fmpFetch("https://financialmodelingprep.com/stable/economic-calendar");
  await fmpFetch("https://financialmodelingprep.com/stable/treasury-rates");
  eq("a 402 leaves the next endpoint reachable", calls, 2);

  resetFmpLatch(); calls = 0; stub(500);
  await fmpFetch("https://financialmodelingprep.com/stable/a");
  await fmpFetch("https://financialmodelingprep.com/stable/b");
  eq("so does a 500", calls, 2);
}

globalThis.fetch = realFetch;
console.log(`\n${fail === 0 ? "OK" : "FAILED"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
