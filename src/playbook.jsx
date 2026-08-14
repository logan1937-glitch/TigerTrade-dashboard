// ── Playbook ─────────────────────────────────────────────────────────────────
// Momentum swing setups, split-pane: a high-density scan on the left, the active
// name's levels on the right. Every figure comes from `sig.swing`, computed in
// signals.js from the same adjusted daily bars the rest of the terminal already
// pulls — so this whole view adds no vendor calls and rides in the nightly
// snapshot like everything else.
//
// The tab is meant to teach its own method, not just print numbers: FILTERS and
// SORTS below are the single source of truth for BOTH the controls and the "How
// to read this" panel, so the explanation can never drift from the code that
// actually runs. Adding a filter adds its own documentation by construction.
//
// Nothing here is a suggestion to trade. The stop is an arithmetic level with
// its inputs stated (Chandelier: 22-day high − 3·ATR), not advice, and a name
// with no computable metric shows "—" rather than a filled-in guess.
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon, Logo, NA, Chip, FigPct } from "./components.jsx";
import { isLaunchpad, LAUNCHPAD_MAX_SPREAD, emaSpreadOf, atrTrail, ATR_TRAIL_MULT } from "./signals.js";
import { useStored } from "./store.js";

const px2 = (v) => (v == null ? "—" : `$${(+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v, dp = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`);
const num = (v, dp = 2) => (v == null ? "—" : (+v).toFixed(dp));
const usd = (v) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);
/* The formatters above return a STRING dash, which is right where the value is
   spliced into a sentence. Where the value stands alone as the answer in a cell,
   it goes through this instead: same dash, but hoverable and carrying the name
   of the input that is missing. */
const val = (v, fmt, why) => (v == null ? <NA why={why} /> : fmt(v));

/* ── thresholds, named once ───────────────────────────────────────────────── */
export const TIGHT_MAX_CX = 0.55;        // "coiling or tighter"
export const LIQUID_MIN_DV = 20e6;       // $20M average daily dollar volume
export const ERN_BLACKOUT_DAYS = 7;      // a print inside a week voids a technical setup

/* Volatility contraction, as a visual marker. `cx` is the last 10 sessions'
   high-low range over the last 40 sessions' — below 1 means price is
   compressing. Three bars fill as the coil tightens. */
const CX_TIERS = [
  { max: 0.35, tier: 3, label: "Tight", note: "10-day range is under 35% of the 40-day range" },
  { max: TIGHT_MAX_CX, tier: 2, label: "Coiling", note: "10-day range is under 55% of the 40-day range" },
  { max: 0.80, tier: 1, label: "Easing", note: "10-day range is under 80% of the 40-day range" },
];
export function cxTier(cx) {
  if (cx == null) return { tier: null, label: "—", note: "Not enough history to measure contraction" };
  return CX_TIERS.find((t) => cx <= t.max) || { tier: 0, label: "Wide", note: "No contraction — the recent range is not tighter" };
}

/* ── the filters: what each one keeps, and why ─────────────────────────────
   `test` is the code; `desc` and `why` are what the help panel prints. They
   live on the same object so they cannot disagree. */
export const FILTERS = [
  {
    id: "coiled", label: "EMA Launchpad",
    desc: `21, 50 and 65-day EMAs all within ${LAUNCHPAD_MAX_SPREAD}% of each other`,
    why: "Three averages converging means every recent timeframe agrees on price. Moves out of that state tend to be decisive, in whichever direction they resolve.",
    test: (r) => isLaunchpad(r),
  },
  {
    id: "tight", label: "Tight only",
    desc: `contraction ratio at most ${TIGHT_MAX_CX} — "Coiling" or "Tight"`,
    why: "Range compression is the setup itself: supply drying up after a move. Below 0.55 the last two weeks are meaningfully quieter than the prior two months.",
    test: (r) => r.sig.swing.cx != null && r.sig.swing.cx <= TIGHT_MAX_CX,
  },
  {
    id: "stacked", label: "Trend stacked",
    desc: "price above the 21-day EMA, and 21 > 50 > 65",
    why: "Keeps the scan on the long side. A coil inside a downtrend is a pause in a decline, and it looks identical on the contraction measure alone.",
    test: (r) => {
      const { e21, e50, e65 } = r.sig.swing;
      return e21 != null && e50 != null && e65 != null && r.px != null
        && r.px > e21 && e21 > e50 && e50 > e65;
    },
  },
  {
    id: "liquid", label: "Liquid",
    desc: `at least ${LIQUID_MIN_DV / 1e6}M dollars of average daily volume`,
    why: "A tight range on thin volume is an absence of interest, not a coil — and the spread costs more than the setup is worth.",
    test: (r) => (r.sig.dollarVol ?? 0) >= LIQUID_MIN_DV,
  },
  {
    id: "noern", label: `No earnings ≤ ${ERN_BLACKOUT_DAYS}d`,
    desc: `excludes names reporting within ${ERN_BLACKOUT_DAYS} days`,
    why: "Reports gap through stops. The trailing level below assumes price moves continuously, and an earnings print is exactly when it doesn't.",
    test: (r) => !(r.ern && r.ern.days != null && r.ern.days <= ERN_BLACKOUT_DAYS),
  },
];

