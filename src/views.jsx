import { useMemo, useState } from "react";
import { TT } from "./tt.js";
import { SEV_LABEL } from "./components.jsx";

const CAL_MAX = 4;   // ticker chips per day before the rest collapse into a count

/* ---------------------------- CALENDAR -----------------------------
   The macro catalysts this product tracks are only half of what moves a book in
   a given week — the other half is the earnings the tracked universe is about to
   report. Both now sit in the same month grid: scheduled catalysts first, then
   report dates, scoped to your own names by default because the full S&P 500
   would bury the catalysts the calendar exists to show. */
export function CalendarView({ rows = [], onOpenStock }) {
  const m = TT.MONTH;
  const [scope, setScope] = useState("yours");
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
          <div className="count mono" style={{ color: "var(--dim)", letterSpacing: ".08em", textTransform: "uppercase", fontSize: 11 }}>
            {nEvents} scheduled catalyst{nEvents === 1 ? "" : "s"} this month
            {nErn > 0 && <> · <span style={{ color: "var(--cat-growth)" }}>{nErn} report{nErn === 1 ? "s" : "s"}</span></>}
          </div>
          <div className="cal-scope">
            <button className="seg-btn" data-active={scope === "yours" || undefined} onClick={() => setScope("yours")}
              title="Names you hold, watch, or dated yourself">Your names {nMine}</button>
            <button className="seg-btn" data-active={scope === "all" || undefined} onClick={() => setScope("all")}
              title="Every tracked name with a known report date">Universe {nAll}</button>
          </div>
        </div>
      </div>
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
                <div className="cal-ev" key={j} style={{ "--c": TT.CAT_MAP[e.cat].color }}>{e.t}</div>
              ))}
              {(!c.out ? (byDay[c.num] || []).slice(0, CAL_MAX) : []).map((r) => (
                <button className="cal-ev cal-ern" key={"e" + r.tk} data-mine={(r.held || r.mine) || undefined}
                  onClick={() => onOpenStock && onOpenStock({ tk: r.tk })}
                  title={`${r.tk}${r.name && r.name !== r.tk ? ` — ${r.name}` : ""} reports`
                    + `${r.time === "bmo" ? " before the open" : r.time === "amc" ? " after the close" : ""}`
                    + `${r.mine ? " on the date you set" : r.est ? " (projected date — not yet confirmed)" : ""}`
                    + `${r.held ? " · your position" : r.watched ? " · on your watchlist" : ""} — open full analysis`}>
                  {r.tk}{(r.held || r.mine) && <span className="cal-ern-d">◆</span>}
                </button>
              ))}
              {!c.out && (byDay[c.num] || []).length > CAL_MAX && (
                <div className="cal-more mono" title={(byDay[c.num] || []).slice(CAL_MAX).map((r) => r.tk).join(", ")}>
                  +{(byDay[c.num] || []).length - CAL_MAX} more
                </div>
              )}
            </div>
          );
        })}
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
