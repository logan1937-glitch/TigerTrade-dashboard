/* ============================================================
   TigerTrade — data namespace
   Consolidates the prototype's data.js, detail.js, event-stats.js
   and canslim-data.js into a single exported `TT` object.
   Reference "today" = 2026-06-13. Event/stat data is illustrative
   and deterministic; CANSLIM prices are overlaid live at runtime.
   ============================================================ */

const TT = {};

/* ---------------------------------- categories / severity / stats --------- */
TT.CATEGORIES = [
  { id: "cb",     label: "CB / LIQ",  color: "var(--cat-cb)" },
  { id: "flows",  label: "FLOWS",     color: "var(--cat-flows)" },
  { id: "growth", label: "GROWTH",    color: "var(--cat-growth)" },
  { id: "data",   label: "DATA",      color: "var(--cat-data)" },
  { id: "geo",    label: "GEO / REG", color: "var(--cat-geo)" },
];
TT.CAT_MAP = Object.fromEntries(TT.CATEGORIES.map((c) => [c.id, c]));
TT.SEV = { extreme: 4, high: 3, medium: 2, low: 1 };
TT.DIRECTIONS = [
  { id: "obsidian", label: "Obsidian" },
  { id: "signal",   label: "Signal" },
];

/* sortKey = days from today (negative = past) */
TT.EVENTS = [
  { id: 1,  date: "JUN 16", approx: true,  range: "",        t: -3,  sort: 3,   sev: "high",    cat: "cb",
    title: "Bank of Japan Policy Decision",
    desc: "Carry-trade tripwire. Any unexpected hawkish shift unwinds institutional leverage and triggers rapid global equity liquidations." },
  { id: 2,  date: "JUN 17", approx: false, range: "Jun 16–17", t: -4, sort: 4,  sev: "extreme", cat: "cb",
    title: "FOMC Rate Decision",
    desc: "Statement + presser. Sets the baseline cost of capital — the single largest scheduled driver of cross-asset volatility." },
  { id: 3,  date: "JUN 19", approx: false, range: "",        t: -6,  sort: 6,   sev: "high",    cat: "flows",
    title: "Quadruple Witching",
    desc: "Simultaneous expiry of stock + index options and stock + index futures. Forces massive options-gamma hedging adjustments." },
  { id: 4,  date: "JUN 19", approx: true,  range: "",        t: -6,  sort: 6.1, sev: "high",    cat: "flows",
    title: "S&P 500 Index Rebalance",
    desc: "Quarterly reconstitution effective at the close — passive benchmarks mechanically buy adds and dump deletes." },
  { id: 5,  date: "JUN 26", approx: false, range: "",        t: -13, sort: 13,  sev: "extreme", cat: "flows",
    title: "Russell Index Reconstitution",
    desc: "The largest mechanical rebalance of the year for small/mid-caps. Structural volatility across early-stage growth & speculative momentum tickers." },
  { id: 6,  date: "JUL 1",  approx: true,  range: "",        t: -18, sort: 18,  sev: "medium",  cat: "data",
    title: "ISM Manufacturing PMI",
    desc: "First read on the factory cycle — expansion vs contraction." },
  { id: 7,  date: "JUL 3",  approx: false, range: "",        t: -20, sort: 20,  sev: "high",    cat: "data",
    title: "US Non-Farm Payrolls",
    desc: "Jobs + Unemployment Rate. First Friday of the month — the headline labor gauge." },
  { id: 8,  date: "JUL 3",  approx: true,  range: "",        t: -20, sort: 20.1,sev: "medium",  cat: "data",
    title: "ISM Services PMI",
    desc: "Services-side activity gauge — the larger share of the economy." },
  { id: 9,  date: "JUL 6",  approx: true,  range: "",        t: -23, sort: 23,  sev: "medium",  cat: "geo",
    title: "OPEC+ Production Meeting",
    desc: "Output quotas set the energy-led inflation impulse and the marginal pressure on headline prints." },
  { id: 10, date: "JUL 8",  approx: true,  range: "",        t: -25, sort: 25,  sev: "extreme", cat: "data",
    title: "US CPI",
    desc: "Headline + core inflation. The print most capable of flipping the rate-path narrative." },
  { id: 11, date: "JUL 9",  approx: true,  range: "",        t: -26, sort: 26,  sev: "medium",  cat: "data",
    title: "US PPI",
    desc: "Producer-side inflation; pipeline pressure read ahead of the CPI confirmation." },
  { id: 12, date: "JUL 14", approx: false, range: "",        t: -31, sort: 31,  sev: "high",    cat: "growth",
    title: "Q2 Earnings Season Kickoff",
    desc: "Money-center banks open the season — sets the tone for forward-guidance breadth across the index." },
  { id: 13, date: "JUL 16", approx: false, range: "",        t: -33, sort: 33,  sev: "high",    cat: "cb",
    title: "ECB Rate Decision",
    desc: "Eurozone policy path; EUR cross spills into US rates and global duration positioning." },
  { id: 14, date: "JUL 29", approx: true,  range: "",        t: -46, sort: 46,  sev: "high",    cat: "cb",
    title: "Treasury Quarterly Refunding",
    desc: "Issuance size + maturity mix; a duration-supply shock can reprice the long end intraday." },
  { id: 15, date: "AUG 21", approx: true,  range: "Aug 21–23",range_only:true, t: -69, sort: 69, sev: "high", cat: "cb",
    title: "Jackson Hole Symposium",
    desc: "Policy-framework signaling venue; historically a recurring late-summer volatility catalyst." },
  { id: 16, date: "NOV 3",  approx: false, range: "",        t: -143,sort: 143, sev: "extreme", cat: "geo",
    title: "US Midterm Elections",
    desc: "Control of Congress; fiscal trajectory and the regulatory regime get repriced into year-end." },

  /* past events (revealed via SHOW PAST) */
  { id: 101, date: "MAY 13", approx: false, range: "", t: 31, sort: -31, sev: "extreme", cat: "data", past: true,
    title: "US CPI (April)",
    desc: "Core came in two-tenths hot; front-end sold off and the rate-cut path was pushed out a meeting." },
  { id: 102, date: "MAY 6", approx: false, range: "May 5–6", t: 38, sort: -38, sev: "extreme", cat: "cb", past: true,
    title: "FOMC Rate Decision (May)",
    desc: "Held steady; guidance leaned data-dependent. Realized vol compressed into the blackout window." },
  { id: 103, date: "MAY 2", approx: false, range: "", t: 42, sort: -42, sev: "high", cat: "data", past: true,
    title: "US Non-Farm Payrolls (April)",
    desc: "Cooler headline with a soft revision; risk assets bid on the disinflationary read." },
];

TT.MONTH = { name: "JUNE 2026", year: 2026, monthIndex: 5, firstDow: 1, days: 30, today: 13 };
TT.calEventsByDay = {
  16: [{ t: "BoJ Decision", cat: "cb" }],
  17: [{ t: "FOMC", cat: "cb" }],
  19: [{ t: "Quad Witching", cat: "flows" }, { t: "S&P Rebal", cat: "flows" }],
  26: [{ t: "Russell Recon", cat: "flows" }],
};

/* ---- live date math: recompute T-minus / past from the real current date ----
   The event display strings carry the date; the year is fixed to the template
   year. T-minus, sort and the past flag are derived from today so countdowns
   stay current and roll forward on their own (refreshed each page load). */
const _MONTHNUM = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
const _EVENT_YEAR = 2026;
const _MON_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function _eventDate(ev) {
  const [mon, day] = ev.date.split(" ");
  return new Date(_EVENT_YEAR, _MONTHNUM[mon] ?? 0, parseInt(day, 10) || 1);
}
(function _recomputeTiming() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  TT.EVENTS.forEach((ev) => {
    const frac = ev.sort - Math.trunc(ev.sort);            // keep same-day ordering
    const diff = Math.round((_eventDate(ev) - today) / 86400000);
    ev.t = -diff;                                          // upcoming → negative, past → +days ago
    ev.sort = diff + frac;
    ev.past = diff < 0;
  });
  TT.todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  TT.todayLabel = `${now.getDate()} ${_MON_ABBR[now.getMonth()]} ${now.getFullYear()}`;
  // highlight "today" in the calendar only when the real date is in the shown month
  TT.MONTH.today = (now.getFullYear() === TT.MONTH.year && now.getMonth() === TT.MONTH.monthIndex) ? now.getDate() : 0;
})();

