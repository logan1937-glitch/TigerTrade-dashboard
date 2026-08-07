// api/_quote.js — turn a Yahoo chart response into a quote, correctly.
//
// This lived twice (api/yahoo.js and api/snapshot.js) and drifted into the SAME
// bug in both copies, so it is one function now.
//
// WHAT WENT WRONG. Both copies decided "is the last bar the current session?" by
// testing `Math.abs(regularMarketPrice - bars[last].close) < 1e-9`. That is a
// float-EXACT comparison on two numbers Yahoo serves through different fields
// with different rounding — the chart's close arrays come back with float32-grade
// precision, so a $241 stock reports 241.30000305175781 in the bars and 241.3 in
// the quote. They differ by ~3e-5, which is thirty thousand times the tolerance.
// The test therefore failed for essentially every symbol, took the "market open"
// branch, and set the previous close to THE SAME SESSION'S CLOSE. The resulting
// change is the rounding error itself: ±0.000001%, which prints as +0.00%.
//
// That is one root cause behind three separate reported symptoms: the Volume
// tab's advancing/declining filters returning nothing, the stock tape showing no
// percentages, and the tape reverting to zeros a moment after load (the snapshot
// renders first, then the intraday refresh overwrites it with the same bug).
//
// WHAT IT DOES NOW. No price-equality heuristic at all:
//
//   1. `meta.previousClose` paired with `meta.regularMarketPrice`. Both are
//      unadjusted and both come from the quote side, so the ratio is internally
//      consistent and it is the live intraday change while the market is open.
//   2. Failing that, the bars alone — adjusted close against adjusted close.
//      Also consistent, and it is the last completed session's change.
//
// The old code mixed the two: an UNADJUSTED `regularMarketPrice` over an
// ADJUSTED bar close. For any name that had gone ex-dividend inside the window
// that is wrong by the adjustment factor, independently of the tolerance bug.

const fin = (v) => (v == null || Number.isNaN(+v) ? null : +v);

/** @param meta chart.result[0].meta  @param bars oldest→newest [{date, close, …}] */
export function quoteFromChart(meta = {}, bars = []) {
  const n = bars.length;
  const price = fin(meta.regularMarketPrice);
  const lastClose = n ? fin(bars[n - 1].close) : null;

  // 1) quote-side pair — unadjusted price over unadjusted previous close
  const prevMeta = fin(meta.previousClose);
  if (price != null && prevMeta != null && prevMeta > 0) {
    return {
      symbol: meta.symbol || null,
      price,
      previousClose: prevMeta,
      changePercentage: ((price - prevMeta) / prevMeta) * 100,
      timestamp: meta.regularMarketTime || null,
      currency: meta.currency || null,
    };
  }

  // 2) bars-only — adjusted over adjusted. `chartPreviousClose` is deliberately
  //    NOT used as a denominator: it is the close before the requested RANGE, so
  //    on range=1y it turns the daily change into the 12-month move.
  if (n >= 2) {
    const prevBar = fin(bars[n - 2].close);
    if (prevBar != null && prevBar > 0 && lastClose != null) {
      return {
        symbol: meta.symbol || null,
        price: price != null ? price : lastClose,
        previousClose: prevBar,
        changePercentage: ((lastClose - prevBar) / prevBar) * 100,
        timestamp: meta.regularMarketTime || null,
        currency: meta.currency || null,
      };
    }
  }

  // nothing to difference against — null, never 0
  return {
    symbol: meta.symbol || null,
    price: price != null ? price : lastClose,
    previousClose: null,
    changePercentage: null,
    timestamp: meta.regularMarketTime || null,
    currency: meta.currency || null,
  };
}
