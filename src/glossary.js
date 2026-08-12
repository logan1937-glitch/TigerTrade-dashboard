/* Every term the product uses that a competent trader might still read
   differently than we mean it — defined once, here.

   The point is not documentation. It is that a label on a chip and the sentence
   explaining that chip cannot drift apart if they are the same object, which is
   the same reason `FILTERS` in playbook.jsx carries its own `why` text. Adding a
   term to the UI means adding it here, and the tooltip comes for free.

   `short` is the tooltip — one sentence, and it must say what the thing IS, not
   why it is good. `long` is the panel: the definition, then the threshold or
   formula, then the honest caveat. A term with no caveat usually means we have
   not thought about when it misleads. */

export const GLOSSARY = {
  buyZone: {
    term: "In buy zone",
    short: "Price is at or just above the pivot — within the 5% band where a breakout is still buyable.",
    long: `The pivot is the high of the name's most recent base. "In buy zone" means the last
      price sits between that pivot and 5% above it. Past 5% the row reads Extended instead,
      because the further you chase a breakout the more of the move you are paying for and the
      wider the stop has to be to survive normal noise.
      It is an arithmetic reading of price against a base, not a recommendation, and it says
      nothing about whether the market as a whole is in an uptrend — the S factor does that.`,
  },
  extended: {
    term: "Extended",
    short: "More than 5% above the pivot — the entry has already run, so the risk is no longer defined by the base.",
    long: `The same measurement as the buy zone, past its far edge. An extended name can keep
      going; the problem is that a stop under the base is now far enough below price that a
      normal position size risks more than you intended. Wait for a new base, or size against
      a stop you choose rather than the one the pattern implies.`,
  },
  watchStatus: {
    term: "Watch",
    short: "Below the pivot — building or repairing a base, with no entry defined yet.",
    long: `Price is under the most recent base high. There is nothing to buy against yet: the
      pivot is where the name proves demand, and until it trades there the level is a forecast.`,
  },
  pivot: {
    term: "Pivot",
    short: "The high of the most recent base — the price at which a breakout is confirmed.",
    long: `Taken from the highest close of the base window, ignoring the last five sessions so
      that today's push does not define its own pivot. Every buy-zone reading is measured from
      this number.`,
  },
  rs: {
    term: "RS",
    short: "Relative strength: a 1–99 percentile of this name's return against every other name loaded.",
    long: `Not a return, a RANK. RS 92 means the name outperformed 92% of the tracked universe
      over the window. It is defined only relative to that universe, so loading the extended
      tier genuinely re-ranks the field — a bigger pool means a different percentile for the
      same performance. Leaders in this model score 85 and above.`,
  },
  score: {
    term: "Score",
    short: "A 0–100 momentum score built from RS, stage, distribution days and volume signature.",
    long: `Purely technical: no fundamentals are used anywhere in it, so a curated name and one
      the screener found score on the same basis. RS is the largest single input at 45%.
      Illiquid names take a penalty. A score is a model output and not a price target.`,
  },
  stage: {
    term: "Stage",
    short: "Weinstein stage 1–4: basing, advancing, topping, declining, read off the 30-week average.",
    long: `Stage 2 is the advancing phase this screener hunts for, and stage 4 the declining one
      the method says to be out of whatever the P&L says. Derived from price against its 30-week
      moving average and the slope of that average. A stage is a regime label, and regimes are
      obvious in hindsight and ambiguous at the turn.`,
  },
  offHigh: {
    term: "Off high",
    short: "How far below the 52-week high the name is trading, as a percentage.",
    long: `A leader by definition sits near its own highs, so this is the single fastest read on
      whether a name still qualifies. Within 5% is the leadership band. It measures distance,
      not direction — a name 3% off its high could be pulling back or pushing up into it.`,
  },
  rvol: {
    term: "RVOL",
    short: "Relative volume: today's shares traded against this name's own 50-day average.",
    long: `2.0× means twice its normal turnover. It is scale-free, so a mid-cap and a mega-cap
      can be compared directly — which is exactly what raw dollar volume cannot do, since the
      biggest names are always at the top of that list whether or not anything happened.
      High RVOL says participation changed. It does not say which side did the buying.`,
  },
  dollarVol: {
    term: "Dollar volume",
    short: "Shares traded times price — where capital actually went today, in dollars.",
    long: `The measure of whether a move is tradable at size. It is dominated by the mega-caps
      every single day, which is why it sits beside RVOL rather than instead of it: one answers
      "where is the money", the other "where is something unusual happening".`,
  },
  pocketPivot: {
    term: "Pocket pivot",
    short: "An up day whose volume exceeds every down day's volume in the prior ten sessions.",
    long: `A constructive volume signature: buyers showed up harder than any recent seller.
      It is a demand fingerprint inside a base, and it is a single day — one is a hint, a cluster
      is a signal.`,
  },
  distDays: {
    term: "Distribution days",
    short: "Sessions in the last 25 where the index fell on higher volume than the day before.",
    long: `Institutional selling leaves this fingerprint. Four or five inside a 25-day window is
      the level at which this method stops taking new entries. It counts the index, not your
      position — it is a market-condition reading, not a signal about any one name.`,
  },
  atrTrail: {
    term: "ATR trail",
    short: "A trailing stop set a multiple of ATR(14) below price, which ratchets up as price rises.",
    long: `The width — a percentage of price and a number of points — is what you type into a
      broker's trailing-stop field. The broker then applies that width to the running peak of
      your holding period, so the level follows the position up and never comes back down.
      It always has a width whenever ATR exists, so it can size a name whose Chandelier level is
      already breached.`,
  },
  chandelier: {
    term: "Chandelier Exit",
    short: "The 22-day highest high less three times ATR(14) — where the setup is wrong.",
    long: `Anchored to where the name has BEEN, which makes it the setup's invalidation level
      rather than a risk width. It can sit above the current price; that means the trail is
      already breached, and there is no long-side distance to size against — undefined, not
      conservative. It is arithmetic, never an order.`,
  },
  openRisk: {
    term: "Open risk",
    short: "What the book gives back if every trail triggers from today's prices.",
    long: `Summed over every sized position as (today's price − where its trail actually sits)
      × shares. Because the trail has already ratcheted to the peak of your holding period, this
      is smaller than the trail width on positions that are working. A position whose trail sits
      above price is EXCLUDED rather than netted — subtracting it would flatter the total — and
      sized positions with no ATR are counted as unmeasured and named.`,
  },
  launchpad: {
    term: "EMA Launchpad",
    short: "The 21, 50 and 65-day EMAs all within 2% of each other — every timeframe agreeing on price.",
    long: `Three averages converging means short, medium and longer-term holders have the same
      cost basis. Moves out of that state tend to be decisive in whichever direction they
      resolve — which is the point: it identifies a coil, not a direction.`,
  },
  contraction: {
    term: "Contraction",
    short: "The last 10 sessions' high-low range divided by the last 40 — below 1 means the range is tightening.",
    long: `Supply drying up after an advance. Below 0.55 the last two weeks are meaningfully
      quieter than the prior two months. A contraction with no preceding impulse is just a quiet
      stock, which is why the Impulse column sits beside it.`,
  },
  trailLocked: {
    term: "Trail locked",
    short: "The trailing stop has ratcheted above your cost — the position can no longer close for a loss at its stop.",
    long: `Not a guarantee: a gap through the level still fills below it, and an earnings print
      is the most common way that happens. It means the arithmetic stop is above the arithmetic
      entry, nothing more.`,
  },
  confirmedUptrend: {
    term: "Confirmed uptrend",
    short: "The index is above its 50-day average with distribution days under the limit — the condition this method requires before buying.",
    long: `The S in LEADERS. Most of the damage in a momentum strategy comes from taking good
      setups in a bad tape, so the market condition is a factor on every row rather than a
      separate screen you might forget to check.`,
  },
};

// so a tooltip can be attached by key without importing the whole object twice
export const termOf = (k) => GLOSSARY[k] || null;
