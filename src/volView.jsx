// ── Volume & Flow ────────────────────────────────────────────────────────────
// Where capital actually traded last session, and which way it leaned. The index
// is a weighted sum, so the names absorbing the most money are the ones setting
// it — and heavy volume into DECLINING names is distribution, which is what
// precedes a volatility expansion rather than merely describing one.
//
// NO OPTIONS FLOW. Neither FMP nor Yahoo exposes option chains, put/call ratios
// or unusual-options activity at any tier this app can reach, so every figure
// here is share and dollar volume off the same daily bars the rest of the
// terminal uses. That is stated on the page too — a flow panel with invented
// options data would be the worst thing this app could ship.
//
// The sort is not a display preference — it changes which ranking you are
// looking at, and they answer different questions. Dollar volume is "who moved
// the index" and will always be the mega-caps. Relative volume is "where
// something happened": a mid-cap at 4× its own normal is news in a way that a
// mega-cap's ordinary billion shares is not.
//
// So each sort switches to a list the SERVER ranked on that metric, rather than
// re-ordering one fixed set of rows. Re-sorting a top-30-by-dollar-volume slice
// by relative volume would show "the most unusual of the biggest", quietly
// dropping every genuinely unusual mid-cap — a plausible list that is not the
// one the column header claims.
import { useMemo, useState } from "react";

const n2 = (v, dp = 2) => (v == null || Number.isNaN(+v) ? "—" : (+v).toFixed(dp));
const sgn = (v, dp = 2) => (v == null || Number.isNaN(+v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(+v).toFixed(dp)}%`);
const money = (v) => {
  if (v == null || Number.isNaN(+v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v).toLocaleString()}`;
};
const shares = (v) => {
  if (v == null || Number.isNaN(+v)) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
};

// The VIX bands the rest of the terminal uses, so a level reads the same here
// as it does on the cover.
const BANDS = [
  { max: 15, k: "Low", c: "var(--cat-growth)" },
  { max: 20, k: "Normal", c: "var(--accent)" },
  { max: 28, k: "Elevated", c: "var(--sev-high)" },
  { max: Infinity, k: "Stress", c: "var(--sev-extreme)" },
];
const bandOf = (v) => (v == null ? { k: "—", c: "var(--muted)" } : BANDS.find((b) => v < b.max));

/* The session's dollar volume split by direction — one bar, because the whole
   point is the ratio and two numbers side by side make you do the division. */
function FlowBar({ upShare }) {
  if (upShare == null) return <p className="vol-empty mono">No directional split — the session's change figures are missing.</p>;
  const dn = +(100 - upShare).toFixed(1);
  const lean = upShare >= 60 ? "accumulation" : upShare <= 40 ? "distribution" : "mixed";
  return (
    <div className="flow-bar-wrap">
      <div className="flow-bar" role="img" aria-label={`${upShare}% of dollar volume in advancing names`}>
        <span className="flow-up" style={{ width: `${upShare}%` }} />
        <span className="flow-dn" style={{ width: `${dn}%` }} />
      </div>
      <div className="flow-bar-lg mono">
        <span data-side="up"><b>{n2(upShare, 1)}%</b> into advancing</span>
        <span className="flow-lean" data-lean={lean}>{lean}</span>
        <span data-side="dn"><b>{n2(dn, 1)}%</b> into declining</span>
      </div>
    </div>
  );
}

/* Each sort names the list it selects and says what that list is for; the panel
   prints this, so the explanation cannot drift from the ranking that runs. */
const SORTS = [
  { id: "dv", label: "Dollar volume", key: "heavy", col: "Dollar volume", alt: "× normal",
    desc: "who moved the index",
    why: "Price × shares, this session — the names the index's move is actually made of. Expect the mega-caps: that is the point, not a flaw. When the top of this list is red, the index was sold no matter how many small names rose." },
  { id: "rvol", label: "× normal volume", key: "unusual", col: "× normal volume", alt: "Shares",
    desc: "where something happened",
    why: "Session volume as a multiple of the name's own 50-day average, so a mid-cap and a mega-cap can be read on one screen. Volume this far above normal is news, an index rebalance, or a report — the drawer says which." },
];
const DIRS = [
  { id: "all", label: "All", test: () => true },
  { id: "up", label: "Advancing", test: (r) => r.chg != null && r.chg > 0 },
  { id: "dn", label: "Declining", test: (r) => r.chg != null && r.chg < 0 },
];

