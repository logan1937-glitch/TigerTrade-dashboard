import { useState, useMemo, useEffect } from "react";
import { TT } from "./tt.js";
import { RET_KEY } from "./signals.js";
import { PlaybookView } from "./playbook.jsx";
import { SearchIcon, StarBtn, InfoDot, NA, Chip, FigPct, FeedState, Term } from "./components.jsx";
import { GLOSSARY } from "./glossary.js";
import { BarMeter } from "./charts.jsx";
import { MarketMap } from "./marketMap.jsx";
import { PortfolioView } from "./portfolio.jsx";

const LETTERS = ["L", "E", "A", "D", "E", "R", "S"];

/* The five views under this product, in order. Named once because the sub-nav
   renders it AND the URL validates against it — a `?tab=` value from the radar's
   set must select nothing rather than land somewhere arbitrary. */
const SUBTABS = [["screener", "Screener"], ["map", "Market Map"], ["health", "Market Health"],
  ["playbook", "Playbook"], ["portfolio", "Portfolio"]];

// so the empty-filter panel can name the lens the user actually picked
const IDX_LABEL = { sp500: "S&P 500", ndx: "Nasdaq 100", dow: "Dow 30" };

const fmtAsOf = (ms) => {
  try { return new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
};

// The smallest move that gets to fill the box. Without a floor the scale is
// max-minus-min, so a name that drifted 2% over a year is stretched to the exact
// same peaks and troughs as one that tripled — the chart draws noise as if it
// were a trend, and every row ends up looking alike. 8% over the window is a
// genuinely quiet stock, and it should look quiet.
const SPARK_MIN_SPAN = 8;

function Spark({ data }) {
  const w = 240, h = 40, pad = 3;
  const first = data[0], last = data[data.length - 1];
  if (!first) return <NA why="No daily closes for this name in the latest snapshot" />;
  // Everything is measured against the window's opening price, so the vertical
  // middle is "unchanged" on every row and the rows are comparable to each other.
  const pcts = data.map((v) => (v / first - 1) * 100);
  const span = Math.max(SPARK_MIN_SPAN, ...pcts.map(Math.abs));
  const mid = h / 2, amp = mid - pad;
  const y = (p) => mid - (p / span) * amp;
  const pts = pcts.map((p, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${y(p).toFixed(2)}`);
  const net = (last / first - 1) * 100;
  /* One colour, and it is brand amber — the reference draws it that way and the
     rule agrees. A trend line is a SHAPE, not money moved: a falling amber line
     still reads as falling because it goes down, and the Δ column an inch to the
     left already carries the sign in the P&L pair. Spending green and red on a
     channel that is redundant with its own neighbour is exactly what costs them
     their meaning everywhere else.

     This replaces an earlier "polarity follows net direction" rule. That rule
     was solving a real problem — a downtrend drawn in green — but the fix was
     the wrong axis: the answer is not to switch between P&L colours, it is not
     to use them here at all. */
  const c = "var(--brand)";
  // fill to the unchanged line rather than to the floor of the box, so the shaded
  // area is the gain (or the loss) and not just "there is a line here"
  const area = `0,${mid} ${pts.join(" ")} ${w},${mid}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} height={h} className="cs-spark" preserveAspectRatio="none"
      role="img" aria-label={`${net >= 0 ? "up" : "down"} ${Math.abs(net).toFixed(1)}% over the window`}>
      <polygon points={area} fill={`color-mix(in oklch, ${c} 16%, transparent)`} />
      <line x1="0" y1={mid} x2={w} y2={mid} stroke="var(--border-2)" strokeWidth="1"
        strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      <polyline points={pts.join(" ")} fill="none" stroke={c} strokeWidth="1.5" vectorEffect="non-scaling-stroke"
        strokeLinecap="round" strokeLinejoin="round" />
      {/* the last close, so the eye lands on where the name is now */}
      <circle cx={w} cy={y(net)} r="2.4" fill={c} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Depth below the 52-week high — the metric this whole product turns on, since a
// leader by definition sits near its own highs. Right-anchored: the bar grows
// leftward as the name falls away from the high, so a row of leaders reads as a
// clean right edge and a laggard visibly sticks out.
const OFF_CAP = 40;   // beyond 40% off the high the exact depth stops mattering
function OffHigh({ off }) {
  // always the same element type — the mobile rule hides cells by
  // `div:nth-child(n)`, and a bare span here would survive into a 3-column layout
  // still a <div>: the mobile rule hides cells by child index, and swapping the
  // element type here would shift every column after it
  if (off == null) return <div className="cs-off"><NA why="Distance from the 52-week high needs a full year of closes" /></div>;
  const tier = off <= 5 ? "near" : off <= 15 ? "mid" : "far";
  return (
    <div className="cs-off" data-tier={tier}
      title={`${off.toFixed(1)}% below the 52-week high${off <= 5 ? " — within 5%, the leadership band" : ""}`}>
      <span className="cs-off-v mono">{off < 0.05 ? "at high" : `−${off.toFixed(1)}%`}</span>
      <span className="cs-off-bar"><i style={{ width: `${Math.min(off, OFF_CAP) / OFF_CAP * 100}%` }} /></span>
    </div>
  );
}

/* A 1px hairline column at each of the three group boundaries. The nine columns
   are four ideas — identity · price · strength · model — and at one even gap they
   read as nine equally-weighted facts.

   It is a <span> so it is obvious it holds no data, but note it still OCCUPIES A
   CHILD INDEX: `div:nth-child(n)` counts every sibling, not just the divs, so the
   ≤880px rule that collapses this table to three columns had to be re-indexed
   around these. Verified in a browser, not assumed. */
const Seam = () => <span className="cs-seam" aria-hidden="true" />;

/* Three states of one measurement — price against the pivot — so all three are
   askable from the pill itself rather than from a legend somewhere else. */
const STATUS_MAP = {
  buy:   ["In Buy Zone", "var(--cat-growth)", "buyZone"],
  ext:   ["Extended",    "var(--sev-high)",   "extended"],
  watch: ["Watch",       "var(--cat-data)",   "watchStatus"],
};
function StatusPill({ status }) {
  const [label, color, key] = STATUS_MAP[status];
  return (
    <span className="badge badge-cat" style={{ "--c": color }}>
      <Term k={key}>{label}</Term>
    </span>
  );
}

function fmtPx(n) { if (n == null || Number.isNaN(+n)) return "—"; return n >= 1000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : n.toFixed(2); }

/* ----------------------------- SCREENER ----------------------------- */
const TF_BARS = { "1W": 5, "1M": 21, "3M": 63, "1Y": 252 };
// % return over the selected timeframe. Prefers the snapshot's precomputed
// returns (compact records carry no price arrays); falls back to closes for
// custom / live-fallback names, then to the daily quote change.
// Returns null when the window cannot be measured. It used to fall through to 0,
// which printed a green +0.00% — a name with no data and a name that closed
// exactly flat rendering identically, in the column people scan first.
function periodReturn(s, tf) {
  const pr = s.sig && s.sig.ret;
  if (pr && pr[RET_KEY[tf]] != null) return pr[RET_KEY[tf]];
  const c = s.closes, n = c ? c.length : 0;
  if (tf === "1D") return s.chg != null ? s.chg : (n >= 2 ? (c[n - 1] / c[n - 2] - 1) * 100 : null);
  if (!c || n < 2) return s.chg != null ? s.chg : null;
  const back = TF_BARS[tf] || 21;
  const i = Math.max(0, n - 1 - back);
  return c[i] > 0 ? (c[n - 1] / c[i] - 1) * 100 : null;
}

/* ---------- what changed today (day-over-day snapshot diff) ---------- */
const CHANGE_META = [
  { key: "newBreakouts", label: "New breakouts", note: "into Stage 2 (advancing)", color: "var(--cat-growth)" },
  { key: "enteredBuyZone", label: "Entered buy zone", note: "back at a pivot", color: "var(--accent)" },
  { key: "newHighs", label: "New 52-wk highs", note: "", color: "var(--cat-growth)" },
  { key: "rolledOver", label: "Rolled over", note: "Stage 2 → topping / declining", color: "var(--sev-extreme)" },
];
function ChangesPanel({ changes, onOpenStock }) {
  const [open, setOpen] = useState(true);
  if (!changes) return null;
  const cats = CHANGE_META.filter((c) => changes[c.key] && changes[c.key].count > 0);
  if (!cats.length) return null;
  let since = "";
  try { if (changes.since) since = ` since ${new Date(changes.since).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`; } catch {}
  return (
    <div className="chg">
      <button className="chg-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="chg-caret mono">{open ? "▾" : "▸"}</span>
        <span className="chg-title">What changed{since}</span>
        <span className="chg-sum mono">{cats.map((c) => `${changes[c.key].count} ${c.label.toLowerCase()}`).join(" · ")}</span>
      </button>
      {open && (
        <div className="chg-body">
          {cats.map((c) => {
            const d = changes[c.key];
            return (
              <div className="chg-cat" key={c.key}>
                <span className="chg-cat-h"><i className="chg-dot" style={{ background: c.color }} /><b className="mono">{d.count}</b> {c.label}{c.note && <span className="chg-cat-note mono">· {c.note}</span>}</span>
                <div className="chg-chips">
                  {d.names.slice(0, 20).map((n) => (
                    <button key={n.tk} className="chg-chip" onClick={() => onOpenStock({ tk: n.tk })} title={`${n.name} · ${n.sector}`}>{n.tk}</button>
                  ))}
                  {d.count > 20 && <span className="chg-more mono">+{d.count - 20} more</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const SORT_LABEL = { score: "score", rs: "RS", pass: "pass", chg: "% change", ticker: "ticker", status: "buy status" };
// the factors the Δ window actually changes — pass follows because its L chip is
// the RS test, which moves with the window
const TF_SCOPED = { chg: true, rs: true, score: true, pass: true };

function Screener({ rows, onOpenStock, onLookup, lookupBusy, lookupErr, sectorF, onClearSector, changes, ext = { status: "idle" }, onLoadExt }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("score");
  const [dir, setDir] = useState("desc");   // "desc" = high→low / Z→A, "asc" = the reverse
  const [statusF, setStatusF] = useState("all");
  // index membership, tagged on every row by the snapshot. "All" is the whole
  // universe including the curated names that belong to no index at all.
  const [idxF, setIdxF] = useState("all");
  /* Which row you last opened. The jade left edge is otherwise a hover state, so
     closing the drawer drops you back into 500 identical rows with nothing
     marking where you were. Not persisted — it is within-session wayfinding. */
  const [lastOpened, setLastOpened] = useState(null);
  // Δ is the ranking window, not just a price-column format: RS, score and the
  // leadership L chip are all measured over it. 1Y is the default so the board
  // still opens on the classic 12-month leadership ranking.
  const [tf, setTf] = useState("1Y");
  const [addSym, setAddSym] = useState("");
  const submitLookup = (e) => { e.preventDefault(); if (onLookup) onLookup(addSym); setAddSym(""); };
  // click a column header (or a Sort chip): re-selecting the active key flips the
  // direction; a new key resets to its natural default (A→Z for text, high→low otherwise)
  const setSortKey = (key) => {
    if (key === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSort(key); setDir(key === "ticker" ? "asc" : "desc"); }
  };
  const STATUS_RANK = { buy: 3, ext: 2, watch: 1 };
  const view = useMemo(() => {
    let r = rows.filter((x) => (x.tk + " " + x.name + " " + x.group).toLowerCase().includes(q.toLowerCase()));
    if (sectorF) r = r.filter((x) => x.sector === sectorF);
    if (statusF !== "all") r = r.filter((x) => x.status === statusF);
    if (idxF !== "all") r = r.filter((x) => Array.isArray(x.idx) && x.idx.includes(idxF));
    // every ranked quantity is resolved for the selected window before sorting,
    // so changing Δ re-orders the board on whichever factor is active — not just
    // the number in the price column
    r = r.map((x) => {
      const _ret = periodReturn(x, tf);
      const _rs = x.rsBy && x.rsBy[tf] != null ? x.rsBy[tf] : x.rs;
      const _score = x.scoreBy && x.scoreBy[tf] != null ? x.scoreBy[tf] : x.score;
      const _grade = _score == null ? x.grade : _score >= 80 ? "a" : _score >= 60 ? "b" : "c";
      // L is "leadership = RS ≥ 85", so it has to move with the window too —
      // otherwise a row could read "RS 92" beside an unlit L chip
      let _breakdown = x.breakdown, _pass = x.pass;
      if (tf !== "1Y" && _rs != null && _breakdown && _breakdown[0] && _breakdown[0].key === "f1") {
        _breakdown = [{ ..._breakdown[0], value: `RS ${_rs}`, pass: _rs >= 85 }, ..._breakdown.slice(1)];
        _pass = _breakdown.filter((b) => b.pass === true).length;
      }
      return { ...x, _ret, _rs, _score, _grade, _breakdown, _pass };
    });
    const val = (x) => (sort === "chg" ? (x._ret || 0)
      : sort === "rs" ? (x._rs || 0)
      : sort === "score" ? (x._score || 0)
      : sort === "pass" ? (x._pass || 0)
      : sort === "status" ? (STATUS_RANK[x.status] || 0) : (x[sort] || 0));
    const dv = dir === "asc" ? 1 : -1;
    const cmp = sort === "ticker" ? (a, b) => dv * a.tk.localeCompare(b.tk) : (a, b) => dv * (val(a) - val(b));
    return [...r].sort(cmp);
  }, [rows, q, sort, dir, statusF, idxF, tf, sectorF]);

  // sortable column header — clickable, shows the active sort arrow
  const Th = ({ label, k, right, term }) => (
    <span className="cs-th-wrap" data-right={right || undefined}>
      <button type="button" className="cs-th" data-active={sort === k || undefined} data-right={right || undefined}
        aria-sort={sort === k ? (dir === "asc" ? "ascending" : "descending") : "none"} onClick={() => setSortKey(k)}>
        {label}<span className="cs-th-ar" aria-hidden="true">{sort === k ? (dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
      {/* the definition is a separate control from the sort, so asking what a
          column means does not silently re-order 500 rows */}
      {term && <Term k={term}><i className="cs-th-q" aria-hidden="true">?</i></Term>}
    </span>
  );

  return (
    <div className="wrap">
      <ChangesPanel changes={changes} onOpenStock={onOpenStock} />
      <div className="filters" style={{ justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="search-wrap"><SearchIcon /><input className="search" placeholder="search ticker / group…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {onLookup && (
            <form onSubmit={submitLookup} className="cs-lookup" title="Look up any ticker">
              <input className="search" style={{ width: 150, paddingLeft: 12 }} placeholder="add any ticker…" value={addSym}
                onChange={(e) => setAddSym(e.target.value)} aria-label="Add any ticker" />
              <button type="submit" className="seg-btn" data-active="true" disabled={lookupBusy} style={{ padding: "8px 12px" }}>{lookupBusy ? "…" : "＋ Add"}</button>
              {lookupErr && <span className="cs-lookup-err mono">{lookupErr}</span>}
            </form>
          )}
          <div className="seg">
            {[["all", "All"], ["buy", "Buy zone"], ["ext", "Extended"], ["watch", "Watch"]].map(([id, l]) => (
              <button key={id} className="seg-btn" data-active={statusF === id} onClick={() => setStatusF(id)}>{l}</button>
            ))}
          </div>
          {/* The first three are membership, not reach: the Dow is a strict subset
              of the S&P 500 and the Nasdaq-100 adds ~10–20 names, so they are a
              lens on what is already here. "Beyond index" is the one that adds
              names — it loads a second payload on demand. */}
          <div className="seg">
            {[["all", "Any index", "Every name loaded — index member or not"],
              ["sp500", "S&P 500", "S&P 500 constituents"],
              ["ndx", "Nasdaq 100", "Nasdaq-100 constituents — mostly a subset of the S&P 500"],
              ["dow", "Dow 30", "Dow Jones Industrial Average — entirely inside the S&P 500"],
              ["ext", "Beyond index", "The largest US names outside the S&P 500 — mid-caps, where leaders usually are before they are added. Loaded on demand."]].map(([id, l, t]) => (
              <button key={id} className="seg-btn" data-active={idxF === id}
                onClick={() => { if (id === "ext" && onLoadExt) onLoadExt(); setIdxF(id); }} title={t}>{l}</button>
            ))}
          </div>
          {/* The extended tier's state is stated, never inferred from an empty
              table: "no rows" here could mean loading, not-yet-computed, or a
              failed fetch, and those are three different things to a user
              deciding whether the screen they are looking at is complete. */}
          {idxF === "ext" && ext.status !== "ok" && view.length > 0 && (
            <span className="cs-ext-note mono" data-bad={ext.status === "error" || undefined}>
              {ext.status === "loading" ? "loading the wider universe…"
                : ext.status === "pending" ? (ext.reason === "SCHEMA_STALE"
                  ? "rebuilding after a deploy — ready after tonight's pass"
                  : "not computed yet — the nightly pass runs after the close")
                : ext.status === "error" ? `unavailable (${ext.reason || "error"})`
                : "—"}
            </span>
          )}
          {idxF === "ext" && ext.status === "ok" && (
            <span className="cs-ext-note mono">
              {ext.count}{ext.total > ext.count ? ` of ${ext.total}` : ""} names ≥ ${Math.round((ext.screen?.minCap || 2e9) / 1e9)}B outside the S&P 500
            </span>
          )}
        </div>
        <div className="filters-right">
          <span className="minwt-lab" title="The window everything is measured and ranked over — price change, RS and score">Window</span>
          <div className="seg">
            {["1D", "1W", "1M", "3M", "1Y"].map((id) => (
              <button key={id} className="seg-btn" data-active={tf === id} onClick={() => setTf(id)}
                title={`Rank the board on ${id === "1Y" ? "12-month" : id} relative strength`}>{id}</button>
            ))}
          </div>
          <span className="minwt-lab">Sort</span>
          <div className="seg">
            {[["score", "Score"], ["rs", "RS"], ["pass", "Pass"], ["chg", "% Chg"]].map(([id, l]) => (
              <button key={id} className="seg-btn" data-active={sort === id} onClick={() => setSortKey(id)}
                title={sort === id ? (dir === "asc" ? "ascending — click to reverse" : "descending — click to reverse") : `sort by ${l.toLowerCase()}`}>
                {l}{sort === id ? (dir === "asc" ? " ↑" : " ↓") : ""}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="listmeta"><span className="count"><b>{view.length}</b> leaders{sectorF && <> · <b>{sectorF}</b> <button className="linkbtn" style={{ fontSize: 9, padding: "2px 7px", marginLeft: 4 }} onClick={onClearSector}>clear ✕</button></>} · sorted by {SORT_LABEL[sort] || sort}{TF_SCOPED[sort] ? ` over ${tf === "1Y" ? "12 months" : tf}` : ""} {dir === "asc" ? "↑" : "↓"}</span>
        <span className="count mono" style={{ opacity: .8 }}>click a header to sort · a row for full analysis</span></div>

      {/* An empty table under "Beyond index" is three different facts wearing the
          same face — loading, not-computed-yet, or a failed fetch — and the row
          count alone cannot tell them apart. The panel says which, in the space
          the rows would have occupied. Pending is neutral, a failure is amber:
          neither is red, because a feed being down is not a loss. */}
      {/* An index filter with no members is not an empty result — it is an
          unanswerable question, and it looked identical to "nothing matched".
          The Nasdaq and Dow tags come from FMP constituent endpoints that are
          gated above the Starter plan; without them no name is tagged and the
          board went blank with nothing to explain it. Say which. */}
      {idxF !== "all" && idxF !== "ext" && view.length === 0 && rows.length > 0 ? (
        <div className="cs-state">
          <FeedState kind="degraded" kicker={`${IDX_LABEL[idxF] || idxF} membership`}
            headline="No name in the loaded universe carries this tag."
            detail={<>Index membership is fetched per index at snapshot time and then falls back to a
              committed list. If this is empty, neither answered — check the snapshot's logs for a
              <b> constituent</b> line. The board itself is unaffected; only the lens is.</>}
            actions={[{ label: "Back to any index", kind: "secondary", onClick: () => setIdxF("all") }]} />
        </div>
      ) : null}

      {idxF === "ext" && ext.status !== "ok" && view.length === 0 ? (
        <div className="cs-state">
          {ext.status === "loading" ? (
            <FeedState kind="pending" kicker="Extended universe"
              headline="Loading the wider tier."
              detail="Roughly 900 names outside the S&P 500, on their own payload. It is fetched only when you ask for it, which is why this is not already here." />
          ) : ext.status === "pending" ? (
            <FeedState kind="pending" kicker="Extended universe"
              headline="Tonight's pass hasn't run yet."
              detail="The wider ~900-name tier is computed on its own schedule, twenty minutes after the core. Until then the board shows the tracked universe only, and RS is ranked against that field."
              actions={[{ label: "Stay on the core universe", onClick: () => setIdxF("all") }]} />
          ) : (
            <FeedState kind="degraded" kicker="Extended universe"
              headline="The wider tier could not be fetched."
              detail={`The core board below is unaffected — it is a separate payload, already loaded. Reason given: ${ext.reason || "unknown"}.`}
              actions={[{ label: "Try again", kind: "secondary", onClick: () => onLoadExt && onLoadExt() },
                        { label: "Stay on the core universe", onClick: () => setIdxF("all") }]} />
          )}
        </div>
      ) : null}

      <div className="cs-table">
       <div className="cs-panel cs-panel-scroll">
        <div className="cs-head" role="row">
          <Th label="Ticker" k="ticker" />
          <Seam />
          <Th label={`Price · Δ${tf}`} k="chg" right />
          <Th label={tf === "1Y" ? "RS" : `RS · ${tf}`} k="rs" term="rs" />
          <Seam />
          {/* named 1y because it does NOT follow the Δ window — the snapshot ships
              one series per name, and a column that silently meant something else
              than its neighbours would be worse than one that says its scope */}
          <span>Trend · 1y</span>
          <span><Term k="offHigh">Off high</Term></span>
          <Seam />
          <Th label="Leadership" k="pass" />
          <span>Signals</span>
          <Th label="Buy Status" k="status" right />
          <Th label={tf === "1Y" ? "Score" : `Score · ${tf}`} k="score" right term="score" />
        </div>
        {view.map((r, i) => (
          <div className="cs-row reveal" key={r.tk} style={{ "--i": i }}
            data-last-opened={lastOpened === r.tk || undefined}
            onClick={() => { setLastOpened(r.tk); onOpenStock(r); }}
            role="button" tabIndex={0} aria-label={`${r.tk} — open full analysis`}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLastOpened(r.tk); onOpenStock(r); } }}>
            <div className="cs-tk"><StarBtn wkey={"st:" + r.tk} kind="stock" refId={r.tk} /><span className="cs-tk-txt"><span className="cs-sym">{r.tk}</span><span className="cs-name">{r.name}</span></span></div>
            <Seam />
            <div className="cs-px"><span className="cs-price mono">{r.px != null ? "$" + fmtPx(r.px) : <NA why="No quote for this name in the nightly snapshot" />}</span>
              <span className="cs-chg" data-up={r._ret == null ? undefined : r._ret >= 0}><FigPct v={r._ret} /></span></div>
            <div className="cs-rs mono" title={tf === "1Y" ? "Relative-strength rank over 12 months" : `Relative-strength rank over the selected ${tf} window`}>
              {r._rs != null ? r._rs : <NA why="RS is a percentile of return across the loaded universe — this name has no return to rank" />}{r._rs != null && <i style={{ width: r._rs + "%" }} />}</div>
            <Seam />
            {/* `_sparkReal` = the snapshot answered for this name; without it the
                row still holds tt.js's editorial curve, which is not its price */}
            <div>{r.spark && r.spark.length > 1 && r._sparkReal ? <Spark data={r.spark} />
              : <NA why="No daily history for this name in the latest snapshot" />}</div>
            <OffHigh off={r.sig ? r.sig.off52 : null} />
            <Seam />
            <div className="cs-letters">{r._breakdown && r._breakdown.length ? r._breakdown.map((b, j) => (
              <span key={j} className="cs-let" data-on={b.pass === true} data-na={b.pass == null || undefined} title={`${b.name}${b.pass == null ? " — needs data" : b.pass ? " ✓" : ""}`}>{b.letter}</span>
            )) : <NA why="The LEADERS scorecard needs a signal bundle — none in the snapshot for this name" />}</div>
            <div className="cs-sig">
              {r.sig ? (
                <>
                  {/* Tone by stage, not one flat neutral. Collapsing all four to
                      the same chip threw away the read the column exists for —
                      stage 2 is the state this screener hunts for and stage 4 is
                      the one the method says to be out of, and they looked
                      identical. Jade for the constructive one, caution for
                      topping and declining; the numeral carries the rest. Not
                      red for stage 4, however tempting: a downtrend is a
                      direction, and red here means money moved. */}
                  {r.sig.stage
                    ? <Chip tone={r.sig.stage === 2 ? "signal" : r.sig.stage >= 3 ? "caution" : "neutral"}
                        title={`Stage ${r.sig.stage} — ${r.sig.stageLabel || ""}`}>{"S" + r.sig.stage}</Chip>
                    : <NA why="Stage needs 30 weeks of closes against their moving average" />}
                  {r.sig.rsNewHigh && <span className="cs-flag" data-lead={r.sig.rsLeads || undefined} title={r.sig.rsLeads ? "RS line at a new high before price" : "RS line at a new high"}>RS↑</span>}
                  {r.sig.pocketPivot && <span className="cs-flag" title="Pocket pivot">◆</span>}
                  {r.ern && r.ern.days <= 7 && <Chip tone="caution" title={`Earnings ${r.ern.date}${r.ern.est ? " (projected date)" : ""}${r.ern.time === "bmo" ? " (before open)" : r.ern.time === "amc" ? " (after close)" : ""} — gap risk on new entries`}>
                    {r.ern.est ? "~" : ""}{r.ern.days === 0 ? "E·today" : `E-${r.ern.days}`}</Chip>}
                </>
              ) : <NA why="No signal bundle for this name in the nightly snapshot" />}
            </div>
            <div style={{ textAlign: "right" }}>{r.status ? <StatusPill status={r.status} /> : <NA why="A buy status needs a measurable base — not enough history for this name" />}</div>
            <div className="cs-score mono" data-grade={r._grade || (r._score >= 93 ? "a" : "b")}
              title={tf === "1Y" ? undefined : `Leadership score over the selected ${tf} window`}>
              {(r.sig || r.coverage === "full") ? r._score : <NA why="The momentum score needs a signal bundle — none in the snapshot for this name" />}</div>
          </div>
        ))}
       </div>
      </div>
      <p style={{ fontSize: 10.5, lineHeight: 1.6, color: "var(--dim)", margin: "-46px 2px 64px", maxWidth: "70ch" }}>
        The <b style={{ color: "var(--muted)", fontWeight: 600 }}>TigerTrade Leadership Model (LEADERS)</b> is our own 7-factor
        relative-strength growth framework. Its factors follow classic leadership-investing principles popularized by William
        J. O'Neil. TigerTrade is independent and not affiliated with, sponsored by, or endorsed by Investor's Business Daily;
        “CAN SLIM” is a registered trademark of Investor's Business Daily, Inc. Educational use only — not investment advice.
      </p>
    </div>
  );
}

/* --------------------------- MARKET HEALTH --------------------------- */
const fmtIdx = (v) => (v == null ? "—" : v.toLocaleString(undefined, { maximumFractionDigits: v >= 1000 ? 0 : 2 }));

function MarketHealth({ market }) {
  const liveMh = !!market;
  // live computed data when available; illustrative fallback, clearly labeled
  const m = liveMh
    ? {
        trend: market.trend, trendNote: market.trendNote,
        distDays: market.distDays, distMax: market.distMax, lastFTD: market.lastFTD || "—",
        // `chg` stays null when the feed had none — mapping it to 0 printed a
        // green +0.00% for an index nobody measured. `above50/200` stay tri-state
        // for the same reason: computeMarketHealth returns null for "not enough
        // history to say", and `!!null` collapsed that into "below the average",
        // which is a claim about the market rather than about the data.
        indexes: market.indexes.map((ix) => ({ k: ix.k, v: fmtIdx(ix.price),
          chg: ix.chg != null ? +ix.chg.toFixed(2) : null,
          above50: ix.above50, above200: ix.above200, spark: ix.spark })),
        breadth: market.breadth,
      }
    : TT.MKT;
  const b = m.breadth;
  return (
    <div className="wrap mh">
      <div className="listmeta" style={{ marginBottom: 14 }}>
        <span className="count">{liveMh
          ? <><b>Live</b> · computed from index EOD data{market.asOf ? ` · as of ${new Date(market.asOf).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}</>
          : <><b>Illustrative</b> · live market data unavailable</>}</span>
        {liveMh && <span className="count mono" style={{ opacity: .8 }}>trend & distribution from the S&amp;P 500</span>}
      </div>
      <div className="mh-grid">
        <div className="mh-card mh-trend reveal" style={{ "--i": 0 }}>
          <span className="mh-k mono">Market trend</span>
          <span className="mh-trend-v" style={m.trend !== "Confirmed Uptrend" ? { color: m.trend === "Market In Correction" ? "var(--sev-extreme)" : "var(--sev-high)" } : undefined}>{m.trend}</span>
          <p className="mh-note">{m.trendNote}</p>
          <div className="mh-dist">
            <span className="mh-k mono">Distribution days</span>
            <div className="mh-dots">{Array.from({ length: m.distMax }).map((_, i) => <span key={i} data-on={i < m.distDays} />)}</div>
            <span className="mono" style={{ color: "var(--muted)" }}>{m.distDays} / {m.distMax}</span>
          </div>
          <div className="mh-ftd"><span className="mh-k mono">{liveMh ? "Last 1.25%+ up day on volume" : "Last follow-through day"}</span><b className="mono">{m.lastFTD}</b></div>
        </div>

        <div className="mh-card reveal" style={{ "--i": 1 }}>
          <span className="mh-k mono">Index health</span>
          <div className="mh-idx">
            {m.indexes.map((ix) => (
              <div className="mh-irow" data-spark={!!(ix.spark && ix.spark.length) || undefined} key={ix.k}>
                <span className="mh-iname">{ix.k}</span>
                {ix.spark && ix.spark.length > 2 && <span className="mh-ispark"><Spark data={ix.spark} /></span>}
                <span className="mono mh-iv">{ix.v}</span>
                {ix.chg == null
                  ? <span className="mono mh-ichg" data-na="true" title="No change figure for this index in the snapshot">—</span>
                  : <span className="mono mh-ichg" data-up={ix.chg >= 0}>{ix.chg >= 0 ? "+" : ""}{ix.chg}%</span>}
                {/* three states, not two: on / below / not enough history to say */}
                <span className="mh-ima" data-on={ix.above50 === true || undefined} data-na={ix.above50 == null || undefined}
                  title={ix.above50 == null ? "Not enough history to compare with the 50-day average" : ix.above50 ? "Above its 50-day average" : "Below its 50-day average"}>50d</span>
                <span className="mh-ima" data-on={ix.above200 === true || undefined} data-na={ix.above200 == null || undefined}
                  title={ix.above200 == null ? "Not enough history to compare with the 200-day average" : ix.above200 ? "Above its 200-day average" : "Below its 200-day average"}>200d</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mh-card reveal" style={{ "--i": 2 }}>
          <span className="mh-k mono">{liveMh ? `Breadth · tracked universe (${b.n})` : "Breadth"}</span>
          <div className="mh-breadth">
            <div className="mh-b"><span className="mh-bk mono">New 52-wk highs / lows</span><span className="mh-bv mono"><b className="up">{b.newHighs}</b> / <b className="dn">{b.newLows}</b></span></div>
            {b.pctAbove50 != null && <div className="mh-b"><span className="mh-bk mono">% above 50-day</span><span className="mh-bv mono">{b.pctAbove50}%</span><BarMeter value={b.pctAbove50} c="var(--cat-growth)" /></div>}
            {b.upVolPct != null && <div className="mh-b"><span className="mh-bk mono">Up $-volume</span><span className="mh-bv mono">{b.upVolPct}%</span><BarMeter value={b.upVolPct} c="var(--cat-growth)" /></div>}
            <div className="mh-b"><span className="mh-bk mono">Adv/Dec ratio</span><span className="mh-bv mono">{b.advDec}:1</span></div>
          </div>
        </div>

        {liveMh && market.stages && market.stages.n > 0 && (
          <StageBreadth stages={market.stages} />
        )}
      </div>
    </div>
  );
}

/* Weinstein stage distribution across the tracked universe — a breadth read on
   where names sit in their cycle. Stage 2 (advancing) is the constructive one. */
const STAGE_META = [
  { s: 2, k: "S2", label: "Advancing", note: "uptrend — where leaders live" },
  { s: 1, k: "S1", label: "Basing", note: "bottoming — building a base" },
  { s: 3, k: "S3", label: "Topping", note: "distribution — rolling over" },
  { s: 4, k: "S4", label: "Declining", note: "downtrend — avoid" },
];
function StageBreadth({ stages }) {
  const { counts, n } = stages;
  const pct = (s) => (n > 0 ? (counts[s] / n) * 100 : 0);
  const order = [2, 1, 3, 4]; // segment order in the bar, left→right
  return (
    <div className="mh-card mh-stages reveal" style={{ "--i": 3 }}>
      <span className="mh-k mono">Stage distribution · tracked universe ({n})</span>
      <div className="mh-stagebar" role="img" aria-label="Weinstein stage distribution">
        {order.map((s) => pct(s) > 0 && (
          <span key={s} className="mh-stageseg" data-stage={s} style={{ width: `${pct(s)}%` }} title={`Stage ${s}: ${counts[s]} names`} />
        ))}
      </div>
      <div className="mh-stagelegend">
        {STAGE_META.map(({ s, k, label, note }) => (
          <div className="mh-stagerow" key={s}>
            <span className="mh-stagedot" data-stage={s} />
            <span className="mh-stagek mono">{k}</span>
            <span className="mh-stagelab">{label}</span>
            <span className="mh-stagen mono">{counts[s]}</span>
            <span className="mh-stagepct mono">{Math.round(pct(s))}%</span>
            <span className="mh-stagenote">{note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ SHELL ------------------------------ */
export function CanslimView({ onOpenStock, live = { status: "loading" }, rows = TT.CANSLIM, market = null, changes = null, onLookup, lookupBusy, lookupErr,
  posRows = [], events = [], vix = null, sectors = null, ext = { status: "idle" }, onLoadExt,
  initialTab, onTabChange, pbFocus = null, onPbFocused }) {
  /* The sub-tab is addressable. It used to be purely local, which meant the five
     views under this product had no URL — you could not link the Playbook, and
     the landing page's nav had four labels that all did the same thing. It still
     lives here rather than in App: only this component knows which ids are valid,
     and an id from the radar's set must not select anything. */
  const [tab, setTabRaw] = useState(() => (SUBTABS.some(([id]) => id === initialTab) ? initialTab : "screener"));
  const setTab = (id) => { setTabRaw(id); if (onTabChange) onTabChange(id); };
  // the drawer's "Open in Playbook" lands here: switch tabs, then let the view
  // consume the ticker and clear it so a later tab visit doesn't re-select it
  useEffect(() => { if (pbFocus) setTab("playbook"); }, [pbFocus]);
  const [sectorF, setSectorF] = useState(null);   // sector filter set from the Market Map

  const buyCount = rows.filter((s) => s.status === "buy").length;
  const leaders = rows.filter((s) => (s.score || 0) >= 80).length;

  const isLive = live.status === "live";
  const meta = isLive
    ? `Prices ${live.source ? `via ${live.source}` : ""} (delayed) · as of ${fmtAsOf(live.asOf)} · ${live.count}/${live.total}`
    : live.status === "loading"
      ? "Connecting to data feed…"
      : "Demo prices · not live";
  const dotColor = isLive ? "var(--accent)" : live.status === "loading" ? "var(--accent)" : "var(--sev-extreme)";

  return (
    <>
      <div className="hero">
        <div className="hero-glow" />
        <div className="wrap hero-row">
          <div className="hero-left">
            <div className="hero-eyebrow mono"><span className="hero-pulse" style={{ background: dotColor }} />{isLive ? "Live relative-strength leadership" : "Relative-strength leadership"}</div>
            <h1 className="hero-title">Leadership Screener<InfoDot text="The full S&P 500 ranked on real relative strength, stage, and breakout quality — the market's leaders surface first, with a buy-point read on every name." /></h1>
            <span className="hero-meta" style={!isLive && live.status !== "loading" ? { color: "var(--sev-extreme)" } : undefined}>{meta}</span>
          </div>
          <div className="hero-signals">
            <span className="hero-badge" style={{ "--accent": "var(--cat-growth)", color: "var(--cat-growth)" }}>
              <span className="pulse" style={{ background: "var(--cat-growth)" }} />{buyCount} in buy zone</span>
            <span className="hero-badge">{leaders} A-grade leaders</span>
          </div>
        </div>
      </div>

      <div className="statstrip statstrip-card">
        <div className="wrap">
          <div className="statgrid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
            {market ? (
              <>
                <div className="statcell reveal" data-soon={market.trend === "Confirmed Uptrend"} data-tone={market.trend === "Confirmed Uptrend" ? "good" : market.trend === "Market In Correction" ? "bad" : "warn"} style={{ "--i": 0 }}>
                  <div className="lab">Market Trend</div>
                  <div className="val" style={{ fontSize: 18, color: market.trend === "Confirmed Uptrend" ? "var(--cat-growth)" : market.trend === "Market In Correction" ? "var(--sev-extreme)" : "var(--sev-high)" }}>{market.trend}</div>
                  <div className="tm mono">{market.trend === "Confirmed Uptrend" ? "buying permitted" : "risk management first"}</div>
                </div>
                <div className="statcell reveal" data-tone={market.distDays <= 3 ? "good" : market.distDays <= 5 ? "warn" : "bad"} style={{ "--i": 1 }}><div className="lab">Distribution Days</div><div className="val">{market.distDays}</div><div className="tm mono">S&amp;P · rolling 25-session</div></div>
                <div className="statcell reveal" data-tone="info" style={{ "--i": 2 }}><div className="lab">Last Power Day</div><div className="val">{(market.lastFTD || "—").toUpperCase()}</div><div className="tm mono">1.25%+ gain on volume</div></div>
                <div className="statcell reveal" data-tone={market.breadth.newHighs > market.breadth.newLows ? "good" : market.breadth.newLows > market.breadth.newHighs ? "bad" : "info"} style={{ "--i": 3 }}><div className="lab">New Highs / Lows</div><div className="val">{market.breadth.newHighs} / {market.breadth.newLows}</div><div className="tm mono">tracked universe ({market.breadth.n})</div></div>
              </>
            ) : (
              <>
                <div className="statcell reveal" style={{ "--i": 0 }}><div className="lab">Market Trend</div><div className="val" style={{ fontSize: 18 }}>—</div><div className="tm mono">awaiting live data</div></div>
                <div className="statcell reveal" style={{ "--i": 1 }}><div className="lab">Distribution Days</div><div className="val">—</div><div className="tm mono">rolling 25-session</div></div>
                <div className="statcell reveal" style={{ "--i": 2 }}><div className="lab">Last Power Day</div><div className="val">—</div><div className="tm mono">1.25%+ gain on volume</div></div>
                <div className="statcell reveal" style={{ "--i": 3 }}><div className="lab">New Highs / Lows</div><div className="val">—</div><div className="tm mono">tracked universe</div></div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="wrap">
        <div className="subnav">
          {SUBTABS.map(([id, l]) => (
            <button key={id} className="subtab" data-active={tab === id} onClick={() => setTab(id)}>{l}
              {id === "portfolio" && posRows.length > 0 && <span className="subtab-n mono">{posRows.length}</span>}</button>
          ))}
        </div>
      </div>

      <div key={tab}>
        {tab === "screener" && <Screener rows={rows} onOpenStock={onOpenStock} onLookup={onLookup} lookupBusy={lookupBusy} lookupErr={lookupErr}
          sectorF={sectorF} onClearSector={() => setSectorF(null)} changes={changes} ext={ext} onLoadExt={onLoadExt} />}
        {tab === "map" && <MarketMap rows={rows} live={live} onOpenStock={onOpenStock}
          onSelectSector={(s) => { setSectorF(s); setTab("screener"); }} sectors={sectors} />}
        {tab === "health" && <MarketHealth market={market} />}
        {tab === "playbook" && <PlaybookView rows={rows} onOpenStock={onOpenStock}
          onLookup={onLookup} lookupBusy={lookupBusy} lookupErr={lookupErr}
          focusTk={pbFocus} onFocused={onPbFocused} />}
        {tab === "portfolio" && <PortfolioView rows={posRows} onOpenStock={onOpenStock} events={events} vix={vix} />}
      </div>
    </>
  );
}
