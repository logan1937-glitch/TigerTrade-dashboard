import { useState, useMemo, useEffect } from "react";
import { TT } from "./tt.js";
import { fetchQuotes, mergeCanslim } from "./liveData.js";
import { WatchCtx, CanslimCtx, TopBar, Hero, StatStrip, SubNav, RadarView } from "./components.jsx";
import { Disclaimer } from "./disclaimer.jsx";
import { CalendarView, TimelineView, PlaybookView } from "./views.jsx";
import { CommandPalette } from "./commandPalette.jsx";
import { Drawer, EventDrawerBody, StockDrawerBody, WatchlistBody } from "./drawer.jsx";
import { CanslimView } from "./canslim.jsx";

/* fixed presentation settings (the prototype's design-tool tweaks, pinned for production) */
const DIR = "obsidian", DENSITY = "balanced", MOTION = "full", TYPEFACE = "geist", GLOW = "on", SHOW_SCOPE = true;

function useStored(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s === null ? init : JSON.parse(s); } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}

export default function App() {
  const [product, setProduct] = useStored("tt_product", "radar");
  const [tab, setTab] = useStored("tt_tab", "radar");

  const [cats, setCats] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [minWt, setMinWt] = useState("all");
  const [showPast, setShowPast] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [focus, setFocus] = useState(null);
  const [evDrawer, setEvDrawer] = useState(null);
  const [stockDrawer, setStockDrawer] = useState(null);
  const [watchOpen, setWatchOpen] = useState(false);

  const [live, setLive] = useState({ status: "loading" });

  const [watchArr, setWatchArr] = useStored("tt_watch", []);
  const watchSet = useMemo(() => new Set(watchArr.map((w) => w.key)), [watchArr]);
  const watchApi = useMemo(() => ({
    list: watchArr,
    count: watchArr.length,
    has: (key) => watchSet.has(key),
    toggle: (key, meta) => setWatchArr((prev) => prev.some((w) => w.key === key)
      ? prev.filter((w) => w.key !== key)
      : [...prev, { key, kind: meta.kind, ref: meta.ref, at: Date.now() }]),
  }), [watchArr, watchSet]);

  // single source of CANSLIM data, live-merged where quotes are available
  const csData = useMemo(() => {
    const list = TT.CANSLIM.map((s) =>
      (live.status === "live" && live.quotes?.[s.tk] ? mergeCanslim(s, live.quotes[s.tk]) : s));
    return { list, byTicker: Object.fromEntries(list.map((s) => [s.tk, s])) };
  }, [live]);

  const openEvent = (ev) => { setStockDrawer(null); setWatchOpen(false); setEvDrawer(ev); };
  // always open the live-merged record for a ticker (falls back to the passed object)
  const openStock = (s) => { setEvDrawer(null); setWatchOpen(false); setProduct("canslim"); setStockDrawer(csData.byTicker[s.tk] || s); };

  // load live quotes for the screener universe once on mount
  useEffect(() => {
    let alive = true;
    fetchQuotes(TT.CANSLIM.map((s) => s.tk))
      .then((r) => { if (alive) setLive(r); })
      .catch(() => { if (alive) setLive({ status: "unavailable", code: "ERROR", quotes: {} }); });
    return () => { alive = false; };
  }, []);

  const toggleCat = (id) => setCats((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const events = useMemo(() => {
    const minRank = TT.SEV[minWt] || 0;
    const q = query.trim().toLowerCase();
    const list = TT.EVENTS.filter((e) => {
      if (!showPast && e.past) return false;
      if (cats.size && !cats.has(e.cat)) return false;
      if (minWt !== "all" && TT.SEV[e.sev] < minRank) return false;
      if (q && !(e.title + " " + e.desc).toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => a.sort - b.sort);
  }, [cats, query, minWt, showPast]);

  const upcoming = useMemo(() => TT.EVENTS.filter((e) => !e.past).sort((a, b) => a.sort - b.sort), []);

  const selectEvent = (ev) => {
    setProduct("radar"); setTab("radar");
    setCats(new Set()); setMinWt("all"); setQuery("");
    if (ev.past) setShowPast(true);
    setFocus({ id: ev.id, tick: Date.now() });
    openEvent(ev);
  };

  const replayKey = `${tab}|${[...cats].sort().join(",")}|${minWt}|${query}|${showPast}`;

  // safety net: never leave entrance-animated content hidden
  useEffect(() => {
    const id = setTimeout(() => {
      document.querySelectorAll(".reveal").forEach((el) => { el.style.animation = "none"; el.style.opacity = "1"; el.style.transform = "none"; });
    }, 750);
    return () => clearTimeout(id);
  }, [replayKey, tab, product]);

  const commands = useMemo(() => {
    const cmds = [];
    [["radar", "Radar"], ["timeline", "Full Timeline"], ["calendar", "Calendar"], ["playbook", "Playbook + AI"]]
      .forEach(([id, label]) => cmds.push({ id: "tab-" + id, group: "Navigate", label, hint: "View", run: () => { setProduct("radar"); setTab(id); } }));
    cmds.push({ id: "prod-canslim", group: "Navigate", label: "Leadership Screener", hint: "Product", run: () => setProduct("canslim") });
    TT.CATEGORIES.forEach((c) => cmds.push({ id: "cat-" + c.id, group: "Filter", label: "Toggle " + c.label, dot: c.color, run: () => { setProduct("radar"); setTab("radar"); toggleCat(c.id); } }));
    [["all", "All"], ["medium", "Medium+"], ["high", "High+"], ["extreme", "Extreme only"]]
      .forEach(([id, label]) => cmds.push({ id: "wt-" + id, group: "Filter", label: "Min weight: " + label, run: () => { setProduct("radar"); setTab("radar"); setMinWt(id); } }));
    cmds.push({ id: "past", group: "Filter", label: "Toggle past events", run: () => { setProduct("radar"); setTab("radar"); setShowPast((v) => !v); } });
    TT.EVENTS.filter((e) => !e.past).sort((a, b) => a.sort - b.sort).forEach((e) =>
      cmds.push({ id: "ev-" + e.id, group: "Events", label: e.title, dot: TT.CAT_MAP[e.cat].color,
        hint: `${e.approx ? "~" : ""}${e.date} · T${e.t}d`, keywords: e.cat + " " + e.sev, run: () => selectEvent(e) }));
    return cmds;
  }, []);

  const radarProps = { events, cats, toggleCat, query, setQuery, minWt, setMinWt, showPast, setShowPast, replayKey, focus, onOpenFull: openEvent };

  return (
    <WatchCtx.Provider value={watchApi}>
    <CanslimCtx.Provider value={csData}>
      <div className="app" data-dir={DIR} data-density={DENSITY} data-glow={GLOW} data-motion={MOTION} data-typeface={TYPEFACE}>
        <div className="grain" />
        <TopBar product={product} setProduct={setProduct} onOpenCmd={() => setCmdOpen(true)}
          onOpenWatch={() => { setEvDrawer(null); setStockDrawer(null); setWatchOpen(true); }} watchCount={watchApi.count} />
        {product === "radar" ? (
          <>
            <Hero events={upcoming} onSelectEvent={openEvent} activeId={evDrawer && evDrawer.id} showScope={SHOW_SCOPE} />
            <StatStrip />
            <SubNav tab={tab} setTab={setTab} counts={events.length} />
            {tab === "radar" && <RadarView {...radarProps} />}
            {tab === "timeline" && <TimelineView events={upcoming} onOpenFull={openEvent} />}
            {tab === "calendar" && <CalendarView />}
            {tab === "playbook" && <PlaybookView />}
          </>
        ) : (
          <CanslimView onOpenStock={openStock} live={live} rows={csData.list} />
        )}

        <CommandPalette open={cmdOpen} setOpen={setCmdOpen} commands={commands} />

        <Drawer open={!!evDrawer} onClose={() => setEvDrawer(null)} label="Event analysis">
          {evDrawer && <EventDrawerBody ev={evDrawer} onClose={() => setEvDrawer(null)} onPick={openStock} />}
        </Drawer>
        <Drawer open={!!stockDrawer} onClose={() => setStockDrawer(null)} label="Stock analysis">
          {stockDrawer && <StockDrawerBody stock={stockDrawer} onClose={() => setStockDrawer(null)} />}
        </Drawer>
        <Drawer open={watchOpen} onClose={() => setWatchOpen(false)} label="Watchlist">
          {watchOpen && <WatchlistBody onClose={() => setWatchOpen(false)} onPickEvent={openEvent} onPickStock={openStock} />}
        </Drawer>

        <Disclaimer />
      </div>
    </CanslimCtx.Provider>
    </WatchCtx.Provider>
  );
}
