// ── live market data (via the /api/fmp serverless proxy) ─────────────────────
// Pulls real quotes for the screener universe and merges the trade-critical,
// time-sensitive fields (price, % change, distance off 52-wk high, relative
// volume) over the analyst-maintained base dataset. Slow-moving / proprietary
// CAN SLIM inputs (earnings growth, RS rank, institutional read, pivot, base
// pattern, catalyst) stay in the editorial layer and are labeled as such.
//
// HARD RULE: this module NEVER fabricates data. If the live feed is missing or
// fails it returns { status: "unavailable", ... } and the UI must show a loud
// "DEMO — NOT LIVE" state, never demo numbers dressed up as real.

const num = (v) => (v == null || v === "" || Number.isNaN(+v) ? null : +v);

// FMP quote field names differ between API tiers/versions — read defensively.
const pick = (q, ...keys) => {
  for (const k of keys) { const v = num(q?.[k]); if (v != null) return v; }
  return null;
};

// Fetch quotes for every ticker. Tries a single batch call first (paid tiers),
// then falls back to per-symbol quotes (works on the free tier).
export async function fetchQuotes(tickers) {
  const map = {};
  let any = false;
  let noKey = false;

  // 1) batch attempt — one call for the whole universe
  try {
    const r = await fetch(`/api/fmp?endpoint=batch-quote&symbols=${tickers.join(",")}`);
    if (r.status === 501) noKey = true;
    else if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d)) for (const q of d) { if (q?.symbol) { map[q.symbol] = q; any = true; } }
    }
  } catch { /* fall through to per-symbol */ }

  // 2) per-symbol fallback (free tier allows single-symbol quotes)
  if (!any && !noKey) {
    const results = await Promise.allSettled(
      tickers.map(async (t) => {
        const r = await fetch(`/api/fmp?endpoint=quote&symbol=${t}`);
        if (r.status === 501) { const e = new Error("no key"); e.code = "NO_KEY"; throw e; }
        if (!r.ok) throw new Error(`status ${r.status}`);
        const d = await r.json();
        const q = Array.isArray(d) ? d[0] : d;
        if (!q || num(q.price) == null) throw new Error("empty");
        return q;
      })
    );
    for (const res of results) {
      if (res.status === "fulfilled" && res.value?.symbol) { map[res.value.symbol] = res.value; any = true; }
      if (res.status === "rejected" && res.reason?.code === "NO_KEY") noKey = true;
    }
  }

  if (!any) return { status: "unavailable", code: noKey ? "NO_KEY" : "NO_DATA", quotes: {} };

  // real "as of" — newest quote timestamp we got back, else now
  let asOf = 0;
  for (const q of Object.values(map)) { const t = num(q.timestamp); if (t) asOf = Math.max(asOf, t * 1000); }
  return { status: "live", code: "OK", asOf: asOf || Date.now(), quotes: map, count: any ? Object.keys(map).length : 0 };
}

// Merge a live quote over an editorial stock record. Only overrides fields the
// quote actually supplied; everything else (and the whole record on failure)
// is untouched.
export function mergeLive(s, q) {
  const price = pick(q, "price");
  if (price == null) return s;

  const chg = pick(q, "changePercentage", "changesPercentage") ?? s.chg;
  const yearHigh = pick(q, "yearHigh");
  const off52 = yearHigh && yearHigh > 0
    ? Math.max(0, +(((yearHigh - price) / yearHigh) * 100).toFixed(1))
    : s.off52;
  const vol = pick(q, "volume");
  const avg = pick(q, "averageVolume", "avgVolume");
  const relVol = vol != null && avg && avg > 0 ? +(vol / avg).toFixed(2) : s.relVol;

  return { ...s, price, chg, off52, relVol, _live: true };
}
