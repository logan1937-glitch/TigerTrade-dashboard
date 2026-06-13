import { useState, useEffect, useMemo, useRef } from "react";

const GOOGLE_FONT = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap";

// ── crisp blue / orange / white palette ──────────────────────────────────────
const C = {
  bg: "#eef2f7", surface: "#ffffff", surfaceAlt: "#f8fafc",
  border: "#e2e8f0", borderStrong: "#cbd5e1",
  ink: "#0f172a", inkSoft: "#475569", inkMute: "#94a3b8",
  blue: "#2563eb", blueDark: "#1d4ed8", blueDeep: "#1e3a8a", blueSoft: "#dbeafe", blueWash: "#eff6ff",
  orange: "#ea580c", orangeBright: "#f97316", orangeSoft: "#ffedd5", orangeWash: "#fff7ed",
  green: "#16a34a", greenSoft: "#dcfce7",
  red: "#dc2626", redSoft: "#fee2e2",
  amber: "#d97706",
  head: "'Syne',sans-serif", mono: "'IBM Plex Mono',monospace",
  shadow: "0 1px 3px rgba(15,23,42,0.07)", shadowMd: "0 8px 24px rgba(15,23,42,0.12)",
};

// ── market health (the "M" — gates all buying) ───────────────────────────────
const MARKET = {
  asOf: "Jun 13, 2026",
  status: "CONFIRMED UPTREND",
  statusColor: C.green,
  distributionDays: 3,
  ftd: "May 1, 2026",
  rule: "Uptrend intact — buying permitted in the strongest names near proper buy points.",
  indices: [
    { name: "S&P 500", sym: "^GSPC", val: 6712, chg: 0.42, vs50: 2.1, vs200: 7.8, trend: "above 50-DMA" },
    { name: "Nasdaq", sym: "^IXIC", val: 22340, chg: 0.61, vs50: 2.9, vs200: 9.4, trend: "above 50-DMA" },
    { name: "Russell 2K", sym: "^RUT", val: 2384, chg: -0.18, vs50: 0.4, vs200: 3.1, trend: "lagging" },
  ],
  breadth: { above50: 58, above200: 64, newHighs: 142, newLows: 31 },
};

