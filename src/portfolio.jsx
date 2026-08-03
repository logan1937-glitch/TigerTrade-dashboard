// ── Portfolio ────────────────────────────────────────────────────────────────
// Manually-entered positions, stored on-device (localStorage) — nothing is sent
// to a server and there is no account. Every figure below is derived from real
// live quotes and the real earnings calendar; anything whose input is missing
// (no price yet, no cost basis entered) renders as "—" rather than an estimate.
import { useMemo, useState } from "react";
import { usePositions } from "./components.jsx";

const money = (v, dp = 2) => (v == null ? "—"
  : `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`);
const compact = (v) => {
  if (v == null) return "—";
  const a = Math.abs(v), sg = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sg}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sg}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sg}$${(a / 1e3).toFixed(1)}K`;
  return money(v, 2);
};
const pctS = (v, dp = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`);

// Where a report date came from, said plainly. A name no feed covers can carry a
// date you typed in yourself, and that must never read as a confirmed one.
const ernTitle = (e) => {
  if (!e) return "No report date for this name yet — open it and set one under Edit position.";
  if (e.mine) return `Reports ${e.date} — the date you entered for this position.`;
  return `Reports ${e.date}${e.est ? " (projected by the data source, not confirmed by the company)" : ""}`
    + (e.stale ? " · from the last successful feed read, not re-confirmed today" : "");
};

