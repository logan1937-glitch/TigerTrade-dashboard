import { createContext, useContext, useState, useRef, useEffect, useMemo } from "react";
import { TT } from "./tt.js";
import { RadarScope, ScopeLegend } from "./radarScope.jsx";

export const SEV_LABEL = { extreme: "Extreme", high: "High", medium: "Medium", low: "Low" };

/* TigerTrade rising-bars mark — amber bars, tallest in jade (the signal) */
export function BrandMark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="3" y="14" width="4.4" height="7" rx="1.3" fill="var(--brand)" />
        <rect x="9.8" y="9" width="4.4" height="12" rx="1.3" fill="var(--brand)" />
        <rect x="16.6" y="4" width="4.4" height="17" rx="1.3" fill="var(--accent)" />
      </svg>
    </span>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}
function Chevron() {
  return <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>;
}

/* -------- Watchlist context -------- */
export const WatchCtx = createContext({ list: [], has: () => false, toggle: () => {}, count: 0 });
export function useWatch() { return useContext(WatchCtx); }

/* -------- CANSLIM data context (live-merged where available) --------
   Single source of truth so the watchlist and event-drawer ticker links show
   the same live prices as the screener. Defaults to the static dataset. */
export const CanslimCtx = createContext({ list: TT.CANSLIM, byTicker: TT.CS_BYTICKER });
export function useCanslim() { return useContext(CanslimCtx); }

/* price alerts — armed from the stock drawer, persisted, and evaluated against
   live quotes on every data refresh. `hits` = alerts that have crossed. */
export const AlertCtx = createContext({ list: [], for: () => null, set: () => {}, clear: () => {}, hits: 0 });
export function useAlerts() { return useContext(AlertCtx); }

export function StarIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M12 3.4l2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.4l-5.07 2.7.97-5.68L3.78 9.4l5.7-.83z" />
    </svg>
  );
}
export function StarBtn({ wkey, kind, refId, label }) {
  const w = useWatch();
  const on = w.has(wkey);
  return (
    <button className={"star" + (label ? " star-lbl" : "")} data-on={on || undefined} aria-pressed={on}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      onClick={(e) => { e.stopPropagation(); w.toggle(wkey, { kind, ref: refId }); }}>
      <StarIcon filled={on} />{label && <span>{on ? "Watching" : "Watch"}</span>}
    </button>
  );
}

/* mini reaction sparkline (avg cumulative move around the event) */
export function MiniReaction({ data }) {
  const W = 128, H = 26;
  const vals = data.map((d) => d.v);
  const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0), range = (hi - lo) || 1;
  const x = (i) => (i / (data.length - 1)) * W;
  const y = (v) => 3 + (1 - (v - lo) / range) * (H - 6);
  const line = data.map((d, i) => `${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join(" ");
  const zeroIdx = data.findIndex((d) => d.d === 0);
  return (
    <svg className="mini-react" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1={y(0)} x2={W} y2={y(0)} className="mini-zero" />
      <line x1={x(zeroIdx)} y1="0" x2={x(zeroIdx)} y2={H} className="mini-evt" />
      <polyline points={line} className="mini-line" />
    </svg>
  );
}

/* company logo (FMP image CDN → clean monogram fallback), dark-theme friendly */
export function Logo({ ticker, size = 34, radius = "var(--radius-sm)" }) {
  const [err, setErr] = useState(false);
  const box = { width: size, height: size, borderRadius: radius, flex: "none" };
  if (err) {
    return (
      <div style={{ ...box, display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 800,
        fontSize: size * 0.36, letterSpacing: "-0.02em", color: "var(--accent-ink)",
        background: "linear-gradient(135deg, color-mix(in oklch, var(--accent) 88%, white), var(--accent))" }}>
        {ticker.slice(0, 2)}
      </div>
    );
  }
  return (
    <img src={`https://financialmodelingprep.com/image-stock/${ticker}.png`} alt={ticker} loading="lazy"
      onError={() => setErr(true)}
      style={{ ...box, objectFit: "contain", background: "#fff", border: "1px solid var(--border-2)", padding: Math.max(2, Math.round(size * 0.09)) }} />
  );
}