// ── universe (demo dataset, realistic mid-2026 leadership tape) ───────────────
// fields: epsQ=current-qtr EPS %YoY (C), salesQ=sales %YoY, epsA=3yr annual EPS % (A),
//   roe (A quality), off52=% below 52w high (N), relVol, ud=up/down vol ratio (S),
//   floatM=float (S), rs=1-99 (L), inst="rising|flat|falling", smr=A-D (I),
//   base + pivot price for buy-point math, n=catalyst text.
const UNIVERSE = [
  { t:"NVDA", n:"NVIDIA",                sector:"Technology",  group:"Semis — AI",        price:182.4, chg:1.8, epsQ:78, salesQ:62, epsA:91, roe:96, off52:3,  relVol:1.4, ud:1.9, floatM:24300, rs:96, inst:"rising", smr:"A", base:"Flat base",       pivot:179.5, cat:"Rubin platform ramp; sovereign-AI orders" },
  { t:"AVGO", n:"Broadcom",              sector:"Technology",  group:"Semis — AI",        price:1684,  chg:1.1, epsQ:44, salesQ:38, epsA:46, roe:62, off52:5,  relVol:1.2, ud:1.6, floatM:4700,  rs:93, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:1675,  cat:"Custom ASIC backlog; VMware synergy" },
  { t:"MRVL", n:"Marvell Technology",    sector:"Technology",  group:"Semis — AI",        price:112.3, chg:2.4, epsQ:52, salesQ:41, epsA:38, roe:18, off52:6,  relVol:1.5, ud:1.7, floatM:860,   rs:90, inst:"rising", smr:"A", base:"Flat base",       pivot:110.2, cat:"AI custom silicon + photonics" },
  { t:"COHR", n:"Coherent",              sector:"Technology",  group:"AI Photonics",      price:118.7, chg:1.6, epsQ:86, salesQ:29, epsA:33, roe:14, off52:4,  relVol:1.6, ud:1.8, floatM:153,   rs:91, inst:"rising", smr:"A", base:"Flat base",       pivot:116.4, cat:"1.6T optical demo; datacenter demand" },
  { t:"CRDO", n:"Credo Technology",      sector:"Technology",  group:"AI Photonics",      price:96.2,  chg:3.1, epsQ:180, salesQ:154, epsA:120, roe:21, off52:8, relVol:2.2, ud:2.3, floatM:150, rs:97, inst:"rising", smr:"A", base:"High tight flag", pivot:94.5, cat:"AEC connectivity hyperscaler ramp" },
  { t:"ANET", n:"Arista Networks",       sector:"Technology",  group:"Networking",        price:128.5, chg:0.9, epsQ:31, salesQ:27, epsA:34, roe:32, off52:7,  relVol:1.1, ud:1.4, floatM:1180,  rs:86, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:127.0, cat:"800G AI back-end networking" },
  { t:"VRT",  n:"Vertiv Holdings",       sector:"Industrials", group:"Power Infra",       price:142.8, chg:1.4, epsQ:48, salesQ:35, epsA:55, roe:41, off52:6,  relVol:1.3, ud:1.6, floatM:370,   rs:92, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:140.5, cat:"Liquid-cooling datacenter capex" },
  { t:"GEV",  n:"GE Vernova",            sector:"Industrials", group:"Power Infra",       price:648,   chg:0.7, epsQ:74, salesQ:14, epsA:60, roe:19, off52:5,  relVol:1.2, ud:1.5, floatM:270,   rs:94, inst:"rising", smr:"A", base:"Flat base",       pivot:642,   cat:"Grid + gas turbine AI buildout" },
  { t:"PWR",  n:"Quanta Services",       sector:"Industrials", group:"Power Infra",       price:412,   chg:0.5, epsQ:28, salesQ:22, epsA:30, roe:17, off52:9,  relVol:0.9, ud:1.2, floatM:146,   rs:84, inst:"flat",   smr:"B", base:"Consolidation",   pivot:418,   cat:"Electrical grid contractor backlog" },
  { t:"CEG",  n:"Constellation Energy",  sector:"Utilities",   group:"Nuclear Power",     price:328,   chg:0.3, epsQ:36, salesQ:11, epsA:44, roe:28, off52:8,  relVol:0.8, ud:1.1, floatM:312,   rs:83, inst:"rising", smr:"A", base:"Consolidation",   pivot:335,   cat:"MSFT data-center PPA; nuclear premium" },
  { t:"VST",  n:"Vistra",                sector:"Utilities",   group:"Nuclear Power",     price:198,   chg:0.6, epsQ:41, salesQ:18, epsA:58, roe:46, off52:4,  relVol:1.1, ud:1.4, floatM:340,   rs:88, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:195,   cat:"Data-center power demand; buybacks" },
  { t:"TLN",  n:"Talen Energy",          sector:"Utilities",   group:"Nuclear Power",     price:312,   chg:1.2, epsQ:120, salesQ:24, epsA:0,  roe:31, off52:6,  relVol:1.4, ud:1.7, floatM:46,    rs:95, inst:"rising", smr:"B", base:"Flat base",       pivot:308,   cat:"AWS nuclear deal; tight float" },
  { t:"FCX",  n:"Freeport-McMoRan",      sector:"Materials",   group:"Copper",            price:58.9,  chg:2.1, epsQ:34, salesQ:19, epsA:12, roe:16, off52:3,  relVol:1.7, ud:1.8, floatM:1430,  rs:89, inst:"rising", smr:"B", base:"Breakout",        pivot:57.4,  cat:"Copper supply deficit; $5/lb Cu" },
  { t:"KGC",  n:"Kinross Gold",          sector:"Materials",   group:"Gold Mining",       price:34.2,  chg:1.9, epsQ:88, salesQ:31, epsA:42, roe:18, off52:2,  relVol:1.9, ud:2.1, floatM:1220,  rs:94, inst:"rising", smr:"A", base:"Breakout",        pivot:33.1,  cat:"Gold > $5,000; FCF inflection" },
  { t:"AEM",  n:"Agnico Eagle Mines",    sector:"Materials",   group:"Gold Mining",       price:188,   chg:1.3, epsQ:71, salesQ:28, epsA:38, roe:17, off52:1,  relVol:1.5, ud:1.9, floatM:500,   rs:95, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:185,   cat:"Lowest-cost senior gold producer" },
  { t:"HBM",  n:"Hudbay Minerals",       sector:"Materials",   group:"Copper",            price:14.8,  chg:4.2, epsQ:140, salesQ:33, epsA:25, roe:15, off52:7,  relVol:3.1, ud:2.6, floatM:390,   rs:90, inst:"rising", smr:"B", base:"Breakout",        pivot:14.2,  cat:"Copper + gold expansion" },
  { t:"CAT",  n:"Caterpillar",           sector:"Industrials", group:"Machinery",         price:438,   chg:0.4, epsQ:14, salesQ:6,  epsA:22, roe:48, off52:5,  relVol:0.9, ud:1.2, floatM:470,   rs:81, inst:"flat",   smr:"B", base:"Consolidation",   pivot:445,   cat:"Power-gen engines; infra spend" },
  { t:"ETN",  n:"Eaton",                 sector:"Industrials", group:"Power Infra",       price:392,   chg:0.6, epsQ:23, salesQ:11, epsA:26, roe:21, off52:6,  relVol:0.8, ud:1.1, floatM:393,   rs:82, inst:"rising", smr:"B", base:"Cup w/ handle",   pivot:398,   cat:"Electrical components for AI grid" },
  { t:"AXON", n:"Axon Enterprise",       sector:"Industrials", group:"Defense Tech",      price:742,   chg:1.0, epsQ:33, salesQ:31, epsA:40, roe:18, off52:8,  relVol:1.0, ud:1.3, floatM:74,    rs:87, inst:"rising", smr:"A", base:"Flat base",       pivot:735,   cat:"AI policing software; recurring rev" },
  { t:"LMT",  n:"Lockheed Martin",       sector:"Industrials", group:"Defense",           price:512,   chg:0.2, epsQ:9,  salesQ:5,  epsA:8,  roe:62, off52:11, relVol:0.7, ud:1.0, floatM:235,   rs:74, inst:"flat",   smr:"C", base:"Consolidation",   pivot:520,   cat:"Defense budget; Golden Dome" },
  { t:"PLTR", n:"Palantir",              sector:"Technology",  group:"AI Software",       price:158,   chg:2.8, epsQ:62, salesQ:48, epsA:0,  roe:14, off52:9,  relVol:1.8, ud:1.6, floatM:2200,  rs:92, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:154,   cat:"AIP commercial inflection" },
  { t:"APP",  n:"AppLovin",              sector:"Technology",  group:"AI Software",       price:498,   chg:1.5, epsQ:96, salesQ:44, epsA:85, roe:120,off52:7,  relVol:1.4, ud:1.7, floatM:300,   rs:96, inst:"rising", smr:"A", base:"Flat base",       pivot:492,   cat:"AXON ad engine; e-comm expansion" },
  { t:"CRWD", n:"CrowdStrike",           sector:"Technology",  group:"Cybersecurity",     price:512,   chg:0.8, epsQ:34, salesQ:23, epsA:50, roe:12, off52:6,  relVol:1.0, ud:1.3, floatM:230,   rs:85, inst:"rising", smr:"A", base:"Cup w/ handle",   pivot:506,   cat:"Falcon platform consolidation" },
  { t:"NOW",  n:"ServiceNow",            sector:"Technology",  group:"Enterprise SaaS",   price:1086,  chg:-0.3,epsQ:26, salesQ:21, epsA:28, roe:17, off52:14, relVol:0.7, ud:0.9, floatM:205,   rs:72, inst:"flat",   smr:"B", base:"Late base",       pivot:1120,  cat:"Agentic-AI workflow attach" },
  { t:"CRM",  n:"Salesforce",            sector:"Technology",  group:"Enterprise SaaS",   price:268,   chg:-0.9,epsQ:11, salesQ:8,  epsA:18, roe:11, off52:26, relVol:0.8, ud:0.7, floatM:920,   rs:48, inst:"falling",smr:"C", base:"Base failure",    pivot:300,   cat:"Agentforce monetization debate" },
  { t:"TSLA", n:"Tesla",                 sector:"Consumer",    group:"Auto / Robotics",   price:298,   chg:-1.6,epsQ:-22,salesQ:2,  epsA:5,  roe:9,  off52:34, relVol:1.2, ud:0.6, floatM:2780,  rs:41, inst:"falling",smr:"D", base:"Downtrend",       pivot:340,   cat:"Robotaxi optionality vs auto decline" },
];

