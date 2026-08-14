import { useEffect, useState, useRef, useMemo } from "react";
import { TT } from "./tt.js";
import { PriceChart, RSLine, ScoreDonut, BarMeter } from "./charts.jsx";
import { StarBtn, StarIcon, Logo, NA, Chip, FigPct, useWatch, useCanslim, useAlerts, usePositions, SEV_LABEL } from "./components.jsx";
import { fetchProfile } from "./profile.js";

const fmtPx2 = (n) => (n == null || Number.isNaN(+n) ? "—" : n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : (+n).toFixed(2));
/* Same split as the Playbook: the formatters keep returning a string dash where
   a value is spliced into a sentence, and this yields the primitive where the
   value stands alone as the answer and the reader deserves the reason. */
const val = (v, fmt, why) => (v == null || Number.isNaN(+v) ? <NA why={why} /> : fmt(v));

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
}
function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>;
}
/* briefcase + plus — "put this name in the book" */
function PortfolioIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7.5" width="18" height="12.5" rx="2" /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /><path d="M12 11v5M9.5 13.5h5" /></svg>;
}
/* a price line with a level under it — the Playbook is a setup and its stop */
function PlaybookIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14.5l4.5-5 3.5 3 4-6L21 4" /><path d="M3 19.5h18" strokeDasharray="3 3" /></svg>;
}
function BellIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z" /><path d="M10.4 19a1.9 1.9 0 0 0 3.2 0" /></svg>;
}

/* ---------------------------- DRAWER SHELL ---------------------------- */
export function Drawer({ open, onClose, children, label }) {
  const startX = useRef(null);
  const startY = useRef(null);
  const panelRef = useRef(null);
  const returnTo = useRef(null);
  const [dx, setDx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Focus follows the dialog and comes back. The screener's rows are
     `tabIndex={0}` and the palette is keyboard-first, so a drawer that opened
     without moving focus left Tab walking the page BEHIND it, and closing
     dropped focus to <body> — from there the only way back to the row you were
     on is tabbing from the top of a 500-row table. */
  useEffect(() => {
    if (open) {
      returnTo.current = document.activeElement;
      // the panel itself, not its first control: announces the dialog without
      // skipping past the heading a screen reader should hear first
      const id = requestAnimationFrame(() => panelRef.current && panelRef.current.focus());
      return () => cancelAnimationFrame(id);
    }
    const el = returnTo.current;
    returnTo.current = null;
    // only restore if the trigger is still in the document — a row can be
    // filtered away while the drawer is open, and focusing a detached node
    // silently sends focus to <body> anyway
    if (el && typeof el.focus === "function" && document.contains(el)) el.focus();
  }, [open]);

  useEffect(() => { if (!open) setDx(0); }, [open]);

  // swipe-right to dismiss (touch)
  const onTouchStart = (e) => { startX.current = e.touches[0].clientX; startY.current = e.touches[0].clientY; };
  const onTouchMove = (e) => {
    if (startX.current == null) return;
    const ddx = e.touches[0].clientX - startX.current;
    const ddy = e.touches[0].clientY - startY.current;
    if (Math.abs(ddx) > Math.abs(ddy)) setDx(Math.max(0, ddx)); // horizontal intent only
  };
  const onTouchEnd = () => {
    if (dx > 80) onClose();
    setDx(0); startX.current = null; startY.current = null;
  };

  return (
    <div className="drawer-root" data-open={open || undefined} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}
        ref={panelRef} tabIndex={-1}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}>
        {open && children}
      </aside>
    </div>
  );
}

