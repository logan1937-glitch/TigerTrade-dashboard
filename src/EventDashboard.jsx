import { useState, useEffect, useMemo, useRef } from "react";

const GOOGLE_FONT = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap";

// ── taxonomy ─────────────────────────────────────────────────────────────────
const CATEGORIES = {
  central: { label: "Central Bank & Sovereign Liquidity", short: "CB / LIQ",  color: "#2563eb", desc: "Sets the baseline cost of capital. Momentum assets are hyper-sensitive to sudden shifts in global yields or liquidity contractions." },
  flows:   { label: "Mechanical Flow Rebalancing",        short: "FLOWS",     color: "#7c3aed", desc: "Forced execution by passive funds and options dealers. Fundamentals-agnostic, but drives massive volume and intraday VIX spikes." },
  growth:  { label: "Growth & Tech-Thematic Catalysts",   short: "GROWTH",    color: "#0d9488", desc: "Launching pads for narrative-driven capital. Routinely trigger violent sector rotations and momentum manias." },
  data:    { label: "High-Impact Macro Data",             short: "DATA",      color: "#d97706", desc: "Scheduled monthly prints that can flip the macro regime from Soft-Landing to Stagflation in a single release." },
  geo:     { label: "Geopolitical, Commodity & Regulatory", short: "GEO / REG", color: "#dc2626", desc: "Exogenous structural shocks that reshape long-term policy, supply chains and the secular growth premium." },
};

const WEIGHTS = {
  EXTREME: { color: "#ef4444", rank: 4, label: "EXTREME" },
  HIGH:    { color: "#ea580c", rank: 3, label: "HIGH" },
  MEDIUM:  { color: "#ca8a04", rank: 2, label: "MEDIUM" },
  LOW:     { color: "#64748b", rank: 1, label: "LOW" },
};

