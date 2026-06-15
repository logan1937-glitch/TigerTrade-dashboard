import { useState } from "react";
import { TT } from "./tt.js";

export function RadarScope({ events, onSelect, activeId }) {
  const [hover, setHover] = useState(null);
  const blips = events.map((ev, i) => {
    const p = TT.radarPos(ev, i);
    return { ev, left: 50 + p.x * p.r * 50, top: 50 + p.y * p.r * 50 };
  });
  const hv = hover != null ? blips.find((b) => b.ev.id === hover) : null;

  return (
    <div className="scope" role="img" aria-label="Event radar scope">
      <svg className="scope-grid" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
        {TT.RINGS.map((ring, i) => (
          <circle key={i} cx="50" cy="50" r={TT.ringR(ring.t) * 50} className="scope-ring" />
        ))}
        <line x1="50" y1="2" x2="50" y2="98" className="scope-cross" />
        <line x1="2" y1="50" x2="98" y2="50" className="scope-cross" />
        <line x1="14" y1="14" x2="86" y2="86" className="scope-cross scope-cross-d" />
        <line x1="86" y1="14" x2="14" y2="86" className="scope-cross scope-cross-d" />
        {TT.RINGS.map((ring, i) => (
          <text key={"t" + i} x="50.8" y={50 - TT.ringR(ring.t) * 50 + 3} className="scope-rlabel">{ring.label}</text>
        ))}
      </svg>

      <div className="scope-sweep" />

      {blips.map((b) => {
        const cat = TT.CAT_MAP[b.ev.cat];
        const imminent = Math.abs(b.ev.t) <= 7;
        return (
          <button key={b.ev.id} className="blip"
            data-sev={b.ev.sev} data-imminent={imminent || undefined} data-active={b.ev.id === activeId || undefined}
            style={{ left: b.left + "%", top: b.top + "%", "--c": cat.color }}
            onMouseEnter={() => setHover(b.ev.id)} onMouseLeave={() => setHover(null)}
            onFocusCapture={() => setHover(b.ev.id)}
            onClick={() => onSelect && onSelect(b.ev)}
            aria-label={`${b.ev.title}, T${b.ev.t} days`}>
            <span className="blip-dot" />
          </button>
        );
      })}

      <div className="scope-center"><span /></div>
      <div className="scope-now mono">NOW</div>

      {hv && (
        <div className="scope-tip" style={{ left: hv.left + "%", top: hv.top + "%", "--c": TT.CAT_MAP[hv.ev.cat].color }}>
          <span className="scope-tip-t mono">{hv.ev.approx ? "~" : ""}{hv.ev.date} · T{hv.ev.t}d</span>
          <span className="scope-tip-n">{hv.ev.title}</span>
        </div>
      )}
    </div>
  );
}

export function ScopeLegend() {
  return (
    <div className="scope-legend">
      {TT.CATEGORIES.map((c) => (
        <span key={c.id} className="scope-leg" style={{ "--c": c.color }}><i />{c.label}</span>
      ))}
    </div>
  );
}
