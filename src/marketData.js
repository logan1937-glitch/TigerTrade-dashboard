// ── primary market feed: Yahoo (free, no key) via the /api/yahoo proxy ────────
// One call per symbol returns a current-ish quote AND the adjusted daily history.
// The app uses FMP as a fallback for anything Yahoo doesn't return. Data is
// delayed (~15 min) and shows the last close outside market hours — labeled
// "as of" in the UI, never presented as real-time.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fin = (v) => (v == null || Number.isNaN(+v) ? null : +v);

async function runPool(items, worker, concurrency = 4) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

async function fetchYahoo(ticker, attempt = 0) {
  try {
    const r = await fetch(`/api/yahoo?symbol=${ticker}&range=1y&interval=1d`);
    if ((r.status === 429 || r.status >= 500) && attempt < 2) { await sleep(500 * (attempt + 1)); return fetchYahoo(ticker, attempt + 1); }
    if (!r.ok) return null;
    const d = await r.json();
    if (!d || d.price == null || !Array.isArray(d.bars)) return null;
    const rows = d.bars
      .map((b) => ({ date: b.date, open: fin(b.open), high: fin(b.high), low: fin(b.low), close: fin(b.close), volume: fin(b.volume) }))
      .filter((b) => b.close != null && b.date);
    return { quote: { price: fin(d.price), changePercentage: fin(d.changePercentage), timestamp: d.timestamp || null }, rows };
  } catch { if (attempt < 2) { await sleep(500 * (attempt + 1)); return fetchYahoo(ticker, attempt + 1); } return null; }
}

// → { quotes: { TICKER: {price,changePercentage,timestamp} }, rows: { TICKER: rows[] } }
export async function fetchMarket(tickers) {
  const quotes = {}, rows = {};
  await runPool(tickers, async (t) => {
    const d = await fetchYahoo(t);
    if (d && d.quote.price != null) { quotes[t] = d.quote; if (d.rows.length) rows[t] = d.rows; }
  }, 4);
  return { quotes, rows };
}