/* ── the sorts: every one states its direction ─────────────────────────────
   `val` is compared ascending, so negate anything that should read high-first. */
export const SORTS = [
  { id: "cx", label: "Contraction", desc: "tightest coil first — lowest 10-day ÷ 40-day range ratio",
    val: (r) => (r.sig.swing.cx == null ? Infinity : r.sig.swing.cx) },
  { id: "risk", label: "Risk to stop", desc: "smallest distance from price down to the trailing stop first",
    val: (r) => { const s = r.sig.swing; return s.stop != null && r.px ? (r.px - s.stop) / r.px : Infinity; } },
  { id: "atr", label: "ATR%", desc: "widest average daily range first, as a % of price",
    val: (r) => -(r.sig.swing.atrPct ?? -Infinity) },
  { id: "score", label: "Score", desc: "highest leadership score first",
    val: (r) => -(r.score ?? 0) },
];

/* The scan's coil cell. TWO measures, because "coiled" is two different things
   and a row showing only one sends you clicking to find the other: the bars are
   RANGE contraction (`cx`, the 10-day span over the 40-day), and the percentage
   beside them is EMA convergence — the spread across the 21/50/65, which is the
   figure the Launchpad filter actually tests. The spread was previously visible
   only after selecting the row, so the scan could not be scanned for it. */
function CxMark({ cx, imp, spread }) {
  const { tier, label, note } = cxTier(cx);
  const coiled = spread != null && spread <= LAUNCHPAD_MAX_SPREAD;
  const title = `${note}${cx != null ? ` (ratio ${cx.toFixed(2)})` : ""}`
    + `${imp != null ? ` · prior 20-day move ${pct(imp, 1)}` : ""}`
    + `${spread != null ? ` · EMAs ${spread.toFixed(2)}% apart${coiled ? " — inside the Launchpad" : ""}` : ""}`;
  return (
    <span className="pb-coil" title={title}>
      <span className="pb-cx" data-tier={tier ?? undefined}>
        <i /><i /><i />
        <span className="pb-cx-l mono">{label}</span>
      </span>
      {/* the same NA the rest of the app uses — a name whose EMAs are not all
          computable has no spread, and 0% would read as perfectly coiled */}
      <span className="pb-coil-sp mono" data-on={coiled || undefined}>
        {spread == null ? <NA why="An EMA spread needs all three of the 21, 50 and 65-day averages" />
          : `${spread.toFixed(2)}%`}
      </span>
    </span>
  );
}

