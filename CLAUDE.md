# TigerTrade Terminal — working notes for Claude

A dark, institutional trading terminal: two products under one shell, switched
from the top bar. React 18 + Vite, no framework beyond that, deployed on Vercel
with serverless functions under `api/`.

1. **Volatility & Momentum Radar** — macro-catalyst surveillance. Views: Radar,
   Full Timeline, Calendar, Volume.
2. **Leadership Screener** — a relative-strength growth screener built on the
   TigerTrade Leadership Model (LEADERS). Views: Screener, Market Map, Market
   Health, Playbook, Portfolio.

## Commands

```bash
npm run dev            # vite dev server
npm run build          # production build → dist/
npm test               # both suites
npm run test:earnings  # 55 assertions against a stubbed Yahoo/Finnhub
npm run test:swing     # 66 assertions on the ATR/EMA/Launchpad/quote-building math
npm run shots          # screenshot every view headlessly → shots/
```

`npm run shots` is the visual-verification loop — see **Verifying UI changes**
below. It is the fastest way to know whether a CSS change did what you meant.

## The rule that governs everything: never fabricate data

This is a trading tool. A plausible-looking wrong number is worse than a blank.
Every figure on screen is real or absent — there is no third option, and no
placeholder that could be mistaken for a measurement.

- A value whose input is missing renders `—`, never `0`, never an estimate.
  **This has shipped five times now** — the stock tape, the screener's Δ column,
  the Volume tab's direction filter, Market Health's index rows, and `off52` in
  the signal engine. The pattern is always the same: a `|| 0` / `: 0` / `!!x` at
  a boundary turning "we don't know" into a definite reading. When you add a
  field, check what it renders as when its input is absent — and remember that
  `null <= 6` is **true** and `null >= 0` is **false**, so a null flows through
  comparisons as a confident answer in whichever direction hurts most.
- **An id that encodes a position is not an identity.** Live econ events were
  appended with `id: 1000 + i` — an index into a filtered, date-sorted slice of
  *today's* calendar — so tomorrow's `1003` was a different release. Anything
  persisted against one (a watchlist star) either resolved to the wrong event or
  to nothing. They are now `econ:<date>:<slug>`. The same rule applies to any id
  a user's stored state can point at: derive it from what the thing *is*.
- **`TT.EVENTS` is the curated template, `allEvents` is what the radar shows.**
  `mergeEcon` appends live releases that exist only in the merge, so anything
  resolving an event by id must use the merged list — `WatchlistBody` used
  `TT.EVENTS.find`, and every starred live release came back `undefined` and was
  dropped by a `.filter(Boolean)`, present in the badge count and nowhere else.
  Ids are compared with `String(...)`: curated ones are numbers, live ones are
  `econ:` keys, and `?ev=` deep links are always strings.
- **The session's change comes from `sig.chgD` (the adjusted daily bars), never
  from `quote.changePercentage`.** The quote field is a last price against a
  prior close — a different clock from the daily series — and it has twice been
  caught collapsing to null or 0.00 across the whole universe. `csData` sets
  `r.chg` from the bars for exactly this reason.
- A projected date carries `~` and a tooltip saying who projected it.
- A date the *user* typed carries a `yours` tag so it never reads as confirmed.
- Demo/illustrative data must be labelled loudly (`DEMO — NOT LIVE`).
- When a feed dies, say so and name the likely cause. Do **not** leave a loading
  skeleton pulsing — a skeleton claims data is coming, which is a lie once the
  load has settled. `feedSettled` in `App.jsx` exists exactly for this.

The one legitimate exception is `scripts/shots.mjs`, whose fixture is synthetic
by design and never reaches a user.

## Architecture

**Data flow.** `App.jsx` is the single source of truth; everything below it is
presentational.

```
/api/snapshot  ──►  live/meta/hist/market/changes/earnings/macro/vix  (App state)
     │                                   │
     │ (on failure)                      ▼
     └─►  per-ticker Yahoo/FMP      universe ──► csData ──► every view
                                                    │
                                    posRows ◄───────┘  (portfolio + calendar)
```

- `csData` (`App.jsx`) merges the editorial base, live quotes, EOD signals,
  earnings dates and user-set dates into one row per name. Views never fetch.
