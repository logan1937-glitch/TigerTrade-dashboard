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
npm run shots -- --audit  # + report panels >25% empty and the smallest type in them
npm run og             # regenerate the 1200×630 social card → public/og.png
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
- **The chart carries the trigger and the stop as explicit lines** — the trigger
  in `--accent` (amber) and the stop in `--caution` (mid neutral ramp). Neither
  may be red or green: a level is arithmetic, not money moved. The caption names
  those two colours, so **changing either token means changing the words too** —
  it said "jade" and "amber", the wrong way round, for two accent systems.
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

`src/terminal.css` (~3,000 lines) is the whole design system: 48 distinct custom
properties across four themes.

**Dead rules accumulate here faster than anywhere else**, because a deleted
component leaves its stylesheet behind and nothing fails. A sweep found 47 class
names in this file with no literal match anywhere in `src/` — leftovers from the
Catalysts tab, the drawer's trade planner, the rotation graph's in-plot labels and
several earlier passes — worth 66 whole rules and 6.5KB. Re-run it when a
component is removed: collect every `.class` in the stylesheet, drop the ones
whose name appears nowhere in the `.jsx`/`.js` sources, then delete only the rules
whose EVERY selector is dead. Check for dynamically built class names first
(`className={"a" + …}`) — there are three, and all of them concatenate literals.
The sweep also reports two false positives and one deliberate survivor: `.w3`
comes from `w3.org` inside a data-URI, `.tnum` is a paired utility, and **`.shout`
is the documented opt-in for `--label-case`** — currently unused on purpose, and
it must stay, because without the hatch the next person who needs one caps label
will write `text-transform: uppercase` and break the token.

**Re-run since, and it paid again: 21 more dead names, 43 rules, 4.5KB** — the
whole pre-`.cover` hero (`.hero-title`, `.hero-eyebrow`, `.hero-meta`, the
`.hero-kpi*` cluster) and every rule of the deleted `.hero-next` card, plus
`.statstrip-card`. Two things that pass only make it out by hand: **a rule whose
selector list is PART dead gets trimmed, not deleted** — `.hero-title,
.cover-eyebrow { position: relative }` is the InfoDot anchor and dropping it
whole would un-anchor the tooltip and slide the page sideways again — and **a
comment orphaned by its rule goes with it**, or the file fills up with paragraphs
explaining code that is not there. The sweep now reports exactly the three
documented survivors, which is what "clean" looks like.

**CASE IS A TOKEN, and the default is sentence case.** Seventy-one rules set
`text-transform: uppercase` — every field label, column header, stat caption, the
subnav, the filter chips — so about fifteen tracked all-caps strings shared one
screen and the reading order went flat: "MARKET TREND" competed with the figure
it labels. Caps also cost ~12% more width and throw away word-shape, which is
what makes a label scannable peripherally. Every one of those rules now reads
`text-transform: var(--label-case)`, `--label-case` is `none` on `:root`, and
`.shout` opts a selector back in. Tracking moves *with* case — 0.10em is right
for caps and looks broken under lowercase — so `.shout` redeclares
`--track-label` / `--track-wide` / `--track-meta` rather than setting
`letter-spacing`, and every rule already reading those tokens follows along.
**A label authored in caps in the JSX cannot be reached by the token** —
`TT.CATEGORIES` and `STAT_IDS` had to be re-cased at the source.

