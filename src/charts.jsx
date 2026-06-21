import { useEffect, useRef, useState, useId } from "react";

/* animate a 0→1 progress value once on mount (motion-aware via CSS data-motion) */
export function useGrow(dur = 650) {
  const [p, setP] = useState(0);
  useEffect(() => {
    const reduce = document.querySelector(".app")?.dataset.motion === "reduced"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setP(1); return; }
    let raf; const t0 = performance.now();
    const tick = (t) => { const x = Math.min((t - t0) / dur, 1); setP(1 - Math.pow(1 - x, 3));
      if (x < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    const safety = setTimeout(() => setP(1), dur + 400);
    return () => { cancelAnimationFrame(raf); clearTimeout(safety); };
  }, []);
  return p;
}

/* ---------- PRICE CHART: line + area + volume + pivot + buy zone ---------- */
/* Interactive: hover crosshair (date · price · % vs prior bar) and drag-to-zoom
   (drag horizontally to zoom a range; double-click or "reset zoom" to restore). */
const _fmtP = (n) => (n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2));

export function PriceChart({ closes, volume, pivot, buyLo, buyHi, h = 184 }) {
  const grow = useGrow(750);
  const clipId = useId().replace(/:/g, "");
  const wrapRef = useRef(null);
  const N = closes.length;
  const W = 600, H = h, padB = 34, padT = 10;

  const [domain, setDomain] = useState({ lo: 0, hi: N - 1 });
  const [hover, setHover] = useState(null);   // global index
  const [drag, setDrag] = useState(null);     // { a, b } fractions 0..1

  const lo = Math.max(0, Math.min(domain.lo, N - 2));
  const hi = Math.min(N - 1, Math.max(domain.hi, lo + 1));
  const zoomed = !(lo === 0 && hi === N - 1);
  const vis = closes.slice(lo, hi + 1);
  const visVol = volume.slice(lo, hi + 1);
  const M = vis.length;

  let minV = Math.min(...vis), maxV = Math.max(...vis);
  if (pivot >= minV * 0.9 && pivot <= maxV * 1.1) { minV = Math.min(minV, pivot); maxV = Math.max(maxV, buyHi || pivot); }
  const range = (maxV - minV) || 1;
  const x = (j) => (M <= 1 ? 0 : (j / (M - 1)) * W);
  const y = (v) => padT + (1 - (v - minV) / range) * (H - padB - padT);

  const nGrow = Math.max(2, Math.round(M * grow));
  const visG = vis.slice(0, nGrow);
  const line = visG.map((c, j) => `${x(j).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const area = `0,${y(minV)} ${line} ${x(visG.length - 1).toFixed(1)},${y(minV)}`;
  const vmax = Math.max(...visVol);
  const last = vis[vis.length - 1], up = last >= vis[0];

  const fracOf = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  };
  const fracToGlobal = (frac) => lo + Math.round(frac * (M - 1));
  const onMove = (e) => { const f = fracOf(e); setHover(fracToGlobal(f)); if (drag) setDrag((d) => ({ ...d, b: f })); };
  const onDown = (e) => { const f = fracOf(e); setDrag({ a: f, b: f }); };
  const onUp = () => {
    if (drag) {
      const a = fracToGlobal(Math.min(drag.a, drag.b)), b = fracToGlobal(Math.max(drag.a, drag.b));
      if (b - a >= 3) setDomain({ lo: a, hi: b });
      setDrag(null);
    }
  };
  const onLeave = () => { setHover(null); setDrag(null); };
  const reset = () => setDomain({ lo: 0, hi: N - 1 });

  const hj = hover != null ? hover - lo : null;
  const hx = hj != null ? x(hj) : null;
  const dateFor = (gi) => { const d = new Date(); d.setDate(d.getDate() - (N - 1 - gi)); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
  const pctPrev = hover != null && hover > 0 ? ((closes[hover] - closes[hover - 1]) / closes[hover - 1]) * 100 : 0;
  const tipLeft = hx != null ? Math.min(92, Math.max(8, (hx / W) * 100)) : 0;

  return (
    <div className="pchart" ref={wrapRef} onMouseMove={onMove} onMouseDown={onDown} onMouseUp={onUp} onMouseLeave={onLeave} onDoubleClick={reset}
      style={{ position: "relative", cursor: drag ? "ew-resize" : "crosshair", userSelect: "none" }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Price chart">
        <defs><clipPath id={clipId}><rect x="0" y="0" width={W} height={H} /></clipPath></defs>
        <g clipPath={`url(#${clipId})`}>
          {buyLo != null && (
            <rect x="0" y={y(buyHi)} width={W} height={Math.max(0, y(buyLo) - y(buyHi))}
              fill="color-mix(in oklch, var(--cat-growth) 13%, transparent)" />
          )}
          {pivot != null && <line x1="0" y1={y(pivot)} x2={W} y2={y(pivot)} className="chart-pivot" />}
          {visVol.map((v, j) => j < nGrow && (
            <rect key={j} x={x(j) - 1.6} width="3.2" y={H - padB - (v / vmax) * 24} height={(v / vmax) * 24}
              className="chart-vol" data-up={vis[j] >= (vis[j - 1] ?? vis[j])} />
          ))}
          <polygon points={area} className="chart-area" />
          <polyline points={line} className="chart-line" data-up={up} />
          {grow > 0.98 && <circle cx={x(visG.length - 1)} cy={y(last)} r="3.2" className="chart-dot" />}
          {hx != null && !drag && (
            <>
              <line x1={hx} y1={padT - 4} x2={hx} y2={H - padB} className="chart-cross" />
              <circle cx={hx} cy={y(closes[hover])} r="3.4" className="chart-cross-dot" />
            </>
          )}
          {drag && (
            <rect x={Math.min(drag.a, drag.b) * W} y={padT} width={Math.abs(drag.b - drag.a) * W} height={H - padB - padT} className="chart-sel" />
          )}
        </g>
      </svg>
      {hover != null && !drag && (
        <div className="pchart-tip" style={{ left: `${tipLeft}%` }}>
          <span className="pchart-tip-d mono">{dateFor(hover)}</span>
          <span className="pchart-tip-p mono">${_fmtP(closes[hover])}</span>
          <span className="pchart-tip-c mono" data-up={pctPrev >= 0}>{pctPrev >= 0 ? "+" : ""}{pctPrev.toFixed(2)}%</span>
        </div>
      )}
      {zoomed && <button className="pchart-reset mono" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); reset(); }}>reset zoom ✕</button>}
    </div>
  );
}