- **Two flags mark editorial price data, and they are not interchangeable.**
  `tt.js`'s `_buildFull` seeds every curated row with a seeded curve from
  `_series()`, which draws one of three canned shapes off `status` — so an
  uncovered name would render a chart that is not its own, identical to every
  other name with the same status. `_synthetic` governs the **`closes`/`volume`
  arrays** (the drawer's chart) and is cleared only where real bars are
  attached; `_sparkReal` governs the **spark** (the screener's Trend column and
  the Playbook's chart). Compact snapshot records carry a spark but *no* closes,
  so clearing `_synthetic` off the spark silently put the editorial curve back
  on the drawer's chart for every covered name.
- **`macro`, `vix`, `vol` and `earnings` are set in exactly one place** — inside
  the snapshot success branch. If the snapshot answers without them, nothing else
  ever fills them in. This is why a failing FMP quota blanks the macro board,
  the VIX panel *and* the S&P earnings dates simultaneously.
- **The snapshot is nightly, and it was the app's only quote fetch** — so every
  price on the page is as-of the last cron. The stock tape is the one exception:
  it refreshes its own ~14 names every 60s via `/api/yahoo` (never FMP) inside
  9:25–16:15 ET, holds them in `tapeQ` rather than merging into `live.quotes`,
  and carries its own clock. **That refresh fails in production unless
  `MASSIVE_PROXY_BULK=1`** — `/api/yahoo` goes through `bulkFetch`, which only
  routes via the residential proxy when that is set, and Yahoo rate-limits
  unkeyed calls from Vercel's datacenter IPs. When every symbol is refused the
  tape says so rather than quietly showing yesterday. `SHOTS_YAHOO_DOWN=1`
  reproduces it. That split is deliberate — refreshing 14 of 500
  rows would leave the screener with two price times and nothing saying which
  row had which. If you widen the refresh, widen the labelling with it.

**Swing math** (`signals.js` → `sig.swing`, shipped via `compactSig`). Computed
from the *same* adjusted daily bars the momentum signals already use, so the
Playbook costs **no extra vendor calls** — it rides in the nightly snapshot:

| Field | Definition |
|---|---|
| `atr` / `atrPct` | Wilder's ATR(14) — seeded on the mean of the first 14 true ranges, then smoothed at 1/14. Not an SMA of TR; that reads ~10% different on trending names. |
| `stop` | Chandelier Exit (long): 22-day highest high − 3 × ATR(14). An arithmetic level, never an order. It can sit *above* price — that means the trail is already breached, and the UI says so. |
| `e21` `e50` `e65` | Standard EMAs, each seeded with the SMA of its first `p` closes. |
| `emaSpread` | `(max − min) / min × 100` across the three. The **EMA Launchpad** keeps names ≤ 2% (`LAUNCHPAD_MAX_SPREAD`). Rounded to 4dp before comparing so an exact-2% boundary is decided by the number a user sees, not float error. |
| `cx` | 10-day high-low range ÷ 40-day range. Below 1 = compressing; the Playbook's three-bar marker tiers at 0.35 / 0.55 / 0.80. |
| `imp` | 20-day return — the impulse a contraction is only meaningful after. |

`atrTrail({px, cost, atr, mult})` (also `signals.js`) is the portfolio's stop.
The portfolio column shows the **trail width** — `belowPx` (percent of price) over
`dist` (points) — because those are the two numbers you set on a broker trailing
stop, which then applies them to the running peak of the holding period. The
level (`trail`), the move from your cost (`fromEntry`) and whether the trail has
ratcheted past entry (`locked`) are all computed too, and surface in the cell's
tooltip. Default `ATR_TRAIL_MULT` is 1.5, overridable per book via `tt_pf_atr`.
No cost basis → `fromEntry` is null, never substituted with the current price.

The Playbook's sizing box divides the risk budget by a distance to a stop, and
**which stop is a choice, because the two are not interchangeable.** The
Chandelier is anchored to where the name has *been* — it is the setup's
invalidation level and can sit *above* price, at which point there is no
long-side distance and sizing against it is undefined, not conservative. The ATR
trail is anchored to where the name *is* (`mult × ATR` below the last price), so
it always has a width and always sizes. Defaulting to one silently would answer
a different question than the user asked; the picker states both.

**Open risk** is the portfolio's headline number and it is NOT `shares × trail
width`. Once `peakSince` knows the peak the trail has already ratcheted, so the
real level is `peak − width` and the exposure from today's price is smaller than
the width — using the width alone would overstate risk on exactly the positions
that are working. A position whose trail already sits above price is counted as
**breached and excluded**, never netted: subtracting it from a healthy position's
risk would flatter the total. Sized positions with no ATR are counted as
`unmeasured` and said so, rather than silently treated as risking nothing.

`peakSince(bars, entryDate)` gives the high-water mark a trail actually follows.
A position carries an optional **`entry`** date; when set, `App.jsx` fetches that
holding's daily bars once per session (`/api/yahoo`, so no FMP quota) and the
portfolio shows how much room is left before the trail triggers, or `stop hit`.
An entry date later than every bar returns null rather than falling back to the
whole history's peak — that would understate the stop. Note off-universe
holdings already get a full signal bundle from `App.jsx`'s custom-ticker effect,
so ATR works for any holding; the bars fetch is separate because the peak needs
real `high` values, and mixing highs with closes would make the peak mean
different things for different rows.

Any of these is `null` when there isn't enough history. `launchpad()` **drops**
a name it can't measure rather than assuming it passes.

**The Playbook explains itself from its own source.** `FILTERS` and `SORTS` in
`playbook.jsx` each carry their `test`/`val` function *and* the `desc`/`why`
text the "How to read this" panel prints. They're one object, so the explainer
cannot drift from the code that runs — adding a filter adds its documentation by
construction. The `coiled` chip calls `isLaunchpad()` from `signals.js` rather than
re-implementing the spread test — `launchpad()` is the same predicate over a
list, and having two copies meant the tests covered the one the app never ran.
Thresholds are named exports (`LAUNCHPAD_MAX_SPREAD` 2%,
`TIGHT_MAX_CX` 0.55, `LIQUID_MIN_DV` $20M, `ERN_BLACKOUT_DAYS` 7). Filters stack
with AND; the chip counts are measured against the **full** measurable set, not
the post-filter one, so they don't move as you stack.

**The detail pane is ordered as the decision is made:** who is this → is it
coiled → what are the levels → what size → the picture. The coil used to sit
*below* the metrics bar, so the one thing this tab exists to find was the third
thing you read. Two related rules:

- **The EMA ribbon is drawn to a FIXED scale** (±3% of the middle EMA), and the
  jade band is the `LAUNCHPAD_MAX_SPREAD` threshold at that same scale, so
  "inside the band" *is* the test rather than an illustration of it. It used to
  normalise the three EMAs to their own min and max across 8–92% of the track —
  which put the dots in the same three places whether the averages were 0.1%
  apart or 10%. A convergence visual that cannot show convergence is decoration.
  A spread too wide for ±3% widens the window and the end labels print whatever
  the window became; the scale is never silently different from the one on screen.
- **The scan shows BOTH coils.** "Coiled" is two different measurements — `cx`
  (10-day range ÷ 40-day, the three bars) and the EMA spread (what the Launchpad
  filter actually tests) — and the spread used to appear only after selecting a
  row, so the scan could not be scanned for the thing it screens on.
- **The chart carries the trigger and the stop as explicit lines**, jade and
  amber. Neither may be red or green: a level is arithmetic, not money moved.
  The trigger is `sig.pivot` and is drawn **only when the snapshot computed it**
  — never from `tt.js`'s editorial curve, because a fabricated buy point is the
  worst thing this file could render. A level too far outside the window is
  dropped and the caption says so rather than flattening the price action.
- **`.pb-split` gives the scan a PIXEL floor** (`minmax(500px, 38%)`), because a
  flat 35% is 488px at 1500 and 330px at 1000 — and the ticker column is the only
  one carrying prose. 500px is what the longest name in the universe needs;
  re-derive it if the type scale moves. Stacked (≤1180px) the name **wraps**
  rather than truncating: a clipped company name on a scan is a name you cannot
  identify, and two lines cost 14px.

**Serverless endpoints** (`api/`):

| File | Does |
|---|---|
| `snapshot.js` | Nightly precompute of the whole universe. Cron: weekdays 22:00 UTC. Serves from Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set — **without it every request recomputes**, which burns the FMP quota fast. Check `"blob"` / `"served"` in its response. **Adding a field to the payload means bumping `SCHEMA`** — Blob serves the stored copy verbatim, so without a bump the new field is simply absent until the next cron, with nothing on screen to explain why. A mismatch recomputes on the first request after deploy. `?refresh=1` forces it by hand. |
| `earnings.js` | Report dates for names outside the S&P 500. Finnhub (keyed) → Yahoo chart (crumb-free) → Yahoo quoteSummary (crumb) → stale cache. FMP is deliberately absent — verified incapable for these names. |
| `snapshot.js` also tags every name with its index membership (`meta[tk].idx` — `sp500` / `ndx` / `dow` / `ext`), which is what the screener's index filter reads. **The Nasdaq and Dow constituent endpoints need FMP Premium; on Starter they 403.** They had no fallback, so nothing was ever tagged and both filters produced zero rows silently — `src/indices.js` is the committed fallback, the same pattern `sp500.js` has always been, and FMP still wins whenever the plan can serve it. There is no reachable substitute on Starter: the ETF-holdings endpoint that would let QQQ and DIA stand in is gated too. The first three are **membership, not reach:** measured against the committed S&P list, the Dow 30 is a strict subset and of a 29-name Nasdaq-100 sample only 12 sat outside the S&P and only 8 outside the S&P plus the curated list. Fetching both grows a 520-name universe by ~10–20. `ext` is the one that adds names — see the extended tier below. |
| `snapshot.js?tier=ext` | **The extended universe: a second nightly pass, a second blob, a second cron** (weekdays 22:20 UTC, 20 min after the core so the two never contend upstream). ~900 US names ≥ $2B and ≥ 400k shares/day on NYSE/NASDAQ, from FMP's `company-screener`, minus everything the core pass already covers. Two reasons it is not folded into the core payload, and both matter: **compute** — one invocation has 60s and the core pass already spends ~50 of them on ~530 symbols, so a single run cannot cover 1,400 names; and **transfer** — a compact record is ~1.5KB, so folding these in would roughly triple the bytes every visitor downloads before seeing one row, to serve a filter most sessions never open. The client fetches it only when "Beyond index" is picked, then merges it into `meta` / `live.quotes` / `hist.sig` so an extended name is indistinguishable downstream. **It is never computed on demand** — not even on a schema mismatch, which the core tier does recompute on: a cold pass is ~900 upstream fetches and would time the user's request out while spending the night's budget. Until the cron has run it answers `status: "pending"` and the screener says so. Yahoo only, no FMP bars fallback — a per-name fallback across 900 symbols would drain the quota the macro board, VIX and the earnings calendar run on. |
| | **Breadth, flow and market health stay measured on the CORE universe** even when the extended tier is loaded. They are stated as measurements of a specific universe; widening what they measure without saying so would change what yesterday's number meant. RS *does* widen — it is explicitly a percentile "vs the tracked universe", so the L-factor note names the field size and says loading the wider universe re-ranks it. |
| `snapshot.js` also fetches the **11 SPDR sector ETFs** (Yahoo, no FMP quota) for the Market Map's tracker. Its `sector` labels must match what `normSector()` produces, or a row's tap-to-screen filters to a bucket the universe isn't in. |
| `_quote.js` | **The only place a Yahoo chart response becomes a quote.** Both `/api/yahoo` and the snapshot had their own copy and drifted into the same bug: they decided "is the last bar the current session?" with a float-exact price comparison (`< 1e-9`), and Yahoo's bar closes carry float32 precision, so every symbol took the wrong branch and got its OWN close as the denominator — a change of ±0.00% across the whole universe. It now prefers `meta.previousClose` (unadjusted, paired with the unadjusted `regularMarketPrice`) and falls back to bar-over-bar (adjusted against adjusted). Never mix the two, and never use `chartPreviousClose` as a denominator — it is the close before the *range*. |
| `yahoo.js` | Yahoo chart proxy — quotes + adjusted daily history. Also backs the stock tape's intraday refresh (`range=5d`), so that path costs no FMP quota. |
| `fmp.js` | Allow-listed FMP proxy; keeps the key server-side. |
| `claude.js` | Anthropic proxy for the AI features. |
| `_upstream.js` | Optional residential proxy (`MASSIVE_PROXY_URL`) for the unkeyed, IP-defended Yahoo calls only. |

**Env vars:** `FMP_API_KEY`, `FINNHUB_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
`ANTHROPIC_API_KEY`, `MASSIVE_PROXY_URL`, `MASSIVE_PROXY_BULK`. All optional —
each feature degrades to a stated-unavailable state without its key.

**Client state** is `localStorage`, on-device only, never sent anywhere:
`tt_product`, `tt_tab`, `tt_mode`, `tt_watch`, `tt_alerts`, `tt_positions`,
`tt_custom`, `tt_disclaimer_ack_v1`, and the Playbook's `tt_pb_filters`,
`tt_pb_sort`, `tt_pb_seen` (the explainer auto-opens on the first visit only),
`tt_pb_risk` (account size + risk % for sizing) and `tt_pb_basis` (which stop
the sizing box divides by), the portfolio's `tt_pf_sort`, plus `tt_pf_atr` — the ATR multiple, **shared** by
the portfolio's trailing-stop column and the Playbook's sizing box on purpose,
so a position sized in one is monitored on the same number in the other.

## Design system

`src/terminal.css` (~2,350 lines) is the whole design system: 48 distinct custom
properties across four themes.

It implements the **Ember** brand handoff. One rule governs it: **amber is
brand, jade is signal and interaction, green and red are P&L and nothing else.**
Green/red are the only colours in the product that mean money moved, so spending
them on a decorative success state costs them that meaning. Four surfaces have
been taken off them because they are not money: the screener's **trend spark**
(one brand amber, because a line's direction is its shape and the Δ column an
inch away already carries the sign), the **score** column's top tier (amber —
a leadership score is a model output), **off-high** (jade for the leadership
band, `--caution` beyond it — a distance is a signal), and the **rotation
graph's quadrants** — leading was green, lagging red, for a rotation state that
is not a gain. Its heads are now a strength *ramp* rather than four categorical
hues: jade solid leading, desaturated jade improving, `--caution` weakening,
`--dim` lagging. Four hues also fails CVD, and the corner labels already name the
quadrants, so colour only has to rank them — `.rrg-qdot` keys that ramp in both
the roster and the plot's four corner captions. Still on P&L green and
open to the same argument: the LEADERS pass letters and the buy-status pill. `--pl-up` /
`--pl-down` are the names to reach for; `--cat-growth` / `--sev-extreme` still
resolve to them because the Growth event category and the Extreme severity band
have always been drawn in those hues, and separating those two from P&L is the
one piece of the rule still outstanding.

**Everything hangs off one wrapper.** `App.jsx:642` renders:

```jsx
<div className="app" data-dir={DIR} data-mode={mode} data-density={DENSITY}
     data-glow={GLOW} data-motion={MOTION} data-typeface={TYPEFACE}>
```

Every token is defined under `.app[data-dir="…"]` / `.app[data-mode="light"]`.
**A component rendered outside `.app` gets no tokens and renders unstyled.** If
you mount anything standalone (a test harness, a preview), reproduce that
wrapper or nothing will look right.

- `data-dir`: `obsidian` (amber/jade, the shipped default), `quant`, `signal`
- `data-mode`: `dark` (default) or `light` — the only one users toggle
- `DIR`, `DENSITY`, `MOTION`, `TYPEFACE`, `GLOW` are pinned at `App.jsx:20`

**Token families** (read `src/terminal.css:34-165` for the real values):
`--bg --panel --surface --surface-2` · `--border --border-2` ·
`--text --muted --dim` · `--accent --accent-2 --accent-ink` ·
`--brand --brand-ink` · `--pl-up --pl-down` · `--cat-growth --sev-high --sev-extreme` ·
`--mark-tile --mark-tile-line --mark-ink` ·
`--radius-sm 7px` (buttons, chips) · `--radius-md 11px` (inputs, logo tiles) ·
`--radius 14px` (**cards and panels** — every rule that uses it is one, and the
lone `calc(var(--radius) + 2px)` lands on the 16px the system gives large
section containers) · `--font-ui --font-display --font-mono` ·
`--track-display --track-label --track-meta --track-data --track-wide`

Use tokens. Never hard-code a hex — it will be wrong in three of four themes.

**The mark is three tapered slashes, and its geometry is fixed** (`BrandMark` in
`components.jsx`, mirrored by `public/icon.svg`): a 10×10 grid in a `0 0 100 100`
box, heads at y 52/38/22 stepping up 14 units, all feet on y 82, 13 units wide at
the head and 5 at the tip. The 2.6:1 rake *is* the identity — never stretch it,
and never mirror it, because flipped the rise reads as a sell-off. It draws in
`currentColor`, and it keeps the **dark-mode** amber in both modes because it
always sits on a dark tile (`--mark-tile` is `#241610` dark / `#1C120C` light);
amber-deep `#A9531A` exists for text on paper, and putting it on near-black would
throw the contrast away.

**Two faces, and the split is by content, not by size.** Space Grotesk is the UI
and display face; IBM Plex Mono carries **every number**, plus eyebrows and field
labels. `.mono` sets it along with `tabular-nums` — a proportional face made
price columns ripple as digits changed width, which is the exact scanning motion
a tape exists to remove. The trap: `.mono` marks *data*, not *small text*. It
was applied to sentence copy back when the mono token was also Space Grotesk and
the distinction cost nothing; the moment it became a real monospace, fifteen
rules of body prose turned into code blocks. Prose takes `--font-ui` at 1.6 —
check what a `.mono` span actually contains before adding one.

**Light mode is paper, not an inverted dark theme.** `#FAF6F1` warm paper with
`#FFFFFF` cards — never pure white for the page, or the brand temperature is
gone. Amber and jade are tuned to glow on black and fall under 3:1 there, so the
hues stay and the values deepen: `#A9531A` and `#0B7A6E` are the only approved
values for text on light surfaces.

**`glossary.js` defines every term the UI shows that a reader could take
differently than we mean it**, and `<Term k="...">` renders one. It is a button,
not a `title` — a title is mouse-only, and "what does this mean" is exactly the
question a phone user has. The popup is **portalled into `.app`**: `position:
fixed` resolves against the nearest *transformed* ancestor, and `.cs-row` carries
one, so an in-place popup landed off-screen; portalling to `<body>` instead
renders it unstyled, because every token lives on the `.app` wrapper.

**The drawer has no trade planner.** It carried a full-width primary button —
"Stage order" in the buy zone, "Track pivot" otherwise — opening a panel with a
flat −8% stop, flat +20%/+25% targets and the reward:risk they implied. Those
were heuristics set in the same type as the measured figures beside them, and the
Playbook sizes the same decision against a real ATR trail or Chandelier level
with the arithmetic printed. Two overlapping tools; the one inventing its own
numbers is gone. Buy-point analysis stays — pivot, buy range and distance from it
are measurements, not a plan.

**Components** live in `src/`: `components.jsx` (shell, hero, tapes, macro board,
VIX panel, watchlist), `drawer.jsx` (stock + event drawers), `canslim.jsx`
(screener + market health), `charts.jsx`, `marketMap.jsx`, `portfolio.jsx`,
`views.jsx` (calendar/timeline), `playbook.jsx` (swing-setup split pane),
`volView.jsx` (volume & flow), `commandPalette.jsx`, `disclaimer.jsx`.

### CSS traps that have already bitten

- **Specificity + source order.** `.star` pins a fixed `width`/`height`; the
  labelled variant must be `.star.star-lbl` to out-rank it, because a *later*
  `@media (max-width: 640px) { .star { height: 32px } }` re-pins it at equal
  specificity. A single-class override silently loses on narrow screens only.
  Rule: when overriding a base class that appears again later in the file,
  qualify with both classes.
- **Contrast is not the same as legibility.** Small all-caps labels at 8.5–11px
  with wide tracking read as ghosted at weight 400 even at 7.8:1. They need
  `font-weight: 600`. Don't reach for a darker token first.
- **Equal-width flex buttons wrap.** `flex: 1` on a row of buttons makes the
  longest label wrap and stretches the whole row. Use `flex: 1 1 auto` +
  `white-space: nowrap` and let them size to content.
- **Native date inputs** render in the browser's light chrome. They need
  `color-scheme: dark` and a `::-webkit-calendar-picker-indicator` filter.
- **Mobile breakpoints hide columns.** `.pf-row` / `.cs-row` drop columns below
  880px. Adding a control to a table cell means checking it's still reachable on
  a phone — a control in a hidden column doesn't exist.
- **The document itself was 626px wide at a 390px viewport, and nothing looked
  wrong until something scrolled it.** Two causes, both measured with Playwright
  (`document.documentElement.scrollWidth` vs `clientWidth`, then every element
  whose `right` exceeds the viewport): the hero `InfoDot` tooltip — absolutely
  positioned, `left: 0` off a dot at x≈285, `max-width: 340px`, and an absolute
  box still counts toward `scrollWidth` — and the filter row, whose two 240px
  search inputs plus ＋Add give it ~490px of max-content that a flex item is
  under no obligation to shrink below. The tooltip is now anchored to
  `.hero-title` rather than to the dot; each `.seg` is its own `overflow-x: auto`
  strip so an overflowing filter row scrolls under the thumb instead of dragging
  the topbar sideways. **Adding a control to a filter row means re-measuring
  `scrollWidth` at 390px** — a page that slides sideways reads as broken, and a
  screenshot taken before anything scrolls it looks perfect. Hit twice now:
  adding a sixth Playbook filter chip and a fifth sort put `.pb-filters` at
  362<426 and the document at 440 against a 390 viewport, so `.pb-filters .seg`
  carries the same scroll strip `.filters .seg` does. The chips wrap fine — it is
  always the `.seg`, one flex item at max-content, and a flex item does not shrink.
- **On a phone the bottom tab bar owns product/search/watch, and the topbar must
  not duplicate them.** `.nav-pills`, `.cmdk-btn` and `.watch-btn` are hidden
  ≤640px — six controls in a 390px bar left the product switcher rendering as a
  clipped "VOL…". Clearance for the tab bar plus the fixed legal bar is reserved
  **once on `.app`**, not per view container; the old per-class list had to be
  extended every time a view gained a trailing block, and whatever was forgotten
  ended up underneath the legal bar. The drawer is the exception — at z-index 180
  it covers the tab bar, so it carries its own safe-area padding.
- **Decorative `overflow: hidden` clips real content.** `.hero` carried one to
  contain `.hero-glow`, which is `inset: 0` and could never overflow anyway —
  what it actually clipped was the InfoDot tooltip on both hero titles, cut off
  mid-sentence. Before adding an overflow guard, check what it costs.
- **`.cs-panel-scroll`'s max-height is arithmetic, not taste.** The screener's
  rows scroll inside the panel. At full page scroll its top lands at
  `100vh − panelHeight − (tail below the panel)`; that tail is ~166px, so the
  height must stay at `100vh − 240px` or so for the top to clear the 58px
  topbar — otherwise the sticky column labels end up behind it. Changing what
  sits under the table means re-measuring `.cs-panel-scroll` at full scroll.
  Note `position: sticky` on that panel does **not** work (a plain sibling in
  the same container sticks fine; the scroll container does not) — don't reach
  for it as a shortcut.
- **A container unit cannot subtract a fixed padding, so it cannot decide
  whether text fits.** The Market Map's tile type was sized in `cqw`/`cqh` — a
  proportion of the map — while the text is laid out inside the tile *minus* 8px
  of padding and 2px of border. That is 4% of a large tile and 29% of a 35px
  one, so tickers fit everywhere except where it mattered. Worse, the `clamp()`
  carried an 8px floor, which turns "does not fit" into "draw it anyway at the
  smallest size": PLTR rendered as **`PLIR`** and GOOGL as `GOO`. A clipped
  ticker is not a truncated label, it is a **different, plausible ticker** on a
  trading screen — the same class of failure as a fabricated number. Tile type
  now comes from a `ResizeObserver` in real pixels, and a label whose fitted size
  lands under 8px is **dropped**; the tile keeps its tooltip and its click.
  Confirm with `scrollWidth > clientWidth` on `.mm-heat-tk`, not by eye.
- **An SVG viewBox and its container must be the same shape.** `preserveAspect
  Ratio="xMidYMid meet"` letterboxes inside a box of a different aspect — and the
  RRG's labels live in an **HTML overlay positioned in percentages of the box**,
  so they drift off the plot rather than moving with it. The phone rule set
  `aspect-ratio: 1/1` on `.rrg-plot` while the viewBox stayed 600:400, which at
  390px gave a 356×237 plot in a 356×356 box with every label placed against the
  356. Both shapes are declared in `marketMap.jsx` now (600:400 wide, 440:430
  narrow) and the CSS only mirrors them — change one, change the other.
- **A flex row of topbar controls does not shrink, it overflows.** Between 641px
  and ~1050px the topbar carries all six controls (below 640 it gives up three),
  and a flex item is under no obligation to go below its max-content width — so
  the row grew past the viewport and pushed the theme toggle off the right edge:
  `document.scrollWidth` 1031 against `clientWidth` 1000, on **every view**.
  `.nav-pills` now carries `min-width: 0` and its own scroll strip at all widths,
  the same treatment `.seg` gets on the filter rows. Measure with the loop in
  **Verifying UI changes**, not by eye — a screenshot taken before anything
  scrolls the page looks perfect.
- **A de-collision gap in viewBox units is not a gap in pixels**, and the plot's
  width is not a constant. The RRG's `GAP` spaces label chips that render at a
  fixed px size, so it is derived from the plot's **measured** width and the
  chip's **measured** height (`ResizeObserver`, both). It was a constant twice,
  and a constant is only right at one width: 16 units clears a chip on an 858px
  plot and is 20px on the 727px one a 1200px viewport gives it — narrower than
  the chip it is spacing. 1500px looked perfect throughout.
- **Labels de-collide in ONE global stack, at every width.** Per-side placement
  halves the crowding but cannot stop a left-anchored and a right-anchored label
  landing on the same row: they are placed independently, so neither knows about
  the other, and chips are wide enough to meet in the middle.
- **Shift-then-clamp re-collides the top of a label stack.** The obvious overflow
  fix — forward pass, then "if the last one overran, shift everything up and
  clamp at the ceiling" — moves items uniformly but clamps them individually, so
  whatever hits the ceiling stops while its neighbour keeps going. Measured as
  "Consumer Cyclical" 21px under "Healthcare" while every other pair sat at 25.
  The stack is placed with a forward pass and then a **backward** pass from the
  bottom, which preserves the gap; the gap itself is pre-shrunk to fit the span so
  neither pass can run out of room.
- **A stack must stop clear of the chart's furniture, not at the plot edge.** The
  RRG reserves 24 viewBox units at the top and 40 at the bottom: the corner
  quadrant captions live in those bands, and so does the "100" origin chip at
  bottom centre. Clamping to the plot edge landed labels on all three.

### The rotation graph

**Sectors only, and no trails until asked for.** Both were reversed twice and the
reversals are the whole history of this component:

- There was a **Names** mode plotting every tracked ticker. ~500 dots in a 600×400
  box is not a chart, so labels were capped at eight and forty-odd unlabelled dots
  sat there meaning nothing, while the roster beside it ran four screens. Rotation
  is a sector-level idea — where money moves *between* groups — and one name's RS
  line belongs in the drawer. Eleven dots is the point.
- **Every tail drawn at once has now been tried twice**, once coloured by quadrant
  and once in neutral ink, and both read as spaghetti: eleven six-point paths
  crossing each other at this size. Colouring by quadrant is worse than useless —
  a tail crossing three quadrants gets painted whichever one its *head* landed in.
  The default is now where things ARE; where one came from is a question asked of
  one sector at a time, and only the hovered/pinned sector draws its path, in jade,
  with one dot per week so the trail carries its own time scale.
- **No sector names inside the plot.** Eleven `.rrg-lab` chips each repeated a
  roster row that says it better, and the stack that kept them from colliding
  pushed most of them away from the dot they name — measured at up to **77px**,
  joined back by a hairline. A name sitting nearer some other sector's dot than
  its own is a wrong reading, not a label, and it cost a three-step decode. They
  are gone, and with them the two `ResizeObserver`s, the px↔viewBox gap
  conversion and the two-pass placement — every hard bug this component has had
  lived in that code.
- **Identity lives inside the mark.** `.rrg-dot` is an **HTML button in the
  overlay**, not an SVG circle: it renders at true pixel size instead of scaling
  with the viewBox, so 30px is 30px at every width with nothing to measure — the
  lesson the Market Map's tile type already paid for. It carries a rank numeral,
  and `.rrg-rrow-n` prints the same numeral beside the name in the roster. That
  pairing is the whole mechanism, and it is also what forces the mark to be big
  enough to read: **ink-to-plot went from about 1:7,400 to 1:33**. The numeral is
  a render-local legend keyed to reading order, never an identity — nothing may
  ever be persisted against it.
- **The roster beside the plot is not decoration.** A dot's position is the
  reading, but decoding eleven of them is work, and the question actually being
  asked — "who is leading?" — is a list. It also carries the sentence that says
  what each quadrant *means*; "Weakening" is the strong-but-rolling-over corner and
  everyone reads it backwards. Since eleven sectors always fit it needs no scroll
  container — the absolute-positioning trick and its fade existed only for the
  deleted Names mode.
- **A FIXED 2×2, never `auto-fit`.** `auto-fit` sizes the track count from
  whatever width happens to be there, and measured across ten viewports it gave
  **four columns at 1920 and 1120, three at 1600 and 1000, two at 1500** — the
  board reshaped as the window moved, and at four-across every sector name
  truncated to 81px. 1500px, the only width that had ever been screenshotted, was
  one of the few that landed on 2×2. Two columns is also the chart's own shape:
  Leading and Improving on top, Weakening and Lagging beneath, which is the order
  `QUADRANTS` already declares.
- **Every width in that grid is arithmetic off the longest sector name.**
  "Communication Services" is 168px at `--fs-body`; a row spends 122px on the
  numeral column, the two figures and their gaps, and a card 22px on padding and
  border — so 312px per card and **640px for two side by side**. That number is
  the roster column's `minmax` floor, it is why the **plot** column gives way
  first (its min is 0), and it is why the roster drops to one column at
  **760px, not the 640px the rest of the app breaks at** — at 700 the cards were
  298px and the name clipped by 14. Re-derive it if the type scale moves.
- **The two figure tracks are deliberately unequal** (38px then 46px). Both are
  right-aligned, so a wider track puts its slack to the *left* of the number,
  which is the only way to open a gap between adjacent right-aligned columns —
  CSS grid has no per-column `gap`. At equal widths "105.1 102.3" read as one
  twelve-digit blob. And they must be fixed px, not `max-content`: each row is its
  own grid (a button), so content-sized tracks are measured per row and the
  figures would jitter line to line instead of forming a column.
- **The rotation note sets itself in columns** (`column-width: 62ch`). Five
  sentences at a single 96ch measure was an eight-line block hugging the left edge
  of a 1400px card — text trailing off into empty container instead of closing the
  panel. A column *width* rather than a count means two columns on a laptop and
  three on a wide monitor with the measure staying readable either way. It needs
  its own `.rrg-note` class because `.mm-rrg-note` is shared with the heatmap's
  two-line caption, which has nothing to balance.
- **Nothing on this panel was sized by importance.** Nine text roles, all of them
  at 9px or 10.5px, in a 1428×788 card — the biggest object on screen was empty
  plot and the smallest text was Ratio and Momentum, the only measurements the
  component reports. The plot now caps at **620px** rather than 860 and the roster
  takes the width back, roughly a 45/55 split; the quadrant sentence, the sector
  names and the figures all moved up the scale.
- **The readout sits above the chart, not in it.** Anchored to its dot it has to go
  somewhere, and everywhere inside a plot this dense is on top of something: it
  was measured landing on a neighbour's label chip at 1200/820/700 and on the
  corner captions at 390. The dot it describes is already marked twice — its own
  chip lights up and so does its roster row.

## Verifying UI changes

Reading a diff cannot tell you whether a CSS change worked. Screenshot it:

```bash
npm run build && npm run shots -- --theme both
npm run shots -- --views drawer,portfolio --width 390   # phone (all mobile rules are ≤640px)
npm run shots -- --views radar --scroll 640             # a section below the fold
npm run shots -- --views radar --live                   # against real APIs
```

Output lands in `shots/` (gitignored, and never wiped — filenames encode
view/theme/width so a re-run overwrites exactly what it re-shoots). Views: `radar`, `timeline`, `calendar`,
`vol`, `volsort`, `watch`, `screener`, `screenerext`, `screeneridx`, `dead`, `deadext`, `map`,
`rrgpin`, `health`, `playbook`, `playbookhelp`, `portfolio`, `drawer`, `landing`.
The `watch` shot seeds all four watchlist row states — a curated event, a **live
econ** event, a star whose release has left the calendar window, and a ticker —
and the fixture now answers `/api/fmp?endpoint=economic-calendar`, so the merged
event list is exercised rather than only the curated template. Its star keys are
derived by calling `mergeEcon` itself, so they cannot drift from the ids the app
assigns.
`screenerext` clicks "Beyond index" so the extended tier's second payload
actually merges in a shot — `?tier=ext` is routed to its own fixture, and the
route test checks it **before** the core one because the ext URL contains
`/api/snapshot` too; answering it with the core payload would make a merge that
never happened look like a success.
`rrgpin` pins one sector, and it is the ONLY state in which the rotation graph
draws a trail at all — the default is eleven dots and no paths — so without it the
feature is never in a picture. (There was an `rrgnames` shot for the Names mode;
that mode is gone, see below.)

The fixture gives every name a sector AND an industry from `FIX_SECTORS`, and a
6-point `rrg` tail. Both were flat for a long time, and the cost was silent: one
industry meant the group panel rendered a single group, and a missing `rrg` left
the whole relative-rotation panel on "Waiting for live data…" in every shot ever
taken. **`FIX_SECTORS` was then six sectors against production's eleven, and six
is the density at which every sector-cardinality problem hides** — labels never
collided, tails never crossed, and "draw every tail coloured by its quadrant"
shipped looking clean and arrived as spaghetti. It matches `sectors.rows` now.
The `rrg` tail is anchored to the name's SECTOR with per-name jitter, because
keying it off `i` alone (co-prime with the sector stride) averaged every sector to
within a point of 100 and piled all eleven heads into one blob at the origin.
A fixture that under-varies doesn't fail — it just stops testing.
Read the PNGs — page errors are reported inline next to each shot.

The radar's 4th tab used to be **Catalysts** (internal id `playbook`) — a third
rendering of the same event set as Radar and Full Timeline. It is now
**Volume** (`vol`), reading `snap.flow` for the session's dollar-volume ranking
and `snap.vol` for VIX context. `flow.heavy` and `flow.unusual` are two
separate server-side rankings shown side by side, not one set sorted two ways —
re-ranking a top-30-by-dollar-volume slice on relative volume would show "the
most unusual of the biggest" and silently drop every genuinely unusual mid-cap.
Each panel's advance/decline filter is **panel-local state on purpose**: a shared
one would forbid holding "heaviest, but only what was sold" next to "most
unusual, but only what was bought". Those filters read `sig.chgD` — the session's
close-to-close change off the **same adjusted bars as `volD`**, never the quote's
`changePercentage`, which is a different clock and rounded to 0.00 across the
whole universe once, silently emptying both filters while "All" still showed
every row. The `volsort` shot sets them to opposite
directions, so a shared-state regression shows up as both panels moving together.
**Both panels label the measure `RVOL`,** with the glossary term attached — they
said "× normal" and "× normal volume", which is accurate and meant the
abbreviation every trader uses appeared nowhere on the page, so the four-bar gauge
read as unexplained decoration and the feature was reported missing. The gauge is
the dollar-volume panel's 4th column and it **survives ≤640px** (it loses its
number, keeps its bars): it is the only column there that separates a mega-cap
that is busy from one that is merely big, and dropping it with everything else
that did not fit deleted the reason to read that panel on a phone. The
unusual-volume panel drops its Shares column instead — its RVOL is already the
meter. Note two `@media (max-width: 640px)` blocks both touch `.flow-row`; the
later one wins, and it is the one that owns the grid. It was briefly a VIX term-structure view; that
was an options-desk answer to a momentum-trader question — contango is a fact
with no decision attached unless you trade options — so it now shows where
capital actually traded. **There is no options flow anywhere in this app and it
is not an oversight.** FMP has no options endpoints at any tier here. Yahoo
*does* serve chains and the crumb handshake in `api/earnings.js` could reach
them — but no retail feed carries the SIDE of the trade, so volume and open
interest can say contracts changed hands and never whether they were bought or
sold. Anything labelled "flow" off that data is inferring a direction it cannot
see. If a real source is ever wired in, expected move (ATM straddle ÷ spot) is
the piece worth having: it prices the earnings dates this app already tracks. `tt_tab` still holds `"playbook"` on
any device that last used the old tab, so `App.jsx` migrates that id on mount;
an unknown id renders nothing at all under the subnav. The screener's Playbook
is a different view (swing setups) and keeps its name.

