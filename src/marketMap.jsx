import { useState, useMemo } from "react";
import { relativeRotation, aggregateRsLine } from "./signals.js";
import { SearchIcon } from "./components.jsx";

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

/* -------------------- industry-group leaders (RS within group) --------------------
   One level finer than the sector map: names bucketed by IBD-style industry
   group, ranked by momentum score inside each group, groups ordered by their
   median strength. The score badge's green heat encodes relative strength, so
   the leadership inside each group is legible at a glance. */
const scoreHeat = (score) => {
  const t = Math.max(0, Math.min(1, ((score || 0) - 30) / 55));  // 30→cool, 85→hot
  const alpha = Math.round((0.14 + t * 0.62) * 100);
  return {
    background: `color-mix(in oklch, var(--cat-growth) ${alpha}%, var(--surface-2))`,
    color: t > 0.5 ? "var(--accent-ink)" : "var(--muted)",
    borderColor: `color-mix(in oklch, var(--cat-growth) ${Math.min(70, alpha + 10)}%, transparent)`,
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

const MAP_W = 100, MAP_H = 62, MAP_CAP = 80;
function MarketHeatmap({ rows, tf, onOpenStock }) {
  const built = useMemo(() => {
    let names = rows.filter((r) => r.sig && r.sig.dollarVol > 0 && r.sector && r.sector !== "Custom" && r.closes && r.closes.length > 1);
    const total = names.length;
    // keep the most-traded names so tiles stay legible; note the rest honestly
    names = [...names].sort((a, b) => (b.sig.dollarVol || 0) - (a.sig.dollarVol || 0)).slice(0, MAP_CAP);
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
  }, [rows, tf]);

  if (!built) return <div className="empty">Waiting for live data…</div>;
  const maxAbs = Math.max(2, ...built.tiles.map((t) => (t.chg != null ? Math.abs(t.chg) : 0)));
  const pct = (v) => `${v}%`;

  return (
    <>
      <div className="mm-heat" role="img" aria-label="Market heatmap — tile size by dollar volume, color by return">
        <div className="mm-heat-inner">
          {built.groups.map((g) => (
            <div key={g.sector} className="mm-heat-group"
              style={{ left: pct(g.x), top: pct(g.y), width: pct(g.w), height: pct(g.h) }}>
              <span className="mm-heat-glabel mono">{g.sector}</span>
            </div>
          ))}
          {built.tiles.map((t) => {
            const up = t.chg != null && t.chg >= 0;
            const alpha = t.chg == null ? 0.05 : Math.min(0.44, 0.06 + (Math.abs(t.chg) / maxAbs) * 0.38);
            const showTk = t.w > 5.5 && t.h > 4;
            const showPct = t.w > 8.5 && t.h > 7;
            return (
              <button key={t.r.tk} className="mm-heat-tile" onClick={() => onOpenStock({ tk: t.r.tk })}
                title={`${t.r.tk} · ${t.r.sector}${t.chg != null ? ` · ${up ? "+" : ""}${t.chg.toFixed(1)}% (${tf})` : ""}`}
                style={{ left: pct(t.x), top: pct(t.y), width: pct(t.w), height: pct(t.h),
                  background: `color-mix(in oklch, ${t.chg == null ? "var(--surface)" : up ? "var(--cat-growth)" : "var(--sev-extreme)"} ${Math.round(alpha * 100)}%, var(--surface))` }}>
                {showTk && <span className="mm-heat-tk">{t.r.tk}</span>}
                {showPct && t.chg != null && <span className="mm-heat-pct mono" data-up={up}>{up ? "+" : ""}{t.chg.toFixed(1)}%</span>}
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

      <div className="mm-sec-h" style={{ marginTop: 26 }}><h3>Industry group leaders</h3><span className="dr-sec-sub mono">ranked by momentum inside each group · tap a name for full analysis</span></div>
      <IndustryGroups rows={rows} onOpenStock={onOpenStock} />

      <div className="mm-sec-h" style={{ marginTop: 26 }}><h3>Market heatmap</h3><span className="dr-sec-sub mono">size = dollar volume · color = {tf} return · tap a tile</span></div>
      <MarketHeatmap rows={rows} tf={tf} onOpenStock={onOpenStock} />

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
