import { useState, useMemo } from "react";
import { TT } from "./tt.js";
import { SearchIcon, StarBtn } from "./components.jsx";
import { RSLine, BarMeter } from "./charts.jsx";

const LETTERS = ["L", "E", "A", "D", "E", "R", "S"];

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

function fmtPx(n) { if (n == null || Number.isNaN(+n)) return "—"; return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2); }

/* ----------------------------- SCREENER ----------------------------- */
const TF_BARS = { "1W": 5, "1M": 21, "3M": 63, "1Y": 252 };
// % return over the selected timeframe, from real adjusted closes (1D uses the
// live quote change; falls back to daily change when history isn't available)
function periodReturn(s, tf) {
  const c = s.closes, n = c ? c.length : 0;
  if (tf === "1D") return s.chg != null ? s.chg : (n >= 2 ? (c[n - 1] / c[n - 2] - 1) * 100 : 0);
  if (!c || n < 2) return s.chg || 0;
  const back = TF_BARS[tf] || 21;
  const i = Math.max(0, n - 1 - back);
  return (c[n - 1] / c[i] - 1) * 100;
}

function Screener({ rows, onOpenStock, onLookup, lookupBusy, lookupErr }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("score");
  const [statusF, setStatusF] = useState("all");
  const [tf, setTf] = useState("1D");
  const [addSym, setAddSym] = useState("");
  const submitLookup = (e) => { e.preventDefault(); if (onLookup) onLookup(addSym); setAddSym(""); };
  const view = useMemo(() => {
    let r = rows.filter((x) => (x.tk + " " + x.name + " " + x.group).toLowerCase().includes(q.toLowerCase()));
    if (statusF !== "all") r = r.filter((x) => x.status === statusF);
    r = r.map((x) => ({ ...x, _ret: periodReturn(x, tf) }));
    if (sort === "chg") return [...r].sort((a, b) => b._ret - a._ret);
    const key = { score: "score", rs: "rs", pass: "pass" }[sort];
    return [...r].sort((a, b) => (b[key] || 0) - (a[key] || 0));
  }, [rows, q, sort, statusF, tf]);

  return (
    <div className="wrap">
      <div className="filters" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="search-wrap"><SearchIcon /><input className="search" placeholder="search ticker / group…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {onLookup && (
            <form onSubmit={submitLookup} className="cs-lookup" title="Look up any ticker">
              <input className="search" style={{ width: 150, paddingLeft: 12 }} placeholder="add any ticker…" value={addSym}
                onChange={(e) => setAddSym(e.target.value)} aria-label="Add any ticker" />
              <button type="submit" className="seg-btn" data-active="true" disabled={lookupBusy} style={{ padding: "8px 12px" }}>{lookupBusy ? "…" : "＋ Add"}</button>
              {lookupErr && <span className="cs-lookup-err mono">{lookupErr}</span>}
            </form>
          )}
          <div className="seg">
            {[["all", "All"], ["buy", "Buy zone"], ["ext", "Extended"], ["watch", "Watch"]].map(([id, l]) => (
              <button key={id} className="seg-btn" data-active={statusF === id} onClick={() => setStatusF(id)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="filters-right">
          <span className="minwt-lab">Δ</span>
          <div className="seg">
            {["1D", "1W", "1M", "3M", "1Y"].map((id) => (
              <button key={id} className="seg-btn" data-active={tf === id} onClick={() => setTf(id)}>{id}</button>
            ))}
          </div>
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
          <span>Ticker</span><span style={{ textAlign: "right" }}>Price · Δ{tf}</span><span>RS</span><span>Trend</span>
          <span>Leadership</span><span>Signals</span><span style={{ textAlign: "right" }}>Buy Status</span><span style={{ textAlign: "right" }}>Score</span>
        </div>
        {view.map((r, i) => (
          <div className="cs-row reveal" key={r.tk} style={{ "--i": i }} onClick={() => onOpenStock(r)}>
            <div className="cs-tk"><StarBtn wkey={"st:" + r.tk} kind="stock" refId={r.tk} /><span className="cs-tk-txt"><span className="cs-sym">{r.tk}</span><span className="cs-name">{r.name}</span></span></div>
            <div className="cs-px"><span className="cs-price mono">{r.px != null ? "$" + fmtPx(r.px) : "—"}</span><span className="cs-chg mono" data-up={r._ret >= 0}>{r._ret >= 0 ? "+" : ""}{(r._ret || 0).toFixed(2)}%</span></div>
            <div className="cs-rs mono">{r.rs != null ? r.rs : "—"}{r.rs != null && <i style={{ width: r.rs + "%" }} />}</div>
            <div>{r.spark && r.spark.length ? <Spark data={r.spark} /> : <span className="cs-sig-na mono">—</span>}</div>
            <div className="cs-letters">{r.coverage === "full" && r.breakdown.length ? LETTERS.map((L, j) => <span key={j} className="cs-let" data-on={r.breakdown[j].pass}>{L}</span>) : <span className="cs-sig-na mono">—</span>}</div>
            <div className="cs-sig">
              {r.sig ? (
                <>
                  <span className="cs-stage" data-stage={r.sig.stage || 0} title={`Stage ${r.sig.stage || "?"} — ${r.sig.stageLabel || ""}`}>{r.sig.stage ? "S" + r.sig.stage : "—"}</span>
                  {r.sig.rsNewHigh && <span className="cs-flag" data-lead={r.sig.rsLeads || undefined} title={r.sig.rsLeads ? "RS line at a new high before price" : "RS line at a new high"}>RS↑</span>}
                  {r.sig.pocketPivot && <span className="cs-flag" title="Pocket pivot">◆</span>}
                </>
              ) : <span className="cs-sig-na mono">—</span>}
            </div>
            <div style={{ textAlign: "right" }}>{r.status ? <StatusPill status={r.status} /> : <span className="cs-sig-na mono">—</span>}</div>
            <div className="cs-score mono" data-grade={r.grade || (r.score >= 93 ? "a" : "b")}>{(r.sig || r.coverage === "full") ? r.score : "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- MARKET HEALTH --------------------------- */
const fmtIdx = (v) => (v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 2 }));

function MarketHealth({ market }) {
  const liveMh = !!market;
  // live computed data when available; illustrative fallback, clearly labeled
  const m = liveMh
    ? {
        trend: market.trend, trendNote: market.trendNote,
        distDays: market.distDays, distMax: market.distMax, lastFTD: market.lastFTD || "—",
        indexes: market.indexes.map((ix) => ({ k: ix.k, v: fmtIdx(ix.price), chg: ix.chg != null ? +ix.chg.toFixed(2) : 0, above50: !!ix.above50, above200: !!ix.above200 })),
        breadth: market.breadth,
      }
    : TT.MKT;
  const b = m.breadth;
  return (
    <div className="wrap mh">
      <div className="listmeta" style={{ marginBottom: 14 }}>
        <span className="count">{liveMh
          ? <><b>Live</b> · computed from index EOD data{market.asOf ? ` · as of ${new Date(market.asOf).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</>
          : <><b>Illustrative</b> · live market data unavailable</>}</span>
        {liveMh && <span className="count mono" style={{ opacity: .8 }}>trend & distribution from the S&amp;P 500</span>}
      </div>
      <div className="mh-grid">
        <div className="mh-card mh-trend reveal" style={{ "--i": 0 }}>
          <span className="mh-k mono">Market trend</span>
          <span className="mh-trend-v" style={m.trend !== "Confirmed Uptrend" ? { color: m.trend === "Market In Correction" ? "var(--sev-extreme)" : "var(--sev-high)" } : undefined}>{m.trend}</span>
          <p className="mh-note">{m.trendNote}</p>
          <div className="mh-dist">
            <span className="mh-k mono">Distribution days</span>
            <div className="mh-dots">{Array.from({ length: m.distMax }).map((_, i) => <span key={i} data-on={i < m.distDays} />)}</div>
            <span className="mono" style={{ color: "var(--muted)" }}>{m.distDays} / {m.distMax}</span>
          </div>
          <div className="mh-ftd"><span className="mh-k mono">{liveMh ? "Last 1.25%+ up day on volume" : "Last follow-through day"}</span><b className="mono">{m.lastFTD}</b></div>
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
          <span className="mh-k mono">{liveMh ? `Breadth · tracked universe (${b.n})` : "Breadth"}</span>
          <div className="mh-breadth">
            <div className="mh-b"><span className="mh-bk mono">New 52-wk highs / lows</span><span className="mh-bv mono"><b className="up">{b.newHighs}</b> / <b className="dn">{b.newLows}</b></span></div>
            {b.pctAbove50 != null && <div className="mh-b"><span className="mh-bk mono">% above 50-day</span><span className="mh-bv mono">{b.pctAbove50}%</span><BarMeter value={b.pctAbove50} c="var(--cat-growth)" /></div>}
            {b.upVolPct != null && <div className="mh-b"><span className="mh-bk mono">Up $-volume</span><span className="mh-bv mono">{b.upVolPct}%</span><BarMeter value={b.upVolPct} c="var(--cat-growth)" /></div>}
            <div className="mh-b"><span className="mh-bk mono">Adv/Dec ratio</span><span className="mh-bv mono">{b.advDec}:1</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- PLAYBOOK ----------------------------- */
function CanslimPlaybook({ rows, onOpenStock, market }) {
  const buys = rows.filter((s) => s.status === "buy" && s.buyLo != null).slice(0, 5);
  // lead with the live regime read when we have it
  const lead = market
    ? <p>The general market reads <b>{market.trend.toLowerCase()}</b> with {market.distDays} distribution day{market.distDays === 1 ? "" : "s"} on the S&amp;P —
        {market.trend === "Confirmed Uptrend" ? " buying is permitted." : " prioritize risk management over new exposure."}{" "}
        {market.breadth.pctAbove50 != null && <>Across the tracked universe, <b>{market.breadth.pctAbove50}%</b> of names hold their 50-day line.</>}</p>
    : <p>The general market is in a <b>confirmed uptrend</b> with just 3 distribution days — buying is permitted.
        Leadership is concentrated in <b>semiconductors, power/electrification, and precious metals</b>.</p>;
  return (
    <div className="wrap">
    <div className="pb">
      <div className="pb-card pb-brief">
        <h3><span className="hero-badge" style={{ padding: "3px 7px", fontSize: 9, "--accent": "var(--cat-growth)", color: "var(--cat-growth)" }}>AI</span> Screener read · {TT.todayLabel}</h3>
        {lead}
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
    <p className="mono" style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--dim)", margin: "18px 2px 64px", maxWidth: "70ch" }}>
      The <b style={{ color: "var(--muted)", fontWeight: 600 }}>TigerTrade Leadership Model (LEADERS)</b> is our own 7-factor
      relative-strength growth framework — Leadership, Earnings momentum, Accumulation, Durable growth, Emerging breakout,
      Rising sponsorship, Setup. Its factors follow classic leadership-investing principles popularized by William J. O'Neil.
      TigerTrade is independent and not affiliated with, sponsored by, or endorsed by Investor's Business Daily;
      “CAN SLIM” is a registered trademark of Investor's Business Daily, Inc. Educational use only — not investment advice.
    </p>
    </div>
  );
}

/* ------------------------------ SHELL ------------------------------ */
export function CanslimView({ onOpenStock, live = { status: "loading" }, rows = TT.CANSLIM, market = null, onLookup, lookupBusy, lookupErr }) {
  const [tab, setTab] = useState("screener");

  const buyCount = rows.filter((s) => s.status === "buy").length;
  const leaders = rows.filter((s) => (s.score || 0) >= 80).length;

  const isLive = live.status === "live";
  const meta = isLive
    ? `Prices ${live.source ? `via ${live.source}` : ""} (delayed) · as of ${fmtAsOf(live.asOf)} · ${live.count}/${live.total}`
    : live.status === "loading"
      ? "Connecting to data feed…"
      : "Demo prices · not live";
  const dotColor = isLive ? "var(--accent)" : live.status === "loading" ? "var(--accent)" : "var(--sev-extreme)";

  return (
    <>
      <div className="hero">
        <div className="hero-glow" />
        <div className="wrap hero-row">
          <div className="hero-left">
            <div className="hero-eyebrow mono"><span className="hero-pulse" style={{ background: dotColor }} />{isLive ? "Live relative-strength leadership" : "Relative-strength leadership"}</div>
            <h1 className="hero-title">Leadership Screener</h1>
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
            {market ? (
              <>
                <div className="statcell reveal" data-soon={market.trend === "Confirmed Uptrend"} style={{ "--i": 0 }}>
                  <div className="lab">Market Trend</div>
                  <div className="val" style={{ fontSize: 18, color: market.trend === "Confirmed Uptrend" ? "var(--cat-growth)" : market.trend === "Market In Correction" ? "var(--sev-extreme)" : "var(--sev-high)" }}>{market.trend}</div>
                  <div className="tm mono">{market.trend === "Confirmed Uptrend" ? "buying permitted" : "risk management first"}</div>
                </div>
                <div className="statcell reveal" style={{ "--i": 1 }}><div className="lab">Distribution Days</div><div className="val">{market.distDays}</div><div className="tm mono">S&amp;P · rolling 25-session</div></div>
                <div className="statcell reveal" style={{ "--i": 2 }}><div className="lab">Last Power Day</div><div className="val">{(market.lastFTD || "—").toUpperCase()}</div><div className="tm mono">1.25%+ gain on volume</div></div>
                <div className="statcell reveal" style={{ "--i": 3 }}><div className="lab">New Highs / Lows</div><div className="val">{market.breadth.newHighs} / {market.breadth.newLows}</div><div className="tm mono">tracked universe ({market.breadth.n})</div></div>
              </>
            ) : (
              <>
                <div className="statcell reveal" style={{ "--i": 0 }}><div className="lab">Market Trend</div><div className="val" style={{ fontSize: 18 }}>—</div><div className="tm mono">awaiting live data</div></div>
                <div className="statcell reveal" style={{ "--i": 1 }}><div className="lab">Distribution Days</div><div className="val">—</div><div className="tm mono">rolling 25-session</div></div>
                <div className="statcell reveal" style={{ "--i": 2 }}><div className="lab">Last Power Day</div><div className="val">—</div><div className="tm mono">1.25%+ gain on volume</div></div>
                <div className="statcell reveal" style={{ "--i": 3 }}><div className="lab">New Highs / Lows</div><div className="val">—</div><div className="tm mono">tracked universe</div></div>
              </>
            )}
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
        {tab === "screener" && <Screener rows={rows} onOpenStock={onOpenStock} onLookup={onLookup} lookupBusy={lookupBusy} lookupErr={lookupErr} />}
        {tab === "health" && <MarketHealth market={market} />}
        {tab === "playbook" && <CanslimPlaybook rows={rows} onOpenStock={onOpenStock} market={market} />}
      </div>
    </>
  );
}