By default every `/api/*` call is served from a deterministic fixture in
`scripts/shots.mjs`, so shots need no keys, no network, and the same commit
always yields the same pixels. **If you change a snapshot field's shape, update
that fixture** — it mirrors `api/snapshot.js`'s real output. A mismatch usually
shows up as a page error next to the shot, but not always: `vix.series` is
`[{d, v}]` and a fixture of bare numbers made every point `undefined`, NaN'd the
path and rendered an **empty chart with no error at all**. When a panel looks
blank in a shot, suspect the fixture's shape before the component.

For measuring rather than looking (element sizes, computed styles), drive
Playwright directly — `scripts/shots.mjs` is a working reference for launching
chromium and seeding state.

## The landing page

`/` answers with whichever surface the visitor came for, decided in `main.jsx`:
an explicit path always wins (`/start` is the landing, `/terminal` the app), a
URL carrying app state (`?ev=`, `?tk=`, `?p=`, `?tab=`) is a deep link and goes
straight to the terminal, a visitor who has accepted the disclaimer has used this
before and gets the terminal, and only a genuinely new visitor on a bare `/` sees
the landing. `LANDING_FOR_NEW_VISITORS` flips that last rule in one line. The
alternative — landing on `/`, terminal on `/terminal` — breaks every `?ev=` deep
link the app writes and every bookmark anyone already has.