export function PlaybookView({ rows = [], onOpenStock, onLookup, lookupBusy, lookupErr, focusTk, onFocused }) {
  const [q, setQ] = useState("");
  const [addSym, setAddSym] = useState("");
  const [on, setOn] = useStored("tt_pb_filters", { coiled: false, tight: false, stacked: false, liquid: false, noern: false });
  const [sort, setSort] = useStored("tt_pb_sort", "cx");
  // The method leads on the FIRST visit, then gets out of the way. A tool that
  // reopens its own manual every time is a tool you stop reading — and at 1500px
  // the panel pushed the scan itself below the fold.
  const [seen, setSeen] = useStored("tt_pb_seen", false);
  const [help, setHelp] = useState(!seen);
  useEffect(() => { if (!seen) setSeen(true); }, [seen, setSeen]);
  const [sel, setSel] = useState(null);
  // On a phone the panes stack and the detail is ordered ABOVE the scan (see
  // .pb-split's ≤880px rule — the same breakpoint, or the scroll fires on a
  // layout that never stacked), so tapping a row updates a panel you have scrolled
  // past. Bring it back rather than making you scroll up to find what you picked.
  const detailRef = useRef(null);
  const pick = (tk) => {
    setSel(tk);
    const el = detailRef.current;
    if (el && window.matchMedia("(max-width: 880px)").matches) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // only names with the swing block computed — a row we cannot measure has no
  // business in a setup scan
  const base = useMemo(() => rows.filter((r) => r.sig && r.sig.swing && r.sig.swing.atr != null), [rows]);
  const activeFilters = FILTERS.filter((f) => on[f.id]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const kept = base.filter((r) => activeFilters.every((f) => f.test(r)))
      .filter((r) => !needle || `${r.tk} ${r.name || ""} ${r.group || ""}`.toLowerCase().includes(needle));
    const s = SORTS.find((x) => x.id === sort) || SORTS[0];
    return [...kept].sort((a, b) => s.val(a) - s.val(b));
  }, [base, on, sort, q]);

  // per-filter counts, each measured on the FULL set so a chip always shows how
  // many names that one condition would keep — not how many survive the others
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, base.filter(f.test).length])), [base]);

  // Arriving from the drawer's "Open in Playbook". The name is only measurable if
  // it carries a swing block, and it will usually fail at least one active filter
  // — landing on a scan that does not contain the ticker you asked for reads as a
  // broken link, so the filters and the search box are cleared to make room for it.
  useEffect(() => {
    if (!focusTk) return;
    if (base.some((r) => r.tk === focusTk)) {
      setSel(focusTk);
      setQ("");
      setOn({ coiled: false, tight: false, stacked: false, liquid: false, noern: false });
    }
    if (onFocused) onFocused();
  }, [focusTk, base]);   // eslint-disable-line react-hooks/exhaustive-deps

  const active = useMemo(() => list.find((r) => r.tk === sel) || list[0] || null, [list, sel]);
  const sortDef = SORTS.find((x) => x.id === sort) || SORTS[0];

  return (
    <div className="wrap pb-wrap">
      <div className="pb-head">
        <div>
          <div className="pb-kicker mono">Momentum swing setups</div>
          <p className="pb-sub mono">
            Find a name that moved, then went quiet, with its moving averages coiled — and know
            where it stops working. <b>{base.length}</b> names measurable from the current snapshot.
          </p>
        </div>
        <button className="seg-btn pb-helpbtn" data-active={help || undefined} onClick={() => setHelp((v) => !v)}
          aria-expanded={help}>{help ? "Hide" : "How to read this"}</button>
      </div>

      {help && <HowToRead counts={counts} total={base.length} onClose={() => setHelp(false)} />}

      <div className="pb-find">
        <div className="search-wrap"><SearchIcon /><input className="search" placeholder="search ticker / group…"
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the scan" /></div>
        {onLookup && (
          /* Same lookup the screener uses. A name off the S&P 500 gets a full
             signal bundle from App's custom-ticker path, and the swing block
             rides along in it — so an added ticker is measurable here on the
             same arithmetic as everything else, not a second-class row. */
          <form className="cs-lookup" onSubmit={(e) => { e.preventDefault(); onLookup(addSym); setAddSym(""); }}
            title="Add any ticker, in the universe or not">
            <input className="search" style={{ width: 150, paddingLeft: 12 }} placeholder="add any ticker…"
              value={addSym} onChange={(e) => setAddSym(e.target.value)} aria-label="Add any ticker" />
            <button type="submit" className="seg-btn" data-active="true" disabled={lookupBusy}
              style={{ padding: "8px 12px" }}>{lookupBusy ? "…" : "＋ Add"}</button>
            {lookupErr && <span className="cs-lookup-err mono">{lookupErr}</span>}
          </form>
        )}
      </div>

      <div className="pb-filters">
        <span className="minwt-lab">Filter</span>
        {FILTERS.map((f) => (
          <button key={f.id} className="seg-btn pb-fchip" data-active={on[f.id] || undefined}
            onClick={() => setOn((p) => ({ ...p, [f.id]: !p[f.id] }))}
            title={`${f.desc}. ${f.why}`}>
            {f.label}<span className="pb-fn mono">{counts[f.id]}</span>
          </button>
        ))}
        {activeFilters.length > 0 && (
          <button className="linkbtn pb-clear" onClick={() => setOn({})}>clear</button>
        )}
        <span className="minwt-lab" style={{ marginLeft: "auto" }}>Sort</span>
        <div className="seg">
          {SORTS.map((s) => (
            <button key={s.id} className="seg-btn" data-active={sort === s.id} onClick={() => setSort(s.id)}
              title={s.desc}>{s.label}</button>
          ))}
        </div>
      </div>

      {/* always say exactly what is on screen and why — the filter state is the
          single most confusing thing about a screener */}
      <p className="pb-state mono">
        Showing <b>{list.length}</b> of <b>{base.length}</b>
        {activeFilters.length > 0
          ? <> · filtered by <b>{activeFilters.map((f) => f.label).join(" + ")}</b></>
          : <> · no filters applied</>}
        {q.trim() && <> · matching <b>{q.trim()}</b></>}
        {" · "}sorted by <b>{sortDef.label}</b> ({sortDef.desc})
      </p>

      {/* A search that eliminates everything is a different situation from a
          snapshot with no swing metrics, and it needs the ticker-add prompt —
          "not in the scan" is usually "not in the universe". */}
      {base.length > 0 && list.length === 0 && (
        <div className="empty" style={{ marginTop: 14 }}>
          Nothing matches{q.trim() ? <> <b>{q.trim()}</b></> : null}
          {activeFilters.length > 0 ? <> with {activeFilters.map((f) => f.label).join(" + ")} on</> : null}.
          {onLookup ? <> If the name isn't in the universe, add it with <b>＋ Add</b> above and it will be
            measured on the same arithmetic as everything else.</> : null}
        </div>
      )}

      {base.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          No swing metrics yet — they are computed from daily history in the nightly snapshot.
          If this stays empty, the snapshot didn't deliver signals; check <b>/api/snapshot</b>.
        </div>
      ) : (
        <div className="pb-split">
          <div className="pb-scan">
            <div className="pb-row pb-hrow mono">
              <span>Ticker</span><span style={{ textAlign: "right" }}>Price</span>
              <span title="Range contraction as three bars, EMA spread as a percentage">Coil</span>
              <span style={{ textAlign: "right" }}>ATR 14</span>
              <span style={{ textAlign: "right" }}>Stop</span>
            </div>
            <div className="pb-rows">
              {list.map((r) => {
                const s = r.sig.swing;
                const isOn = active && r.tk === active.tk;
                return (
                  <div className="pb-row pb-drow" key={r.tk} data-on={isOn || undefined} role="button" tabIndex={0}
                    aria-label={`${r.tk} — show levels`} onClick={() => pick(r.tk)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r.tk); } }}>
                    <div className="pb-tk"><span className="cs-sym">{r.tk}</span>
                      <span className="cs-name" title={r.name}>{r.name}</span></div>
                    <div className="pb-num mono">{px2(r.px)}
                      {r.chg != null && <span className="pb-sub2 mono" data-up={r.chg >= 0}>{pct(r.chg)}</span>}</div>
                    <div><CxMark cx={s.cx} imp={s.imp} spread={emaSpreadOf(r)} /></div>
                    <div className="pb-num mono">{num(s.atr)}
                      {s.atrPct != null && <span className="pb-sub2 mono">{s.atrPct.toFixed(1)}%</span>}</div>
                    <div className="pb-num mono">{px2(s.stop)}
                      {s.stop != null && r.px != null && <span className="pb-sub2 mono">
                        {pct(((s.stop - r.px) / r.px) * 100, 1)}</span>}</div>
                  </div>
                );
              })}
              {list.length === 0 && (
                <p className="pb-empty mono">
                  Nothing passes {activeFilters.map((f) => f.label).join(" + ") || "the current filters"} right now.
                  That is a real reading, not missing data — every one of the {base.length} measurable
                  names was tested and none met it. Drop a filter to widen the scan.
                </p>
              )}
            </div>
          </div>

          <div className="pb-detail" ref={detailRef}>
            {active ? <Detail row={active} onOpenStock={onOpenStock} /> : (
              <p className="pb-empty mono">Select a name on the left.</p>
            )}
          </div>
        </div>
      )}

      <p className="pb-disc mono">
        Not financial advice. Information provided for educational and research purposes.
        Methodologies inspired by classic momentum and trend-following strategies.
      </p>
    </div>
  );
}

