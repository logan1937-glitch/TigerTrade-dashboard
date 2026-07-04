import { useState, useMemo, useEffect } from "react";
import { TT } from "./tt.js";
import { fetchQuotes, mergeCanslim } from "./liveData.js";
import { fetchHistories, computeSignals, lookbackFrom, momentumScore, rsRatings, computeMarketHealth } from "./signals.js";
import { fetchMarket } from "./marketData.js";
import { fetchEcon, mergeEcon } from "./econ.js";
import { WatchCtx, CanslimCtx, TopBar, Hero, StatStrip, SubNav, RadarView, SearchIcon, StarIcon } from "./components.jsx";
import { Disclaimer } from "./disclaimer.jsx";
import { CalendarView, TimelineView } from "./views.jsx";
import { CatalystTimeline } from "./catalystTimeline.jsx";
import { CommandPalette } from "./commandPalette.jsx";
import { Drawer, EventDrawerBody, StockDrawerBody, WatchlistBody } from "./drawer.jsx";
import { CanslimView } from "./canslim.jsx";

/* fixed presentation settings (the prototype's design-tool tweaks, pinned for production) */
const DIR = "obsidian", DENSITY = "balanced", MOTION = "full", TYPEFACE = "grotesk", GLOW = "on", SHOW_SCOPE = true;

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
  const [mode, setMode] = useStored("tt_mode", "dark");

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
  const [hist, setHist] = useState({ rows: {}, sig: {} });
  const [market, setMarket] = useState(null);   // live market health (index + universe breadth)
  const [econ, setEcon] = useState(null);       // live economic calendar (null = unavailable)

  // custom tickers — look up ANY symbol on demand (unlimited search)
  const [customSyms, setCustomSyms] = useStored("tt_custom", []);
  const [customData, setCustomData] = useState({});   // { SYM: { quote, sig } }
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupErr, setLookupErr] = useState("");

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

  // single source of screener data: live quotes + real EOD signals merged over the
  // editorial base, then a real universe-wide RS rating + momentum score so curated
  // and extended (signals-only) names are ranked on the same honest, technical basis
  // universe = curated + extended + any custom-looked-up tickers
  const universe = useMemo(() => {
    const baseSet = new Set(TT.CANSLIM.map((s) => s.tk));
    const extra = customSyms.filter((sym) => !baseSet.has(sym)).map((sym) => ({
      tk: sym, name: sym, sector: "Custom", group: "Custom lookup", coverage: "signals", custom: true,
      groupRank: null, rs: null, status: null, px: null, chg: null,
      f: null, breakdown: [], pass: 0, score: 0, pivot: null, buyLo: null, buyHi: null, pctExt: null,
      closes: [], volume: [], rsLine: [], spark: [],
      baseType: null, baseWeeks: 0, baseDepth: 0, why: null, bio: null, hq: null, mktCap: null, avgVol: null,
    }));
    return [...TT.CANSLIM, ...extra];
  }, [customSyms]);

  const csData = useMemo(() => {
    let list = universe.map((s) => {
      const quote = (live.status === "live" && live.quotes?.[s.tk]) || customData[s.tk]?.quote;
      let r = quote ? mergeCanslim(s, quote) : s;
      const sg = hist.sig?.[s.tk] || customData[s.tk]?.sig;
      if (sg) {
        r = { ...r, closes: sg.closes, volume: sg.volume, dates: sg.dates, rsLine: sg.rsLine || r.rsLine, off52: sg.off52, sig: sg, _eod: true };
      }
      return r;
    });

    const rsMap = rsRatings(list);             // 1–99 percentile of 12-mo return
    const sampleSpark = (c) => (c && c.length ? c.filter((_, i) => i % Math.max(1, Math.floor(c.length / 8)) === 0) : null);

    list = list.map((r) => {
      if (!r.sig) return r;
      const rs = rsMap[r.tk] != null ? rsMap[r.tk] : (r.rs || 50);
      const score = momentumScore(r.sig, rs);
      const grade = score >= 80 ? "a" : score >= 60 ? "b" : "c";
      const spark = sampleSpark(r.sig.closes) || r.spark;
      // technical buy point from real history — the recent base high (60 bars,
      // excluding the last 5) replaces the stale editorial pivot for everyone
      let status = r.status;
      let pivotFields = {};
      const c = r.sig.closes, n = c.length;
      if (n >= 70) {
        const base = c.slice(n - 65, n - 5);
        const pivot = +Math.max(...base).toFixed(2);
        const baseLo = Math.min(...base);
        const px = r.px != null ? r.px : c[n - 1];
        const pctExt = +(((px - pivot) / pivot) * 100).toFixed(1);
        status = pctExt > 5 ? "ext" : pctExt >= -3 ? "buy" : "watch";
        pivotFields = {
          pivot, buyLo: pivot, buyHi: +(pivot * 1.05).toFixed(2), pctExt,
          baseType: "60-day base high", baseWeeks: 12,
          baseDepth: +(((pivot - baseLo) / pivot) * 100).toFixed(0),
        };
      } else if (r.coverage === "signals") {
        status = r.sig.stage === 2 && r.sig.off52 <= 6 ? "buy" : null;
      }
      // keep the LEADERS 'L' chip + the market 'S' factor in sync with real data
      let breakdown = r.breakdown;
      if (r.coverage === "full" && breakdown.length) {
        breakdown = breakdown.map((b) => {
          if (b.letter === "L") return { ...b, pass: rs >= 85, value: `RS ${rs} · grp #${r.groupRank}` };
          if (b.key === "f7" && market) return { ...b, pass: market.trend === "Confirmed Uptrend", value: market.trend };
          return b;
        });
      }
      return { ...r, rs, score, grade, spark, status, breakdown, ...pivotFields };
    });

    return { list, byTicker: Object.fromEntries(list.map((s) => [s.tk, s])) };
  }, [universe, live, hist, customData, market]);

  const openEvent = (ev) => { setStockDrawer(null); setWatchOpen(false); setEvDrawer(ev); };
  // always open the live-merged record for a ticker (falls back to the passed object)
  const openStock = (s) => { setEvDrawer(null); setWatchOpen(false); setProduct("canslim"); setStockDrawer(csData.byTicker[s.tk] || s); };

  // look up ANY ticker on demand — fetch it live, compute its signals, add it
  const lookupTicker = async (raw) => {
    const sym = (raw || "").toUpperCase().trim().replace(/[^A-Z0-9.\-]/g, "");
    setLookupErr("");
    if (!sym) return;
    if (TT.CS_BYTICKER[sym] || customData[sym]) { openStock(csData.byTicker[sym] || TT.CS_BYTICKER[sym]); return; }
    setLookupBusy(true);
    try {
      const r = await fetchMarket([sym, "SPY"]);
      if (!r.quotes[sym]) { setLookupErr(`“${sym}” not found`); return; }
      setCustomData((prev) => ({ ...prev, [sym]: { quote: r.quotes[sym], sig: r.rows[sym] ? computeSignals(r.rows[sym], r.rows.SPY) : null } }));
      setCustomSyms((prev) => (prev.includes(sym) ? prev : [...prev, sym]));
    } catch { setLookupErr("Lookup failed — try again."); }
    finally { setLookupBusy(false); }
  };

  // re-fetch persisted custom tickers (e.g. after reload) that have no data yet
  useEffect(() => {
    const missing = customSyms.filter((sym) => !customData[sym] && !TT.CS_BYTICKER[sym]);
    if (!missing.length) return;
    let alive = true;
    (async () => {
      const r = await fetchMarket([...missing, "SPY"]);
      if (!alive) return;
      setCustomData((prev) => {
        const next = { ...prev };
        for (const sym of missing) { if (r.quotes[sym]) next[sym] = { quote: r.quotes[sym], sig: r.rows[sym] ? computeSignals(r.rows[sym], r.rows.SPY) : null }; }
        return next;
      });
    })().catch(() => {});
    return () => { alive = false; };
  }, [customSyms]);

  // Data feed, in priority order:
  //  1) /api/snapshot — the nightly precompute (one cached request, all signals)
  //  2) live per-ticker: Yahoo first, FMP fallback (used until/if the snapshot
  //     exists, or if it fails). Quotes drive the buy zone; history powers the
  //     chart + momentum signals. Degrades to the demo series, never fakes data.
  useEffect(() => {
    let alive = true;
    (async () => {
      const tickers = TT.CANSLIM.map((s) => s.tk);
      const all = [...tickers, "SPY"];

      // 1) precomputed snapshot — instant, edge-cached, no per-ticker fetching
      try {
        const r = await fetch("/api/snapshot");
        if (r.ok) {
          const snap = await r.json();
          if (snap && snap.quotes && snap.sig && Object.keys(snap.quotes).length) {
            if (!alive) return;
            const covered = tickers.filter((t) => snap.quotes[t]);
            let asOf = 0;
            for (const t of covered) { const ts = snap.quotes[t].timestamp; if (ts) asOf = Math.max(asOf, ts * 1000); }
            setLive({ status: "live", quotes: snap.quotes, asOf: asOf || (snap.asOf || Date.now()), count: covered.length, total: tickers.length, source: snap.source || "snapshot" });
            setHist({ rows: {}, sig: snap.sig });
            if (snap.market) setMarket({ ...snap.market, asOf: asOf || snap.asOf || null });
            return; // snapshot covered it — skip live per-ticker fetching
          }
        }
      } catch { /* fall through to live fetching */ }

      const IDX = [["^GSPC", "S&P 500", "SPY"], ["^IXIC", "Nasdaq", "QQQ"], ["^RUT", "Russell 2000", "IWM"], ["^DJI", "Dow", "DIA"]];
      const y = await fetchMarket([...all, ...IDX.map((x) => x[0])]);
      const quotes = { ...y.quotes };
      const rows = { ...y.rows };

      // FMP fallback for any quote Yahoo didn't return
      const missingQ = tickers.filter((t) => !quotes[t]);
      let source = Object.keys(y.quotes).length ? "Yahoo" : "FMP";
      if (missingQ.length) {
        const fmp = await fetchQuotes(missingQ);
        if (fmp.status === "live") { Object.assign(quotes, fmp.quotes); if (source === "FMP") source = "FMP"; }
      }
      // FMP fallback for any history Yahoo didn't return
      const missingH = all.filter((t) => !rows[t]);
      if (missingH.length) Object.assign(rows, await fetchHistories(missingH, lookbackFrom()));

      if (!alive) return;

      const covered = tickers.filter((t) => quotes[t]);
      let asOf = 0;
      for (const t of covered) { const ts = quotes[t].timestamp; if (ts) asOf = Math.max(asOf, ts * 1000); }
      setLive(covered.length
        ? { status: "live", quotes, asOf: asOf || Date.now(), count: covered.length, total: tickers.length, source }
        : { status: "unavailable", code: "NO_DATA", quotes: {} });

      const spy = rows.SPY;
      const sig = {};
      for (const t of tickers) { const s = computeSignals(rows[t], spy); if (s) sig[t] = s; }
      setHist({ rows, sig });

      // market health from the index data (SPY rows back any index Yahoo denied)
      const indices = IDX.map(([sym, label, proxy]) => {
        const r2 = rows[sym] || rows[proxy] || (proxy === "SPY" ? spy : null);
        const q2 = quotes[sym] || quotes[proxy];
        return r2 && q2 ? { label, price: q2.price, chgPct: q2.changePercentage, rows: r2 } : null;
      });
      const mh = computeMarketHealth(indices, tickers.map((t) => ({ chg: quotes[t]?.changePercentage, sig: sig[t] })));
      if (mh) setMarket({ ...mh, asOf: asOf || Date.now() });
    })().catch(() => { if (alive) setLive({ status: "unavailable", code: "ERROR", quotes: {} }); });
    return () => { alive = false; };
  }, []);

  // live economic calendar (silently unavailable if the key's tier excludes it)
  useEffect(() => {
    let alive = true;
    fetchEcon().then((d) => { if (alive && d && d.length) setEcon(d); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const toggleCat = (id) => setCats((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // radar events: curated template, re-dated + augmented by the live economic
  // calendar when available (ids/briefings preserved; `~` dates become exact)
  const allEvents = useMemo(() => mergeEcon(TT.EVENTS, econ).events, [econ]);

  const events = useMemo(() => {
    const minRank = TT.SEV[minWt] || 0;
    const q = query.trim().toLowerCase();
    const list = allEvents.filter((e) => {
      if (!showPast && e.past) return false;
      if (cats.size && !cats.has(e.cat)) return false;
      if (minWt !== "all" && TT.SEV[e.sev] < minRank) return false;
      if (q && !(e.title + " " + e.desc).toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => a.sort - b.sort);
  }, [allEvents, cats, query, minWt, showPast]);

  const upcoming = useMemo(() => allEvents.filter((e) => !e.past).sort((a, b) => a.sort - b.sort), [allEvents]);

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
    [["radar", "Radar"], ["timeline", "Full Timeline"], ["calendar", "Calendar"], ["playbook", "Catalysts"]]
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
      <div className="app" data-dir={DIR} data-mode={mode} data-density={DENSITY} data-glow={GLOW} data-motion={MOTION} data-typeface={TYPEFACE}>
        <div className="grain" />
        <TopBar product={product} setProduct={setProduct} onOpenCmd={() => setCmdOpen(true)}
          onOpenWatch={() => { setEvDrawer(null); setStockDrawer(null); setWatchOpen(true); }} watchCount={watchApi.count}
          mode={mode} onToggleMode={() => setMode((m) => (m === "light" ? "dark" : "light"))} />
        {product === "radar" ? (
          <>
            <Hero events={upcoming} onSelectEvent={openEvent} activeId={evDrawer && evDrawer.id} showScope={SHOW_SCOPE} live={!!econ} />
            <StatStrip events={allEvents} />
            <SubNav tab={tab} setTab={setTab} counts={events.length} />
            {tab === "radar" && <RadarView {...radarProps} />}
            {tab === "timeline" && <TimelineView events={upcoming} onOpenFull={openEvent} />}
            {tab === "calendar" && <CalendarView />}
            {tab === "playbook" && <CatalystTimeline events={allEvents} onOpen={openEvent} />}
          </>
        ) : (
          <CanslimView onOpenStock={openStock} live={live} rows={csData.list} market={market}
            onLookup={lookupTicker} lookupBusy={lookupBusy} lookupErr={lookupErr} />
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

        <nav className="mobile-tabbar" aria-label="Primary">
          <button data-active={product === "radar" || undefined} onClick={() => setProduct("radar")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /></svg>
            <span>Radar</span>
          </button>
          <button data-active={product === "canslim" || undefined} onClick={() => setProduct("canslim")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>
            <span>Screener</span>
          </button>
          <button onClick={() => setCmdOpen(true)}><SearchIcon /><span>Search</span></button>
          <button onClick={() => { setEvDrawer(null); setStockDrawer(null); setWatchOpen(true); }}>
            <StarIcon filled={watchApi.count > 0} />
            {watchApi.count > 0 && <span className="tb-badge mono">{watchApi.count}</span>}
            <span>Watch</span>
          </button>
        </nav>
      </div>
    </CanslimCtx.Provider>
    </WatchCtx.Provider>
  );
}
