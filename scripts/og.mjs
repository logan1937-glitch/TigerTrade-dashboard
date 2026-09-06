/* Renders the 1200×630 social card to public/og.png.
   Run: node scripts/og.mjs

   Deliberately BRAND-ONLY — the mark, the wordmark, one line of copy, no
   figures. Two reasons, and the second is the governing one:

   · A screenshot of the terminal ages the moment a price moves, and an OG image
     is cached by every platform that scrapes it, so it would be stale forever.
   · Every screenshot this repo can produce headlessly comes from the FIXTURE,
     which is synthetic by design. Putting fabricated prices on the card that
     represents this product everywhere it is linked would break the one rule
     the whole codebase is built on, in the most public place available. If a
     real-data card is ever wanted it has to be rendered from a live snapshot,
     on the server, and labelled with its as-of.

   The geometry of the mark is copied from BrandMark in components.jsx — the
   2.6:1 rake is the identity, so it must not be re-drawn by eye. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "og.png");

const SLASHES = [
  "23.5,52 36.5,52 32.5,82 27.5,82",
  "45.5,38 58.5,38 54.5,82 49.5,82",
  "67.5,22 80.5,22 76.5,82 71.5,82",
];

const HTML = `<!doctype html><html><head><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #0B0B0C; color: #EDEDEF;
    font-family: 'Inter Tight', system-ui, sans-serif; letter-spacing: -0.004em;
    display: flex; flex-direction: column; justify-content: center; padding: 0 84px; }
  .lock { display: flex; align-items: center; gap: 20px; margin-bottom: 52px; }
  .tile { width: 76px; height: 76px; display: grid; place-items: center; border-radius: 16px;
    background: #241610; border: 1px solid rgba(226,116,46,0.30); color: #E2742E; }
  .tile svg { width: 46px; height: 46px; display: block; }
  .wm { font-size: 40px; font-weight: 700; letter-spacing: -0.01em; line-height: 1; }
  .wm .b2 { color: #E2742E; }
  .sub { font-family: 'IBM Plex Mono', monospace; font-size: 13px; letter-spacing: 0.32em;
    color: #86868B; margin-top: 8px; }
  h1 { font-size: 62px; font-weight: 600; line-height: 1.06; letter-spacing: -0.021em; max-width: 20ch; }
  p { font-size: 23px; line-height: 1.5; color: #A1A1A6; margin-top: 24px; max-width: 46ch; }
  .rule { height: 1px; background: rgba(255,255,255,0.09); margin: 44px 0 22px; }
  .foot { font-family: 'IBM Plex Mono', monospace; font-size: 15px; color: #86868B; }
</style></head><body>
  <div class="lock">
    <span class="tile"><svg viewBox="0 0 100 100"><g fill="currentColor" stroke="currentColor" stroke-width="3.4" stroke-linejoin="round">
      ${SLASHES.map((p) => `<polygon points="${p}"/>`).join("")}
    </g></svg></span>
    <span><span class="wm"><span>Tiger</span><span class="b2">Trade</span></span><div class="sub">TERMINAL</div></span>
  </div>
  <h1>Every figure is real or absent.</h1>
  <p>Relative-strength leadership, macro-catalyst surveillance, and position risk on one board.</p>
  <div class="rule"></div>
  <div class="foot">tigertradeterminal.io &nbsp;·&nbsp; educational use only — not investment advice</div>
</body></html>`;

/* Same resolution ladder as scripts/shots.mjs — playwright is not a direct
   dependency here and may be installed globally rather than locally. */
async function loadChromium() {
  const candidates = ["playwright", "playwright-core",
    "/opt/node22/lib/node_modules/playwright/index.mjs",
    "/usr/lib/node_modules/playwright/index.mjs"];
  for (const c of candidates) {
    try { const m = await import(c); if (m.chromium) return m.chromium; } catch { /* next */ }
  }
  console.error("\nCould not import playwright. Install it once:\n  npm i -D playwright && npx playwright install chromium\n");
  process.exit(1);
}
async function launch(chromium) {
  for (const opts of [{}, { executablePath: "/opt/pw-browsers/chromium" }, { channel: "chrome" }]) {
    try { return await chromium.launch(opts); } catch { /* next */ }
  }
  throw new Error("no usable chromium — run: npx playwright install chromium");
}

const chromium = await loadChromium();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(HTML, { waitUntil: "networkidle" });
// the webfont has to be in before the paint, or the card ships in a fallback face
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(250);
await page.screenshot({ path: OUT });
await browser.close();
console.log(`wrote ${path.relative(ROOT, OUT)} (1200×630)`);