// ── date helpers ─────────────────────────────────────────────────────────────
const D = (y, m, d) => new Date(y, m, d); // m is 0-indexed
const nthWeekday = (y, m, weekday, n) => {
  const first = new Date(y, m, 1);
  let day = 1 + ((weekday - first.getDay() + 7) % 7);
  day += (n - 1) * 7;
  return new Date(y, m, day);
};
const lastWeekday = (y, m, weekday) => {
  const last = new Date(y, m + 1, 0);
  let day = last.getDate() - ((last.getDay() - weekday + 7) % 7);
  return new Date(y, m, day);
};
const firstFriday = (y, m) => nthWeekday(y, m, 5, 1);
const thirdFriday = (y, m) => nthWeekday(y, m, 5, 3);
const firstBusinessDay = (y, m) => {
  const d = new Date(y, m, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
};
const addBiz = (date, n) => {
  const d = new Date(date);
  while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
  return d;
};

const MONTH_ABBR = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtShort = (d) => `${MONTH_ABBR[d.getMonth()]} ${d.getDate()}`;

const YEARS = [2026, 2027];
const MONTHS_2YR = [];
YEARS.forEach((y) => { for (let m = 0; m < 12; m++) MONTHS_2YR.push([y, m]); });

// ── event construction ───────────────────────────────────────────────────────
function buildEvents() {
  const E = [];
  let id = 0;
  const add = (date, cat, weight, title, note, opts = {}) =>
    E.push({ id: id++, date, cat, weight, title, note, approx: !!opts.approx, span: opts.span || null, endDate: opts.endDate || null, logo: opts.logo || null });

  // ── 1. Central Bank & Sovereign Liquidity ──────────────────────────────────
  // FOMC — explicit 2-day meetings; decision lands on the second day.
  const FOMC = [
    [D(2026, 0, 28), "Jan 27–28"], [D(2026, 2, 18), "Mar 17–18"], [D(2026, 3, 29), "Apr 28–29"], [D(2026, 5, 17), "Jun 16–17"],
    [D(2026, 6, 29), "Jul 28–29"], [D(2026, 8, 16), "Sep 15–16"], [D(2026, 9, 28), "Oct 27–28"], [D(2026, 11, 9), "Dec 8–9"],
    [D(2027, 0, 27), "Jan 26–27"], [D(2027, 2, 17), "Mar 16–17"], [D(2027, 3, 28), "Apr 27–28"], [D(2027, 5, 9), "Jun 8–9"],
    [D(2027, 6, 28), "Jul 27–28"], [D(2027, 8, 15), "Sep 14–15"], [D(2027, 9, 27), "Oct 26–27"], [D(2027, 11, 8), "Dec 7–8"],
  ];
  FOMC.forEach(([d, span]) =>
    add(d, "central", "EXTREME", "FOMC Rate Decision", "Statement + presser. Sets the baseline cost of capital — the single largest scheduled driver of cross-asset volatility.", { span }));

  // BoJ — 8x/yr. Carry-trade landmine. Exact days projected from the standard schedule.
  [[2026, 0, 23], [2026, 2, 19], [2026, 3, 28], [2026, 5, 16], [2026, 6, 29], [2026, 8, 18], [2026, 9, 30], [2026, 11, 18],
   [2027, 0, 22], [2027, 2, 18], [2027, 3, 27], [2027, 5, 15], [2027, 6, 28], [2027, 8, 17], [2027, 9, 29], [2027, 11, 17]]
    .forEach(([y, m, d]) => add(D(y, m, d), "central", "HIGH", "Bank of Japan Policy Decision", "Carry-trade tripwire. Any unexpected hawkish shift unwinds institutional leverage and triggers rapid global equity liquidations.", { approx: true }));

  // ECB — 8x/yr. EUR/USD volatility. Projected dates.
  [[2026, 0, 29], [2026, 2, 12], [2026, 3, 16], [2026, 5, 4], [2026, 6, 23], [2026, 8, 10], [2026, 9, 29], [2026, 11, 17],
   [2027, 0, 28], [2027, 2, 11], [2027, 3, 15], [2027, 5, 3], [2027, 6, 22], [2027, 8, 9], [2027, 9, 28], [2027, 11, 16]]
    .forEach(([y, m, d]) => add(D(y, m, d), "central", "MEDIUM", "ECB Rate Decision", "Drives EUR/USD volatility — reshapes multinational corporate earnings translation.", { approx: true }));

  // Treasury QRA — first week of Feb, May, Aug, Nov.
  [[2026, 1, 4], [2026, 4, 6], [2026, 7, 5], [2026, 10, 4], [2027, 1, 3], [2027, 4, 5], [2027, 7, 4], [2027, 10, 3]]
    .forEach(([y, m, d]) => add(D(y, m, d), "central", "HIGH", "Treasury Quarterly Refunding (QRA)", "Borrowing size + duration mix. Heavier long-bond issuance drains bank reserves, spikes the 10-yr yield and compresses equity multiples.", { approx: true }));

  // Debt ceiling / X-date window.
  add(D(2026, 7, 1), "central", "EXTREME", "Fiscal 'X-Date' Window (projected)", "Political gridlock threatens the sovereign credit rating, forcing systematic rotation out of equities into ultra-short cash equivalents.", { approx: true, span: "Aug–Oct 2026 window", endDate: D(2026, 9, 15) });

  // ── 2. Mechanical Flow Rebalancing ─────────────────────────────────────────
  [[2026, 2], [2026, 5], [2026, 8], [2026, 11], [2027, 2], [2027, 5], [2027, 8], [2027, 11]].forEach(([y, m]) => {
    const tf = thirdFriday(y, m);
    add(tf, "flows", "HIGH", "Quadruple Witching", "Simultaneous expiry of stock + index options and stock + index futures. Forces massive options-gamma hedging adjustments.");
    add(tf, "flows", "HIGH", "S&P 500 Index Rebalance", "Quarterly reconstitution effective at the close — passive benchmarks mechanically buy adds and dump deletes.", { approx: true });
  });
  // Nasdaq-100 annual reconstitution (December).
  add(thirdFriday(2026, 11), "flows", "HIGH", "Nasdaq-100 Annual Reconstitution", "Trillions in passive benchmarks forced to buy additions and dump deletions — creates localized liquidity vacuums.", { approx: true });
  add(thirdFriday(2027, 11), "flows", "HIGH", "Nasdaq-100 Annual Reconstitution", "Trillions in passive benchmarks forced to buy additions and dump deletions — creates localized liquidity vacuums.", { approx: true });
  // Russell reconstitution — last Friday of June.
  add(lastWeekday(2026, 5, 5), "flows", "EXTREME", "Russell Index Reconstitution", "The largest mechanical rebalance of the year for small/mid-caps. Structural volatility across early-stage growth & speculative momentum tickers.");
  add(lastWeekday(2027, 5, 5), "flows", "EXTREME", "Russell Index Reconstitution", "The largest mechanical rebalance of the year for small/mid-caps. Structural volatility across early-stage growth & speculative momentum tickers.");

  // ── 3. Growth & Tech-Thematic Catalysts ────────────────────────────────────
  const earnings = [
    [D(2026, 0, 14), D(2026, 1, 6), "Q4 '25 Earnings Season"],
    [D(2026, 3, 13), D(2026, 4, 8), "Q1 '26 Earnings Season"],
    [D(2026, 6, 14), D(2026, 7, 7), "Q2 '26 Earnings Season"],
    [D(2026, 9, 13), D(2026, 10, 6), "Q3 '26 Earnings Season"],
    [D(2027, 0, 13), D(2027, 1, 5), "Q4 '26 Earnings Season"],
    [D(2027, 3, 12), D(2027, 4, 7), "Q1 '27 Earnings Season"],
    [D(2027, 6, 13), D(2027, 7, 6), "Q2 '27 Earnings Season"],
    [D(2027, 9, 12), D(2027, 10, 5), "Q3 '27 Earnings Season"],
  ];
  earnings.forEach(([s, e, t]) => add(s, "growth", "HIGH", t, "Quarterly volatility cluster. Mega-cap tech heavyweights concentrate in the final week — peak single-name gamma.", { approx: true, endDate: e, span: `${fmtShort(s)} → ${fmtShort(e)}` }));

  // Conferences.
  add(D(2026, 2, 17), "growth", "HIGH", "NVIDIA GTC", "The structural benchmark for the AI ecosystem. Drives immediate thematic alpha and momentum shifts across semis & power.", { approx: true, logo: "NVDA" });
  add(D(2027, 2, 16), "growth", "HIGH", "NVIDIA GTC", "The structural benchmark for the AI ecosystem. Drives immediate thematic alpha and momentum shifts across semis & power.", { approx: true, logo: "NVDA" });
  add(D(2026, 4, 19), "growth", "MEDIUM", "Google I/O", "Key window for software monetization & consumer-AI narratives.", { approx: true, logo: "GOOGL" });
  add(D(2027, 4, 18), "growth", "MEDIUM", "Google I/O", "Key window for software monetization & consumer-AI narratives.", { approx: true, logo: "GOOGL" });
  add(D(2026, 5, 8), "growth", "MEDIUM", "Apple WWDC", "Consumer tech & on-device-AI monetization narratives.", { approx: true, logo: "AAPL" });
  add(D(2027, 5, 7), "growth", "MEDIUM", "Apple WWDC", "Consumer tech & on-device-AI monetization narratives.", { approx: true, logo: "AAPL" });

  // ── 4. High-Impact Macro Data (monthly) ────────────────────────────────────
  MONTHS_2YR.forEach(([y, m]) => {
    add(firstFriday(y, m), "data", "HIGH", "US Non-Farm Payrolls", "Jobs + Unemployment Rate. First Friday of the month — the headline labor gauge.");
    const ismM = firstBusinessDay(y, m);
    add(ismM, "data", "MEDIUM", "ISM Manufacturing PMI", "First read on the factory cycle — expansion vs contraction.", { approx: true });
    add(addBiz(ismM, 2), "data", "MEDIUM", "ISM Services PMI", "Services-side activity gauge — the larger share of the economy.", { approx: true });
    const cpi = nthWeekday(y, m, 3, 2); // ~2nd Wednesday proxy
    add(cpi, "data", "EXTREME", "US CPI", "Headline + core inflation. The print most capable of flipping the rate-path narrative.", { approx: true });
    add(addBiz(cpi, 1), "data", "HIGH", "US PPI", "Pipeline / producer inflation — leads the CPI margin story.", { approx: true });
  });

  // ── 5. Geopolitical, Commodity & Regulatory ────────────────────────────────
  add(D(2026, 10, 3), "geo", "EXTREME", "US Midterm Elections", "General uncertainty elevates the VIX through Sep–Oct, suppressing prices until post-election clarity.");
  add(D(2026, 8, 1), "geo", "HIGH", "Midterm Volatility Window opens", "Implied vol builds into the election — historically a price-suppressing regime until clarity.", { approx: true, span: "Sep–Oct 2026", endDate: D(2026, 10, 3) });
  [[2026, 5, 1], [2026, 11, 3], [2027, 5, 1], [2027, 11, 2]].forEach(([y, m, d]) =>
    add(D(y, m, d), "geo", "MEDIUM", "OPEC+ Ministerial Meeting", "Bi-annual energy-policy decision — sets baseline cost-push inflation parameters.", { approx: true }));

  return E.sort((a, b) => a.date - b.date);
}

const ALL_EVENTS = buildEvents();

// Unscheduled / continual catalysts — no firm date, tracked as a watch list.
const WATCH = [
  { cat: "growth", weight: "MEDIUM", title: "Mega-Cap IPO Window", note: "Space-constrained, highly unique listings (e.g. SpaceX/Starlink, large AI-infra firms). Institutional desks clear space, draining liquidity from incumbent sector names." },
  { cat: "geo", weight: "HIGH", title: "Federal Antitrust / DOJ Rulings", note: "Continual Big-Tech antitrust monitoring. Structural decisions can permanently break the secular growth premium of dominant monopolies." },
];

// ── tiny UI atoms ────────────────────────────────────────────────────────────
const Tag = ({ color, children, solid }) => (
  <span style={{ fontSize: 9.5, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600, padding: "2px 7px", borderRadius: 3, background: solid ? color : color + "1e", color: solid ? "#000" : color, border: `1px solid ${color}44`, letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{children}</span>
);

const today = new Date(); today.setHours(0, 0, 0, 0);
const daysUntil = (d) => Math.round((d - today) / 86400000);

const POLISH_CSS = `
.tt-card{box-shadow:0 1px 2px rgba(15,23,42,0.05), 0 3px 10px rgba(15,23,42,0.06); transition:transform .15s ease, box-shadow .15s ease, border-color .15s ease;}
.tt-card:hover{transform:translateY(-2px); box-shadow:0 12px 26px rgba(15,23,42,0.15); border-color:#c3d0e2;}
.tt-img{-webkit-user-drag:none; user-select:none;}
`;

function Logo({ ticker, size = 24, radius = 6 }) {
  const [err, setErr] = useState(false);
  if (err) return (
    <div style={{ width: size, height: size, borderRadius: radius, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "'Syne',sans-serif", fontSize: size * 0.4, fontWeight: 800, background: "linear-gradient(135deg,#1e3a8a,#2563eb)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)" }}>{ticker.slice(0, 1)}</div>
  );
  return <img className="tt-img" src={`https://financialmodelingprep.com/image-stock/${ticker}.png`} alt={ticker} onError={() => setErr(true)} style={{ width: size, height: size, borderRadius: radius, objectFit: "contain", background: "#fff", border: "1px solid #e2e8f0", padding: 2, flexShrink: 0 }} />;
}

// ── AI briefing ──────────────────────────────────────────────────────────────
function AIBriefing({ upcoming }) {
  const [out, setOut] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const run = async () => {
    if (loading) return;
    setLoading(true); setOut("");
    const list = upcoming.slice(0, 16).map((e) => `${iso(e.date)} [${e.weight}] ${e.title} (${CATEGORIES[e.cat].short})`).join("\n");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1100,
          messages: [{
            role: "user",
            content: `You are a macro volatility & momentum strategist. Today is ${iso(today)}. Here is the upcoming scheduled event calendar (weight in brackets):

${list}

Write a tight desk briefing in this exact structure:
THE SETUP: [2 sentences — what regime are we in heading into these events]
HIGHEST-RISK WINDOW: [the single date/cluster with the most cross-asset volatility potential and why]
POSITIONING NOTES:
- [3-4 bullets: how a growth-momentum book should think about hedging, gross exposure, and which catalysts to lean into vs fade]
CLUSTERS TO WATCH: [call out any dates where multiple high-weight events stack]

Be specific, reference the actual dates above, and keep it under 280 words.`
          }]
        })
      });
      const data = await res.json();
      setOut(data.content?.[0]?.text || "No response.");
    } catch {
      setOut("Error fetching briefing. (The /api/claude proxy requires an ANTHROPIC_API_KEY — see README.)");
    }
    setLoading(false);
  };

  return (
    <div>
      <button onClick={run} disabled={loading}
        style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 700, padding: "9px 16px", background: loading ? "#dde3ec" : "#ea580c", color: loading ? "#94a3b8" : "#000", border: "none", borderRadius: 5, cursor: loading ? "default" : "pointer", letterSpacing: "0.05em" }}>
        {loading ? "BRIEFING…" : "▶ GENERATE AI VOLATILITY BRIEFING"}
      </button>
      {out && (
        <pre style={{ marginTop: 14, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: "#475569", lineHeight: 1.75, whiteSpace: "pre-wrap", background: "#eef2f7", border: "1px solid #dde3ec", borderRadius: 6, padding: "16px 18px" }}>{out}</pre>
      )}
    </div>
  );
}

