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

/* ── swing-setup math: ATR, EMAs, range contraction ───────────────────────
   Every figure here comes from the SAME adjusted daily bars the momentum
   signals above already use, so the whole Playbook costs no extra vendor
   calls — it rides in the nightly snapshot. Each returns null when there is
   not enough history to compute it honestly; nothing is estimated. */

// Wilder's ATR: seed with the mean of the first `p` true ranges, then smooth
// at 1/p. (A plain SMA of TR is the common shortcut and reads ~10% different
// on trending names — this is the definition charting packages actually use.)
function wilderATR(highs, lows, closes, p = 14) {
  const n = closes.length;
  if (n < p + 1) return null;
  const tr = [];
  for (let i = 1; i < n; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  if (tr.length < p) return null;
  let atr = mean(tr.slice(0, p));
  for (let i = p; i < tr.length; i++) atr = (atr * (p - 1) + tr[i]) / p;
  return atr;
}

// standard EMA, seeded with the SMA of the first `p` closes
function emaLast(closes, p) {
  const n = closes.length;
  if (n < p) return null;
  const k = 2 / (p + 1);
  let e = mean(closes.slice(0, p));
  for (let i = p; i < n; i++) e = closes[i] * k + e * (1 - k);
  return e;
}

// high-low range over the trailing `w` bars, as a % of the last close
const rangePct = (highs, lows, last, w) => {
  const n = highs.length;
  if (n < w || !last) return null;
  const hi = Math.max(...highs.slice(n - w));
  const lo = Math.min(...lows.slice(n - w));
  return ((hi - lo) / last) * 100;
};

const r2 = (v, d = 2) => (v == null || !Number.isFinite(v) ? null : +v.toFixed(d));

export function swingMetrics(highs, lows, closes, last) {
  const n = closes.length;
  const atr = wilderATR(highs, lows, closes, 14);
  const e21 = emaLast(closes, 21), e50 = emaLast(closes, 50), e65 = emaLast(closes, 65);

  // EMA Launchpad: how tightly the three EMAs are bunched, as a % of the
  // lowest of them. Small = coiled; the screener filters on this.
  let emaSpread = null;
  if (e21 != null && e50 != null && e65 != null) {
    const hi = Math.max(e21, e50, e65), lo = Math.min(e21, e50, e65);
    if (lo > 0) emaSpread = ((hi - lo) / lo) * 100;
  }

  // Volatility contraction: the recent range measured against the prior one.
  // < 1 means the last 10 sessions are tighter than the last 40 — price
  // compressing. Paired with `imp` (the move that preceded it) because a
  // contraction only means something after an advance.
  const rng10 = rangePct(highs, lows, last, 10);
  const rng40 = rangePct(highs, lows, last, 40);
  const cx = rng10 != null && rng40 > 0 ? rng10 / rng40 : null;
  const imp = n >= 21 && closes[n - 21] > 0 ? (last / closes[n - 21] - 1) * 100 : null;

  // Chandelier Exit (long): the 22-day highest high less 3 ATRs — the standard
  // ATR trailing stop. Labelled with its inputs in the UI so it is never
  // mistaken for a broker-side order.
  let stop = null;
  if (atr != null && n >= 22) stop = Math.max(...highs.slice(n - 22)) - 3 * atr;

  return {
    atr: r2(atr, 3),
    atrPct: atr != null && last ? r2((atr / last) * 100) : null,
    stop: r2(stop),
    e21: r2(e21), e50: r2(e50), e65: r2(e65),
    emaSpread: r2(emaSpread),
    cx: r2(cx, 3),
    imp: r2(imp, 1),
  };
}

/* ── ATR trailing stop, measured from YOUR entry ──────────────────────────
   A trailing stop set `mult` ATRs under the current price, reported as a move
   from the price you actually paid — which is the number that tells you whether
   a stop-out is a loss or a locked-in gain.

     dist      1.5 × ATR(14), in dollars
     trail     current price − dist   (it ratchets up as price rises)
     belowPx   dist as a % of the current price
     fromEntry (trail ÷ cost − 1) × 100 — NEGATIVE means a stop-out still costs
               you that much from entry; POSITIVE means the trail has climbed
               above your cost and the position can only close at a profit.

   Every field is null when its input is missing — no cost basis means no
   from-entry figure, and we do not substitute the current price for it. */
export const ATR_TRAIL_MULT = 1.5;

export function atrTrail({ px, cost, atr, mult = ATR_TRAIL_MULT }) {
  const m = +mult;
  const out = { mult: m, dist: null, trail: null, belowPx: null, fromEntry: null, locked: null };
  if (atr == null || !Number.isFinite(atr) || atr <= 0 || !Number.isFinite(m) || m <= 0) return out;
  out.dist = +(atr * m).toFixed(4);
  if (px == null || !(px > 0)) return out;
  out.trail = +(px - out.dist).toFixed(2);
  out.belowPx = +((out.dist / px) * 100).toFixed(2);
  if (cost != null && cost > 0) {
    out.fromEntry = +((out.trail / cost - 1) * 100).toFixed(2);
    out.locked = out.trail > cost;      // the trail has ratcheted past your entry
  }
  return out;
}

/* ── highest high since a date ────────────────────────────────────────────
   A trailing stop follows the PEAK of the holding period, not the current
   price, so knowing where the trail actually sits needs the high-water mark
   since you entered. Bars are the same {date, high, low, close} rows the rest
   of signals.js consumes, oldest → newest.

   Returns null when the entry date is missing, unparseable, or later than every
   bar we have — an entry we cannot locate in the series must not silently fall
   back to the whole history's peak, which would overstate the trail. */
export function peakSince(bars, entryDate) {
  if (!Array.isArray(bars) || !bars.length || !entryDate) return null;
  const from = String(entryDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return null;
  let peak = null, peakDate = null, n = 0;
  for (const b of bars) {
    if (!b || !b.date || String(b.date).slice(0, 10) < from) continue;
    const h = b.high != null ? +b.high : (b.close != null ? +b.close : null);
    if (h == null || !Number.isFinite(h)) continue;
    n++;
    if (peak == null || h > peak) { peak = h; peakDate = String(b.date).slice(0, 10); }
  }
  return peak == null ? null : { peak: +peak.toFixed(2), peakDate, bars: n };
}

/* ── EMA Launchpad filter ─────────────────────────────────────────────────
   Keeps only names whose 21/50/65-day EMAs sit within `maxSpread` percent of
   each other — the three moving averages coiled together, which is the setup
   the Playbook screens for. A name missing any of the three is DROPPED, never
   assumed: the filter asserts a measured condition, so an unmeasurable name
   cannot satisfy it.

   Tolerant about shape on purpose — it accepts a csData row (`r.sig.swing`), a
   bare signal bundle (`r.swing`), or an object carrying e21/e50/e65 directly,
   so it works against live rows and plain data alike. */
export const LAUNCHPAD_MAX_SPREAD = 2;      // percent

const emasOf = (r) => {
  const s = (r && r.sig && r.sig.swing) || (r && r.swing) || r;
  if (!s) return null;
  const { e21, e50, e65 } = s;
  return e21 != null && e50 != null && e65 != null ? [+e21, +e50, +e65] : null;
};

// the spread as a percentage of the lowest EMA, or null when it can't be measured
export function emaSpreadOf(row) {
  const e = emasOf(row);
  if (!e) return null;
  const lo = Math.min(...e), hi = Math.max(...e);
  if (!(lo > 0)) return null;
  // rounded before comparing so a boundary case (exactly 2%) is decided by the
  // number a user sees, not by float representation error
  return +(((hi - lo) / lo) * 100).toFixed(4);
}

/* The predicate the Playbook's "EMA Launchpad" chip actually runs. It lived
   twice — once here inside `launchpad()`, once inline in playbook.jsx's FILTERS
   — so the tests covered a list-filter the app never called while the shipped
   check went untested. One definition, used by both. */
export function isLaunchpad(row, maxSpread = LAUNCHPAD_MAX_SPREAD) {
  const s = emaSpreadOf(row);
  return s != null && s <= maxSpread;
}

export function launchpad(rows, maxSpread = LAUNCHPAD_MAX_SPREAD) {
  return (rows || []).filter((r) => {
    const spread = emaSpreadOf(r);
    return spread != null && spread <= maxSpread;
  });
}

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

  /* Last session's own volume, and how it compares to this name's normal. The
     20-day `dollarVol` above is an average — a liquidity filter, not an event.
     These are the event: `rvol` is the multiple of normal that traded, which is
     the only way a $2B mid-cap and a $60B mega-cap can be read on one screen.
     A mega-cap always tops an absolute-volume list; 4× normal is the news. */
  const volD = vols[n - 1] || null;
  const volAvg50 = n > 50 ? mean(vols.slice(n - 51, n - 1)) : (n > 5 ? mean(vols.slice(0, n - 1)) : null);
  const rvol = volD && volAvg50 > 0 ? +(volD / volAvg50).toFixed(2) : null;
  const dvD = volD ? closes[n - 1] * volD : null;

  // distribution days (down ≥0.2% on higher volume than prior day) in last 25
  let distDays = 0;
  for (let i = Math.max(1, n - 25); i < n; i++) {
    if (closes[i] < closes[i - 1] * 0.998 && vols[i] > vols[i - 1]) distDays++;
  }

  // up/down volume ratio (last ~50 days): total volume on up-close days ÷ total
  // on down-close days. O'Neil's classic institutional-demand proxy — a ratio
  // ≥ 1 means accumulation is outpacing distribution. Real EOD volume, not 13F.
  let udVol = null;
  {
    const w = Math.min(50, n - 1);
    let up = 0, dn = 0;
    for (let i = n - w; i < n; i++) {
      if (closes[i] > closes[i - 1]) up += vols[i];
      else if (closes[i] < closes[i - 1]) dn += vols[i];
    }
    if (dn > 0 && up + dn > 0) udVol = +(up / dn).toFixed(2);
    else if (up > 0 && dn === 0) udVol = 9.99;   // all-up window (rare) — cap the display
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
    volD, volAvg50: volAvg50 != null ? Math.round(volAvg50) : null, rvol, dvD,
    distDays, pocketPivot, udVol,
    above50, atLow,
    swing: swingMetrics(highs, lows, closes, last),
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

  // Weinstein stage distribution across the tracked universe (1=basing, 2=advancing,
  // 3=topping, 4=declining) — a breadth read on where names sit in their cycle.
  const withStage = withSig.filter((u) => u.sig.stage >= 1 && u.sig.stage <= 4);
  const stageCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const u of withStage) stageCounts[u.sig.stage]++;

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
    stages: { counts: stageCounts, n: withStage.length },
  };
}