// ── scoring (CAN SLIM) ───────────────────────────────────────────────────────
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r0 = (v) => Math.round(v);

const scoreC = (s) => ({ score: clamp(40 + s.epsQ * 1.2), pass: s.epsQ >= 25 });
const scoreA = (s) => ({ score: clamp(35 + s.epsA * 1.1 + (s.roe >= 17 ? 10 : 0)), pass: s.epsA >= 25 && s.roe >= 15 });
const scoreN = (s) => ({ score: clamp(100 - s.off52 * 4.5), pass: s.off52 <= 15 });
const scoreS = (s) => ({ score: clamp(50 + (s.ud - 1) * 90 + (s.relVol - 1) * 25), pass: s.ud >= 1 && s.relVol >= 1 });
const scoreL = (s) => ({ score: clamp(s.rs), pass: s.rs >= 80 });
const scoreI = (s) => ({ score: clamp((s.inst === "rising" ? 82 : s.inst === "flat" ? 58 : 28) + (s.smr === "A" ? 12 : s.smr === "B" ? 4 : 0)), pass: s.inst !== "falling" && s.smr <= "B" });
const scoreM = () => ({ score: MARKET.status.includes("CONFIRMED") ? 90 : MARKET.status.includes("PRESSURE") ? 55 : 22, pass: !MARKET.status.includes("CORRECTION") });

