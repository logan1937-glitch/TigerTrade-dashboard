// Exercises api/earnings.js against a stubbed Yahoo (realistic quoteSummary and
// chart shapes). The endpoint cannot be exercised for real without a deploy —
// this covers both parses, the cookie/crumb handshake and its reuse, the ordering
// (crumb-free chart first, quoteSummary only when it must), the cache that makes
// one success durable, and the guarantee that FMP is never called.
//
//   npm run test:earnings

const day = (isoDay) => Math.floor(new Date(isoDay + "T13:30:00Z").getTime() / 1000);
const soon = new Date(Date.now() + 9 * 864e5).toISOString().slice(0, 10);
const pastQ = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
const pq = new Date(pastQ + "T00:00:00Z");
const qLabel = `${Math.floor(pq.getUTCMonth() / 3) + 1}Q${pq.getUTCFullYear()}`;

const YS = {
  quoteSummary: { result: [{
    calendarEvents: { earnings: { earningsDate: [{ raw: day(soon), fmt: soon }], isEarningsDateEstimate: true } },
    earningsHistory: { history: [
      { quarter: { raw: day(pastQ) }, epsActual: { raw: -0.41 }, epsEstimate: { raw: -0.55 } },
      { quarter: { raw: day("2020-01-01") }, epsActual: { raw: 0.1 }, epsEstimate: { raw: 0.1 } },
    ] },
    earnings: { financialsChart: { quarterly: [{ date: qLabel, revenue: { raw: 146100000 }, earnings: { raw: -100 } }] } },
  }] },
};

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${got}${ok ? "" : ` (want ${want})`}`);
};

// chart events: the crumb-free door. Yahoo keys the block by timestamp.
const CHART = { chart: { result: [{
  meta: { symbol: "NBIS" },
  events: { earnings: {
    [String(day(soon))]: { date: day(soon), epsEstimate: { raw: -0.5 } },
    [String(day(pastQ))]: { date: day(pastQ), epsActual: { raw: -0.41 }, epsEstimate: { raw: -0.55 } },
  } },
}] } };

// Each scenario gets a fresh module instance so the warm-lambda credential and
// result caches don't leak between them. `mode` can be reassigned mid-scenario
// to take an upstream away without resetting those caches — that is how the
// durable-cache behaviour is exercised.
let calls = [];
let fmpHits = 0;
let mode = {};
async function scenario(name, opts = {}) {
  calls = [];
  fmpHits = 0;
  mode = { crumbStatus: 200, bareWorks: true, chart: null, ...opts };
  globalThis.fetch = async (url, o) => {
    const u = String(url);
    const opts = o;
    const { crumbStatus, bareWorks } = mode;
    calls.push(u.split("?")[0]);
    if (u.includes("/v8/finance/chart/")) {
      if (!mode.chart) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(mode.chart), { status: 200 });
    }
    if (u.startsWith("https://fc.yahoo.com")) {
      const h = new Headers();
      h.append("set-cookie", "A1=d=AQABBxyz&S=AQAAA; Domain=.yahoo.com; Path=/; HttpOnly");
      h.append("set-cookie", "A3=d=AQABBabc; Domain=.yahoo.com; Path=/");
      return new Response("not found", { status: 404, headers: h });
    }
    if (u.startsWith("https://finance.yahoo.com")) return new Response("", { status: 200, headers: new Headers() });
    if (u.includes("/v1/test/getcrumb")) {
      if (!opts?.headers?.Cookie?.includes("A1=")) throw new Error("crumb requested without cookie");
      return crumbStatus === 200 ? new Response("Xy1z.AbC", { status: 200 }) : new Response("rate limited", { status: crumbStatus });
    }
    if (u.includes("/v10/finance/quoteSummary/")) {
      const hasCrumb = u.includes("crumb=");
      if (hasCrumb && !opts?.headers?.Cookie) throw new Error("crumb sent without cookie");
      if (!hasCrumb && !bareWorks) return new Response("unauthorized", { status: 401 });
      if (u.includes("/NOPE")) return new Response(JSON.stringify({ quoteSummary: { result: null } }), { status: 200 });
      return new Response(JSON.stringify(YS), { status: 200 });
    }
    if (u.includes("financialmodelingprep.com")) { fmpHits++; return new Response("Access denied", { status: 403 }); }
    throw new Error("unexpected fetch: " + u);
  };
  const { default: handler } = await import(`../api/earnings.js?s=${encodeURIComponent(name)}`);
  return async (query) => {
    let code = 0, body = null;
    const res = { setHeader() {}, status(c) { code = c; return this; }, json(b) { body = b; return this; } };
    await handler({ query }, res);
    return { code, body };
  };
}

process.env.FMP_API_KEY = "test-key";

/* ── 1. the normal path: cookie + crumb, two symbols, one of them unknown ── */
console.log("\n— crumb handshake succeeds —");
let run = await scenario("happy");
const a = await run({ symbols: "NBIS,NOPE" });
const rec = a.body.NBIS;
eq("status", a.code, 200);
eq("next date", rec?.d, soon);
eq("flagged estimated", rec?.est, true);
eq("source", rec?.src, "yahoo");
eq("last quarter end", rec?.last?.d, pastQ);
eq("last EPS actual", rec?.last?.epsA, -0.41);
eq("last EPS estimate", rec?.last?.epsE, -0.55);
eq("revenue matched by period label", rec?.last?.revA, 146100000);
eq("quarter-end flagged, not a report date", rec?.last?.qEnd, true);
eq("symbol with no data is absent", "NOPE" in a.body, false);
eq("stale 2020 quarter not chosen as latest", rec?.last?.epsA !== 0.1, true);
eq("handshake reused across the batch (seed)", calls.filter((c) => c.startsWith("https://fc.yahoo.com")).length, 1);
eq("handshake reused across the batch (crumb)", calls.filter((c) => c.includes("getcrumb")).length, 1);
await run({ symbols: "NBIS" });
eq("warm lambda reuses creds", calls.filter((c) => c.includes("getcrumb")).length, 1);
eq("rejects unsafe symbols", (await run({ symbols: "../etc/passwd" })).code, 400);

/* ── 2. Yahoo rate-limits the crumb (the likely datacenter failure) ──────── */
console.log("\n— crumb rate-limited, bare call still answers —");
run = await scenario("no-crumb", { crumbStatus: 429, bareWorks: true });
const b = await run({ symbols: "NBIS" });
eq("falls back to a crumb-free call", b.body.NBIS?.d, soon);
eq("no crumb was sent", calls.some((c) => c.includes("crumb=")), false);

/* ── 3. Yahoo refuses entirely — no date beats a wrong date ─────────────── */
console.log("\n— Yahoo unavailable —");
run = await scenario("dead", { crumbStatus: 429, bareWorks: false });
const c = await run({ symbols: "NBIS" });
eq("returns empty rather than inventing a date", JSON.stringify(c.body), "{}");
eq("still a 200 so the UI just shows no date", c.code, 200);

/* ── 4. debug mode reports every upstream status, leaks no secrets ──────── */
console.log("\n— debug mode —");
run = await scenario("debug");
const d = await run({ symbols: "NBIS", debug: "1" });
const steps = d.body?.diag?.steps || [];
eq("debug wraps the result", !!d.body.result?.NBIS, true);
eq("never calls FMP — verified incapable for these names", fmpHits, 0);
eq("records the seed status", steps.some((s) => s.step === "yahoo:seed" && s.status === 404), true);
eq("records the crumb status", steps.some((s) => s.step === "yahoo:crumb" && s.status === 200), true);
eq("records the quoteSummary status", steps.some((s) => s.step === "yahoo:quoteSummary" && s.status === 200), true);
const blob = JSON.stringify(d.body);
eq("never echoes the crumb value", blob.includes("Xy1z.AbC"), false);
eq("never echoes the cookie value", blob.includes("AQABBxyz"), false);
eq("never echoes the API key", blob.includes("test-key"), false);

/* ── 5. the cheap door is tried first and alone when it fully answers ────── */
console.log("\n— chart answers, quoteSummary and its handshake are skipped —");
run = await scenario("cheap-first", { chart: CHART });
const e8 = await run({ symbols: "NBIS" });
eq("resolved from the chart", e8.body.NBIS?.src, "yahoo-chart");
eq("no crumb handshake was run", calls.some((c) => c.includes("getcrumb")), false);
eq("quoteSummary was never called", calls.some((c) => c.includes("/v10/finance/quoteSummary/")), false);
eq("one upstream call only", calls.filter((c) => c.includes("finance.yahoo.com")).length, 1);
eq("and FMP still untouched", fmpHits, 0);

/* ── 6. the crumb door is shut, the crumb-free chart door answers ────────── */
console.log("\n— quoteSummary refused, chart events answer —");
run = await scenario("chart", { crumbStatus: 429, bareWorks: false, chart: CHART });
const e = await run({ symbols: "NBIS" });
eq("date resolves without a crumb", e.body.NBIS?.d, soon);
eq("source names the door it came through", e.body.NBIS?.src, "yahoo-chart");
eq("chart dates are announcement days, not quarter ends", e.body.NBIS?.last?.qEnd, false);
eq("past quarter's EPS read from the same block", e.body.NBIS?.last?.epsA, -0.41);
eq("a chart date is never flagged as projected", e.body.NBIS?.est, false);
eq("the chart was actually tried", calls.some((c) => c.includes("/v8/finance/chart/")), true);

/* ── 7. one success is durable: cached, then served when Yahoo goes dark ─── */
console.log("\n— cache makes a single success stick —");
run = await scenario("cache", { crumbStatus: 429, bareWorks: false, chart: CHART });
eq("first request resolves upstream", (await run({ symbols: "NBIS" })).body.NBIS?.d, soon);
calls = [];
const warm = await run({ symbols: "NBIS" });
eq("second request is served from cache", warm.body.NBIS?.d, soon);
eq("no upstream was touched at all", calls.length, 0);
eq("a cache hit is not flagged stale", warm.body.NBIS?.stale, undefined);

mode.chart = null;                       // Yahoo now refuses every door
calls = [];
const dark = await run({ symbols: "NBIS", refresh: "1" });
eq("a forced refresh still tries upstream", calls.length > 0, true);
eq("the known date survives the outage", dark.body.NBIS?.d, soon);
eq("and is flagged as not re-confirmed", dark.body.NBIS?.stale, true);

/* ── 8. an unknown symbol is never invented, cached or otherwise ─────────── */
const never = await run({ symbols: "NOPE" });
eq("an unresolvable symbol stays absent", "NOPE" in never.body, false);

console.log(`\n${fail === 0 ? "OK" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