/* stat strip — derived live from the underlying events */
const _byId = Object.fromEntries(TT.EVENTS.map((e) => [e.id, e]));
TT.STATS = [[2, "NEXT FOMC"], [10, "NEXT CPI"], [3, "NEXT WITCHING"], [5, "NEXT RUSSELL"], [16, "US MIDTERMS"]]
  .map(([id, lab]) => { const e = _byId[id]; return {
    lab, val: e.date,
    tm: e.t <= 0 ? `T${e.t}d` : `T+${e.t}d`,
    soon: e.t < 0 && e.t >= -7,
  }; });

/* ---------------------------------- event detail + radar geometry --------- */
TT.DETAIL = {
  1:  { scenario: "A surprise hike or hawkish tweak forces a yen-carry unwind; leveraged long-beta de-risks fast and the move bleeds into global equity.",
        hedge: "Long JPY vol, trim crowded momentum, watch USDJPY 150 as the trip level.", move: 2.1, conviction: 72,
        tickers: ["USDJPY", "NKY", "SOXX"] },
  2:  { scenario: "Dot-plot and presser reset the front end. Any shift in the 2026 cut count whips duration and re-rates growth multiples across the board.",
        hedge: "Cut gross into the blackout; hold convexity via index put spreads.", move: 1.4, conviction: 88,
        tickers: ["SPX", "TLT", "NDX"] },
  3:  { scenario: "Concurrent option and future expiry pins indices into the close, then releases. Dealer gamma flips can amplify the following open.",
        hedge: "Fade the pin post-expiry; size for a 3–4× closing-auction volume spike.", move: 1.0, conviction: 64,
        tickers: ["SPX", "QQQ", "VIX"] },
  4:  { scenario: "Passive AUM mechanically buys index adds and sells deletes at the close — a flow event, not a fundamental one.",
        hedge: "Pre-position the adds basket; avoid chasing into the MOC imbalance.", move: 1.6, conviction: 70,
        tickers: ["SPY", "IVV", "RSP"] },
  5:  { scenario: "The year's largest small/mid-cap rebalance. Float and style migrations drive structural dispersion across momentum names.",
        hedge: "Trade the reconstitution basket; recon-day volume runs 5–8× normal.", move: 2.4, conviction: 81,
        tickers: ["IWM", "IWO", "IJR"] },
  6:  { scenario: "First read on the factory cycle. The 50 line frames the expansion-vs-contraction narrative for cyclicals.",
        hedge: "Cyclical beta is levered to the surprise; gamma is cheap into the print.", move: 0.6, conviction: 52,
        tickers: ["XLI", "CAT", "SPX"] },
  7:  { scenario: "Headline payrolls and the unemployment rate set the labor narrative and the Fed's reaction function for the month.",
        hedge: "Straddle the front end; the 3-month average matters more than the print.", move: 0.9, conviction: 68,
        tickers: ["SPX", "TLT", "DXY"] },
  8:  { scenario: "Services are the larger share of the economy; the prices-paid sub-index is the cleanest forward inflation tell.",
        hedge: "Watch services prices for direct CPI read-through.", move: 0.5, conviction: 50,
        tickers: ["XLY", "SPX"] },
  9:  { scenario: "The production-quota decision sets the energy-led inflation impulse and the marginal pressure on headline prints.",
        hedge: "Express via energy beta and breakevens; crude gamma is the purest play.", move: 3.0, conviction: 58,
        tickers: ["CL", "XLE", "BNO"] },
  10: { scenario: "Core month-over-month is the single print most able to flip the rate-path narrative in either direction.",
        hedge: "Own front-end optionality; size delta down materially into the 8:30 release.", move: 1.3, conviction: 90,
        tickers: ["SPX", "TLT", "DXY"] },
  11: { scenario: "Producer-side pipeline pressure either confirms or fades the CPI read ahead of PCE.",
        hedge: "Trade the CPI–PPI residual into the PCE print.", move: 0.5, conviction: 48,
        tickers: ["SPX", "TIP"] },
  12: { scenario: "Money-center banks open the season and set the tone. Breadth of forward-guidance cuts matters more than any single beat.",
        hedge: "Single-name vol is rich — favor dispersion over outright index.", move: 1.1, conviction: 66,
        tickers: ["XLF", "JPM", "SPX"] },
  13: { scenario: "The euro-area policy path spills into US duration and the dollar via the rate differential.",
        hedge: "EURUSD gamma and the bund–UST spread are the cleanest expressions.", move: 0.7, conviction: 60,
        tickers: ["EURUSD", "BUND", "FXE"] },
  14: { scenario: "Issuance size and coupon/bill mix can deliver a duration-supply shock intraday with little warning.",
        hedge: "Watch the coupon-vs-bill mix; own long-end convexity into the announcement.", move: 0.6, conviction: 55,
        tickers: ["TLT", "ZB", "IEF"] },
  15: { scenario: "A framework-signaling venue that has repeatedly produced late-summer volatility regardless of the calendar.",
        hedge: "Own late-August optionality while it is still cheap.", move: 1.0, conviction: 57,
        tickers: ["SPX", "TLT", "VIX"] },
  16: { scenario: "Control of Congress reprices the fiscal trajectory and the regulatory regime into year-end.",
        hedge: "Trade sector rotation — healthcare, energy, defense — plus broad event vol.", move: 1.8, conviction: 75,
        tickers: ["SPX", "XLV", "ITA"] },
};
TT.DETAIL_FALLBACK = { scenario: "Scheduled catalyst tracked on the radar. Detailed desk briefing pending analyst review.",
  hedge: "Standard pre-event risk reduction applies.", move: 0.8, conviction: 50, tickers: ["SPX"] };
TT.detail = (id) => TT.DETAIL[id] || TT.DETAIL_FALLBACK;

TT.radarPos = (ev, i) => {
  const tdays = Math.abs(ev.t);
  const r = 0.14 + 0.84 * Math.sqrt(Math.min(tdays, 150) / 150);
  const ang = ((i * 137.508) % 360) * (Math.PI / 180);
  return { r, x: Math.cos(ang), y: Math.sin(ang) };
};
TT.RINGS = [
  { t: 7,   label: "7D" },
  { t: 30,  label: "30D" },
  { t: 90,  label: "90D" },
  { t: 150, label: "150D" },
];
TT.ringR = (t) => 0.14 + 0.84 * Math.sqrt(Math.min(t, 150) / 150);

/* ---------------------------------- event historical reaction stats ------- */
// tiny seeded PRNG (mulberry32)
function _rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const _MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function _buildStats(ev, { amp, upBias, volBias, n }) {
  const rnd = _rng(ev.id * 2654435761);
  const instances = [];
  let mIdx = TT.MONTH.monthIndex;
  let year = TT.MONTH.year;
  const stepMonths = ev.cat === "data" || ev.cat === "cb" ? 1 : 3;
  for (let i = 0; i < n; i++) {
    mIdx -= stepMonths;
    while (mIdx < 0) { mIdx += 12; year -= 1; }
    const up = rnd() < upBias;
    const mag = amp * (0.45 + rnd() * 1.25);
    const move = +(up ? mag : -mag).toFixed(2);
    const vix = +((up ? -1 : 1) * volBias * (0.4 + rnd() * 1.3)).toFixed(1);
    const surprise = +((rnd() - 0.5) * amp * 1.4).toFixed(2);
    instances.push({ label: `${_MONTHS[mIdx]} ’${String(year).slice(2)}`, move, vix, surprise });
  }
  const window = [];
  const drift = (upBias - 0.5) * amp * 1.1;
  for (let d = -5; d <= 5; d++) {
    let v;
    if (d < 0) v = drift * 0.12 * (d + 5) / 5 - 0.05 * (-d);
    else v = drift * (1 - Math.exp(-d / 1.6));
    const wob = (rnd() - 0.5) * amp * 0.18;
    window.push({ d, v: +(v + wob).toFixed(2) });
  }
  const cross = [
    { k: "S&P 500", v: +amp.toFixed(1), up: upBias >= 0.5 },
    { k: "10Y UST", v: +(amp * (0.5 + rnd() * 0.4)).toFixed(1), up: upBias < 0.5 },
    { k: "DXY", v: +(amp * (0.3 + rnd() * 0.4)).toFixed(1), up: upBias < 0.5 },
    { k: "Gold", v: +(amp * (0.4 + rnd() * 0.5)).toFixed(1), up: rnd() > 0.5 },
  ];
  const ups = instances.filter((i) => i.move > 0).length;
  const avgAbs = +(instances.reduce((s, i) => s + Math.abs(i.move), 0) / n).toFixed(2);
  const sorted = [...instances].map((i) => i.move).sort((a, b) => a - b);
  const median = +sorted[Math.floor(n / 2)].toFixed(2);
  const maxUp = +Math.max(...instances.map((i) => i.move)).toFixed(2);
  const maxDn = +Math.min(...instances.map((i) => i.move)).toFixed(2);
  const avgVix = +(instances.reduce((s, i) => s + i.vix, 0) / n).toFixed(1);
  return { instances, window, cross,
    summary: { avgAbs, hitUp: Math.round(ups / n * 100), median, maxUp, maxDn, avgVix, n } };
}