// default lookback window (≈ 14 months for 252-bar RS + 150-bar MA)
export function lookbackFrom(days = 430) {
  return new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
}

// ── relative-rotation coordinates from an RS line (security ÷ benchmark) ───────
// Our own DOCUMENTED APPROXIMATION of the relative-rotation concept popularized
// by Julius de Kempenaer (RRG Research). Not the proprietary JdK RS-Ratio /
// RS-Momentum; RRG® and JdK are their trademarks. Both axes are normalized so
// 100 = "in line with its own trend":
//   ratio ≈ RS line vs its 50-bar average  (>100 → outperforming trend)
//   mom   ≈ whether that ratio is rising    (>100 → momentum improving)
// Returns an array of { ratio, mom } points, oldest → newest.
export function relativeRotation(rsLine, opts = {}) {
  const { ratioLen = 50, momLen = 20, smooth = 10, momSmooth = 10 } = opts;
  const n = rsLine ? rsLine.length : 0;
  if (n < ratioLen + smooth + momLen + momSmooth) return null;
  const avg = (arr, len, end) => { let s = 0; for (let i = end - len + 1; i <= end; i++) s += arr[i]; return s / len; };
  const sma = (arr, len) => { const out = []; for (let i = len - 1; i < arr.length; i++) out.push(avg(arr, len, i)); return out; };

  // 1) raw RS-Ratio: RS line vs its own long average, ×100
  const rawRatio = [];
  for (let i = ratioLen - 1; i < n; i++) { const m = avg(rsLine, ratioLen, i); rawRatio.push(m ? 100 * (rsLine[i] / m) : 100); }
  // 2) smooth it (the RS-Ratio line)
  const ratio = sma(rawRatio, smooth);
  // 3) RS-Momentum = smoothed rate-of-change of the RS-Ratio, centered at 100
  const momRaw = [];
  for (let i = momLen; i < ratio.length; i++) momRaw.push(100 + (ratio[i] - ratio[i - momLen]));
  const mom = sma(momRaw, momSmooth);
  // align to the shortest (mom) and pair up
  const ratioTail = ratio.slice(ratio.length - mom.length);
  return ratioTail.map((r, i) => ({ ratio: r, mom: mom[i] }));
}