/* ---------- REACTION WINDOW: avg cumulative move T-5..T+5 ---------- */
export function ReactionWindow({ data, h = 150 }) {
  const grow = useGrow(700);
  const W = 560, H = h, padB = 26, padT = 14, padX = 8;
  const vals = data.map((d) => d.v);
  const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
  const range = (hi - lo) || 1;
  const x = (i) => padX + (i / (data.length - 1)) * (W - padX * 2);
  const y = (v) => padT + (1 - (v - lo) / range) * (H - padB - padT);
  const zeroIdx = data.findIndex((d) => d.d === 0);
  const n = Math.max(2, Math.round(data.length * grow));
  const vis = data.slice(0, n);
  const line = vis.map((d, i) => `${x(i).toFixed(1)},${y(d.v).toFixed(1)}`).join(" ");
  const area = `${x(0)},${y(0)} ${line} ${x(vis.length - 1)},${y(0)}`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Reaction window">
      <line x1="0" y1={y(0)} x2={W} y2={y(0)} className="chart-zero" />
      <line x1={x(zeroIdx)} y1={padT - 6} x2={x(zeroIdx)} y2={H - padB} className="chart-eventline" />
      <polygon points={area} className="chart-area" />
      <polyline points={line} className="chart-line" data-up={data[data.length - 1].v >= 0} />
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={H - 8} className="chart-xlab"
          style={{ fontWeight: d.d === 0 ? 700 : 400 }}>{d.d === 0 ? "0" : (d.d > 0 ? "+" + d.d : d.d)}</text>
      ))}
    </svg>
  );
}

/* ---------- MOVE DISTRIBUTION: signed bars of past instances ---------- */
export function MoveDistribution({ instances, h = 150 }) {
  const grow = useGrow(650);
  const W = 560, H = h, padB = 22, padT = 12;
  const vals = instances.map((i) => i.move);
  const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
  const range = (hi - lo) || 1;
  const y0 = padT + (1 - (0 - lo) / range) * (H - padB - padT);
  const bw = (W / instances.length) * 0.62;
  const gap = (W / instances.length);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Historical move distribution">
      <line x1="0" y1={y0} x2={W} y2={y0} className="chart-zero" />
      {instances.map((it, i) => {
        const yv = padT + (1 - (it.move - lo) / range) * (H - padB - padT);
        const top = Math.min(yv, y0), hgt = Math.abs(yv - y0) * grow;
        const cx = gap * i + gap / 2;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={it.move >= 0 ? y0 - hgt : y0} width={bw} height={hgt}
              className="chart-bar" data-up={it.move >= 0} rx="1.5" />
            <text x={cx} y={H - 7} className="chart-xlab">{it.label.replace("’", "'")}</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---------- RS LINE (relative strength) ---------- */
export function RSLine({ rs, h = 60 }) {
  const grow = useGrow(700);
  const W = 600, H = h, pad = 6;
  const min = Math.min(...rs), max = Math.max(...rs), range = max - min || 1;
  const x = (i) => (i / (rs.length - 1)) * W;
  const y = (v) => pad + (1 - (v - min) / range) * (H - pad * 2);
  const n = Math.max(2, Math.round(rs.length * grow));
  const line = rs.slice(0, n).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Relative strength line">
      <polyline points={line} className="chart-rs" />
    </svg>
  );
}

/* ---------- DONUT SCORE ---------- */
export function ScoreDonut({ score, label = "Composite", size = 96 }) {
  const grow = useGrow(800);
  const r = 40, c = 2 * Math.PI * r;
  const pct = score / 100 * grow;
  const grade = score >= 93 ? "a" : score >= 80 ? "b" : "c";
  return (
    <div className="donut" style={{ width: size, height: size }} data-grade={grade}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} className="donut-track" />
        <circle cx="50" cy="50" r={r} className="donut-val"
          strokeDasharray={`${c * pct} ${c}`} transform="rotate(-90 50 50)" />
      </svg>
      <div className="donut-mid">
        <span className="donut-num">{Math.round(score * grow)}</span>
        <span className="donut-lab">{label}</span>
      </div>
    </div>
  );
}

/* ---------- horizontal bar meter ---------- */
export function BarMeter({ value, max = 100, suffix = "", c = "var(--accent)" }) {
  const grow = useGrow(600);
  return (
    <div className="meter"><i style={{ width: Math.min(value / max, 1) * 100 * grow + "%", background: c }} /></div>
  );
}