/* ── the playbook itself ──────────────────────────────────────────────────
   Written from FILTERS/SORTS so it describes the code that actually runs. */
function HowToRead({ counts, total, onClose }) {
  return (
    <div className="pb-help">
      <div className="pb-help-h">
        <span className="pb-help-t mono">The method</span>
        <button className="pb-x" onClick={onClose} aria-label="Hide the explainer">✕</button>
      </div>

      <ol className="pb-steps">
        <li><b>An impulse.</b> Something moved — the <i>Impulse</i> figure is the prior 20-day return.
          Contraction without a preceding advance is just a quiet stock.</li>
        <li><b>Then a contraction.</b> The range tightens: the last 10 sessions' high-low span
          measured against the last 40. That ratio is the three bars in the <i>Coil</i> column, and
          they fill as it drops — Easing (≤0.80), Coiling (≤0.55), Tight (≤0.35).</li>
        <li><b>Averages coiled.</b> The 21, 50 and 65-day EMAs converge inside {LAUNCHPAD_MAX_SPREAD}%
          of each other — the <i>EMA Launchpad</i>. Every timeframe agrees on price, so a resolution
          out of it tends to be decisive. That spread is the percentage under the bars in the{" "}
          <i>Coil</i> column, so both readings of "coiled" are on every row of the scan.</li>
        <li><b>A level where it fails.</b> The <i>Stop</i> column is a Chandelier Exit: the 22-day
          highest high less 3 × ATR(14). It is arithmetic, not an order. The sizing box divides your
          risk budget by a distance to a stop, and it lets you pick which one — the Chandelier level
          (where the setup is wrong, and which can sit <i>above</i> price on a name that has already
          broken it) or an <b>ATR trail</b> set a multiple of ATR(14) below the current price. The
          trail always has a width, so it sizes a name the Chandelier cannot, and it is the number a
          broker's trailing-stop field takes.</li>
      </ol>

      <div className="pb-help-cols">
        <div>
          <div className="pb-help-sh mono">Columns</div>
          <dl className="pb-defs">
            <dt>Price</dt><dd>last quote, with the day's change beneath</dd>
            <dt>Coil</dt><dd>two measures in one cell: the bars are range contraction (10-day ÷ 40-day),
              the percentage is the EMA spread the Launchpad filter tests. Hover for both</dd>
            <dt>ATR 14</dt><dd>Wilder's average true range, in dollars, with % of price beneath</dd>
            <dt>Stop</dt><dd>the trailing level, with its distance from price beneath</dd>
            <dt>Chart</dt><dd>the jade line is the breakout trigger (the most recent base high) and the
              amber one the Chandelier stop, so how far there is to go and how much is at risk are
              both on the picture. A level the snapshot did not compute is not drawn</dd>
          </dl>
        </div>
        <div>
          <div className="pb-help-sh mono">Filters — each keeps names where…</div>
          <dl className="pb-defs">
            {FILTERS.map((f) => (
              <span key={f.id}>
                <dt>{f.label} <span className="pb-defn mono">{counts[f.id]}/{total}</span></dt>
                <dd>{f.desc}. <span className="pb-why">{f.why}</span></dd>
              </span>
            ))}
          </dl>
        </div>
        <div>
          <div className="pb-help-sh mono">Sorts</div>
          <dl className="pb-defs">
            {SORTS.map((s) => (<span key={s.id}><dt>{s.label}</dt><dd>{s.desc}</dd></span>))}
          </dl>
          <div className="pb-help-sh mono" style={{ marginTop: 12 }}>What this is not</div>
          <p className="pb-why" style={{ margin: 0 }}>
            Not a buy list and not advice. Filters stack with AND — every active one must pass.
            Counts on the chips are measured against all {total} names, so they don't change as you
            stack filters. A name that can't be measured is dropped, never assumed to pass.
          </p>
        </div>
      </div>
    </div>
  );
}

