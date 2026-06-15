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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// run async `worker` over `items` with limited concurrency (don't burst the API)
async function runPool(items, worker, concurrency = 4) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

// FMP quote field names differ between API tiers/versions — read defensively.
const pick = (q, ...keys) => {
  for (const k of keys) { const v = num(q?.[k]); if (v != null) return v; }
  return null;
};

// Fetch quotes for every ticker. Tries a single batch call first (premium
// tiers), then fills any gaps with per-symbol quotes (work on basic tiers).
// A quote only counts as "live" if it actually carries a usable price — this is
// what keeps the badge honest (no green without real prices).
export async function fetchQuotes(tickers) {
  const map = {};
  let noKey = false;

  const addIfPriced = (q) => {
    if (q && q.symbol && pick(q, "price") != null) { map[q.symbol] = q; return true; }
    return false;
  };

  // 1) batch attempt — one call for the whole universe (premium tiers only)
  try {
    const r = await fetch(`/api/fmp?endpoint=batch-quote&symbols=${tickers.join(",")}`);
    if (r.status === 501) noKey = true;
    else if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d)) d.forEach(addIfPriced);
    }
  } catch { /* fall through to per-symbol */ }

  // 2) per-symbol fallback — fetch every ticker the batch didn't cover.
  // Throttled (4 at a time) with backoff retry on rate-limit so a free-tier key
  // doesn't reject the burst — that's what made "only NVDA" update before.
  const missing = tickers.filter((t) => !map[t]);
  if (missing.length && !noKey) {
    const fetchOne = async (t, attempt = 0) => {
      try {
        const r = await fetch(`/api/fmp?endpoint=quote&symbol=${t}`);
        if (r.status === 501) { noKey = true; return; }
        if ((r.status === 429 || r.status >= 500) && attempt < 3) {
          await sleep(500 * (attempt + 1));
          return fetchOne(t, attempt + 1);
        }
        if (!r.ok) return;
        const d = await r.json();
        addIfPriced(Array.isArray(d) ? d[0] : d);
      } catch {
        if (attempt < 3) { await sleep(500 * (attempt + 1)); return fetchOne(t, attempt + 1); }
      }
    };
    await runPool(missing, fetchOne, 4);
  }

  const count = Object.keys(map).length;
  if (!count) return { status: "unavailable", code: noKey ? "NO_KEY" : "NO_DATA", quotes: {} };

  // real "as of" — newest quote timestamp we got back, else now
  let asOf = 0;
  for (const q of Object.values(map)) { const t = num(q.timestamp); if (t) asOf = Math.max(asOf, t * 1000); }
  return { status: "live", code: "OK", asOf: asOf || Date.now(), quotes: map, count, total: tickers.length };
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

// Merge a live quote over an editorial CANSLIM record. Live price/%chg drive the
// real buy-zone: pctExt is recomputed vs the pivot, and buy/ext flip on the live
// price (editorial "watch" names stay watch — their base is still forming).
export function mergeCanslim(s, q) {
  const price = pick(q, "price");
  if (price == null) return s;
  const chg = pick(q, "changePercentage", "changesPercentage") ?? s.chg;
  const pctExt = +(((price - s.pivot) / s.pivot) * 100).toFixed(1);
  let status = s.status;
  if (status !== "watch") status = pctExt > 5 ? "ext" : "buy";
  return { ...s, px: price, chg, pctExt, status, _live: true };
}
