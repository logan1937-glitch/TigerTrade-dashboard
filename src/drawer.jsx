import { useEffect, useState, useRef } from "react";
import { TT } from "./tt.js";
import { PriceChart, RSLine, ScoreDonut, BarMeter } from "./charts.jsx";
import { StarBtn, StarIcon, Logo, useWatch, useCanslim, SEV_LABEL } from "./components.jsx";

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
}
function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>;
}

/* ---------------------------- DRAWER SHELL ---------------------------- */
export function Drawer({ open, onClose, children, label }) {
  const startX = useRef(null);
  const startY = useRef(null);
  const [dx, setDx] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={dx ? { transform: `translateX(${dx}px)`, transition: "none" } : undefined}>
        {open && children}
      </aside>
    </div>
  );
}

/* ----------------------------- EVENT DRAWER ----------------------------- */
export function EventDrawerBody({ ev, onClose, onPick }) {
  const cat = TT.CAT_MAP[ev.cat];
  const d = TT.detail(ev.id);
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
          <div className="dr-tile"><span className="dr-tk mono">Previous</span><span className="dr-tv mono">{ev.econ.previous != null ? `${ev.econ.previous}${ev.econ.unit}` : "—"}</span></div>
          <div className="dr-tile"><span className="dr-tk mono">Consensus</span><span className="dr-tv mono">{ev.econ.estimate != null ? `${ev.econ.estimate}${ev.econ.unit}` : "—"}</span></div>
          <div className="dr-tile"><span className="dr-tk mono">Actual</span><span className="dr-tv mono" data-neg={ev.econ.actual != null && ev.econ.estimate != null && ev.econ.actual >= ev.econ.estimate}>{ev.econ.actual != null ? `${ev.econ.actual}${ev.econ.unit}` : "pending"}</span></div>
          <div className="dr-tile"><span className="dr-tk mono">Surprise</span><span className="dr-tv mono">{ev.econ.actual != null && ev.econ.estimate != null ? `${(ev.econ.actual - ev.econ.estimate) > 0 ? "+" : ""}${+(ev.econ.actual - ev.econ.estimate).toFixed(2)}${ev.econ.unit}` : "—"}</span></div>
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
            <div><span className="dr-mk mono">Conviction <span style={{ opacity: .6 }}>· editorial</span></span><div className="dr-mv mono">{d.conviction}/100</div><BarMeter value={d.conviction} c="var(--accent)" /></div>
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
        <StarBtn wkey={"ev:" + ev.id} kind="event" refId={ev.id} label />
        <button className="ed-btn">Add to calendar</button>
        <button className="ed-btn ed-btn-primary">Set alert</button>
      </div>
    </div>
  );
}

/* ----------------------------- STOCK DRAWER ----------------------------- */
const fmtCap = (v) => (v == null ? "—" : v >= 1e12 ? (v / 1e12).toFixed(2) + "T" : v >= 1e9 ? (v / 1e9).toFixed(1) + "B" : (v / 1e6).toFixed(0) + "M");