const _PARAMS = {
  1:  { amp: 1.6, upBias: 0.42, volBias: 2.6, n: 8 },
  2:  { amp: 1.4, upBias: 0.52, volBias: 2.2, n: 8 },
  3:  { amp: 1.0, upBias: 0.48, volBias: 1.4, n: 8 },
  4:  { amp: 1.1, upBias: 0.55, volBias: 1.0, n: 8 },
  5:  { amp: 2.0, upBias: 0.5,  volBias: 1.8, n: 8 },
  6:  { amp: 0.7, upBias: 0.5,  volBias: 0.8, n: 12 },
  7:  { amp: 1.1, upBias: 0.5,  volBias: 1.6, n: 12 },
  8:  { amp: 0.6, upBias: 0.52, volBias: 0.7, n: 12 },
  9:  { amp: 1.3, upBias: 0.48, volBias: 1.0, n: 8 },
  10: { amp: 1.5, upBias: 0.5,  volBias: 2.4, n: 12 },
  11: { amp: 0.6, upBias: 0.5,  volBias: 0.8, n: 12 },
  12: { amp: 1.2, upBias: 0.55, volBias: 1.2, n: 8 },
  13: { amp: 0.8, upBias: 0.5,  volBias: 1.0, n: 8 },
  14: { amp: 0.7, upBias: 0.5,  volBias: 0.9, n: 8 },
  15: { amp: 1.1, upBias: 0.48, volBias: 1.5, n: 8 },
  16: { amp: 1.7, upBias: 0.5,  volBias: 2.0, n: 6 },
};
TT._statsCache = {};
TT.stats = (ev) => {
  if (TT._statsCache[ev.id]) return TT._statsCache[ev.id];
  const p = _PARAMS[ev.id] || { amp: (TT.detail(ev.id).move || 0.8), upBias: 0.5, volBias: 1.0, n: 8 };
  const s = _buildStats(ev, p);
  TT._statsCache[ev.id] = s;
  return s;
};
TT.WINMONTH = _MONTHS;

/* ---------------------------------- CANSLIM dataset ----------------------- */
function _csrng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function _series(seed, last, status, n = 70) {
  const r = _csrng(seed);
  const closes = [];
  let pivotIdx = Math.floor(n * 0.82);
  let base = status === "ext" ? last * 0.62 : last * 0.78;
  let p = base;
  for (let i = 0; i < n; i++) {
    const prog = i / n;
    let drift;
    if (status === "buy") {
      if (i < n * 0.5) drift = 0.004;
      else if (i < pivotIdx) drift = -0.001 + (r() - 0.5) * 0.004;
      else drift = 0.012;
    } else if (status === "ext") {
      drift = 0.006 + (prog > 0.6 ? 0.004 : 0);
    } else {
      drift = i < n * 0.45 ? 0.003 : (r() - 0.48) * 0.006;
    }
    const vol = (status === "watch" ? 0.018 : 0.013);
    p = p * (1 + drift + (r() - 0.5) * vol);
    closes.push(p);
  }
  const k = last / closes[closes.length - 1];
  const norm = closes.map((c) => +(c * k).toFixed(2));
  const volume = norm.map((c, i) => {
    let base = 0.5 + r() * 0.4;
    if (status !== "watch" && i >= pivotIdx) base = 1.0 + r() * 0.6;
    if (i > 0 && norm[i] > norm[i - 1]) base *= 1.12;
    return +base.toFixed(2);
  });
  const pivot = +(Math.max(...norm.slice(Math.floor(n * 0.45), pivotIdx)) * 1.001).toFixed(2);
  const rsLine = norm.map((c, i) => +(0.4 + 0.6 * Math.pow(i / n, 1.3) + (r() - 0.5) * 0.03).toFixed(3));
  return { closes: norm, volume, pivot, rsLine };
}

