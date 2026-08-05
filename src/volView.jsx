// ── Volatility ───────────────────────────────────────────────────────────────
// What the options market is charging for the next six months, against what the
// index has actually been delivering. Four panels, all reading `snap.vol`, which
// api/snapshot.js computes nightly off Yahoo's crumb-free chart endpoint and the
// SPY bars it already pulled — this view costs no FMP quota and fetches nothing.
//
// The discipline is the same as everywhere else: a tenor Yahoo did not answer for
// is absent from the term structure rather than interpolated, and every derived
// figure (slope, VRP, percentile) renders "—" when an input is missing. A vol
// surface with a guessed point on it is worse than one with a gap.
import { useMemo } from "react";

const n2 = (v, dp = 2) => (v == null || Number.isNaN(+v) ? "—" : (+v).toFixed(dp));
const sgn = (v, dp = 2) => (v == null || Number.isNaN(+v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(+v).toFixed(dp)}`);

// The VIX regime bands the rest of the terminal already uses, so a level reads
// the same here as it does on the cover.
const BANDS = [
  { max: 15, k: "Low", c: "var(--cat-growth)", note: "complacent — cheap hedges, thin cushion" },
  { max: 20, k: "Normal", c: "var(--accent)", note: "the resting state of an orderly tape" },
  { max: 28, k: "Elevated", c: "var(--sev-high)", note: "the market is paying up for protection" },
  { max: Infinity, k: "Stress", c: "var(--sev-extreme)", note: "dislocation pricing" },
];
const bandOf = (v) => (v == null ? { k: "—", c: "var(--muted)", note: "No VIX level" } : BANDS.find((b) => v < b.max));

/* The term structure. Read left to right it is the market's own forecast: each
   point is implied vol for a different horizon on the same index. */
function TermCurve({ term }) {
  const pts = (term || []).filter((t) => t.v != null);
  if (pts.length < 2) return <p className="vol-empty mono">Term structure needs at least two tenors; the feed returned {pts.length}.</p>;
  const W = 520, H = 150, padL = 34, padR = 18, padT = 16, padB = 26;
  const vs = pts.map((p) => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  // a 1-point spread across the curve is a flat curve — without a floor the
  // scale would magnify rounding noise into a dramatic slope
  const span = Math.max(hi - lo, 1.5);
  const mid = (hi + lo) / 2;
  const y = (v) => padT + (1 - (v - (mid - span / 2)) / span) * (H - padT - padB);
  const x = (i) => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="vol-curve" role="img" aria-label="VIX term structure">
      <path d={`${d} L${x(pts.length - 1)},${H - padB} L${padL},${H - padB} Z`} fill="var(--accent)" opacity=".10" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <g key={p.k}>
          <circle cx={x(i)} cy={y(p.v)} r="3.4" fill="var(--accent)" />
          <text x={x(i)} y={y(p.v) - 9} className="vol-cv" textAnchor="middle">{n2(p.v)}</text>
          <text x={x(i)} y={H - 8} className="vol-ck" textAnchor="middle">{p.k}</text>
        </g>
      ))}
    </svg>
  );
}

/* A year of VIX closes with the current level marked, because a level only means
   something against its own history — 18 is calm in one regime and elevated in
   another, and the number by itself cannot tell you which. */
function HistChart({ hist, level }) {
  const path = useMemo(() => {
    const v = (hist || []).filter((r) => r.v != null);
    if (v.length < 10) return null;
    const W = 520, H = 118, padT = 8, padB = 16;
    const lo = Math.min(...v.map((r) => r.v)), hi = Math.max(...v.map((r) => r.v));
    const span = hi - lo || 1;
    const y = (x) => padT + (1 - (x - lo) / span) * (H - padT - padB);
    const d = v.map((r, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * W).toFixed(1)},${y(r.v).toFixed(1)}`).join(" ");
    return { W, H, d, lo, hi, yNow: level != null ? y(level) : null };
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

