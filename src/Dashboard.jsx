import { useState, useEffect, useRef } from "react";

const GOOGLE_FONT = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap";

// ── seed data ──────────────────────────────────────────────────────────────────
const MARKET_STATUS = {
  status: "CONFIRMED UPTREND",
  distribution: 2,
  fdu: "Mar 4, 2026",
  note: "Rotation from tech into energy, materials & industrials. Selective buying.",
  color: "#22c55e",
};

const INDUSTRY_GROUPS = [
  { rank: 1,  name: "Gold Mining",           rs: 97, wk1: 4.2,  wk4: 12.8, ytd: 38.1, stocks: 38,  leaders: ["NEM","KGC","GOLD"] },
  { rank: 2,  name: "Oil & Gas E&P",         rs: 94, wk1: 2.8,  wk4: 9.1,  ytd: 22.4, stocks: 62,  leaders: ["XOM","CVX","OXY"] },
  { rank: 3,  name: "Copper Mining",         rs: 92, wk1: 3.1,  wk4: 8.6,  ytd: 20.2, stocks: 18,  leaders: ["FCX","HBM","ERO"] },
  { rank: 4,  name: "Defense & Aerospace",   rs: 89, wk1: 1.9,  wk4: 7.2,  ytd: 17.8, stocks: 45,  leaders: ["LMT","RTX","HII"] },
  { rank: 5,  name: "Ind. Machinery",        rs: 87, wk1: 1.4,  wk4: 6.8,  ytd: 16.1, stocks: 72,  leaders: ["CAT","ETN","GEV"] },
  { rank: 6,  name: "Nuclear Power",         rs: 85, wk1: 2.2,  wk4: 5.9,  ytd: 14.3, stocks: 12,  leaders: ["CEG","VST","TLN"] },
  { rank: 7,  name: "Consumer Staples",      rs: 82, wk1: 0.9,  wk4: 4.8,  ytd: 13.2, stocks: 84,  leaders: ["WMT","COST","PG"] },
  { rank: 8,  name: "Capital Markets",       rs: 79, wk1: 1.1,  wk4: 4.2,  ytd: 11.4, stocks: 55,  leaders: ["HLI","GS","IBKR"] },
  { rank: 9,  name: "Power Infrastructure", rs: 76, wk1: 0.8,  wk4: 3.6,  ytd: 10.8, stocks: 29,  leaders: ["VRT","PWR","GRID"] },
  { rank: 10, name: "AI Photonics",          rs: 74, wk1: 1.6,  wk4: 3.1,  ytd: 9.6,  stocks: 22,  leaders: ["COHR","LITE","FN"] },
  { rank: 11, name: "Semis — AI Custom",     rs: 71, wk1: 0.4,  wk4: 2.2,  ytd: 6.8,  stocks: 68,  leaders: ["MRVL","AVGO","TSEM"] },
  { rank: 12, name: "Regional Banks",        rs: 68, wk1: 0.6,  wk4: 1.8,  ytd: 8.1,  stocks: 93,  leaders: ["SSB","WAL","HBAN"] },
  { rank: 13, name: "Software — Enterprise", rs: 54, wk1: -0.8, wk4: -1.2, ytd: -2.4, stocks: 110, leaders: ["CRM","NOW","WDAY"] },
  { rank: 14, name: "Consumer Discretionary",rs: 48, wk1: -1.2, wk4: -2.8, ytd: -4.1, stocks: 88,  leaders: ["AMZN","TSLA","LULU"] },
  { rank: 15, name: "Comm Services",         rs: 41, wk1: -1.9, wk4: -3.4, ytd: -5.2, stocks: 67,  leaders: ["META","GOOGL","NFLX"] },
];