**`--fs-micro` (10px) is for CHROME, not for readings.** Column headers, field
labels, chip counts, eyebrows. The moment a measurement lands there the hierarchy
inverts, because the label and the number it describes become the same size —
measured on the Playbook, where 123 of ~485 text nodes were the scan's own
figures (the day's change, ATR%, distance to stop) rendered at the size of the
word "Ticker" above them. Secondary measurements belong at `--fs-label`.

**THE SCALE WAS TIMID IN THE MIDDLE, and it was measured rather than felt.** On
the radar at 1500px the cover figure rendered at 40px, the facts at 19, panel
CONTENT at 12 and section labels at 9 — a 3.3× drop from the last large step
straight to the smallest, with nothing between 19 and 12 doing any work. The
consequence was panels whose own subject was the smallest text inside them:
`.hero-left` was 27% empty, `.vixpanel` 46%, and the catalyst queue put 233px of
content in a ~570px box. Every step from `--figure` down is lifted (27 / 22 / 16
/ 14.5 / 13 / 11.5 / 10) so neighbours sit at roughly 1.15 rather than
1.58-then-1.12. `--display` is untouched because it is the landing page's.

**Dead space is a MEASUREMENT, not an impression** — and `npm run shots --
--audit` now makes it. For every panel it compares the box height against the
bounding box of its children and prints anything more than 25% empty, together
with the SMALLEST font-size on a text node inside it, because the two failures
travel together: the box is empty *because* the type in it was set too small to
fill it. A panel that far empty is either missing content it should carry or
sized for content it does not have.

**A GRID STRETCHES ITS ROWS TO THE TALLEST CELL**, which is the other way a
panel ends up looking empty without being wrong. The portfolio's five panels
measured 73 / 51 / 48% air on a two-position book — not because they were
missing anything, but because "Sector weight" has one row and was padded to
match "Book health" beside it. `align-items: start` lets each be exactly as tall
as what it holds, and a short panel then reads as a short answer. Reach for this
before reaching for filler.

**HUE MARKS DIRECTION AND OUTCOME. LIGHTNESS MARKS RANK. NOTHING GETS COLOUR FOR
IDENTITY ALONE.** This is the third version of the rule and the one that holds.

The first — "amber is brand, jade is signal, green and red are P&L" — licensed
FOUR colour families on a single screener row, and with four nothing can be
emphatic because everything already is. The second went to zero accent, only the
P&L pair. That was the right *direction* and it over-corrected: it stripped hue
from things that have a genuine polarity, not just from decoration, and the
board read as dead rather than as restrained.

So there are exactly TWO things a hue may mean:

- **A direction or an outcome** — the P&L pair. A gain, a loss, an EPS beat or
  miss, YoY growth, a regime that permits buying against one that does not, a
  stage that is advancing against one that is declining, an index above its
  50-day. All of these are good-or-bad, and that is what green and red say.
- **Interaction, in ONE colour, and that colour is amber** (`--accent`, which is
  also `--brand`). A selected filter, the active tab, a focus ring, the
  leadership band on the RS bar, a name in its buy zone, an A-grade score.

Everything else ranks by **lightness on the neutral ramp**: severity, the
contraction tiers, RVOL, industry-group strength, the VIX fear gauge. And
anything NOMINAL gets no hue at all — the five event categories are `--dim`,
because "Geopolitics" is not better or worse than "Flows" and a ramp would be a
lie about them. An EPS beat is better than a miss; a category is not.

The test when adding colour: *does this value have a direction, or is it just an
identity?* If it is an identity, it is grey.

- **`--accent` IS amber** — `#E2742E` dark, `#A9531A` light (the only amber that
  clears 4.5:1 on paper), and it is the same value as `--brand`. A monochrome UI
  under an amber mark was incoherent. All ~100 `var(--accent)` call sites say
  "this is selected / notable"; keeping the token name is why two changes of
  direction needed no hand edits at the call sites.
- **The trend spark stays NEUTRAL** even though amber is back. Forty of them in
  one column is not an accent, it is a tint over the whole board — and the Δ
  column an inch away already carries the sign. `--muted`.
- **Event categories are NOMINAL, so they are not hues at all.** Five categorical
  colours on 7px dots was the single largest spend of colour in the product.
  Nominal data also cannot be ranked, so a neutral *ramp* would be a lie about
  it: all five take `--dim`, and the label beside every dot ("Central banks",
  "Geopolitics") identifies it — as it always did. The dot was a second copy.
- **Severity IS ordinal, so it ramps** — by lightness: `--sev-extreme` is
  `--text`, high is `--muted`, medium and low are `--dim`.
- **`--caution` is the middle of that ramp, not a hue.** It was `#E8B04B`.
  A warning cannot borrow a colour when the only colour left is money.
- **`--cat-growth` and `--sev-extreme` are no longer aliases of the P&L pair.**
  That aliasing meant a down day and an "Extreme" macro event were literally the
  same red. 113 call sites were repointed at `--pl-up` / `--pl-down` first —
  behaviour-identical, since the aliases resolved there anyway — which is what
  freed the category and severity tokens to be redefined. **New code showing a
  gain or a loss uses `--pl-up` / `--pl-down` and nothing else.**

The pair itself is tuned rather than inherited: `#34D399` / `#F87171` in dark
(was `#3BD685` / `#FF5C5C`, whose red was near-maximum saturation, so a down day
read as an error state), `#05966A` / `#DC2626` on paper. The two are matched in
luminance so a column of losses does not shout over a column of gains.

**The ground is NEUTRAL, in both modes.** `#0B0B0C` page → `#121214` panel →
`#1A1A1D` raised → `#202024` hover, and `#FAFAFA` → `#FFFFFF` → `#E9E9EC` on
paper. Four clean value steps, because depth now comes from lightness rather
than from borders — which is how a dense board separates a dozen regions without
drawing a dozen boxes. Deliberately not pure black: small white type on `#000`
halates on a large monitor, which is why trading terminals avoid it. And
deliberately not the old warm ink — warmth tinted every grey slightly orange,
which is what made them read muddy, and it pushed the P&L red closer to the page
it sits on. `--bg-grad` is `none` in both modes: a decorative radial light source
behind the header is the single clearest "generated" tell in the file.

**Chrome is the other thing that reads as generated, and it is counted in
BOXES.** The stylesheet had 102 `border: 1px solid` declarations and the
screener drew about 280 filled green squares on one screen. Three rules came out
of the polish pass:

- **Nesting depth is the tell, not any single border.** The radar's left column
  was a bordered panel holding three bordered counters, a bordered catalyst card
  and three more bordered cells — four levels, so the eye read frames before
  figures and the thing the panel exists to announce had no more emphasis than
  the counters above it. Only the next catalyst keeps a container now; that is
  what makes it the headline. Same move on the screener's market-state strip, the
  portfolio tiles, the Playbook metric bar and the drawer's signal grid: **label
  and value pairs separated by space, one hairline under the group.**
- **No bevels.** `--lift-flat` was `inset 0 1px 0 var(--edge-hi)` — a 1px white
  line along the top of nineteen panels, saying "raised physical object". It is
  `none`. A panel is separated by its ground and its hairline.
- **The `gap: 1px` over a `--border` ground draws cell walls cheaply, and it also
  draws a wall around NOTHING.** Eight drawer metrics in a three-column grid left
  a grey slab in the ninth slot that read as a broken panel. If a grid can be
  partly filled, it cannot use that trick.

**`auto-fit` / `auto-fill` are banned wherever the item count is FIXED.** They
size the track count from whatever width happens to be there, so the block
reshapes as the window moves and only the width you screenshotted looks
considered. Caught three more times after the rotation roster: the Market Map's
eleven sector tiles went 8-across-then-3 at 1500px (now a fixed 6, dropping to 4
under 1240px), the portfolio's four KPI tiles, and the Playbook's five metric
cells. Eleven into six is a shape; 8+3 is an accident that looks like one.

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
`--brand --brand-ink` (**brand surfaces only**) · `--pl-up --pl-down` (**the only
hue in the product**) · `--caution` (mid of the neutral ramp) ·
`--cat-cb --cat-flows --cat-growth --cat-data --cat-geo` (all `--dim`; nominal,
so not ranked) · `--sev-extreme --sev-high --sev-medium --sev-low` (ordinal, so
a lightness ramp) ·
`--mark-tile --mark-tile-line --mark-ink` ·
`--radius-sm 6px` (buttons, inputs) · `--radius-md 11px` (logo tiles) ·
`--radius-chip 4px` · `--radius-panel 8px` (**data panels and table containers**,
and what `--radius` now aliases to — every existing call site is a panel) ·
`--radius-float 10px` (drawer, popup) · `--radius-hero 14px` (**marketing only**
— the old `--radius`, kept for `.hero-cover .hero-left` and the landing page).
One 14px value used to do hero cards AND table containers; a large corner on a
dense board is one of the tells that reads as generated. · `--font-ui --font-display --font-mono` ·
`--track-display --track-label --track-meta --track-data --track-wide`

Use tokens. Never hard-code a hex — it will be wrong in three of four themes.

**CALM TOP, DENSE BOARD — `.cover`.** Every screener-product view opens with one
display-scale primary reading, air around it, a quiet five-up row of supporting
facts, one hairline, and then nothing on the page is calm again. That split is
the whole layout thesis: institutional density is what the board below the rule
is for, and a first-time visitor needs one thing to read before they meet it.
The page used to open with an eyebrow, a 28px page title, a meta line and a
bordered four-up stat card — four levels of heading before a single measurement,
and the title was redundant with the product switcher in the topbar, which says
the same words and is highlighted.

The market regime is the headline because a leadership method checks it first:
if it says correction, nothing below is actionable. Two rules on it —
**the figure is never coloured by state** (a regime cannot borrow a hue when the
only hue is money moved, so "Confirmed Uptrend" and "Market In Correction" are
both `--text` and the sub-line carries the reading in *words*: "Buying
permitted" / "Risk management first"), and **it is never fabricated** — with no
market payload it is an `<NA>` naming the missing block, not an optimistic
default. `.cover-facts` is a fixed five tracks, dropping to three then two.

**THE RELEASE FIGURES BELONG ON THE RADAR, not four clicks into a drawer.**
`previous`, `estimate` (consensus) and `actual` ride on every merged economic
release and were rendered in exactly one place — inside the event drawer — so
the view whose whole job is "what is coming and what will it do" showed a title
and a countdown and nothing you could form an expectation from. `EconLine` puts
them on the cover's headline release and on every queue row that has them, in
two shapes: **prev → cons** before it lands, **act vs cons plus the surprise**
after. The surprise is the only coloured thing there and it earns it — a beat or
a miss is a direction. A release with no consensus published says so rather than
printing a dash that could read as zero.

**THE CATALYST QUEUE EARNS ITS PANEL.** It was eight 12px names in 29px rows,
so the panel that exists to say what is coming was ~59% empty and its own
subject was the smallest text in it. Each row now carries the countdown (a fixed
56px track, so the numbers form a column), the name at `--fs-lead`, the category
and date beneath it, and the severity right-aligned — ranked by LIGHTNESS, since
a severity band is not money. Ten rows fill the column honestly rather than by
padding.

**THE RADAR OPENS THE SAME WAY**, with its own primary question: not a page
title but WHICH CATALYST IS NEXT and how long you have. The event name is the
display figure, the countdown rides beside it at 0.52em, and the whole thing is
a button that opens the event. Converting it made three things redundant that
were promptly deleted — the `.hero-next` card, which repeated the headline
exactly, and two of `RiskSpectrum`'s three cells (implied move and vol regime
are cover facts now). Liquidity was the third and is not lost: the 2Y yield sits
in the macro board in the same view. The left panel is the QUEUE now — the next
eight catalysts — which is the one thing on that view nothing else shows.

**THE COVER RIDES EVERY RADAR VIEW; THE THREE-PANEL BOARD IS THE RADAR TAB'S OWN
CONTENT.** `Hero` renders both, and it used to render both above all four radar
tabs — so the queue, the macro board and the VIX panel sat in front of Full
Timeline, Calendar and Volume. Measured on a 900-tall viewport: that board is
676px at 1500 and **1228px at 390**, which put the Calendar's own grid at
**y=1248** and, on a phone, at **y=2326**. You clicked Calendar and got 1.4
screens of the Radar before the month. `Hero` takes a `board` prop now
(`board={radarTab === "radar"}`) and the calendar starts at y=572 / y=1097.

The split is not arbitrary. The cover — which catalyst is next, how long you
have, five supporting facts — is the "calm top" the whole layout thesis is built
on and it is the same question all four views ask, so it stays everywhere. The
queue is explicitly *the one thing the Radar view shows that nothing else does*;
a view's own board rendered above three sibling views makes the tabs look
decorative. **Anything added to `Hero` has to pick a side.**

Two traps that conversion hit:

- **`font: inherit` on `.cover-fig-btn` reset the display size.** The shorthand
  resets font-size to the parent's, and `.cover-fig` is on the SAME element, so
  the radar's headline rendered at body size and looked like the cover had
  simply not applied. A button reset must touch background, border, padding,
  cursor and text-align — never `font`.
- **"Normal" in `VIX_REGIME` was `--accent`.** With amber back that painted the
  VIX figure, its chart and its badge amber, making the calmest possible reading
  the most emphatic thing on the radar. A vol regime has a polarity, so the ends
  take the P&L pair and the middle takes the neutral ramp.

**THE EXPANDED CHART (`chartModal.jsx`) FETCHES FULL DAILY BARS ON DEMAND.**
The nightly snapshot deliberately ships a ~60-point spark and no `closes` — a
compact record is ~1.5KB and full bars for 500 names would multiply what every
visitor downloads before seeing a row. That trade is right for the BOARD and
wrong for this modal, which is the one place someone has explicitly asked to
look at a single name closely; it left the good chart mode (volume, zoom, MA
overlays, real dates in the crosshair) almost never reachable in production.

So opening the modal fetches that one symbol from `/api/yahoo`, which serves
adjusted daily history and costs **no FMP quota** — the same reason the
portfolio's peak-since-entry lookup uses it. Results are cached per symbol for
the session (`BARS`), including MISSES, so a symbol Yahoo will not serve is not
re-requested on every open. `SHOTS_YAHOO_DOWN=1 npm run shots -- --views chart`
exercises the refusal path.

**`useBars` lives in `charts.jsx` because THREE surfaces had the same problem**,
and only one of them was visible. It is exported from there rather than from the
modal so the Playbook can use it too; the drawer does not, because `App.jsx`
already fetches bars on open through `fetchMarket` (Yahoo, no FMP quota) *and*
patches the full signal bundle from them, which `useBars` does not — a second
hook there would be a duplicate request for the same symbol.

- **The drawer's price section was gated on `closes.length` alone**, so for every
  name whose bars are fetched on open — nearly all of them — the block the drawer
  is most often opened for was simply ABSENT, then appeared and shoved everything
  under it down the page. `_bars` on the drawer record (`loading` / `done` /
  `miss`, set only in `openStock`) is what separates "still fetching" from
  "settled with nothing", which is exactly the `feedSettled` distinction the radar
  already makes. Loading holds the chart's height (`.dr-chart-wait`, 172px — the
  `h=184` viewBox in a ~560px column); **the settled miss releases it**, because
  nothing is coming to fill it and a reserved 172px of air is the padded-panel
  failure. The `csData` sync effect carries `_bars` from the *current* record, not
  from `fresh` — a snapshot landing mid-fetch must not reset the section.