/* live ET clock */
export function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  try {
    return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" }).format(now);
  } catch { return now.toLocaleTimeString(); }
}

/* count-up number */
export function CountUp({ value, dur = 700 }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now();
    const tick = (t) => {
      const p = Math.min((t - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * e));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, dur]);
  return <span>{n}</span>;
}

function SunIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>;
}
function MoonIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" /></svg>;
}

/* ----------------------------- TOP BAR ----------------------------- */
export function TopBar({ product, setProduct, onOpenCmd, onOpenWatch, watchCount, alertHits = 0, mode, onToggleMode }) {
  const clock = useClock();
  return (
    <div className="topbar">
      <div className="brand"><BrandMark /><span className="brand-tx"><span className="b1">Tiger</span><span className="b2">Trade</span></span></div>
      <div className="nav-pills">
        <button className="navpill" data-active={product === "radar"} onClick={() => setProduct("radar")}>Volatility · Momentum Radar</button>
        <button className="navpill" data-active={product === "canslim"} onClick={() => setProduct("canslim")}>Leadership Screener</button>
      </div>
      <div className="topbar-spacer" />
      <div className="live"><span className="live-dot" /><span className="live-tx mono">LIVE</span><span className="live-clk mono">{clock} ET</span></div>
      <button className="cmdk-btn" onClick={onOpenCmd}><SearchIcon /><span>Search</span><kbd>⌘K</kbd></button>
      <button className="watch-btn" onClick={onOpenWatch} aria-label="Open watchlist">
        <StarIcon filled={watchCount > 0} />
        {watchCount > 0 && <span className="watch-ct mono">{watchCount}</span>}
        {alertHits > 0 && <span className="watch-hit mono" title={`${alertHits} price alert${alertHits === 1 ? "" : "s"} triggered`}>{alertHits}</span>}
      </button>
      <button className="icon-btn" onClick={onToggleMode} aria-label="Toggle light / dark" title={mode === "light" ? "Switch to dark" : "Switch to light"}>
        {mode === "light" ? <MoonIcon /> : <SunIcon />}
      </button>
    </div>
  );
}

