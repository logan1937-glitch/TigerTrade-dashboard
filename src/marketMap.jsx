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

/* The four states in the order a momentum trader cares about them, each with the
   sentence that says what it MEANS rather than what it is called. "Weakening" is
   the one everybody reads backwards — it is the strong-but-rolling-over corner,
   not the weak one — so the description does the work the label cannot.
   Listed beside the plot: reading a dot's position is a decoding step, and the
   whole point of the roster is that it removes it. */
// ordered by what a momentum screener is looking for, not by the rotation cycle:
// the two states worth acting on sit at the top of the column
const QUADRANTS = [
  { id: "leading", label: "Leading", desc: "stronger than the S&P, and still gaining" },
  { id: "improving", label: "Improving", desc: "still weaker, but momentum has turned up" },
  { id: "weakening", label: "Weakening", desc: "still stronger, but momentum has turned down" },
  { id: "lagging", label: "Lagging", desc: "weaker than the S&P, and still losing" },
];

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

/* SECTORS ONLY. There was a Names mode plotting every tracked ticker, and ~500
   dots in a 600×400 box is not a chart — the labels had to be capped at eight, so
   forty-odd unlabelled dots sat there meaning nothing you could act on, and the
   roster beside it ran four screens long. Rotation is a sector-level idea anyway:
   it is about where money is moving between groups, and a single name's RS line
   already has a better home in the drawer. Eleven dots is the whole point. */
