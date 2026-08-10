import { StrictMode, useState, useEffect, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import './terminal.css'
import App from './App.jsx'
import Landing from './landing.jsx'
import { useStored } from './store.js'

/* Which surface answers a URL.

   The app had no front door, and the obvious fix — put the landing page on `/`
   and move the terminal to `/terminal` — breaks two things that already work.
   Every `?ev=` and `?tk=` deep link the app writes points at `/`, and everyone
   using the terminal today has `/` bookmarked; sending either to a marketing
   page would be a regression dressed as a launch.

   So `/` answers with whichever surface the visitor actually came for:

     · any explicit path wins — `/start` is always the landing, `/terminal` is
       always the app, so both can be linked without ambiguity
     · a URL carrying app state (`?ev=`, `?tk=`, `?p=`, `?tab=`) is a deep link
       and goes straight to the terminal
     · a visitor who has accepted the disclaimer has used this before; they get
       the terminal, not a pitch for a product they already have open
     · everyone else — a genuinely new visitor on a bare `/` — gets the landing

   One constant flips the last rule if that judgement turns out wrong. */
const LANDING_FOR_NEW_VISITORS = true;

function pickSurface() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  if (path === "/start" || path === "/welcome") return "landing";
  if (path === "/terminal" || path === "/app") return "app";
  if (path !== "/") return "app";
  const q = new URLSearchParams(window.location.search);
  if (["ev", "tk", "p", "tab"].some((k) => q.has(k))) return "app";
  if (!LANDING_FOR_NEW_VISITORS) return "app";
  try { if (localStorage.getItem("tt_disclaimer_ack_v1")) return "app"; } catch { /* private mode */ }
  return "landing";
}

function Root() {
  const [surface, setSurface] = useState(pickSurface);
  // the landing renders its own `.app` wrapper, so it needs the stored theme —
  // a component outside that wrapper gets no tokens at all
  const [mode] = useStored("tt_mode", "dark");

  const enter = useCallback(() => {
    window.history.pushState({ s: "app" }, "", "/terminal");
    setSurface("app");
    window.scrollTo(0, 0);
  }, []);

  // back out of the terminal and the landing comes back, rather than leaving the
  // site — the two are one document, so history has to be told about the swap
  useEffect(() => {
    const onPop = () => setSurface(pickSurface());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return surface === "landing" ? <Landing mode={mode} onEnter={enter} /> : <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
