import { useState, useMemo } from "react";
import { relativeRotation, aggregateRsLine } from "./signals.js";

// ── Market Map: sector momentum heatmap + relative-rotation graph ─────────────
// Every mark is computed from the live feed (real returns, real RS). Rules:
// polarity is encoded with the P&L pair AND a printed signed number (never color
// alone); quadrant identity is positional with text labels — the palette
// validator rejected a 4-hue quadrant scheme for CVD, so we don't use one.

const TF_BARS = { "1W": 5, "1M": 21, "3M": 63 };
const ret = (r, tf) => {
  const c = r.closes, n = c ? c.length : 0;
  if (!c || n < 2) return null;
  const back = TF_BARS[tf] || 21;
  return (c[n - 1] / c[Math.max(0, n - 1 - back)] - 1) * 100;
};
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/* -------------------------- sector heatmap -------------------------- */
function SectorMap({ rows, tf, onSelectSector }) {
  const sectors = useMemo(() => {
    const by = {};
    for (const r of rows) {
      if (!r.sig || r.sector === "Custom") continue;
      (by[r.sector] = by[r.sector] || []).push(r);
    }
    return Object.entries(by).map(([sector, list]) => {
      const rets = list.map((r) => ret(r, tf)).filter((v) => v != null && Number.isFinite(v));
      const med = median(rets);
      const leader = [...list].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      return { sector, n: list.length, med, leader: leader?.tk };
    }).filter((s) => s.med != null).sort((a, b) => b.med - a.med);
  }, [rows, tf]);

  if (!sectors.length) return <div className="empty">Waiting for live data…</div>;
  const maxAbs = Math.max(1, ...sectors.map((s) => Math.abs(s.med)));

  return (
    <div className="mm-tiles">
      {sectors.map((s) => {
        const up = s.med >= 0;
        const alpha = Math.min(0.30, 0.05 + (Math.abs(s.med) / maxAbs) * 0.25);
        return (
          <button key={s.sector} className="mm-tile" onClick={() => onSelectSector(s.sector)}
            title={`Filter the screener to ${s.sector}`}
            style={{ background: `color-mix(in oklch, ${up ? "var(--cat-growth)" : "var(--sev-extreme)"} ${Math.round(alpha * 100)}%, var(--surface))`,
                     borderLeft: `3px solid ${up ? "var(--cat-growth)" : "var(--sev-extreme)"}` }}>
            <span className="mm-tile-name">{s.sector}</span>
            <span className="mm-tile-ret mono" data-up={up}>{up ? "+" : ""}{s.med.toFixed(1)}%</span>
            <span className="mm-tile-meta mono">{s.n} name{s.n === 1 ? "" : "s"} · led by {s.leader}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------- relative-rotation graph (RRG-style) ----------------------
   Plots each entity's relative-strength TREND (x, "RS-Ratio") vs the MOMENTUM of
   that trend (y, "RS-Momentum") around a 100/100 center vs the S&P 500. A tail of
   recent weeks shows the rotation (clockwise: Improving → Leading → Weakening →
   Lagging). Our own approximation of the concept popularized by Julius de
   Kempenaer (RRG Research); not the proprietary JdK RS-Ratio/RS-Momentum®.
   Quadrant tints are contextual only — identity is always a direct label. */
const QUAD = (p) => (p.ratio >= 100 ? (p.mom >= 100 ? "leading" : "weakening") : (p.mom >= 100 ? "improving" : "lagging"));

function RelativeRotation({ rows, onOpenStock }) {
  const [mode, setMode] = useState("sectors");
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);   // tapped sector whose tail stays shown
  const TAIL = 6, STEP = 5;

  const entities = useMemo(() => {
    const build = (id, label, rsLine, meta) => {
      const rr = relativeRotation(rsLine);
      if (!rr || rr.length < (TAIL - 1) * STEP + 1) return null;
      const tail = [];
      for (let k = TAIL - 1; k >= 0; k--) tail.push(rr[rr.length - 1 - k * STEP]);
      return { id, label, tail, head: tail[tail.length - 1], ...meta };
    };
    if (mode === "sectors") {
      const by = {};
      for (const r of rows) { if (!r.sig || !r.sig.rsLine || r.sector === "Custom") continue; (by[r.sector] = by[r.sector] || []).push(r); }
      return Object.entries(by).map(([sector, list]) => {
        const agg = aggregateRsLine(list.map((r) => r.sig.rsLine));
        return agg ? build(sector, sector, agg, { n: list.length, kind: "sector" }) : null;
      }).filter(Boolean);
    }
    return rows.filter((r) => r.sig && r.sig.rsLine).map((r) => build(r.tk, r.tk, r.sig.rsLine, { kind: "name", score: r.score || 0 })).filter(Boolean);
  }, [rows, mode]);

  if (entities.length < 2) return <div className="empty">Waiting for live data…</div>;

  const W = 600, H = 400, padL = 26, padR = 14, padT = 14, padB = 24;
  const all = entities.flatMap((e) => e.tail);
  // scale each axis INDEPENDENTLY around 100 (RS-momentum deviations are smaller
  // than RS-ratio's, so a shared domain would flatten the momentum axis)
  const domX = Math.max(0.6, ...all.map((p) => Math.abs(p.ratio - 100))) * 1.18;
  const domY = Math.max(0.4, ...all.map((p) => Math.abs(p.mom - 100))) * 1.2;
  const x = (r) => padL + ((r - 100 + domX) / (2 * domX)) * (W - padL - padR);
  const y = (m) => padT + (1 - (m - 100 + domY) / (2 * domY)) * (H - padT - padB);
  const cx = x(100), cy = y(100);

  const labeled = mode === "sectors"
    ? new Set(entities.map((e) => e.id))
    : new Set([...entities].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 8).map((e) => e.id));

  // greedy vertical de-collision of labels, kept inside the plot
  const placed = entities.filter((e) => labeled.has(e.id))
    .map((e) => { const dx = x(e.head.ratio), oy = y(e.head.mom); return { e, dx, oy, dy: oy, right: dx <= W * 0.8 }; })
    .sort((a, b) => a.oy - b.oy);
  const GAP = 12;
  for (let i = 1; i < placed.length; i++) if (placed[i].dy - placed[i - 1].dy < GAP) placed[i].dy = placed[i - 1].dy + GAP;
  if (placed.length) { const over = placed[placed.length - 1].dy - (H - padB - 3); if (over > 0) placed.forEach((p) => (p.dy = Math.max(padT + 9, p.dy - over))); }

  const hv = entities.find((e) => e.id === (hover ?? pinned)) || null;

  return (
    <div className="mm-scatter" style={{ position: "relative" }}>
      <div className="rrg-toolbar">
        <div className="seg">
          {[["sectors", "Sectors"], ["names", "Names"]].map(([id, l]) => (
            <button key={id} className="seg-btn" data-active={mode === id} onClick={() => { setMode(id); setHover(null); setPinned(null); }}>{l}</button>
          ))}
        </div>
        <span className="dr-sec-sub mono">{mode === "sectors" ? "tap a sector to trace its 6-week path" : "tap a name for analysis · hover to trace"}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="none" role="img" aria-label="Relative rotation vs S&P 500">
        <rect x={cx} y={padT} width={W - padR - cx} height={cy - padT} className="rrg-q" data-q="leading" />
        <rect x={cx} y={cy} width={W - padR - cx} height={H - padB - cy} className="rrg-q" data-q="weakening" />
        <rect x={padL} y={cy} width={cx - padL} height={H - padB - cy} className="rrg-q" data-q="lagging" />
        <rect x={padL} y={padT} width={cx - padL} height={cy - padT} className="rrg-q" data-q="improving" />
        <line x1={cx} y1={padT} x2={cx} y2={H - padB} className="chart-zero" />
        <line x1={padL} y1={cy} x2={W - padR} y2={cy} className="chart-zero" />
        <text x={W - padR - 5} y={padT + 12} className="mm-quad" textAnchor="end">LEADING</text>
        <text x={padL + 5} y={padT + 12} className="mm-quad">IMPROVING</text>
        <text x={padL + 5} y={H - padB - 6} className="mm-quad">LAGGING</text>
        <text x={W - padR - 5} y={H - padB - 6} className="mm-quad" textAnchor="end">WEAKENING</text>
        {/* dots + on-demand tail (only the hovered / tapped entity) */}
        {entities.map((e) => {
          const active = hover === e.id || pinned === e.id;
          const hx = x(e.head.ratio), hy = y(e.head.mom);
          const pts = active ? e.tail.map((p) => `${x(p.ratio).toFixed(1)},${y(p.mom).toFixed(1)}`).join(" ") : null;
          return (
            <g key={e.id} style={{ cursor: "pointer" }}
               onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
               onClick={() => (e.kind === "name" ? onOpenStock({ tk: e.id }) : setPinned((v) => (v === e.id ? null : e.id)))}>
              {active && <polyline points={pts} className="rrg-tail" data-active />}
              {active && e.tail.slice(0, -1).map((p, i) => (
                <circle key={i} cx={x(p.ratio)} cy={y(p.mom)} r="1.6" className="rrg-tail-dot" />
              ))}
              <circle cx={hx} cy={hy} r="13" fill="transparent" />
              <circle cx={hx} cy={hy} r={active ? 6 : 4.2} className="rrg-head" data-active={active || undefined} />
            </g>
          );
        })}
        {/* de-collided labels, drawn on top */}
        {placed.map(({ e, dx, oy, dy, right }) => {
          const active = hover === e.id || pinned === e.id;
          return (
            <g key={"l" + e.id} style={{ pointerEvents: "none" }}>
              {Math.abs(dy - oy) > 7 && <line x1={dx} y1={oy} x2={right ? dx + 6 : dx - 6} y2={dy - 3} className="rrg-lbl-conn" />}
              <text x={right ? dx + 8 : dx - 8} y={dy} className="mm-dot-label" data-active={active || undefined} textAnchor={right ? "start" : "end"}>{e.label}</text>
            </g>
          );
        })}
      </svg>
      {hv && (
        <div className="pchart-tip" style={{ left: `${(x(hv.head.ratio) / W) * 100}%`, top: `${Math.max(0, (y(hv.head.mom) / H) * 100 - 15)}%`,
          transform: x(hv.head.ratio) > W * 0.7 ? "translateX(-100%)" : x(hv.head.ratio) < W * 0.2 ? "none" : "translateX(-50%)" }}>
          <span className="pchart-tip-p mono">{hv.label}{hv.kind === "sector" ? ` · ${hv.n} names` : ""}</span>
          <span className="pchart-tip-d mono" style={{ textTransform: "capitalize" }}>{QUAD(hv.head)}</span>
          <span className="pchart-tip-d mono">Ratio {hv.head.ratio.toFixed(1)} · Mom {hv.head.mom.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ shell ------------------------------ */
export function MarketMap({ rows, live, onOpenStock, onSelectSector }) {
  const [tf, setTf] = useState("1M");
  const withSig = rows.filter((r) => r.sig).length;
  return (
    <div className="wrap mm">
      <div className="filters" style={{ marginBottom: 10 }}>
        <span className="count"><b>{withSig}</b> names · median sector momentum &amp; RS rotation · live EOD</span>
        <div className="filters-right">
          <span className="minwt-lab">Window</span>
          <div className="seg">
            {["1W", "1M", "3M"].map((id) => (
              <button key={id} className="seg-btn" data-active={tf === id} onClick={() => setTf(id)}>{id}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="mm-sec-h"><h3>Sector momentum</h3><span className="dr-sec-sub mono">median {tf} return · tap a sector to screen it</span></div>
      <SectorMap rows={rows} tf={tf} onSelectSector={onSelectSector} />

      <div className="mm-sec-h" style={{ marginTop: 26 }}><h3>Relative rotation</h3><span className="dr-sec-sub mono">RS-trend vs its momentum · benchmark: S&amp;P 500</span></div>
      <div className="mm-scatter-card">
        <RelativeRotation rows={rows} onOpenStock={onOpenStock} />
        <p className="mono mm-rrg-note">
          <b>Reading it:</b> right = outperforming the S&amp;P; up = that outperformance is accelerating. Names rotate clockwise through
          Improving → Leading → Weakening → Lagging.
          <span style={{ opacity: .7 }}> Our approximation of the relative-rotation concept popularized by Julius de Kempenaer (RRG Research); not the proprietary JdK RS-Ratio / RS-Momentum. Educational use only.</span>
        </p>
      </div>
    </div>
  );
}
