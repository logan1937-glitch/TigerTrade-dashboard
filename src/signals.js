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

  // breadth inputs: position vs 50-day MA and distance off the 52-week low
  const sma50b = smaAt(closes, 50, n - 1);
  const above50 = sma50b != null ? last > sma50b : null;
  const lo52 = Math.min(...lows.slice(n - win));
  const atLow = lo52 > 0 ? last <= lo52 * 1.02 : false;

  return {
    closes, volume: vols, dates, last, chgPct,
    off52, atHigh: off52 <= 1, ret12m,
    rsLine, rsNewHigh, rsLeads,
    stage, stageLabel: stage ? STAGE_LABEL[stage] : "—",
    adrPct, dollarVol,
    distDays, pocketPivot,
    above50, atLow,
    asOf: dates[n - 1],
  };
}

// ── market health, computed from real index + universe data ──────────────────
// indices: [{ key, label, price, chgPct, rows }] — first entry is the S&P (or
// its ETF proxy) and drives trend / distribution days / follow-through.
// universe: [{ chg, dollarVol?, sig }] — drives the breadth block (labeled as
// universe breadth in the UI, since true exchange-wide breadth needs paid data).
export function computeMarketHealth(indices, universe) {
  const idx = indices.filter((x) => x && x.rows && x.rows.length >= 60 && x.price != null);
  if (!idx.length) return null;

  const idxStats = idx.map((x) => {
    const closes = x.rows.map((r) => r.close);
    const n = closes.length;
    const sma50 = smaAt(closes, 50, n - 1);
    const sma200 = smaAt(closes, 200, n - 1);
    const sma50prev = smaAt(closes, 50, Math.max(49, n - 11));
    // ~30-point sparkline of the last 3 months
    const tail = closes.slice(-63);
    const step = Math.max(1, Math.floor(tail.length / 30));
    return {
      k: x.label, price: x.price, chg: x.chgPct,
      above50: sma50 != null ? x.price > sma50 : null,
      above200: sma200 != null ? x.price > sma200 : null,
      rising50: sma50 != null && sma50prev != null ? sma50 > sma50prev : null,
      spark: tail.filter((_, i) => i % step === 0),
    };
  });

  // S&P drives the regime read
  const spx = idx[0];
  const closes = spx.rows.map((r) => r.close);
  const vols = spx.rows.map((r) => r.volume || 0);
  const n = closes.length;

  let distDays = 0;
  for (let i = Math.max(1, n - 25); i < n; i++) {
    if (closes[i] < closes[i - 1] * 0.998 && vols[i] > 0 && vols[i] > vols[i - 1]) distDays++;
  }

  // last power day: ≥1.25% gain on higher volume (simplified follow-through read)
  let lastFTD = null;
  for (let i = n - 1; i >= Math.max(1, n - 90); i--) {
    const gain = closes[i] / closes[i - 1] - 1;
    if (gain >= 0.0125 && (vols[i] === 0 || vols[i] > vols[i - 1])) {
      const d = new Date(spx.rows[i].date + "T00:00:00");
      lastFTD = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
      break;
    }
  }

  const s = idxStats[0];
  let trend, trendNote;
  if (s.above50 && s.above200 && s.rising50 && distDays < 6) {
    trend = "Confirmed Uptrend";
    trendNote = "Buying permitted — S&P above its rising 50-day and 200-day lines.";
  } else if (s.above200 && (!s.above50 || distDays >= 6)) {
    trend = "Uptrend Under Pressure";
    trendNote = distDays >= 6
      ? "Distribution is stacking up — tighten stops and slow new buying."
      : "S&P below its 50-day line — reduce exposure until it's reclaimed.";
  } else if (!s.above200 && !s.above50) {
    trend = "Market In Correction";
    trendNote = "S&P below its 50-day and 200-day lines — defense first; new buys need exceptional setups.";
  } else {
    trend = "Mixed / Rangebound";
    trendNote = "Signals conflict across moving averages — size down and be selective.";
  }

  // universe breadth (honest proxy — our tracked names, not the whole exchange)
  const withSig = universe.filter((u) => u && u.sig);
  const withChg = universe.filter((u) => u && u.chg != null);
  const adv = withChg.filter((u) => u.chg > 0).length;
  const dec = withChg.filter((u) => u.chg < 0).length;
  const above = withSig.filter((u) => u.sig.above50 === true).length;
  const withMa = withSig.filter((u) => u.sig.above50 != null).length;
  const upDollar = withChg.reduce((t, u) => t + (u.chg > 0 ? (u.sig?.dollarVol || 0) : 0), 0);
  const totDollar = withChg.reduce((t, u) => t + (u.sig?.dollarVol || 0), 0);

  return {
    trend, trendNote, distDays, distMax: 6, lastFTD,
    indexes: idxStats,
    breadth: {
      n: withSig.length,
      newHighs: withSig.filter((u) => u.sig.atHigh).length,
      newLows: withSig.filter((u) => u.sig.atLow).length,
      pctAbove50: withMa ? Math.round((above / withMa) * 100) : null,
      advDec: dec > 0 ? +(adv / dec).toFixed(1) : adv,
      upVolPct: totDollar > 0 ? Math.round((upDollar / totDollar) * 100) : null,
    },
  };
}

// default lookback window (≈ 14 months for 252-bar RS + 150-bar MA)
export function lookbackFrom(days = 430) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// pure-technical momentum score (0–100) from real signals + the universe RS
// rating. No fundamentals — works for every name with a signal bundle, so it
// ranks curated and extended-universe names on the same honest basis.
export function momentumScore(sig, rs) {
  if (!sig) return null;
  let s = (rs == null ? 50 : rs) * 0.45;                 // leadership (RS) — the biggest weight
  const st = sig.stage;
  s += st === 2 ? 20 : st === 1 ? 8 : st === 3 ? 4 : st === 4 ? 0 : 6;  // Weinstein stage
  s += sig.rsLeads ? 10 : sig.rsNewHigh ? 6 : 0;          // RS line new high (esp. before price)
  s += sig.off52 <= 3 ? 8 : sig.off52 <= 12 ? 5 : sig.off52 <= 25 ? 2 : 0;  // proximity to 52-wk high
  s += sig.distDays <= 2 ? 6 : sig.distDays <= 4 ? 3 : 0; // few distribution days
  s += sig.pocketPivot ? 5 : 0;                           // constructive volume signature
  if (sig.dollarVol && sig.dollarVol < 3e6) s *= 0.85;    // illiquidity penalty
  return Math.max(0, Math.min(100, Math.round(s)));
}

// universe-wide RS rating (1–99) from the percentile of 12-month return.
// Pass the rows that have a signal bundle; returns { TICKER: rating }.
export function rsRatings(rows) {
  const withRet = rows.filter((r) => r.sig && r.sig.ret12m != null);
  const sorted = [...withRet].sort((a, b) => a.sig.ret12m - b.sig.ret12m);
  const map = {};
  sorted.forEach((r, i) => { map[r.tk] = sorted.length > 1 ? Math.round(1 + (i / (sorted.length - 1)) * 98) : 50; });
  return map;
}
