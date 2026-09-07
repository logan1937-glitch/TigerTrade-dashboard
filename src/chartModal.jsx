import { useEffect, useRef, useState } from "react";
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
/* THE SAMPLED SERIES, DRAWN PROPERLY.
   The first version of this was a bare polyline: no axes, no grid, no crosshair,
   no way to read a value off it — and since `compactSig` is how almost every
   covered name arrives, that bare polyline was the chart nearly everyone saw.

   What makes a chart feel alive is not decoration, it is being able to
   INTERROGATE it: put the cursor somewhere and get the number back. So this has
   a snapping crosshair with a readout, a price axis with gridlines, a window
   selector, and a marked last point.

   What it deliberately does NOT have is a per-point date. The spark ships as
   values only — `sampleSpark` returns closes with no dates — so any date on a
   given point would be arithmetic on an assumed 4-session step, which is an
   estimate wearing the clothes of a measurement. The readout gives price and
   the move from the window's start, both of which are real, and the axis names
   the SPAN rather than pretending to per-point precision. */
const WINDOWS = [["1M", 1 / 12], ["3M", 0.25], ["6M", 0.5], ["1Y", 1]];
/* A WINDOW IS ONLY OFFERED IF THE SAMPLE CAN FILL IT. At ~4-session resolution
   a one-month slice of a 60-point series is five points — four straight
   segments claiming to be a month of trading, which is the same
   misrepresentation as drawing the whole series at tick precision. Ten points
   is the floor for a shape that is actually the name's, so on a sampled series
   1M simply is not on offer; with full daily bars every window qualifies. */
const MIN_PTS = 10;

/* FULL DAILY BARS, FETCHED WHEN YOU ASK FOR THE BIG CHART.
   The nightly snapshot deliberately ships a ~60-point spark and no closes: a
   compact record is ~1.5KB and full bars for 500 names would multiply what
   every visitor downloads before seeing a row. That trade is right for the
   BOARD and wrong for this modal, which is the one place someone has explicitly
   asked to look at one name closely — and it left the good chart mode
   (volume, zoom, MA overlays) almost never reachable in production.

   So the bars are fetched on demand, for one symbol, only when the modal opens.
   `/api/yahoo` serves adjusted daily history and costs NO FMP quota, which is
   the same reason the portfolio's peak-since-entry lookup uses it.

   Cached per symbol for the session: reopening the same name is instant, and
   flicking through ten names costs ten requests rather than ten per open. */
const BARS = new Map();   // tk -> { closes, volume, dates } | "miss"

function useBars(tk, needed) {
  const [bars, setBars] = useState(() => (tk && BARS.get(tk)) || null);
  const [state, setState] = useState(() => (!needed ? "idle" : BARS.has(tk) ? "done" : "loading"));

  useEffect(() => {
    if (!tk || !needed) { setState("idle"); return undefined; }
    const hit = BARS.get(tk);
    if (hit) { setBars(hit === "miss" ? null : hit); setState("done"); return undefined; }
    let alive = true;
    setState("loading"); setBars(null);
    (async () => {
      try {
        const r = await fetch(`/api/yahoo?symbol=${encodeURIComponent(tk)}&range=1y&interval=1d`);
        if (!r.ok) throw new Error(String(r.status));
        const d = await r.json();
        const rows = Array.isArray(d && d.bars)
          ? d.bars.filter((b) => b && b.date && Number.isFinite(+b.close)) : [];
        if (rows.length < 30) throw new Error("thin");
        const out = {
          closes: rows.map((b) => +b.close),
          // a missing bar volume becomes 0 rather than null: the chart's bars are
          // a magnitude, and a null would break the max. It is never READ as a
          // figure anywhere, so this cannot become a fabricated number.
          volume: rows.map((b) => (Number.isFinite(+b.volume) ? +b.volume : 0)),
          dates: rows.map((b) => b.date),
        };
        BARS.set(tk, out);
        if (alive) { setBars(out); setState("done"); }
      } catch {
        // remembered so a symbol Yahoo will not serve is not retried on every open
        BARS.set(tk, "miss");
        if (alive) { setBars(null); setState("done"); }
      }
    })();
    return () => { alive = false; };
  }, [tk, needed]);

  return [bars, state];
}