const _BASE = [
  { tk: "KGC",  name: "Kinross Gold",       sector: "Materials",     group: "Mining –Gold/Silver",  groupRank: 3,
    px: 34.20, chg: +1.90, rs: 94, status: "buy", mktCap: "42.1B", avgVol: "12.4M",
    f: { epsQ: 78, epsA: 41, salesQ: 33, roe: 19, margin: 28, funds: 61, fundsChg: +112, acc: "A−" },
    baseType: "Cup-with-handle", baseWeeks: 9, baseDepth: 18, why: "Gold leadership; fresh breakout from a 9-week cup on heavy volume.",
    hq: "Toronto, Canada", bio: "Senior gold producer operating mines across the Americas and West Africa. Earnings are geared to the gold price, with rising free cash flow funding buybacks and the dividend." },
  { tk: "AEM",  name: "Agnico Eagle Mines", sector: "Materials",     group: "Mining –Gold/Silver",  groupRank: 3,
    px: 188.00, chg: +1.30, rs: 95, status: "buy", mktCap: "94.0B", avgVol: "3.1M",
    f: { epsQ: 65, epsA: 38, salesQ: 27, roe: 14, margin: 31, funds: 74, fundsChg: +88, acc: "A" },
    baseType: "Flat base", baseWeeks: 6, baseDepth: 12, why: "Group leader clearing a tight flat base; institutional accumulation.",
    hq: "Toronto, Canada", bio: "One of the world's largest gold miners, with low-cost operations across Canada, Australia, Finland and Mexico. Among the most consistent operators in the precious-metals group." },
  { tk: "CRDO", name: "Credo Technology",   sector: "Technology",    group: "Elec –Semiconductor",  groupRank: 1,
    px: 96.20, chg: +3.10, rs: 97, status: "buy", mktCap: "16.2B", avgVol: "6.8M",
    f: { epsQ: 180, epsA: 95, salesQ: 154, roe: 12, margin: 22, funds: 58, fundsChg: +143, acc: "A" },
    baseType: "Cup-with-handle", baseWeeks: 11, baseDepth: 24, why: "Hyperscaler connectivity demand; triple-digit sales growth, RS 97.",
    hq: "San Jose, California", bio: "Designs high-speed connectivity for data centers — SerDes chiplets, active electrical cables and optical DSPs that move AI-cluster traffic. A direct beneficiary of hyperscaler buildouts." },
  { tk: "GEV",  name: "GE Vernova",         sector: "Industrials",   group: "Energy –Power",        groupRank: 2,
    px: 648.00, chg: +0.70, rs: 94, status: "buy", mktCap: "177B", avgVol: "2.4M",
    f: { epsQ: 142, epsA: 60, salesQ: 11, roe: 16, margin: 9, funds: 82, fundsChg: +71, acc: "A−" },
    baseType: "Ascending base", baseWeeks: 13, baseDepth: 16, why: "Electrification + grid capex supercycle; earnings inflection.",
    hq: "Cambridge, Massachusetts", bio: "The power business spun out of GE — gas turbines, grid equipment and onshore/offshore wind. Levered to the global electrification and grid-capex cycle." },
  { tk: "APP",  name: "AppLovin",           sector: "Technology",    group: "Software –Application", groupRank: 4,
    px: 498.00, chg: +1.50, rs: 96, status: "buy", mktCap: "169B", avgVol: "3.6M",
    f: { epsQ: 144, epsA: 130, salesQ: 40, roe: 78, margin: 45, funds: 70, fundsChg: +96, acc: "A" },
    baseType: "Flat base", baseWeeks: 7, baseDepth: 14, why: "AXON ad engine operating leverage; 45% net margin, RS 96.",
    hq: "Palo Alto, California", bio: "Runs a mobile advertising and app-monetization platform powered by its AXON machine-learning engine. Extremely high-margin software model with rapid operating leverage." },
  { tk: "VRT",  name: "Vertiv Holdings",    sector: "Industrials",   group: "Elec –Power/Thermal",  groupRank: 5,
    px: 142.80, chg: +1.40, rs: 92, status: "buy", mktCap: "54.0B", avgVol: "7.2M",
    f: { epsQ: 49, epsA: 71, salesQ: 24, roe: 41, margin: 14, funds: 79, fundsChg: +64, acc: "B+" },
    baseType: "Cup", baseWeeks: 10, baseDepth: 22, why: "Data-center thermal & power pick-and-shovel; backlog accelerating.",
    hq: "Westerville, Ohio", bio: "Supplies the power, cooling and thermal-management infrastructure inside data centers. A pick-and-shovel play on AI compute demand, with an accelerating backlog." },
  { tk: "AVGO", name: "Broadcom",           sector: "Technology",    group: "Elec –Semiconductor",  groupRank: 1,
    px: 1684.00, chg: +1.10, rs: 93, status: "buy", mktCap: "788B", avgVol: "2.9M",
    f: { epsQ: 44, epsA: 38, salesQ: 25, roe: 32, margin: 38, funds: 88, fundsChg: +52, acc: "A−" },
    baseType: "Flat base", baseWeeks: 5, baseDepth: 11, why: "Custom AI silicon + VMware; clearing a 5-week flat base.",
    hq: "Palo Alto, California", bio: "Diversified semiconductor and infrastructure-software maker — networking chips, custom AI accelerators (ASICs) for hyperscalers, and the VMware software franchise." },
  { tk: "NVDA", name: "NVIDIA",             sector: "Technology",    group: "Elec –Semiconductor",  groupRank: 1,
    px: 205.19, chg: +0.16, rs: 96, status: "ext", mktCap: "5.0T", avgVol: "210M",
    f: { epsQ: 88, epsA: 147, salesQ: 69, roe: 115, margin: 56, funds: 91, fundsChg: +33, acc: "B" },
    baseType: "Extended", baseWeeks: 0, baseDepth: 0, why: "Group leader but extended ~18% past last pivot — no low-risk entry.",
    hq: "Santa Clara, California", bio: "Designs the GPUs and accelerated-computing platforms that underpin modern AI training and inference, plus data-center networking and gaming. The clear semiconductor-group leader." },
  { tk: "MRVL", name: "Marvell Technology", sector: "Technology",    group: "Elec –Semiconductor",  groupRank: 1,
    px: 112.30, chg: +2.40, rs: 90, status: "buy", mktCap: "97.0B", avgVol: "14.1M",
    f: { epsQ: 62, epsA: 40, salesQ: 36, roe: 9, margin: 18, funds: 76, fundsChg: +81, acc: "B+" },
    baseType: "Cup-with-handle", baseWeeks: 12, baseDepth: 27, why: "Custom-silicon ramp; reclaiming highs with volume.",
    hq: "Santa Clara, California", bio: "Data-infrastructure semiconductor company spanning custom silicon, optical interconnects and networking. Riding the same custom-AI-silicon ramp as its larger peers." },
  { tk: "PLTR", name: "Palantir",           sector: "Technology",    group: "Software –Database",   groupRank: 6,
    px: 142.10, chg: -0.40, rs: 91, status: "watch", mktCap: "330B", avgVol: "62M",
    f: { epsQ: 100, epsA: 88, salesQ: 39, roe: 11, margin: 27, funds: 64, fundsChg: +18, acc: "C+" },
    baseType: "Forming handle", baseWeeks: 8, baseDepth: 19, why: "Strong fundamentals but late-stage base; awaiting a proper pivot.",
    hq: "Denver, Colorado", bio: "Builds data-analytics and AI software platforms — Gotham, Foundry and AIP — for government and large enterprises. Strong growth, but trades at a rich multiple." },

  { tk: "MSFT", name: "Microsoft",          sector: "Technology",    group: "Software –Infrastructure", groupRank: 2,
    px: 470.00, chg: +0.60, rs: 88, status: "buy", mktCap: "3.5T", avgVol: "20M",
    f: { epsQ: 18, epsA: 20, salesQ: 16, roe: 39, margin: 36, funds: 72, fundsChg: +21, acc: "B+" },
    baseType: "Flat base", baseWeeks: 7, baseDepth: 13, why: "Azure + Copilot monetization; steady institutional accumulation.",
    hq: "Redmond, Washington", bio: "Cloud (Azure), productivity software and Windows — a primary enterprise-AI beneficiary via Copilot and its OpenAI stake." },
  { tk: "META", name: "Meta Platforms",     sector: "Technology",    group: "Internet –Content",    groupRank: 4,
    px: 720.00, chg: +1.10, rs: 90, status: "buy", mktCap: "1.8T", avgVol: "14M",
    f: { epsQ: 36, epsA: 42, salesQ: 22, roe: 36, margin: 38, funds: 75, fundsChg: +44, acc: "A−" },
    baseType: "Cup-with-handle", baseWeeks: 9, baseDepth: 17, why: "Ad reacceleration + AI efficiency; margins expanding.",
    hq: "Menlo Park, California", bio: "Operates Facebook, Instagram, WhatsApp and Reality Labs; advertising engine funding heavy AI and metaverse investment." },
  { tk: "AMZN", name: "Amazon",             sector: "Consumer Cyclical", group: "Internet –Retail",  groupRank: 5,
    px: 215.00, chg: -0.30, rs: 84, status: "watch", mktCap: "2.2T", avgVol: "38M",
    f: { epsQ: 52, epsA: 60, salesQ: 12, roe: 22, margin: 9, funds: 70, fundsChg: +12, acc: "B" },
    baseType: "Consolidation", baseWeeks: 10, baseDepth: 16, why: "AWS margin recovery; retail leverage, but base still forming.",
    hq: "Seattle, Washington", bio: "E-commerce, AWS cloud, advertising and devices; AWS is the profit engine and a core AI-infrastructure provider." },
  { tk: "AMD",  name: "Advanced Micro Devices", sector: "Technology", group: "Elec –Semiconductor", groupRank: 1,
    px: 175.00, chg: +2.10, rs: 89, status: "buy", mktCap: "284B", avgVol: "40M",
    f: { epsQ: 42, epsA: 35, salesQ: 28, roe: 8, margin: 12, funds: 73, fundsChg: +57, acc: "B+" },
    baseType: "Cup", baseWeeks: 11, baseDepth: 25, why: "MI-series AI accelerators gaining share; data-center ramp.",
    hq: "Santa Clara, California", bio: "Designs CPUs (Ryzen/EPYC) and GPUs (Instinct/Radeon); the principal challenger to NVIDIA in AI accelerators." },
  { tk: "TSM",  name: "Taiwan Semiconductor", sector: "Technology",  group: "Elec –Semiconductor",  groupRank: 1,
    px: 205.00, chg: +0.90, rs: 92, status: "ext", mktCap: "1.0T", avgVol: "12M",
    f: { epsQ: 36, epsA: 31, salesQ: 35, roe: 28, margin: 42, funds: 68, fundsChg: +29, acc: "A−" },
    baseType: "Extended", baseWeeks: 0, baseDepth: 0, why: "Leading-edge foundry monopoly; extended after a strong run.",
    hq: "Hsinchu, Taiwan", bio: "The world's largest contract chip manufacturer; fabricates the leading-edge silicon for NVIDIA, Apple, AMD and others." },
  { tk: "NFLX", name: "Netflix",            sector: "Communication Services", group: "Media –Streaming", groupRank: 7,
    px: 1180.00, chg: +0.80, rs: 91, status: "buy", mktCap: "500B", avgVol: "3.5M",
    f: { epsQ: 48, epsA: 55, salesQ: 16, roe: 35, margin: 27, funds: 71, fundsChg: +33, acc: "A−" },
    baseType: "Flat base", baseWeeks: 6, baseDepth: 12, why: "Ad tier + password-sharing monetization; FCF inflection.",
    hq: "Los Gatos, California", bio: "Global streaming leader expanding into ad-supported plans, live events and gaming, with rising free cash flow." },
  { tk: "LLY",  name: "Eli Lilly",          sector: "Healthcare",    group: "Drug –Pharma",         groupRank: 8,
    px: 920.00, chg: +0.40, rs: 90, status: "ext", mktCap: "830B", avgVol: "3.0M",
    f: { epsQ: 62, epsA: 50, salesQ: 36, roe: 58, margin: 24, funds: 80, fundsChg: +41, acc: "A" },
    baseType: "Extended", baseWeeks: 0, baseDepth: 0, why: "GLP-1 franchise (Mounjaro/Zepbound) driving record growth.",
    hq: "Indianapolis, Indiana", bio: "Pharmaceutical leader in diabetes and obesity (incretin drugs), oncology and immunology; the dominant GLP-1 player alongside Novo." },
  { tk: "COST", name: "Costco Wholesale",   sector: "Consumer Defensive", group: "Retail –Discount", groupRank: 9,
    px: 1020.00, chg: +0.20, rs: 87, status: "buy", mktCap: "452B", avgVol: "2.1M",
    f: { epsQ: 13, epsA: 14, salesQ: 9, roe: 31, margin: 3, funds: 69, fundsChg: +9, acc: "B+" },
    baseType: "Flat base", baseWeeks: 8, baseDepth: 10, why: "Membership compounder; defensive leadership with steady accumulation.",
    hq: "Issaquah, Washington", bio: "Membership warehouse retailer with durable pricing power, high renewal rates and a recurring high-margin membership fee stream." },
  { tk: "ANET", name: "Arista Networks",    sector: "Technology",    group: "Elec –Networking",     groupRank: 10,
    px: 110.00, chg: +1.60, rs: 93, status: "buy", mktCap: "138B", avgVol: "5.0M",
    f: { epsQ: 30, epsA: 34, salesQ: 20, roe: 33, margin: 41, funds: 74, fundsChg: +48, acc: "A" },
    baseType: "Cup-with-handle", baseWeeks: 10, baseDepth: 19, why: "AI back-end networking (Ethernet) share gains; high margins.",
    hq: "Santa Clara, California", bio: "High-speed data-center networking (switches/routers and EOS software); a key supplier of AI-cluster Ethernet fabric to hyperscalers." },
  { tk: "CRWD", name: "CrowdStrike",        sector: "Technology",    group: "Software –Security",   groupRank: 11,
    px: 470.00, chg: +1.30, rs: 92, status: "buy", mktCap: "116B", avgVol: "4.5M",
    f: { epsQ: 40, epsA: 70, salesQ: 28, roe: 16, margin: 22, funds: 72, fundsChg: +52, acc: "A−" },
    baseType: "Cup", baseWeeks: 12, baseDepth: 23, why: "Falcon platform consolidation; module attach + ARR growth.",
    hq: "Austin, Texas", bio: "Cloud-native endpoint and cloud security on the Falcon platform; expanding into SIEM and identity, with high net-retention." },

  { tk: "GOOGL", name: "Alphabet",          sector: "Communication Services", group: "Internet –Content", groupRank: 4,
    px: 185.00, chg: +0.50, rs: 85, status: "buy", mktCap: "2.3T", avgVol: "28M",
    f: { epsQ: 30, epsA: 28, salesQ: 14, roe: 31, margin: 28, funds: 70, fundsChg: +17, acc: "B+" },
    baseType: "Flat base", baseWeeks: 8, baseDepth: 14, why: "Search resilience + Gemini + Cloud margin; reasonable valuation.",
    hq: "Mountain View, California", bio: "Google Search, YouTube, Android and Google Cloud, plus the Gemini AI models and Waymo; advertising funds broad AI investment." },
  { tk: "AAPL", name: "Apple",              sector: "Technology",    group: "Consumer Electronics", groupRank: 12,
    px: 228.00, chg: -0.20, rs: 78, status: "watch", mktCap: "3.4T", avgVol: "45M",
    f: { epsQ: 10, epsA: 9, salesQ: 5, roe: 150, margin: 25, funds: 66, fundsChg: -4, acc: "C" },
    baseType: "Late base", baseWeeks: 14, baseDepth: 15, why: "Slow growth and lagging RS; awaiting an AI-cycle catalyst.",
    hq: "Cupertino, California", bio: "iPhone, Mac, Wearables and a high-margin Services franchise; enormous installed base but decelerating hardware growth." },
  { tk: "TSLA", name: "Tesla",              sector: "Consumer Cyclical", group: "Auto –Manufacturers", groupRank: 13,
    px: 340.00, chg: -1.10, rs: 72, status: "watch", mktCap: "1.1T", avgVol: "90M",
    f: { epsQ: -8, epsA: 5, salesQ: 2, roe: 11, margin: 8, funds: 58, fundsChg: -12, acc: "C−" },
    baseType: "Wide/loose", baseWeeks: 16, baseDepth: 34, why: "Margin pressure and erratic action; story stock, not a clean setup.",
    hq: "Austin, Texas", bio: "EV maker plus energy storage, full self-driving software and the Optimus robot; valuation hinges on autonomy and AI optionality." },
  { tk: "UBER", name: "Uber Technologies",  sector: "Technology",    group: "Software –Application", groupRank: 4,
    px: 82.00, chg: +1.40, rs: 86, status: "buy", mktCap: "172B", avgVol: "18M",
    f: { epsQ: 60, epsA: 80, salesQ: 18, roe: 22, margin: 10, funds: 73, fundsChg: +38, acc: "B+" },
    baseType: "Cup-with-handle", baseWeeks: 10, baseDepth: 20, why: "Mobility + delivery profitability inflection; FCF compounding.",
    hq: "San Francisco, California", bio: "Global ride-hailing and delivery marketplace now generating real free cash flow; an autonomy partner rather than builder." },
  { tk: "NOW",  name: "ServiceNow",         sector: "Technology",    group: "Software –Application", groupRank: 4,
    px: 1000.00, chg: +0.90, rs: 88, status: "buy", mktCap: "205B", avgVol: "1.8M",
    f: { epsQ: 32, epsA: 30, salesQ: 22, roe: 30, margin: 28, funds: 76, fundsChg: +34, acc: "A−" },
    baseType: "Flat base", baseWeeks: 7, baseDepth: 13, why: "Enterprise workflow platform; AI (Now Assist) lifting deal sizes.",
    hq: "Santa Clara, California", bio: "Enterprise workflow-automation platform (IT, HR, customer ops) embedding generative AI across its suite; durable subscription growth." },
  { tk: "ORCL", name: "Oracle",             sector: "Technology",    group: "Software –Infrastructure", groupRank: 2,
    px: 195.00, chg: +1.70, rs: 87, status: "buy", mktCap: "540B", avgVol: "9M",
    f: { epsQ: 22, epsA: 18, salesQ: 12, roe: 60, margin: 27, funds: 67, fundsChg: +40, acc: "B+" },
    baseType: "Cup", baseWeeks: 9, baseDepth: 18, why: "OCI cloud + AI-training capacity backlog; RPO surging.",
    hq: "Austin, Texas", bio: "Database and enterprise software pivoting hard into cloud infrastructure (OCI), a fast-growing host for AI-training workloads." },
  { tk: "PANW", name: "Palo Alto Networks", sector: "Technology",    group: "Software –Security",   groupRank: 11,
    px: 200.00, chg: +1.00, rs: 89, status: "buy", mktCap: "130B", avgVol: "6M",
    f: { epsQ: 28, epsA: 45, salesQ: 15, roe: 24, margin: 21, funds: 74, fundsChg: +36, acc: "A−" },
    baseType: "Flat base", baseWeeks: 8, baseDepth: 16, why: "Platformization strategy driving consolidation wins; ARR growth.",
    hq: "Santa Clara, California", bio: "Cybersecurity leader across network, cloud and security operations, pushing customers onto integrated 'platformized' deals." },
  { tk: "JPM",  name: "JPMorgan Chase",     sector: "Financials",    group: "Banks –Money Center",  groupRank: 14,
    px: 290.00, chg: +0.30, rs: 83, status: "buy", mktCap: "810B", avgVol: "9M",
    f: { epsQ: 12, epsA: 15, salesQ: 8, roe: 17, margin: 35, funds: 71, fundsChg: +14, acc: "B+" },
    baseType: "Flat base", baseWeeks: 9, baseDepth: 12, why: "Best-in-class bank; net-interest income + trading strength.",
    hq: "New York, New York", bio: "The largest US bank — consumer, commercial, investment banking and asset management; a bellwether for credit and the economy." },
  { tk: "V",    name: "Visa",               sector: "Financials",    group: "Credit Services",      groupRank: 15,
    px: 360.00, chg: +0.40, rs: 82, status: "buy", mktCap: "700B", avgVol: "6M",
    f: { epsQ: 14, epsA: 16, salesQ: 10, roe: 51, margin: 54, funds: 72, fundsChg: +11, acc: "B+" },
    baseType: "Flat base", baseWeeks: 8, baseDepth: 11, why: "Payments toll-road; secular cash-to-card with elite margins.",
    hq: "San Francisco, California", bio: "Operates the world's largest card-payment network, earning fees on global transaction volume with very high incremental margins." },

  { tk: "AXON", name: "Axon Enterprise",     sector: "Industrials",   group: "Aerospace –Defense",   groupRank: 16,
    px: 690.00, chg: +1.40, rs: 94, status: "buy", mktCap: "52B", avgVol: "1.2M",
    f: { epsQ: 40, epsA: 45, salesQ: 31, roe: 18, margin: 16, funds: 73, fundsChg: +46, acc: "A" },
    baseType: "Cup-with-handle", baseWeeks: 9, baseDepth: 18, why: "TASER + body-cam + cloud software flywheel; recurring ARR.",
    hq: "Scottsdale, Arizona", bio: "Public-safety technology — TASER devices, body cameras and the Axon Evidence cloud — with a fast-growing software and services base." },
  { tk: "CEG",  name: "Constellation Energy", sector: "Utilities",    group: "Utility –Electric Power", groupRank: 2,
    px: 290.00, chg: +1.10, rs: 90, status: "buy", mktCap: "92B", avgVol: "3.5M",
    f: { epsQ: 35, epsA: 30, salesQ: 8, roe: 22, margin: 14, funds: 78, fundsChg: +52, acc: "A−" },
    baseType: "Flat base", baseWeeks: 7, baseDepth: 14, why: "Largest US nuclear fleet; AI-datacenter power-demand tailwind.",
    hq: "Baltimore, Maryland", bio: "The largest US producer of carbon-free (nuclear) power, increasingly contracting capacity directly to hyperscaler data centers." },
  { tk: "VST",  name: "Vistra",             sector: "Utilities",     group: "Utility –Electric Power", groupRank: 2,
    px: 175.00, chg: +0.80, rs: 91, status: "ext", mktCap: "60B", avgVol: "6M",
    f: { epsQ: 55, epsA: 40, salesQ: 12, roe: 30, margin: 16, funds: 75, fundsChg: +48, acc: "A−" },
    baseType: "Extended", baseWeeks: 0, baseDepth: 0, why: "Power + nuclear leverage to load growth; extended after a big run.",
    hq: "Irving, Texas", bio: "Integrated power generator and retailer with a large nuclear and gas fleet; a primary beneficiary of rising electricity demand." },
  { tk: "MU",   name: "Micron Technology",  sector: "Technology",    group: "Elec –Semiconductor",  groupRank: 1,
    px: 130.00, chg: +2.30, rs: 86, status: "buy", mktCap: "144B", avgVol: "22M",
    f: { epsQ: 90, epsA: 40, salesQ: 60, roe: 14, margin: 20, funds: 70, fundsChg: +44, acc: "B+" },
    baseType: "Cup", baseWeeks: 12, baseDepth: 26, why: "HBM memory for AI accelerators; cycle upturn + pricing.",
    hq: "Boise, Idaho", bio: "Leading maker of DRAM and NAND memory; high-bandwidth memory (HBM) for AI GPUs is a key growth driver through the cycle." },
  { tk: "LRCX", name: "Lam Research",        sector: "Technology",    group: "Elec –Semiconductor Equip", groupRank: 3,
    px: 95.00, chg: +1.20, rs: 85, status: "buy", mktCap: "120B", avgVol: "9M",
    f: { epsQ: 25, epsA: 22, salesQ: 19, roe: 50, margin: 27, funds: 71, fundsChg: +28, acc: "B+" },
    baseType: "Flat base", baseWeeks: 6, baseDepth: 13, why: "Etch/deposition leader; leverage to leading-edge + HBM capex.",
    hq: "Fremont, California", bio: "Wafer-fabrication equipment (etch and deposition) essential to advanced logic and memory manufacturing." },
  { tk: "KLAC", name: "KLA Corp",           sector: "Technology",    group: "Elec –Semiconductor Equip", groupRank: 3,
    px: 850.00, chg: +0.90, rs: 87, status: "buy", mktCap: "113B", avgVol: "1.3M",
    f: { epsQ: 28, epsA: 24, salesQ: 20, roe: 90, margin: 38, funds: 73, fundsChg: +31, acc: "A−" },
    baseType: "Cup-with-handle", baseWeeks: 10, baseDepth: 19, why: "Process-control monopoly; rising complexity = more inspection.",
    hq: "Milpitas, California", bio: "Dominant supplier of semiconductor process-control and inspection systems; benefits as chip complexity rises." },
  { tk: "ASML", name: "ASML Holding",       sector: "Technology",    group: "Elec –Semiconductor Equip", groupRank: 3,
    px: 880.00, chg: -0.40, rs: 80, status: "watch", mktCap: "350B", avgVol: "1.6M",
    f: { epsQ: 8, epsA: 15, salesQ: 5, roe: 55, margin: 28, funds: 69, fundsChg: +6, acc: "B" },
    baseType: "Consolidation", baseWeeks: 13, baseDepth: 22, why: "EUV monopoly but lumpy orders; basing after digestion.",
    hq: "Veldhoven, Netherlands", bio: "The sole maker of EUV lithography systems required for leading-edge chips — a structural chokepoint in the supply chain." },
  { tk: "DELL", name: "Dell Technologies",  sector: "Technology",    group: "Computer –Hardware",   groupRank: 17,
    px: 130.00, chg: +1.60, rs: 84, status: "buy", mktCap: "92B", avgVol: "8M",
    f: { epsQ: 22, epsA: 18, salesQ: 10, roe: 120, margin: 5, funds: 68, fundsChg: +33, acc: "B+" },
    baseType: "Cup", baseWeeks: 11, baseDepth: 24, why: "AI-server backlog (ISG) ramping; storage stabilizing.",
    hq: "Round Rock, Texas", bio: "PCs, servers and storage; its AI-server business (Infrastructure Solutions Group) is the growth engine into hyperscaler and enterprise demand." },
  { tk: "SHOP", name: "Shopify",            sector: "Technology",    group: "Internet –Retail",     groupRank: 5,
    px: 110.00, chg: +1.30, rs: 88, status: "buy", mktCap: "142B", avgVol: "11M",
    f: { epsQ: 50, epsA: 60, salesQ: 25, roe: 14, margin: 16, funds: 71, fundsChg: +37, acc: "B+" },
    baseType: "Cup-with-handle", baseWeeks: 10, baseDepth: 21, why: "Commerce platform; take-rate + payments + profitability turn.",
    hq: "Ottawa, Canada", bio: "E-commerce software powering merchants of all sizes, monetizing via subscriptions and a fast-growing payments/fulfillment layer." },
  { tk: "NET",  name: "Cloudflare",         sector: "Technology",    group: "Software –Infrastructure", groupRank: 2,
    px: 110.00, chg: +1.80, rs: 89, status: "buy", mktCap: "38B", avgVol: "4M",
    f: { epsQ: 45, epsA: 70, salesQ: 28, roe: 9, margin: 11, funds: 70, fundsChg: +41, acc: "A−" },
    baseType: "Cup", baseWeeks: 12, baseDepth: 25, why: "Edge network + Workers + AI inference at the edge; ARR scaling.",
    hq: "San Francisco, California", bio: "Global edge network for security, performance and serverless compute (Workers), increasingly positioned for edge AI inference." },
  { tk: "DDOG", name: "Datadog",            sector: "Technology",    group: "Software –Application", groupRank: 4,
    px: 140.00, chg: +1.10, rs: 85, status: "buy", mktCap: "48B", avgVol: "4.5M",
    f: { epsQ: 35, epsA: 50, salesQ: 25, roe: 12, margin: 18, funds: 72, fundsChg: +33, acc: "B+" },
    baseType: "Flat base", baseWeeks: 7, baseDepth: 15, why: "Observability platform; usage growth + AI-monitoring attach.",
    hq: "New York, New York", bio: "Cloud observability and monitoring platform; consumption model benefits as customers' cloud and AI workloads grow." },
  { tk: "SNOW", name: "Snowflake",          sector: "Technology",    group: "Software –Database",    groupRank: 6,
    px: 175.00, chg: -0.30, rs: 76, status: "watch", mktCap: "58B", avgVol: "6M",
    f: { epsQ: 20, epsA: 30, salesQ: 28, roe: 5, margin: 8, funds: 64, fundsChg: +9, acc: "C+" },
    baseType: "Late base", baseWeeks: 14, baseDepth: 28, why: "Strong data platform but lagging RS; awaiting a clean pivot.",
    hq: "Bozeman, Montana", bio: "Cloud data warehouse/lakehouse with a consumption model; pushing into AI/ML (Cortex) atop customers' governed data." },
  { tk: "ABNB", name: "Airbnb",             sector: "Consumer Cyclical", group: "Travel –Leisure",  groupRank: 18,
    px: 135.00, chg: -0.40, rs: 74, status: "watch", mktCap: "85B", avgVol: "5M",
    f: { epsQ: 10, epsA: 20, salesQ: 11, roe: 35, margin: 24, funds: 65, fundsChg: -3, acc: "C" },
    baseType: "Consolidation", baseWeeks: 15, baseDepth: 24, why: "FCF-rich but decelerating; rangebound, lagging the market.",
    hq: "San Francisco, California", bio: "Global short-term rental marketplace with strong free cash flow; growth is maturing as it expands into experiences and services." },
  { tk: "BKNG", name: "Booking Holdings",   sector: "Consumer Cyclical", group: "Travel –Leisure",  groupRank: 18,
    px: 5200.00, chg: +0.50, rs: 86, status: "buy", mktCap: "175B", avgVol: "0.3M",
    f: { epsQ: 18, epsA: 22, salesQ: 12, roe: 120, margin: 28, funds: 74, fundsChg: +18, acc: "B+" },
    baseType: "Flat base", baseWeeks: 8, baseDepth: 13, why: "Travel-demand compounder; buybacks + connected-trip strategy.",
    hq: "Norwalk, Connecticut", bio: "The largest online travel agency (Booking.com, Priceline, Kayak), with high margins and aggressive share buybacks." },
  { tk: "MELI", name: "MercadoLibre",       sector: "Consumer Cyclical", group: "Internet –Retail", groupRank: 5,
    px: 2200.00, chg: +1.20, rs: 90, status: "buy", mktCap: "112B", avgVol: "0.5M",
    f: { epsQ: 70, epsA: 80, salesQ: 35, roe: 40, margin: 10, funds: 73, fundsChg: +40, acc: "A−" },
    baseType: "Cup-with-handle", baseWeeks: 10, baseDepth: 20, why: "Latam e-commerce + fintech (Mercado Pago) flywheel.",
    hq: "Buenos Aires, Argentina", bio: "Latin America's leading e-commerce and fintech platform — marketplace, payments (Mercado Pago), credit and logistics." },
  { tk: "COIN", name: "Coinbase Global",    sector: "Financials",    group: "Capital Markets",      groupRank: 19,
    px: 320.00, chg: +2.80, rs: 88, status: "ext", mktCap: "80B", avgVol: "10M",
    f: { epsQ: 100, epsA: 120, salesQ: 65, roe: 28, margin: 30, funds: 66, fundsChg: +35, acc: "B" },
    baseType: "Extended", baseWeeks: 0, baseDepth: 0, why: "Crypto-cycle leverage; volatile, currently extended.",
    hq: "Remote (US)", bio: "Largest US crypto exchange; revenue is highly leveraged to trading volumes and crypto prices, with growing subscription/custody income." },
  { tk: "HOOD", name: "Robinhood Markets",  sector: "Financials",    group: "Capital Markets",      groupRank: 19,
    px: 75.00, chg: +3.10, rs: 92, status: "buy", mktCap: "66B", avgVol: "30M",
    f: { epsQ: 110, epsA: 140, salesQ: 50, roe: 20, margin: 48, funds: 64, fundsChg: +55, acc: "A−" },
    baseType: "Cup", baseWeeks: 9, baseDepth: 22, why: "Retail-brokerage operating leverage; new products + crypto.",
    hq: "Menlo Park, California", bio: "Commission-free brokerage and crypto app expanding into retirement, futures and prediction markets; high incremental margins." },
  { tk: "AXP",  name: "American Express",    sector: "Financials",    group: "Credit Services",      groupRank: 15,
    px: 310.00, chg: +0.40, rs: 84, status: "buy", mktCap: "220B", avgVol: "3M",
    f: { epsQ: 16, epsA: 18, salesQ: 9, roe: 33, margin: 18, funds: 72, fundsChg: +13, acc: "B+" },
    baseType: "Flat base", baseWeeks: 8, baseDepth: 12, why: "Premium-spend franchise; affluent cardholder resilience.",
    hq: "New York, New York", bio: "Premium card network and lender focused on affluent consumers and businesses; earns on spend, fees and lending." },
  { tk: "MA",   name: "Mastercard",         sector: "Financials",    group: "Credit Services",      groupRank: 15,
    px: 560.00, chg: +0.30, rs: 83, status: "buy", mktCap: "510B", avgVol: "2.5M",
    f: { epsQ: 17, epsA: 18, salesQ: 11, roe: 175, margin: 45, funds: 73, fundsChg: +12, acc: "B+" },
    baseType: "Flat base", baseWeeks: 7, baseDepth: 11, why: "Payments duopoly; secular volume growth, elite margins.",
    hq: "Purchase, New York", bio: "Global card-payments network (with Visa, a duopoly), monetizing transaction volume plus a growing value-added-services arm." },
  { tk: "ISRG", name: "Intuitive Surgical", sector: "Healthcare",    group: "Medical –Systems",     groupRank: 20,
    px: 560.00, chg: +0.70, rs: 87, status: "buy", mktCap: "200B", avgVol: "1.8M",
    f: { epsQ: 25, epsA: 22, salesQ: 17, roe: 18, margin: 28, funds: 76, fundsChg: +24, acc: "A−" },
    baseType: "Cup-with-handle", baseWeeks: 9, baseDepth: 17, why: "da Vinci installed base + recurring instruments; new platform.",
    hq: "Sunnyvale, California", bio: "Robotic surgery leader (da Vinci); a razor/blade model where placed systems drive recurring instrument and service revenue." },
  { tk: "CAT",  name: "Caterpillar",        sector: "Industrials",   group: "Machinery –Const/Mining", groupRank: 21,
    px: 400.00, chg: +0.60, rs: 82, status: "buy", mktCap: "190B", avgVol: "3M",
    f: { epsQ: 10, epsA: 14, salesQ: 4, roe: 55, margin: 17, funds: 70, fundsChg: +15, acc: "B" },
    baseType: "Flat base", baseWeeks: 9, baseDepth: 13, why: "Infrastructure + energy capex; pricing power, buybacks.",
    hq: "Irving, Texas", bio: "World's largest construction and mining-equipment maker; a cyclical bellwether levered to infrastructure and energy capex." },
];

