/* The front door. Hero treatment 1B — "the tape" — over the shared body from the
   Claude Design handoff.

   Two things about this page are not decoration.

   The CRDO row in the hero panel is the only place on the site where the
   product's governing rule is *shown* rather than asserted: four cells that
   cannot be measured, rendered through the same <NA> primitive the screener
   uses, each naming the input it is missing. A later polish pass will want to
   fill that row in with plausible numbers. It must not.

   And every illustrative figure on this page carries a DEMO — NOT LIVE label,
   because a marketing page that fabricates numbers to advertise not fabricating
   numbers is worth less than no page at all. */
import "./landing.css";
import { BrandMark, NA } from "./components.jsx";

/* The reference paints the Score column in P&L green. That breaks the rule the
   page exists to argue — green and red mean money moved, and a leadership score
   is not money. Score renders in --text, with --brand reserved for the top tier;
   the change column keeps --pl-up / --pl-down, because that one IS money moved.
   The side effect is that the change column now reads louder, which is right. */
const ROWS = [
  { tk: "AVGO", name: "Broadcom",         px: "312.40", chg: "+1.84%", up: true,  rs: "97", score: "94",
    d: "M0 22 L15 20 L30 21 L45 15 L60 16 L75 10 L90 11 L105 5 L120 3" },
  { tk: "NVDA", name: "NVIDIA",           px: "176.05", chg: "−0.62%", up: false, rs: "95", score: "91",
    d: "M0 20 L15 17 L30 19 L45 12 L60 14 L75 9 L90 13 L105 8 L120 9" },
  { tk: "HOOD", name: "Robinhood",        px: "98.71",  chg: "+3.10%", up: true,  rs: "93", score: "88",
    d: "M0 24 L15 22 L30 18 L45 19 L60 12 L75 13 L90 8 L105 6 L120 2" },
  // the argument of the page — see the file header
  { tk: "CRDO", name: "Credo Technology", missing: true },
  { tk: "ANET", name: "Arista Networks",  px: "141.88", chg: "+0.41%", up: true,  rs: "89", score: "82",
    d: "M0 18 L15 21 L30 16 L45 17 L60 11 L75 14 L90 10 L105 11 L120 7" },
];

const STEPS = [
  ["01", "Rank ~1,400 US names on relative strength"],
  ["02", "Filter to setups that are actually coiled"],
  ["03", "Size against a stop you chose, not one we assumed"],
];

const NOT = [
  ["No order routing", "Analysis only. Every level here is arithmetic, never an order."],
  ["No sign-up", "There is nothing to log into. Open it and it works."],
  ["No server-side state", "Watchlist, positions and settings live in your browser, on this device."],
  // this one states its REASON rather than just the absence, deliberately — it is
  // the only absence on the page a reader would otherwise assume is an oversight
  ["No options flow", "No retail feed carries the side of the trade, so we don’t infer one."],
];

const RULES = [
  ["Not enough history", <>The name is dropped from the filter, not passed through it</>],
  ["Feed is down", <>It says so, and names the likely cause — no skeleton pulsing forever</>],
  ["Date you typed", <>Tagged <span className="lp-tag">yours</span> everywhere, never as confirmed</>],
  ["Illustrative data", <span className="lp-demo-txt">Labelled DEMO — NOT LIVE, loudly</span>],
];

function Lockup({ sub }) {
  return (
    <span className="lp-lockup">
      <BrandMark />
      {sub}
    </span>
  );
}

function PanelRow({ r }) {
  if (r.missing) {
    return (
      <div className="lp-row" data-zebra="true">
        <div className="lp-cell-tk"><b>{r.tk}</b><span>{r.name}</span></div>
        <div className="lp-cell-px">
          <b><NA why="No quote for this name in the nightly snapshot" /></b>
          <span className="lp-dim">no quote</span>
        </div>
        <div className="lp-cell-rs"><NA why="RS is a percentile of return — this name has no measurable return to rank" /></div>
        <div className="lp-cell-tr lp-dim">insufficient history</div>
        <div className="lp-cell-sc"><NA why="The leadership score needs 200 sessions of history" /></div>
      </div>
    );
  }
  return (
    <div className="lp-row" data-zebra={r.tk === "NVDA" || undefined}>
      <div className="lp-cell-tk"><b>{r.tk}</b><span>{r.name}</span></div>
      <div className="lp-cell-px"><b>{r.px}</b><span data-up={r.up}>{r.chg}</span></div>
      <div className="lp-cell-rs">{r.rs}</div>
      <div className="lp-cell-tr">
        <svg viewBox="0 0 120 26" preserveAspectRatio="none" aria-hidden="true">
          {/* preserveAspectRatio="none" stretches the box, so without
              vector-effect the stroke distorts along with it */}
          <path d={r.d} fill="none" stroke="var(--brand)" strokeWidth="1.8"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="lp-cell-sc" data-top={+r.score >= 88 || undefined}>{r.score}</div>
    </div>
  );
}