// equal-weight aggregate RS line from member RS lines (align to shortest tail)
export function aggregateRsLine(rsLines) {
  const valid = rsLines.filter((a) => a && a.length);
  if (!valid.length) return null;
  const len = Math.min(...valid.map((a) => a.length));
  if (len < 60) return null;
  const out = new Array(len).fill(0);
  for (const a of valid) { const off = a.length - len; for (let i = 0; i < len; i++) out[i] += a[off + i]; }
  return out.map((v) => v / valid.length);
}

// ── compact precompute helpers ───────────────────────────────────────────────
// Shared by the server snapshot AND the client's custom-ticker path, so every
// name — curated, S&P 500, or ad-hoc lookup — carries identical compact fields.
// This is what lets the snapshot ship ~500 names cheaply: the heavy daily arrays
// stay on the server; the client gets precomputed returns, an RRG tail, and a
// tiny sparkline, and fetches full history on demand only when a chart opens.

const RRG_TAIL = 6, RRG_STEP = 5;
// 6-point relative-rotation tail (RS-ratio / RS-momentum), sampled every RRG_STEP
export function rrgTail(rsLine) {
  const rr = relativeRotation(rsLine);
  if (!rr || rr.length < (RRG_TAIL - 1) * RRG_STEP + 1) return null;
  const tail = [];
  for (let k = RRG_TAIL - 1; k >= 0; k--) { const p = rr[rr.length - 1 - k * RRG_STEP]; tail.push({ ratio: +p.ratio.toFixed(2), mom: +p.mom.toFixed(2) }); }
  return tail;
}

