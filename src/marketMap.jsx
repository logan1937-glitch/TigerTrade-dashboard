import { useState, useMemo } from "react";

// ── Market Map: sector momentum heatmap + rotation scatter ────────────────────
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
      const rets = list.map((r) => ret(r, tf)).filter((v) => v != null);
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

/* -------------------------- rotation scatter -------------------------- */
function RotationScatter({ rows, tf, onOpenStock }) {
  const [hover, setHover] = useState(null);
  const W = 600, H = 330, padL = 8, padR = 8, padT = 22, padB = 26;

  const pts = useMemo(() => rows
    .filter((r) => r.sig && r.rs != null)
    .map((r) => ({ tk: r.tk, name: r.name, rs: r.rs, ret: ret(r, tf), score: r.score || 0, sector: r.sector }))
    .filter((p) => p.ret != null), [rows, tf]);

  if (pts.length < 5) return <div className="empty">Waiting for live data…</div>;

  const maxAbs = Math.max(3, ...pts.map((p) => Math.abs(p.ret))) * 1.08;
  const x = (v) => padL + ((v + maxAbs) / (2 * maxAbs)) * (W - padL - padR);
  const y = (rs) => padT + (1 - (rs - 1) / 98) * (H - padT - padB);
  const x0 = x(0), y50 = y(50);

  // selective direct labels: top names by momentum score only
  const labeled = new Set([...pts].sort((a, b) => b.score - a.score).slice(0, 7).map((p) => p.tk));
  const hp = hover != null ? pts.find((p) => p.tk === hover) : null;

  return (
    <div className="mm-scatter" style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="none" role="img" aria-label="RS vs momentum rotation map">
        {/* quadrant fields + midlines */}
        <line x1={x0} y1={padT - 8} x2={x0} y2={H - padB} className="chart-zero" />
        <line x1={padL} y1={y50} x2={W - padR} y2={y50} className="chart-zero" />
        <text x={W - padR - 4} y={padT + 2} className="mm-quad" textAnchor="end">LEADING</text>
        <text x={padL + 4} y={padT + 2} className="mm-quad">WEAKENING</text>
        <text x={padL + 4} y={H - padB - 6} className="mm-quad">LAGGING</text>
        <text x={W - padR - 4} y={H - padB - 6} className="mm-quad" textAnchor="end">IMPROVING</text>
        <text x={x0} y={H - 8} className="chart-xlab">{tf} return → 0%</text>
        {pts.map((p) => (
          <g key={p.tk} style={{ cursor: "pointer" }}
             onMouseEnter={() => setHover(p.tk)} onMouseLeave={() => setHover(null)}
             onClick={() => onOpenStock({ tk: p.tk })}>
            {/* oversized invisible hit target */}
            <circle cx={x(p.ret)} cy={y(p.rs)} r="11" fill="transparent" />
            <circle cx={x(p.ret)} cy={y(p.rs)} r={hover === p.tk ? 6.5 : 4.5} className="mm-dot" data-up={p.ret >= 0} />
            {(labeled.has(p.tk) || hover === p.tk) && (
              x(p.ret) > W * 0.86
                ? <text x={x(p.ret) - 9} y={y(p.rs) + 3.5} className="mm-dot-label" textAnchor="end">{p.tk}</text>
                : <text x={x(p.ret) + 8} y={y(p.rs) + 3.5} className="mm-dot-label">{p.tk}</text>
            )}
          </g>
        ))}
      </svg>
      <span className="mm-axis-y mono">RS 99 ↑ · 1 ↓</span>
      {hp && (
        <div className="pchart-tip" style={{ left: `${(x(hp.ret) / W) * 100}%`, top: Math.max(0, (y(hp.rs) / H) * 100 - 14) + "%" }}>
          <span className="pchart-tip-p mono">{hp.tk}</span>
          <span className="pchart-tip-d mono">RS {hp.rs}</span>
          <span className="pchart-tip-c mono" data-up={hp.ret >= 0}>{hp.ret >= 0 ? "+" : ""}{hp.ret.toFixed(1)}% {tf}</span>
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

      <div className="mm-sec-h" style={{ marginTop: 26 }}><h3>Rotation map</h3><span className="dr-sec-sub mono">RS rating vs {tf} return · tap a name for full analysis</span></div>
      <div className="mm-scatter-card">
        <RotationScatter rows={rows} tf={tf} onOpenStock={onOpenStock} />
        <div className="mm-legend mono">
          <span><i className="mm-key" data-up="true" /> positive {tf} return</span>
          <span><i className="mm-key" data-up="false" /> negative</span>
          <span style={{ opacity: .7 }}>labels = top momentum scores</span>
        </div>
      </div>
    </div>
  );
}
