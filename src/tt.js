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

TT.CANSLIM = _BASE.map((s) => {
  const ser = _series(s.tk.split("").reduce((a, c) => a + c.charCodeAt(0) * 31, 7), s.px, s.status);
  const pivot = ser.pivot;
  const pctExt = +(((s.px - pivot) / pivot) * 100).toFixed(1);
  const breakdown = _LEADERS_DEFS(s, s.f);
  const pass = breakdown.filter((b) => b.pass).length;
  const score = Math.min(99, Math.round(
    pass / 7 * 40 + s.rs * 0.35 + Math.min(s.f.epsQ, 150) / 150 * 15 +
    (s.status === "buy" ? 10 : s.status === "ext" ? 3 : 4)));
  const buyLo = pivot, buyHi = +(pivot * 1.05).toFixed(2);
  return { ...s, ...ser, pivot, pctExt, breakdown, pass, score, buyLo, buyHi,
    spark: ser.closes.filter((_, i) => i % 9 === 0).map((c) => c) };
});
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
