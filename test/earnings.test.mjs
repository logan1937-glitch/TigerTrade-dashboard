// Exercises api/earnings.js against a stubbed Yahoo (realistic quoteSummary
// shape) plus an FMP that denies the per-symbol endpoint, as this plan does.
import handler from "../api/earnings.js";

const day = (iso) => Math.floor(new Date(iso + "T13:30:00Z").getTime() / 1000);
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

const calls = [];
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  calls.push(u.split("?")[0]);
  if (u.startsWith("https://fc.yahoo.com")) {
    const h = new Headers();
    h.append("set-cookie", "A1=d=AQABBxyz&S=AQAAA; Domain=.yahoo.com; Path=/; HttpOnly");
    h.append("set-cookie", "A3=d=AQABBabc; Domain=.yahoo.com; Path=/");
    return new Response("not found", { status: 404, headers: h });
  }
  if (u.includes("/v1/test/getcrumb")) {
    if (!opts?.headers?.Cookie?.includes("A1=")) throw new Error("crumb requested without cookie");
    return new Response("Xy1z.AbC", { status: 200 });
  }
  if (u.includes("/v10/finance/quoteSummary/")) {
    if (!opts?.headers?.Cookie) throw new Error("quoteSummary without cookie");
    if (!u.includes("crumb=Xy1z.AbC")) throw new Error("quoteSummary without crumb");
    if (u.includes("/NOPE")) return new Response(JSON.stringify({ quoteSummary: { result: null } }), { status: 200 });
    return new Response(JSON.stringify(YS), { status: 200 });
  }
  if (u.includes("financialmodelingprep.com/stable/earnings?")) return new Response("Access denied", { status: 403 });
  if (u.includes("earnings-calendar") || u.includes("earning_calendar")) return new Response(JSON.stringify([]), { status: 200 });
  throw new Error("unexpected fetch: " + u);
};

const run = async (query) => {
  let code = 0, body = null;
  const res = { setHeader() {}, status(c) { code = c; return this; }, json(b) { body = b; return this; } };
  await handler({ query }, res);
  return { code, body };
};

process.env.FMP_API_KEY = "test-key";

const a = await run({ symbols: "NBIS,NOPE" });
console.log("status:", a.code);
console.log(JSON.stringify(a.body, null, 2));

const rec = a.body.NBIS;
const eq = (label, got, want) => console.log(`${got === want ? "PASS" : "FAIL"}  ${label}: ${got}${got === want ? "" : ` (want ${want})`}`);
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

// the cookie/crumb handshake must happen once and be reused across symbols
const seeds = calls.filter((c) => c.startsWith("https://fc.yahoo.com")).length;
const crumbs = calls.filter((c) => c.includes("getcrumb")).length;
eq("handshake reused across the batch (seed)", seeds, 1);
eq("handshake reused across the batch (crumb)", crumbs, 1);

// a second request on a warm lambda must not re-handshake
await run({ symbols: "NBIS" });
eq("warm lambda reuses creds", calls.filter((c) => c.includes("getcrumb")).length, 1);

// bad input
const bad = await run({ symbols: "../etc/passwd" });
eq("rejects unsafe symbols", bad.code, 400);
