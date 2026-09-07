import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PriceChart } from "./charts.jsx";
import { NA } from "./components.jsx";

/* THE CHART, BLOWN UP.
   The drawer's chart is 184px tall inside a 620px column, and the screener's
   context panel gets a 46px spark — enough to see a shape, not enough to read
   price action against a level. Every desk tool has a full-canvas view for
   exactly this reason: you decide against the levels, and a level you cannot
   place on the chart is a number in a table.

   It reuses `PriceChart` rather than reimplementing one, so the zoom, the
   crosshair, the drag-to-select window and the moving-average overlays all come
   along and cannot drift from the small version. The only thing that changes is
   the canvas — and the levels, which finally have room to be labelled.

   PORTALLED INTO `.app`. `position: fixed` resolves against the nearest
   TRANSFORMED ancestor, and `.cs-row` carries one, so rendering in place put
   this off-screen; portalling to <body> instead renders it unstyled, because
   every theme token lives on the `.app` wrapper. Same trap the glossary popup
   already paid for. */
/* The sampled series, drawn plainly. No volume (the record has none), no
   crosshair (there is nothing between the points to read), and a deliberately
   moderate height so the four-session sampling is not magnified into something
   that looks like tick data. The levels are the reason to open this at all, so
   they are drawn and labelled. */
