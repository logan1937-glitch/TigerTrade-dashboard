import { useEffect } from "react";
import { TT } from "./tt.js";
import { PriceChart, ReactionWindow, MoveDistribution, RSLine, ScoreDonut, BarMeter } from "./charts.jsx";
import { StarBtn, StarIcon, useWatch, useCanslim, SEV_LABEL } from "./components.jsx";

function CloseIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
}
function PinIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.4" /></svg>;
}

/* ---------------------------- DRAWER SHELL ---------------------------- */
export function Drawer({ open, onClose, children, label }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className="drawer-root" data-open={open || undefined} aria-hidden={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={label}>
        {open && children}
      </aside>
    </div>
  );
}

/* ----------------------------- EVENT DRAWER ----------------------------- */
export function EventDrawerBody({ ev, onClose, onPick }) {
  const cat = TT.CAT_MAP[ev.cat];
  const d = TT.detail(ev.id);
  const st = TT.stats(ev);
  const s = st.summary;
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
        <div className="dr-date mono">{ev.approx ? "~" : ""}{ev.date}{ev.range ? ` · ${ev.range}` : ""}<span className="dr-t" style={{ color: cat.color }}>{ev.past ? `T+${ev.t}d` : `T${ev.t}d`}</span></div>
        <h2 className="dr-title">{ev.title}</h2>
        <p className="dr-lead">{ev.desc}</p>
      </div>

      <div className="dr-tiles">
        <div className="dr-tile"><span className="dr-tk mono">Avg |move|</span><span className="dr-tv mono">±{s.avgAbs}%</span></div>
        <div className="dr-tile"><span className="dr-tk mono">Hit rate ↑</span><span className="dr-tv mono">{s.hitUp}%</span></div>
        <div className="dr-tile"><span className="dr-tk mono">VIX Δ</span><span className="dr-tv mono" data-neg={s.avgVix < 0}>{s.avgVix > 0 ? "+" : ""}{s.avgVix}</span></div>
        <div className="dr-tile"><span className="dr-tk mono">Sample</span><span className="dr-tv mono">{s.n}</span></div>
      </div>

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Average S&amp;P reaction</h3><span className="dr-sec-sub mono">cumulative %, T-5 → T+5</span></div>
        <ReactionWindow data={st.window} />
      </div>

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Historical outcomes</h3><span className="dr-sec-sub mono">close-to-close move, last {s.n}</span></div>
        <MoveDistribution instances={st.instances} />
        <div className="dr-rangepill">
          <span>Best <b className="up">+{s.maxUp}%</b></span>
          <span>Median <b>{s.median > 0 ? "+" : ""}{s.median}%</b></span>
          <span>Worst <b className="dn">{s.maxDn}%</b></span>
        </div>
      </div>

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Cross-asset reaction</h3><span className="dr-sec-sub mono">typical magnitude</span></div>
        <div className="dr-cross">
          {st.cross.map((x) => (
            <div className="dr-crow" key={x.k}>
              <span className="dr-ck mono">{x.k}</span>
              <BarMeter value={x.v} max={Math.max(...st.cross.map((c) => c.v)) * 1.1} c={x.up ? "var(--cat-growth)" : "var(--sev-extreme)"} />
              <span className="dr-cv mono" data-up={x.up}>±{x.v}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dr-sec dr-2col">
        <div>
          <div className="dr-k mono">Scenario</div>
          <p className="dr-p">{d.scenario}</p>
        </div>
        <div>
          <div className="dr-k mono">Desk hedge</div>
          <p className="dr-p">{d.hedge}</p>
          <div className="dr-meta-row">
            <div><span className="dr-mk mono">Conviction</span><div className="dr-mv mono">{d.conviction}/100</div><BarMeter value={d.conviction} c="var(--accent)" /></div>
          </div>
        </div>
      </div>

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Past instances</h3></div>
        <div className="dr-table">
          <div className="dr-tr dr-th"><span>Period</span><span>Surprise</span><span>S&amp;P move</span><span>VIX Δ</span></div>
          {st.instances.map((it, i) => (
            <div className="dr-tr" key={i}>
              <span className="mono">{it.label}</span>
              <span className="mono" data-up={it.surprise >= 0}>{it.surprise > 0 ? "+" : ""}{it.surprise}</span>
              <span className="mono" data-up={it.move >= 0}>{it.move > 0 ? "+" : ""}{it.move}%</span>
              <span className="mono" data-neg={it.vix < 0}>{it.vix > 0 ? "+" : ""}{it.vix}</span>
            </div>
          ))}
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
export function StockDrawerBody({ stock, onClose }) {
  const s = stock;
  const statusMap = { buy: ["In Buy Zone", "var(--cat-growth)"], ext: ["Extended", "var(--sev-high)"], watch: ["Watch", "var(--cat-data)"] };
  const [stLabel, stColor] = statusMap[s.status];
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
          <div className="dr-symrow"><span className="dr-sym">{s.tk}</span><span className="badge badge-cat" style={{ "--c": stColor }}>{stLabel}</span></div>
          <h2 className="dr-title dr-stockname">{s.name}</h2>
          <div className="dr-pxrow">
            <span className="dr-px mono">${s.px.toLocaleString()}</span>
            <span className="dr-chg mono" data-up={s.chg >= 0}>{s.chg >= 0 ? "+" : ""}{s.chg}%</span>
            <span className="dr-rs mono">RS {s.rs}</span>
            <span className="dr-grp mono">Group #{s.groupRank}</span>
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

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Price &amp; volume</h3><span className="dr-sec-sub mono">daily · pivot {s.pivot}</span></div>
        <PriceChart closes={s.closes} volume={s.volume} pivot={s.pivot} buyLo={s.buyLo} buyHi={s.buyHi} />
        <div className="dr-rs-wrap"><span className="dr-rs-lab mono">RS line</span><RSLine rs={s.rsLine} /></div>
      </div>

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

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>CAN SLIM breakdown</h3><span className="dr-sec-sub mono">{s.pass}/7 criteria</span></div>
        <div className="dr-canslim">
          {s.breakdown.map((b) => (
            <div className="dr-cs" key={b.key} data-pass={b.pass}>
              <span className="dr-cs-let">{b.key}</span>
              <div className="dr-cs-body">
                <div className="dr-cs-top"><span className="dr-cs-name">{b.name}</span><span className="dr-cs-val mono">{b.value}</span></div>
                <p className="dr-cs-note">{b.note}</p>
              </div>
              <span className="dr-cs-mark">{b.pass ? "✓" : "—"}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="dr-sec">
        <div className="dr-sec-h"><h3>Fundamentals</h3></div>
        <div className="dr-funds">
          {[["EPS, last Q", "+" + s.f.epsQ + "%"], ["EPS, 3-yr", "+" + s.f.epsA + "%"], ["Sales, last Q", "+" + s.f.salesQ + "%"],
            ["ROE", s.f.roe + "%"], ["Net margin", s.f.margin + "%"], ["Mkt cap", s.mktCap],
            ["Fund ownership", s.f.funds + "%"], ["Acc/Dist", s.f.acc]].map(([k, v]) => (
            <div className="dr-fund" key={k}><span className="dr-fk mono">{k}</span><span className="dr-fv mono">{v}</span></div>
          ))}
        </div>
      </div>

      <div className="dr-sec">
        <div className="dr-k mono">Thesis</div>
        <p className="dr-p">{s.why}</p>
      </div>

      <div className="dr-actions">
        <StarBtn wkey={"st:" + s.tk} kind="stock" refId={s.tk} label />
        <button className="ed-btn">Set price alert</button>
        <button className="ed-btn ed-btn-primary">{s.status === "buy" ? "Stage order" : "Track pivot"}</button>
      </div>
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
