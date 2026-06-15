import { useEffect, useRef, useState } from "react";

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
export function PriceChart({ closes, volume, pivot, buyLo, buyHi, h = 184 }) {
  const grow = useGrow(750);
  const W = 600, H = h, padB = 34, padT = 10;
  const min = Math.min(...closes, pivot), max = Math.max(...closes, buyHi || pivot);
  const range = max - min || 1;
  const x = (i) => (i / (closes.length - 1)) * W;
  const y = (v) => padT + (1 - (v - min) / range) * (H - padB - padT);
  const n = Math.max(2, Math.round(closes.length * grow));
  const vis = closes.slice(0, n);
  const line = vis.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(" ");
  const area = `0,${y(min)} ${line} ${x(vis.length - 1).toFixed(1)},${y(min)}`;
  const vmax = Math.max(...volume);
  const last = closes[closes.length - 1];
  const up = last >= closes[0];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Price chart">
      {buyLo != null && (
        <rect x="0" y={y(buyHi)} width={W} height={Math.max(0, y(buyLo) - y(buyHi))}
          fill="color-mix(in oklch, var(--cat-growth) 13%, transparent)" />
      )}
      {pivot != null && <line x1="0" y1={y(pivot)} x2={W} y2={y(pivot)} className="chart-pivot" />}
      {volume.map((v, i) => i < n && (
        <rect key={i} x={x(i) - 1.6} width="3.2" y={H - padB - (v / vmax) * 24} height={(v / vmax) * 24}
          className="chart-vol" data-up={closes[i] >= (closes[i - 1] ?? closes[i])} />
      ))}
      <polygon points={area} className="chart-area" />
      <polyline points={line} className="chart-line" data-up={up} />
      {grow > 0.98 && <circle cx={x(closes.length - 1)} cy={y(last)} r="3.2" className="chart-dot" />}
    </svg>
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