function SampledChart({ data, pivot, stop }) {
  /* padR is the LABEL GUTTER, not decoration: "buy point $1,497.60" is ~120
     viewBox units at 11px, and at 64 the labels ran off the right edge of the
     viewBox and were clipped — the high and low read as "$262" and "$1719"
     with the rest gone. Measured against the longest label this can produce. */
  const W = 1000, H = 300, padT = 16, padB = 22, padR = 132;
  let lo = Math.min(...data), hi = Math.max(...data);
  // a level only widens the scale when it is close enough to matter; far below,
  // it would flatten the price into a band (same rule PriceChart uses)
  for (const lv of [pivot, stop]) {
    if (lv != null && lv >= lo * 0.9 && lv <= hi * 1.1) { lo = Math.min(lo, lv); hi = Math.max(hi, lv); }
  }
  const range = (hi - lo) || 1;
  const x = (i) => (i / (data.length - 1)) * (W - padR);
  const y = (v) => padT + (1 - (v - lo) / range) * (H - padT - padB);
  const pts = data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const money = (v) => "$" + (+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const lvl = (v, cls, label) => (v == null || v < lo || v > hi ? null : (
    <g key={label}>
      <line x1="0" y1={y(v)} x2={W - padR} y2={y(v)} className={cls} />
      <text x={W - padR + 10} y={y(v) + 4} className="cm-lvl-t">{label} {money(v)}</text>
    </g>
  ));
  return (
    <svg className="cm-sampled" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="Sampled price path with buy point and trailing stop">
      <polygon points={`0,${y(lo)} ${pts} ${x(data.length - 1).toFixed(1)},${y(lo)}`} className="chart-area" />
      <polyline points={pts} className="chart-line" />
      {lvl(pivot, "chart-pivot", "buy point")}
      {lvl(stop, "chart-stop", "trail")}
      <text x={W - padR + 10} y={y(hi) + 4} className="cm-lvl-t" data-edge="">high {money(hi)}</text>
      <text x={W - padR + 10} y={y(lo) + 4} className="cm-lvl-t" data-edge="">low {money(lo)}</text>
      {/* A level outside the drawn window is NOT silently dropped — say so, or
          "no buy point line" reads as "this name has no buy point". */}
      {[["buy point", pivot], ["trail", stop]].map(([k, v]) => (
        v != null && (v < lo || v > hi)
          ? <text key={k} x="0" y={H - 4} className="cm-lvl-t" data-edge="">
              {k} {money(v)} is outside this window
            </text>
          : null
      )).filter(Boolean).slice(0, 1)}
    </svg>
  );
}

export function ChartModal({ stock, onClose }) {
  const ref = useRef(null);
  const host = typeof document !== "undefined" ? document.querySelector(".app") : null;

  useEffect(() => {
    if (!stock) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // focus the dialog so Escape works without a click first, and so a screen
    // reader lands inside rather than behind it
    const t = setTimeout(() => ref.current && ref.current.focus(), 0);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
      document.body.style.overflow = prev;
    };
  }, [stock, onClose]);

  if (!stock || !host) return null;
  const s = stock;
  const sw = s.sig && s.sig.swing ? s.sig.swing : null;
  const px = s.px;
  const money = (v) => (v == null ? null : "$" + (+v).toFixed(2));
  // distance from price, stated as a percentage, and only when both exist
  const away = (v) => (v == null || px == null ? null : `${(((v - px) / px) * 100).toFixed(1)}%`);

  const stat = (k, v, sub, why) => (
    <div className="cm-stat" key={k}>
      <span className="cm-stat-k">{k}</span>
      <span className="cm-stat-v mono">{v == null ? <NA why={why} /> : v}</span>
      {sub && <span className="cm-stat-s">{sub}</span>}
    </div>
  );

  /* TWO HONEST MODES, because two different series reach this component.
     `closes` is the full adjusted daily history with volume — it arrives for
     custom lookups and the per-ticker fallback path. Most covered names arrive
     through the COMPACT snapshot instead, which ships a ~60-point sampled spark
     and no closes at all (see compactSig): roughly one point every four
     sessions over a year.
     Drawing that sample on an 1100px canvas as though it were daily would be
     the worst kind of wrong chart — long straight segments reading as real
     price action, at a precision the data does not have. So the sampled series
     gets its own smaller, plainer rendering, and the caption states the
     resolution rather than letting the size imply one. */
  const hasBars = Array.isArray(s.closes) && s.closes.length > 5
    && Array.isArray(s.volume) && s.volume.length === s.closes.length && !s._synthetic;
  const sampled = !hasBars && Array.isArray(s.spark) && s.spark.length > 5 && s._sparkReal
    ? s.spark : null;

  return createPortal(
    <div className="cm-root" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm" role="dialog" aria-modal="true" aria-label={`${s.tk} chart`} tabIndex={-1} ref={ref}>
        <div className="cm-head">
          <div className="cm-id">
            <span className="cm-tk">{s.tk}</span>
            <span className="cm-nm">{s.name}{s.sector ? ` · ${s.sector}` : ""}</span>
          </div>
          <div className="cm-px">
            <span className="cm-p mono">{px != null ? "$" + (px >= 1000 ? px.toLocaleString(undefined, { maximumFractionDigits: 0 }) : px.toFixed(2))
              : <NA why="No quote for this name in the nightly snapshot" />}</span>
            {s.chg != null && (
              <span className="cm-c mono" data-up={s.chg >= 0}>{s.chg >= 0 ? "+" : ""}{s.chg.toFixed(2)}%</span>
            )}
          </div>
          <button className="cm-x" onClick={onClose} aria-label="Close chart">✕</button>
        </div>

        <div className="cm-canvas">
          {/* `_synthetic` marks a row still carrying tt.js's editorial curve
              rather than its own bars. Drawing that at full size, with levels on
              it, would be the most convincing wrong chart this app could make. */}
          {hasBars ? (
            <>
              <PriceChart closes={s.closes} volume={s.volume} dates={s.dates}
                pivot={s.pivot} buyLo={s.buyLo} buyHi={s.buyHi}
                stop={sw ? sw.stop : null} h={430} />
              <p className="cm-res">Adjusted daily closes · {s.closes.length} sessions · volume below the price</p>
            </>
          ) : sampled ? (
            <>
              <SampledChart data={sampled} pivot={s.pivot} stop={sw ? sw.stop : null} />
              <p className="cm-res">
                <b>Sampled series</b> — {sampled.length} points over about a year of adjusted closes,
                roughly one every four sessions. It is the real price path at a lower resolution, not a
                daily chart: intraday range and volume are not in this record. Open a name from search
                to fetch its full daily history.
              </p>
            </>
          ) : (
            <p className="cm-nochart">
              No daily history for this name in the latest snapshot, so there is nothing real to draw.
              The figures below come from the same snapshot and are shown where they exist.
            </p>
          )}
        </div>

        <div className="cm-stats">
          {stat("Buy point", money(s.pivot), s.pivot != null ? away(s.pivot) + " from price" : null,
            "No curated base for this name — the pivot comes from the editorial buy-point set")}
          {stat("Trailing stop", money(sw && sw.stop), sw && sw.stop != null ? away(sw.stop) + " from price" : null,
            "A Chandelier level needs a 22-day high and an ATR(14)")}
          {stat("ATR (14)", sw && sw.atr != null ? sw.atr.toFixed(2) : null,
            sw && sw.atrPct != null ? `${sw.atrPct.toFixed(2)}% of price` : null,
            "ATR(14) needs 14 true ranges of history")}
          {stat("RS", s.rs, "percentile vs the tracked universe", "RS is a percentile of return across the loaded universe")}
          {stat("Off 52-wk high", s.sig && s.sig.off52 != null ? `−${s.sig.off52.toFixed(1)}%` : null,
            null, "Distance from the 52-week high needs a full year of closes")}
          {stat("Score", s.score, "LEADERS composite", "The score needs the model's factor inputs")}
        </div>

        <p className="cm-foot">
          Levels are arithmetic, not orders — the buy point is a curated base and the trail is
          <b> {sw && sw.mult ? sw.mult : 3}× ATR(14)</b> under the 22-day high. Adjusted daily closes.
          Educational use only — not investment advice.
        </p>
      </div>
    </div>,
    host,
  );
}