- Misses are cached in `barsCache` as the string `"miss"`, so a refused symbol is
  not re-requested every time it is opened. The modal reads `stock._bars` and
  skips its own fetch when the drawer already settled on a miss.
- **The Playbook's detail pane fetches the selected name only.** Its rows are
  compact records, so the chart was drawn from the ~60-point sample — about one
  point every four sessions, which is the exact resolution at which a contraction
  disappears, on the tab that exists to find contractions. The sampled series is
  drawn immediately and the daily bars replace it when they land; **the caption
  names which one you are reading**. It used to say "daily closes from the nightly
  snapshot" over the sample, which is a precision claim the record cannot support.
- The Playbook's caption named the level colours **backwards** ("jade" trigger,
  "amber" stop) — true two accent systems ago. The trigger is `--accent` (amber,
  the one interaction hue) and the stop is `--caution` (mid neutral ramp), because
  a level is arithmetic and cannot borrow a hue that means money moved.
- The `drawer` shot waits **2200ms** after `.dr`, not 500: `fetchYahoo` retries a
  429 twice with 500ms and 1000ms of backoff, so the shorter wait photographed the
  *loading* state under `SHOTS_YAHOO_DOWN=1` — a transient, not the degraded
  render the flag exists to capture.

**`h` on `PriceChart` IS A VIEWBOX HEIGHT, NOT PIXELS.** `.chart` is
`width: 100%` against a 600-wide viewBox, so the rendered height is
`width × h / 600`. In this modal at ~1130px, `h=430` rendered **810px** tall and
pushed the stats row and the footer off the screen. 210 lands at ~395px.