`landing.jsx` renders its own `.app` wrapper, because a component mounted outside
it gets no tokens at all. Its CSS is `landing.css`, all `lp-` prefixed.

**The CRDO row in the hero panel is the argument, not filler.** Four cells that
cannot be measured, rendered through the same `<NA>` primitive the screener uses,
each naming its missing input. It is the only place on the site where the
never-fabricate rule is *shown* rather than asserted — do not let a polish pass
fill it in. Every other illustrative figure on the page carries `DEMO — NOT LIVE`.

The handoff paints the Score column in P&L green; that is refused here. Green and
red mean money moved, and a leadership score is not money — score renders in
`--text` with `--brand` for the top tier, and the change column keeps the P&L
pair. The hero panel bleeds off the right edge, so `.lp-hero-grid` is **not**
`.wrap`: it reproduces the wrap gutter as a left padding and leaves the right at
zero. On a phone the trend spark drops rather than the score, because the score
is where the CRDO dash lands.

## Deploying

`main` is what Vercel builds. Work happens on a feature branch; a change is not
live until it lands on `main`. If someone says "I don't see the change", check
`git log origin/main` before assuming a cache.

## House style

- Comments explain **why**, not what. Match the density already in the file —
  this codebase comments decisions and trade-offs, not syntax.
- Commit messages are prose that explains the reasoning and states what was
  verified. Look at `git log` before writing one.
- No new dependencies without a reason that survives being said out loud.
- Tests: `test/earnings.test.mjs` stubs upstreams and asserts real behaviour
  (including that secrets never leak into debug output). Extend it when you
  touch `api/earnings.js`.
