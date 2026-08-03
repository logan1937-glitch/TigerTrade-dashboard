// Exercises api/earnings.js against a stubbed Yahoo (realistic quoteSummary
// shape) plus an FMP that denies the per-symbol endpoint, as this plan does.
// The endpoint cannot be exercised for real without a deploy — this covers the
// parse, the cookie/crumb handshake, its reuse, and the crumb-free fallback.
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

// Each scenario gets a fresh module instance so the warm-lambda credential
// cache doesn't leak between them.
let calls = [];
async function scenario(name, { crumbStatus = 200, bareWorks = true } = {}) {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    calls.push(u.split("?")[0]);
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
    if (u.includes("financialmodelingprep.com/stable/earnings?")) return new Response("Access denied", { status: 403 });
    if (u.includes("earnings-calendar") || u.includes("earning_calendar")) return new Response(JSON.stringify([]), { status: 200 });
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
eq("records the FMP denial", steps.some((s) => s.step === "fmp:earnings" && s.status === 403), true);
eq("records the seed status", steps.some((s) => s.step === "yahoo:seed" && s.status === 404), true);
eq("records the crumb status", steps.some((s) => s.step === "yahoo:crumb" && s.status === 200), true);
eq("records the quoteSummary status", steps.some((s) => s.step === "yahoo:quoteSummary" && s.status === 200), true);
const blob = JSON.stringify(d.body);
eq("never echoes the crumb value", blob.includes("Xy1z.AbC"), false);
eq("never echoes the cookie value", blob.includes("AQABBxyz"), false);
eq("never echoes the API key", blob.includes("test-key"), false);

console.log(`\n${fail === 0 ? "OK" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