Three sources, in order of preference:

- daily bars — the record's own `closes` when it has them, otherwise the fetch:
  the real `PriceChart`, with zoom, drag-select, MA overlays and a crosshair
  that can name an actual DATE, because daily bars carry them;
- with only the spark: `SampledChart`, which is a full chart in its own right —
  price axis with gridlines, a snapping crosshair with a readout, a window
  selector, a gradient area and a marked last close — captioned with the
  resolution. It has **no per-point date**, deliberately: `sampleSpark` returns
  values only, so any date on a given point would be arithmetic on an assumed
  4-session step, an estimate wearing the clothes of a measurement. The readout
  gives price and the move from the window's start, both real, and the axis
  names the SPAN. **Drawing 60 sampled points across an 1100px canvas as though
  they were daily is the worst wrong chart this app can make** — long straight
  segments reading as real price action at a precision the record does not have;
- **a window is only offered if the sample can fill it** (`MIN_PTS` = 10). At
  ~4-session resolution a 1M slice of a 60-point series is five points — four
  straight segments claiming to be a month — so 1M is simply absent on a sampled
  series and present with full daily bars. The control adapts to the data rather
  than the data being stretched to the control;
- the crosshair maps a pointer x to an index by a linear fraction of the
  element's width, which is only correct because `.cm-sampled` pins
  `aspect-ratio` to the viewBox. With `meet` and a mismatched box the SVG
  letterboxes and every reading is silently offset;
