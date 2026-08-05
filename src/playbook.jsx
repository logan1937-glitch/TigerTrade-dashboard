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
import { useEffect, useMemo, useState } from "react";
import { launchpad, LAUNCHPAD_MAX_SPREAD, emaSpreadOf } from "./signals.js";
import { useStored } from "./store.js";

const px2 = (v) => (v == null ? "—" : `$${(+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v, dp = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`);
const num = (v, dp = 2) => (v == null ? "—" : (+v).toFixed(dp));
const usd = (v) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`);

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
    test: (r) => { const s = emaSpreadOf(r); return s != null && s <= LAUNCHPAD_MAX_SPREAD; },
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

function CxMark({ cx, imp }) {
  const { tier, label, note } = cxTier(cx);
  const title = `${note}${cx != null ? ` (ratio ${cx.toFixed(2)})` : ""}`
    + `${imp != null ? ` · prior 20-day move ${pct(imp, 1)}` : ""}`;
  return (
    <span className="pb-cx" data-tier={tier ?? undefined} title={title}>
      <i /><i /><i />
      <span className="pb-cx-l mono">{label}</span>
    </span>
  );
}

export function PlaybookView({ rows = [], onOpenStock }) {
  const [on, setOn] = useStored("tt_pb_filters", { coiled: false, tight: false, stacked: false, liquid: false, noern: false });
  const [sort, setSort] = useStored("tt_pb_sort", "cx");
  // The method leads on the FIRST visit, then gets out of the way. A tool that
  // reopens its own manual every time is a tool you stop reading — and at 1500px
  // the panel pushed the scan itself below the fold.
  const [seen, setSeen] = useStored("tt_pb_seen", false);
  const [help, setHelp] = useState(!seen);
  useEffect(() => { if (!seen) setSeen(true); }, [seen, setSeen]);
  const [sel, setSel] = useState(null);

  // only names with the swing block computed — a row we cannot measure has no
  // business in a setup scan
  const base = useMemo(() => rows.filter((r) => r.sig && r.sig.swing && r.sig.swing.atr != null), [rows]);
  const activeFilters = FILTERS.filter((f) => on[f.id]);

  const list = useMemo(() => {
    const kept = base.filter((r) => activeFilters.every((f) => f.test(r)));
    const s = SORTS.find((x) => x.id === sort) || SORTS[0];
    return [...kept].sort((a, b) => s.val(a) - s.val(b));
  }, [base, on, sort]);

  // per-filter counts, each measured on the FULL set so a chip always shows how
  // many names that one condition would keep — not how many survive the others
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, base.filter(f.test).length])), [base]);
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
        {" · "}sorted by <b>{sortDef.label}</b> ({sortDef.desc})
      </p>

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
              <span>Contraction</span><span style={{ textAlign: "right" }}>ATR 14</span>
              <span style={{ textAlign: "right" }}>Stop</span>
            </div>
            <div className="pb-rows">
              {list.map((r) => {
                const s = r.sig.swing;
                const isOn = active && r.tk === active.tk;
                return (
                  <div className="pb-row pb-drow" key={r.tk} data-on={isOn || undefined} role="button" tabIndex={0}
                    aria-label={`${r.tk} — show levels`} onClick={() => setSel(r.tk)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSel(r.tk); } }}>
                    <div className="pb-tk"><span className="cs-sym">{r.tk}</span><span className="cs-name">{r.name}</span></div>
                    <div className="pb-num mono">{px2(r.px)}
                      {r.chg != null && <span className="pb-sub2 mono" data-up={r.chg >= 0}>{pct(r.chg)}</span>}</div>
                    <div><CxMark cx={s.cx} imp={s.imp} /></div>
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

          <div className="pb-detail">
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
          measured against the last 40. That ratio is the <i>Contraction</i> column, and the three
          bars fill as it drops — Easing (≤0.80), Coiling (≤0.55), Tight (≤0.35).</li>
        <li><b>Averages coiled.</b> The 21, 50 and 65-day EMAs converge inside {LAUNCHPAD_MAX_SPREAD}%
          of each other — the <i>EMA Launchpad</i>. Every timeframe agrees on price, so a resolution
          out of it tends to be decisive.</li>
        <li><b>A level where it fails.</b> The <i>Stop</i> is a Chandelier Exit: the 22-day highest
          high less 3 × ATR(14). It is arithmetic, not an order, and it defines the risk per share
          the sizing box on the right divides into.</li>
      </ol>

      <div className="pb-help-cols">
        <div>
          <div className="pb-help-sh mono">Columns</div>
          <dl className="pb-defs">
            <dt>Price</dt><dd>last quote, with the day's change beneath</dd>
            <dt>Contraction</dt><dd>10-day ÷ 40-day range. Hover for the ratio and the prior move</dd>
            <dt>ATR 14</dt><dd>Wilder's average true range, in dollars, with % of price beneath</dd>
            <dt>Stop</dt><dd>the trailing level, with its distance from price beneath</dd>
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
  const { label: cxLabel, note: cxNote } = cxTier(s.cx);
  const riskPct = s.stop != null && row.px ? ((row.px - s.stop) / row.px) * 100 : null;

  return (
    <>
      <div className="pb-dhead">
        <div>
          <div className="pb-dsym"><span className="dr-sym">{row.tk}</span>
            {spread != null && spread <= LAUNCHPAD_MAX_SPREAD && <span className="badge badge-cat" style={{ "--c": "var(--accent)" }}>Launchpad</span>}
            {row.ern && row.ern.days <= ERN_BLACKOUT_DAYS && (
              <span className="badge badge-cat" style={{ "--c": "var(--sev-high)" }}
                title={`Reports ${row.ern.date} — a print gaps through trailing stops`}>E−{row.ern.days}</span>)}</div>
          <h3 className="pb-dname">{row.name}</h3>
          <div className="pb-dpx"><span className="dr-px mono">{px2(row.px)}</span>
            {row.chg != null && <span className="dr-chg mono" data-up={row.chg >= 0}>{pct(row.chg)}</span>}
            <span className="dr-grp mono">{row.sector}</span></div>
        </div>
        {onOpenStock && <button className="ed-btn" onClick={() => onOpenStock(row)}>Full analysis →</button>}
      </div>

      <div className="pb-tiles">
        <Tile k="ATR (14)" v={num(s.atr)} s={s.atrPct != null ? `${s.atrPct.toFixed(2)}% of price` : "—"} />
        {/* a Chandelier stop ABOVE the price is a real state, not a glitch — the
            name has fallen far enough off its 22-day high that the trail is
            already breached. Say that rather than printing a negative distance. */}
        <Tile k="Trailing stop" v={px2(s.stop)}
          s={riskPct == null ? "—" : riskPct >= 0 ? `${riskPct.toFixed(1)}% below price` : `${Math.abs(riskPct).toFixed(1)}% above — breached`}
          title="Chandelier Exit (long): the 22-day highest high less 3 × ATR(14). An arithmetic level, not an order." />
        <Tile k="Contraction" v={cxLabel} s={s.cx != null ? `ratio ${s.cx.toFixed(2)}` : "—"} title={cxNote} />
        <Tile k="Impulse" v={pct(s.imp, 1)} s="prior 20-day move" title="The advance a contraction is only meaningful after." />
      </div>

      <div className="pb-emas">
        <div className="pb-ema-h mono">EMA Launchpad
          <span className="pb-ema-sp mono" data-on={spread != null && spread <= LAUNCHPAD_MAX_SPREAD ? "" : undefined}>
            {spread == null ? "not measurable" : `${spread.toFixed(2)}% spread`}</span>
        </div>
        <EmaBar row={row} />
        <div className="pb-ema-rows">
          {[["21-day EMA", s.e21], ["50-day EMA", s.e50], ["65-day EMA", s.e65]].map(([k, v]) => (
            <div className="pb-ema-row" key={k}><span className="pb-ema-k mono">{k}</span><span className="pb-ema-v mono">{px2(v)}</span></div>
          ))}
        </div>
        <p className="pb-note mono">
          The three averages are {spread == null ? "not all computable for this name"
            : spread <= LAUNCHPAD_MAX_SPREAD
              ? `within ${LAUNCHPAD_MAX_SPREAD}% of each other — coiled`
              : `${spread.toFixed(2)}% apart, wider than the ${LAUNCHPAD_MAX_SPREAD}% Launchpad threshold`}.
        </p>
      </div>

      <Sizing px={row.px} stop={s.stop} />

      <div className="pb-chart">
        {row.spark && row.spark.length > 1 && !row._synthetic
          ? <><Sparkline data={row.spark} stop={s.stop} />
              <span className="pb-chart-l mono">Daily closes · dotted line is the window's open, dashed red the
                Chandelier stop · full interactive chart in the stock drawer</span></>
          : <span className="pb-chart-l mono">No price series for this name yet.</span>}
      </div>
    </>
  );
}

/* Turns the stop into a share count. Pure arithmetic on numbers you enter —
   risk budget ÷ distance to the stop — which is the one step that makes a level
   actionable. It sizes nothing on its own and recommends nothing. */
function Sizing({ px, stop }) {
  const [cfg, setCfg] = useStored("tt_pb_risk", { account: 25000, riskPct: 1 });
  const account = +cfg.account || 0;
  const riskPct = +cfg.riskPct || 0;
  const dist = stop != null && px != null ? px - stop : null;
  const ok = dist != null && dist > 0 && account > 0 && riskPct > 0;
  const budget = ok ? (account * riskPct) / 100 : null;
  const shares = ok ? Math.floor(budget / dist) : null;
  const value = ok && shares ? shares * px : null;

  return (
    <div className="pb-size">
      <div className="pb-ema-h mono">Position sizing
        <span className="pb-ema-sp mono">risk budget ÷ distance to stop</span>
      </div>
      <div className="pb-size-in">
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
            <Tile k="Risk / share" v={px2(dist)} s={`${((dist / px) * 100).toFixed(1)}% of price`} />
            <Tile k="Risk budget" v={usd(budget)} s={`${riskPct}% of ${usd(account)}`} />
            <Tile k="Shares" v={shares ? shares.toLocaleString() : "0"} s="rounded down" />
            <Tile k="Position" v={usd(value)} s={value ? `${((value / account) * 100).toFixed(0)}% of account` : "—"} />
          </div>
          {value > account && (
            <p className="pb-note mono">That position is larger than the account — this stop is tight
              enough that a {riskPct}% risk implies more shares than you can hold unlevered.</p>
          )}
        </>
      ) : (
        <p className="pb-note mono">
          {dist != null && dist <= 0
            ? "The trailing stop sits above price — it is already breached, so there is no long-side risk distance to size against."
            : "Enter an account size and a risk percentage to size this against the stop."}
        </p>
      )}
    </div>
  );
}

const Tile = ({ k, v, s, title }) => (
  <div className="pb-tile" title={title}>
    <span className="pb-tk2 mono">{k}</span><span className="pb-tv">{v}</span><span className="pb-ts mono">{s}</span>
  </div>
);

/* the three EMAs on one axis — the visual the spread number describes */
function EmaBar({ row }) {
  const { e21, e50, e65 } = row.sig.swing;
  if (e21 == null || e50 == null || e65 == null) return null;
  const vals = [e21, e50, e65], lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const padded = (v) => 8 + ((v - lo) / span) * 84;      // keep the end dots inside the track
  return (
    <div className="pb-emabar">
      {[["21", e21], ["50", e50], ["65", e65]].map(([k, v]) => (
        <i key={k} style={{ left: `${padded(v)}%` }} data-k={k} title={`${k}-day EMA ${px2(v)}`} />
      ))}
      {row.px != null && row.px >= lo && row.px <= hi && <b style={{ left: `${padded(row.px)}%` }} title={`price ${px2(row.px)}`} />}
    </div>
  );
}

// Enlarged sparkline from the snapshot's sampled closes — real data, coarse by
// design; the drawer's PriceChart is the full-resolution view. It carries the
// Chandelier stop because that line is the whole argument of this tab: the shape
// only means something next to the level where it stops meaning something.
// A stop further than this below the low would flatten the price action into a
// band at the top of the box, so past it the line is dropped and the caption
// says the trail is that far away rather than drawing a misleading chart.
const STOP_MAX_DROP = 0.35;
function Sparkline({ data, stop }) {
  const n = data.length, W = 560, H = 92, padT = 8, padB = 10;
  const lo0 = Math.min(...data), hi0 = Math.max(...data);
  // a breached trail sits above price — it belongs on the chart just as much
  const showStop = stop != null && stop > lo0 * (1 - STOP_MAX_DROP) && stop < hi0 * 1.25;
  const lo = showStop ? Math.min(lo0, stop) : lo0;
  const hi = showStop ? Math.max(hi0, stop) : hi0;
  const span = hi - lo || 1;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => H - padB - ((v - lo) / span) * (H - padT - padB);
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = data[n - 1] >= data[0];
  const c = up ? "var(--cat-growth)" : "var(--sev-extreme)";
  const fmt = (v) => (v >= 1000 ? v.toFixed(0) : v.toFixed(2));
  return (
    <div className="pb-sparkwrap">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pb-spark" role="img"
        aria-label={`price from ${fmt(data[0])} to ${fmt(data[n - 1])}`}>
        {/* fill to the opening close, not the floor — the shaded area is the move */}
        <path d={`${d} L${W},${y(data[0])} L0,${y(data[0])} Z`} fill={c} opacity=".11" />
        <line x1="0" y1={y(data[0])} x2={W} y2={y(data[0])} stroke="var(--border-2)" strokeWidth="1"
          strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        {showStop && (
          <line x1="0" y1={y(stop)} x2={W} y2={y(stop)} stroke="var(--sev-extreme)" strokeWidth="1.25"
            strokeDasharray="6 4" opacity=".8" vectorEffect="non-scaling-stroke" />
        )}
        <path d={d} fill="none" stroke={c} strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* the scale, so the shape is readable as prices instead of a silhouette.
          A bound the stop set is already labelled by the stop marker — printing
          the same number twice reads as two different levels. */}
      {!(showStop && hi === stop) && <span className="pb-spark-ax" data-at="hi">{fmt(hi)}</span>}
      {!(showStop && lo === stop) && <span className="pb-spark-ax" data-at="lo">{fmt(lo)}</span>}
      {showStop && <span className="pb-spark-stop mono" style={{ top: `${(y(stop) / H) * 100}%` }}>stop {fmt(stop)}</span>}
    </div>
  );
}