export function StockDrawerBody({ stock, onClose }) {
  const s = stock;
  const statusMap = { buy: ["In Buy Zone", "var(--cat-growth)"], ext: ["Extended", "var(--sev-high)"], watch: ["Watch", "var(--cat-data)"] };
  const [stLabel, stColor] = statusMap[s.status] || [null, null];
  const hasBase = s.pivot != null;                  // buy-point base (technical when history exists)
  const hasChart = s.closes && s.closes.length > 0; // real EOD history loaded
  const signalsOnly = s.coverage === "signals";

  // real market cap — one lazy FMP quote per open; "—" if unavailable, never a stale value
  const [cap, setCap] = useState(null);
  useEffect(() => {
    let alive = true;
    setCap(null);
    fetch(`/api/fmp?endpoint=quote&symbol=${s.tk}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const q = Array.isArray(d) ? d[0] : d; if (alive && q && q.marketCap) setCap(q.marketCap); })
      .catch(() => {});
    return () => { alive = false; };
  }, [s.tk]);

  // order-plan ticket (planning only — not connected to a broker)
  const [planOpen, setPlanOpen] = useState(false);
  const [alertNote, setAlertNote] = useState(false);
  const [qty, setQty] = useState(100);
  const stop = hasBase ? +(s.pivot * 0.92).toFixed(2) : null;
  const t1 = hasBase ? +(s.pivot * 1.20).toFixed(2) : null;
  const t2 = hasBase ? +(s.pivot * 1.25).toFixed(2) : null;
  const riskPerShare = hasBase ? +(s.px - stop).toFixed(2) : null;
  const rewardPerShare = hasBase ? +(t1 - s.px).toFixed(2) : null;
  const rr = hasBase && riskPerShare > 0 ? (rewardPerShare / riskPerShare).toFixed(2) : "—";
  const posValue = (qty * (s.px || 0));
  const riskValue = qty * Math.max(0, riskPerShare || 0);
  const money = (n) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

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
            {stLabel ? <span className="badge badge-cat" style={{ "--c": stColor }}>{stLabel}</span>
              : signalsOnly && <span className="badge badge-cat" style={{ "--c": "var(--dim)" }}>Signals-only</span>}</div>
          <h2 className="dr-title dr-stockname">{s.name}</h2>
          <div className="dr-pxrow">
            <span className="dr-px mono">{s.px != null ? "$" + s.px.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—"}</span>
            {s.chg != null && <span className="dr-chg mono" data-up={s.chg >= 0}>{s.chg >= 0 ? "+" : ""}{(+s.chg).toFixed(2)}%</span>}
            <span className="dr-grp mono">Mkt cap {fmtCap(cap)}</span>
            {s.rs != null && <span className="dr-rs mono">RS {s.rs}</span>}
            {s.groupRank != null && <span className="dr-grp mono">Group #{s.groupRank}</span>}
          </div>
        </div>
        <ScoreDonut score={s.score} label="Score" />
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
          <p className="dr-bio">Signals-only coverage — ranked purely on real technical momentum from live EOD history (RS, stage, breakout). No fundamental overlay or curated buy-point base for this name.</p>
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
            <div className="dr-bp"><span className="dr-bpk mono">Stage</span><span className="dr-bpv">{s.sig.stage ?? "—"} · {s.sig.stageLabel}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">RS line</span><span className="dr-bpv" data-up={s.sig.rsNewHigh}>{s.sig.rsLeads ? "New high (leads price)" : s.sig.rsNewHigh ? "New high" : "Below high"}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">12-mo return</span><span className="dr-bpv mono" data-up={s.sig.ret12m >= 0}>{s.sig.ret12m >= 0 ? "+" : ""}{s.sig.ret12m}%</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">ADR%</span><span className="dr-bpv mono">{s.sig.adrPct}%</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Distribution days</span><span className="dr-bpv mono" data-warn={s.sig.distDays >= 5}>{s.sig.distDays} / 25</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">$ volume</span><span className="dr-bpv mono">${(s.sig.dollarVol / 1e6).toFixed(0)}M</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Off 52-wk high</span><span className="dr-bpv mono">{s.sig.atHigh ? "at high" : "−" + s.sig.off52 + "%"}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Pocket pivot</span><span className="dr-bpv" data-up={s.sig.pocketPivot}>{s.sig.pocketPivot ? "Yes ✦" : "No"}</span></div>
          </div>
        </div>
      )}

      {hasBase && (
      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Buy-point analysis</h3></div>
        <div className="dr-buygrid">
          <div className="dr-bp"><span className="dr-bpk mono">Base</span><span className="dr-bpv">{s.baseType}</span></div>
          <div className="dr-bp"><span className="dr-bpk mono">Length</span><span className="dr-bpv">{s.baseWeeks ? s.baseWeeks + " wks" : "—"}</span></div>
          <div className="dr-bp"><span className="dr-bpk mono">Depth</span><span className="dr-bpv">{s.baseDepth ? s.baseDepth + "%" : "—"}</span></div>
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
          Earnings {new Date(s.ern.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          {s.ern.time === "bmo" ? " before the open" : s.ern.time === "amc" ? " after the close" : ""}
          {" — "}reports gap through stops. New breakout entries this close to the print carry event risk.
        </div>
      )}

      {s.breakdown && s.breakdown.length > 0 && (
      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Leadership model</h3><span className="dr-sec-sub mono">{s.pass}/7 factors</span></div>
        <div className="dr-canslim">
          {s.breakdown.map((b) => (
            <div className="dr-cs" key={b.key} data-pass={b.pass}>
              <span className="dr-cs-let">{b.letter}</span>
              <div className="dr-cs-body">
                <div className="dr-cs-top"><span className="dr-cs-name">{b.name}</span><span className="dr-cs-val mono">{b.value}</span></div>
                <p className="dr-cs-note">{b.note}</p>
              </div>
              <span className="dr-cs-mark">{b.pass ? "✓" : "—"}</span>
            </div>
          ))}
        </div>
      </div>
      )}

      {s.f && (
      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Fundamentals</h3><span className="dr-sec-sub mono">editorial estimates — verify before trading</span></div>
        <div className="dr-funds">
          {[["EPS, last Q", "+" + s.f.epsQ + "%"], ["EPS, 3-yr", "+" + s.f.epsA + "%"], ["Sales, last Q", "+" + s.f.salesQ + "%"],
            ["ROE", s.f.roe + "%"], ["Net margin", s.f.margin + "%"],
            ["Fund ownership", s.f.funds + "%"], ["Acc/Dist", s.f.acc]].map(([k, v]) => (
            <div className="dr-fund" key={k}><span className="dr-fk mono">{k}</span><span className="dr-fv mono">{v}</span></div>
          ))}
        </div>
      </div>
      )}

      {s.why && (
        <div className="dr-sec">
          <div className="dr-k mono">Thesis</div>
          <p className="dr-p">{s.why}</p>
        </div>
      )}

      {planOpen && hasBase && (
        <div className="dr-sec">
          <div className="dr-sec-h"><h3>{s.status === "buy" ? "Staged order plan" : "Pivot watch plan"}</h3><span className="dr-sec-sub mono">planning only — no broker connected</span></div>
          <div className="dr-buygrid">
            <div className="dr-bp"><span className="dr-bpk mono">Entry (buy zone)</span><span className="dr-bpv mono">${s.buyLo}–{s.buyHi}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Stop (−8%)</span><span className="dr-bpv mono">${stop}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Target +20%</span><span className="dr-bpv mono">${t1}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Target +25%</span><span className="dr-bpv mono">${t2}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Risk / share</span><span className="dr-bpv mono" data-up={riskPerShare < 0}>${riskPerShare}</span></div>
            <div className="dr-bp"><span className="dr-bpk mono">Reward : risk</span><span className="dr-bpv mono">{rr}:1</span></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            <span className="dr-bpk mono">Shares</span>
            <input className="search" type="number" min="0" value={qty}
              onChange={(e) => setQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
              style={{ width: 110, paddingLeft: 12 }} />
            <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
              Position <b style={{ color: "var(--text)" }}>${money(posValue)}</b> · Risk to stop <b style={{ color: "var(--sev-extreme)" }}>${money(riskValue)}</b>
            </span>
          </div>
          <div className="dr-verdict neutral" style={{ marginTop: 12 }}>
            Planning tool only. TigerTrade is not a broker — this does not place, transmit, or execute any order.
            Enter and manage real orders with your own brokerage.
          </div>
        </div>
      )}

      <div className="dr-actions">
        <StarBtn wkey={"st:" + s.tk} kind="stock" refId={s.tk} label />
        <button className="ed-btn" onClick={() => setAlertNote((v) => !v)}>Set price alert</button>
        {hasBase && <button className="ed-btn ed-btn-primary" onClick={() => setPlanOpen((v) => !v)}>{planOpen ? "Hide plan" : s.status === "buy" ? "Stage order" : "Track pivot"}</button>}
      </div>
      {alertNote && (
        <p className="mono" style={{ padding: "10px 26px 0", fontSize: 11, lineHeight: 1.5, color: "var(--dim)" }}>
          Price alerts aren't connected yet — tap the ☆ to track {s.tk} on your watchlist for now.
        </p>
      )}
    </div>
  );
}

/* ----------------------------- WATCHLIST ----------------------------- */
export function WatchlistBody({ onClose, onPickEvent, onPickStock }) {
  const w = useWatch();
  const { byTicker } = useCanslim();
  const statusMap = { buy: ["Buy Zone", "var(--cat-growth)"], ext: ["Extended", "var(--sev-high)"], watch: ["Watch", "var(--cat-data)"] };
  const events = w.list.filter((x) => x.kind === "event").map((x) => TT.EVENTS.find((e) => e.id === x.ref)).filter(Boolean).sort((a, b) => a.sort - b.sort);
  const stocks = w.list.filter((x) => x.kind === "stock").map((x) => byTicker[x.ref]).filter(Boolean).sort((a, b) => b.score - a.score);
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
                {events.map((ev) => {
                  const cat = TT.CAT_MAP[ev.cat];
                  return (
                    <div className="wl-row" key={ev.id} style={{ "--c": cat.color }} onClick={() => onPickEvent(ev)} role="button" tabIndex={0}>
                      <span className="wl-date mono">{ev.approx ? "~" : ""}{ev.date}<small>{ev.past ? `T+${ev.t}d` : `T${ev.t}d`}</small></span>
                      <span className="wl-name">{ev.title}<small className="mono">{cat.label}</small></span>
                      <span className="badge badge-sev" data-sev={ev.sev}>{SEV_LABEL[ev.sev]}</span>
                      <StarBtn wkey={"ev:" + ev.id} kind="event" refId={ev.id} />
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
                  const [stLabel, stColor] = statusMap[s.status];
                  return (
                    <div className="wl-row wl-stock" key={s.tk} style={{ "--c": "var(--cat-growth)" }} onClick={() => onPickStock(s)} role="button" tabIndex={0}>
                      <span className="wl-sym">{s.tk}</span>
                      <span className="wl-name">{s.name}<small className="mono">RS {s.rs} · score {s.score}</small></span>
                      <span className="badge badge-cat" style={{ "--c": stColor }}>{stLabel}</span>
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