// % returns over standard windows from daily closes + the live quote change
const RET_BARS = { w1: 5, m1: 21, m3: 63, y1: 252 };
export function periodReturns(closes, chgPct) {
  const c = closes, n = c ? c.length : 0;
  const r2 = (v) => (v == null || Number.isNaN(+v) ? null : +(+v).toFixed(2));
  const out = { d1: chgPct != null ? r2(chgPct) : (n >= 2 ? r2((c[n - 1] / c[n - 2] - 1) * 100) : null) };
  for (const [k, back] of Object.entries(RET_BARS)) out[k] = n >= 2 ? r2((c[n - 1] / c[Math.max(0, n - 1 - back)] - 1) * 100) : null;
  return out;
}
// tf id ("1D".."1Y") → key on the precomputed returns object
export const RET_KEY = { "1D": "d1", "1W": "w1", "1M": "m1", "3M": "m3", "1Y": "y1" };

// Sparkline sampled from daily closes. 60 points over ~a year is roughly a
// 4-day bar — coarse enough to stay small in the payload, fine enough that the
// line has the same shape as the real chart. At the old 8 points every name
// drew the same three kinks and none of them matched the drawer's chart.
export function sampleSpark(closes, pts = 60) {
  if (!closes || !closes.length) return null;
  const step = Math.max(1, Math.floor(closes.length / pts));
  const out = closes.filter((_, i) => i % step === 0).map((v) => +(+v).toFixed(2));
  const last = +(+closes[closes.length - 1]).toFixed(2);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

// technical buy point from real history — the recent base high (60 bars,
// excluding the last 5) is the pivot; status is relative to it. Shared so the
// server (compact) and client (custom/live names) derive it identically.
export function deriveBuyPoint(closes, px, coverage, stage, off52) {
  const c = closes, n = c ? c.length : 0;
  if (n >= 70) {
    const base = c.slice(n - 65, n - 5);
    const pivot = +Math.max(...base).toFixed(2);
    const baseLo = Math.min(...base);
    const price = px != null ? px : c[n - 1];
    const pctExt = +(((price - pivot) / pivot) * 100).toFixed(1);
    return {
      status: pctExt > 5 ? "ext" : pctExt >= -3 ? "buy" : "watch",
      pivot, buyLo: pivot, buyHi: +(pivot * 1.05).toFixed(2), pctExt,
      baseType: "60-day base high", baseWeeks: 12, baseDepth: +(((pivot - baseLo) / pivot) * 100).toFixed(0),
    };
  }
  return { status: coverage === "signals" ? (stage === 2 && off52 <= 6 ? "buy" : null) : null };
}

// build the compact signal record the client consumes (drops the heavy arrays)
export function compactSig(sig, chgPct, px) {
  if (!sig) return null;
  return {
    stage: sig.stage, stageLabel: sig.stageLabel,
    off52: sig.off52, atHigh: sig.atHigh, ret12m: sig.ret12m,
    rsNewHigh: sig.rsNewHigh, rsLeads: sig.rsLeads,
    adrPct: sig.adrPct, dollarVol: sig.dollarVol, distDays: sig.distDays,
    volD: sig.volD, volAvg50: sig.volAvg50, rvol: sig.rvol, dvD: sig.dvD,
    // The session's close-to-close change, off the SAME adjusted bars as volD.
    // Deliberately not the quote's changePercentage: that is a different clock
    // (a live-ish last price against a prior close) and can round to 0.00 for a
    // whole universe, which reads on screen as "nothing advanced or declined".
    // Volume and direction have to describe the same session or the pairing lies.
    chgD: sig.chgPct != null && Number.isFinite(sig.chgPct) ? +sig.chgPct.toFixed(2) : null,
    pocketPivot: sig.pocketPivot, udVol: sig.udVol, above50: sig.above50, atLow: sig.atLow, asOf: sig.asOf,
    swing: sig.swing,
    ret: periodReturns(sig.closes, chgPct),
    rrg: rrgTail(sig.rsLine),
    spark: sampleSpark(sig.closes),
    ...deriveBuyPoint(sig.closes, px, "signals", sig.stage, sig.off52),
  };
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
// `tf` picks the window the ranking is measured over. "1Y" ranks on ret12m —
// the model's own 12-month definition, and the default — so the classic board is
// unchanged; the shorter windows rank on the precomputed period returns, which
// is what lets the screener re-rank when you change its Δ selector.
export function rsRatings(rows, tf = "1Y") {
  const key = RET_KEY[tf];
  const retOf = (r) => {
    if (!r.sig) return null;
    if (tf === "1Y") return r.sig.ret12m != null ? r.sig.ret12m : (r.sig.ret ? r.sig.ret.y1 : null);
    return r.sig.ret && key && r.sig.ret[key] != null ? r.sig.ret[key] : null;
  };
  const withRet = rows.filter((r) => retOf(r) != null);
  const sorted = [...withRet].sort((a, b) => retOf(a) - retOf(b));
  const map = {};
  sorted.forEach((r, i) => { map[r.tk] = sorted.length > 1 ? Math.round(1 + (i / (sorted.length - 1)) * 98) : 50; });
  return map;
}