const WATCHLIST = [
  { ticker:"MRVL", name:"Marvell Technology",  rs:88, eps:82, comp:91, smr:"A", price:89.81, chg:0.9,  vol_rel:1.2, base:"Flat base",      near_buy:true,  group:"AI Photonics",       c:32,a:28,n:"AI ASICs+photonics",s:1.2,l:88,i:"↑↑",m:"✓" },
  { ticker:"KGC",  name:"Kinross Gold",         rs:95, eps:78, comp:88, smr:"A", price:29.02, chg:3.9,  vol_rel:2.1, base:"Breakout",       near_buy:true,  group:"Gold Mining",        c:52,a:44,n:"Gold ATH >$5k",   s:2.1,l:95,i:"↑↑↑",m:"✓" },
  { ticker:"FCX",  name:"Freeport-McMoRan",     rs:92, eps:71, comp:85, smr:"A", price:48.30, chg:2.7,  vol_rel:1.8, base:"Cup w/ handle",  near_buy:true,  group:"Copper",             c:41,a:38,n:"Cu supply deficit", s:1.8,l:92,i:"↑↑",m:"✓" },
  { ticker:"GEV",  name:"GE Vernova",           rs:86, eps:74, comp:83, smr:"B", price:312.40,chg:1.1,  vol_rel:1.4, base:"High tight flag", near_buy:false, group:"Power Infra",       c:38,a:31,n:"AI grid buildout",  s:1.4,l:86,i:"↑",m:"✓" },
  { ticker:"VST",  name:"Vistra Corp",          rs:82, eps:68, comp:80, smr:"B", price:152.20,chg:0.6,  vol_rel:1.1, base:"Cup & handle",   near_buy:false, group:"Nuclear Power",      c:29,a:25,n:"Meta 2.6GW PPA",   s:1.1,l:82,i:"↑",m:"✓" },
  { ticker:"CEG",  name:"Constellation Energy", rs:84, eps:72, comp:82, smr:"A", price:282.10,chg:0.4,  vol_rel:0.9, base:"Consolidation",  near_buy:false, group:"Nuclear Power",      c:33,a:22,n:"MSFT TMI deal",    s:0.9,l:84,i:"↑",m:"✓" },
  { ticker:"HBM",  name:"Hudbay Minerals",      rs:90, eps:62, comp:82, smr:"B", price:20.02, chg:5.6,  vol_rel:3.4, base:"Breakout",       near_buy:true,  group:"Copper",             c:44,a:36,n:"Cu+gold expansion",s:3.4,l:90,i:"↑↑",m:"✓" },
  { ticker:"COHR", name:"Coherent Corp",        rs:89, eps:86, comp:90, smr:"A", price:88.40, chg:1.2,  vol_rel:1.6, base:"Flat base",      near_buy:true,  group:"AI Photonics",       c:44,a:36,n:"3.2T OFC demo",   s:1.6,l:89,i:"↑↑",m:"✓" },
];

const rsColor = (v) => {
  if (v >= 90) return "#22c55e";
  if (v >= 80) return "#86efac";
  if (v >= 70) return "#fbbf24";
  if (v >= 60) return "#fb923c";
  return "#f87171";
};

const RsBar = ({ value, width = 120 }) => (
  <div style={{ position:"relative", width, height:6, background:"#1e2530", borderRadius:3 }}>
    <div style={{ position:"absolute", left:0, top:0, height:6, width:`${value}%`, background:rsColor(value), borderRadius:3, transition:"width 0.6s ease" }} />
  </div>
);

const Badge = ({ children, color="#22c55e" }) => (
  <span style={{ fontSize:10, fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, padding:"2px 7px", borderRadius:3, background:color+"22", color, border:`1px solid ${color}44`, letterSpacing:"0.04em" }}>{children}</span>
);

const Sparkline = ({ pct }) => {
  const color = pct >= 0 ? "#22c55e" : "#f87171";
  return <span style={{ fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color, fontWeight:600 }}>{pct >= 0 ? "+" : ""}{pct.toFixed(1)}%</span>;
};

