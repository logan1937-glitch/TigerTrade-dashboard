// ── live economic calendar (FMP) ──────────────────────────────────────────────
// Pulls real release dates + consensus/previous/actual through the /api/fmp
// proxy, then RE-DATES the curated radar events (the `~` projected ones) to
// their true dates and attaches release data. Curated ids — and therefore the
// desk scenario/hedge briefings keyed to them — are preserved. Unmatched
// high-impact US releases are appended as extra "data" events.
//
// Degrades to null when the key's tier doesn't include the calendar, so the
// radar silently keeps its curated projected dates. Never fabricates data.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const label = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
const daysFromToday = (d) => {
  const now = new Date();
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const t1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((t1 - t0) / 86400000);
};

// keyword matchers for the curated projected events we re-date (by event id)
const MATCHERS = {
  1:  { re: /boj|bank of japan/i, countries: ["JP"] },                       // BoJ
  2:  { re: /fed(eral)? (funds|interest) rate|fomc.*(decision|rate)|interest rate decision/i, countries: ["US"] }, // FOMC
  6:  { re: /ism manufacturing pmi/i, countries: ["US"] },                   // ISM mfg
  7:  { re: /non ?farm payrolls/i, countries: ["US"] },                      // NFP
  8:  { re: /ism (services|non-manufacturing) pmi/i, countries: ["US"] },    // ISM services
  10: { re: /(^|\s)(core )?(cpi|inflation rate)/i, countries: ["US"] },      // CPI
  11: { re: /(^|\s)(core )?ppi|producer price/i, countries: ["US"] },        // PPI
  13: { re: /ecb.*(rate|decision)|deposit facility rate/i, countries: ["EMU", "EA", "EU"] }, // ECB
};

export async function fetchEcon() {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  for (const ep of ["economic-calendar", "economics-calendar"]) {
    try {
      const r = await fetch(`/api/fmp?endpoint=${ep}&from=${from}&to=${to}`);
      if (!r.ok) continue;
      const d = await r.json();
      if (!Array.isArray(d) || !d.length || d[0].event == null) continue;
      return d
        .filter((e) => e.date && e.event)
        .map((e) => ({
          date: new Date(e.date.replace(" ", "T") + (e.date.includes("Z") ? "" : "Z")),
          event: e.event, country: e.country || "", impact: (e.impact || "").toLowerCase(),
          previous: e.previous ?? null, estimate: e.estimate ?? null, actual: e.actual ?? null,
          unit: e.unit || "",
        }))
        .filter((e) => !Number.isNaN(e.date.getTime()));
    } catch { /* try next spelling */ }
  }
  return null;
}

// merge the live calendar into the curated event list (non-destructive copy)
export function mergeEcon(events, econ) {
  if (!econ || !econ.length) return { events, liveCount: 0 };
  const out = events.map((ev) => ({ ...ev }));
  let liveCount = 0;

  const attach = (ev, hit) => {
    const days = daysFromToday(hit.date);
    ev.date = label(hit.date);
    ev.t = -days;
    ev.sort = days + (ev.sort - Math.trunc(ev.sort));
    ev.past = days < 0;
    ev.approx = false;
    ev.live = true;
    ev.econ = { previous: hit.previous, estimate: hit.estimate, actual: hit.actual, unit: hit.unit, name: hit.event };
    liveCount++;
  };

  // 1) re-date curated projected events to their true calendar dates; exact-dated
  //    ones (e.g. FOMC) roll forward to the next occurrence once they've passed
  for (const ev of out) {
    const m = MATCHERS[ev.id];
    if (!m || (!ev.approx && !ev.past)) continue;
    const hits = econ
      .filter((e) => m.re.test(e.event) && (!m.countries || m.countries.includes(e.country)))
      .filter((e) => daysFromToday(e.date) >= 0)
      .sort((a, b) => a.date - b.date);
    if (hits.length) attach(ev, hits[0]);
  }

  // 2) append unmatched upcoming high-impact US releases as extra data events
  const covered = new Set(out.filter((e) => e.econ).map((e) => e.econ.name));
  const extras = econ
    .filter((e) => e.country === "US" && e.impact === "high" && daysFromToday(e.date) >= 0 && !covered.has(e.event))
    .filter((e) => !/fed(eral)? (funds|interest) rate|non ?farm|(^|\s)cpi|ism (manufacturing|services)/i.test(e.event))
    .sort((a, b) => a.date - b.date)
    .slice(0, 12)
    .map((e, i) => {
      const days = daysFromToday(e.date);
      const desc = [
        e.previous != null ? `Prev ${e.previous}${e.unit}` : null,
        e.estimate != null ? `Cons ${e.estimate}${e.unit}` : null,
      ].filter(Boolean).join(" · ") || "High-impact US economic release.";
      return {
        id: 1000 + i, date: label(e.date), approx: false, range: "", live: true,
        t: -days, sort: days + 0.5, sev: "medium", cat: "data",
        title: e.event, desc,
        econ: { previous: e.previous, estimate: e.estimate, actual: e.actual, unit: e.unit, name: e.event },
      };
    });

  return { events: [...out, ...extras], liveCount: liveCount + extras.length };
}

// compact formatter for release values
export const fmtEconVal = (v, unit) => (v == null ? "—" : `${v}${unit || ""}`);
