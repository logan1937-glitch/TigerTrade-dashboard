// Adjusted daily bars from Yahoo's chart endpoint, parsed once.
//
// `snapshot.js` has its own copy of this parse, and that is a known duplication
// rather than an oversight: its version also derives a QUOTE from the same
// response, and the quote derivation is the part that has actually drifted and
// caused a real bug (see `_quote.js` — two copies disagreed about which close
// was the denominator and printed ±0.00% across the whole universe). That piece
// is already single-sourced. What is duplicated here is the mechanical row
// parse, and it is duplicated deliberately: the nightly snapshot is the most
// load-bearing path in the app, it has no test coverage of its own, and
// refactoring it to import this would be an unverifiable change to the one
// endpoint every view depends on. If snapshot.js is ever touched for another
// reason, migrate it to `fetchBars` then and delete its copy.

import { bulkFetch } from "./_upstream.js";

const fin = (v) => (v == null || Number.isNaN(+v) ? null : +v);

/* `range` is a Yahoo range string. The backtest asks for 2y because it needs a
   full trailing window (252 sessions) BEFORE its earliest rebalance, plus the
   rebalances themselves — 1y would leave no out-of-sample period at all. */
export async function fetchBars(symbol, range = "1y") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`
      + `?range=${encodeURIComponent(range)}&interval=1d`;
    const r = await bulkFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TigerTrade/1.0)", "Accept": "application/json" },
    });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res) return null;
    const ts = res.timestamp || [];
    const q = (res.indicators && res.indicators.quote && res.indicators.quote[0]) || {};
    const adj = res.indicators && res.indicators.adjclose && res.indicators.adjclose[0]
      && res.indicators.adjclose[0].adjclose;
    const rows = [];
    for (let i = 0; i < ts.length; i++) {
      // ADJUSTED close, so splits and dividends are already handled — a
      // backtest on unadjusted closes reads every split as a crash
      const close = adj && adj[i] != null ? adj[i] : (q.close ? q.close[i] : null);
      if (close == null) continue;
      rows.push({
        date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
        open: fin(q.open ? q.open[i] : null), high: fin(q.high ? q.high[i] : null),
        low: fin(q.low ? q.low[i] : null), close: fin(close),
        volume: fin(q.volume ? q.volume[i] : null),
      });
    }
    return rows.length ? rows : null;
  } catch { return null; }
}

// concurrency pool with a soft deadline: in-flight work finishes, nothing new
// starts once the deadline passes, so a big universe degrades to partial
// coverage rather than timing the function out
export async function pool(items, worker, c = 6, deadline = Infinity) {
  const q = [...items];
  const start = Date.now();
  await Promise.all(Array.from({ length: Math.min(c, q.length) }, async () => {
    while (q.length && Date.now() - start < deadline) await worker(q.shift());
  }));
}
