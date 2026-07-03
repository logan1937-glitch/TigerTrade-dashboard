import { useState, useMemo } from "react";
import { TT } from "./tt.js";
import { SEV_LABEL } from "./components.jsx";

// ── Catalyst Timeline: the next 90 days of scheduled events on one axis ───────
// Lanes = the five category hues already used across the radar (scope, badges);
// marker size = severity; every marker is clickable (opens the event drawer) and
// hover shows countdown + release data. Data: curated calendar, live-dated when
// the economic feed is connected.

const HORIZON = 90;
const SEV_R = { extreme: 7, high: 5.5, medium: 4.2, low: 3.2 };

export function CatalystTimeline({ events, onOpen }) {
  const [hover, setHover] = useState(null);

  const upcoming = useMemo(() => events.filter((e) => !e.past && -e.t >= 0).sort((a, b) => a.sort - b.sort), [events]);
  const inWin = upcoming.filter((e) => -e.t <= HORIZON);
  const beyond = upcoming.filter((e) => -e.t > HORIZON);

  const lanes = TT.CATEGORIES;
  const W = 640, laneH = 34, padT = 18, padB = 24, padL = 86, padR = 16;
  const H = padT + lanes.length * laneH + padB;
  const x = (days) => padL + (days / HORIZON) * (W - padL - padR);
  const laneY = (cat) => padT + lanes.findIndex((l) => l.id === cat) * laneH + laneH / 2;

  const hv = hover != null ? inWin.find((e) => e.id === hover) : null;

  return (
    <div className="wrap ctl">
      <div className="listmeta" style={{ marginBottom: 10 }}>
        <span className="count"><b>{inWin.length}</b> catalysts in the next {HORIZON} days · sized by weight</span>
        <span className="count mono" style={{ opacity: .8 }}>tap a marker for the full event</span>
      </div>

      <div className="ctl-card" style={{ position: "relative" }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="none" role="img" aria-label="Catalyst timeline">
          {/* week/month gridlines */}
          {[7, 30, 60, 90].map((d) => (
            <g key={d}>
              <line x1={x(d)} y1={padT - 6} x2={x(d)} y2={H - padB + 2} className="ctl-grid" />
              <text x={x(d)} y={H - 8} className="chart-xlab">{d}d</text>
            </g>
          ))}
          <line x1={x(0)} y1={padT - 6} x2={x(0)} y2={H - padB + 2} className="chart-eventline" />
          <text x={x(0)} y={H - 8} className="chart-xlab" style={{ fontWeight: 700 }}>now</text>

          {/* lane rails + labels */}
          {lanes.map((l) => (
            <g key={l.id}>
              <line x1={padL} y1={laneY(l.id)} x2={W - padR} y2={laneY(l.id)} className="ctl-rail" />
              <text x={padL - 8} y={laneY(l.id) + 3} className="ctl-lane" textAnchor="end">{l.label}</text>
            </g>
          ))}

          {/* event markers */}
          {inWin.map((e) => {
            const cx = x(-e.t), cy = laneY(e.cat);
            const r = SEV_R[e.sev] || 4;
            return (
              <g key={e.id} style={{ cursor: "pointer" }}
                 onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
                 onClick={() => onOpen && onOpen(e)}>
                <circle cx={cx} cy={cy} r="13" fill="transparent" />
                <circle cx={cx} cy={cy} r={hover === e.id ? r + 2 : r} className="ctl-dot"
                  style={{ fill: TT.CAT_MAP[e.cat].color }} data-sev={e.sev} />
                {e.live && <circle cx={cx} cy={cy} r={r + 4} className="ctl-live-ring" />}
              </g>
            );
          })}
        </svg>

        {hv && (
          <div className="pchart-tip" style={{ left: `${(x(-hv.t) / W) * 100}%`, top: `${Math.max(0, (laneY(hv.cat) / H) * 100 - 16)}%` }}>
            <span className="pchart-tip-p mono">{hv.title}</span>
            <span className="pchart-tip-d mono">{hv.date} · T{hv.t}d · {SEV_LABEL[hv.sev]}</span>
            {hv.econ && (hv.econ.previous != null || hv.econ.estimate != null) && (
              <span className="pchart-tip-d mono">
                {hv.econ.previous != null ? `prev ${hv.econ.previous}${hv.econ.unit}` : ""}{hv.econ.estimate != null ? ` · cons ${hv.econ.estimate}${hv.econ.unit}` : ""}
              </span>
            )}
          </div>
        )}
      </div>

      {/* legend: identity is the category hue set used across the radar */}
      <div className="scope-legend" style={{ margin: "12px auto 0", maxWidth: "none", justifyContent: "flex-start" }}>
        {TT.CATEGORIES.map((c) => (
          <span key={c.id} className="scope-leg" style={{ "--c": c.color }}><i />{c.label}</span>
        ))}
        <span className="scope-leg" style={{ "--c": "var(--accent)" }}><i style={{ background: "transparent", border: "1.5px solid var(--accent)" }} />live-dated</span>
      </div>

      {beyond.length > 0 && (
        <div className="ctl-beyond">
          <span className="ed-k mono" style={{ marginBottom: 0 }}>Beyond {HORIZON}d</span>
          {beyond.map((e) => (
            <button key={e.id} className="ticker mono" onClick={() => onOpen && onOpen(e)} style={{ cursor: "pointer" }}>
              {e.title} · {e.date}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
