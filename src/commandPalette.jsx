import { useState, useEffect, useRef, useMemo } from "react";

export function CommandPalette({ open, setOpen, commands }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === "k") { e.preventDefault(); setOpen((o) => !o); }
      else if (k === "escape") setOpen(false);
      else if (k === "/" && !open && !/input|textarea/i.test(document.activeElement?.tagName || "")) {
        e.preventDefault(); setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => { if (open) { setQ(""); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); } }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    // searchOnly commands (the 500-name stock universe) only surface once the user types
    let list = !s ? commands.filter((c) => !c.searchOnly) : commands.filter((c) =>
      (c.label + " " + (c.hint || "") + " " + (c.keywords || "")).toLowerCase().includes(s));
    if (s) {
      const exact = list.filter((c) => c.ticker && c.ticker.toLowerCase() === s);
      if (exact.length) list = [...exact, ...list.filter((c) => !exact.includes(c))];
    }
    list = list.slice(0, 80);   // keep the rendered list bounded with a 500-name universe
    const groups = [];
    const idx = {};
    list.forEach((c) => { if (!(c.group in idx)) { idx[c.group] = groups.length; groups.push({ group: c.group, items: [] }); } groups[idx[c.group]].items.push(c); });
    return { groups, flat: list };
  }, [q, commands]);

  useEffect(() => { if (active >= filtered.flat.length) setActive(0); }, [filtered.flat.length, active]);

  if (!open) return null;

  const run = (c) => { if (!c) return; setOpen(false); c.run(); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(filtered.flat[active]); }
  };

  let counter = -1;
  return (
    <div className="cmdk-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div className="cmdk" role="dialog" aria-label="Command palette">
        <div className="cmdk-input-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="cmdk-search">
            <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input ref={inputRef} className="cmdk-input" placeholder="Search stocks, events, views…"
            value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKeyDown} />
          <kbd className="cmdk-esc">ESC</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {filtered.flat.length === 0 && <div className="cmdk-empty">No matches for “{q}”.</div>}
          {filtered.groups.map((g) => (
            <div className="cmdk-group" key={g.group}>
              <div className="cmdk-glabel">{g.group}</div>
              {g.items.map((c) => {
                counter++;
                const i = counter;
                return (
                  <button key={c.id} className="cmdk-item" data-active={i === active}
                    onMouseMove={() => setActive(i)} onClick={() => run(c)}>
                    {c.dot && <span className="cmdk-dot" style={{ "--c": c.dot }} />}
                    <span className="cmdk-label">{c.label}</span>
                    {c.hint && <span className="cmdk-hint">{c.hint}</span>}
                    {c.kbd && <kbd className="cmdk-kbd">{c.kbd}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
