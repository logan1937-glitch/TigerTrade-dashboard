import { useState, useMemo, useEffect, useRef } from "react";
import { useStored } from "./store.js";
import { rrgTail, RET_KEY } from "./signals.js";
import { SearchIcon } from "./components.jsx";

// ── Market Map: sector momentum heatmap + relative-rotation graph ─────────────
// Every mark is computed from the live feed (real returns, real RS). Rules:
// polarity is encoded with the P&L pair AND a printed signed number (never color
// alone); quadrant identity is positional with text labels. The rotation graph's
// heads are a strength RAMP, not four categorical hues — four hues fails CVD, and
// green/red on a quadrant would spend the P&L pair on something that is not money.

const TF_BARS = { "1W": 5, "1M": 21, "3M": 63 };
// % return over a window. Prefers the snapshot's precomputed returns (compact
// records carry no price arrays); falls back to closes for custom/live names.
const ret = (r, tf) => {
  const pr = r.sig && r.sig.ret;
  if (pr && pr[RET_KEY[tf]] != null) return pr[RET_KEY[tf]];
  const c = r.closes, n = c ? c.length : 0;
  if (!c || n < 2) return null;
  const back = TF_BARS[tf] || 21;
  return (c[n - 1] / c[Math.max(0, n - 1 - back)] - 1) * 100;
};
// 6-point relative-rotation tail: precomputed on the snapshot, else derived from
// a full RS line (custom/live names)
const rrgOf = (r) => (r.sig && (r.sig.rrg || (r.sig.rsLine ? rrgTail(r.sig.rsLine) : null))) || null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const avgTails = (tails) => {
  const valid = tails.filter((t) => t && t.length);
  if (!valid.length) return null;
  const len = Math.min(...valid.map((t) => t.length));
  const out = [];
  for (let i = 0; i < len; i++) {
    let rr = 0, mm = 0;
    for (const t of valid) { const p = t[t.length - len + i]; rr += p.ratio; mm += p.mom; }
    out.push({ ratio: rr / valid.length, mom: mm / valid.length });
  }
  return out;
};

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
        const pol = up ? "var(--cat-growth)" : "var(--sev-extreme)";
        const frac = Math.abs(s.med) / maxAbs;
        // magnitude lives in the METER (length), not a flooded tint — the card
        // keeps a whisper of polarity so the wall of sectors stays calm
        return (
          <button key={s.sector} className="mm-tile" onClick={() => onSelectSector(s.sector)}
            title={`Filter the screener to ${s.sector}`}
            style={{ background: `color-mix(in oklch, ${pol} ${Math.round(4 + frac * 6)}%, var(--surface))`,
                     borderLeft: `3px solid ${pol}` }}>
            <span className="mm-tile-name">{s.sector}</span>
            <span className="mm-tile-ret mono" data-up={up}>{up ? "+" : ""}{s.med.toFixed(1)}%</span>
            <span className="mm-tile-bar"><i style={{ width: `${Math.max(5, frac * 100)}%`, background: pol }} /></span>
            <span className="mm-tile-meta mono">{s.n} name{s.n === 1 ? "" : "s"} · led by {s.leader}</span>
          </button>
        );
      })}
    </div>
  );
}

/* -------------------- sector ETF tracker --------------------
   The tradeable expression of the sector map directly above it. Ranked on
   EXCESS return over SPY rather than raw return, because every sector is up in
   an up tape and "+4%" alone says nothing about whether money is rotating in.
   Both legs come off the same bars in the nightly snapshot, so the subtraction
   is like-for-like; a window where either leg is missing shows "—" rather than
   a raw number wearing a relative label.

   A row filters the screener to that sector — the map's tiles already do this,
   and the ETF is the same bucket with a ticker attached. */
const ETF_WINDOWS = [
  { id: "w1", label: "1W" }, { id: "m1", label: "1M" },
  { id: "m3", label: "3M" }, { id: "y1", label: "1Y" },
];