function Detail({ row, onOpenStock }) {
  const s = row.sig.swing;
  const spread = emaSpreadOf(row);
  const coiled = spread != null && spread <= LAUNCHPAD_MAX_SPREAD;
  const { label: cxLabel, note: cxNote } = cxTier(s.cx);
  const riskPct = s.stop != null && row.px ? ((row.px - s.stop) / row.px) * 100 : null;

  /* Ordered as the decision is made, not as the data happens to sit in the
     object: WHO is this, IS IT COILED, what are the levels, what size, then the
     picture. The coil used to sit below the metrics bar, so the one thing this
     tab exists to find was the third thing you read. */
  return (
    <>
      <div className="pb-dhead">
        {/* same mark the stock drawer uses, so a name looks like itself in both */}
        <Logo ticker={row.tk} size={38} />
        <div className="pb-dhead-t">
          <div className="pb-dsym"><span className="dr-sym">{row.tk}</span>
            {/* caution, not the severity ramp: a report date ahead is a warning
                about gap risk, and it can never borrow red — red means money moved */}
            {row.ern && row.ern.days <= ERN_BLACKOUT_DAYS && (
              <Chip tone="caution" title={`Reports ${row.ern.date} — a print gaps through trailing stops`}>E−{row.ern.days}</Chip>)}</div>
          <h3 className="pb-dname">{row.name}</h3>
          <div className="pb-dpx"><span className="dr-px mono">{val(row.px, px2, "No quote for this name in the nightly snapshot")}</span>
            <span className="dr-chg mono" data-up={row.chg == null ? undefined : row.chg >= 0}><FigPct v={row.chg} /></span>
            <span className="dr-grp mono">{row.sector}</span></div>
        </div>
        <div className="pb-dhead-r">
          {/* PROMINENT, because it is the verdict the whole tab scans for. A
              `Chip` beside the ticker said the same thing at chip size and got
              lost between the symbol and an earnings warning. */}
          <span className="pb-status" data-on={coiled || undefined}
            title={spread == null ? "The EMA spread is not measurable for this name"
              : `The 21, 50 and 65-day EMAs span ${spread.toFixed(2)}% — the Launchpad threshold is ${LAUNCHPAD_MAX_SPREAD}%`}>
            <span className="pb-status-k mono">{spread == null ? "Coil" : coiled ? "Coiled" : "Not coiled"}</span>
            <span className="pb-status-v mono">
              {spread == null ? <NA why="An EMA spread needs all three of the 21, 50 and 65-day averages" />
                : `${spread.toFixed(2)}%`}</span>
          </span>
          {onOpenStock && <button className="ed-btn" onClick={() => onOpenStock(row)}>Full analysis →</button>}
        </div>
      </div>

      {/* ── Priority 2: the coil itself ───────────────────────────────────── */}
      <div className="pb-coilsec">
        <div className="pb-ema-h mono">EMA Launchpad
          <span className="pb-ema-sp mono">21 · 50 · 65-day convergence</span>
        </div>
        <EmaRibbon row={row} />
        {/* The three values on ONE line. They were three stacked rows, which is
            what made a convergence measure read as scattered text: the whole
            point is that these numbers are nearly the same, and stacking them
            spends 60px of height hiding it. */}
        <div className="pb-ema-vals mono">
          {[["21", s.e21], ["50", s.e50], ["65", s.e65]].map(([k, v]) => (
            <span className="pb-ema-val" key={k}><i>{k}d</i>{val(v, px2, `The ${k}-day EMA needs ${k} sessions of closes`)}</span>
          ))}
          <span className="pb-ema-val" data-px=""><i>price</i>{val(row.px, px2, "No quote for this name in the nightly snapshot")}</span>
        </div>
      </div>

      {/* ── Priority 3: the levels, one dense row ─────────────────────────── */}
      <div className="pb-tiles">
        <Tile k="ATR (14)" v={val(s.atr, (x) => num(x), "ATR(14) needs 14 true ranges of history")}
          s={s.atrPct != null ? `${s.atrPct.toFixed(2)}% of price` : "as a % of price, once ATR resolves"} />
        {/* a Chandelier stop ABOVE the price is a real state, not a glitch — the
            name has fallen far enough off its 22-day high that the trail is
            already breached. Say that rather than printing a negative distance. */}
        <Tile k="Trailing stop" v={val(s.stop, px2, "A Chandelier level needs a 22-day high and an ATR(14)")}
          s={riskPct == null ? "distance from price, once the level resolves" : riskPct >= 0 ? `${riskPct.toFixed(1)}% below price` : `${Math.abs(riskPct).toFixed(1)}% above — breached`}
          title="Chandelier Exit (long): the 22-day highest high less 3 × ATR(14). An arithmetic level, not an order." />
        <Tile k="Contraction" v={s.cx == null ? <NA why="The contraction ratio needs 40 sessions of high-low range" /> : cxLabel}
          s={s.cx != null ? `ratio ${s.cx.toFixed(2)}` : "10-day range ÷ 40-day range"} title={cxNote} />
        <Tile k="Impulse" v={val(s.imp, (x) => pct(x, 1), "The 20-day return needs 20 sessions of closes")}
          s="prior 20-day move" title="The advance a contraction is only meaningful after." />
      </div>

      {/* ── Priority 4 ────────────────────────────────────────────────────── */}
      <Sizing px={row.px} stop={s.stop} atr={s.atr} />

      <div className="pb-chart">
        {row.spark && row.spark.length > 1 && row._sparkReal
          ? <Sparkline data={row.spark} stop={s.stop} pivot={row.sig.pivot} px={row.px} />
          : <span className="pb-chart-l mono">No price series for this name yet.</span>}
      </div>
    </>
  );
}