// ── AI Analysis Panel ──────────────────────────────────────────────────────────
function AIAnalysis({ ticker, name }) {
  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  const analyze = async () => {
    if (loading) return;
    setLoading(true);
    setOutput("");
    try {
      const res = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `You are a CANSLIM swing trader analyst. Give a concise but precise analysis of ${ticker} (${name}) as of March 2026.

Structure your response in exactly this format:
CANSLIM SCORE BREAKDOWN
C (Current EPS): [score/score comment]
A (Annual EPS): [score/comment]  
N (New catalyst): [what's new]
S (Supply/Demand): [volume/accumulation read]
L (Leader rating): [RS rank vs peers]
I (Institutional): [sponsorship trend]
M (Market): [fits current tape?]

TRADE SETUP
Pattern: [base type]
Entry: [price level]
Target 1 / Target 2: [levels]
Stop: [level]
Options: [best structure if applicable]

ONE-LINE VERDICT: [buy/watch/avoid and why]

Be specific with numbers. Keep it tight — max 250 words total.`
          }]
        })
      });
      const data = await res.json();
      setOutput(data.content?.[0]?.text || "No response.");
    } catch (e) {
      setOutput("Error fetching analysis.");
    }
    setLoading(false);
  };

  return (
    <div style={{ marginTop:16 }}>
      <button
        onClick={analyze}
        disabled={loading}
        style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, padding:"6px 14px", background: loading ? "#1e2530" : "#f59e0b", color: loading ? "#6b7280" : "#000", border:"none", borderRadius:4, cursor: loading ? "default" : "pointer", fontWeight:600, letterSpacing:"0.05em", transition:"all 0.2s" }}
      >
        {loading ? "ANALYZING..." : `▶ RUN CANSLIM AI ANALYSIS — ${ticker}`}
      </button>
      {output && (
        <pre style={{ marginTop:12, fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#94a3b8", lineHeight:1.7, whiteSpace:"pre-wrap", background:"#0d1117", border:"1px solid #1e2530", borderRadius:6, padding:"14px 16px" }}>
          {output}
        </pre>
      )}
    </div>
  );
}