- with neither: it says there is nothing real to draw.

Two more rules on it. A LEVEL OUTSIDE THE DRAWN WINDOW IS NAMED, not silently
dropped — "buy point $1,497.60 is outside this window", because a missing line
otherwise reads as "this name has no buy point". And a level only widens the
price scale when it is within 10% of the range, or a far-below Chandelier stop
flattens the whole price path into a band to reach it.

`padR` on `SampledChart` is a LABEL GUTTER measured against the longest string
it can produce ("buy point $1,497.60" ≈ 120 viewBox units at 11px); at 64 the
high and low labels were clipped to "$262" and "$1719".

**A ROW CLICK NO LONGER OPENS THE DRAWER ABOVE 1400px** — it selects into the
context panel, which is the point of the split. The drawer is reached from the
panel's "Full analysis", from Enter on a row, or by any click below the split
width. The `drawer` shot took the old path and silently started timing out the
moment the split shipped.

**THE SCREENER IS A SPLIT WORKSPACE ABOVE 1400px.** Board on the left, the
selected name in a persistent panel on the right, both live at once. A drawer
covers the list you were reading, so comparing two names meant open → close →
re-find your place; beside it, arrowing down the list walks the panel with it.

- **1400px is arithmetic, not taste.** The compact column set is 8 tracks
  (120+1+92+96+1+200+96+62 = 668) plus 7 × 12px gap and 32px padding = **784**;
  the panel is 400 and the gap 24; `.wrap` caps at 1320. Under 1400 `useSplit()`
  returns false, the panel is not rendered at all, and a row click opens the
  drawer exactly as it always did. **Re-add the tracks if that template
  changes** — the failure is the table clipping its own columns inside its
  scroll container, which no document-overflow probe can see.
- **Leadership, Signals and Buy Status come out of the table in split mode**,
  because all three are in the panel in full for the selected name. They are
  hidden by `:nth-child(n + 8)` with the score re-shown at `:nth-child(12)`,
  so the seam `<span>`s still count — the same child-index trap the ≤880px rule
  has.
- **The panel's chart must keep the spark's aspect ratio.** `.cs-spark` is a
  200×46 viewBox with `preserveAspectRatio="none"`, so a fluid width with a
  fixed height squashes a year of price action by 1.8× — exactly what the
  screener's Trend column was fixed for. `aspect-ratio: 200 / 46`.
- **`userPicked` is a real latch, not defensiveness.** The panel follows the
  top-ranked row until you choose one. Without the latch the auto-select fired
  once against the EDITORIAL list — the default `rows` before the snapshot lands
  — pinned whatever was first there, and never moved, so the panel showed a name
  nowhere near the top of the list on screen.

**THE VIEW TABS ARE SHELL CHROME, NOT PAGE CONTENT.** `SubNav` renders as a
second sticky row directly under the product switcher, for both products, from
`App.jsx` — not from inside either view. It used to render below the cover,
about 370px down the page, in `--dim`: a first-time visitor did not see that
four more views existed, and the moment you scrolled into the 500-row board it
left the screen entirely, so mid-session there was no visible way to change view
at all. Three consequences worth knowing:

- **One stored `tt_tab` serves both products**, so it can hold an id belonging to
  the other one after a switch or from a `?tab=` deep link. `App` validates it
  against `RADAR_TABS` and the exported `SUBTABS` separately (`radarTab`,
  `csTab`), each falling back to its own first view. That is what lets one nav
  component serve both without either being able to select nothing.