/* Turns the stop into a share count. Pure arithmetic on numbers you enter —
   risk budget ÷ distance to the stop — which is the one step that makes a level
   actionable. It sizes nothing on its own and recommends nothing. */
/* Two stops, and they are not interchangeable — which is the whole reason this
   picks between them rather than quietly choosing one.

   The Chandelier (22-day high − 3·ATR) is anchored to where the name has BEEN.
   It is the setup's invalidation level, and it can sit above the current price:
   that means the trail is already breached, and there is then no long-side
   distance to size against. Sizing off it in that state is not conservative, it
   is undefined — which is why the box used to just stop.

   The ATR trail is anchored to where the name IS: `mult × ATR(14)` below the
   current price. It always has a positive width, so it always sizes, and it is
   the number a broker's trailing-stop field actually takes. The multiple is the
   same `tt_pf_atr` the portfolio uses, so a book sized here and monitored there
   agrees with itself. */
const BASES = [
  { id: "trail", label: "ATR trail",
    desc: (m) => `${m}× ATR(14) below the current price — the width you would set on a broker trailing stop`,
    note: "Sized against a stop that follows price. It has a width whenever ATR does, so this works on a name whose Chandelier level is already breached — but it is a risk figure, not a claim about where the setup fails." },
  { id: "chand", label: "Chandelier",
    desc: () => "22-day highest high − 3 × ATR(14) — the level that says the setup stopped working",
    note: "Sized against the level where the thesis is wrong, which is the stricter read. When it sits above price there is no long-side distance and nothing to size." },
];

function Sizing({ px, stop, atr }) {
  const [cfg, setCfg] = useStored("tt_pb_risk", { account: 25000, riskPct: 1 });
  // shared with the portfolio's trailing-stop column on purpose — one ATR
  // multiple per book, so the size you take here and the stop you watch there
  // are the same trade
  const [mult, setMult] = useStored("tt_pf_atr", ATR_TRAIL_MULT);
  const [basis, setBasis] = useStored("tt_pb_basis", "trail");

  const account = +cfg.account || 0;
  const riskPct = +cfg.riskPct || 0;
  const m = +mult > 0 ? +mult : ATR_TRAIL_MULT;
  const trail = atrTrail({ px, atr, mult: m });

  const def = BASES.find((b) => b.id === basis) || BASES[0];
  const dist = def.id === "trail" ? trail.dist : (stop != null && px != null ? px - stop : null);
  const level = def.id === "trail" ? trail.trail : stop;

  const ok = dist != null && dist > 0 && account > 0 && riskPct > 0;
  const budget = ok ? (account * riskPct) / 100 : null;
  const shares = ok ? Math.floor(budget / dist) : null;
  const value = ok && shares ? shares * px : null;

  return (
    <div className="pb-size">
      <div className="pb-ema-h mono">Position sizing
        <span className="pb-ema-sp mono">risk budget ÷ distance to stop</span>
      </div>

      {/* one inline toolbar: which stop, its multiple, the account and the risk —
          four controls on a single row rather than a stacked form */}
      <div className="pb-size-in">
        <span className="pb-size-seg">
          {BASES.map((b) => (
            <button key={b.id} className="seg-btn" data-active={basis === b.id} onClick={() => setBasis(b.id)}
              title={b.desc(m)}>{b.label}</button>
          ))}
        </span>
        {def.id === "trail" && (
          <label className="pb-size-lab mono">×ATR
            <input className="pb-size-f mono" style={{ width: 62 }} type="number" min="0.25" step="0.25" value={mult}
              onChange={(e) => setMult(e.target.value)} aria-label="ATR multiple for the trailing stop" /></label>
        )}
        <label className="pb-size-lab mono">Account
          <input className="pb-size-f mono" type="number" min="0" step="1000" value={cfg.account}
            onChange={(e) => setCfg((c) => ({ ...c, account: e.target.value }))} aria-label="Account size" /></label>
        <label className="pb-size-lab mono">Risk %
          <input className="pb-size-f mono" type="number" min="0" step="0.25" value={cfg.riskPct}
            onChange={(e) => setCfg((c) => ({ ...c, riskPct: e.target.value }))} aria-label="Risk percent per trade" /></label>
      </div>

      {ok ? (
        <>
          <div className="pb-size-out">
            <Tile k="Risk / share" v={px2(dist)}
              s={`${((dist / px) * 100).toFixed(1)}% of price`}
              title={def.desc(m)} />
            <Tile k="Stop level" v={px2(level)}
              s={def.id === "trail" ? `${m}× ATR under ${px2(px)}` : "22-day high − 3 × ATR"}
              title={def.id === "trail"
                ? "Where the trail sits right now. It ratchets up as price rises — a broker applies the width to the running peak, not to your entry."
                : "The Chandelier level. Arithmetic, not an order."} />
            {/* Zero here is a real answer, not a missing one — the risk budget
                does not cover a single share at this stop distance — so it stays
                a number and the sub-line says which. A dash would claim we could
                not measure it, which is the opposite of what happened. */}
            <Tile k="Shares" v={shares ? shares.toLocaleString() : "0"}
              s={shares ? "rounded down" : "budget < 1 share at this stop"} />
            <Tile k="Position" v={usd(value)} s={value ? `${((value / account) * 100).toFixed(0)}% of account` : "no shares to value"} />
          </div>
          <p className="pb-note mono">
            Risking <b>{usd(budget)}</b> ({riskPct}% of {usd(account)}) at <b>{px2(dist)}</b> a share.
            {" "}{def.note}
          </p>
          {value > account && (
            <p className="pb-note mono">That position is larger than the account — this stop is tight
              enough that a {riskPct}% risk implies more shares than you can hold unlevered.</p>
          )}
        </>
      ) : (
        <p className="pb-note mono">
          {def.id === "chand" && dist != null && dist <= 0
            ? <>The Chandelier level sits above price — already breached, so there is no long-side distance
              to size against. Switch to <b>ATR trail</b> to size on a stop measured down from the current
              price instead.</>
            : def.id === "trail" && trail.dist == null
              ? "No ATR for this name yet, so a trailing width cannot be measured."
              : "Enter an account size and a risk percentage to size this against the stop."}
        </p>
      )}
    </div>
  );
}