// ── event row ────────────────────────────────────────────────────────────────
function EventRow({ e }) {
  const cat = CATEGORIES[e.cat];
  const w = WEIGHTS[e.weight];
  const du = daysUntil(e.date);
  const past = du < 0;
  const imminent = du >= 0 && du <= 7;
  return (
    <div className="tt-card" style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", gap: 14, alignItems: "center", padding: "11px 14px", background: past ? "#eef2f7" : "#fdfeff", borderRadius: 9, border: `1px solid ${imminent ? w.color + "66" : "#dde3ec"}`, borderLeft: `3px solid ${cat.color}`, opacity: past ? 0.55 : 1 }}>
      <div style={{ textAlign: "left" }}>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{e.approx && <span style={{ color: "#475569" }}>~</span>}{fmtShort(e.date)}</div>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: imminent ? w.color : "#475569", marginTop: 1, fontWeight: imminent ? 700 : 400 }}>
          {past ? "PASSED" : du === 0 ? "● TODAY" : `T-${du}d`}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {e.logo && <Logo ticker={e.logo} size={28} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: past ? "#64748b" : "#0f172a" }}>{e.title}{e.span && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#64748b", fontWeight: 400, marginLeft: 8 }}>{e.span}</span>}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "#64748b", marginTop: 3, lineHeight: 1.5 }}>{e.note}</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
        <Tag color={w.color} solid={e.weight === "EXTREME"}>{w.label}</Tag>
        <Tag color={cat.color}>{cat.short}</Tag>
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
export default function EventDashboard() {
  const [tab, setTab] = useState("radar");
  const [activeCats, setActiveCats] = useState(Object.keys(CATEGORIES));
  const [minWeight, setMinWeight] = useState(1);
  const [search, setSearch] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [calMonth, setCalMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [calSelected, setCalSelected] = useState(iso(today));

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = GOOGLE_FONT;
    document.head.appendChild(link);
    const style = document.createElement("style"); style.textContent = POLISH_CSS;
    document.head.appendChild(style);
  }, []);

  const toggleCat = (k) => setActiveCats((c) => c.includes(k) ? c.filter((x) => x !== k) : [...c, k]);

  const filtered = useMemo(() => ALL_EVENTS.filter((e) =>
    activeCats.includes(e.cat) &&
    WEIGHTS[e.weight].rank >= minWeight &&
    (search === "" || e.title.toLowerCase().includes(search.toLowerCase()) || e.note.toLowerCase().includes(search.toLowerCase()))
  ), [activeCats, minWeight, search]);

  const upcoming = useMemo(() => filtered.filter((e) => daysUntil(e.date) >= 0), [filtered]);
  const radar = useMemo(() => (showPast ? filtered : upcoming), [filtered, upcoming, showPast]);

  // headline stat cards
  const nextMatch = (pred) => ALL_EVENTS.find((e) => daysUntil(e.date) >= 0 && pred(e));
  const stats = [
    ["NEXT FOMC", nextMatch((e) => e.title.startsWith("FOMC")), "#2563eb"],
    ["NEXT CPI", nextMatch((e) => e.title === "US CPI"), "#d97706"],
    ["NEXT WITCHING", nextMatch((e) => e.title === "Quadruple Witching"), "#7c3aed"],
    ["NEXT RUSSELL", nextMatch((e) => e.title.startsWith("Russell")), "#7c3aed"],
    ["US MIDTERMS", ALL_EVENTS.find((e) => e.title === "US Midterm Elections"), "#dc2626"],
  ];
  const nextBig = nextMatch((e) => WEIGHTS[e.weight].rank >= 3);

  // calendar grid
  const calY = calMonth.getFullYear(), calM = calMonth.getMonth();
  const byDay = useMemo(() => {
    const map = {};
    filtered.forEach((e) => { const k = iso(e.date); (map[k] = map[k] || []).push(e); });
    return map;
  }, [filtered]);
  const gridStart = new Date(calY, calM, 1);
  const leadBlanks = gridStart.getDay();
  const daysInMonth = new Date(calY, calM + 1, 0).getDate();
  const selectedEvents = byDay[calSelected] || [];

  // timeline grouped by month
  const grouped = useMemo(() => {
    const g = {};
    radar.forEach((e) => { const k = `${e.date.getFullYear()}-${e.date.getMonth()}`; (g[k] = g[k] || []).push(e); });
    return g;
  }, [radar]);

  const S = {
    wrap: { minHeight: "100vh", background: "#e6ebf2", fontFamily: "'Syne',sans-serif", color: "#0f172a", padding: "0 0 48px" },
    header: { borderBottom: "1px solid #dde3ec", padding: "18px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f7f9fc", flexWrap: "wrap", gap: 12 },
    logo: { fontSize: 20, fontWeight: 800, color: "#ea580c", letterSpacing: "-0.02em" },
    tabs: { display: "flex", gap: 2, padding: "16px 28px 0", borderBottom: "1px solid #dde3ec", flexWrap: "wrap" },
    tab: (a) => ({ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, padding: "8px 16px", border: "none", borderBottom: a ? "2px solid #ea580c" : "2px solid transparent", background: "transparent", color: a ? "#ea580c" : "#475569", cursor: "pointer", letterSpacing: "0.05em" }),
    content: { padding: "24px 28px", maxWidth: 1180, margin: "0 auto" },
  };

  return (
    <div style={S.wrap}>
      {/* header */}
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={S.logo}>VOLATILITY · MOMENTUM RADAR</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#475569" }}>EVENT TEMPLATE 2026–2027 · {iso(today)}</div>
        </div>
        {nextBig && (
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: "5px 12px", borderRadius: 4, background: WEIGHTS[nextBig.weight].color + "18", color: WEIGHTS[nextBig.weight].color, border: `1px solid ${WEIGHTS[nextBig.weight].color}33`, fontWeight: 600 }}>
            ● NEXT MAJOR: {nextBig.title.toUpperCase()} · T-{daysUntil(nextBig.date)}d
          </div>
        )}
      </div>

      {/* stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 1, background: "#dde3ec" }}>
        {stats.map(([label, e, col]) => (
          <div key={label} style={{ padding: "10px 16px", background: "#f7f9fc" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: "#475569", letterSpacing: "0.05em" }}>{label}</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, fontWeight: 700, color: "#0f172a", marginTop: 3 }}>{e ? fmtShort(e.date) : "—"}</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: col }}>{e ? `T-${daysUntil(e.date)}d` : ""}</div>
          </div>
        ))}
      </div>

      {/* tabs */}
      <div style={S.tabs}>
        {[["radar", "RADAR"], ["timeline", "FULL TIMELINE"], ["calendar", "CALENDAR"], ["playbook", "PLAYBOOK + AI"]].map(([id, l]) => (
          <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      <div style={S.content}>
        {/* filter bar (shared by radar + timeline) */}
        {(tab === "radar" || tab === "timeline" || tab === "calendar") && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
            {Object.entries(CATEGORIES).map(([k, c]) => {
              const on = activeCats.includes(k);
              return (
                <button key={k} onClick={() => toggleCat(k)}
                  style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "5px 10px", borderRadius: 3, cursor: "pointer", fontWeight: 600, letterSpacing: "0.04em", background: on ? c.color + "1e" : "transparent", color: on ? c.color : "#475569", border: `1px solid ${on ? c.color + "55" : "#dde3ec"}` }}>
                  ● {c.short}
                </button>
              );
            })}
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search events…"
                style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, padding: "6px 10px", background: "#f7f9fc", border: "1px solid #dde3ec", borderRadius: 4, color: "#0f172a", outline: "none", width: 160 }} />
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#475569" }}>MIN WT:</span>
              {[[1, "ALL"], [2, "MED+"], [3, "HIGH+"], [4, "EXTREME"]].map(([v, l]) => (
                <button key={v} onClick={() => setMinWeight(v)}
                  style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "4px 8px", background: minWeight === v ? "#ea580c22" : "transparent", color: minWeight === v ? "#ea580c" : "#475569", border: `1px solid ${minWeight === v ? "#ea580c44" : "#dde3ec"}`, borderRadius: 3, cursor: "pointer" }}>{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── RADAR ── */}
        {tab === "radar" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#475569" }}>{radar.length} EVENTS · {showPast ? "ALL" : "UPCOMING ONLY"}</div>
              <button onClick={() => setShowPast((p) => !p)} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "4px 10px", background: showPast ? "#ea580c22" : "transparent", color: showPast ? "#ea580c" : "#475569", border: `1px solid ${showPast ? "#ea580c44" : "#dde3ec"}`, borderRadius: 3, cursor: "pointer" }}>
                {showPast ? "HIDE PAST" : "SHOW PAST"}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {radar.slice(0, 60).map((e) => <EventRow key={e.id} e={e} />)}
              {radar.length === 0 && <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#475569", padding: 20 }}>No events match the current filters.</div>}
            </div>
          </div>
        )}

        {/* ── TIMELINE ── */}
        {tab === "timeline" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {Object.keys(grouped).map((k) => {
              const [y, m] = k.split("-").map(Number);
              return (
                <div key={k}>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 14, fontWeight: 800, color: "#ea580c", marginBottom: 8, borderBottom: "1px solid #dde3ec", paddingBottom: 6, letterSpacing: "0.02em" }}>
                    {MONTH_FULL[m]} {y} <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#475569", fontWeight: 400 }}>· {grouped[k].length} events</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {grouped[k].map((e) => <EventRow key={e.id} e={e} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CALENDAR ── */}
        {tab === "calendar" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <button onClick={() => setCalMonth(new Date(calY, calM - 1, 1))} style={navBtn}>← PREV</button>
                <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{MONTH_FULL[calM]} {calY}</div>
                <button onClick={() => setCalMonth(new Date(calY, calM + 1, 1))} style={navBtn}>NEXT →</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
                {WD.map((d) => <div key={d} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: "#475569", textAlign: "center", padding: "4px 0" }}>{d}</div>)}
                {Array.from({ length: leadBlanks }).map((_, i) => <div key={"b" + i} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const k = iso(new Date(calY, calM, day));
                  const evs = byDay[k] || [];
                  const isToday = k === iso(today);
                  const isSel = k === calSelected;
                  return (
                    <div key={k} onClick={() => setCalSelected(k)}
                      style={{ minHeight: 58, padding: "5px 6px", borderRadius: 5, cursor: "pointer", background: isSel ? "#ea580c14" : "#f7f9fc", border: `1px solid ${isSel ? "#ea580c55" : isToday ? "#2563eb55" : "#dde3ec"}` }}>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: isToday ? "#2563eb" : "#475569" }}>{day}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 3 }}>
                        {evs.slice(0, 4).map((e) => <span key={e.id} title={e.title} style={{ width: 6, height: 6, borderRadius: "50%", background: CATEGORIES[e.cat].color }} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ background: "#f7f9fc", border: "1px solid #dde3ec", borderRadius: 8, padding: 16, position: "sticky", top: 16 }}>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#ea580c", letterSpacing: "0.05em", marginBottom: 10 }}>{calSelected}</div>
              {selectedEvents.length === 0
                ? <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#475569" }}>No tracked events.</div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedEvents.map((e) => (
                      <div key={e.id} style={{ borderLeft: `3px solid ${CATEGORIES[e.cat].color}`, paddingLeft: 10 }}>
                        <div style={{ display: "flex", gap: 6, marginBottom: 3 }}><Tag color={WEIGHTS[e.weight].color} solid={e.weight === "EXTREME"}>{e.weight}</Tag></div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>{e.title}</div>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#64748b", marginTop: 3, lineHeight: 1.5 }}>{e.note}</div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        )}

        {/* ── PLAYBOOK + AI ── */}
        {tab === "playbook" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 18, fontWeight: 800, color: "#ea580c", marginBottom: 6 }}>AI VOLATILITY BRIEFING</div>
              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#475569", lineHeight: 1.7, marginBottom: 14 }}>
                Feeds the next 16 upcoming events into Claude for a desk-level positioning briefing — highest-risk windows, event clusters, and hedging notes.
              </div>
              <AIBriefing upcoming={upcoming} />
            </div>

            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>THE FIVE EVENT REGIMES</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
                {Object.entries(CATEGORIES).map(([k, c]) => (
                  <div key={k} style={{ background: "#f7f9fc", border: "1px solid #dde3ec", borderLeft: `3px solid ${c.color}`, borderRadius: 6, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: c.color }}>{c.label}</div>
                      <Tag color={c.color}>{c.short}</Tag>
                    </div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "#64748b", lineHeight: 1.6 }}>{c.desc}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: "#475569", marginTop: 8 }}>{ALL_EVENTS.filter((e) => e.cat === k).length} scheduled events tracked</div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>UNSCHEDULED / CONTINUAL CATALYSTS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {WATCH.map((w, i) => (
                  <div key={i} style={{ background: "#f7f9fc", border: "1px solid #dde3ec", borderLeft: `3px solid ${CATEGORIES[w.cat].color}`, borderRadius: 6, padding: "12px 16px", display: "flex", gap: 14, alignItems: "flex-start" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-start", minWidth: 70 }}>
                      <Tag color={WEIGHTS[w.weight].color}>{w.weight}</Tag>
                      <Tag color={CATEGORIES[w.cat].color}>{CATEGORIES[w.cat].short}</Tag>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{w.title}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "#64748b", marginTop: 3, lineHeight: 1.55 }}>{w.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#475569", lineHeight: 1.7, borderTop: "1px solid #dde3ec", paddingTop: 14 }}>
              FOMC dates, quadruple-witching (3rd Friday), Russell reconstitution (last Friday of June), NFP (first Friday) and the US midterms are exact. Items marked <span style={{ color: "#475569" }}>~</span> (BoJ, ECB, QRA, CPI/PPI, ISM, earnings windows, conferences, OPEC+) are projected from standard schedules and should be verified against official calendars before trading.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, padding: "5px 12px", background: "transparent", color: "#64748b", border: "1px solid #dde3ec", borderRadius: 4, cursor: "pointer" };