- **The screener's tab state moved from `CanslimView` up to `App`**, because the
  control that changes it now lives in the shell. `SUBTABS` is exported rather
  than duplicated, which preserves the original point — the list of valid ids
  lives with the views, not with the chrome.
- **The shell is 106px, not 58px**, which the table's max-height depends on. See
  the `.cs-panel-scroll` note below. The sticky offset is
  `calc(58px + env(safe-area-inset-top))`, because the topbar takes the notch
  inset and a flat 58 slides the row under it on every notched phone.

**The mark is three tapered slashes, and its geometry is fixed** (`BrandMark` in
`components.jsx`, mirrored by `public/icon.svg`): a 10×10 grid in a `0 0 100 100`
box, heads at y 52/38/22 stepping up 14 units, all feet on y 82, 13 units wide at
the head and 5 at the tip. The 2.6:1 rake *is* the identity — never stretch it,
and never mirror it, because flipped the rise reads as a sell-off. It draws in
`currentColor`, and it keeps the **dark-mode** amber in both modes because it
always sits on a dark tile (`--mark-tile` is `#241610` dark / `#1C120C` light);
amber-deep `#A9531A` exists for text on paper, and putting it on near-black would
throw the contrast away.

**Two faces, and the split is by content, not by size.** **Inter Tight** is the UI
and display face; IBM Plex Mono carries **every number**, plus eyebrows and field
labels. It was Space Grotesk, whose quirks — the single-storey `a`, the flat-sided
`S`, the wide `x` — read as personality on a landing page and as noise across 500
dense rows, and which is the most recognisable "designed in 2024" display face
there is. Inter Tight keeps a neutral grotesque skeleton, sets tight enough that
headings hold without extra weight, and has true tabular figures. Two things
came with the swap: `.app` carried `font-feature-settings: " cv01", "cv11",
"ss03"`, where the **leading space made the first token invalid** and `cv11` asks
for exactly the single-storey `a` being removed — it is now `"cv05" 1`, the
tailed lowercase l, the one glyph that has to be told from `1` and `I` on a
screen of tickers; and the global `letter-spacing` dropped from -0.01em to
-0.004em, because Inter Tight is already drawn tight and the extra closes
counters at 12px and below.
`.mono` sets the mono face along with `tabular-nums` — a proportional face made
price columns ripple as digits changed width, which is the exact scanning motion
a tape exists to remove. The trap: `.mono` marks *data*, not *small text*. It
was applied to sentence copy back when the mono token was also Space Grotesk and
the distinction cost nothing; the moment it became a real monospace, fifteen
rules of body prose turned into code blocks. Prose takes `--font-ui` at 1.6 —
check what a `.mono` span actually contains before adding one.

**Light mode is paper, not an inverted dark theme** — but it is NEUTRAL paper
now, `#FAFAFA` with `#FFFFFF` cards. It was `#FAF6F1` warm, which existed to sit
beside an amber-led UI; with amber gone from the interface that was just a page
that looked slightly yellow for no reason, and it tinted every grey on it. Still
never pure white for the page itself, or the cards have nothing to lift off:
`#FFF` on `#FAFAFA` is a ~2% luminance step, so a soft shadow does the
separating and `--border` drops to 10%.

**A CUSTOM PROPERTY SUBSTITUTES AGAINST THE ELEMENT ITS DECLARATION SITS ON.**
The category and severity tokens are written in terms of the neutral ramp
(`--cat-geo: var(--dim)`), and they were first declared on `:root` — where
`--dim` does not exist, because every theme token lives on `.app`. The whole
declaration then becomes invalid at computed-value time and the token is simply
unset, which renders as the *previous* colour rather than as nothing, so it
looks like the change silently failed. They are declared on `.app` instead,
which is also the element `--dim` is re-cascaded on for light mode — so one
definition serves both themes and the two cannot drift.

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
  **And the tooltip fix was scoped to `@media (max-width: 640px)`, which is only
  the width it was measured at.** The dot sits at the END of the title, so on the
  radar — the longest title — `left: 0` plus 340px put its right edge at 783
  against a **700px** viewport, and the page slid sideways there for as long as it
  had been fixed on a phone. The anchoring is unconditional now; only the
  full-bleed variant stays in the phone block. Fixing a layout bug at one width
  and measuring at that width proves nothing about the others — which is why the
  harness now measures **every** shot, and why the sweep runs 390/700/1000/1200/1500.
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
- **`.cs-panel-scroll`'s max-height is arithmetic, and it TRACKS THE SHELL
  HEIGHT.** The screener's rows scroll inside the panel. At full page scroll its
  top lands at `100vh − panelHeight − (tail below the panel)`; that tail is
  ~166px, so the panel must satisfy `panelHeight ≤ 100vh − (166 + shell)` for
  the sticky column labels to clear the shell instead of hiding under it. It was
  `100vh − 240px` against a 58px topbar; moving the view tabs into the shell
  took it to 106px, so the value is now **`100vh − 288px`**. Changing what sits
  above OR below the table means re-deriving this and re-shooting at full
  scroll — the failure is silent and only visible once you scroll.
  Note `position: sticky` on that panel does **not** work (a plain sibling in
  the same container sticks fine; the scroll container does not) — don't reach
  for it as a shortcut.