const LETTERS = [
  { k: "C", label: "Current Earnings",   fn: scoreC, w: 0.18, desc: "Latest-qtr EPS growth ≥ 25% YoY", detail: (s) => `EPS +${s.epsQ}% · Sales +${s.salesQ}% YoY` },
  { k: "A", label: "Annual Earnings",    fn: scoreA, w: 0.14, desc: "3-yr annual EPS ≥ 25% · ROE ≥ 17%", detail: (s) => `3yr EPS +${s.epsA}% · ROE ${s.roe}%` },
  { k: "N", label: "New High / Catalyst",fn: scoreN, w: 0.10, desc: "Within 15% of 52-wk high + new driver", detail: (s) => `${s.off52}% below high · ${s.cat}` },
  { k: "S", label: "Supply & Demand",    fn: scoreS, w: 0.13, desc: "Accumulation: up-vol > down-vol", detail: (s) => `${s.ud.toFixed(1)}× U/D vol · ${s.relVol.toFixed(1)}× rel vol · ${s.floatM >= 1000 ? (s.floatM/1000).toFixed(1)+"B" : s.floatM+"M"} float` },
  { k: "L", label: "Leader (RS)",        fn: scoreL, w: 0.22, desc: "Relative Strength rank ≥ 80", detail: (s) => `RS Rating ${s.rs}` },
  { k: "I", label: "Institutional",      fn: scoreI, w: 0.08, desc: "Fund sponsorship rising · SMR A/B", detail: (s) => `Sponsorship ${s.inst} · SMR ${s.smr}` },
  { k: "M", label: "Market Direction",   fn: scoreM, w: 0.15, desc: "Buy only in a confirmed uptrend", detail: () => `${MARKET.status} · ${MARKET.distributionDays} dist. days` },
];

const evaluate = (s) => {
  const parts = LETTERS.map((L) => { const r = L.fn(s); return { ...L, ...r }; });
  const composite = r0(parts.reduce((a, p) => a + p.score * p.w, 0));
  const passes = parts.filter((p) => p.pass).length;
  return { parts, composite, passes };
};
const grade = (c) => (c >= 85 ? "A+" : c >= 78 ? "A" : c >= 68 ? "B" : c >= 55 ? "C" : "D");
const gradeColor = (c) => (c >= 78 ? C.green : c >= 68 ? C.blue : c >= 55 ? C.amber : C.red);

const buyZone = (s) => {
  const pct = (s.price / s.pivot - 1) * 100;
  if (pct < -8) return { label: "BASING", color: C.inkSoft, pct, bg: C.surfaceAlt };
  if (pct < -1) return { label: "APPROACHING", color: C.blue, pct, bg: C.blueWash };
  if (pct <= 5) return { label: "IN BUY ZONE", color: C.green, pct, bg: C.greenSoft };
  return { label: "EXTENDED", color: C.orange, pct, bg: C.orangeWash };
};

// ── UI atoms ─────────────────────────────────────────────────────────────────
const Pill = ({ children, color = C.blue, solid = false, size = 10 }) => (
  <span style={{ fontFamily: C.mono, fontSize: size, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: solid ? color : color + "16", color: solid ? "#fff" : color, border: `1px solid ${color}33`, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{children}</span>
);
const Chg = ({ v, size = 12 }) => (
  <span style={{ fontFamily: C.mono, fontSize: size, fontWeight: 600, color: v >= 0 ? C.green : C.red }}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>
);
const Bar = ({ value, color, w = "100%", h = 6 }) => (
  <div style={{ position: "relative", width: w, height: h, background: C.border, borderRadius: 999, overflow: "hidden" }}>
    <div style={{ position: "absolute", inset: 0, width: `${clamp(value)}%`, background: color, borderRadius: 999, transition: "width .5s ease" }} />
  </div>
);
const fmtPrice = (p) => p >= 1000 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : p.toFixed(2);

// ── score donut ──────────────────────────────────────────────────────────────
const Donut = ({ value, size = 64, label }) => {
  const r = (size - 8) / 2, circ = 2 * Math.PI * r, col = gradeColor(value);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.border} strokeWidth="6" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - value/100)} style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: C.head, fontSize: size * 0.32, fontWeight: 800, color: col, lineHeight: 1 }}>{value}</div>
        {label && <div style={{ fontFamily: C.mono, fontSize: 8, color: C.inkMute, marginTop: 1 }}>{label}</div>}
      </div>
    </div>
  );
};

