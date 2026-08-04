// ── Playbook ─────────────────────────────────────────────────────────────────
// Momentum swing setups, split-pane: a high-density scan on the left, the active
// name's levels on the right. Every figure comes from `sig.swing`, computed in
// signals.js from the same adjusted daily bars the rest of the terminal already
// pulls — so this whole view adds no vendor calls and rides in the nightly
// snapshot like everything else.
//
// Nothing here is a suggestion to trade. The stop is a arithmetic level with its
// inputs stated (Chandelier: 22-day high − 3·ATR), not advice, and a name with
// no computable metric shows "—" rather than a filled-in guess.
import { useMemo, useState } from "react";
import { launchpad, LAUNCHPAD_MAX_SPREAD, emaSpreadOf } from "./signals.js";

const px2 = (v) => (v == null ? "—" : `$${(+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v, dp = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`);
const num = (v, dp = 2) => (v == null ? "—" : (+v).toFixed(dp));

/* Volatility contraction, as a visual marker. `cx` is the last 10 sessions'
   high-low range over the last 40 sessions' — below 1 means price is
   compressing. Three bars fill as the coil tightens; the tier is also the
   sort key, so the tightest setups can be brought to the top. */
const CX_TIERS = [
  { max: 0.35, tier: 3, label: "Tight", note: "10-day range is under 35% of the 40-day range" },
  { max: 0.55, tier: 2, label: "Coiling", note: "10-day range is under 55% of the 40-day range" },
  { max: 0.80, tier: 1, label: "Easing", note: "10-day range is under 80% of the 40-day range" },
];
export function cxTier(cx) {
  if (cx == null) return { tier: null, label: "—", note: "Not enough history to measure contraction" };
  return CX_TIERS.find((t) => cx <= t.max) || { tier: 0, label: "Wide", note: "No contraction — the recent range is not tighter" };
}

function CxMark({ cx, imp }) {
  const { tier, label, note } = cxTier(cx);
  // a contraction only means something after a move, so the impulse is part of
  // the tooltip rather than a separate column the eye has to join up
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
  const [coiled, setCoiled] = useState(false);          // the EMA Launchpad toggle
  const [sort, setSort] = useState("cx");
  const [sel, setSel] = useState(null);

  // only names with the swing block computed — a row we cannot measure has no
  // business in a setup scan
  const base = useMemo(() => rows.filter((r) => r.sig && r.sig.swing && r.sig.swing.atr != null), [rows]);

  const list = useMemo(() => {
    const f = coiled ? launchpad(base) : base;
    const val = (r) => {
      const s = r.sig.swing;
      if (sort === "cx") return s.cx == null ? Infinity : s.cx;          // tightest first
      if (sort === "spread") return emaSpreadOf(r) ?? Infinity;
      if (sort === "atr") return -(s.atrPct ?? -Infinity);
      return -(r.score ?? 0);
    };
    return [...f].sort((a, b) => val(a) - val(b));
  }, [base, coiled, sort]);

  const active = useMemo(() => list.find((r) => r.tk === sel) || list[0] || null, [list, sel]);
  const nCoiled = useMemo(() => launchpad(base).length, [base]);

  return (
    <div className="wrap pb-wrap">
      <div className="pb-head">
        <div>
          <div className="pb-kicker mono">Momentum swing setups</div>
          <p className="pb-sub mono">
            Volatility contraction, 14-day ATR and its trailing stop, computed from adjusted
            daily bars. <b>{base.length}</b> names measurable · <b>{nCoiled}</b> on the EMA Launchpad.
          </p>
        </div>
        <div className="pb-controls">
          <button className="seg-btn pb-toggle" data-active={coiled || undefined} onClick={() => setCoiled((v) => !v)}
            title={`Keep only names whose 21/50/65-day EMAs sit within ${LAUNCHPAD_MAX_SPREAD}% of each other`}>
            EMA Launchpad {coiled ? "on" : "off"} <span className="pb-toggle-n mono">{nCoiled}</span>
          </button>
          <span className="minwt-lab">Sort</span>
          <div className="seg">
            {[["cx", "Contraction"], ["spread", "EMA spread"], ["atr", "ATR%"], ["score", "Score"]].map(([id, l]) => (
              <button key={id} className="seg-btn" data-active={sort === id} onClick={() => setSort(id)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {base.length === 0 ? (
        <div className="empty" style={{ marginTop: 18 }}>
          No swing metrics yet — they are computed from daily history in the nightly snapshot.
          If this stays empty, the snapshot didn't deliver signals; check <b>/api/snapshot</b>.
        </div>
      ) : (
        <div className="pb-split">
          {/* ── left: the scan ────────────────────────────────────────── */}
          <div className="pb-scan">
            <div className="pb-row pb-hrow mono">
              <span>Ticker</span><span style={{ textAlign: "right" }}>Price</span>
              <span>Contraction</span><span style={{ textAlign: "right" }}>ATR 14</span>
              <span style={{ textAlign: "right" }}>Stop</span>
            </div>
            <div className="pb-rows">
              {list.map((r) => {
                const s = r.sig.swing;
                const on = active && r.tk === active.tk;
                return (
                  <div className="pb-row pb-drow" key={r.tk} data-on={on || undefined} role="button" tabIndex={0}
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
                  No name currently has its 21/50/65-day EMAs within {LAUNCHPAD_MAX_SPREAD}% of each other.
                  That is a real reading, not a missing one — turn the Launchpad off to see the full scan.
                </p>
              )}
            </div>
          </div>

          {/* ── right: the active name ────────────────────────────────── */}
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
            {spread != null && spread <= LAUNCHPAD_MAX_SPREAD && <span className="badge badge-cat" style={{ "--c": "var(--accent)" }}>Launchpad</span>}</div>
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
        <Tile k="Prior 20-day move" v={pct(s.imp, 1)} s="the impulse before the coil" />
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

      <div className="pb-chart">
        {row.spark && row.spark.length > 1
          ? <><Sparkline data={row.spark} /><span className="pb-chart-l mono">Daily closes · full interactive chart in the stock drawer</span></>
          : <span className="pb-chart-l mono">No price series for this name yet.</span>}
      </div>
    </>
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

// enlarged sparkline from the snapshot's sampled closes — real data, coarse by
// design; the drawer's PriceChart is the full-resolution view
function Sparkline({ data }) {
  const n = data.length, W = 560, H = 92;
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const x = (i) => (i / (n - 1)) * W;
  const y = (v) => H - 6 - ((v - lo) / span) * (H - 14);
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const up = data[n - 1] >= data[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pb-spark" role="img" aria-label="price sparkline">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={up ? "var(--cat-growth)" : "var(--sev-extreme)"} opacity=".10" />
      <path d={d} fill="none" stroke={up ? "var(--cat-growth)" : "var(--sev-extreme)"} strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