/* ----------------------------- EVENT DRAWER ----------------------------- */
export function EventDrawerBody({ ev, onClose, onPick, vix }) {
  const cat = TT.CAT_MAP[ev.cat];
  const d = TT.detail(ev.id);
  const em = vix && vix.level != null ? vix.level / Math.sqrt(252) : null;   // VIX-implied 1-day move
  const { byTicker } = useCanslim();
  return (
    <div className="dr" style={{ "--c": cat.color }}>
      <div className="dr-top">
        <div className="dr-top-l">
          <span className="dr-kicker mono" style={{ color: cat.color }}>{cat.label}</span>
          <span className="badge badge-sev" data-sev={ev.sev}>{SEV_LABEL[ev.sev]}</span>
        </div>
        <button className="dr-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>

      <div className="dr-head">
        <div className="dr-date mono">{ev.approx ? "~" : ""}{ev.date}{ev.range ? ` · ${ev.range}` : ""}<span className="dr-t" style={{ color: cat.color }}>{ev.past ? `T+${ev.t}d` : `T${ev.t}d`}</span>{ev.live && <span className="live-tag mono" title="Live-dated from the economic calendar"> ● live</span>}</div>
        <h2 className="dr-title">{ev.title}</h2>
        <p className="dr-lead">{ev.desc}</p>
      </div>

      {ev.econ && (ev.econ.previous != null || ev.econ.estimate != null || ev.econ.actual != null) && (
        <div className="dr-tiles" style={{ marginBottom: 0 }}>
          <div className="dr-tile"><span className="dr-tk mono">Previous</span><span className="dr-tv mono">{val(ev.econ.previous, (x) => `${x}${ev.econ.unit}`, "The calendar carried no prior reading for this release")}</span></div>
          <div className="dr-tile"><span className="dr-tk mono">Consensus</span><span className="dr-tv mono">{val(ev.econ.estimate, (x) => `${x}${ev.econ.unit}`, "No consensus estimate published for this release yet")}</span></div>
          <div className="dr-tile"><span className="dr-tk mono">Actual</span><span className="dr-tv mono" data-neg={ev.econ.actual != null && ev.econ.estimate != null && ev.econ.actual >= ev.econ.estimate}>{ev.econ.actual != null ? `${ev.econ.actual}${ev.econ.unit}` : "pending"}</span></div>
          <div className="dr-tile"><span className="dr-tk mono">Surprise</span><span className="dr-tv mono">{ev.econ.actual != null && ev.econ.estimate != null
            ? `${(ev.econ.actual - ev.econ.estimate) > 0 ? "+" : ""}${+(ev.econ.actual - ev.econ.estimate).toFixed(2)}${ev.econ.unit}`
            : <NA why="A surprise needs both the print and the consensus — this release has not reported" />}</span></div>
        </div>
      )}

      <div className="dr-sec dr-2col">
        <div>
          <div className="dr-k mono">Scenario</div>
          <p className="dr-p">{d.scenario}</p>
        </div>
        <div>
          <div className="dr-k mono">Desk hedge</div>
          <p className="dr-p">{d.hedge}</p>
          <div className="dr-meta-row">
            <div title="Expected 1-day S&P 500 move implied by the current VIX (VIX ÷ √252) — the market's live volatility read">
              <span className="dr-mk mono">Expected move <span style={{ opacity: .6 }}>· VIX-implied</span></span>
              <div className="dr-mv mono">{val(em, (x) => `±${x.toFixed(1)}%`, "The expected move is derived from the VIX level — no VIX quote in this snapshot")}</div>
              {em != null && <BarMeter value={Math.min(em / 3, 1) * 100} c="var(--accent)" />}
            </div>
          </div>
        </div>
      </div>

      <div className="dr-sec">
        <div className="dr-k mono">Markets to watch</div>
        <div className="dr-tickers">
          {d.tickers.map((t) => {
            const stock = byTicker && byTicker[t];
            return <button key={t} className="ticker mono" data-link={!!stock}
              onClick={() => stock && onPick && onPick(stock)}>{t}{stock && " ↗"}</button>;
          })}
        </div>
      </div>

      <div className="dr-actions">
        <StarBtn wkey={"ev:" + ev.id} kind="event" refId={ev.id} name={ev.title} label />
        <button className="ed-btn">Add to calendar</button>
        <button className="ed-btn ed-btn-primary">Set alert</button>
      </div>
    </div>
  );
}

/* ----------------------------- STOCK DRAWER ----------------------------- */
const fmtCap = (v) => (v == null ? "—" : v >= 1e12 ? (v / 1e12).toFixed(2) + "T" : v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : (v / 1e6).toFixed(0) + "M");