export default function Landing({ mode = "dark", onEnter }) {
  const go = (e) => { if (e) e.preventDefault(); if (onEnter) onEnter(); };
  return (
    <div className="app lp" data-dir="obsidian" data-mode={mode} data-density="balanced"
      data-glow="on" data-motion="full" data-typeface="grotesk">

      <header className="topbar">
        <div className="brand">
          <BrandMark />
          <span className="brand-tx">
            <span className="brand-word"><span className="b1">Tiger</span><span className="b2">Trade</span></span>
            <span className="brand-sub mono">TERMINAL</span>
          </span>
        </div>
        <div className="topbar-spacer" />
        <nav className="lp-nav">
          {["Radar", "Screener", "Playbook", "Portfolio"].map((n) => (
            <a key={n} href="/terminal" onClick={go}>{n}</a>
          ))}
        </nav>
        <button className="lp-btn" data-kind="primary" onClick={go}>Open the terminal</button>
      </header>

      <section className="lp-hero">
        {/* anchored at 12%, not the app's --bg-grad at 80%: the right side of this
            hero is occupied by the panel, so the glow has to sit behind the text */}
        <div className="lp-hero-glow" aria-hidden="true" />
        <div className="lp-hero-grid">
          <div className="lp-hero-l">
            {/* states the cadence, and states it accurately — the snapshot is a
                nightly cron, so this must never animate as a streaming heartbeat */}
            <span className="lp-pill"><i /> Nightly, after the close</span>
            <h1 className="lp-h1">Two questions,<br />one board.</h1>
            <p className="lp-lede">
              What is about to move the tape, and who is already leading it. A catalyst radar and a
              seven-factor relative-strength screener sit in the same shell, so the macro calendar and
              the name you are sizing are never two tabs apart.
            </p>
            <ol className="lp-steps">
              {STEPS.map(([n, t]) => (
                <li key={n}><span className="lp-ord mono">{n}</span><span>{t}</span></li>
              ))}
            </ol>
            <div className="lp-btns">
              <button className="lp-btn" data-kind="primary" onClick={go}>Open the terminal</button>
              <button className="lp-btn" data-kind="secondary" onClick={go}>See the screener</button>
            </div>
          </div>

          <div className="lp-panel">
            {/* The label is its own strip rather than sharing the header row.
                Sharing it squeezed the column heads out of line with the data
                beneath them, and a column head that does not sit over its column
                is worse than none — this panel's whole job is to look like the
                board. */}
            <div className="lp-panel-h">
              <span className="lp-demo mono">DEMO — NOT LIVE</span>
            </div>
            <div className="lp-panel-labs mono">
              <span>Ticker</span><span>Price</span><span>RS · 1Y</span><span>Trend</span><span>Score</span>
            </div>
            {ROWS.map((r) => <PanelRow key={r.tk} r={r} />)}
          </div>
        </div>
      </section>

      <section className="lp-products">
        <div className="lp-prod">
          <div className="lp-eyebrow mono">Product 01</div>
          <h2 className="lp-h2">Volatility &amp; Momentum Radar</h2>
          <p className="lp-plede">
            The scheduled events that move cross-asset volatility, grouped into five regimes and ranked
            by weight. FOMC, CPI, quad witching, index reconstitution, the live economic calendar.
          </p>
          <ul className="lp-bul">
            <li><i />Radar, full timeline, month calendar, volume &amp; flow</li>
            <li><i />Historical reaction stats per event</li>
            <li><i />Projected dates carry a <span className="lp-tag">~</span> and say who projected them</li>
          </ul>
        </div>
        <div className="lp-prod">
          <div className="lp-eyebrow mono">Product 02</div>
          <h2 className="lp-h2">Leadership Screener</h2>
          <p className="lp-plede">
            A seven-factor relative-strength model over the tracked universe, extendable to roughly
            1,400 US names. Rank, then filter to what is actually set up, then size it.
          </p>
          <ul className="lp-bul">
            <li><i />Screener, market map, market health, playbook, portfolio</li>
            <li><i />EMA Launchpad, range compression, liquidity and earnings blackout filters</li>
            <li><i />Chandelier Exit and ATR trailing stops, with open risk netted honestly</li>
          </ul>
        </div>
      </section>

      <section className="lp-rule">
        <div className="wrap lp-rule-grid">
          <div>
            <div className="lp-eyebrow mono">The rule</div>
            <h2 className="lp-h2 lp-h2-big lp-balance">A plausible wrong number is worse than a blank</h2>
            <p className="lp-rlede">
              Most tools round a missing input to zero and move on. Zero is a measurement. It sorts, it
              ranks, it passes a filter, and it will put you in a trade you never would have taken.
              Every value here is real or it is a dash — and where a dash appears, the tooltip says
              which input is missing.
            </p>
          </div>
          <div className="lp-card">
            {RULES.map(([k, v]) => (
              <div className="lp-card-row" key={k}>
                <div className="lp-card-k mono">{k}</div>
                <div className="lp-card-v">{v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-not">
        <div className="wrap">
          <div className="lp-eyebrow mono">What it is not</div>
          <h2 className="lp-h2 lp-h2-big">No broker. No account. No opinion you didn’t ask for.</h2>
          <div className="lp-not-grid">
            {NOT.map(([t, b]) => (
              <div className="lp-not-card" key={t}>
                <div className="lp-not-t">{t}</div>
                <div className="lp-not-b">{b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="wrap lp-cta-row">
          <div>
            <h2 className="lp-h2 lp-h2-cta">Open it and look.</h2>
            <p className="lp-ctap">
              Nothing to install, nothing to sign. The board loads from a nightly precompute, so the
              first screen is already there.
            </p>
          </div>
          <div className="lp-btns">
            <button className="lp-btn lp-btn-lg" data-kind="primary" onClick={go}>Open the terminal</button>
            <button className="lp-btn lp-btn-lg" data-kind="secondary" onClick={go}>Read the model</button>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <div className="wrap lp-foot-row">
          <Lockup sub={<span className="lp-foot-n mono">TigerTrade Terminal</span>} />
          {/* kept word-for-word in step with disclaimer.jsx — two disclaimers that
              drift apart are worse than one */}
          <p className="lp-legal">
            Educational use only — not investment advice. TigerTrade is independent and not affiliated
            with, sponsored by, or endorsed by Investor’s Business Daily. Verify every figure against
            your broker before trading.
          </p>
        </div>
      </footer>
    </div>
  );
}