/* ------------------------------- HERO ------------------------------ */
export function Hero({ events, onSelectEvent, activeId, showScope, live, macro }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", ((e.clientX - r.left) / r.width * 100) + "%");
    el.style.setProperty("--my", ((e.clientY - r.top) / r.height * 100) + "%");
  };
  const next = events[0];
  const nc = next ? TT.CAT_MAP[next.cat] : null;
  const nEcon = next && next.econ && (next.econ.previous != null || next.econ.estimate != null) ? next.econ : null;
  // live event-landscape KPIs — aggregate read on the slate (distinct from the
  // named-event countdowns in the stat strip below). daysUntil = -t for upcoming.
  const up = events.filter((e) => !e.past);
  const dU = (e) => -e.t;
  const thisWeek = up.filter((e) => dU(e) >= 0 && dU(e) <= 7).length;
  const hot30 = up.filter((e) => dU(e) >= 0 && dU(e) <= 30 && (e.sev === "extreme" || e.sev === "high")).length;
  const extDays = up.filter((e) => e.sev === "extreme").map(dU).filter((d) => d >= 0).sort((a, b) => a - b);
  const nextExt = extDays.length ? extDays[0] : null;
  return (
    <div className="hero" ref={ref} onMouseMove={onMove}>
      <div className="hero-glow" />
      <div className="wrap hero-row">
        <div className="hero-left">
          <div className="hero-eyebrow mono"><span className="hero-pulse" />Live macro-event surveillance</div>
          <h1 className="hero-title">Volatility <span className="accentword">·</span> Momentum Radar</h1>
          <p className="hero-lede">The scheduled catalysts that move volatility — rates, liquidity, data, and geopolitics — mapped by proximity and sized by expected impact.</p>
          <div className="hero-kpis">
            <div className="hero-kpi">
              <span className="hero-kpi-v mono">{thisWeek}</span>
              <span className="hero-kpi-k mono">This week <small>T≤7d</small></span>
            </div>
            <div className="hero-kpi">
              <span className="hero-kpi-v mono">{hot30}</span>
              <span className="hero-kpi-k mono">High-impact <small>next 30d</small></span>
            </div>
            <div className="hero-kpi" data-accent="ext">
              <span className="hero-kpi-v mono">{nextExt != null ? nextExt + "d" : "—"}</span>
              <span className="hero-kpi-k mono">To next extreme</span>
            </div>
          </div>
          {next && (
            <button className="hero-next" style={{ "--c": nc.color }} onClick={() => onSelectEvent(next)} aria-label={`Next catalyst: ${next.title}`}>
              <span className="hero-next-top">
                <span className="hero-next-l">
                  <span className="hero-next-k mono">Next catalyst</span>
                  <span className="hero-next-name">{next.title}</span>
                  <span className="hero-next-meta mono"><span className="hero-next-dot" />{nc.label} · {next.approx ? "~" : ""}{next.date}</span>
                </span>
                <span className="hero-next-r">
                  <span className="hero-next-t mono">T–{Math.abs(next.t)}<small>D</small></span>
                  <span className="badge badge-sev" data-sev={next.sev}>{SEV_LABEL[next.sev]}</span>
                </span>
              </span>
              {nEcon && (
                <span className="hero-next-react">
                  <span className="hero-next-react-k mono">Release data</span>
                  <span className="hero-next-react-cap mono" style={{ marginLeft: 0 }}>
                    {nEcon.previous != null && <>prev <b style={{ color: "var(--text)" }}>{nEcon.previous}{nEcon.unit}</b></>}
                    {nEcon.estimate != null && <> · cons <b style={{ color: "var(--text)" }}>{nEcon.estimate}{nEcon.unit}</b></>}
                    {nEcon.actual != null && <> · act <b style={{ color: "var(--text)" }}>{nEcon.actual}{nEcon.unit}</b></>}
                  </span>
                </span>
              )}
            </button>
          )}
          <span className="hero-meta">{live ? "Live economic calendar" : "Event template 2026–2027"} · {up.length} catalysts tracked · updated {TT.todayISO}</span>
        </div>
        {showScope && (
          <div className="hero-right">
            {macro && <MacroBoard macro={macro} />}
            <div className="hero-scope">
              <div className="scope-frame">
                <i className="cnr tl" /><i className="cnr tr" /><i className="cnr bl" /><i className="cnr br" />
                <RadarScope events={events} onSelect={onSelectEvent} activeId={activeId} />
              </div>
              <ScopeLegend />
              <span className="scope-caption mono">{up.length} contacts in range · 150-day horizon · clockwise = time to event</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ TAPES ------------------------------ */
/* shared scrolling-tape shell: list doubled for a seamless loop, the copy
   aria-hidden/untabbable; hover or focus pauses; reduced-motion = static scroll */
function Tape({ label, children }) {
  return (
    <div className="tape" aria-label={label}>
      <div className="tape-track">{children}</div>
    </div>
  );
}

export function CatalystTape({ events, onSelect }) {
  if (!events || events.length < 2) return null;
  return (
    <Tape label="Upcoming catalysts">
      {[0, 1].map((copy) => events.slice(0, 12).map((ev) => (
        <button key={copy + "-" + ev.id} className="tick-item mono" style={{ "--c": TT.CAT_MAP[ev.cat].color }}
          onClick={() => onSelect(ev)} tabIndex={copy ? -1 : 0} aria-hidden={copy ? true : undefined}>
          <i className="tick-dot" /><b>T{ev.t}d</b><span className="tick-name">{ev.title}</span>
          <span className="tick-date">{ev.approx ? "~" : ""}{ev.date}</span>
        </button>
      )))}
    </Tape>
  );
}

export function StockTape({ rows, onPick }) {
  // top of the leaderboard, live prices — the screener's answer to the catalyst tape
  const items = useMemo(() =>
    (rows || []).filter((r) => r.px != null && r.score).sort((a, b) => b.score - a.score).slice(0, 14),
    [rows]);
  if (items.length < 2) return null;
  const fmt = (n) => (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2));
  return (
    <Tape label="Top leaders — live prices">
      {[0, 1].map((copy) => items.map((r) => {
        const up = (r.chg || 0) >= 0;
        return (
          <button key={copy + "-" + r.tk} className="tick-item mono" style={{ "--c": up ? "var(--cat-growth)" : "var(--sev-extreme)" }}
            onClick={() => onPick(r)} tabIndex={copy ? -1 : 0} aria-hidden={copy ? true : undefined}
            title={`${r.name} · score ${r.score}`}>
            <i className="tick-dot" /><b>{r.tk}</b><span className="tick-name">${fmt(r.px)}</span>
            <span className="tick-chg" data-up={up}>{up ? "+" : ""}{(+r.chg || 0).toFixed(2)}%</span>
          </button>
        );
      }))}
    </Tape>
  );
}

/* ---------------------------- MACRO BOARD --------------------------- */
// full-width sparkline for the CPI trend line
function MiniSpark({ data }) {
  if (!data || data.length < 2) return null;
  const w = 172, h = 20, max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 3) - 1.5}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  const c = up ? "var(--sev-extreme)" : "var(--cat-growth)";   // rising inflation reads hot
  return <svg className="mb-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={c} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const fmtRate = (v) => v.toFixed(2) + "%";
const fmtFx = (f) => (f.idx ? f.v.toFixed(2) : f.v.toFixed(f.v >= 100 ? 2 : 4));
const fmtComm = (v) => "$" + (v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(2));
const bpTxt = (bp) => (bp == null ? "—" : bp === 0 ? "0bp" : `${bp > 0 ? "+" : ""}${bp}bp`);
const pctTxt = (c) => (c == null ? "—" : c === 0 ? "0.00%" : `${c > 0 ? "+" : ""}${c}%`);
const dir = (x) => (x == null || x === 0 ? undefined : x > 0);   // neutral when flat

// live macro instrument panel beside the radar — rates, FX, commodities, inflation
export function MacroBoard({ macro }) {
  const { rates, fx, comm, cpi } = macro || {};
  const Row = ({ k, v, c, up }) => (
    <div className="mb-row">
      <span className="mb-k mono">{k}</span>
      <span className="mb-v mono">{v}</span>
      <span className="mb-c mono" data-up={up}>{c}</span>
    </div>
  );
  return (
    <div className="macroboard">
      {rates && rates.length > 0 && (
        <div className="mb-sec">
          <div className="mb-h mono">Rates</div>
          {rates.map((r) => <Row key={r.k} k={r.k} v={fmtRate(r.v)} c={bpTxt(r.bp)} up={dir(r.bp)} />)}
        </div>
      )}
      {fx && fx.length > 0 && (
        <div className="mb-sec">
          <div className="mb-h mono">FX</div>
          {fx.map((f) => <Row key={f.k} k={f.k} v={fmtFx(f)} c={pctTxt(f.chg)} up={dir(f.chg)} />)}
        </div>
      )}
      {comm && comm.length > 0 && (
        <div className="mb-sec">
          <div className="mb-h mono">Commodities</div>
          {comm.map((m) => <Row key={m.k} k={m.k} v={fmtComm(m.v)} c={pctTxt(m.chg)} up={dir(m.chg)} />)}
        </div>
      )}
      {cpi && (
        <div className="mb-sec">
          <div className="mb-h mono">Inflation</div>
          <div className="mb-row">
            <span className="mb-k mono">CPI YoY</span>
            <span className="mb-v mono">{cpi.v.toFixed(1)}%</span>
            <span className="mb-c mono" data-up={cpi.chg <= 0} title="change vs ~1 month ago — falling inflation reads green">{cpi.chg > 0 ? "+" : ""}{cpi.chg.toFixed(2)}</span>
          </div>
          <MiniSpark data={cpi.spark} />
        </div>
      )}
    </div>
  );
}

/* ---------------------------- STAT STRIP --------------------------- */
// derives the five countdown cells from the (possibly live re-dated) event list
const STAT_IDS = [[2, "NEXT FOMC"], [10, "NEXT CPI"], [3, "NEXT WITCHING"], [5, "NEXT RUSSELL"], [16, "US MIDTERMS"]];
export function StatStrip({ events }) {
  const horizon = 150;
  const byId = events ? Object.fromEntries(events.map((e) => [e.id, e])) : null;
  const cells = byId
    ? STAT_IDS.map(([id, lab]) => { const e = byId[id]; return e ? {
        lab, val: e.date, tm: e.t <= 0 ? `T${e.t}d` : `T+${e.t}d`, soon: e.t < 0 && e.t >= -7, live: !!e.live,
      } : null; }).filter(Boolean)
    : TT.STATS;
  return (
    <div className="statstrip">
      <div className="wrap">
        <div className="statgrid">
          {cells.map((s, i) => {
            const days = parseInt((s.tm.match(/\d+/) || [0])[0], 10);
            const prox = Math.max(0.04, 1 - Math.min(days, horizon) / horizon);
            return (
              <div className="statcell reveal" data-soon={s.soon} key={i} style={{ "--i": i }}>
                <div className="lab">{s.lab}{s.live && <span className="live-tag mono" title="Live-dated from the economic calendar">●</span>}</div>
                <div className="val">{s.val}</div>
                <div className="tm mono">{s.tm}</div>
                <div className="prox"><i style={{ width: (prox * 100) + "%" }} /></div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ SUBNAV ----------------------------- */
export function SubNav({ tab, setTab, counts }) {
  const tabs = [["radar", "Radar"], ["timeline", "Full Timeline"], ["calendar", "Calendar"], ["playbook", "Catalysts"]];
  return (
    <div className="wrap">
      <div className="subnav">
        {tabs.map(([id, label]) => (
          <button key={id} className="subtab" data-active={tab === id} onClick={() => setTab(id)}>
            {label}{id === "radar" && counts != null && <span className="subtab-ct mono">{counts}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------- FILTER BAR --------------------------- */
function FilterBar({ cats, toggleCat, query, setQuery, minWt, setMinWt }) {
  const anyOn = cats.size > 0;
  const wts = [["all", "All"], ["medium", "Med+"], ["high", "High+"], ["extreme", "Extreme"]];
  return (
    <div className="filters">
      <div className="catpills">
        {TT.CATEGORIES.map((c) => (
          <button key={c.id} className="catpill" style={{ "--c": c.color }}
               data-on={cats.has(c.id)} data-dim={anyOn && !cats.has(c.id)}
               onClick={() => toggleCat(c.id)}>
            <span className="cdot" />{c.label}
          </button>
        ))}
      </div>
      <div className="filters-right">
        <div className="search-wrap">
          <SearchIcon />
          <input className="search" placeholder="filter events…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="minwt-lab">Min Wt</span>
        <div className="seg">
          {wts.map(([id, label]) => (
            <button key={id} className="seg-btn" data-active={minWt === id} onClick={() => setMinWt(id)}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- EVENT ROW --------------------------- */
function EventRow({ ev, index, open, onToggle, flash, onOpenFull }) {
  const cat = TT.CAT_MAP[ev.cat];
  const d = TT.detail(ev.id);
  return (
    <div className={"event reveal" + (open ? " is-open" : "")} style={{ "--c": cat.color, "--i": index }}
         data-flash={flash || undefined} data-open={open || undefined} onClick={onToggle}>
      <div className="event-head">
        <StarBtn wkey={"ev:" + ev.id} kind="event" refId={ev.id} />
        <div className="event-date">
          <span className="event-d">{ev.approx && <span className="approx">~</span>}{ev.date}{ev.live && <span className="live-tag mono" title="Live-dated from the economic calendar">●</span>}</span>
          <span className="event-t mono">{ev.past ? `T+${ev.t}d` : `T${ev.t}d`}</span>
        </div>
        <div className="event-main">
          <div className="event-title">
            {ev.title}
            {ev.range && <span className="range">{ev.range}</span>}
          </div>
          <div className="event-desc">{ev.desc}</div>
          {ev.econ && (ev.econ.previous != null || ev.econ.estimate != null || ev.econ.actual != null) && (
            <div className="ed-econ mono">
              {ev.econ.previous != null && <span>Prev <b>{ev.econ.previous}{ev.econ.unit}</b></span>}
              {ev.econ.estimate != null && <span>Cons <b>{ev.econ.estimate}{ev.econ.unit}</b></span>}
              {ev.econ.actual != null && <span data-beat={ev.econ.estimate != null ? (ev.econ.actual >= ev.econ.estimate) : undefined}>Act <b>{ev.econ.actual}{ev.econ.unit}</b></span>}
            </div>
          )}
        </div>
        <div className="event-badges">
          <span className="badge badge-sev" data-sev={ev.sev}>{SEV_LABEL[ev.sev]}</span>
          <span className="badge badge-cat" style={{ "--c": cat.color }}>{cat.label}</span>
        </div>
        <Chevron />
      </div>

      <div className="event-detail">
        <div className="event-detail-inner">
          <div className="ed-grid">
            <div className="ed-col">
              <div className="ed-k mono">Scenario</div>
              <p className="ed-p">{d.scenario}</p>
              <div className="ed-k mono">Desk hedge</div>
              <p className="ed-p">{d.hedge}</p>
              <div className="ed-tickers">
                {d.tickers.map((t) => <span key={t} className="ticker mono">{t}</span>)}
              </div>
            </div>
            <div className="ed-col ed-metrics">
              <div className="ed-metric">
                <div className="ed-mk mono">Typical move</div>
                <div className="ed-mv mono">±{d.move.toFixed(1)}%</div>
                <div className="ed-bar"><i style={{ width: Math.min(d.move / 3, 1) * 100 + "%" }} /></div>
              </div>
              <div className="ed-metric">
                <div className="ed-mk mono">Conviction</div>
                <div className="ed-mv mono">{d.conviction}<small>/100</small></div>
                <div className="ed-bar"><i style={{ width: d.conviction + "%" }} /></div>
              </div>
              <div className="ed-actions">
                <StarBtn wkey={"ev:" + ev.id} kind="event" refId={ev.id} label />
                <button className="ed-btn ed-btn-primary" onClick={(e) => { e.stopPropagation(); onOpenFull && onOpenFull(ev); }}>Full analysis →</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- RADAR VIEW -------------------------- */
export function RadarView(props) {
  const { events, showPast, setShowPast, replayKey, focus, onOpenFull } = props;
  const [openId, setOpenId] = useState(null);
  useEffect(() => { if (focus && focus.id != null) setOpenId(focus.id); }, [focus]);
  return (
    <div className="wrap">
      <FilterBar {...props} />
      <div className="listmeta">
        <span className="count"><b>{events.length}</b> events · {showPast ? "incl. past" : "upcoming only"}</span>
        <button className="linkbtn" data-active={showPast} onClick={() => setShowPast((v) => !v)}>{showPast ? "Hide past" : "Show past"}</button>
      </div>
      <div className="eventlist" key={replayKey}>
        {events.length === 0
          ? <div className="empty">No events match the current filters.</div>
          : events.map((ev, i) => (
            <EventRow key={ev.id} ev={ev} index={i} open={openId === ev.id} flash={focus && focus.id === ev.id ? focus.tick : null}
              onToggle={() => setOpenId((id) => id === ev.id ? null : ev.id)} onOpenFull={onOpenFull} />
          ))}
      </div>
    </div>
  );
}
