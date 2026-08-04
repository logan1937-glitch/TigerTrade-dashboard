# TigerTrade Terminal — working notes for Claude

A dark, institutional trading terminal: two products under one shell, switched
from the top bar. React 18 + Vite, no framework beyond that, deployed on Vercel
with serverless functions under `api/`.

1. **Volatility & Momentum Radar** — macro-catalyst surveillance. Views: Radar,
   Full Timeline, Calendar, Catalysts (internal tab id: `playbook`).
2. **Leadership Screener** — a relative-strength growth screener built on the
   TigerTrade Leadership Model (LEADERS). Views: Screener, Market Map, Market
   Health, Playbook, Portfolio.

## Commands

```bash
npm run dev            # vite dev server
npm run build          # production build → dist/
npm test               # both suites
npm run test:earnings  # 55 assertions against a stubbed Yahoo/Finnhub
npm run test:swing     # 20 assertions on the ATR/EMA/Launchpad math
npm run shots          # screenshot every view headlessly → shots/
```

`npm run shots` is the visual-verification loop — see **Verifying UI changes**
below. It is the fastest way to know whether a CSS change did what you meant.

## The rule that governs everything: never fabricate data

This is a trading tool. A plausible-looking wrong number is worse than a blank.
Every figure on screen is real or absent — there is no third option, and no
placeholder that could be mistaken for a measurement.

- A value whose input is missing renders `—`, never `0`, never an estimate.
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
- **`macro`, `vix` and `earnings` are set in exactly one place** — inside the
  snapshot success branch. If the snapshot answers without them, nothing else
  ever fills them in. This is why a failing FMP quota blanks the macro board,
  the VIX panel *and* the S&P earnings dates simultaneously.

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

Any of these is `null` when there isn't enough history. `launchpad()` **drops**
a name it can't measure rather than assuming it passes.

**The Playbook explains itself from its own source.** `FILTERS` and `SORTS` in
`playbook.jsx` each carry their `test`/`val` function *and* the `desc`/`why`
text the "How to read this" panel prints. They're one object, so the explainer
cannot drift from the code that runs — adding a filter adds its documentation by
construction. Thresholds are named exports (`LAUNCHPAD_MAX_SPREAD` 2%,
`TIGHT_MAX_CX` 0.55, `LIQUID_MIN_DV` $20M, `ERN_BLACKOUT_DAYS` 7). Filters stack
with AND; the chip counts are measured against the **full** measurable set, not
the post-filter one, so they don't move as you stack.

**Serverless endpoints** (`api/`):

| File | Does |
|---|---|
| `snapshot.js` | Nightly precompute of the whole universe. Cron: weekdays 22:00 UTC. Serves from Vercel Blob when `BLOB_READ_WRITE_TOKEN` is set — **without it every request recomputes**, which burns the FMP quota fast. Check `"blob"` / `"served"` in its response. |
| `earnings.js` | Report dates for names outside the S&P 500. Finnhub (keyed) → Yahoo chart (crumb-free) → Yahoo quoteSummary (crumb) → stale cache. FMP is deliberately absent — verified incapable for these names. |
| `yahoo.js` | Yahoo chart proxy — quotes + adjusted daily history. |
| `fmp.js` | Allow-listed FMP proxy; keeps the key server-side. |
| `claude.js` | Anthropic proxy for the AI features. |
| `_upstream.js` | Optional residential proxy (`MASSIVE_PROXY_URL`) for the unkeyed, IP-defended Yahoo calls only. |

**Env vars:** `FMP_API_KEY`, `FINNHUB_API_KEY`, `BLOB_READ_WRITE_TOKEN`,
`ANTHROPIC_API_KEY`, `MASSIVE_PROXY_URL`, `MASSIVE_PROXY_BULK`. All optional —
each feature degrades to a stated-unavailable state without its key.

**Client state** is `localStorage`, on-device only, never sent anywhere:
`tt_product`, `tt_tab`, `tt_mode`, `tt_watch`, `tt_alerts`, `tt_positions`,
`tt_custom`, `tt_disclaimer_ack_v1`, and the Playbook's `tt_pb_filters`,
`tt_pb_sort`, `tt_pb_help`, `tt_pb_risk` (account size + risk % for sizing).

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
`radarScope.jsx`, `catalystTimeline.jsx`, `commandPalette.jsx`, `disclaimer.jsx`.

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

## Verifying UI changes

Reading a diff cannot tell you whether a CSS change worked. Screenshot it:

```bash
npm run build && npm run shots -- --theme both
npm run shots -- --views drawer,portfolio --width 420   # check the breakpoints
npm run shots -- --views radar --live                   # against real APIs
```

Output lands in `shots/` (gitignored). Views: `radar`, `timeline`, `calendar`,
`catalysts`, `screener`, `map`, `health`, `playbook`, `portfolio`, `drawer`.
Read the PNGs — page errors are reported inline next to each shot.

Note the radar product's 4th tab has the internal id `playbook` but renders (and
is labelled) **Catalysts**; the screener's Playbook is the swing-setup view. The
shot ids disambiguate them — don't "fix" that mismatch by renaming one.

By default every `/api/*` call is served from a deterministic fixture in
`scripts/shots.mjs`, so shots need no keys, no network, and the same commit
always yields the same pixels. **If you change a snapshot field's shape, update
that fixture** — it mirrors `api/snapshot.js`'s real output, and a mismatch
shows up as a page error next to the shot.

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