/* The TigerTrade Leadership Model — a 7-factor relative-strength growth
   framework. Our own naming/acronym (LEADERS); the underlying factors follow
   classic leadership-investing principles popularized by William J. O'Neil.
   Independent and not affiliated with or endorsed by Investor's Business Daily;
   "CAN SLIM" is a registered trademark of Investor's Business Daily, Inc. */
const _LEADERS_DEFS = (s, f) => [
  { key: "f1", letter: "L", name: "Leadership (RS)", value: `RS ${s.rs} · grp #${s.groupRank}`, pass: s.rs >= 85,
    note: "Relative-strength rank vs the market — favor leaders (RS ≥ 85) in leading groups." },
  { key: "f2", letter: "E", name: "Earnings momentum", value: `+${f.epsQ}% EPS QoQ`, pass: f.epsQ >= 25,
    note: "Latest-quarter EPS growth vs a year ago; we want ≥ 25%." },
  { key: "f3", letter: "A", name: "Accumulation", value: `Vol +${40 + (s.tk.charCodeAt(0) % 40)}% on break`, pass: s.status !== "watch",
    note: "Demand confirmed by above-average volume on up days; manageable float." },
  { key: "f4", letter: "D", name: "Durable growth", value: `+${f.epsA}% / 3-yr`, pass: f.epsA >= 25,
    note: "Multi-year annual EPS growth and consistency; ROE ≥ 17%." },
  { key: "f5", letter: "E", name: "Emerging breakout", value: s.status === "watch" ? "Near new high" : "New 52-wk high", pass: s.status !== "watch",
    note: "Price breaking to a new high out of a sound base, on a fresh catalyst." },
  { key: "f6", letter: "R", name: "Rising sponsorship", value: `${f.funds}% held · funds ${f.fundsChg > 0 ? "+" : ""}${f.fundsChg}`, pass: f.fundsChg > 0,
    note: "Increasing institutional ownership and improving accumulation/distribution." },
  { key: "f7", letter: "S", name: "Setup — market", value: "Confirmed uptrend", pass: true,
    note: "Buy only when the general market is in a confirmed uptrend." },
];