- **`flex-basis` IS THE MAIN AXIS, so it changes meaning when the direction
  flips.** `.vixpanel` is `flex: 1.6 1 452px` — a width in the desktop row. The
  phone rule turns `.hero-row` into a column, at which point that 452px becomes
  a forced HEIGHT, and the panel measured 49% empty at 390px with its content
  occupying 230 of it. The trap was already documented in that media block and
  the reset had been applied to `.hero-left` ONLY; `.macroboard` and `.vixpanel`
  share it and were missed. Any panel with a flex-basis needs `flex: 0 0 auto`
  in a rule that flips the direction.
- **A GRID STRETCHES ITS ROWS TO THE TALLEST CELL**, which is the quietest way a
  panel ends up looking empty without being wrong. The portfolio's five panels
  measured 73 / 51 / 48% air on a two-position book purely because "Sector
  weight" has one row and was padded to match "Book health" beside it; the
  radar's macro and VIX panels did the same once the catalyst queue grew taller
  than them. `align-items: start` (or `flex-start`) lets each be as tall as what
  it holds. Reach for that before reaching for filler.
- **A COMPONENT THAT RETURNS `null` WHILE LOADING SHIFTS THE PAGE.** `StockTape`
  rendered nothing until two names had prices, then appeared — and the cover and
  the whole board below it dropped 36px at once. Measured as **CLS 0.2113** on
  the screener against Google's 0.1 "good" threshold, and it was the entire
  shift on that page (the radar has static events from the first frame and
  measures 0). It reserves the strip now — `min-height: 36px`, an empty `.tape`
  that claims nothing — and the same page measures **0.0081**. Anything that
  occupies vertical space before data lands must hold that space from the first
  frame.
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
- **A fluid box with a fixed viewBox redraws the same data differently at every
  width.** The screener's trend spark had a 240×40 viewBox in a cell that was
  `minmax(170px, 1.05fr)` — the widest fluid track in the table — so it rendered
  302×40 at 1500px with `preserveAspectRatio="none"` stretching every line 26%
  horizontally, inside a strip that was already 7.5:1. A year of price action
  flattened into a gentle slope, and every uptrend looked like every other one.
  The cell is a **fixed 200px** now and `.cs-spark` is exactly 200×46, so the
  drawing is 1:1 at every viewport. A shape column whose shape depends on the
  window is not reporting the shape. Capping it also handed ~90px back to the
  ticker column, which is what was clipping "Robinhood Markets".
  Note `.cs-row` carries `content-visibility: auto`, so its
  `contain-intrinsic-size` is a real placeholder height — a stale one makes the
  scrollbar jump while scrolling. Re-measure it when a row's contents grow.
- **`.cs-row`'s twelve tracks are a HARD MINIMUM, and the overflow probe cannot
  see it.** They sum to 1025px; add 11 × 14px of gap and 40px of padding and the
  table needs **1219px**, while `.wrap` gives `100% - 56px`. Below a ~1275px
  viewport the Buy Status and Score columns were simply cut off — not scrollable,
  not dropped, just gone, with nothing on screen saying so, on every 1280×800 and
  1366×768 laptop. It never tripped the document-overflow check because the table
  is clipped by its own scroll container, which is exactly the blind spot that
  measurement has: `scrollWidth` catches a page that slides sideways, not a panel
  that quietly eats its own columns. **Any change to that template means
  re-adding the tracks and comparing against 1144 (a 1200px viewport).** The band
  from 881px to 1275px now scrolls the table horizontally; above it nothing does.
  Reclaiming the Leadership track when the LEADERS tiles became letters (178px →
  110px) is what moved the fit from 1343 to 1275.
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
  **And the LANDING PAGE has its own copy of this header**, which was caught the
  same way: `.lp-nav` hid at ≤640, so from there to ~1050 the mark, four links
  and the CTA came to 727px of max-content against a **700px** viewport. It hides
  at ≤880 now — where the page already goes single-column — *and* carries
  `min-width: 0` with a scroll strip, so a fifth link cannot re-break it.
- **`overflow: hidden` CLIPS THE PAINT; IT DOES NOT LOWER MIN-CONTENT.** `1fr` is
  `minmax(auto, 1fr)`, and that `auto` is the track's min-content — so a
  `white-space: nowrap` child sets the floor no matter how thoroughly it is
  clipped. The Calendar's `.cal-ev` is nowrap-plus-ellipsis, and a long release
  title pushed its column out until the seven tracks measured **648px against a
  390px viewport**. `min-width: 0` on the grid item is what makes an ellipsis
  actually reachable. The header above it was the flex trap in the same view:
  title, count and two scope buttons at ~416px of max-content.
