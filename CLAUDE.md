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

**Serverless endpoints** (`api/`):

| File | Does |
|---|---|
| `snapshot.js` | Nightly precompute of the whole universe. Cron: weekdays 22:00 UTC. Serves from Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set — **without it every request recomputes**, which burns the FMP quota fast. Check `"blob"` / `"served"` in its response. **Adding a field to the payload means bumping `SCHEMA`** — Blob serves the stored copy verbatim, so without a bump the new field is simply absent until the next cron, with nothing on screen to explain why. A mismatch recomputes on the first request after deploy. `?refresh=1` forces it by hand. |
| `earnings.js` | Report dates for names outside the S&P 500. Finnhub (keyed) → Yahoo chart (crumb-free) → Yahoo quoteSummary (crumb) → stale cache. FMP is deliberately absent — verified incapable for these names. |
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
the sizing box divides by), plus `tt_pf_atr` — the ATR multiple, **shared** by
the portfolio's trailing-stop column and the Playbook's sizing box on purpose,
so a position sized in one is monitored on the same number in the other.

## Design system

`src/terminal.css` (~1,700 lines) is the whole design system: **106 CSS custom
properties** across four themes.

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
`--brand --brand-ink` · `--cat-growth --sev-high --sev-extreme` ·
`--radius --radius-sm` · `--font-ui --font-display --font-mono` ·
`--track-display --track-label --track-meta --track-data --track-wide`

Use tokens. Never hard-code a hex — it will be wrong in three of four themes.

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
`vol`, `volsort`, `screener`, `map`, `health`, `playbook`, `portfolio`, `drawer`.
The fixture gives every name a sector AND an industry from `FIX_SECTORS`, and a
6-point `rrg` tail. Both were flat for a long time, and the cost was silent: one
industry meant the group panel rendered a single group, and a missing `rrg` left
the whole relative-rotation panel on "Waiting for live data…" in every shot ever
taken. A fixture that under-varies doesn't fail — it just stops testing.
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
directions, so a shared-state regression shows up as both panels moving together. It was briefly a VIX term-structure view; that
was an options-desk answer to a momentum-trader question — contango is a fact
with no decision attached unless you trade options — so it now shows where
capital actually traded. **There is no options flow anywhere in this app and it
is not an oversight:** neither FMP nor Yahoo exposes chains, put/call ratios or
unusual-options activity at any reachable tier, the page says so, and inventing
it would be the worst thing this codebase could ship. `tt_tab` still holds `"playbook"` on
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
