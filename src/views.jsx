import { TT } from "./tt.js";
import { SEV_LABEL } from "./components.jsx";

/* ---------------------------- CALENDAR ----------------------------- */
export function CalendarView() {
  const m = TT.MONTH;
  const cells = [];
  for (let i = 0; i < m.firstDow; i++) cells.push({ out: true, num: 0 });
  for (let d = 1; d <= m.days; d++) cells.push({ out: false, num: d });
  while (cells.length % 7 !== 0) cells.push({ out: true, num: 0 });

  return (
    <div className="wrap">
      <div className="cal-head">
        <div className="cal-title">{m.name}</div>
        <div className="count mono" style={{ color: "var(--dim)", letterSpacing: ".08em", textTransform: "uppercase", fontSize: 11 }}>
          4 scheduled catalysts this month
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
    if (!(mon in idx)) { idx[mon] = groups.length; groups.push({ mon, items: [] }); }
    groups[idx[mon]].items.push(ev);
  });
  const MONTHS = { JAN: "January", FEB: "February", MAR: "March", APR: "April", MAY: "May", JUN: "June",
    JUL: "July", AUG: "August", SEP: "September", OCT: "October", NOV: "November", DEC: "December" };
  return (
    <div className="wrap tl">
      {groups.map((g) => (
        <div key={g.mon}>
          <div className="tl-month">{MONTHS[g.mon] || g.mon} 2026</div>
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

/* ---------------------------- PLAYBOOK ----------------------------- */
export function PlaybookView() {
  const byId = Object.fromEntries(TT.EVENTS.map((e) => [e.id, e]));
  const watch = [
    [1, "BoJ carry unwind", "JPY crosses, leveraged equity beta"],
    [2, "FOMC dot plot", "Front-end rates, cross-asset vol"],
    [3, "Gamma expiry", "Index pin risk, dealer hedging"],
    [5, "Russell recon", "Small/mid-cap dispersion"],
    [10, "CPI print", "Rate-path narrative reset"],
  ];
  return (
    <div className="wrap pb">
      <div className="pb-card pb-brief">
        <h3><span className="hero-badge" style={{ padding: "3px 7px", fontSize: 9 }}>AI</span> Desk Briefing · {TT.todayLabel}</h3>
        <p>The next ten sessions are <b>front-loaded with policy risk</b>. A Bank of Japan decision (T-3d) sits
          directly ahead of the <b>FOMC</b> (T-4d) — the dominant scheduled vol driver — compressing two
          carry- and rate-sensitive catalysts into a single window.</p>
        <p>Into month-end, the tape rotates from macro to <b>mechanical flow</b>: quad witching and the S&amp;P
          rebalance on Jun 19, then the <b>Russell reconstitution</b> on Jun 26 — the year's largest structural
          rebalance for small- and mid-cap momentum names.</p>
        <p>Positioning bias: <b>reduce gross into the FOMC blackout</b>, keep dry powder for the post-Russell
          dislocation, and treat the Jul 8 CPI as the first clean read capable of repricing the rate path.</p>
        <div className="pb-ai-input">
          <input placeholder="Ask the desk… e.g. ‘hedges for the BoJ–FOMC window’" />
          <button>Ask</button>
        </div>
      </div>
      <div className="pb-card">
        <h3>Watch List</h3>
        <div className="pb-list">
          {watch.map(([id, name, sub]) => {
            const e = byId[id];
            return (
              <div className="pb-item" key={id}>
                <span className="pb-k">{e.t <= 0 ? `T${e.t}d` : `T+${e.t}d`}</span>
                <span className="pb-v">{name}<small>{sub}</small></span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
