// ── Track record: what the LEADERS score actually did ────────────────────────
//
// A backtest is the easiest chart in finance to lie with, so this view is built
// on the assumption that a reader is right to be sceptical and should be given
// what they need to stay that way.
//
// THE LADDER IS THE HEADLINE, not the top bucket. One good bucket is what noise
// looks like when you go looking for it; five buckets descending in order is a
// claim that survives being checked. So the chart draws all five at equal
// prominence and the figure above it is the count of adjacent pairs that hold —
// "4 of 4" — rather than an adjective.
//
// THE BENCHMARK IS DRAWN, NOT DESCRIBED. Every bucket is plotted against the
// equal-weight universe line, because the question is not "did these names go
// up" (in a rising year, all of them did) but "did the RANKING separate them".
// SPY sits alongside as the investable alternative.
//
// THE CAVEATS ARE NOT A FOOTNOTE. They ship with the payload from
// `src/backtest.js` and render at full size above the fold on narrow screens,
// because the one that matters — survivorship — runs in the flattering
// direction and a reader who misses it will over-trust the number.
//
// NOTHING HERE IS COLOURED BY OUTCOME except the bucket bars, which are money
// moved and therefore take the P&L pair. The bucket LABELS rank by lightness,
// per the colour rule: a decile is an ordinal position, not a good-or-bad.

import { useEffect, useState } from "react";
import { NA } from "./components.jsx";