function FlowTable({ rows, mode, sortDef, onOpenStock }) {
  if (!rows || !rows.length) return <p className="vol-empty mono">No names left — every one in this ranking closed the other way.</p>;
  // scaled against the top of the UNFILTERED ranking, so switching direction
  // re-ranks the list without silently rescaling every bar under it
  const max = Math.max(...rows.map((r) => (mode === "rvol" ? (r.rvol || 0) : r.dv)));
  return (
    <div className="flow-tbl">
      <div className="flow-row flow-hrow mono">
        <span>Ticker</span>
        <span style={{ textAlign: "right" }}>Δ</span>
        <span>{sortDef.col}</span>
        <span style={{ textAlign: "right" }}>{sortDef.alt}</span>
      </div>
      {rows.map((r) => {
        const v = mode === "rvol" ? (r.rvol || 0) : r.dv;
        return (
          <div className="flow-row flow-drow" key={r.tk} role="button" tabIndex={0}
            aria-label={`${r.tk} — open full analysis`}
            onClick={() => onOpenStock && onOpenStock({ tk: r.tk })}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenStock && onOpenStock({ tk: r.tk }); } }}>
            <div className="flow-tk"><span className="cs-sym">{r.tk}</span><span className="cs-name">{r.name}</span></div>
            <div className="flow-chg mono" data-up={r.chg == null ? undefined : r.chg >= 0}>{r.chg == null ? "—" : sgn(r.chg)}</div>
            {/* the bar is coloured by the DAY'S direction, so the list reads as
                where money went and not merely how much of it moved */}
            <div className="flow-meter" title={`${money(r.dv)} traded · ${shares(r.vol)} shares · ${r.rvol != null ? `${r.rvol}× its own average` : "no average to compare"}`}>
              <span className="flow-meter-fill" data-up={r.chg == null ? undefined : r.chg >= 0}
                style={{ width: `${max > 0 ? Math.max(2, (v / max) * 100) : 0}%` }} />
              <span className="flow-meter-v mono">{mode === "rvol" ? `${n2(r.rvol, 1)}×` : money(r.dv)}</span>
            </div>
            <div className="flow-sec mono">{mode === "rvol" ? shares(r.vol) : (r.rvol != null ? `${n2(r.rvol, 1)}×` : "—")}</div>
          </div>
        );
      })}
    </div>
  );
}

/* A year of VIX closes with today marked. Kept from the old surface because it
   is the one VIX read the cover does not give: a level means nothing on its own,
   and this is the only panel that says whether 18 is high or low *lately*. */