// ── AI analysis (per stock) ──────────────────────────────────────────────────
function AIAnalysis({ stock, evalResult }) {
  const [out, setOut] = useState(""); const [loading, setLoading] = useState(false);
  const run = async () => {
    if (loading) return; setLoading(true); setOut("");
    const ctx = evalResult.parts.map((p) => `${p.k}=${r0(p.score)}${p.pass ? "✓" : "✗"}`).join(" ");
    const bz = buyZone(stock);
    try {
      const res = await fetch("/api/claude", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 900,
          messages: [{ role: "user", content: `You are a disciplined CAN SLIM swing-trade analyst. As of ${MARKET.asOf} the general market is "${MARKET.status}".

Stock: ${stock.t} (${stock.n}), ${stock.group}. Price $${stock.price}. Pivot/buy point $${stock.pivot} → currently ${bz.label} (${bz.pct.toFixed(1)}% vs pivot).
Computed CAN SLIM sub-scores (0-100): ${ctx}. Composite ${evalResult.composite}/100 (${evalResult.passes}/7 criteria). Catalyst: ${stock.cat}.

Respond in EXACTLY this format, tight and numeric (max 230 words):
READ: [2 sentences — is this an institutional-quality leader right now, and does it fit the current tape?]
BUY POINT: [specific pivot, 5% buy zone range, and whether it's actionable today or wait]
RISK PLAN: [8% stop level, where to take 20-25% profits, position-size note]
WATCH-OUTS: [the 1-2 weakest CAN SLIM letters and what would invalidate the setup]
VERDICT: [BUY NOW / BUY ON BREAKOUT / WATCHLIST / AVOID — one line why]` }] })
      });
      const d = await res.json();
      setOut(d.content?.[0]?.text || "No response.");
    } catch { setOut("Error fetching analysis. The AI button needs an ANTHROPIC_API_KEY set in the deployment (see README)."); }
    setLoading(false);
  };
  return (
    <div style={{ marginTop: 4 }}>
      <button onClick={run} disabled={loading}
        style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, padding: "9px 16px", background: loading ? C.surfaceAlt : C.orange, color: loading ? C.inkMute : "#fff", border: "none", borderRadius: 8, cursor: loading ? "default" : "pointer", letterSpacing: "0.04em", boxShadow: loading ? "none" : C.shadow }}>
        {loading ? "ANALYZING…" : `▶ AI TRADE ANALYSIS — ${stock.t}`}
      </button>
      {out && <pre style={{ marginTop: 12, fontFamily: C.mono, fontSize: 11.5, color: C.inkSoft, lineHeight: 1.7, whiteSpace: "pre-wrap", background: C.blueWash, border: `1px solid ${C.blueSoft}`, borderRadius: 10, padding: "14px 16px" }}>{out}</pre>}
    </div>
  );
}

// ── stock detail modal ───────────────────────────────────────────────────────
function StockModal({ stock, onClose }) {
  const ev = evaluate(stock);
  const bz = buyZone(stock);
  const stop = stock.pivot * 0.92, t1 = stock.pivot * 1.20, t2 = stock.pivot * 1.25;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, width: 560, maxWidth: "100%", maxHeight: "92vh", overflowY: "auto", boxShadow: C.shadowMd, border: `1px solid ${C.border}` }}>
        {/* header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "22px 24px", borderBottom: `1px solid ${C.border}`, background: `linear-gradient(135deg, ${C.blueWash}, ${C.surface})` }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: C.head, fontSize: 26, fontWeight: 800, color: C.blueDeep }}>{stock.t}</div>
              <Pill color={gradeColor(ev.composite)} solid>{grade(ev.composite)}</Pill>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 12, color: C.inkSoft, marginTop: 3 }}>{stock.n} · {stock.group}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: C.ink }}>${fmtPrice(stock.price)}</div>
            <Chg v={stock.chg} />
          </div>
        </div>

        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* composite + buy zone */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16 }}>
            <Donut value={ev.composite} size={76} label="COMPOSITE" />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: C.head, fontSize: 14, fontWeight: 800, color: C.ink }}>{ev.passes}/7 CAN SLIM criteria met</div>
              <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, marginTop: 2 }}>Pattern: {stock.base}</div>
              <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 999, background: bz.bg, border: `1px solid ${bz.color}33` }}>
                <span style={{ fontFamily: C.mono, fontSize: 11, fontWeight: 700, color: bz.color }}>● {bz.label}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>{bz.pct >= 0 ? "+" : ""}{bz.pct.toFixed(1)}% vs pivot ${fmtPrice(stock.pivot)}</span>
              </div>
            </div>
          </div>

          {/* letter scorecard */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {ev.parts.map((p) => (
              <div key={p.k} style={{ display: "grid", gridTemplateColumns: "30px 1fr 120px 44px", gap: 12, alignItems: "center", padding: "9px 12px", borderRadius: 10, background: C.surface, border: `1px solid ${p.pass ? C.green + "33" : C.border}` }}>
                <div style={{ fontFamily: C.head, fontSize: 18, fontWeight: 800, color: p.pass ? C.green : C.inkMute }}>{p.k}</div>
                <div>
                  <div style={{ fontFamily: C.head, fontSize: 12.5, fontWeight: 700, color: C.ink }}>{p.label} {p.pass ? <span style={{ color: C.green }}>✓</span> : <span style={{ color: C.red }}>✗</span>}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, marginTop: 2 }}>{p.detail(stock)}</div>
                </div>
                <Bar value={p.score} color={p.pass ? C.green : C.amber} />
                <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: p.pass ? C.green : C.inkSoft, textAlign: "right" }}>{r0(p.score)}</div>
              </div>
            ))}
          </div>

          {/* trade plan */}
          <div style={{ background: C.blueWash, border: `1px solid ${C.blueSoft}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: C.blueDark, letterSpacing: "0.06em", marginBottom: 10 }}>📐 TRADE PLAN (CAN SLIM RULES)</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
              {[["BUY ZONE", `$${fmtPrice(stock.pivot)}–${fmtPrice(stock.pivot*1.05)}`, C.green], ["STOP (-8%)", `$${fmtPrice(stop)}`, C.red], ["TARGET +20%", `$${fmtPrice(t1)}`, C.blue], ["TARGET +25%", `$${fmtPrice(t2)}`, C.blue]].map(([l, v, col]) => (
                <div key={l}>
                  <div style={{ fontFamily: C.mono, fontSize: 9, color: C.inkSoft }}>{l}</div>
                  <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: col, marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, marginTop: 10, lineHeight: 1.5 }}>Buy within 5% of the pivot, cut losses at 7–8%, take most profits into the 20–25% zone. Never average down.</div>
          </div>

          <AIAnalysis stock={stock} evalResult={ev} />
        </div>

        <div style={{ padding: "0 24px 22px" }}>
          <button onClick={onClose} style={{ width: "100%", padding: 11, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, color: C.inkSoft, fontFamily: C.mono, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

// ── market health bar / tab ──────────────────────────────────────────────────
function MarketGate() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${MARKET.statusColor}`, borderRadius: 12, padding: "12px 16px", boxShadow: C.shadow }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 9, height: 9, borderRadius: 999, background: MARKET.statusColor, boxShadow: `0 0 0 3px ${MARKET.statusColor}22` }} />
        <span style={{ fontFamily: C.head, fontSize: 14, fontWeight: 800, color: C.ink }}>{MARKET.status}</span>
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>Distribution days: <b style={{ color: MARKET.distributionDays >= 5 ? C.red : C.amber }}>{MARKET.distributionDays}</b></span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft }}>Last FTD: <b style={{ color: C.ink }}>{MARKET.ftd}</b></span>
      <span style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, flex: 1, minWidth: 200 }}>{MARKET.rule}</span>
    </div>
  );
}