const pct = (v, dp = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(dp)}%`);
const BUCKET_LABEL = ["Top 20%", "2nd", "3rd", "4th", "Bottom 20%"];

export function TrackRecord() {
  const [data, setData] = useState({ status: "loading" });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/backtest");
        if (!r.ok) throw new Error(String(r.status));
        const j = await r.json();
        if (alive) setData(j);
      } catch (e) {
        // a failed fetch is stated, never a blank panel that reads as "no edge"
        if (alive) setData({ status: "error", reason: String((e && e.message) || e) });
      }
    })();
    return () => { alive = false; };
  }, []);

  const caveats = data.caveats || [];

  return (
    <div className="wrap tr">
      <div className="mm-sec-h">
        <h3>Does the score rank?</h3>
        <span className="dr-sec-sub mono">point-in-time · monthly rebalance · forward 1-month return</span>
      </div>

      <p className="tr-lede">
        Every month in the window, the whole tracked universe is scored using only the bars available
        <b> on that day</b>, sorted, and split into five equal groups. The chart is what each group did
        over the <b>next</b> month. If the score carries information, the groups come out in order.
      </p>

      {data.status === "loading" && <div className="tr-wait"><span className="cm-spin" />Loading the study…</div>}

      {data.status === "pending" && (
        <div className="tr-wait" data-settled="">
          The study has not been computed yet — it runs on its own nightly pass, after the snapshot.
          It is deliberately never computed on demand: a cold run is about 530 upstream fetches, and
          making a visitor wait for that would spend the night's data budget on one page view.
        </div>
      )}

      {(data.status === "error" || data.status === "insufficient") && (
        <div className="tr-wait" data-settled="">
          No study to show. {data.reason ? <>{data.reason}</> : "The nightly pass did not produce one."}
        </div>
      )}

      {data.status === "ok" && <Study d={data} />}

      {/* THE CAVEATS RENDER WHATEVER THE STATUS, including while loading. They
          are the part a reader needs in order to weigh the number, and showing
          them only alongside a good result is how a disclosure becomes
          decoration. */}
      {caveats.length > 0 && (
        <>
          <div className="mm-sec-h" style={{ marginTop: 26 }}>
            <h3>What this does not prove</h3>
            <span className="dr-sec-sub mono">read before the chart, not after</span>
          </div>
          <dl className="tr-caveats">
            {caveats.map(([k, v]) => (
              <span key={k}><dt>{k}</dt><dd>{v}</dd></span>
            ))}
          </dl>
        </>
      )}
    </div>
  );
}

function Study({ d }) {
  const vals = d.byBucket.map((b) => b.ret).filter((v) => v != null);
  const refs = [d.uni, d.spy].filter((v) => v != null);
  const lo = Math.min(0, ...vals, ...refs), hi = Math.max(0, ...vals, ...refs);
  const span = (hi - lo) || 1;
  // one shared scale for bars and benchmark lines, or the comparison is a lie
  const y = (v) => `${((hi - v) / span) * 100}%`;
  const zero = y(0);

  return (
    <>
      <div className="tr-kpis">
        {/* The count of adjacent pairs in order. This is the headline because it
            is the only figure here that a single lucky bucket cannot produce. */}
        <div className="tr-kpi">
          <span className="tr-kpi-k">Groups in order</span>
          <span className="tr-kpi-v mono">{d.monotone} <i>of {d.monotonePairs}</i></span>
          <span className="tr-kpi-s">each group below the one above it</span>
        </div>
        <div className="tr-kpi">
          <span className="tr-kpi-k">Top minus bottom</span>
          <span className="tr-kpi-v mono">{d.spread == null ? <NA why="Needs a return for both the top and bottom group" /> : `${d.spread >= 0 ? "+" : "−"}${Math.abs(d.spread).toFixed(2)}pp`}</span>
          <span className="tr-kpi-s">per month, gross of everything</span>
        </div>
        <div className="tr-kpi">
          <span className="tr-kpi-k">Top group beat the field</span>
          <span className="tr-kpi-v mono">{d.topBeats} <i>of {d.topBeatsOf}</i></span>
          <span className="tr-kpi-s">months, vs an equal-weight hold</span>
        </div>
        <div className="tr-kpi">
          <span className="tr-kpi-k">Sample</span>
          <span className="tr-kpi-v mono">{d.rebalances} <i>mo</i></span>
          <span className="tr-kpi-s">{d.from} → {d.to}{d.covered ? ` · ${d.covered} names` : ""}</span>
        </div>
      </div>

      <div className="tr-chart">
        <div className="tr-bars" style={{ "--zero": zero }}>
          {d.byBucket.map((b, i) => {
            const v = b.ret;
            const up = v != null && v >= 0;
            const top = v == null ? zero : (up ? y(v) : zero);
            const height = v == null ? "0%" : `${(Math.abs(v) / span) * 100}%`;
            return (
              <div className="tr-bar" key={i} data-rank={i}
                title={`${BUCKET_LABEL[i] || `Group ${i + 1}`} by score · average forward month ${pct(v)} · ~${b.n} names`}>
                <div className="tr-bar-plot">
                  {v != null && <i data-up={up} style={{ top, height }} />}
                </div>
                <span className="tr-bar-v mono" data-up={v == null ? undefined : up}>{pct(v)}</span>
                <span className="tr-bar-k">{BUCKET_LABEL[i] || `Group ${i + 1}`}</span>
              </div>
            );
          })}
          {/* the two reference levels, on the same scale as the bars */}
          {d.uni != null && <i className="tr-ref" style={{ top: y(d.uni) }} data-k="uni"><b className="mono">field {pct(d.uni)}</b></i>}
          {d.spy != null && <i className="tr-ref" style={{ top: y(d.spy) }} data-k="spy"><b className="mono">SPY {pct(d.spy)}</b></i>}
        </div>
      </div>

      <p className="tr-note mono">
        Scored with the same code the board runs — <b>computeSignals</b>, <b>rsRatings</b> and
        <b> momentumScore</b>, imported rather than reimplemented, so this measures the model you are
        actually looking at. Each month's bars are sliced to that date before anything is computed, so
        no future bar can reach the scorer.
        {d.refused > 0 && <> {d.refused} of {d.universe} names were not served bars and are absent from the study.</>}
      </p>
    </>
  );
}