function VixYear({ hist, level }) {
  const path = useMemo(() => {
    const v = (hist || []).filter((r) => r.v != null);
    if (v.length < 10) return null;
    const W = 520, H = 96, padT = 7, padB = 13;
    const lo = Math.min(...v.map((r) => r.v)), hi = Math.max(...v.map((r) => r.v));
    const span = hi - lo || 1;
    const y = (x) => padT + (1 - (x - lo) / span) * (H - padT - padB);
    return { W, H, lo, hi, yNow: level != null ? y(level) : null,
      d: v.map((r, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ") };
  }, [hist, level]);
  if (!path) return <p className="vol-empty mono">Not enough VIX history in the snapshot to draw a year.</p>;
  return (
    <div className="vol-histwrap">
      <svg viewBox={`0 0 ${path.W} ${path.H}`} className="vol-hist" preserveAspectRatio="none" role="img" aria-label="VIX, past year">
        <path d={`${path.d} L${path.W},${path.H} L0,${path.H} Z`} fill="var(--accent)" opacity=".09" />
        <path d={path.d} fill="none" stroke="var(--accent)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        {path.yNow != null && (
          <line x1="0" y1={path.yNow} x2={path.W} y2={path.yNow} stroke="var(--text)" strokeWidth="1"
            strokeDasharray="4 4" opacity=".5" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <span className="vol-hax" data-at="hi">{n2(path.hi)}</span>
      <span className="vol-hax" data-at="lo">{n2(path.lo)}</span>
    </div>
  );
}

export function VolView({ flow, vol, vix, asOf, onOpenStock }) {
  const [sort, setSort] = useState("dv");
  const [dir, setDir] = useState("all");
  const sortDef = SORTS.find((x) => x.id === sort) || SORTS[0];
  const dirDef = DIRS.find((x) => x.id === dir) || DIRS[0];
  // the server ranked each list on its own metric; the direction chip filters
  // within it. `ranked` stays whole so the bars keep a stable scale.
  const ranked = (flow && flow[sortDef.key]) || [];
  const shown = useMemo(() => ranked.filter(dirDef.test), [ranked, dirDef]);

  const level = vol && vol.level != null ? vol.level : (vix && vix.level != null ? vix.level : null);
  const dayChg = vol && vol.chg != null ? vol.chg : (vix && vix.chg != null ? vix.chg : null);
  const band = bandOf(level);
  let stamp = "—";
  try { if (asOf) stamp = new Date(asOf).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch {}

  if (!flow) {
    return (
      <div className="wrap vol">
        <div className="vol-head">
          <div className="vol-kicker mono">Volume &amp; flow</div>
          <p className="vol-sub mono">
            The session's volume block is missing from the snapshot, so nothing here can be drawn.
            It is computed nightly from the same daily bars the screener uses — if it is absent,
            that run did not complete. Nothing on this page is estimated in its place.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap vol">
      <div className="vol-head">
        <div className="vol-kicker mono">Volume &amp; flow · session of {stamp}</div>
        <p className="vol-sub mono">
          Where capital actually traded across the S&amp;P 500, and which way it leaned. The index is
          a weighted sum, so the names taking the most money are the ones setting it — and heavy
          volume into <i>declining</i> names is distribution, which is what precedes a volatility
          expansion rather than just describing one.
        </p>
      </div>

      <div className="vol-tiles">
        <div className="vol-tile" title="Total dollar volume across every measured name in the session">
          <span className="vol-tk mono">Traded</span>
          <span className="vol-tv">{money(flow.totDv)}</span>
          <span className="vol-ts mono">across {flow.n} names</span>
        </div>
        <div className="vol-tile" title="Share of the session's dollar volume that traded in names closing up">
          <span className="vol-tk mono">Into advancing</span>
          <span className="vol-tv" data-up={flow.upShare == null ? undefined : flow.upShare >= 50}>
            {flow.upShare == null ? "—" : `${n2(flow.upShare, 0)}%`}</span>
          <span className="vol-ts mono">{money(flow.advDv)} up · {money(flow.decDv)} down</span>
        </div>
        <div className="vol-tile" title="30-day implied volatility — the VIX itself">
          <span className="vol-tk mono">VIX</span>
          <span className="vol-tv" style={{ color: band.c }}>{n2(level)}</span>
          <span className="vol-ts mono" data-up={dayChg == null ? undefined : dayChg <= 0}>
            {dayChg == null ? band.k : `${band.k} · ${sgn(dayChg)} on the day`}</span>
        </div>
        <div className="vol-tile" title="Share of the last year's VIX closes that sat below today's level">
          <span className="vol-tk mono">VIX vs its year</span>
          <span className="vol-tv">{vol && vol.pct1y != null ? `${vol.pct1y}th` : "—"}</span>
          <span className="vol-ts mono">{vol && vol.pct1y != null
            ? `above ${vol.pct1y}% of the past year` : "needs a year of closes"}</span>
        </div>
      </div>

      <div className="vol-grid">
        <section className="vol-panel vol-panel-wide">
          <div className="vol-ph">
            <span className="vol-phk mono">Direction of the session's money</span>
            <span className="vol-phv mono">{money(flow.totDv)} · {flow.n} names</span>
          </div>
          <FlowBar upShare={flow.upShare} />
          <p className="vol-note mono">
            Dollar volume, split by whether the name closed up or down. This is breadth weighted by
            money rather than by name count — a hundred small advancers do not outweigh three
            mega-caps being sold, and the index agrees with the money.
          </p>
        </section>

        <section className="vol-panel vol-panel-wide">
          <div className="vol-ph">
            <span className="vol-phk mono">Where the money traded · {sortDef.desc}</span>
            <span className="vol-phv mono">{shown.length} of {ranked.length}{dir !== "all" ? ` ${dirDef.label.toLowerCase()}` : ""}</span>
          </div>

          <div className="flow-ctl">
            <span className="minwt-lab">Rank by</span>
            <div className="seg">
              {SORTS.map((o) => (
                <button key={o.id} className="seg-btn" data-active={sort === o.id} onClick={() => setSort(o.id)}
                  title={`${o.desc} — ${o.why}`}>{o.label}</button>
              ))}
            </div>
            <span className="minwt-lab" style={{ marginLeft: 6 }}>Show</span>
            <div className="seg">
              {DIRS.map((o) => (
                <button key={o.id} className="seg-btn" data-active={dir === o.id} onClick={() => setDir(o.id)}
                  title={o.id === "all" ? "Every name in this ranking"
                    : `Only names that closed ${o.id === "up" ? "up" : "down"} — where the money on this list actually went`}>
                  {o.label}</button>
              ))}
            </div>
          </div>

          <FlowTable rows={shown} mode={sort} sortDef={sortDef} onOpenStock={onOpenStock} />

          <p className="vol-note mono">
            {sortDef.why}
            {sort === "rvol" && <> Filtered to names averaging at least {money(flow.liquidFloor)} a day — a thin
              name doubling its volume is a rounding error dressed as a signal.</>}
            {" "}Each ranking is the top {ranked.length} of the {flow.n} measured names on <i>that</i> metric,
            ranked before it reached your browser — switching above changes the list, not just its order.
          </p>
        </section>

        <section className="vol-panel vol-panel-wide">
          <div className="vol-ph">
            <span className="vol-phk mono">VIX · past year</span>
            <span className="vol-phv mono">dashed line is today</span>
          </div>
          <VixYear hist={vol && vol.hist} level={level} />
          <p className="vol-note mono">
            A level only means something against its own history: 18 is complacent in one regime and
            elevated in another, and the number alone cannot say which. The percentile above is this
            series, counted.
          </p>
        </section>
      </div>

      <p className="vol-foot mono">
        Share and dollar volume only — <b>not options flow</b>. Neither of this app's data sources
        exposes option chains, put/call ratios or unusual-options activity at any tier it can reach,
        and a flow panel filled with invented options data would be worse than no panel. Volumes are
        as of the session named above, from the nightly snapshot. Nothing here is a signal to trade.
      </p>
    </div>
  );
}