export function VolView({ vol, vix }) {
  // the spot level: the snapshot's vol block first, the cover's VIX record as a
  // fallback so the header still reads when only the FMP path answered
  const spot = vol && vol.term ? (vol.term.find((t) => t.k === "30D") || {}).v : null;
  const level = spot != null ? spot : (vix && vix.level != null ? vix.level : null);
  const chg = vol && vol.term ? (vol.term.find((t) => t.k === "30D") || {}).chg : null;
  const dayChg = chg != null ? chg : (vix && vix.chg != null ? vix.chg : null);
  const band = bandOf(level);

  if (!vol && level == null) {
    return (
      <div className="wrap vol">
        <div className="vol-head">
          <div className="vol-kicker mono">Volatility surface</div>
          <p className="vol-sub mono">
            The volatility feed is unavailable, so nothing here can be drawn. This block is built
            in the nightly snapshot from Yahoo's index data — if it is missing, that run did not
            complete or the tenors were denied upstream. Nothing on this page is estimated in
            its absence.
          </p>
        </div>
      </div>
    );
  }

  const rv20 = vol && vol.realized ? (vol.realized.find((r) => r.k === "20D") || {}).v : null;
  const stateNote = vol && vol.state === "contango"
    ? "Far-dated vol is bid above near-dated — the resting shape of an orderly tape. Hedges get more expensive the further out you buy them."
    : vol && vol.state === "backwardation"
      ? "Near-dated vol is bid ABOVE far-dated. The market is paying most for protection right now, which is what a stressed tape looks like — and historically it is where vol has been closest to a top rather than a bottom."
      : vol && vol.state === "flat"
        ? "The curve is nearly flat — near and far tenors agree on the price of risk. Neither the calm shape nor the stressed one."
        : "Not enough tenors answered to read the curve's shape.";

  return (
    <div className="wrap vol">
      <div className="vol-head">
        <div className="vol-kicker mono">Volatility surface</div>
        <p className="vol-sub mono">
          What options cost across four horizons, against what the S&amp;P has actually delivered.
          Computed nightly from index data — no figure here is interpolated, and a tenor the feed
          skipped is simply absent from the curve.
        </p>
      </div>

      <div className="vol-tiles">
        <div className="vol-tile" title="30-day implied volatility — the VIX itself">
          <span className="vol-tk mono">VIX · 30-day implied</span>
          <span className="vol-tv" style={{ color: band.c }}>{n2(level)}</span>
          <span className="vol-ts mono" data-up={dayChg == null ? undefined : dayChg <= 0}>
            {dayChg == null ? "no change figure" : `${sgn(dayChg)}% on the day`}</span>
        </div>
        <div className="vol-tile" title={band.note}>
          <span className="vol-tk mono">Regime</span>
          <span className="vol-tv" style={{ color: band.c }}>{band.k}</span>
          <span className="vol-ts mono">{band.note}</span>
        </div>
        <div className="vol-tile" title="Share of the last year's closes that sat below today's level">
          <span className="vol-tk mono">1-year percentile</span>
          <span className="vol-tv">{vol && vol.pct1y != null ? `${vol.pct1y}th` : "—"}</span>
          <span className="vol-ts mono">{vol && vol.pct1y != null
            ? `higher than ${vol.pct1y}% of the past year's closes` : "needs a year of closes"}</span>
        </div>
        <div className="vol-tile" title="30-day implied minus 20-day realised. Positive = options are charging more than the index has been delivering.">
          <span className="vol-tk mono">Risk premium</span>
          <span className="vol-tv" data-up={vol && vol.vrp != null ? vol.vrp >= 0 : undefined}>
            {vol && vol.vrp != null ? sgn(vol.vrp, 1) : "—"}</span>
          <span className="vol-ts mono">{vol && vol.vrp != null
            ? (vol.vrp >= 0 ? "implied above realised — sellers paid" : "realised has overtaken implied")
            : "needs implied and realised"}</span>
        </div>
      </div>

      <div className="vol-grid">
        <section className="vol-panel">
          <div className="vol-ph">
            <span className="vol-phk mono">Term structure</span>
            <span className="vol-phv mono" data-state={vol && vol.state ? vol.state : undefined}>
              {vol && vol.state ? vol.state : "—"}{vol && vol.slope != null ? ` · 3M ${sgn(vol.slope, 1)}% vs 30D` : ""}</span>
          </div>
          <TermCurve term={vol && vol.term} />
          <p className="vol-note mono">{stateNote}</p>
        </section>

        <section className="vol-panel">
          <div className="vol-ph">
            <span className="vol-phk mono">Implied vs realised</span>
            <span className="vol-phv mono">S&amp;P 500 · close-to-close</span>
          </div>
          <div className="vol-rv">
            <div className="vol-rvrow" data-lead="true">
              <span className="vol-rvk mono">Implied · 30D</span>
              <span className="vol-rvv mono">{n2(level, 1)}</span>
            </div>
            {(vol && vol.realized ? vol.realized : [{ k: "10D" }, { k: "20D" }, { k: "30D" }]).map((r) => (
              <div className="vol-rvrow" key={r.k}>
                <span className="vol-rvk mono">Realised · {r.k}</span>
                <span className="vol-rvv mono">{n2(r.v, 1)}</span>
              </div>
            ))}
          </div>
          <p className="vol-note mono">
            Realised is the annualised standard deviation of daily log returns — the same
            convention implied vol is quoted on, so the two are comparable rather than merely
            adjacent. {rv20 != null && level != null
              ? `Options are currently pricing ${n2(level, 1)} against a delivered ${n2(rv20, 1)} over the last month.`
              : "Both sides are needed before the gap means anything."}
          </p>
        </section>

        <section className="vol-panel vol-panel-wide">
          <div className="vol-ph">
            <span className="vol-phk mono">VIX · past year</span>
            <span className="vol-phv mono">dashed line is today</span>
          </div>
          <HistChart hist={vol && vol.hist} level={level} />
          <p className="vol-note mono">
            A level only means something against its own history: 18 is complacent in one regime
            and elevated in another, and the number alone cannot say which. The percentile above
            is this series, counted.
          </p>
        </section>
      </div>

      <p className="vol-foot mono">
        Implied volatility is what the options market charges, not a forecast it stands behind, and
        the term structure is a price rather than a prediction. Nothing here is a signal to trade.
      </p>
    </div>
  );
}