/* label on one line, value and its qualifier sharing the next. Three stacked
   lines made a four-metric bar 76px tall; the qualifier is what says whether the
   value can be trusted, so it belongs beside the number rather than under it. */
const Tile = ({ k, v, s, title }) => (
  <div className="pb-tile" title={title}>
    <span className="pb-tk2 mono">{k}</span>
    <span className="pb-tvrow"><span className="pb-tv">{v}</span><span className="pb-ts mono">{s}</span></span>
  </div>
);

/* THE COIL, drawn to a FIXED scale.

   The previous version normalised the three EMAs to their own min and max and
   spread them across 8%-92% of the track — so the dots sat in the same three
   places whether the averages were 0.1% apart or 10%, and the picture said
   nothing the number beside it had not already said. A convergence visual that
   cannot show convergence is decoration.

   The window is +/-3% of the middle EMA, fixed, so a tight coil renders as a
   tight cluster and a wide one spills toward the edges. The jade band is the
   Launchpad threshold at true scale, which makes the test literal: inside the
   band IS coiled. A spread too wide for +/-3% widens the window rather than
   clipping, and the end labels print whatever the window ended up being — the
   scale is never silently different from the one being read. */
const RIBBON_HALF = 3;
function EmaRibbon({ row }) {
  const { e21, e50, e65 } = row.sig.swing;
  if (e21 == null || e50 == null || e65 == null) {
    return <p className="pb-note mono">
      <NA why="The ribbon needs all three of the 21, 50 and 65-day EMAs" /> Not all three averages are
      computable for this name, so there is no convergence to draw.</p>;
  }
  const vals = [e21, e50, e65];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const mid = (lo + hi) / 2;
  const spread = ((hi - lo) / lo) * 100;
  const half = Math.max(RIBBON_HALF, spread * 0.72);
  // percent along the track for a price, centred on the middle EMA
  const pos = (v) => 50 + ((v / mid - 1) * 100 / half) * 50;
  const clamp = (n) => Math.max(0, Math.min(100, n));
  const bandL = clamp(pos(mid * (1 - LAUNCHPAD_MAX_SPREAD / 200)));
  const bandR = clamp(pos(mid * (1 + LAUNCHPAD_MAX_SPREAD / 200)));
  const coilL = clamp(pos(lo)), coilR = clamp(pos(hi));
  const coiled = spread <= LAUNCHPAD_MAX_SPREAD;
  const pxIn = row.px != null && Math.abs(row.px / mid - 1) * 100 <= half;

  return (
    <div className="pb-ribbon" data-on={coiled || undefined}>
      <div className="pb-ribbon-track">
        {/* the threshold at true scale — "inside this band" IS the Launchpad test */}
        <i className="pb-rb-band" style={{ left: `${bandL}%`, width: `${bandR - bandL}%` }}
          title={`The ${LAUNCHPAD_MAX_SPREAD}% Launchpad band`} />
        {/* the coil: the span the three averages actually occupy. A floor of 1.2%
            of the track so a very tight coil is still a visible mark rather than
            a zero-width rectangle that renders as nothing at all. */}
        <i className="pb-rb-coil" style={{ left: `${coilL}%`, width: `${Math.max(1.2, coilR - coilL)}%` }}
          title={`The 21, 50 and 65-day EMAs span ${spread.toFixed(2)}%`} />
        {[["21", e21], ["50", e50], ["65", e65]].map(([k, v]) => (
          <i key={k} className="pb-rb-tick" data-k={k} style={{ left: `${clamp(pos(v))}%` }}
            title={`${k}-day EMA ${px2(v)}`} />
        ))}
        {pxIn && <i className="pb-rb-px" style={{ left: `${clamp(pos(row.px))}%` }} title={`price ${px2(row.px)}`} />}
      </div>
      <div className="pb-ribbon-ax mono">
        <span>−{half.toFixed(1)}%</span>
        <span className="pb-rb-verdict" data-on={coiled || undefined}>
          {spread.toFixed(2)}% {coiled ? "inside" : "outside"} the {LAUNCHPAD_MAX_SPREAD}% band
        </span>
        <span>+{half.toFixed(1)}%</span>
      </div>
    </div>
  );
}

