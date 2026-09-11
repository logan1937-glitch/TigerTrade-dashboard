import { useMemo, useState } from "react";
import { TT } from "./tt.js";
import { SEV_LABEL } from "./components.jsx";
import { useStored } from "./store.js";

const CAL_MAX = 4;   // ticker pills shown per day before the rest fold behind a "+N"

/* ---------------------------- CALENDAR -----------------------------
   The macro catalysts this product tracks are only half of what moves a book in
   a given week — the other half is the earnings the tracked universe is about to
   report. Both sit in the same month grid: scheduled catalysts first, then
   report dates.

   THE UNIVERSE IS THE DEFAULT. It used to open on "your names", to keep the full
   S&P 500 from burying the catalysts — but every `tt_*` key is on-device, so a
   first-time visitor holds nothing and watches nothing, and the view they met
   was a month of empty cells. A calendar showing nothing looks broken rather
   than looks empty, and it hid the fact that this grid carries real report dates
   at all. The burying it was guarding against is already handled where it
   belongs: macro events render before the tickers in every cell, and `CAL_MAX`
   caps the chips per day with the rest collapsing into a count.

   The choice persists, so narrowing to your own book is a decision you make once
   rather than one made for you before you have a book. */
export function CalendarView({ rows = [], onOpenStock }) {
  const m = TT.MONTH;
  const [scope, setScope] = useStored("tt_cal_scope", "all");
  // which day is expanded past CAL_MAX — render-local, never persisted: it is a
  // position in this month's grid, not an identity
  const [openDay, setOpenDay] = useState(null);
  const cells = [];
  for (let i = 0; i < m.firstDow; i++) cells.push({ out: true, num: 0 });
  for (let d = 1; d <= m.days; d++) cells.push({ out: false, num: d });
  while (cells.length % 7 !== 0) cells.push({ out: true, num: 0 });
  const nEvents = Object.values(TT.calEventsByDay).reduce((n, a) => n + a.length, 0);

  // REAL report dates bucketed into this month's day cells. "Yours" is anything
  // you hold, watch, or dated yourself; "universe" is every tracked name.
  const { byDay, nErn, nMine, nAll } = useMemo(() => {
    const inMonth = rows.filter((r) => {
      const d = new Date(r.date + "T00:00:00");
      return d.getFullYear() === m.year && d.getMonth() === m.monthIndex;
    });
    const isMine = (r) => r.held || r.watched || r.mine;
    const shown = scope === "all" ? inMonth : inMonth.filter(isMine);
    const map = {};
    for (const r of shown) {
      const day = new Date(r.date + "T00:00:00").getDate();
      (map[day] = map[day] || []).push(r);
    }
    // your own names lead each day, then alphabetical so the order is stable
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (isMine(b) ? 1 : 0) - (isMine(a) ? 1 : 0) || (a.tk < b.tk ? -1 : 1));
    }
    return { byDay: map, nErn: shown.length, nMine: inMonth.filter(isMine).length, nAll: inMonth.length };
  }, [rows, scope, m.year, m.monthIndex]);

  return (
    <div className="wrap">
      <div className="cal-head">
        <div className="cal-title">{m.name}</div>
        <div className="cal-headr">
          {/* was an inline style block — hard-coded 11px, .08em and its own
              uppercase, none of which the design system could reach. `.listmeta
              .count` is the shared voice for exactly this line. */}
          <div className="cal-count">
            {nEvents} scheduled catalyst{nEvents === 1 ? "" : "s"} this month
            {/* A COUNT IS NOT A DIRECTION. This was drawn in `--pl-up`, so "3
                reports" read as a gain — the identity-colouring the rule
                forbids. And both arms of the plural were "s", so it printed
                "1 reports". */}
            {nErn > 0 && <> · <span className="cal-count-ern">{nErn} report{nErn === 1 ? "" : "s"}</span></>}
          </div>
          <div className="cal-scope">
            <button className="seg-btn" data-active={scope === "yours" || undefined} onClick={() => setScope("yours")}
              title="Names you hold, watch, or dated yourself">Your names {nMine}</button>
            <button className="seg-btn" data-active={scope === "all" || undefined} onClick={() => setScope("all")}
              title="Every tracked name with a known report date">Universe {nAll}</button>
          </div>
        </div>
      </div>
      {/* ONE SCROLL STRIP AROUND BOTH GRIDS. A month IS a seven-column shape —
          that is the whole reason this view exists beside the Timeline, which is
          already the list rendering of the same events — so on a phone it scrolls
          rather than collapsing. The day labels have to live inside the same
          scroller as the cells or they desync from the columns they name. */}
      <div className="cal-scroll">
      <div className="cal-dow">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="cal-grid">
        {cells.map((c, i) => {
          const evs = !c.out ? (TT.calEventsByDay[c.num] || []) : [];
          return (
            <div className="cal-cell" key={i} data-out={c.out || undefined} data-today={(!c.out && c.num === m.today) || undefined}>
              {!c.out && <div className="cal-num">{String(c.num).padStart(2, "0")}</div>}
              {evs.map((e, j) => (
                /* the chip ellipsises inside a 74px phone cell, and it carried
                   no title — so "Retail Sales" read as "Reta…" with no way to
                   find out what it was */
                <div className="cal-ev" key={j} style={{ "--c": TT.CAT_MAP[e.cat].color }}
                  title={`${e.t}${TT.CAT_MAP[e.cat] ? ` · ${TT.CAT_MAP[e.cat].label}` : ""}`}>{e.t}</div>
              ))}
              {/* TWO DIFFERENT KINDS OF THING, DRAWN DIFFERENTLY. A scheduled
                  macro release and a company reporting were both `.cal-ev`
                  chips — same face, same tint, same left rule — and since the
                  event categories all resolved to `--dim`, "CPI" and "KGC" sat
                  in a cell looking like the same object. That was survivable
                  while the calendar opened on your own handful of names; with
                  the universe as the default it is the common case.

                  The macro chips stay stacked above, because this is a
                  catalyst product and they are the headline. Reports become a
                  WRAPPED ROW of symbol pills, which reads as a list of tickers
                  rather than as more events, and which scales: a heavy day in
                  earnings season is a dozen names, and a dozen stacked chips
                  would push the macro release out of the visible cell. */}
              {!c.out && (byDay[c.num] || []).length > 0 && (
                <div className="cal-erns">
                  {(byDay[c.num] || []).slice(0, openDay === c.num ? Infinity : CAL_MAX).map((r) => (
                    <button className="cal-ern mono" key={"e" + r.tk} data-mine={(r.held || r.mine) || undefined}
                      onClick={() => onOpenStock && onOpenStock({ tk: r.tk })}
                      title={`${r.tk}${r.name && r.name !== r.tk ? ` — ${r.name}` : ""} reports`
                        + `${r.time === "bmo" ? " before the open" : r.time === "amc" ? " after the close" : ""}`
                        + `${r.mine ? " on the date you set" : r.est ? " (projected date — not yet confirmed)" : ""}`
                        + `${r.held ? " · your position" : r.watched ? " · on your watchlist" : ""} — open full analysis`}>
                      {r.tk}{(r.held || r.mine) && <span className="cal-ern-d">◆</span>}
                    </button>
                  ))}
                  {(byDay[c.num] || []).length > CAL_MAX && (
                    /* a BUTTON, not a div with a title. The overflow is the
                       common case now, and a `title` is mouse-only — the same
                       reason the glossary term is a button. It expands the day
                       in place rather than hiding the rest in a tooltip. */
                    <button className="cal-more mono" onClick={() => setOpenDay(openDay === c.num ? null : c.num)}
                      aria-expanded={openDay === c.num}
                      /* the accessible name comes from the CONTENT, which is
                         "+3" — a screen reader would announce a bare number for
                         a control whose whole job needs explaining */
                      aria-label={openDay === c.num
                        ? `Show fewer reports on the ${c.num}th`
                        : `Show all ${(byDay[c.num] || []).length} reports on the ${c.num}th`}
                      title={openDay === c.num ? "Show fewer" : `Show all ${(byDay[c.num] || []).length} reports`}>
                      {openDay === c.num ? "less" : `+${(byDay[c.num] || []).length - CAL_MAX}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/* ---------------------------- TIMELINE ----------------------------- */
export function TimelineView({ events, onOpenFull }) {
  const groups = [];
  const idx = {};
  events.forEach((ev) => {
    const mon = ev.date.split(" ")[0];
    // real year from the countdown (t is negative for upcoming) — events can roll into next year
    const yr = new Date(Date.now() + -ev.t * 86400000).getFullYear();
    const key = `${mon} ${yr}`;
    if (!(key in idx)) { idx[key] = groups.length; groups.push({ mon, yr, items: [] }); }
    groups[idx[key]].items.push(ev);
  });
  const MONTHS = { JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June",
    JUL: "July", AUG: "August", SEP: "September", OCT: "October", NOV: "November", DEC: "December" };
  return (
    <div className="wrap tl">
      {groups.map((g) => (
        <div key={g.mon + g.yr}>
          <div className="tl-month">{MONTHS[g.mon] || g.mon} {g.yr}</div>
          {g.items.map((ev) => {
            const cat = TT.CAT_MAP[ev.cat];
            return (
              <div className="tl-row reveal" key={ev.id} style={{ "--c": cat.color, "--i": ev.id }} onClick={() => onOpenFull && onOpenFull(ev)} role="button" tabIndex={0}>
                <div className="tl-track">
                  <span className="tl-line" /><span className="tl-dot" />
                  <span className="tl-date mono">{ev.approx ? "~" : ""}{ev.date}</span>
                </div>
                <div className="tl-body">
                  <div className="tl-ttl">
                    {ev.title}
                    <span className="badge badge-sev" data-sev={ev.sev} style={{ fontSize: 9 }}>{SEV_LABEL[ev.sev]}</span>
                  </div>
                  <div className="tl-desc">{ev.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