function SampledChart({ data, pivot, stop, asOf }) {
  const [win, setWin] = useState(1);          // fraction of the series shown
  const [hover, setHover] = useState(null);   // index into the visible slice
  const wrapRef = useRef(null);

  /* padR is the LABEL GUTTER, not decoration: "buy point $1,497.60" is ~120
     viewBox units at 11px, and at 64 the labels ran off the right edge of the
     viewBox and were clipped — the high and low read as "$262" and "$1719"
     with the rest gone. Measured against the longest label this can produce. */
  const W = 1000, H = 340, padT = 14, padB = 28, padR = 132, padL = 2;
  const plotW = W - padR - padL;

  const keep = Math.max(MIN_PTS, Math.round(data.length * win));
  const vis = data.slice(-keep);
  const N = vis.length;

  let lo = Math.min(...vis), hi = Math.max(...vis);
  // a level only widens the scale when it is close enough to matter; far below,
  // it would flatten the price into a band (same rule PriceChart uses)
  for (const lv of [pivot, stop]) {
    if (lv != null && lv >= lo * 0.9 && lv <= hi * 1.1) { lo = Math.min(lo, lv); hi = Math.max(hi, lv); }
  }
  // a hair of headroom so the line never rides the frame
  const pad = (hi - lo) * 0.06 || 1;
  lo -= pad; hi += pad;
  const range = (hi - lo) || 1;

  const x = (i) => padL + (N <= 1 ? 0 : (i / (N - 1)) * plotW);
  const y = (v) => padT + (1 - (v - lo) / range) * (H - padT - padB);
  const pts = vis.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const money = (v) => "$" + (+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const first = vis[0], last = vis[N - 1];
  const net = first ? ((last - first) / first) * 100 : null;

  /* Five gridlines at round-ish prices. `nice` keeps the ticks on values a
     reader recognises rather than on whatever the range divides into. */
  const ticks = (() => {
    /* Aim for FIVE gaps, not four, and offer 4× as a candidate. At range/4 with
       only [1,2,2.5,5,10] a range of 1019 wanted 255 and had to round up to
       500 — which drew two gridlines on a 340-unit plot and left the axis
       looking unfinished. */
    const raw = range / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 4, 5, 10].map((m) => m * mag).find((v) => v >= raw) || mag * 10;
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
    return out;
  })();

  /* The pointer maps linearly to an index ONLY because the container's aspect
     ratio matches the viewBox — with `meet` and a mismatched box the SVG would
     letterbox and every reading would be offset. `.cm-sampled` pins the ratio. */
  const onMove = (e) => {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const svgX = ((e.clientX - r.left) / r.width) * W;
    const f = (svgX - padL) / plotW;
    setHover(Math.max(0, Math.min(N - 1, Math.round(f * (N - 1)))));
  };

  const hv = hover != null ? vis[hover] : null;
  const hvNet = hv != null && first ? ((hv - first) / first) * 100 : null;

  const lvl = (v, cls, label) => (v == null || v < lo || v > hi ? null : (
    <g key={label}>
      <line x1={padL} y1={y(v)} x2={padL + plotW} y2={y(v)} className={cls} />
      <text x={padL + plotW + 10} y={y(v) + 4} className="cm-lvl-t" data-lvl="">{label} {money(v)}</text>
    </g>
  ));
  const offWindow = [["Buy point", pivot], ["Trail", stop]]
    .filter(([, v]) => v != null && (v < lo || v > hi))
    .map(([k, v]) => `${k} ${money(v)}`);

  return (
    <div className="cm-chart">
      <div className="cm-chart-top">
        <div className="seg cm-win" role="group" aria-label="Window">
          {WINDOWS.filter(([, f]) => Math.round(data.length * f) >= MIN_PTS).map(([k, f]) => (
            <button key={k} className="seg-btn" data-active={win === f || undefined}
              onClick={() => { setWin(f); setHover(null); }}>{k}</button>
          ))}
        </div>
        <span className="cm-chart-read mono">
          {hv != null
            ? <>{money(hv)} <b data-up={hvNet >= 0}>{hvNet >= 0 ? "+" : ""}{hvNet.toFixed(1)}%</b> <i>from window start</i></>
            : net != null
              ? <>{money(last)} <b data-up={net >= 0}>{net >= 0 ? "+" : ""}{net.toFixed(1)}%</b> <i>over this window</i></>
              : null}
        </span>
      </div>

      <svg className="cm-sampled" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" ref={wrapRef}
        onMouseMove={onMove} onMouseLeave={() => setHover(null)}
        role="img" aria-label={`Sampled price path${net != null ? `, ${net >= 0 ? "up" : "down"} ${Math.abs(net).toFixed(1)}% over the window` : ""}`}>
        <defs>
          <linearGradient id="cmFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.20" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={padL + plotW} y2={y(v)} className="cm-grid" />
            <text x={padL + plotW + 10} y={y(v) + 4} className="cm-axis-t">{money(v)}</text>
          </g>
        ))}

        <polygon className="cm-fill" points={`${padL},${y(lo)} ${pts} ${x(N - 1).toFixed(1)},${y(lo)}`} fill="url(#cmFill)" />
        {/* Coloured by NET DIRECTION, the same as the drawer's PriceChart. The
            screener's spark stays neutral because forty of them in a column is a
            tint over the whole board; one large chart is a different object, and
            a year down 34% drawn in the same ink as a year up 200% throws away
            the first thing you want to know. */}
        <polyline points={pts} className="chart-line" data-up={net == null ? undefined : net >= 0} />

        {lvl(pivot, "chart-pivot", "buy point")}
        {lvl(stop, "chart-stop", "trail")}

        {/* the last close, so the eye lands on where the name is now */}
        <circle cx={x(N - 1)} cy={y(last)} r="4" className="cm-last" />

        {hover != null && (
          <g>
            <line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} className="chart-cross" />
            <circle cx={x(hover)} cy={y(hv)} r="4.5" className="chart-cross-dot" />
          </g>
        )}

        <line x1={padL} y1={H - padB} x2={padL + plotW} y2={H - padB} className="cm-axis-x" />
        <text x={padL} y={H - 8} className="cm-axis-t" data-edge="">
          {win === 1 ? "~1 year ago" : `~${WINDOWS.find(([, f]) => f === win)[0]} ago`}
        </text>
        <text x={padL + plotW} y={H - 8} className="cm-axis-t" data-edge="" textAnchor="end">
          {asOf ? `latest close ${asOf}` : "latest close"}
        </text>
      </svg>

      {offWindow.length > 0 && (
        <p className="cm-offwin mono">{offWindow.join(" · ")} {offWindow.length > 1 ? "are" : "is"} outside this window</p>
      )}
    </div>
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

  /* EVERY HOOK RUNS BEFORE THE EARLY RETURN. `useBars` sat below the
     `if (!stock) return null` guard, which means React saw a different number of
     hooks on the closed and open renders — "rendered fewer hooks than expected",
     thrown the moment the modal closes. It takes nulls and does nothing with
     them instead. */
  const ownBars = !!stock && Array.isArray(stock.closes) && stock.closes.length > 5
    && Array.isArray(stock.volume) && stock.volume.length === stock.closes.length && !stock._synthetic;
  // only ask the network for what the record does not already carry
  const [fetched, barState] = useBars(stock ? stock.tk : null, !!stock && !ownBars);

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
  const bars = ownBars ? { closes: s.closes, volume: s.volume, dates: s.dates } : fetched;
  const hasBars = !!bars;
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
          {barState === "loading" ? (
            <div className="cm-loading"><span className="cm-spin" aria-hidden="true" />Loading daily bars for {s.tk}…</div>
          ) : hasBars ? (
            <>
              {/* `h` IS A VIEWBOX HEIGHT, NOT PIXELS. `.chart` is width:100% and the
                  viewBox is 600 wide, so the RENDERED height is
                  `width × h / 600` — at ~1130px in this modal, h=430 rendered
                  810px tall and pushed the stats and the footer off the screen.
                  210 lands at ~395px here and ~330px on a narrower modal, which
                  is the size this panel has room for. */}
              <PriceChart closes={bars.closes} volume={bars.volume} dates={bars.dates}
                pivot={s.pivot} buyLo={s.buyLo} buyHi={s.buyHi}
                stop={sw ? sw.stop : null} h={210} />
              <p className="cm-res">
                Adjusted daily closes · {bars.closes.length} sessions · volume below the price
                {!ownBars && " · fetched for this name on open"}. Drag across the chart to zoom a window.
              </p>
            </>
          ) : sampled ? (
            <>
              <SampledChart data={sampled} pivot={s.pivot} stop={sw ? sw.stop : null} asOf={s.sig ? s.sig.asOf : null} />
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
