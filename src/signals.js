// ── price-based momentum signals from FMP adjusted EOD history ────────────────
// Computes the signals competitors fake — RS line + RS-line-new-high, Weinstein
// stage, ADR%, dollar volume, distribution-day count, pocket pivot — from real
// split/dividend-adjusted daily bars. No new vendor, no backend: the universe is
// small enough to compute client-side. Returns null when data is unavailable so
// the UI falls back to the illustrative series (never fakes a computed signal).

const num = (v) => (v == null || v === "" || Number.isNaN(+v) ? null : +v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// throttled pool (don't burst the free-tier rate limit)
async function runPool(items, worker, concurrency = 3) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

// fetch one symbol's adjusted EOD history (oldest → newest), with backoff retry
export async function fetchHistory(ticker, from, attempt = 0) {
  try {
    const r = await fetch(`/api/fmp?endpoint=historical-price-eod-dividend-adjusted&symbol=${ticker}&from=${from}`);
    if (r.status === 501) return null;
    if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(500 * (attempt + 1)); return fetchHistory(ticker, from, attempt + 1); }
    if (!r.ok) return null;
    const d = await r.json();
    if (!Array.isArray(d) || !d.length) return null;
    return d
      .map((x) => ({ date: x.date, open: num(x.adjOpen), high: num(x.adjHigh), low: num(x.adjLow), close: num(x.adjClose), volume: num(x.volume) }))
      .filter((x) => x.close != null && x.date)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch { if (attempt < 3) { await sleep(500 * (attempt + 1)); return fetchHistory(ticker, from, attempt + 1); } return null; }
}

// fetch many symbols → { TICKER: rows[] }
export async function fetchHistories(tickers, from) {
  const out = {};
  await runPool(tickers, async (t) => { const rows = await fetchHistory(t, from); if (rows) out[t] = rows; }, 3);
  return out;
}

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const smaAt = (arr, period, end) => {
  if (end + 1 < period) return null;
  let s = 0; for (let i = end - period + 1; i <= end; i++) s += arr[i];
  return s / period;
};

const STAGE_LABEL = { 1: "Basing", 2: "Advancing", 3: "Topping", 4: "Declining" };

// compute the signal bundle for one symbol; spyRows optional (for RS line)
export function computeSignals(rows, spyRows) {
  if (!rows || rows.length < 30) return null;
  const closes = rows.map((r) => r.close);
  const highs = rows.map((r) => r.high);
  const lows = rows.map((r) => r.low);
  const vols = rows.map((r) => r.volume || 0);
  const dates = rows.map((r) => r.date);
  const n = closes.length;
  const last = closes[n - 1];
  const prev = closes[n - 2];
  const chgPct = prev ? ((last - prev) / prev) * 100 : 0;

  // 52-week high / distance
  const win = Math.min(252, n);
  const hi52 = Math.max(...highs.slice(n - win));
  const off52 = hi52 > 0 ? Math.max(0, +(((hi52 - last) / hi52) * 100).toFixed(1)) : 0;

  // 12-month return
  const back = Math.min(252, n - 1);
  const ret12m = +(((last / closes[n - 1 - back]) - 1) * 100).toFixed(1);

  // RS line vs SPY (carry-forward where a SPY date is missing), + new-high tell
  let rsLine = null, rsNewHigh = false, rsLeads = false;
  if (spyRows && spyRows.length) {
    const spyByDate = Object.fromEntries(spyRows.map((r) => [r.date, r.close]));
    let lastRatio = null;
    rsLine = closes.map((c, i) => {
      const s = spyByDate[dates[i]];
      if (s) lastRatio = c / s;
      return lastRatio;
    });
    if (rsLine[0] == null) { const f = rsLine.find((v) => v != null) || 1; for (let i = 0; i < n && rsLine[i] == null; i++) rsLine[i] = f; }
    const rsMax = Math.max(...rsLine);
    rsNewHigh = rsLine[n - 1] >= rsMax * 0.999;
    const priceNewHigh = last >= Math.max(...closes) * 0.999;
    rsLeads = rsNewHigh && !priceNewHigh; // RS new high before price — the institutional footprint
  }

  // Weinstein stage from the 30-week (150-day) MA slope + price relationship
  let stage = null;
  const ma = smaAt(closes, 150, n - 1);
  const maPrev = smaAt(closes, 150, n - 21);
  if (ma != null && maPrev != null) {
    const rising = ma > maPrev * 1.001, falling = ma < maPrev * 0.999;
    const above = last > ma;
    stage = rising && above ? 2 : falling && !above ? 4 : above ? 3 : 1;
  }

  // ADR% (avg daily range) + dollar volume, last 20
  const k = Math.min(20, n);
  const adrPct = +mean(rows.slice(n - k).map((r) => (r.low > 0 ? (r.high / r.low - 1) * 100 : 0))).toFixed(2);
  const dollarVol = mean(rows.slice(n - k).map((r) => r.close * (r.volume || 0)));

  // distribution days (down ≥0.2% on higher volume than prior day) in last 25
  let distDays = 0;
  for (let i = Math.max(1, n - 25); i < n; i++) {
    if (closes[i] < closes[i - 1] * 0.998 && vols[i] > vols[i - 1]) distDays++;
  }

  // pocket pivot: up day, volume > largest down-day volume of prior 10, near 10/50 MA
  let pocketPivot = false;
  if (n >= 12) {
    const upDay = last > prev;
    let maxDownVol = 0;
    for (let i = n - 11; i < n - 1; i++) if (closes[i] < closes[i - 1]) maxDownVol = Math.max(maxDownVol, vols[i]);
    const sma10 = smaAt(closes, 10, n - 1), sma50 = smaAt(closes, 50, n - 1) || sma10;
    const near = sma10 && last >= sma10 * 0.96 && last <= (sma50 || sma10) * 1.15;
    pocketPivot = upDay && maxDownVol > 0 && vols[n - 1] > maxDownVol && near;
  }

  return {
    closes, volume: vols, dates, last, chgPct,
    off52, atHigh: off52 <= 1, ret12m,
    rsLine, rsNewHigh, rsLeads,
    stage, stageLabel: stage ? STAGE_LABEL[stage] : "—",
    adrPct, dollarVol,
    distDays, pocketPivot,
    asOf: dates[n - 1],
  };
}

// default lookback window (≈ 14 months for 252-bar RS + 150-bar MA)
export function lookbackFrom(days = 430) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}