/* The price picture, with the two levels that decide whether the setup is worth
   anything drawn ON it: the breakout TRIGGER above and the trailing STOP below.
   A shape on its own is a silhouette; the same shape between two levels tells you
   how far there is to go and how much is at risk, which is the entire argument of
   this tab. It was 92px tall with one dashed line hugging the floor.

   Both lines are gated on a level the snapshot actually computed. The trigger is
   `sig.pivot` — the high of the most recent base — and is drawn only when the
   snapshot supplies it, never from the editorial curve in tt.js, because a
   fabricated buy point on a trading screen is the worst thing this file could
   render. A level far outside the window would flatten the price action into a
   band, so past that it is dropped and the caption says how far away it is
   instead of drawing a misleading chart. */
const LEVEL_MAX_DROP = 0.35;
function Sparkline({ data, stop, pivot, px }) {
  const n = data.length, W = 560, H = 150, padT = 10, padB = 12;
  const lo0 = Math.min(...data), hi0 = Math.max(...data);
  // a breached trail sits above price — it belongs on the chart just as much
  const showStop = stop != null && stop > lo0 * (1 - LEVEL_MAX_DROP) && stop < hi0 * 1.25;
  const showTrig = pivot != null && pivot > lo0 * (1 - LEVEL_MAX_DROP) && pivot < hi0 * 1.25;
  const lo = Math.min(lo0, showStop ? stop : Infinity, showTrig ? pivot : Infinity);
  const hi = Math.max(hi0, showStop ? stop : -Infinity, showTrig ? pivot : -Infinity);
  const span = hi - lo || 1;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => H - padB - ((v - lo) / span) * (H - padT - padB);
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = data[n - 1] >= data[0];
  const c = up ? "var(--cat-growth)" : "var(--sev-extreme)";
  const fmt = (v) => (v >= 1000 ? v.toFixed(0) : v.toFixed(2));
  // how far price has to travel to trigger — the number the trigger line exists
  // to make readable at a glance
  const toTrig = showTrig && px != null ? ((pivot - px) / px) * 100 : null;

  return (
    <>
      <div className="pb-sparkwrap">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pb-spark" role="img"
          aria-label={`price from ${fmt(data[0])} to ${fmt(data[n - 1])}`}>
          {/* fill to the opening close, not the floor — the shaded area is the move */}
          <path d={`${d} L${W},${y(data[0])} L0,${y(data[0])} Z`} fill={c} opacity=".11" />
          {/* The window's open used to be a third horizontal line. With a trigger
              and a stop on the chart it was one line too many, and it is the least
              informative of the three — the shaded fill already shows the move
              against it. */}
          {showTrig && (
            <line x1="0" y1={y(pivot)} x2={W} y2={y(pivot)} className="pb-lvl" data-k="trigger"
              vectorEffect="non-scaling-stroke" />
          )}
          {showStop && (
            <line x1="0" y1={y(stop)} x2={W} y2={y(stop)} className="pb-lvl" data-k="stop"
              vectorEffect="non-scaling-stroke" />
          )}
          <path d={d} fill="none" stroke={c} strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        {/* the scale, so the shape reads as prices instead of a silhouette. A bound
            a level already sets is labelled by that level's own chip — printing the
            same number twice reads as two different prices. */}
        {!(showStop && hi === stop) && !(showTrig && hi === pivot) && <span className="pb-spark-ax" data-at="hi">{fmt(hi)}</span>}
        {!(showStop && lo === stop) && !(showTrig && lo === pivot) && <span className="pb-spark-ax" data-at="lo">{fmt(lo)}</span>}
        {showTrig && (
          /* right-anchored, because the stop tag is left-anchored: the two levels
             can land within a few pixels of each other (a name well off its high
             puts the base high just under the trail) and two left-anchored tags
             then print on top of one another */
          <span className="pb-lvl-tag mono" data-k="trigger" style={{ top: `${(y(pivot) / H) * 100}%` }}>
            trigger {fmt(pivot)}{toTrig != null && <b>{toTrig >= 0 ? `${toTrig.toFixed(1)}% away` : "broken out"}</b>}
          </span>
        )}
        {showStop && (
          <span className="pb-lvl-tag mono" data-k="stop" style={{ top: `${(y(stop) / H) * 100}%` }}>
            stop {fmt(stop)}
          </span>
        )}
      </div>
      <span className="pb-chart-l mono">
        Daily closes from the nightly snapshot.
        {showTrig ? <> The jade line is the <b>breakout trigger</b> — the high of the most recent base.</>
          : <> No base high computed for this name, so no trigger line is drawn.</>}
        {showStop ? <> The amber line is the <b>Chandelier stop</b>, 22-day high − 3 × ATR.</>
          : <> The trailing stop is too far outside this window to plot.</>}
        {" "}Full interactive chart in the stock drawer.
      </span>
    </>
  );
}