export function PortfolioView({ rows = [], onOpenStock, events = [], vix = null }) {
  const pos = usePositions();
  const [tk, setTk] = useState("");
  const [sh, setSh] = useState("");
  const [cost, setCost] = useState("");
  const [ern, setErn] = useState("");
  const [err, setErr] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const t = tk.trim().toUpperCase();
    if (!t) { setErr("Enter a ticker"); return; }
    setErr(""); pos.add(t, sh, cost, ern);   // shares, cost and report date are all optional
    setTk(""); setSh(""); setCost(""); setErn("");
  };

  // ── totals. Only sized positions can carry a dollar value, and dollar P&L
  // additionally needs a cost basis — anything short of that stays out of the
  // sums rather than being counted as zero.
  const tot = useMemo(() => {
    let value = 0, dayPl = 0, priced = 0, plValue = 0, plBasis = 0, plN = 0, unsized = 0, costNoSize = 0;
    for (const r of rows) {
      if (r.shares == null) { unsized++; if (r.cost != null) costNoSize++; }
      if (r.value != null) { value += r.value; priced++; }
      if (r.dayPl != null) dayPl += r.dayPl;
      if (r.value != null && r.basis != null) { plValue += r.value; plBasis += r.basis; plN++; }
    }
    return {
      value: priced ? value : null,
      dayPl: priced ? dayPl : null,
      dayPct: priced && value - dayPl !== 0 ? (dayPl / (value - dayPl)) * 100 : null,
      pl: plN ? plValue - plBasis : null,
      plPct: plN && plBasis > 0 ? (plValue / plBasis - 1) * 100 : null,
      plN, priced, unsized, costNoSize,
    };
  }, [rows]);

  const sectors = useMemo(() => {
    const m = {};
    for (const r of rows) if (r.value != null) m[r.sector] = (m[r.sector] || 0) + r.value;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  // real earnings dates for held names, soonest first
  const ernAhead = useMemo(() => rows.filter((r) => r.ern && r.ern.days != null)
    .sort((a, b) => a.ern.days - b.ern.days), [rows]);
  const ernNoDate = useMemo(() => rows.filter((r) => !r.ern), [rows]);
  const ernSoon = ernAhead.filter((r) => r.ern.days <= 14);
  const ernSoonVal = ernSoon.reduce((n, r) => n + (r.value || 0), 0);

  // the market's own expected 1-day move (VIX ÷ √252) applied to the book
  const impliedPct = vix && vix.level != null ? vix.level / Math.sqrt(252) : null;
  const impliedUsd = impliedPct != null && tot.value != null ? (tot.value * impliedPct) / 100 : null;
  const nextEvents = (events || []).filter((e) => !e.past).slice(0, 4);

  const sorted = useMemo(() => [...rows].sort((a, b) => (b.value || 0) - (a.value || 0)), [rows]);

  return (
    <div className="wrap">
      <div className="pf-tiles">
        <div className="pf-tile"><span className="pf-tk mono">Market value</span><span className="pf-tv">{compact(tot.value)}</span>
          <span className="pf-ts mono">{rows.length} position{rows.length === 1 ? "" : "s"}
            {tot.unsized ? ` · ${tot.unsized} without a size` : ` · ${tot.priced} priced`}</span></div>
        <div className="pf-tile"><span className="pf-tk mono">Day P&amp;L</span>
          <span className="pf-tv" data-up={tot.dayPl == null ? undefined : tot.dayPl >= 0}>{compact(tot.dayPl)}</span>
          <span className="pf-ts mono">{pctS(tot.dayPct)} today</span></div>
        <div className="pf-tile"><span className="pf-tk mono">Total P&amp;L</span>
          <span className="pf-tv" data-up={tot.pl == null ? undefined : tot.pl >= 0}>{compact(tot.pl)}</span>
          <span className="pf-ts mono">{tot.plN ? `${pctS(tot.plPct)} · ${tot.plN} of ${rows.length} with cost basis`
            : tot.costNoSize ? "add share counts for dollar P&L" : "add a cost basis to track"}</span></div>
        <div className="pf-tile"><span className="pf-tk mono">Expected 1-day move</span>
          <span className="pf-tv">{impliedUsd == null ? "—" : `±${compact(impliedUsd).replace("−", "")}`}</span>
          <span className="pf-ts mono">{impliedPct != null ? `±${impliedPct.toFixed(2)}% · VIX-implied` : "awaiting VIX"}</span></div>
      </div>

      <form className="pf-add" onSubmit={submit}>
        <input className="search" style={{ width: 130 }} placeholder="ticker" value={tk}
          onChange={(e) => setTk(e.target.value)} aria-label="Ticker" />
        <input className="search" style={{ width: 120 }} placeholder="shares (opt)" value={sh} inputMode="decimal"
          onChange={(e) => setSh(e.target.value)} aria-label="Shares" />
        <input className="search" style={{ width: 150 }} placeholder="cost / share (opt)" value={cost} inputMode="decimal"
          onChange={(e) => setCost(e.target.value)} aria-label="Cost per share" />
        <span className="pf-inlab mono">reports</span>
        <input className="search pf-date" style={{ width: 158 }} type="date" value={ern}
          onChange={(e) => setErn(e.target.value)} aria-label="Next report date"
          title="Next report date — optional. Only worth filling in for a name no data feed covers; the calendar fills this in by itself when it can." />
        <button type="submit" className="seg-btn" data-active="true" style={{ padding: "9px 14px" }}>＋ Add position</button>
        {err && <span className="cs-lookup-err mono">{err}</span>}
        <span className="pf-note mono">ticker alone is enough · stored on this device only</span>
      </form>

      {rows.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          No positions yet — a ticker on its own is enough to track a name's price, sector and report date.
          Add shares and a cost basis when you want live P&amp;L and the book's exposure to the next macro catalyst.
        </div>
      ) : (
        <>
          <div className="cs-table pf-table">
            <div className="cs-head pf-head">
              <span>Position</span><span style={{ textAlign: "right" }}>Shares</span><span style={{ textAlign: "right" }}>Price · Δ</span>
              <span style={{ textAlign: "right" }}>Value</span><span style={{ textAlign: "right" }}>P&amp;L</span>
              <span style={{ textAlign: "right" }}>Weight</span><span style={{ textAlign: "right" }}>Next ern</span><span />
            </div>
            {sorted.map((r) => {
              const w = tot.value && r.value != null ? (r.value / tot.value) * 100 : null;
              return (
                <div className="cs-row pf-row" key={r.tk} role="button" tabIndex={0}
                  aria-label={`${r.tk} — open full analysis`}
                  onClick={() => onOpenStock && onOpenStock({ tk: r.tk })}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenStock && onOpenStock({ tk: r.tk }); } }}>
                  <div className="cs-tk"><span className="cs-tk-txt"><span className="cs-sym">{r.tk}</span>
                    {r.name && r.name !== r.tk && <span className="cs-name">{r.name}</span>}</span></div>
                  <div className="pf-num mono">{r.shares != null ? r.shares.toLocaleString() : <span className="pf-untracked">tracking</span>}
                    {r.cost != null && <span className="pf-sub mono">@ {money(r.cost)}</span>}</div>
                  <div className="pf-num mono">{r.px != null ? money(r.px) : "—"}
                    {r.chg != null && <span className="pf-sub mono" data-up={r.chg >= 0}>{pctS(r.chg)}</span>}</div>
                  <div className="pf-num mono">{compact(r.value)}</div>
                  <div className="pf-num mono" data-up={r.pl == null ? undefined : r.pl >= 0}>{compact(r.pl)}
                    {r.plPct != null && <span className="pf-sub mono" data-up={r.plPct >= 0}>{pctS(r.plPct)}</span>}</div>
                  <div className="pf-num mono">{w == null ? "—" : `${w.toFixed(1)}%`}
                    {w != null && <i className="pf-wbar" style={{ width: `${Math.min(100, w)}%` }} />}</div>
                  <div className="pf-num mono" title={ernTitle(r.ern)}>
                    {r.ern ? `${r.ern.est ? "~" : ""}${r.ern.days === 0 ? "today" : `${r.ern.days}d`}` : "—"}
                    {r.ern && r.ern.mine && <i className="pf-ernmine">yours</i>}
                    {r.ern && r.ern.days <= 7 && <span className="pf-ernflag mono">event risk</span>}</div>
                  <div style={{ textAlign: "right" }}>
                    <button className="pf-x" aria-label={`Remove ${r.tk}`} title="Remove position"
                      onClick={(e) => { e.stopPropagation(); pos.remove(r.tk); }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pf-panels">
            <div className="pf-panel">
              <div className="pf-ph mono">Earnings ahead · your book</div>
              {ernAhead.length === 0
                ? <p className="pf-pempty mono">No report dates for these names yet. The feeds don't cover every
                    listing — open a name and set its date under <b>Edit position</b> to put it on this calendar.</p>
                : (
                  <>
                    {ernSoon.length > 0 && (
                      <p className="pf-plead mono"><b>{ernSoon.length}</b> position{ernSoon.length === 1 ? "" : "s"} report within 14 days
                        {tot.value ? <> · <b>{((ernSoonVal / tot.value) * 100).toFixed(0)}%</b> of book value</> : null}</p>
                    )}
                    <div className="pf-plist">
                      {ernAhead.slice(0, 6).map((r) => (
                        <div className="pf-pitem" key={r.tk} data-soon={r.ern.days <= 7 || undefined}>
                          <span className="pf-pi-tk mono">{r.tk}</span>
                          <span className="pf-pi-d mono" title={ernTitle(r.ern)}>
                            {r.ern.est ? "~" : ""}{new Date(r.ern.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            {r.ern.time === "bmo" ? " · pre" : r.ern.time === "amc" ? " · post" : ""}
                            {r.ern.mine && <i className="pf-ernmine">yours</i>}</span>
                          <span className="pf-pi-t mono">{r.ern.days === 0 ? "today" : `T−${r.ern.days}d`}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              {ernAhead.length > 0 && ernNoDate.length > 0 && (
                <p className="pf-pnote mono">No date yet for {ernNoDate.slice(0, 5).map((r) => r.tk).join(", ")}
                  {ernNoDate.length > 5 ? ` +${ernNoDate.length - 5}` : ""} — set one under Edit position.</p>
              )}
            </div>

            <div className="pf-panel">
              <div className="pf-ph mono">Next catalysts · exposure</div>
              {impliedUsd != null
                ? <p className="pf-plead mono">A 1-day move of the size the options market is pricing is worth
                    about <b>±{compact(impliedUsd).replace("−", "")}</b> on this book.</p>
                : <p className="pf-pempty mono">Awaiting the VIX feed for the implied-move estimate.</p>}
              <div className="pf-plist">
                {nextEvents.map((e) => (
                  <div className="pf-pitem" key={e.id} data-soon={e.t >= -7 || undefined}>
                    <span className="pf-pi-tk mono" style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                    <span className="pf-pi-d mono">{e.date}</span>
                    <span className="pf-pi-t mono">T{e.t}d</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pf-panel">
              <div className="pf-ph mono">Sector weight</div>
              {sectors.length === 0
                ? <p className="pf-pempty mono">{rows.length > 0 && tot.unsized === rows.length
                    ? "Add share counts to weight the book by sector." : "Awaiting live prices."}</p>
                : (
                  <div className="pf-plist">
                    {sectors.map(([s, v]) => (
                      <div className="pf-sec" key={s}>
                        <span className="pf-sec-k">{s}</span>
                        <span className="pf-sec-v mono">{tot.value ? `${((v / tot.value) * 100).toFixed(0)}%` : "—"}</span>
                        <i style={{ width: tot.value ? `${(v / tot.value) * 100}%` : 0 }} />
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        </>
      )}

      <p className="mono pf-disc">
        Positions are entered by you and stored only in this browser — clearing site data removes them, and they
        do not sync between devices. Values use delayed quotes. Educational use only — not investment advice.
      </p>
    </div>
  );
}