// real fundamentals — replaces the old editorial figures. One income-statement
// call (17 quarters → EPS + revenue growth) plus one ratios-TTM call (ROE, net
// margin), cached a day. epsQ/salesQ = latest quarter vs the year-ago quarter;
// epsA = 3-yr CAGR of trailing-4-quarter EPS. Nothing here is fabricated.
const epsCache = new Map();
const num = (...vals) => { for (const v of vals) if (v != null && Number.isFinite(+v)) return +v; return null; };
async function fetchEps(tk) {
  if (epsCache.has(tk)) return epsCache.get(tk);
  try {
    const raw = localStorage.getItem("tt_eps_" + tk);
    if (raw) { const { t, d } = JSON.parse(raw); if (Date.now() - t < 864e5) { epsCache.set(tk, d); return d; } }
  } catch {}
  try {
    const [incRes, ratRes] = await Promise.all([
      fetch(`/api/fmp?endpoint=income-statement&symbol=${encodeURIComponent(tk)}&period=quarter&limit=17`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/fmp?endpoint=ratios-ttm&symbol=${encodeURIComponent(tk)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    if (!Array.isArray(incRes) || incRes.length < 5) return null;
    const eps = incRes.map((q) => (q.epsDiluted ?? q.eps ?? null));   // newest first
    const rev = incRes.map((q) => (q.revenue ?? null));
    let epsQ = null, epsQNew = false;
    if (eps[0] != null && eps[4] != null) {
      if (eps[4] > 0) epsQ = +(((eps[0] - eps[4]) / eps[4]) * 100).toFixed(0);
      else if (eps[0] > 0) epsQNew = true;                       // turned profitable YoY
    }
    const sum = (a, b) => (eps.slice(a, b).every((v) => v != null) ? eps.slice(a, b).reduce((x, y) => x + y, 0) : null);
    const a0 = sum(0, 4), a3 = eps.length >= 16 ? sum(12, 16) : null;
    let epsA = null, epsANew = false;
    if (a0 != null && a3 != null) {
      if (a3 > 0 && a0 > 0) epsA = +((Math.pow(a0 / a3, 1 / 3) - 1) * 100).toFixed(0);
      else if (a3 <= 0 && a0 > 0) epsANew = true;
    }
    const salesQ = rev[0] != null && rev[4] != null && rev[4] > 0 ? +(((rev[0] - rev[4]) / rev[4]) * 100).toFixed(0) : null;
    const ro = Array.isArray(ratRes) ? ratRes[0] : ratRes;
    const roeRaw = ro && num(ro.returnOnEquityTTM, ro.returnOnEquity);
    const marRaw = ro && num(ro.netProfitMarginTTM, ro.netIncomeMarginTTM, ro.netProfitMargin);
    const pct = (v) => (v == null ? null : Math.abs(v) <= 3 ? +(v * 100).toFixed(1) : +v.toFixed(1)); // ratio (0–1) → %
    // last 8 reported quarters of revenue, oldest first — the results-card bars
    const revSeries = incRes.slice(0, 8)
      .map((q) => ({ v: q.revenue ?? null, p: q.period || null, y: q.calendarYear || q.fiscalYear || (q.date || "").slice(0, 4) || null }))
      .filter((x) => x.v != null && Number.isFinite(+x.v))
      .reverse();
    const d = { epsQ, epsQNew, epsA, epsANew, salesQ, roe: pct(roeRaw), netMargin: pct(marRaw), revSeries };
    epsCache.set(tk, d);
    try { localStorage.setItem("tt_eps_" + tk, JSON.stringify({ t: Date.now(), d })); } catch {}
    return d;
  } catch { return null; }
}

// first ~2 sentences, capped — drawer bios stay tight like the curated ones
const briefDesc = (t) => {
  if (!t) return null;
  const parts = t.split(/(?<=\.)\s+/);
  let out = "";
  for (const p of parts) { if (out && (out + p).length > 300) break; out += (out ? " " : "") + p; if (out.length > 180) break; }
  return out || t.slice(0, 280);
};

export function StockDrawerBody({ stock, onClose, onOpenPlaybook }) {
  const s = stock;
  const statusMap = { buy: ["In Buy Zone", "var(--cat-growth)"], ext: ["Extended", "var(--sev-high)"], watch: ["Watch", "var(--cat-data)"] };
  const [stLabel, stColor] = statusMap[s.status] || [null, null];
  const hasBase = s.pivot != null;                  // buy-point base (technical when history exists)
  const hasChart = s.closes && s.closes.length > 0; // real EOD history loaded
  const signalsOnly = s.coverage === "signals";

  // company profile: real description + market cap + HQ for every name — "—"
  // while loading / unavailable, never a stale or fabricated value
  const [prof, setProf] = useState("loading");
  useEffect(() => {
    let alive = true;
    setProf("loading");
    fetchProfile(s.tk).then((d) => { if (alive) setProf(d); });   // d = null when unavailable
    return () => { alive = false; };
  }, [s.tk]);
  const cap = prof && prof !== "loading" ? prof.cap : null;

  // fill the fundamental LEADERS slots (E, D) from real filings when the
  // scorecard has "needs data" placeholders
  const [eps, setEps] = useState("loading");
  useEffect(() => {
    let alive = true;
    setEps("loading");
    // fetch real fundamentals for every name — fills the LEADERS E/D slots AND
    // the Fundamentals block (EPS/sales growth, ROE, net margin)
    fetchEps(s.tk).then((d) => { if (alive) setEps(d); });
    return () => { alive = false; };
  }, [s.tk, s.breakdown]);
  const shownBreakdown = useMemo(() => {
    if (!s.breakdown || !s.breakdown.length) return [];
    const e = eps && eps !== "loading" ? eps : null;   // null while loading / on failure
    const ud = s.sig && s.sig.udVol;   // real up/down-volume ratio, refreshed once real bars load
    return s.breakdown.map((b) => {
      if (b.key === "f6" && ud != null) return { ...b, value: `U/D vol ${ud.toFixed(2)}`, pass: ud >= 1 };
      if (eps === "loading" && b.pass === null && (b.key === "f2" || b.key === "f4")) return { ...b, value: "loading…" };
      if (e && b.pass === null && b.key === "f2") {
        if (e.epsQNew) return { ...b, value: "Turned profitable YoY", pass: true };
        if (e.epsQ != null) return { ...b, value: `${e.epsQ >= 0 ? "+" : ""}${e.epsQ}% EPS vs yr-ago qtr`, pass: e.epsQ >= 25 };
        return { ...b, value: "no filings data" };
      }
      if (e && b.pass === null && b.key === "f4") {
        if (e.epsANew) return { ...b, value: "Turned profitable (3-yr)", pass: true };
        if (e.epsA != null) return { ...b, value: `${e.epsA >= 0 ? "+" : ""}${e.epsA}%/yr · 3-yr EPS`, pass: e.epsA >= 25 };
        return { ...b, value: "no filings data" };
      }
      return b;
    });
  }, [s.breakdown, eps, s.sig && s.sig.udVol]);
  const shownPass = shownBreakdown.filter((b) => b.pass === true).length;

  // order-plan ticket (planning only — not connected to a broker)

  // portfolio position for this name — entered here or on the portfolio tab
  const positions = usePositions();
  const held = positions.get(s.tk);
  const [posOpen, setPosOpen] = useState(false);
  const [posSh, setPosSh] = useState("");
  const [posCost, setPosCost] = useState("");
  const [posErn, setPosErn] = useState("");
  const [posEntry, setPosEntry] = useState("");
  // shares and cost are both optional — saving with neither still tracks the
  // name in the portfolio (price, sector, report date), just without a size.
  // The report date is optional too: it only earns its keep for a listing no
  // feed covers, and it is labelled as yours wherever it then appears.
  const savePos = () => { positions.add(s.tk, posSh, posCost, posErn, posEntry); setPosOpen(false); };

  // price alert: armed here, persisted, evaluated on every data refresh
  const alerts = useAlerts();
  const myAlert = alerts.for(s.tk);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertVal, setAlertVal] = useState("");
  useEffect(() => { setAlertOpen(false); }, [s.tk]);
  const armAlert = () => {
    const v = parseFloat(alertVal);
    if (!Number.isFinite(v) || v <= 0) return;
    alerts.set(s.tk, +v.toFixed(2), s.px ?? null);
    setAlertOpen(false);
  };
  /* The staged-order plan is gone, and with it a flat −8% stop, flat +20%/+25%
     targets and the reward:risk they implied. Those were heuristics wearing the
     same typography as the measured figures beside them, and the Playbook now
     sizes the same decision against a real ATR trail or Chandelier level with the
     arithmetic printed. Two overlapping tools, and this was the one making up its
     own numbers. */

  return (
    <div className="dr" style={{ "--c": "var(--cat-growth)" }}>
      <div className="dr-top">
        <div className="dr-top-l">
          <span className="dr-kicker mono">{s.sector} · {s.group}</span>
        </div>
        <button className="dr-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>

      <div className="dr-head dr-stockhead">
        <div>
          <div className="dr-symrow"><Logo ticker={s.tk} size={34} /><span className="dr-sym">{s.tk}</span>
            {/* "Signals-only" is a stated GAP — this name has price history but no
                editorial coverage — so it takes the absent tone rather than a
                colour that would read as a category it belongs to. */}
            {stLabel ? <span className="badge badge-cat" style={{ "--c": stColor }}>{stLabel}</span>
              : signalsOnly && <Chip tone="absent" title="Real price history and signals, but no editorial coverage for this name">Signals-only</Chip>}</div>
          <h2 className="dr-title dr-stockname">{s.name}</h2>
          <div className="dr-pxrow">
            <span className="dr-px mono">{val(s.px, (x) => "$" + x.toLocaleString(undefined, { maximumFractionDigits: 2 }), "No quote for this name in the nightly snapshot")}</span>
            <span className="dr-chg mono" data-up={s.chg == null ? undefined : s.chg >= 0}><FigPct v={s.chg} /></span>
            <span className="dr-grp mono">Mkt cap {val(cap, fmtCap, "Market cap comes from the company profile, which has not loaded for this name")}</span>
            {s.rs != null && <span className="dr-rs mono">RS {s.rs}</span>}
            {s.groupRank != null && <span className="dr-grp mono">Group #{s.groupRank}</span>}
          </div>
        </div>
        <ScoreDonut score={s.score} label="Score" />
      </div>

      {/* Actions sit directly under the header — watching a name or putting it in
          the portfolio is the most common thing to do in this drawer, and it used
          to require scrolling past the chart, signals and fundamentals to reach.
          Each expanding form opens in place, immediately below the bar. */}
      <div className="dr-actionbar">
        <div className="dr-actions">
          <StarBtn wkey={"st:" + s.tk} kind="stock" refId={s.tk} label />
          <button className="ed-btn" data-on={positions.has(s.tk) || undefined}
            onClick={() => { const h = positions.get(s.tk); setPosSh(h && h.shares != null ? String(h.shares) : ""); setPosCost(h && h.cost != null ? String(h.cost) : ""); setPosErn((h && h.ern) || ""); setPosEntry((h && h.entry) || ""); setAlertOpen(false); setPosOpen((v) => !v); }}>
            <PortfolioIcon />{positions.has(s.tk) ? "Edit position" : "Add position"}
          </button>
          <button className="ed-btn" data-on={!!myAlert || undefined}
            onClick={() => { setAlertVal(String(myAlert?.level ?? s.pivot ?? s.px ?? "")); setPosOpen(false); setAlertOpen((v) => !v); }}>
            <BellIcon />{myAlert ? "Edit alert" : "Set price alert"}
          </button>
          {/* Offered only when the swing block exists: the Playbook drops a name it
              cannot measure, so a link to a scan that will not contain this ticker
              is a link to a shrug. */}
          {onOpenPlaybook && s.sig && s.sig.swing && s.sig.swing.atr != null && (
            <button className="ed-btn" onClick={() => onOpenPlaybook(s.tk)}
              title="Show this name's ATR, contraction and trailing stop in the Playbook">
              <PlaybookIcon />Open in Playbook
            </button>
          )}
        </div>

        {posOpen && (
          <div className="dr-alert-form">
            <span className="mono dr-alert-lab">{positions.has(s.tk) ? "Update" : "Add"} {s.tk} position</span>
            <div className="dr-alert-row">
              <input className="dr-alert-in mono" type="number" step="any" min="0" value={posSh} placeholder="shares (opt)"
                onChange={(e) => setPosSh(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePos()} aria-label="Shares" autoFocus />
              <span className="mono dr-alert-cur">@ $</span>
              <input className="dr-alert-in mono" type="number" step="any" min="0" value={posCost} placeholder="cost (opt)"
                onChange={(e) => setPosCost(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePos()} aria-label="Cost per share" />
              <button className="ed-btn ed-btn-primary" onClick={savePos}>Save</button>
              {positions.has(s.tk) && <button className="ed-btn" onClick={() => { positions.remove(s.tk); setPosOpen(false); }}>Remove</button>}
            </div>
            <div className="dr-alert-row">
              <span className="mono dr-alert-cur">Entered</span>
              <input className="dr-alert-in mono dr-date-in" type="date" value={posEntry}
                onChange={(e) => setPosEntry(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePos()}
                aria-label="Entry date" style={{ flex: "0 0 auto" }}
                title="The day you took the trade — the ATR trailing stop follows the peak since then." />
              {posEntry && <button className="ed-btn" onClick={() => setPosEntry("")}>Clear</button>}
            </div>
            <div className="dr-alert-row">
              <span className="mono dr-alert-cur">Reports</span>
              <input className="dr-alert-in mono dr-date-in" type="date" value={posErn}
                onChange={(e) => setPosErn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && savePos()}
                aria-label="Next report date" style={{ flex: "0 0 auto" }} />
              {posErn && <button className="ed-btn" onClick={() => setPosErn("")}>Clear date</button>}
            </div>
            <span className="mono dr-alert-note">
              {s.ern && !s.ern.mine
                ? <>all three optional — the calendar already has {s.tk} reporting {new Date(s.ern.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {s.ern.est ? " (projected)" : ""}, so a date here would override it · stored on this device</>
                : s.ern
                  ? <>all three optional — your date is what puts {s.tk} on the earnings calendar; it is shown as yours,
                      never as confirmed. Clear it to fall back to whatever the feeds know · stored on this device</>
                  : <>all three optional — no feed has a report date for {s.tk}, so setting one here is what puts it on
                      your calendar. It is shown as yours, never as confirmed · stored on this device</>}</span>
          </div>
        )}
        {!posOpen && held && (
          <div className="dr-alert">
            {held.shares != null
              ? <>Holding <b className="mono">{held.shares.toLocaleString()}</b> share{held.shares === 1 ? "" : "s"}</>
              : <>Tracked in your portfolio<span className="mono"> · no size entered</span></>}
            {held.cost != null && <> at <b className="mono">${held.cost}</b></>}
            {s.px != null && held.shares != null && <> · value <b className="mono">${fmtPx2(held.shares * s.px)}</b>
              {held.cost != null && <> · P&amp;L <b className="mono">{s.px >= held.cost ? "+" : "−"}${fmtPx2(Math.abs((s.px - held.cost) * held.shares))}</b></>}</>}
            {s.px != null && held.shares == null && held.cost != null && <> · <b className="mono">
              {s.px >= held.cost ? "+" : "−"}{Math.abs((s.px / held.cost - 1) * 100).toFixed(1)}%</b> vs cost</>}
            <button className="linkbtn dr-alert-clear" onClick={() => positions.remove(s.tk)}>remove</button>
          </div>
        )}

        {alertOpen && (
          <div className="dr-alert-form">
            <span className="mono dr-alert-lab">Alert when {s.tk} crosses</span>
            <div className="dr-alert-row">
              <span className="mono dr-alert-cur">$</span>
              <input className="dr-alert-in mono" type="number" step="0.01" min="0" value={alertVal}
                onChange={(e) => setAlertVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && armAlert()}
                aria-label="Alert price level" autoFocus />
              <button className="ed-btn ed-btn-primary" onClick={armAlert}>Arm alert</button>
              {myAlert && <button className="ed-btn" onClick={() => { alerts.clear(s.tk); setAlertOpen(false); }}>Remove</button>}
            </div>
            <span className="mono dr-alert-note">checked against live quotes on every data refresh · stored on this device{s.pivot != null ? ` · pivot $${s.pivot}` : ""}</span>
          </div>
        )}
        {!alertOpen && myAlert && (
          <div className="dr-alert" data-hit={!!myAlert.hitAt || undefined}>
            {myAlert.hitAt ? (
              <>Alert hit — {s.tk} crossed <b className="mono">${myAlert.level}</b> ({myAlert.dir}) at <b className="mono">${myAlert.hitPx}</b> on {new Date(myAlert.hitAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
                <button className="linkbtn dr-alert-clear" onClick={() => alerts.clear(s.tk)}>clear</button></>
            ) : (
              <>Alert armed at <b className="mono">${myAlert.level}</b> ({myAlert.dir}{s.px != null ? ` · now $${fmtPx2(s.px)}` : ""}).
                <button className="linkbtn dr-alert-clear" onClick={() => alerts.clear(s.tk)}>remove</button></>
            )}
          </div>
        )}

      </div>

      {s.bio && (
        <div className="dr-bioblock">
          <p className="dr-bio">{s.bio}</p>
          <div className="dr-bio-meta mono">
            <span className="dr-bio-hq"><PinIcon />{s.hq}</span>
            <span className="dr-bio-sep">·</span>
            <span>{s.group}</span>
          </div>
        </div>
      )}

      {signalsOnly && (
        <div className="dr-bioblock">
          {prof !== "loading" && prof?.desc ? (
            <>
              <p className="dr-bio">{briefDesc(prof.desc)}</p>
              <div className="dr-bio-meta mono">
                {(prof.city || prof.state) && <><span className="dr-bio-hq"><PinIcon />{[prof.city, prof.state || prof.country].filter(Boolean).join(", ")}</span><span className="dr-bio-sep">·</span></>}
                <span>{prof.industry || s.group}</span>
              </div>
            </>
          ) : (
            <p className="dr-bio" style={{ opacity: .65 }}>{prof === "loading" ? "Loading company profile…" : "Company profile unavailable for this name."}</p>
          )}
          <p className="dr-bio-note mono">Ranked on technical momentum (RS, stage, breakout) — no curated buy-point base for this name.</p>
        </div>
      )}

      {hasChart && (
        <div className="dr-sec">
          <div className="dr-sec-h"><h3>Price &amp; volume</h3><span className="dr-sec-sub mono">{s.pivot != null ? `adjusted EOD · pivot ${s.pivot}` : "adjusted EOD"}</span></div>
          <PriceChart closes={s.closes} volume={s.volume} pivot={s.pivot} buyLo={s.buyLo} buyHi={s.buyHi} dates={s.dates} />
          {s.rsLine && s.rsLine.length > 1 && (
            <div className="dr-rs-wrap"><span className="dr-rs-lab mono">RS line vs S&amp;P{s.sig?.rsLeads ? " · new high before price ✦" : s.sig?.rsNewHigh ? " · new high" : ""}</span><RSLine rs={s.rsLine} /></div>
          )}
        </div>
      )}

      {s.sig && (
        <div className="dr-sec">
          <div className="dr-sec-h"><h3>Momentum signals</h3><span className="dr-sec-sub mono">computed from adjusted EOD · as of {s.sig.asOf}</span></div>
          <div className="dr-buygrid">
            <div className="dr-bp"><span className="dr-bpk mono">Stage</span><span className="dr-bpv">{s.sig.stage == null
              ? <NA why="Stage needs 30 weeks of closes against their moving average" />
              : <>{s.sig.stage} · {s.sig.stageLabel}</>}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">RS line</span><span className="dr-bpv" data-up={s.sig.rsNewHigh}>{s.sig.rsLeads ? "New high (leads price)" : s.sig.rsNewHigh ? "New high" : "Below high"}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">12-mo return</span><span className="dr-bpv mono" data-up={s.sig.ret12m >= 0}>{s.sig.ret12m >= 0 ? "+" : ""}{s.sig.ret12m}%</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">ADR%</span><span className="dr-bpv mono">{s.sig.adrPct}%</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Distribution days</span><span className="dr-bpv mono" data-warn={s.sig.distDays >= 5}>{s.sig.distDays} / 25</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">$ volume</span><span className="dr-bpv mono">${(s.sig.dollarVol / 1e6).toFixed(0)}M</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Off 52-wk high</span><span className="dr-bpv mono">{s.sig.atHigh ? "at high" : s.sig.off52 == null
              ? <NA why="Distance from the 52-week high needs a full year of closes" />
              : "−" + s.sig.off52 + "%"}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Pocket pivot</span><span className="dr-bpv" data-up={s.sig.pocketPivot}>{s.sig.pocketPivot ? "Yes ✦" : "No"}</span></div>
          </div>
        </div>
      )}

      {hasBase && (
      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Buy-point analysis</h3></div>
        <div className="dr-buygrid">
          <div className="dr-bp"><span className="dr-bpk mono">Base</span><span className="dr-bpv">{s.baseType}</span></div>
          <div className="dr-bp"><span className="dr-bpk mono">Length</span><span className="dr-bpv">{s.baseWeeks ? s.baseWeeks + " wks" : <NA why="Base length needs a measurable base — not enough history for this name" />}</span></div>
          <div className="dr-bp"><span className="dr-bpk mono">Depth</span><span className="dr-bpv">{s.baseDepth ? s.baseDepth + "%" : <NA why="Base depth needs a measurable base — not enough history for this name" />}</span></div>
          <div className="dr-bp"><span className="dr-bpk mono">Pivot</span><span className="dr-bpv mono">${s.pivot}</span></div>
          <div className="dr-bp"><span className="dr-bpk mono">Buy range</span><span className="dr-bpv mono">${s.buyLo}–{s.buyHi}</span></div>
          <div className="dr-bp" data-warn={s.pctExt > 5}><span className="dr-bpk mono">vs pivot</span><span className="dr-bpv mono" data-up={s.pctExt >= 0}>{s.pctExt > 0 ? "+" : ""}{s.pctExt}%</span></div>
        </div>
        <div className={"dr-verdict" + (s.status === "buy" ? " ok" : s.status === "ext" ? " warn" : " neutral")}>
          {s.status === "buy" && `Within buy range — ${s.pctExt <= 0 ? "at/below" : s.pctExt.toFixed(1) + "% past"} pivot. Actionable.`}
          {s.status === "ext" && `Extended ${s.pctExt}% past pivot — beyond the 5% buy zone. Wait for a new base.`}
          {s.status === "watch" && `Base still forming — no valid pivot yet. Add to watchlist.`}
        </div>
      </div>
      )}

      {s.ern && s.ern.days <= 7 && (
        <div className="dr-ern">
          <span className="dr-ern-tag mono">{s.ern.days === 0 ? "E·TODAY" : `E-${s.ern.days}`}</span>
          Earnings {s.ern.est ? "around " : ""}{new Date(s.ern.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {s.ern.time === "bmo" ? " before the open" : s.ern.time === "amc" ? " after the close" : ""}
          {s.ern.mine ? " — the date you set for this position, not a confirmed one" : ""}
          {s.ern.est ? " (projected — the company hasn't confirmed the date)" : ""}
          {" — "}reports gap through stops. New breakout entries this close to the print carry event risk.
        </div>
      )}

      {(() => {
        // ── latest reported quarter ────────────────────────────────────────
        // actual vs estimate straight from the FMP earnings calendar (baked into
        // the nightly snapshot), YoY from the filings, and the quarterly revenue
        // trend from the income statement. Every cell renders only when its real
        // value exists — a missing estimate is said, never inferred.
        const L = s.ernLast;
        const e = eps && eps !== "loading" ? eps : null;
        const bars = e && e.revSeries && e.revSeries.length >= 2 ? e.revSeries : null;
        if (!L && !bars) return null;
        const money = (v) => {
          if (v == null) return null;
          const a = Math.abs(v), sg = v < 0 ? "−" : "";
          if (a >= 1e12) return `${sg}$${(a / 1e12).toFixed(2)}T`;
          if (a >= 1e9) return `${sg}$${(a / 1e9).toFixed(2)}B`;
          if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(0)}M`;
          if (a >= 1e3) return `${sg}$${(a / 1e3).toFixed(0)}K`;
          return `${sg}$${a.toFixed(0)}`;
        };
        const usd = (v) => (v == null ? null : `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`);
        const sur = (a, est) => (a == null || est == null || est === 0 ? null : ((a - est) / Math.abs(est)) * 100);
        const yoy = (v) => (v == null ? null : `${v >= 0 ? "+" : ""}${v}% YoY`);
        const pill = (v) => v == null ? null : (
          <span className="dr-er-sur mono" data-beat={v >= 0}>{v >= 0 ? "Beat" : "Miss"} {v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(1)}%</span>
        );
        const cells = [];
        if (L && L.epsA != null) cells.push({ k: "EPS", v: usd(L.epsA), est: L.epsE != null ? `est ${usd(L.epsE)}` : "no estimate", s: sur(L.epsA, L.epsE), y: e ? yoy(e.epsQ) : null });
        if (L && L.revA != null) cells.push({ k: "Revenue", v: money(L.revA), est: L.revE != null ? `est ${money(L.revE)}` : "no estimate", s: sur(L.revA, L.revE), y: e ? yoy(e.salesQ) : null });
        const max = bars ? Math.max(...bars.map((b) => Math.abs(b.v))) : 0;
        const when = L && L.d ? new Date(L.d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : null;
        return (
          <div className="dr-sec">
            <div className="dr-sec-h">
              <h3>Latest earnings</h3>
              {/* L.qEnd means the source dated the figures to the fiscal period
                  end rather than the announcement day — say which, don't guess */}
              <span className="dr-sec-sub mono">{when
                ? L.qEnd ? `quarter ended ${when} · real · Yahoo` : `reported ${when} · real · FMP calendar`
                : "quarterly revenue · FMP filings"}</span>
            </div>
            {cells.length > 0 && (
              <div className="dr-ernres">
                {cells.map((c) => (
                  <div className="dr-er-cell" key={c.k}>
                    <span className="dr-er-k mono">{c.k}</span>
                    <span className="dr-er-v">{c.v}</span>
                    <div className="dr-er-meta">
                      <span className="dr-er-est mono">{c.est}</span>
                      {pill(c.s)}
                    </div>
                    {c.y && <span className="dr-er-yoy mono" data-up={!String(c.y).startsWith("-")}>{c.y}</span>}
                  </div>
                ))}
              </div>
            )}
            {bars && (
              <div className="dr-erbars">
                <div className="dr-erbars-k mono">Quarterly revenue · last {bars.length}</div>
                <div className="dr-erbars-row">
                  {bars.map((b, i) => (
                    <div className="dr-erbar" key={i} title={`${[b.p, b.y].filter(Boolean).join(" ")} — ${money(b.v)}`}>
                      <i style={{ height: `${max > 0 ? Math.max(3, (Math.abs(b.v) / max) * 100) : 3}%` }} data-last={i === bars.length - 1 || undefined} />
                      <span className="dr-erbar-l mono">{b.p ? `${b.p}${b.y ? `’${String(b.y).slice(-2)}` : ""}` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {shownBreakdown.length > 0 && (
      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Leadership model</h3><span className="dr-sec-sub mono">{shownPass}/7 factors{shownBreakdown.some((b) => b.pass == null) ? " · unfilled slots need data" : ""}</span></div>
        <div className="dr-canslim">
          {shownBreakdown.map((b) => (
            <div className="dr-cs" key={b.key} data-pass={b.pass === true} data-na={b.pass == null || undefined}>
              <span className="dr-cs-let">{b.letter}</span>
              <div className="dr-cs-body">
                <div className="dr-cs-top"><span className="dr-cs-name">{b.name}</span><span className="dr-cs-val mono">{b.value}</span></div>
                <p className="dr-cs-note">{b.note}</p>
              </div>
              <span className="dr-cs-mark">{b.pass === true ? "✓" : b.pass == null ? "·" : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      )}

      {(() => {
        // real fundamentals from FMP filings/ratios (nothing editorial). Each
        // cell renders only when its value is available.
        const e = eps && eps !== "loading" ? eps : null;
        const g = (v, suf = "%") => (v == null ? null : `${v >= 0 ? "+" : ""}${v}${suf}`);
        const cells = e ? [
          ["EPS, last Q", e.epsQNew ? "profitable" : g(e.epsQ)],
          ["EPS, 3-yr", e.epsANew ? "profitable" : g(e.epsA, "%/yr")],
          ["Sales, last Q", g(e.salesQ)],
          ["ROE", e.roe == null ? null : `${e.roe}%`],
          ["Net margin", e.netMargin == null ? null : `${e.netMargin}%`],
        ].filter(([, v]) => v != null) : [];
        return (
          <div className="dr-sec">
            <div className="dr-sec-h"><h3>Fundamentals</h3><span className="dr-sec-sub mono">{eps === "loading" ? "loading filings…" : cells.length ? "real · FMP filings & ratios" : "filings data unavailable"}</span></div>
            {cells.length > 0 && (
              <div className="dr-funds">
                {cells.map(([k, v]) => (
                  <div className="dr-fund" key={k}><span className="dr-fk mono">{k}</span><span className="dr-fv mono">{v}</span></div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {s.why && (
        <div className="dr-sec">
          <div className="dr-k mono">Thesis</div>
          <p className="dr-p">{s.why}</p>
        </div>
      )}

    </div>
  );
}

/* ----------------------------- WATCHLIST ----------------------------- */
export function WatchlistBody({ onClose, onPickEvent, onPickStock, events: allEvents = TT.EVENTS }) {
  const w = useWatch();
  const { byTicker } = useCanslim();
  const alerts = useAlerts();
  const statusMap = { buy: ["Buy Zone", "var(--cat-growth)"], ext: ["Extended", "var(--sev-high)"], watch: ["Watch", "var(--cat-data)"] };
  const statusOf = (st) => statusMap[st] || [null, "var(--dim)"];   // signals-only names can have no status
  /* Resolve against the MERGED event list, not the curated template. The live
     economic calendar appends releases that exist only in that merge, so
     `TT.EVENTS.find` returned undefined for every one of them and `.filter`
     dropped it — starring a live release put it in the badge count and nowhere
     else. Ids are compared as strings because curated ones are numbers and live
     ones are `econ:<date>:<name>` keys. */
  const evById = useMemo(() => {
    const m = {};
    for (const e of allEvents) m[String(e.id)] = e;
    return m;
  }, [allEvents]);
  /* An unresolvable star is KEPT and stated rather than dropped: a release that
     has already happened leaves the calendar window, and a row silently
     vanishing while the badge still counts it is indistinguishable from a bug. */
  const events = w.list.filter((x) => x.kind === "event")
    .map((x) => ({ star: x, ev: evById[String(x.ref)] || null }))
    .sort((a, b) => (a.ev ? a.ev.sort : Infinity) - (b.ev ? b.ev.sort : Infinity));
  const stocks = w.list.filter((x) => x.kind === "stock").map((x) => byTicker[x.ref]).filter(Boolean).sort((a, b) => (b.score || 0) - (a.score || 0));
  const empty = events.length === 0 && stocks.length === 0;
  return (
    <div className="dr">
      <div className="dr-top">
        <div className="dr-top-l"><span className="dr-kicker mono">Watchlist</span>{w.count > 0 && <span className="badge badge-cat" style={{ "--c": "var(--accent)" }}>{w.count} tracked</span>}</div>
        <button className="dr-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
      </div>

      {empty ? (
        <div className="wl-empty">
          <StarIcon filled={false} />
          <p>Your watchlist is empty.</p>
          <span>Tap the ☆ on any event or ticker to track it here — it persists across sessions.</span>
        </div>
      ) : (
        <>
          {events.length > 0 && (
            <div className="dr-sec">
              <div className="dr-sec-h"><h3>Events</h3><span className="dr-sec-sub mono">{events.length}</span></div>
              <div className="wl-list">
                {events.map(({ star, ev }) => {
                  if (!ev) {
                    return (
                      <div className="wl-row wl-gone" key={star.key}>
                        <span className="wl-date mono">—<small>off calendar</small></span>
                        <span className="wl-name">{star.name || "Tracked event"}<small className="mono">no longer in the calendar window</small></span>
                        <StarBtn wkey={star.key} kind="event" refId={star.ref} name={star.name} />
                      </div>
                    );
                  }
                  const cat = TT.CAT_MAP[ev.cat];
                  return (
                    <div className="wl-row" key={star.key} style={{ "--c": cat.color }} onClick={() => onPickEvent(ev)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickEvent(ev); } }}>
                      <span className="wl-date mono">{ev.approx ? "~" : ""}{ev.date}<small>{ev.past ? `T+${ev.t}d` : `T${ev.t}d`}</small></span>
                      <span className="wl-name">{ev.title}<small className="mono">{cat.label}</small></span>
                      <span className="badge badge-sev" data-sev={ev.sev}>{SEV_LABEL[ev.sev]}</span>
                      <StarBtn wkey={"ev:" + ev.id} kind="event" refId={ev.id} name={ev.title} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {stocks.length > 0 && (
            <div className="dr-sec">
              <div className="dr-sec-h"><h3>Tickers</h3><span className="dr-sec-sub mono">{stocks.length}</span></div>
              <div className="wl-list">
                {stocks.map((s) => {
                  const [stLabel, stColor] = statusOf(s.status);
                  const a = alerts.for(s.tk);
                  // NOT `(s.chg || 0) >= 0` — that made an unknown change render green
                  const up = s.chg != null && s.chg >= 0;
                  return (
                    <div className="wl-row wl-stock" key={s.tk} style={{ "--c": a?.hitAt ? "var(--brand)" : "var(--cat-growth)" }}
                      onClick={() => onPickStock(s)} role="button" tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPickStock(s); } }}>
                      <span className="wl-sym">{s.tk}</span>
                      <span className="wl-name">{s.name}
                        <small className="mono">RS {s.rs ?? <NA why="RS needs a 12-month return to rank against the universe" />}
                          {" · score "}{s.score ?? <NA why="The momentum score needs a signal bundle — none in the snapshot for this name" />}
                          {a && (a.hitAt
                            ? <span className="wl-alert mono" data-hit>alert hit ${a.level}</span>
                            : <span className="wl-alert mono">alert ${a.level}</span>)}
                          {s.ern && s.ern.days <= 7 && <span className="wl-alert mono" data-ern>{s.ern.est ? "~" : ""}{s.ern.days === 0 ? "E·today" : `E-${s.ern.days}`}</span>}
                        </small>
                      </span>
                      <span className="wl-px mono">{s.px != null ? "$" + fmtPx2(s.px) : <NA why="No quote for this name in the nightly snapshot" />}
                        <small data-up={s.chg == null ? undefined : up}><FigPct v={s.chg} /></small>
                      </span>
                      {/* a signals-only name has no buy status to show, and an
                          empty coloured pill reads as a status you cannot make
                          out rather than one that does not exist */}
                      {stLabel
                        ? <span className="badge badge-cat" style={{ "--c": stColor }}>{stLabel}</span>
                        : <Chip tone="absent" title="Real signals, but no editorial base to price a buy status against">No status</Chip>}
                      <StarBtn wkey={"st:" + s.tk} kind="stock" refId={s.tk} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
