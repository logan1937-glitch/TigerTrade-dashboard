import { useState, useMemo } from "react";
import { TT } from "./tt.js";
import { SearchIcon, StarBtn } from "./components.jsx";
import { RSLine, BarMeter } from "./charts.jsx";

const LETTERS = ["C", "A", "N", "S", "L", "I", "M"];

const fmtAsOf = (ms) => {
  try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};

function Spark({ data }) {
  const w = 64, h = 26, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: "block" }}>
      <polygon points={area} fill="color-mix(in oklch, var(--cat-growth) 18%, transparent)" />
      <polyline points={pts} fill="none" stroke="var(--cat-growth)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusPill({ status }) {
  const map = { buy: ["In Buy Zone", "var(--cat-growth)"], ext: ["Extended", "var(--sev-high)"], watch: ["Watch", "var(--cat-data)"] };
  const [label, color] = map[status];
  return <span className="badge badge-cat" style={{ "--c": color }}>{label}</span>;
}

function fmtPx(n) { return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2); }

/* ----------------------------- SCREENER ----------------------------- */
function Screener({ rows, onOpenStock }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("score");
  const [statusF, setStatusF] = useState("all");
  const view = useMemo(() => {
    let r = rows.filter((x) => (x.tk + " " + x.name + " " + x.group).toLowerCase().includes(q.toLowerCase()));
    if (statusF !== "all") r = r.filter((x) => x.status === statusF);
    const key = { score: "score", rs: "rs", pass: "pass", chg: "chg" }[sort];
    return [...r].sort((a, b) => b[key] - a[key]);
  }, [rows, q, sort, statusF]);

  return (
    <div className="wrap">
      <div className="filters" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="search-wrap"><SearchIcon /><input className="search" placeholder="search ticker / group…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="seg">
            {[["all", "All"], ["buy", "Buy zone"], ["ext", "Extended"], ["watch", "Watch"]].map(([id, l]) => (
              <button key={id} className="seg-btn" data-active={statusF === id} onClick={() => setStatusF(id)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="filters-right">
          <span className="minwt-lab">Sort</span>
          <div className="seg">
            {[["score", "Score"], ["rs", "RS"], ["pass", "Pass"], ["chg", "% Chg"]].map(([id, l]) => (
              <button key={id} className="seg-btn" data-active={sort === id} onClick={() => setSort(id)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="listmeta"><span className="count"><b>{view.length}</b> leaders · sorted by {sort}</span>
        <span className="count mono" style={{ opacity: .8 }}>click a row for full analysis</span></div>

      <div className="cs-table">
        <div className="cs-head">
          <span>Ticker</span><span style={{ textAlign: "right" }}>Price</span><span>RS</span><span>Trend</span>
          <span>CAN SLIM</span><span style={{ textAlign: "right" }}>Buy Status</span><span style={{ textAlign: "right" }}>Score</span>
        </div>
        {view.map((r, i) => (
          <div className="cs-row reveal" key={r.tk} style={{ "--i": i }} onClick={() => onOpenStock(r)}>
            <div className="cs-tk"><StarBtn wkey={"st:" + r.tk} kind="stock" refId={r.tk} /><span className="cs-tk-txt"><span className="cs-sym">{r.tk}</span><span className="cs-name">{r.name}</span></span></div>
            <div className="cs-px"><span className="cs-price mono">${fmtPx(r.px)}</span><span className="cs-chg mono" data-up={r.chg >= 0}>{r.chg >= 0 ? "+" : ""}{r.chg.toFixed(2)}%</span></div>
            <div className="cs-rs mono">{r.rs}<i style={{ width: r.rs + "%" }} /></div>
            <div><Spark data={r.spark} /></div>
            <div className="cs-letters">{LETTERS.map((L, j) => <span key={j} className="cs-let" data-on={r.breakdown[j].pass}>{L}</span>)}</div>
            <div style={{ textAlign: "right" }}><StatusPill status={r.status} /></div>
            <div className="cs-score mono" data-grade={r.score >= 93 ? "a" : "b"}>{r.score}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- MARKET HEALTH --------------------------- */
function MarketHealth() {
  const m = TT.MKT;
  return (
    <div className="wrap mh">
      <div className="mh-grid">
        <div className="mh-card mh-trend reveal" style={{ "--i": 0 }}>
          <span className="mh-k mono">Market trend</span>
          <span className="mh-trend-v">{m.trend}</span>
          <p className="mh-note">{m.trendNote}</p>
          <div className="mh-dist">
            <span className="mh-k mono">Distribution days</span>
            <div className="mh-dots">{Array.from({ length: m.distMax }).map((_, i) => <span key={i} data-on={i < m.distDays} />)}</div>
            <span className="mono" style={{ color: "var(--muted)" }}>{m.distDays} / {m.distMax}</span>
          </div>
          <div className="mh-ftd"><span className="mh-k mono">Last follow-through day</span><b className="mono">{m.lastFTD}</b></div>
        </div>

        <div className="mh-card reveal" style={{ "--i": 1 }}>
          <span className="mh-k mono">Index health</span>
          <div className="mh-idx">
            {m.indexes.map((ix) => (
              <div className="mh-irow" key={ix.k}>
                <span className="mh-iname">{ix.k}</span>
                <span className="mono mh-iv">{ix.v}</span>
                <span className="mono mh-ichg" data-up={ix.chg >= 0}>{ix.chg >= 0 ? "+" : ""}{ix.chg}%</span>
                <span className="mh-ima" data-on={ix.above50}>50d</span>
                <span className="mh-ima" data-on={ix.above200}>200d</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mh-card reveal" style={{ "--i": 2 }}>
          <span className="mh-k mono">Breadth</span>
          <div className="mh-breadth">
            <div className="mh-b"><span className="mh-bk mono">New highs / lows</span><span className="mh-bv mono"><b className="up">{m.breadth.newHighs}</b> / <b className="dn">{m.breadth.newLows}</b></span></div>
            <div className="mh-b"><span className="mh-bk mono">% above 50-day</span><span className="mh-bv mono">{m.breadth.pctAbove50}%</span><BarMeter value={m.breadth.pctAbove50} c="var(--cat-growth)" /></div>
            <div className="mh-b"><span className="mh-bk mono">Up volume</span><span className="mh-bv mono">{m.breadth.upVolPct}%</span><BarMeter value={m.breadth.upVolPct} c="var(--cat-growth)" /></div>
            <div className="mh-b"><span className="mh-bk mono">Adv/Dec ratio</span><span className="mh-bv mono">{m.breadth.advDec}:1</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- PLAYBOOK ----------------------------- */
function CanslimPlaybook({ rows, onOpenStock }) {
  const buys = rows.filter((s) => s.status === "buy").slice(0, 5);
  return (
    <div className="wrap pb">
      <div className="pb-card pb-brief">
        <h3><span className="hero-badge" style={{ padding: "3px 7px", fontSize: 9, "--accent": "var(--cat-growth)", color: "var(--cat-growth)" }}>AI</span> Screener read · 13 Jun 2026</h3>
        <p>The general market is in a <b>confirmed uptrend</b> with just 3 distribution days — buying is permitted.
          Leadership is concentrated in <b>semiconductors, power/electrification, and precious metals</b>.</p>
        <p>Highest-conviction actionable setups are names <b>in-range off a sound base</b> on volume —
          not the extended megacaps. {buys.map((b) => b.tk).join(", ")} are clearing or holding pivots.</p>
        <p>Risk discipline: keep individual entries within 5% of the pivot, cap losses at 7–8%, and
          tighten up if distribution days climb toward 5–6.</p>
        <div className="pb-ai-input">
          <input placeholder="Ask the screener… e.g. ‘semis in buy range under $150’" />
          <button style={{ background: "var(--cat-growth)" }}>Ask</button>
        </div>
      </div>
      <div className="pb-card">
        <h3 style={{ color: "var(--cat-growth)" }}>Actionable now</h3>
        <div className="pb-list">
          {buys.map((b) => (
            <button className="pb-item pb-item-btn" key={b.tk} onClick={() => onOpenStock(b)}>
              <span className="pb-k">{b.tk}</span>
              <span className="pb-v">{b.name}<small>Buy ${b.buyLo}–{b.buyHi} · RS {b.rs} · score {b.score}</small></span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ SHELL ------------------------------ */
export function CanslimView({ onOpenStock, live = { status: "loading" }, rows = TT.CANSLIM }) {
  const [tab, setTab] = useState("screener");

  const buyCount = rows.filter((s) => s.status === "buy").length;
  const leaders = rows.filter((s) => s.score >= 93).length;

  const isLive = live.status === "live";
  const meta = isLive
    ? `Live prices · as of ${fmtAsOf(live.asOf)} · ${live.count}/${live.total} live`
    : live.status === "loading"
      ? "Connecting to live feed…"
      : "Demo prices · not live — set FMP_API_KEY to go live";
  const dotColor = isLive ? "var(--cat-growth)" : live.status === "loading" ? "var(--accent)" : "var(--sev-extreme)";

  return (
    <>
      <div className="hero">
        <div className="hero-glow" />
        <div className="wrap hero-row">
          <div className="hero-left">
            <div className="hero-eyebrow mono"><span className="hero-pulse" style={{ background: dotColor }} />{isLive ? "Live relative-strength leadership" : "Relative-strength leadership"}</div>
            <h1 className="hero-title">CANSLIM Screener</h1>
            <span className="hero-meta" style={!isLive && live.status !== "loading" ? { color: "var(--sev-extreme)" } : undefined}>{meta}</span>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="hero-badge" style={{ "--accent": "var(--cat-growth)", color: "var(--cat-growth)" }}>
              <span className="pulse" style={{ background: "var(--cat-growth)" }} />{buyCount} in buy zone</span>
            <span className="hero-badge">{leaders} A-grade leaders</span>
          </div>
        </div>
      </div>

      <div className="statstrip">
        <div className="wrap">
          <div className="statgrid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            <div className="statcell reveal" data-soon="true" style={{ "--i": 0 }}><div className="lab">Market Trend</div><div className="val" style={{ fontSize: 18, color: "var(--cat-growth)" }}>Confirmed Uptrend</div><div className="tm mono">buying permitted</div></div>
            <div className="statcell reveal" style={{ "--i": 1 }}><div className="lab">Distribution Days</div><div className="val">3</div><div className="tm mono">rolling 25-session</div></div>
            <div className="statcell reveal" style={{ "--i": 2 }}><div className="lab">Last FTD</div><div className="val">MAY 1</div><div className="tm mono">follow-through day</div></div>
            <div className="statcell reveal" style={{ "--i": 3 }}><div className="lab">New Highs / Lows</div><div className="val">184 / 41</div><div className="tm mono">NYSE + Nasdaq</div></div>
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="subnav">
          {[["screener", "Screener"], ["health", "Market Health"], ["playbook", "Playbook"]].map(([id, l]) => (
            <button key={id} className="subtab" data-active={tab === id} onClick={() => setTab(id)}>{l}</button>
          ))}
        </div>
      </div>

      <div key={tab}>
        {tab === "screener" && <Screener rows={rows} onOpenStock={onOpenStock} />}
        {tab === "health" && <MarketHealth />}
        {tab === "playbook" && <CanslimPlaybook rows={rows} onOpenStock={onOpenStock} />}
      </div>
    </>
  );
}