function MarketTab() {
  const { breadth } = MARKET;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <MarketGate />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {MARKET.indices.map((ix) => (
          <div key={ix.sym} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, boxShadow: C.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontFamily: C.head, fontSize: 14, fontWeight: 800, color: C.ink }}>{ix.name}</div>
              <Chg v={ix.chg} />
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 6 }}>{ix.val.toLocaleString()}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft }}>vs 50-DMA <b style={{ color: ix.vs50 >= 0 ? C.green : C.red }}>{ix.vs50 >= 0 ? "+" : ""}{ix.vs50}%</b></span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft }}>vs 200-DMA <b style={{ color: ix.vs200 >= 0 ? C.green : C.red }}>{ix.vs200 >= 0 ? "+" : ""}{ix.vs200}%</b></span>
            </div>
            <div style={{ marginTop: 8 }}><Pill color={ix.trend.includes("above") ? C.green : C.amber}>{ix.trend}</Pill></div>
          </div>
        ))}
      </div>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, boxShadow: C.shadow }}>
        <div style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 700, color: C.blueDark, letterSpacing: "0.06em", marginBottom: 12 }}>MARKET BREADTH</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 16 }}>
          {[["% above 50-DMA", breadth.above50 + "%", breadth.above50 >= 50 ? C.green : C.red, breadth.above50], ["% above 200-DMA", breadth.above200 + "%", breadth.above200 >= 50 ? C.green : C.red, breadth.above200], ["New 52-wk highs", breadth.newHighs, C.green, null], ["New 52-wk lows", breadth.newLows, C.red, null]].map(([l, v, col, bar]) => (
            <div key={l}>
              <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft }}>{l}</div>
              <div style={{ fontFamily: C.head, fontSize: 24, fontWeight: 800, color: col, marginTop: 2 }}>{v}</div>
              {bar != null && <div style={{ marginTop: 6 }}><Bar value={bar} color={col} /></div>}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, lineHeight: 1.7, background: C.orangeWash, border: `1px solid ${C.orangeSoft}`, borderRadius: 10, padding: "12px 14px" }}>
        <b style={{ color: C.orange }}>The "M" rule:</b> ~3 of 4 stocks follow the general market. Buy breakouts only in a Confirmed Uptrend. A cluster of 5–6 distribution days (heavy-volume down days) within a few weeks signals the uptrend is "Under Pressure" — raise cash and stop initiating. Demo snapshot; connect live data to drive this automatically.
      </div>
    </div>
  );
}

