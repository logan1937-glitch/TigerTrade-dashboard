// One localStorage-backed useState, shared. Three views wanted their own copy of
// this; a single definition keeps the read/parse/write semantics identical
// everywhere — including the quiet try/catch, which matters because Safari in
// private mode throws on setItem and a trading view must not white-screen for it.
import { useEffect, useState } from "react";

export function useStored(key, init) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s === null ? init : JSON.parse(s); } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }, [key, v]);
  return [v, setV];
}