- **`StatStrip` is five facts, so it stays five columns.** Below 940px it wrapped
  to 2-up, which is three rows and ~330px of shared chrome above every radar
  view — on exactly the screens with the least height to spare, and against a
  layout thesis that specifies a *row* of supporting facts. It is
  `repeat(5, minmax(150px, 1fr))` with a 750px floor now: that fits outright down
  to ~806px and thumbs sideways below, for ~110px. **The scroll sits on the inner
  `.wrap`**, not on `.statstrip` — the strip is full-bleed, and scrolling the
  outer box would drag the page gutter away at both ends of the travel.
- **A month is a SHAPE, so the Calendar scrolls rather than collapsing.** Both
  grids live inside one `.cal-scroll` — the day labels have to be in the same
  scroller as the cells or they desync from the columns they name — with a 566px
  `min-width` on the phone only. It is deliberately not re-rendered as a list:
  the Full Timeline tab is already the list rendering of exactly these events,
  and a second one would delete the only thing the Calendar adds.
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

**Every shot now also MEASURES horizontal overflow**, because the trap below has
shipped four times and measuring it by hand only happens when someone remembers
to. After each screenshot the harness compares
`documentElement.scrollWidth` against `clientWidth`, and on a mismatch prints
`OVERFLOW: document N > viewport M · widest: <tag>.<class> → Npx`, marks the
shot ⚠ and counts it as a failure. A clean sweep means running the widths that
actually break: 390 (phone), 700, 1000, 1200 (the topbar's crowded band) and 1500.

**Naming the culprit took three tries, and the two dead ends are the interesting
part.** The element reported is the *deepest* node that overruns — its ancestors
only overrun because it does, so blaming the outer container sends you to the
wrong file. But `getBoundingClientRect()` is **unclipped**, so two whole classes
of element outrank every real offender: anything inside `overflow: hidden` (the
marquee tape is one `width: max-content` track holding ~6000px of quotes, and it
was blamed first), and anything inside a `position: fixed` subtree (the closed
drawer sits at `translateX(100%)`, ~1320px out, and was blamed second — fixed is
out of flow against the viewport and cannot extend `scrollWidth` at all). The
probe walks ancestors and clamps to any clipping box, and discards fixed
subtrees outright. Only then did it name `span.infodot-pop`.

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

**The terminal is the front door.** `LANDING_FOR_NEW_VISITORS` is now `false`, so
a bare `/` renders the app for everyone — the landing survives at `/start` and
`/welcome` and is one link away when you want to show somebody. The page itself
is good and its copy is specific rather than generic; what read as cheesy was the
SHAPE, a three-screen scroll with a hero, product sections and feature-card grids,
which is the standard marketing pattern whatever the words say. The product is the
better argument: the first screen already carries the market trend, distribution
days and a board of real names. The disclaimer gate is unaffected — it lives in
`App.jsx`, not the router, so a first-time visitor still meets it.
An explicit path always wins, and a URL carrying app state (`?ev=`, `?tk=`, `?p=`,
`?tab=`) is a deep link straight to the terminal.
**The `landing` shot must point at `/start`.** It used to shoot `/`, and when the
flag flipped it silently started photographing the terminal instead — a shot that
covers nothing looks exactly like a shot that passes. The
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

## Shipping and monetizing

**`Boundary` (`boundary.jsx`) wraps each VIEW, not the app.** React unmounts the
whole tree when a render throws, so one malformed snapshot field used to white-
page the site for every visitor at once with nothing on screen saying why — the
highest-severity failure this codebase had and the cheapest to contain. Per-view
means the crash stays local: the shell, the nav and the other eight views keep
working. `resetKey` is the view id, so switching away and back retries rather
than leaving it dead for the session. It prints the error text on purpose —
"something went wrong" tells the user nothing and tells you nothing when they
screenshot it.

**Social cards are generated, not screenshotted** (`npm run og` →
`public/og.png`). It is brand-only — the mark, the wordmark, one line — because
every shot this repo can take headlessly comes from the synthetic fixture, and
fabricated prices on the card that represents the product everywhere it is
linked would break the governing rule in the most public place available. A
real-data card would have to be rendered server-side from a live snapshot and
carry its as-of.

**`track.js` is a no-op until `VITE_ANALYTICS_SRC` and `VITE_ANALYTICS_SITE` are
set**, so the loader compiles to a dead branch and no request is made. Events
carry enum-ish props only — a view id, a filter name — never a ticker the user
searched or a position size. On-device state is on-device by design and
analytics is not a loophole around it.

**The screener is the default product** (`tt_product` defaults to `canslim`).
The radar was, which landed a first-time visitor on macro-event surveillance
rather than on the differentiated board.

**What is NOT built, and what it needs.** There are no accounts, no server-side
user state and no payment path — every one of the eight `tt_*` keys is
localStorage, so a user who opens the site on a second device starts empty. That
is the monetization blocker, and it is a set of decisions before it is code:
which auth provider, what is free versus paid, and what the paid tier actually
delivers. The highest-value paid capability is almost certainly **alerts that
fire server-side** (a name enters its buy zone, a trail is breached, a catalyst
is N days out) plus a daily digest — it needs accounts anyway, and it converts a
site you remember to visit into a service that reaches you. The strongest
credibility feature is a **track record for the LEADERS model**, computable from
bars already stored: without it the score is an assertion.

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