// ── CANSLIM Scorecard ──────────────────────────────────────────────────────────
function CANSLIMCard({ stock, onClose }) {
  const letters = [
    { k:"C", label:"Current EPS",     val: stock.c + "%",   ok: stock.c >= 25, desc:"Qtr over qtr EPS growth" },
    { k:"A", label:"Annual EPS",      val: stock.a + "%",   ok: stock.a >= 25, desc:"3-5yr annual earnings growth" },
    { k:"N", label:"New Catalyst",    val: stock.n,         ok: true,          desc:"New product / high / event" },
    { k:"S", label:"Supply/Demand",   val: stock.s + "x vol", ok: stock.s >= 1.0, desc:"Relative volume (>1 = accumulation)" },
    { k:"L", label:"Leader RS",       val: stock.l,         ok: stock.l >= 80, desc:"RS Rating vs all stocks" },
    { k:"I", label:"Institutional",   val: stock.i,         ok: stock.i.includes("↑↑"), desc:"Sponsorship trend" },
    { k:"M", label:"Market Dir.",     val: stock.m,         ok: stock.m === "✓", desc:"Confirmed uptrend?" },
  ];
  const score = letters.filter(l => l.ok).length;

  return (
    <div style={{ position:"fixed", inset:0, background:"#00000088", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:"#0d1117", border:"1px solid #f59e0b44", borderRadius:10, padding:28, width:520, maxWidth:"95vw", maxHeight:"90vh", overflowY:"auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color:"#f59e0b" }}>{stock.ticker}</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"#64748b", marginTop:2 }}>{stock.name} · {stock.group}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:20, fontWeight:600, color:"#f1f5f9" }}>${stock.price}</div>
            <Badge color={stock.chg >= 0 ? "#22c55e" : "#f87171"}>{stock.chg >= 0 ? "+" : ""}{stock.chg}%</Badge>
          </div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, padding:"10px 14px", background:"#131920", borderRadius:6, border:"1px solid #1e2530" }}>
          <div style={{ fontFamily:"'Syne',sans-serif", fontSize:32, fontWeight:800, color: score >= 6 ? "#22c55e" : score >= 4 ? "#fbbf24" : "#f87171" }}>{score}/7</div>
          <div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:600, color:"#94a3b8" }}>CANSLIM SCORE</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color: score >= 6 ? "#22c55e" : score >= 4 ? "#fbbf24" : "#f87171" }}>
              {score >= 6 ? "STRONG BUY CANDIDATE" : score >= 4 ? "WATCH LIST" : "AVOID"}
            </div>
          </div>
          <div style={{ marginLeft:"auto" }}>
            <Badge color={stock.near_buy ? "#22c55e" : "#fbbf24"}>{stock.near_buy ? "NEAR BUY POINT" : "NOT IN RANGE"}</Badge>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
          {letters.map(l => (
            <div key={l.k} style={{ display:"grid", gridTemplateColumns:"28px 1fr auto", alignItems:"center", gap:10, padding:"8px 12px", background:"#0a0d10", borderRadius:5, border:`1px solid ${l.ok ? "#22c55e22" : "#1e2530"}` }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color: l.ok ? "#22c55e" : "#475569" }}>{l.k}</div>
              <div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#94a3b8" }}>{l.label}</div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#64748b", marginTop:1 }}>{l.desc}</div>
              </div>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:600, color: l.ok ? "#22c55e" : "#475569", textAlign:"right" }}>{typeof l.val === "number" ? l.val : l.val}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:16 }}>
          {[["RS Rating", stock.rs, rsColor(stock.rs)], ["EPS Rating", stock.eps, rsColor(stock.eps)], ["Composite", stock.comp, rsColor(stock.comp)]].map(([label, val, color]) => (
            <div key={label} style={{ padding:"10px 12px", background:"#0a0d10", borderRadius:5, border:`1px solid ${color}33` }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#64748b" }}>{label}</div>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:22, fontWeight:800, color, lineHeight:1.2, marginTop:2 }}>{val}</div>
              <RsBar value={val} width="100%" />
            </div>
          ))}
        </div>

        <div style={{ padding:"10px 12px", background:"#0a0d10", borderRadius:5, border:"1px solid #1e2530", marginBottom:16 }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#64748b", marginBottom:4 }}>CHART PATTERN</div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <Badge color="#f59e0b">{stock.base}</Badge>
            <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#94a3b8" }}>SMR: <span style={{ color:"#22c55e", fontWeight:600 }}>{stock.smr}</span></span>
          </div>
        </div>

        <AIAnalysis ticker={stock.ticker} name={stock.name} />

        <button onClick={onClose} style={{ marginTop:16, width:"100%", padding:10, background:"transparent", border:"1px solid #1e2530", borderRadius:5, color:"#475569", fontFamily:"'IBM Plex Mono',monospace", fontSize:11, cursor:"pointer" }}>CLOSE</button>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [tab, setTab] = useState("industries");
  const [selected, setSelected] = useState(null);
  const [sortKey, setSortKey] = useState("rank");
  const [filterRs, setFilterRs] = useState(0);
  const [flash, setFlash] = useState({});
  const [ticker, setTicker] = useState("");
  const [aiQuery, setAiQuery] = useState("");
  const [aiOut, setAiOut] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = GOOGLE_FONT;
    document.head.appendChild(link);
  }, []);

  // simulate live price flicker
  useEffect(() => {
    const id = setInterval(() => {
      const idx = Math.floor(Math.random() * WATCHLIST.length);
      setFlash(f => ({ ...f, [WATCHLIST[idx].ticker]: true }));
      setTimeout(() => setFlash(f => ({ ...f, [WATCHLIST[idx].ticker]: false })), 400);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  const sortedWatchlist = [...WATCHLIST]
    .filter(s => s.rs >= filterRs)
    .sort((a, b) => {
      if (sortKey === "rs") return b.rs - a.rs;
      if (sortKey === "comp") return b.comp - a.comp;
      if (sortKey === "chg") return b.chg - a.chg;
      return b.rs - a.rs;
    });

  const runScreener = async () => {
    if (!aiQuery.trim() || aiLoading) return;
    setAiLoading(true); setAiOut("");
    try {
      const res = await fetch("/api/claude", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          messages:[{ role:"user", content:`You are a CANSLIM stock screener assistant as of March 2026. The user asks: "${aiQuery}". Respond with actionable stock ideas, RS ratings, key metrics, and CANSLIM scores. Be specific, concise, data-driven. Max 300 words. Format clearly.` }]
        })
      });
      const d = await res.json();
      setAiOut(d.content?.[0]?.text || "No result.");
    } catch { setAiOut("Error."); }
    setAiLoading(false);
  };

  const S = {
    wrap: { minHeight:"100vh", background:"#080b0e", fontFamily:"'Syne',sans-serif", color:"#f1f5f9", padding:"0 0 40px" },
    header: { borderBottom:"1px solid #1e2530", padding:"18px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0a0d10" },
    logo: { fontSize:20, fontWeight:800, color:"#f59e0b", letterSpacing:"-0.02em" },
    mktStatus: { fontFamily:"'IBM Plex Mono',monospace", fontSize:11, padding:"5px 12px", borderRadius:4, background:"#22c55e18", color:"#22c55e", border:"1px solid #22c55e33", fontWeight:600 },
    tabs: { display:"flex", gap:2, padding:"16px 28px 0", borderBottom:"1px solid #1e2530" },
    tab: (active) => ({ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:600, padding:"8px 16px", border:"none", borderBottom: active ? "2px solid #f59e0b" : "2px solid transparent", background:"transparent", color: active ? "#f59e0b" : "#475569", cursor:"pointer", letterSpacing:"0.05em", transition:"all 0.15s" }),
    content: { padding:"24px 28px" },
  };

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={S.logo}>CANSLIM RS</div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569" }}>MARKET DASHBOARD · MAR 25 2026</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#64748b" }}>
            DIST DAYS: <span style={{ color:"#fbbf24" }}>{MARKET_STATUS.distribution}</span>
          </div>
          <div style={S.mktStatus}>● {MARKET_STATUS.status}</div>
        </div>
      </div>

      {/* Market overview bar */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"#1e2530" }}>
        {[["S&P 500","6,506","-1.51%","#f87171"],["NASDAQ","21,648","-2.01%","#f87171"],["VIX","26.78","+11.3%","#f87171"],["GOLD","$4,522","-0.66%","#fbbf24"]].map(([label,val,chg,col]) => (
          <div key={label} style={{ padding:"10px 18px", background:"#0a0d10" }}>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569" }}>{label}</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:15, fontWeight:600, color:"#f1f5f9", marginTop:2 }}>{val}</div>
            <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:col }}>{chg}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {[["industries","INDUSTRY GROUPS"],["watchlist","WATCHLIST"],["screener","AI SCREENER"]].map(([id,label]) => (
          <button key={id} style={S.tab(tab===id)} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={S.content}>

        {/* ── INDUSTRY GROUPS TAB ── */}
        {tab === "industries" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#475569" }}>
                {INDUSTRY_GROUPS.length} GROUPS · SORTED BY RS RATING · WEEK OF MAR 25
              </div>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569" }}>
                ● ≥90 &nbsp; ● 80–89 &nbsp; ● 70–79 &nbsp; ● &lt;70
              </div>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:3 }}>
              {/* header */}
              <div style={{ display:"grid", gridTemplateColumns:"36px 1fr 64px 140px 64px 64px 64px 180px", gap:12, padding:"6px 14px", fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569", letterSpacing:"0.04em" }}>
                <span>#</span><span>INDUSTRY</span><span>RS</span><span>RS BAR</span><span>WK</span><span>4WK</span><span>YTD</span><span>LEADERS</span>
              </div>

              {INDUSTRY_GROUPS.map(g => (
                <div key={g.rank} style={{ display:"grid", gridTemplateColumns:"36px 1fr 64px 140px 64px 64px 64px 180px", gap:12, alignItems:"center", padding:"9px 14px", background:"#0a0d10", borderRadius:4, border:`1px solid ${g.rs >= 80 ? rsColor(g.rs)+"22" : "#1e2530"}`, transition:"all 0.15s", cursor:"default" }}>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#475569", fontWeight:600 }}>{g.rank}</div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color: g.rs >= 80 ? "#f1f5f9" : "#64748b" }}>{g.name}</div>
                    <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569", marginTop:1 }}>{g.stocks} stocks</div>
                  </div>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:15, fontWeight:700, color:rsColor(g.rs) }}>{g.rs}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <RsBar value={g.rs} width={100} />
                  </div>
                  <Sparkline pct={g.wk1} />
                  <Sparkline pct={g.wk4} />
                  <Sparkline pct={g.ytd} />
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>
                    {g.leaders.map(l => (
                      <span key={l} style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, padding:"2px 6px", background:"#131920", borderRadius:3, color:"#94a3b8", border:"1px solid #1e2530", cursor:"pointer" }} onClick={() => { const s = WATCHLIST.find(w => w.ticker === l); if(s) setSelected(s); }}>{l}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── WATCHLIST TAB ── */}
        {tab === "watchlist" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16, flexWrap:"wrap" }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#475569" }}>SORT BY:</div>
              {[["rs","RS RATING"],["comp","COMPOSITE"],["chg","% CHANGE"]].map(([k,l]) => (
                <button key={k} onClick={() => setSortKey(k)} style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, padding:"4px 10px", background: sortKey===k ? "#f59e0b22" : "transparent", color: sortKey===k ? "#f59e0b" : "#475569", border:`1px solid ${sortKey===k ? "#f59e0b44" : "#1e2530"}`, borderRadius:3, cursor:"pointer" }}>{l}</button>
              ))}
              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569" }}>MIN RS:</span>
                <input type="range" min={0} max={90} step={10} value={filterRs} onChange={e => setFilterRs(+e.target.value)} style={{ width:80 }} />
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#f59e0b", minWidth:24 }}>{filterRs}</span>
              </div>
            </div>

            {/* Table header */}
            <div style={{ display:"grid", gridTemplateColumns:"80px 1fr 56px 56px 70px 80px 80px 90px 90px", gap:10, padding:"6px 14px", fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569", letterSpacing:"0.04em", borderBottom:"1px solid #1e2530" }}>
              <span>TICKER</span><span>NAME</span><span>RS</span><span>EPS</span><span>COMP</span><span>PRICE</span><span>CHG%</span><span>PATTERN</span><span>SMR/VOL</span>
            </div>

            {sortedWatchlist.map(s => (
              <div key={s.ticker} onClick={() => setSelected(s)} style={{ display:"grid", gridTemplateColumns:"80px 1fr 56px 56px 70px 80px 80px 90px 90px", gap:10, alignItems:"center", padding:"11px 14px", borderBottom:"1px solid #0d1117", cursor:"pointer", background: flash[s.ticker] ? "#f59e0b08" : "transparent", transition:"background 0.3s" }}>
                <div>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:14, fontWeight:700, color: s.near_buy ? "#22c55e" : "#f1f5f9" }}>{s.ticker}</div>
                  {s.near_buy && <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:9, color:"#22c55e", marginTop:1 }}>● BUY RANGE</div>}
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#94a3b8" }}>{s.name}</div>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569" }}>{s.group}</div>
                </div>
                <div>
                  <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:700, color:rsColor(s.rs) }}>{s.rs}</div>
                  <RsBar value={s.rs} width={40} />
                </div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:600, color:rsColor(s.eps) }}>{s.eps}</div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:600, color:rsColor(s.comp) }}>{s.comp}</div>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:600, color:"#f1f5f9" }}>${s.price}</div>
                <Sparkline pct={s.chg} />
                <Badge color={s.near_buy ? "#22c55e" : "#f59e0b"}>{s.base}</Badge>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#64748b" }}>{s.smr} · {s.vol_rel}×vol</div>
              </div>
            ))}

            <div style={{ marginTop:12, padding:"10px 14px", background:"#0a0d10", borderRadius:5, border:"1px solid #1e2530" }}>
              <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569" }}>CLICK ANY ROW FOR FULL CANSLIM SCORECARD + AI ANALYSIS</span>
            </div>
          </div>
        )}

        {/* ── AI SCREENER TAB ── */}
        {tab === "screener" && (
          <div style={{ maxWidth:720 }}>
            <div style={{ marginBottom:24 }}>
              <div style={{ fontFamily:"'Syne',sans-serif", fontSize:18, fontWeight:800, color:"#f59e0b", marginBottom:6 }}>AI-POWERED CANSLIM SCREENER</div>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#475569", lineHeight:1.7 }}>
                Ask anything about current market leaders, RS rankings, industry rotation, or get CANSLIM scores for specific stocks. Powered by Claude.
              </div>
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:8 }}>
              <input
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runScreener()}
                placeholder="e.g. What are the top 5 RS leaders in copper and gold right now?"
                style={{ flex:1, fontFamily:"'IBM Plex Mono',monospace", fontSize:12, padding:"10px 14px", background:"#0a0d10", border:"1px solid #1e2530", borderRadius:5, color:"#f1f5f9", outline:"none" }}
              />
              <button onClick={runScreener} disabled={aiLoading} style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, fontWeight:700, padding:"10px 18px", background: aiLoading ? "#1e2530" : "#f59e0b", color: aiLoading ? "#475569" : "#000", border:"none", borderRadius:5, cursor: aiLoading ? "default" : "pointer", letterSpacing:"0.05em" }}>
                {aiLoading ? "..." : "SCREEN →"}
              </button>
            </div>

            <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:20 }}>
              {["Best RS stocks in gold right now","Top CANSLIM setups near buy points","Compare VST vs CEG CANSLIM scores","AI power infrastructure leaders to watch","Which industries are rotating in this week?"].map(q => (
                <button key={q} onClick={() => { setAiQuery(q); }} style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, padding:"4px 10px", background:"#0a0d10", border:"1px solid #1e2530", borderRadius:3, color:"#64748b", cursor:"pointer" }}>{q}</button>
              ))}
            </div>

            {aiOut && (
              <div style={{ background:"#0a0d10", border:"1px solid #f59e0b33", borderRadius:6, padding:20 }}>
                <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#f59e0b", marginBottom:10, letterSpacing:"0.05em" }}>▶ CANSLIM SCREENER OUTPUT</div>
                <pre style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:"#94a3b8", lineHeight:1.8, whiteSpace:"pre-wrap", margin:0 }}>{aiOut}</pre>
              </div>
            )}

            <div style={{ marginTop:28, padding:20, background:"#0a0d10", borderRadius:6, border:"1px solid #1e2530" }}>
              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:10, color:"#475569", marginBottom:14, letterSpacing:"0.04em" }}>CANSLIM QUICK REFERENCE</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10 }}>
                {[
                  ["C","Current EPS >25% QoQ acceleration"],
                  ["A","Annual EPS >25% last 3 years"],
                  ["N","New product, mgmt, 52-wk high"],
                  ["S","Big vol on up days, light on down"],
                  ["L","RS Rating 80+ vs all US stocks"],
                  ["I","Inst. ownership increasing (A/B SMR)"],
                  ["M","Confirmed uptrend — buy only here"],
                ].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                    <span style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:"#f59e0b", lineHeight:1 }}>{k}</span>
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:"#64748b", lineHeight:1.5 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CANSLIM Detail Modal */}
      {selected && <CANSLIMCard stock={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