// fully-covered names: editorial fundamentals + LEADERS scorecard + buy-point base
function _buildFull(s) {
  const ser = _series(s.tk.split("").reduce((a, c) => a + c.charCodeAt(0) * 31, 7), s.px, s.status);
  const pivot = ser.pivot;
  const pctExt = +(((s.px - pivot) / pivot) * 100).toFixed(1);
  const breakdown = _LEADERS_DEFS(s, s.f);
  const pass = breakdown.filter((b) => b.pass).length;
  const score = Math.min(99, Math.round(
    pass / 7 * 40 + s.rs * 0.35 + Math.min(s.f.epsQ, 150) / 150 * 15 +
    (s.status === "buy" ? 10 : s.status === "ext" ? 3 : 4)));
  const buyLo = pivot, buyHi = +(pivot * 1.05).toFixed(2);
  return { ...s, ...ser, coverage: "full", pivot, pctExt, breakdown, pass, score, buyLo, buyHi,
    spark: ser.closes.filter((_, i) => i % 9 === 0).map((c) => c) };
}

// Extended universe — lightweight (symbol · name · sector · group only). No
// fabricated fundamentals: these names are ranked purely on real momentum
// signals (price, RS, stage, breakout) computed from live EOD history at runtime.
const _EXTENDED = [
  ["FTNT", "Fortinet", "Technology", "Software –Security"],
  ["ZS", "Zscaler", "Technology", "Software –Security"],
  ["OKTA", "Okta", "Technology", "Software –Security"],
  ["WDAY", "Workday", "Technology", "Software –Application"],
  ["ADBE", "Adobe", "Technology", "Software –Application"],
  ["INTU", "Intuit", "Technology", "Software –Application"],
  ["CRM", "Salesforce", "Technology", "Software –Application"],
  ["PYPL", "PayPal", "Financials", "Software –Infrastructure"],
  ["SQ", "Block", "Financials", "Software –Infrastructure"],
  ["AFRM", "Affirm", "Financials", "Software –Infrastructure"],
  ["QCOM", "Qualcomm", "Technology", "Elec –Semiconductor"],
  ["TXN", "Texas Instruments", "Technology", "Elec –Semiconductor"],
  ["ADI", "Analog Devices", "Technology", "Elec –Semiconductor"],
  ["NXPI", "NXP Semiconductors", "Technology", "Elec –Semiconductor"],
  ["ON", "ON Semiconductor", "Technology", "Elec –Semiconductor"],
  ["INTC", "Intel", "Technology", "Elec –Semiconductor"],
  ["ARM", "Arm Holdings", "Technology", "Elec –Semiconductor"],
  ["SMCI", "Super Micro Computer", "Technology", "Computer –Hardware"],
  ["GS", "Goldman Sachs", "Financials", "Banks –Money Center"],
  ["MS", "Morgan Stanley", "Financials", "Banks –Money Center"],
  ["C", "Citigroup", "Financials", "Banks –Money Center"],
  ["BAC", "Bank of America", "Financials", "Banks –Money Center"],
  ["WFC", "Wells Fargo", "Financials", "Banks –Money Center"],
  ["SCHW", "Charles Schwab", "Financials", "Capital Markets"],
  ["BLK", "BlackRock", "Financials", "Asset Management"],
  ["SPGI", "S&P Global", "Financials", "Capital Markets"],
  ["ICE", "Intercontinental Exchange", "Financials", "Capital Markets"],
  ["REGN", "Regeneron", "Healthcare", "Drug –Biotech"],
  ["VRTX", "Vertex Pharma", "Healthcare", "Drug –Biotech"],
  ["AMGN", "Amgen", "Healthcare", "Drug –Biotech"],
  ["MRK", "Merck", "Healthcare", "Drug –Pharma"],
  ["ABBV", "AbbVie", "Healthcare", "Drug –Pharma"],
  ["UNH", "UnitedHealth", "Healthcare", "Medical –Managed Care"],
  ["TMO", "Thermo Fisher", "Healthcare", "Medical –Products"],
  ["SYK", "Stryker", "Healthcare", "Medical –Systems"],
  ["BSX", "Boston Scientific", "Healthcare", "Medical –Systems"],
  ["NKE", "Nike", "Consumer Cyclical", "Apparel –Shoes"],
  ["SBUX", "Starbucks", "Consumer Cyclical", "Retail –Restaurants"],
  ["MCD", "McDonald's", "Consumer Cyclical", "Retail –Restaurants"],
  ["CMG", "Chipotle", "Consumer Cyclical", "Retail –Restaurants"],
  ["LULU", "Lululemon", "Consumer Cyclical", "Apparel –Clothing"],
  ["NU", "Nu Holdings", "Financials", "Banks –Foreign"],
  ["DASH", "DoorDash", "Consumer Cyclical", "Internet –Retail"],
  ["SPOT", "Spotify", "Communication Services", "Media –Streaming"],
  ["RBLX", "Roblox", "Communication Services", "Software –Gaming"],
  ["DKNG", "DraftKings", "Consumer Cyclical", "Gambling –Online"],
  ["BA", "Boeing", "Industrials", "Aerospace –Defense"],
  ["LMT", "Lockheed Martin", "Industrials", "Aerospace –Defense"],
  ["GD", "General Dynamics", "Industrials", "Aerospace –Defense"],
  ["HON", "Honeywell", "Industrials", "Diversified –Industrial"],
  ["ETN", "Eaton", "Industrials", "Elec –Power/Thermal"],
  ["UNP", "Union Pacific", "Industrials", "Transport –Rail"],
  ["FDX", "FedEx", "Industrials", "Transport –Logistics"],
  ["LIN", "Linde", "Materials", "Chemicals –Specialty"],
  ["FCX", "Freeport-McMoRan", "Materials", "Mining –Copper"],
  ["NEM", "Newmont", "Materials", "Mining –Gold/Silver"],
  ["XOM", "Exxon Mobil", "Energy", "Oil –Integrated"],
  ["CVX", "Chevron", "Energy", "Oil –Integrated"],
  ["COP", "ConocoPhillips", "Energy", "Oil –E&P"],
  ["SLB", "Schlumberger", "Energy", "Oil –Services"],
].map(([tk, name, sector, group]) => ({ tk, name, sector, group }));

