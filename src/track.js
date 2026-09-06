/* Product analytics, and it is a NO-OP until someone configures a provider.

   Shipping without this means shipping blind: nine views are maintained here and
   nobody knows whether seven of them are ever opened, whether "Beyond index" —
   which costs a second nightly cron and a second blob — is ever picked, or
   whether anyone reaches the Playbook. Those are the questions that decide what
   to build next, and they cannot be answered after the fact.

   Three rules it follows, in the same spirit as the rest of the codebase:

   · NOTHING IDENTIFYING LEAVES THE DEVICE. Event names and a small bag of
     enum-ish props only. No tickers the user searched, no position sizes, no
     watchlist contents — that state is on-device by design (see tt_positions in
     CLAUDE.md) and analytics is not a loophole around that.
   · IT FAILS SILENT AND IT FAILS OPEN. If no provider is configured, if the
     script is blocked, if the call throws — the app carries on. Analytics must
     never be able to break a view.
   · IT IS COOKIE-FREE. `VITE_ANALYTICS_SRC` is meant for a Plausible-style
     script that sets no cookies and needs no consent banner. If you point it at
     something that does set cookies, that is a legal decision, not a config
     change, and the banner becomes your problem.

   To turn it on, set both in the Vercel project:
     VITE_ANALYTICS_SRC   the script URL
     VITE_ANALYTICS_SITE  the site/domain id the provider expects
   Vite inlines `import.meta.env.VITE_*` at build time, so with neither set the
   loader below compiles to a dead branch and no request is ever made. */

const SRC = import.meta.env.VITE_ANALYTICS_SRC || "";
const SITE = import.meta.env.VITE_ANALYTICS_SITE || "";

let ready = false;

export function initTracking() {
  if (ready || !SRC || !SITE) return;
  ready = true;
  try {
    const el = document.createElement("script");
    el.defer = true;
    el.src = SRC;
    el.setAttribute("data-domain", SITE);
    document.head.appendChild(el);
  } catch { /* a blocked or failed injection is not an error worth surfacing */ }
}

/* `props` must stay enum-ish — a view id, a filter name, a boolean. Never a
   ticker, never a number the user typed. If you find yourself wanting to pass
   one, the question you are asking belongs in a survey, not in telemetry. */
export function track(event, props) {
  if (!SRC || !SITE) return;
  try {
    const fn = window.plausible || window.umami || null;
    if (typeof fn === "function") fn(event, props ? { props } : undefined);
  } catch { /* never let telemetry throw into a render path */ }
}