// ── playbook tab ─────────────────────────────────────────────────────────────
function PlaybookTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 10 }}>
        {LETTERS.map((L) => (
          <div key={L.k} style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeft: `4px solid ${C.blue}`, borderRadius: 12, padding: 14, boxShadow: C.shadow }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontFamily: C.head, fontSize: 22, fontWeight: 800, color: C.orange }}>{L.k}</div>
              <div style={{ fontFamily: C.head, fontSize: 14, fontWeight: 700, color: C.ink }}>{L.label}</div>
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 11, color: C.inkSoft, marginTop: 6, lineHeight: 1.55 }}>{L.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 12 }}>
        <div style={{ background: C.greenSoft, border: `1px solid ${C.green}33`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: C.head, fontSize: 14, fontWeight: 800, color: C.green, marginBottom: 8 }}>BUY RULES</div>
          {["Buy within 5% of a proper pivot (cup-with-handle, flat base, high-tight flag).", "Demand breakout volume ≥ 40–50% above average.", "Only buy in a Confirmed Uptrend (the M).", "Concentrate in the top few leaders, not laggards."].map((r, i) => (
            <div key={i} style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, lineHeight: 1.6, marginBottom: 5 }}>✓ {r}</div>
          ))}
        </div>
        <div style={{ background: C.redSoft, border: `1px solid ${C.red}33`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: C.head, fontSize: 14, fontWeight: 800, color: C.red, marginBottom: 8 }}>SELL RULES</div>
          {["Cut every loss at 7–8% below your buy — no exceptions.", "Take most gains into the +20–25% zone.", "Sell on a break of the 50-DMA on heavy volume.", "Reduce exposure as distribution days cluster."].map((r, i) => (
            <div key={i} style={{ fontFamily: C.mono, fontSize: 10.5, color: C.inkSoft, lineHeight: 1.6, marginBottom: 5 }}>✕ {r}</div>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMute, lineHeight: 1.7, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
        CAN SLIM® is a trademark of Investor's Business Daily. This dashboard is an educational implementation of the methodology and is not investment advice. Fundamentals and prices shown are a demo dataset for layout — verify against live sources before trading.
      </div>
    </div>
  );
}

// ── main ─────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState("screener");
  const [selected, setSelected] = useState(null);
  const [sortKey, setSortKey] = useState("composite");
  const [sector, setSector] = useState("All");
  const [minRs, setMinRs] = useState(0);
  const [minPass, setMinPass] = useState(0);
  const [buyOnly, setBuyOnly] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = GOOGLE_FONT;
    document.head.appendChild(link);
  }, []);

  const rows = useMemo(() => UNIVERSE.map((s) => ({ s, ev: evaluate(s), bz: buyZone(s) })), []);
  const sectors = useMemo(() => ["All", ...Array.from(new Set(UNIVERSE.map((s) => s.sector)))], []);

  const filtered = useMemo(() => rows
    .filter(({ s, ev, bz }) =>
      (sector === "All" || s.sector === sector) &&
      s.rs >= minRs && ev.passes >= minPass &&
      (!buyOnly || bz.label === "IN BUY ZONE" || bz.label === "APPROACHING") &&
      (search === "" || s.t.toLowerCase().includes(search.toLowerCase()) || s.n.toLowerCase().includes(search.toLowerCase()) || s.group.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => {
      if (sortKey === "rs") return b.s.rs - a.s.rs;
      if (sortKey === "chg") return b.s.chg - a.s.chg;
      if (sortKey === "passes") return b.ev.passes - a.ev.passes;
      return b.ev.composite - a.ev.composite;
    }), [rows, sector, minRs, minPass, buyOnly, search, sortKey]);

  const inBuyZone = rows.filter((r) => r.bz.label === "IN BUY ZONE").length;
  const aPlus = rows.filter((r) => r.ev.composite >= 85).length;

  const S = {
    wrap: { minHeight: "100vh", background: C.bg, fontFamily: C.head, color: C.ink },
    header: { background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 },
    tabs: { display: "flex", gap: 4, padding: "14px 28px 0", flexWrap: "wrap" },
    tab: (a) => ({ fontFamily: C.mono, fontSize: 11, fontWeight: 600, padding: "9px 16px", border: "none", borderRadius: "8px 8px 0 0", background: a ? C.surface : "transparent", color: a ? C.blue : C.inkSoft, cursor: "pointer", letterSpacing: "0.04em", borderBottom: a ? `2px solid ${C.blue}` : "2px solid transparent" }),
    content: { padding: "22px 28px 48px", maxWidth: 1200, margin: "0 auto" },
    selBtn: { fontFamily: C.mono, fontSize: 11, padding: "7px 10px", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, color: C.ink, outline: "none", cursor: "pointer" },
  };

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: C.head, fontSize: 20, fontWeight: 800, color: C.blueDeep }}>CAN<span style={{ color: C.orange }}>SLIM</span> SCREENER</div>
          <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMute }}>RELATIVE-STRENGTH LEADERSHIP · {MARKET.asOf.toUpperCase()}</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Pill color={C.green}>{inBuyZone} IN BUY ZONE</Pill>
          <Pill color={C.blue}>{aPlus} A+ LEADERS</Pill>
        </div>
      </div>

      <div style={{ ...S.tabs, borderBottom: `1px solid ${C.border}` }}>
        {[["screener", "SCREENER"], ["market", "MARKET HEALTH"], ["playbook", "PLAYBOOK"]].map(([id, l]) => (
          <button key={id} style={S.tab(tab === id)} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      <div style={S.content}>
        {tab === "screener" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <MarketGate />
            {/* filters */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", boxShadow: C.shadow }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="search ticker / group…" style={{ ...S.selBtn, width: 180, cursor: "text" }} />
              <select value={sector} onChange={(e) => setSector(e.target.value)} style={S.selBtn}>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
              <label style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
                MIN RS <input type="range" min={0} max={95} step={5} value={minRs} onChange={(e) => setMinRs(+e.target.value)} /> <b style={{ color: C.blue }}>{minRs}</b>
              </label>
              <label style={{ fontFamily: C.mono, fontSize: 10, color: C.inkSoft, display: "flex", alignItems: "center", gap: 6 }}>
                MIN PASS <input type="range" min={0} max={7} step={1} value={minPass} onChange={(e) => setMinPass(+e.target.value)} /> <b style={{ color: C.blue }}>{minPass}/7</b>
              </label>
              <button onClick={() => setBuyOnly((b) => !b)} style={{ fontFamily: C.mono, fontSize: 10, fontWeight: 600, padding: "6px 12px", borderRadius: 999, cursor: "pointer", background: buyOnly ? C.greenSoft : C.surfaceAlt, color: buyOnly ? C.green : C.inkSoft, border: `1px solid ${buyOnly ? C.green + "44" : C.border}` }}>● ACTIONABLE ONLY</button>
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMute }}>SORT</span>
                {[["composite", "SCORE"], ["rs", "RS"], ["passes", "PASS"], ["chg", "%CHG"]].map(([k, l]) => (
                  <button key={k} onClick={() => setSortKey(k)} style={{ fontFamily: C.mono, fontSize: 10, padding: "5px 9px", borderRadius: 8, cursor: "pointer", background: sortKey === k ? C.blueWash : "transparent", color: sortKey === k ? C.blue : C.inkSoft, border: `1px solid ${sortKey === k ? C.blueSoft : C.border}` }}>{l}</button>
                ))}
              </div>
            </div>

            {/* table */}
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: C.shadow }}>
              <div style={{ display: "grid", gridTemplateColumns: "150px 90px 70px 1fr 130px 64px", gap: 12, padding: "10px 16px", fontFamily: C.mono, fontSize: 10, color: C.inkMute, letterSpacing: "0.04em", borderBottom: `1px solid ${C.border}`, background: C.surfaceAlt }}>
                <span>TICKER</span><span>PRICE</span><span>RS</span><span>CAN SLIM LETTERS</span><span>BUY STATUS</span><span style={{ textAlign: "right" }}>SCORE</span>
              </div>
              {filtered.map(({ s, ev, bz }) => (
                <div key={s.t} onClick={() => setSelected(s)} style={{ display: "grid", gridTemplateColumns: "150px 90px 70px 1fr 130px 64px", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", transition: "background .12s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = C.blueWash)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 700, color: C.blueDeep }}>{s.t}</div>
                    <div style={{ fontFamily: C.mono, fontSize: 9.5, color: C.inkMute, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.group}</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: C.ink }}>${fmtPrice(s.price)}</div>
                    <Chg v={s.chg} size={10} />
                  </div>
                  <div>
                    <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: s.rs >= 80 ? C.green : C.inkSoft }}>{s.rs}</div>
                    <Bar value={s.rs} color={s.rs >= 80 ? C.green : C.amber} w={44} h={4} />
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {ev.parts.map((p) => (
                      <span key={p.k} title={`${p.label}: ${r0(p.score)}`} style={{ width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: C.head, fontSize: 11, fontWeight: 800, color: p.pass ? "#fff" : C.inkMute, background: p.pass ? C.green : C.surfaceAlt, border: `1px solid ${p.pass ? C.green : C.border}` }}>{p.k}</span>
                    ))}
                  </div>
                  <div><Pill color={bz.color} solid={bz.label === "IN BUY ZONE"}>{bz.label}</Pill></div>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <span style={{ fontFamily: C.head, fontSize: 17, fontWeight: 800, color: gradeColor(ev.composite) }}>{ev.composite}</span>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && <div style={{ padding: 24, fontFamily: C.mono, fontSize: 12, color: C.inkMute, textAlign: "center" }}>No names match the screen — loosen the filters.</div>}
            </div>
            <div style={{ fontFamily: C.mono, fontSize: 10, color: C.inkMute }}>Showing {filtered.length} of {UNIVERSE.length} names · click any row for the full CAN SLIM scorecard, trade plan & AI analysis · letters fill green when the criterion passes.</div>
          </div>
        )}

        {tab === "market" && <MarketTab />}
        {tab === "playbook" && <PlaybookTab />}
      </div>

      {selected && <StockModal stock={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