function RelativeRotation({ rows }) {
  const narrow = useNarrow();
  const [hover, setHover] = useState(null);
  const [pinned, setPinned] = useState(null);   // tapped sector whose tail stays shown

  const entities = useMemo(() => {
    // each name's 6-point rotation tail is precomputed on the snapshot (rrgOf).
    // Sectors are the equal-weight average of their members' tails.
    const withTail = rows.map((r) => (r.sig && r.sector !== "Custom" ? { r, tail: rrgOf(r) } : null)).filter((x) => x && x.tail);
    const by = {};
    for (const { r, tail } of withTail) (by[r.sector] = by[r.sector] || []).push(tail);
    return Object.entries(by).map(([sector, tails]) => {
      const tail = avgTails(tails);
      return tail ? { id: sector, label: sector, tail, head: tail[tail.length - 1], n: tails.length } : null;
    }).filter(Boolean);
  }, [rows]);

  if (entities.length < 2) return <div className="empty">Waiting for live data…</div>;

  // 3:2 on a desktop, near-square on a phone. The CSS mirrors both shapes and must
  // keep mirroring them: a viewBox that disagrees with its container letterboxes
  // the SVG while the HTML overlay keeps using the full box, so every mark drifts
  // off the plot it belongs to.
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

  /* NO label placement, because there are no labels left to place. Eleven sector
     names inside the plot were the clutter: each one is ~18 glyphs repeating a
     row that already exists in the roster, and the stack that stopped them
     colliding pushed most of them away from the dot they name — measured at up to
     77px, joined back by a hairline. A name sitting nearer some other sector's dot
     than its own is not a label, it is a wrong reading, and it cost a three-step
     decode (find chip, follow line, find dot) to answer what the roster answers in
     one. Deleting them also retires the two ResizeObservers, the px↔viewBox gap
     conversion and the two-pass placement — the four hairiest bugs this component
     has had were all in that code, and it now does not exist.

     Identity moves INSIDE the mark instead: each dot carries a rank numeral, and
     the roster prints the same numeral beside the name. That is one lookup rather
     than a traced hairline, and it is also what forces the dot to be big enough to
     read — which is the sizing half of the complaint. */

  const hv = entities.find((e) => e.id === (hover ?? pinned)) || null;

  /* Bucketed by where each head sits, strongest first — and NUMBERED in that
     order, so the roster reads 1,2 / 3,4,5 / 6,7,8 / 9,10,11 down the column and a
     numeral on the chart lands in a contiguous run rather than scattered across
     four cards. The key is render-local and nothing is persisted against it; it is
     a legend, not an identity, and it must never become one — an id that encodes a
     position has already cost this app a broken watchlist. */
  const byQuad = {};
  for (const e of entities) (byQuad[QUAD(e.head)] = byQuad[QUAD(e.head)] || []).push(e);
  for (const k of Object.keys(byQuad)) byQuad[k].sort((a, b) => b.head.ratio - a.head.ratio);
  const keyOf = {};
  let kn = 0;
  for (const q of QUADRANTS) for (const e of byQuad[q.id] || []) keyOf[e.id] = ++kn;

  return (
    <div className="mm-scatter">
      {/* The Sectors/Names switch is gone with the Names mode. What replaces it is
          the one instruction the chart needs, stated where the old control was —
          the trails are hidden until asked for, and nothing else on screen would
          tell you they exist. */}
      <div className="rrg-toolbar">
        {/* The readout lives HERE, not floating in the plot, at every width. Anchored
            to its dot it has to go somewhere, and everywhere inside a plot this
            dense is on top of something: it landed on the "Healthcare" chip at
            1200px, 820px and 700px, and on the corner captions at 390px. Above the
            chart it can never collide, and the dot it describes is already marked
            twice over — its own dot lifts and so does its roster row. */}
        {hv ? (
          <span className="rrg-hint mono">
            <b>{hv.label}</b> · {hv.n} names · <span style={{ textTransform: "capitalize" }}>{QUAD(hv.head)}</span>
            {" "}· Ratio {hv.head.ratio.toFixed(1)} · Mom {hv.head.mom.toFixed(1)}
          </span>
        ) : (
          <span className="rrg-hint mono">
            <b>Hover or tap a sector</b> to trace where it has come from over six weeks
          </span>
        )}
        {pinned && (
          <button className="rrg-clear mono" onClick={() => setPinned(null)}>Clear {pinned}</button>
        )}
      </div>
      <div className="rrg-wrap">
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
          {/* A quarter grid. Without it the plot is an empty rectangle with dots in
              it — there is no sense of scale, so a dot two thirds of the way out
              looks the same as one just past the centre. Four dotted lines is the
              least furniture that makes it read as a measured chart. */}
          {[0.25, 0.75].map((f) => (
            <line key={"gx" + f} x1={f * W} y1={0} x2={f * W} y2={H} className="rrg-grid" />
          ))}
          {[0.25, 0.75].map((f) => (
            <line key={"gy" + f} x1={0} y1={f * H} x2={W} y2={f * H} className="rrg-grid" />
          ))}
          <line x1={cx} y1={0} x2={cx} y2={H} className="chart-zero" />
          <line x1={0} y1={cy} x2={W} y2={cy} className="chart-zero" />

          {/* ONE tail, and only when asked. Every tail drawn at once is eleven
              six-point paths crossing each other in a box this size — measured as
              spaghetti twice, once in colour and once in neutral ink, and neither
              read. A rotation graph's default state is WHERE things are; where they
              came from is a question you ask of one sector at a time.
              The trail is drawn under every head so it never covers a dot. */}
          {hv && (() => {
            const t = hv.tail;
            const d = t.map((p, i) => `${i ? "L" : "M"}${x(p.ratio).toFixed(2)} ${y(p.mom).toFixed(2)}`).join(" ");
            return (
              <g className="rrg-trace" style={{ pointerEvents: "none" }}>
                <path d={d} className="rrg-tail" />
                {/* a dot per week, so the trail carries its own time scale: evenly
                    spaced dots are a steady drift, bunched ones are a stall */}
                {t.slice(0, -1).map((p, i) => (
                  <circle key={i} cx={x(p.ratio)} cy={y(p.mom)} r={1.6 + i * 0.35}
                    className="rrg-tail-pt" opacity={(0.3 + i * 0.11).toFixed(2)} />
                ))}
              </g>
            );
          })()}

        </svg>
        <div className="rrg-overlay">
          {/* each corner carries its own dot, so the head colours are keyed on the
              chart itself and not only in the roster beside it */}
          <span className="rrg-cap" style={{ right: `${((padR + 5) / W) * 100}%`, top: `${((padT + 4) / H) * 100}%` }}>
            <i className="rrg-qdot" data-q="leading" />Leading</span>
          <span className="rrg-cap" style={{ left: `${((padL + 5) / W) * 100}%`, top: `${((padT + 4) / H) * 100}%` }}>
            <i className="rrg-qdot" data-q="improving" />Improving</span>
          <span className="rrg-cap" style={{ left: `${((padL + 5) / W) * 100}%`, bottom: `${((padB + 4) / H) * 100}%` }}>
            <i className="rrg-qdot" data-q="lagging" />Lagging</span>
          <span className="rrg-cap" style={{ right: `${((padR + 5) / W) * 100}%`, bottom: `${((padB + 4) / H) * 100}%` }}>
            <i className="rrg-qdot" data-q="weakening" />Weakening</span>
          {/* Each axis names itself AND both of its directions. "RS-Ratio vs S&P
              500 →" told you what the axis was measuring and left you to work out
              which way was good; a reader who has to consult the paragraph under
              the chart to know which end is which cannot read the chart. */}
          <span className="rrg-axis" data-ax="x">
            <i>weaker</i><b>RS-Ratio vs S&amp;P 500</b><i>stronger</i>
          </span>
          <span className="rrg-axis" data-ax="y">
            <i>losing</i><b>RS-Momentum</b><i>gaining</i>
          </span>
          {/* pinned to the actual zero line, not to 50% — padL and padR differ, so
              the centre of the box is 6 viewBox units off the 100 gridline and the
              label sat visibly beside the axis it names */}
          <span className="rrg-origin mono" style={{ left: `${(cx / W) * 100}%` }}>100</span>
          {/* The marks live in the OVERLAY, not the SVG, for the same reason the
              text does: an HTML element renders at true pixel size instead of
              scaling with the viewBox, so a 30px dot is 30px at every width with
              nothing to measure. Being above the SVG also puts them over the
              trail without any z-index bookkeeping. The overlay is
              pointer-events:none; these opt back in, and they are real buttons —
              the SVG <g> handlers were never keyboard-reachable. */}
          {entities.map((e) => {
            const active = hv && hv.id === e.id;
            const focus = !!hv;
            const q = QUAD(e.head);
            return (
              <button key={"d" + e.id} className="rrg-dot" data-q={q} data-active={active || undefined}
                style={{ left: `${(x(e.head.ratio) / W) * 100}%`, top: `${(y(e.head.mom) / H) * 100}%`,
                  opacity: focus && !active ? 0.55 : 1 }}
                onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(e.id)} onBlur={() => setHover(null)}
                onClick={() => setPinned((v) => (v === e.id ? null : e.id))}
                aria-label={`${e.label} — ${QUAD(e.head)}, ratio ${e.head.ratio.toFixed(1)}, momentum ${e.head.mom.toFixed(1)}`}>
                {/* the soft disc survives as the ring's own ground: at 30px it is
                    what keeps the numeral legible over a gridline or a trail */}
                <i className="rrg-halo" data-q={q} aria-hidden="true" />
                <b className="rrg-key mono">{keyOf[e.id]}</b>
              </button>
            );
          })}
        </div>
      </div>

      {/* The roster. A dot's position IS the reading, but decoding eleven of them
          is work, and the answer a user actually wants — "who is leading?" — is a
          list. It also fills the panel width the fixed-aspect plot leaves empty,
          and it carries the one thing the corner labels cannot: what each state
          MEANS. Hover and pin are shared with the plot, so pointing at a row
          traces its path on the chart. */}
      {/* Eleven sectors always fit, so the roster is a plain block again. It used
          to be absolutely positioned inside a relative column purely to pin its
          height to the plot's and scroll — which existed for the deleted Names
          mode's ~44 entities. With that gone the trick only ever cost a scroll
          fade that washed out the footer. */}
      <div className="rrg-roster-col">
      <div className="rrg-roster">
        {QUADRANTS.map((q) => {
          const list = byQuad[q.id] || [];
          const shown = list;
          return (
            <div className="rrg-qgrp" key={q.id}>
              <div className="rrg-qgrp-h">
                <span className="rrg-qdot" data-q={q.id} aria-hidden="true" />
                <span className="rrg-qgrp-t mono">{q.label}</span>
                <span className="rrg-qgrp-n mono">{list.length}</span>
              </div>
              <p className="rrg-qgrp-d">{q.desc}</p>
              {shown.map((e) => {
                const active = hover === e.id || pinned === e.id;
                return (
                  <button key={e.id} className="rrg-rrow" data-active={active || undefined}
                    onMouseEnter={() => setHover(e.id)} onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(e.id)} onBlur={() => setHover(null)}
                    onClick={() => setPinned((v) => (v === e.id ? null : e.id))}
                    title={`Trace ${e.label}'s six-week path`}>
                    {/* the same numeral the dot carries — this is the whole key,
                        and it is why the plot needs no names inside it */}
                    <span className="rrg-rrow-n mono">{keyOf[e.id]}</span>
                    <span className="rrg-rrow-l">{e.label}</span>
                    <span className="rrg-rrow-v mono">{e.head.ratio.toFixed(1)}</span>
                    <span className="rrg-rrow-v mono">{e.head.mom.toFixed(1)}</span>
                  </button>
                );
              })}
              {!list.length && <p className="rrg-qgrp-e mono">none</p>}
            </div>
          );
        })}
        <p className="rrg-roster-f mono">
          Ranked by RS-Ratio. The two figures are Ratio and Momentum, both against 100.
        </p>
      </div>
      </div>
        <p className="mm-rrg-note rrg-note">
          {/* the axes now name both of their own directions, so this no longer
              repeats them; what is left is what the picture cannot say by itself */}
          <b>Reading it:</b> each numbered dot is one sector today, measured against the S&amp;P 500, and the same
          number sits beside its name in the list. Rotation runs clockwise — Improving → Leading → Weakening →
          Lagging — and a full turn takes months, not days, so a sector deep in one corner is a position rather
          than a signal. Hover or tap anything, on the chart or in the list, to draw the six weeks behind it;
          the dots along that trail are one per week, so evenly spaced is a steady drift and bunched is a stall.
          <span style={{ opacity: .7 }}> Our approximation of the relative-rotation concept popularized by Julius de Kempenaer (RRG Research); not the proprietary JdK RS-Ratio / RS-Momentum. Educational use only.</span>
        </p>
      </div>
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
        <RelativeRotation rows={rows} />
      </div>

      <div className="mm-sec-h"><h3>Sector ETFs</h3><span className="dr-sec-sub mono">excess return over the S&amp;P · tap a row to screen that sector</span></div>
      <SectorEtfs sectors={sectors} onSelectSector={onSelectSector} />

      <div className="mm-sec-h"><h3>Industry group leaders</h3><span className="dr-sec-sub mono">ranked by momentum inside each group · tap a name for full analysis</span></div>
      <IndustryGroups rows={rows} onOpenStock={onOpenStock} />
    </div>
  );
}