// signals-only names: no fundamentals; real momentum signals fill in at runtime
function _buildSignals(s) {
  return {
    ...s, coverage: "signals", groupRank: null, rs: null, status: null, px: null, chg: null,
    f: null, breakdown: [], pass: 0, score: 0, pivot: null, buyLo: null, buyHi: null, pctExt: null,
    closes: [], volume: [], rsLine: [], spark: [],
    baseType: null, baseWeeks: 0, baseDepth: 0, why: null, bio: null, hq: null, mktCap: null, avgVol: null,
  };
}

TT.CANSLIM = [..._BASE.map(_buildFull), ..._EXTENDED.map(_buildSignals)];
TT.CS_BYTICKER = Object.fromEntries(TT.CANSLIM.map((s) => [s.tk, s]));

TT.MKT = {
  trend: "Confirmed Uptrend",
  trendNote: "Buying permitted. Indexes above rising 21-day & 50-day lines.",
  distDays: 3, distMax: 6,
  lastFTD: "May 1",
  indexes: [
    { k: "S&P 500", v: "5,431", chg: +0.42, above50: true, above200: true },
    { k: "Nasdaq", v: "17,688", chg: +0.61, above50: true, above200: true },
    { k: "Russell 2000", v: "2,084", chg: -0.18, above50: true, above200: false },
    { k: "Dow", v: "39,512", chg: +0.27, above50: true, above200: true },
  ],
  breadth: { newHighs: 184, newLows: 41, advDec: +1.8, pctAbove50: 64, upVolPct: 71 },
  ftdSeries: [42, 43, 41, 40, 42, 45, 44, 46, 47, 46, 48, 49, 51, 50, 52, 54, 53, 55],
};

export { TT };