function SectorEtfs({ sectors, onSelectSector }) {
  const [win, setWin] = useStored("tt_mm_etfwin", "m1");
  const w = ETF_WINDOWS.find((x) => x.id === win) ? win : "m1";
  const rows = useMemo(() => {
    const list = [...((sectors && sectors.rows) || [])];
    // unmeasurable windows sink rather than sorting as if flat
    return list.sort((a, b) => (b.rel[w] ?? -Infinity) - (a.rel[w] ?? -Infinity));
  }, [sectors, w]);

  if (!rows.length) {
    return (
      <p className="mm-etf-empty mono">
        Sector ETF data is missing from this snapshot. It is fetched nightly from index
        data — nothing here is estimated in its absence.
      </p>
    );
  }
  const spy = sectors.spy ? sectors.spy[w] : null;
  const span = Math.max(1, ...rows.map((r) => Math.abs(r.rel[w] ?? 0)));

  return (
    <div className="mm-etf">
      <div className="mm-etf-ctl">
        <span className="minwt-lab">vs S&amp;P over</span>
        <div className="seg">
          {ETF_WINDOWS.map((o) => (
            <button key={o.id} className="seg-btn" data-active={w === o.id} onClick={() => setWin(o.id)}
              title={`Excess return over SPY across ${o.label}`}>{o.label}</button>
          ))}
        </div>
        <span className="mm-etf-spy mono">
          SPY {spy == null ? "—" : `${spy >= 0 ? "+" : "−"}${Math.abs(spy).toFixed(1)}%`} over {ETF_WINDOWS.find((x) => x.id === w).label}
        </span>
      </div>

      <div className="mm-etf-tbl">
        <div className="mm-etf-row mm-etf-hrow mono">
          <span>ETF</span><span>Sector</span>
          <span style={{ textAlign: "right" }}>Last</span>
          <span style={{ textAlign: "right" }}>Δ day</span>
          <span>vs S&amp;P</span><span style={{ textAlign: "right" }}>Excess</span>
          <span style={{ textAlign: "right" }}>Abs</span>
        </div>
        {rows.map((r) => {
          const rel = r.rel[w], abs = r.ret[w];
          return (
            <button className="mm-etf-row mm-etf-drow" key={r.tk}
              onClick={() => onSelectSector && onSelectSector(r.sector)}
              title={`Screen the ${r.sector} names${rel == null ? "" : ` · ${rel >= 0 ? "leading" : "lagging"} the S&P by ${Math.abs(rel).toFixed(2)}pts`}`}>
              <span className="mm-etf-tk">{r.tk}</span>
              <span className="mm-etf-sec">{r.sector}</span>
              <span className="mm-etf-px mono">{r.px == null ? "—" : `$${r.px.toFixed(2)}`}</span>
              <span className="mm-etf-chg mono" data-up={r.chg == null ? undefined : r.chg >= 0}>
                {r.chg == null ? "—" : `${r.chg >= 0 ? "+" : "−"}${Math.abs(r.chg).toFixed(2)}%`}</span>
              {/* diverging bar from a centre line: leading grows right, lagging left,
                  so the rotation is a shape rather than a column of signed numbers */}
              <span className="mm-etf-bar">
                <i className="mm-etf-zero" />
                {rel != null && (
                  <i className="mm-etf-fill" data-up={rel >= 0}
                    style={{ width: `${(Math.abs(rel) / span) * 50}%`, [rel >= 0 ? "left" : "right"]: "50%" }} />
                )}
              </span>
              {/* its own column, not overlaid on the bar — at full scale the bar
                  reaches the cell edge and the two collided */}
              <span className="mm-etf-relv mono" data-up={rel == null ? undefined : rel >= 0}>
                {rel == null ? "—" : `${rel >= 0 ? "+" : "−"}${Math.abs(rel).toFixed(2)}`}</span>
              <span className="mm-etf-abs mono" data-up={abs == null ? undefined : abs >= 0}>
                {abs == null ? "—" : `${abs >= 0 ? "+" : "−"}${Math.abs(abs).toFixed(1)}%`}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------- industry-group leaders (RS within group) --------------------
   One level finer than the sector map: names bucketed by IBD-style industry
   group, ranked by momentum score inside each group, groups ordered by their
   median strength. The score badge's green heat encodes relative strength, so
   the leadership inside each group is legible at a glance. */
// Fixed sequential green ramp keyed to score (a magnitude scale, so it doesn't
// follow the theme-flipping --cat-growth token). Stays light→medium green with
// dark-green ink in BOTH themes, so the number is always high-contrast.
const scoreHeat = (score) => {
  const t = Math.max(0, Math.min(1, ((score || 0) - 20) / 65));  // 20→pale, 85→vivid
  return {
    background: `hsl(150 ${Math.round(42 + t * 46)}% ${Math.round(80 - t * 26)}%)`,  // L 80→54
    color: "hsl(154 72% 14%)",
    borderColor: `hsl(150 40% ${Math.round(62 - t * 20)}%)`,
  };
};

function IndustryGroups({ rows, onOpenStock }) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const by = {};
    for (const r of rows) {
      if (!r.sig || r.sector === "Custom" || !r.group) continue;
      (by[r.group] = by[r.group] || []).push(r);
    }
    return Object.entries(by).map(([group, list]) => {
      const sorted = [...list].sort((a, b) => (b.score || 0) - (a.score || 0));
      const med = median(sorted.map((r) => r.score || 0)) || 0;
      const strong = sorted.filter((r) => (r.score || 0) >= 80).length;
      return { group, list: sorted, n: sorted.length, med, strong };
    }).sort((a, b) => b.med - a.med || b.strong - a.strong || b.n - a.n);
  }, [rows]);

  const ql = q.trim().toLowerCase();
  const shown = ql
    ? groups.map((g) => ({ ...g, list: g.list.filter((r) => (r.tk + " " + r.name).toLowerCase().includes(ql)) })).filter((g) => g.list.length)
    : groups;
  const maxMed = Math.max(1, ...groups.map((g) => g.med));

  if (!groups.length) return <div className="empty">Waiting for live data…</div>;

  return (
    <div className="ig">
      <div className="ig-filter">
        <span className="ig-search-ic"><SearchIcon /></span>
        <input className="search" placeholder="filter ticker…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter industry-group names" />
      </div>
      {/* Same treatment as the screener's table: 60+ groups scroll inside the
          panel so the filter above stays put while you work down the list. */}
      <div className="ig-scroll">
      {shown.length ? shown.map((g) => (
        <div className="ig-group" key={g.group}>
          <div className="ig-group-head">
            <span className="ig-strength" style={{ background: `color-mix(in oklch, var(--cat-growth) ${Math.round((g.med / maxMed) * 55 + 12)}%, transparent)` }} />
            <span className="ig-group-name">{g.group}</span>
            <span className="ig-group-meta mono">{g.n} name{g.n === 1 ? "" : "s"}{g.strong ? ` · ${g.strong} A-grade` : ""}</span>
            <span className="ig-group-med mono" title="Median momentum score">MOM {Math.round(g.med)}</span>
          </div>
          <div className="ig-names">
            {g.list.map((r) => (
              <button key={r.tk} className="ig-chip" onClick={() => onOpenStock(r)} title={`${r.name} · score ${r.score ?? "—"} · RS ${r.rs ?? "—"}`}>
                <span className="ig-chip-tk">{r.tk}</span>
                <span className="ig-chip-badge mono" style={scoreHeat(r.score)}>{r.score ?? "—"}</span>
              </button>
            ))}
          </div>
        </div>
      )) : <div className="empty">No names match “{q}”.</div>}
      </div>
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

/* The viewBox has to match the BOX, or the SVG letterboxes inside it while the
   HTML label overlay — positioned in percentages of the box — keeps using the
   full height. The phone rule set `aspect-ratio: 1/1` on the container without
   changing the 600:400 viewBox, so on a 390px screen the plot rendered as a
   356×237 band with 60px of dead space above and below it, and every label was
   placed against the 356 instead. Both shapes are declared here now, and the CSS
   only mirrors them. */
const useNarrow = () => {
  const q = "(max-width: 640px)";
  const [n, setN] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return n;
};

function RelativeRotation({ rows, onOpenStock }) {
  const narrow = useNarrow();
  const [mode, setMode] = useState("sectors");
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);   // tapped sector whose tail stays shown

  const entities = useMemo(() => {
    // each name's 6-point rotation tail is precomputed on the snapshot (rrgOf).
    // Sectors are the equal-weight average of their members' tails.
    const withTail = rows.map((r) => (r.sig && r.sector !== "Custom" ? { r, tail: rrgOf(r) } : null)).filter((x) => x && x.tail);
    if (mode === "sectors") {
      const by = {};
      for (const { r, tail } of withTail) (by[r.sector] = by[r.sector] || []).push(tail);
      return Object.entries(by).map(([sector, tails]) => {
        const tail = avgTails(tails);
        return tail ? { id: sector, label: sector, tail, head: tail[tail.length - 1], n: tails.length, kind: "sector" } : null;
      }).filter(Boolean);
    }
    return withTail.map(({ r, tail }) => ({ id: r.tk, label: r.tk, tail, head: tail[tail.length - 1], kind: "name", score: r.score || 0 }));
  }, [rows, mode]);

  if (entities.length < 2) return <div className="empty">Waiting for live data…</div>;

  // 3:2 on a desktop, near-square on a phone — a phone has width to spare on
  // neither axis, and the labels need vertical room far more than the dots need
  // horizontal spread
  const W = narrow ? 440 : 600, H = narrow ? 430 : 400;
  const padL = 26, padR = 14, padT = 14, padB = 24;
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

  /* On a wide plot, labels de-collide within their own SIDE. One shared column
     meant eleven sectors clustered near the centre all pushed each other down a
     single stack — "Basic Materials" landed on "Communication Services" and the
     pair drifted away from the dots they name. Splitting by side halves the
     crowding and keeps each label next to its own head.

     On a phone the split makes things WORSE, which is not obvious: a left-anchored
     label and a right-anchored one are de-collided independently, so nothing stops
     them landing on the same row — and in a 356px box a label is a third of the
     width, so they meet in the middle. "Consumer Cyclical" sat on top of
     "Healthcare" for exactly this reason. Narrow falls back to one global stack,
     where no two labels can share a row whatever their x. */
  /* GAP is in viewBox units and the labels are real pixels, so it has to be
     converted, not copied: at 860px the desktop box renders 1.43px per unit and
     13 units clears a 11px label; the phone box renders ~0.81px per unit, where
     the same 13 units is 10px and every label overlapped its neighbour. */
  const GAP = narrow ? 20 : 13;
  const place = (list) => {
    list.sort((a, b) => a.oy - b.oy);
    for (let i = 1; i < list.length; i++) if (list[i].dy - list[i - 1].dy < GAP) list[i].dy = list[i - 1].dy + GAP;
    const over = list.length ? list[list.length - 1].dy - (H - padB - 3) : 0;
    if (over > 0) list.forEach((p) => (p.dy = Math.max(padT + 9, p.dy - over)));
    return list;
  };
  const marks = entities.filter((e) => labeled.has(e.id))
    .map((e) => { const dx = x(e.head.ratio), oy = y(e.head.mom); return { e, dx, oy, dy: oy, right: dx <= W * 0.55 }; });
  const placed = narrow
    ? place(marks)
    : [...place(marks.filter((p) => p.right)), ...place(marks.filter((p) => !p.right))];

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
      {/* geometry in SVG; ALL text lives in the HTML overlay below so it renders
          at true pixel size instead of scaling up with the viewBox */}
      <div className="rrg-plot">
        {/* `preserveAspectRatio` is xMidYMid, NOT none. With `none` the viewBox is
            stretched independently on each axis, which turns every head into an
            ellipse and — worse — distorts the CURL of the rotation path, which is
            the shape the whole chart exists to show. The container carries the
            600:400 aspect so nothing is letterboxed. */}
        <svg viewBox={`0 0 ${W} ${H}`} className="chart" preserveAspectRatio="xMidYMid meet"
          role="img" aria-label="Relative rotation vs S&P 500">
          {/* Washes and axes run to the EDGE of the box, not to the padding. The
              pads exist to keep dots off the border; drawing the ground inside
              them left a bare gutter between the tinted quadrant and the frame,
              which read as a misaligned rectangle rather than as a quadrant. */}
          <rect x={cx} y={0} width={W - cx} height={cy} className="rrg-q" data-q="leading" />
          <rect x={cx} y={cy} width={W - cx} height={H - cy} className="rrg-q" data-q="weakening" />
          <rect x={0} y={cy} width={cx} height={H - cy} className="rrg-q" data-q="lagging" />
          <rect x={0} y={0} width={cx} height={cy} className="rrg-q" data-q="improving" />
          <line x1={cx} y1={0} x2={cx} y2={H} className="chart-zero" />
          <line x1={0} y1={cy} x2={W} y2={cy} className="chart-zero" />

          {/* EVERY tail, always. A rotation graph without its trails is a scatter
              plot — where a sector sits matters far less than which way it is
              travelling, and hiding that behind a hover meant the one thing this
              chart knows that the heatmap does not was invisible by default.
              Each segment fades toward the past, so direction reads without an
              arrowhead and without a legend. */}
          {entities.map((e) => {
            const active = hover === e.id || pinned === e.id;
            const focus = (hover ?? pinned) != null;
            const q = QUAD(e.head);
            const hx = x(e.head.ratio), hy = y(e.head.mom);
            /* SHORT and NEUTRAL until you ask. Drawing all six points of eleven
               sectors in eleven quadrant colours turned this into spaghetti with
               a rainbow on top — and the colour identified nothing, because a
               tail that crossed three quadrants was painted the one its head
               happened to land in. Six fixture sectors hid that; eleven real ones
               did not.

               So: everyone gets the last three segments in one neutral ink, just
               enough to read direction at a glance, and the one you point at gets
               its whole path in jade. Colour marks focus, not identity. */
            const full = active;
            const from = full ? 1 : Math.max(1, e.tail.length - 3);
            const segs = [];
            for (let i = from; i < e.tail.length; i++) {
              const a = e.tail[i - 1], b = e.tail[i];
              const f = (i - from + 1) / (e.tail.length - from);   // 0…1 toward today
              segs.push(
                <line key={i} x1={x(a.ratio)} y1={y(a.mom)} x2={x(b.ratio)} y2={y(b.mom)}
                  className="rrg-tail" data-active={active || undefined}
                  strokeWidth={(active ? 1.1 + f * 1.4 : 0.8 + f * 0.7).toFixed(2)}
                  opacity={(active ? 0.35 + f * 0.6 : focus ? 0.07 : 0.12 + f * 0.22).toFixed(2)} />
              );
            }
            return (
              <g key={e.id} style={{ cursor: "pointer" }}
                 onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
                 onClick={() => (e.kind === "name" ? onOpenStock({ tk: e.id }) : setPinned((v) => (v === e.id ? null : e.id)))}>
                {segs}
                <circle cx={hx} cy={hy} r="13" fill="transparent" />
                {/* the head takes its quadrant's colour, so position is stated
                    twice — by where it sits and by what colour it is */}
                <circle cx={hx} cy={hy} r={active ? 5.6 : 4} className="rrg-head"
                  data-q={q} data-active={active || undefined} opacity={focus && !active ? 0.45 : 1} />
              </g>
            );
          })}
          {/* connectors for nudged labels (geometry only — text is HTML) */}
          {placed.map(({ e, dx, oy, dy, right }) => (
            Math.abs(dy - oy) > 7
              ? <line key={"c" + e.id} x1={dx} y1={oy} x2={right ? dx + 6 : dx - 6} y2={dy - 3} className="rrg-lbl-conn" style={{ pointerEvents: "none" }} />
              : null
          ))}
        </svg>
        <div className="rrg-overlay" aria-hidden="true">
          <span className="rrg-cap" style={{ right: `${((padR + 5) / W) * 100}%`, top: `${((padT + 4) / H) * 100}%` }}>Leading</span>
          <span className="rrg-cap" style={{ left: `${((padL + 5) / W) * 100}%`, top: `${((padT + 4) / H) * 100}%` }}>Improving</span>
          <span className="rrg-cap" style={{ left: `${((padL + 5) / W) * 100}%`, bottom: `${((padB + 4) / H) * 100}%` }}>Lagging</span>
          <span className="rrg-cap" style={{ right: `${((padR + 5) / W) * 100}%`, bottom: `${((padB + 4) / H) * 100}%` }}>Weakening</span>
          {/* what the two axes actually are. Without these the quadrant names are
              four words with nothing behind them. */}
          <span className="rrg-axis" data-ax="x">RS-Ratio vs S&amp;P 500 →</span>
          <span className="rrg-axis" data-ax="y">RS-Momentum ↑</span>
          {/* pinned to the actual zero line, not to 50% — padL and padR differ, so
              the centre of the box is 6 viewBox units off the 100 gridline and the
              label sat visibly beside the axis it names */}
          <span className="rrg-origin mono" style={{ left: `${(cx / W) * 100}%` }}>100</span>
          {placed.map(({ e, dx, dy, right }) => {
            const active = hover === e.id || pinned === e.id;
            return (
              <span key={"l" + e.id} className="rrg-lab mono" data-active={active || undefined}
                style={{ left: `${((right ? dx + 8 : dx - 8) / W) * 100}%`, top: `${(dy / H) * 100}%`,
                  transform: `translateY(-50%)${right ? "" : " translateX(-100%)"}` }}>{e.label}</span>
            );
          })}
        </div>
      </div>
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

/* --------------------------- market heatmap (treemap) ---------------------------
   Names grouped by sector, each tile SIZED by dollar volume (real, computed for
   every name — a liquidity/attention proxy, not market cap) and COLORED by its
   return over the selected window. Polarity uses the P&L pair AND a printed
   signed number; the ticker labels every tile large enough to read. Tap → drawer.
   Squarified layout (Bruls, Huizing & van Wijk) for readable aspect ratios. */
const scaleToArea = (items, area) => {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const k = area / total;
  return items.map((i) => ({ ...i, area: i.value * k })).sort((a, b) => b.area - a.area);
};
function squarify(children, X, Y, Wd, Ht) {
  const out = [];
  const worst = (row, side) => {
    const sum = row.reduce((a, c) => a + c.area, 0);
    const max = Math.max(...row.map((c) => c.area)), min = Math.min(...row.map((c) => c.area));
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  const layoutRow = (row, x, y, w, h, vertical) => {
    const sum = row.reduce((a, c) => a + c.area, 0);
    if (vertical) { const rw = sum / h; let yy = y; for (const c of row) { const ch = c.area / rw; out.push({ ...c, x, y: yy, w: rw, h: ch }); yy += ch; } }
    else { const rh = sum / w; let xx = x; for (const c of row) { const cw = c.area / rh; out.push({ ...c, x: xx, y, w: cw, h: rh }); xx += cw; } }
  };
  const recurse = (items, x, y, w, h) => {
    if (!items.length || w <= 0 || h <= 0) return;
    if (items.length === 1) { out.push({ ...items[0], x, y, w, h }); return; }
    const side = Math.min(w, h);
    let row = [items[0]], rest = items.slice(1);
    while (rest.length && worst(row, side) >= worst([...row, rest[0]], side)) { row.push(rest[0]); rest = rest.slice(1); }
    const sum = row.reduce((a, c) => a + c.area, 0);
    if (w >= h) { const sw = sum / h; layoutRow(row, x, y, sw, h, true); recurse(rest, x + sw, y, w - sw, h); }
    else { const sh = sum / w; layoutRow(row, x, y, w, sh, false); recurse(rest, x, y + sh, w, h - sh); }
  };
  recurse(children, X, Y, Wd, Ht);
  return out;
}

/* The cap is a legibility budget, not a data limit. 80 tiles in a 1,000px map is
   ~8,000px² each and reads fine; the same 80 in a phone's 358×344 box is 1,500px²,
   which is smaller than the word it would have to hold. The note under the map
   states the count either way, so cutting it on a phone is a stated narrowing
   rather than a silent one. */
const MAP_W = 100, MAP_H = 62, MAP_CAP = 80, MAP_CAP_NARROW = 34;
function MarketHeatmap({ rows, tf, onOpenStock }) {
  const narrow = useNarrow();
  /* Measured, because the label decision is a PIXEL question and every input to
     it was a percentage. `showTk` asked whether a tile was 3.4% of the map wide —
     which is 34px on a desktop and 12px on a phone, and 12px of a 4-letter ticker
     at the 8px floor is three and a half glyphs. That does not read as truncation,
     it reads as a DIFFERENT TICKER: PLTR rendered as "PLIR", GOOGL as "GOO".
     A tile now shows its ticker only when the ticker fits at a legible size. */
  const boxRef = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setBox((p) => (p && p.w === r.width && p.h === r.height ? p : { w: r.width, h: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const built = useMemo(() => {
    let names = rows.filter((r) => r.sig && r.sig.dollarVol > 0 && r.sector && r.sector !== "Custom");
    const total = names.length;
    // keep the most-traded names so tiles stay legible; note the rest honestly
    const cap = narrow ? MAP_CAP_NARROW : MAP_CAP;
    names = [...names].sort((a, b) => (b.sig.dollarVol || 0) - (a.sig.dollarVol || 0)).slice(0, cap);
    if (names.length < 2) return null;
    const by = {};
    for (const r of names) (by[r.sector] = by[r.sector] || []).push(r);
    const sectors = Object.entries(by).map(([sector, list]) => ({
      sector, value: list.reduce((s, r) => s + (r.sig.dollarVol || 0), 0), list,
    }));
    const sectorRects = squarify(scaleToArea(sectors, MAP_W * MAP_H), 0, 0, MAP_W, MAP_H);
    const groups = [], tiles = [];
    for (const sr of sectorRects) {
      groups.push({ sector: sr.sector, x: sr.x, y: sr.y, w: sr.w, h: sr.h, n: sr.list.length });
      const pad = 0.35, head = Math.min(3, sr.h * 0.16);
      const ix = sr.x + pad, iw = sr.w - pad * 2, iy = sr.y + head, ih = sr.h - head - pad;
      if (iw <= 0 || ih <= 0) continue;
      const items = scaleToArea(sr.list.map((r) => ({ r, value: r.sig.dollarVol })), iw * ih);
      for (const nr of squarify(items, ix, iy, iw, ih)) {
        tiles.push({ r: nr.r, x: nr.x, y: nr.y, w: nr.w, h: nr.h, chg: ret(nr.r, tf) });
      }
    }
    return { groups, tiles, shown: names.length, total };
  }, [rows, tf, narrow]);

  if (!built) return <div className="empty">Waiting for live data…</div>;
  const maxAbs = Math.max(2, ...built.tiles.map((t) => (t.chg != null ? Math.abs(t.chg) : 0)));
  // normalize each axis to its own extent so the treemap fills the container on
  // BOTH axes (the layout space is MAP_W×MAP_H; y was previously left at ~62%)
  const px = (v) => `${(v / MAP_W) * 100}%`;
  const py = (v) => `${(v / MAP_H) * 100}%`;
  /* 1% of the measured container width, the unit `t.w` is already in. Zero until
     the observer has measured, which drops every label for one frame — a frame of
     bare tiles beats a frame of tickers clipped into different tickers. */
  const cqw = box ? box.w / 100 : 0;

  return (
    <>
      <div className="mm-heat" role="img" aria-label="Market heatmap — tile size by dollar volume, color by return">
        <div className="mm-heat-inner" ref={boxRef}>
          {built.groups.map((g) => (
            <div key={g.sector} className="mm-heat-group"
              style={{ left: px(g.x), top: py(g.y), width: px(g.w), height: py(g.h) }}>
              <span className="mm-heat-glabel mono">{g.sector}</span>
            </div>
          ))}
          {built.tiles.map((t) => {
            const up = t.chg != null && t.chg >= 0;
            // diverging scale with a true NEUTRAL midpoint: a ±0.2% move is noise,
            // not polarity — it gets a quiet neutral tint instead of a green/red one
            const flat = t.chg == null || Math.abs(t.chg) < 0.2;
            const alpha = flat ? 0 : Math.min(0.44, 0.08 + (Math.abs(t.chg) / maxAbs) * 0.36);
            const fill = flat
              ? "color-mix(in oklch, var(--text) 5%, var(--surface))"
              : `color-mix(in oklch, ${up ? "var(--cat-growth)" : "var(--sev-extreme)"} ${Math.round(alpha * 100)}%, var(--surface))`;
            /* Type scaled to the TILE, which is the whole difference between a
               treemap and a grid of coloured rectangles. A fixed 10.5px ticker
               gave the largest holding in the market the same label as a sliver,
               so the size encoding — the thing a treemap exists for — was
               carried by area alone and read as noise.

               Sized in PIXELS off the measured container rather than in `cqw`/
               `cqh`. Container units are a proportion of the box, so they cannot
               subtract the tile's own fixed chrome — 8px of padding and 2px of
               border, which is 4% of a big tile and 29% of a 35px one. That is
               the whole reason AMD, AMZN and CRWD still overflowed after the
               per-character pass: the formula was sizing to the tile and the text
               was being laid out inside the tile MINUS ten pixels. Measured:
               `.mm-heat-tk` clientWidth 25 against scrollWidth 28.

               Nothing is drawn below 8px. A floor in the old `clamp()` turned
               "this does not fit" into "draw it anyway at the smallest size",
               which is how a 12px tile rendered PLTR as "PLIR" — clipped
               mid-glyph, and the result is not a truncated ticker, it is a
               plausible DIFFERENT one. An unlabelled tile keeps its tooltip and
               its click; a mislabelled one is a wrong reading on a trading
               screen. */
            const PAD_X = 10, PAD_Y = 6;                    // padding 2px 4px + 1px border, both axes
            const tileW = t.w * cqw, tileH = (t.h / MAP_H) * (box ? box.h : 0);
            const availW = tileW - PAD_X, availH = tileH - PAD_Y;
            // 0.86em is the measured cap advance of Space Grotesk 700; the display
            // face is wider than the mono one, which the first pass at this missed
            const tkPx = Math.min(availW / (t.r.tk.length * 0.86), availH * 0.55, 34);
            const showTk = tkPx >= 8;
            // "+12.0%" is six tabular mono glyphs at ~0.62em; the percentage only
            // appears when a second line still fits UNDER the ticker
            const pctPx = Math.min(availW / 3.8, (availH - tkPx * 1.15) / 1.2, 17);
            const showPct = showTk && pctPx >= 8;
            const tkSize = `${tkPx.toFixed(2)}px`, pctSize = `${pctPx.toFixed(2)}px`;
            return (
              <button key={t.r.tk} className="mm-heat-tile" onClick={() => onOpenStock({ tk: t.r.tk })}
                title={`${t.r.tk} · ${t.r.sector}${t.chg != null ? ` · ${up ? "+" : ""}${t.chg.toFixed(1)}% (${tf})` : ""}`}
                style={{ left: px(t.x), top: py(t.y), width: px(t.w), height: py(t.h), background: fill }}>
                {showTk && <span className="mm-heat-tk" style={{ fontSize: tkSize }}>{t.r.tk}</span>}
                {showPct && t.chg != null && (
                  <span className="mm-heat-pct mono" data-up={up} style={{ fontSize: pctSize }}>
                    {up ? "+" : ""}{t.chg.toFixed(1)}%</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mono mm-rrg-note">
        <b>Reading it:</b> tile size = dollar volume traded (a liquidity/attention proxy — not market cap); color = {tf} return.
        {built.shown < built.total && <span style={{ opacity: .7 }}> Showing the {built.shown} most-traded of {built.total} names.</span>}
      </p>
    </>
  );
}

/* ------------------------------ shell ------------------------------ */
export function MarketMap({ rows, live, onOpenStock, onSelectSector, sectors }) {
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

      <div className="mm-sec-h"><h3>Market heatmap</h3><span className="dr-sec-sub mono">size = dollar volume · color = {tf} return · tap a tile</span></div>
      <MarketHeatmap rows={rows} tf={tf} onOpenStock={onOpenStock} />

      <div className="mm-sec-h"><h3>Relative rotation</h3><span className="dr-sec-sub mono">RS-trend vs its momentum · benchmark: S&amp;P 500</span></div>
      <div className="mm-scatter-card">
        <RelativeRotation rows={rows} onOpenStock={onOpenStock} />
        <p className="mono mm-rrg-note">
          <b>Reading it:</b> right = outperforming the S&amp;P; up = that outperformance is accelerating. Names rotate clockwise through
          Improving → Leading → Weakening → Lagging.
          <span style={{ opacity: .7 }}> Our approximation of the relative-rotation concept popularized by Julius de Kempenaer (RRG Research); not the proprietary JdK RS-Ratio / RS-Momentum. Educational use only.</span>
        </p>
      </div>

      <div className="mm-sec-h"><h3>Sector ETFs</h3><span className="dr-sec-sub mono">excess return over the S&amp;P · tap a row to screen that sector</span></div>
      <SectorEtfs sectors={sectors} onSelectSector={onSelectSector} />

      <div className="mm-sec-h"><h3>Industry group leaders</h3><span className="dr-sec-sub mono">ranked by momentum inside each group · tap a name for full analysis</span></div>
      <IndustryGroups rows={rows} onOpenStock={onOpenStock} />
    </div>
  );
}
