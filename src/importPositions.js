/* Turn a broker's CSV export into positions.

   The old parser took `ticker, shares, cost, entry, ern` by POSITION, which is
   the shape this app exports and the shape no broker on earth produces. Real
   exports name their columns, order them differently, wrap dollar signs and
   thousands separators around the numbers, write losses in parentheses, and
   bury the holdings between an account-summary preamble and a totals row.

   So: map by column NAME, fall back to position only when no header is
   recognisable, and REPORT what was skipped rather than silently dropping it.
   A file that half-imported without saying so is the worst outcome here — you
   would be sizing against a book that is missing two positions.

   Nothing is inferred that is not arithmetic on two real numbers. A missing
   cost stays missing; it never becomes zero, and it never becomes the current
   price. */

const ALIAS = {
  tk: ["symbol", "ticker", "instrument", "security", "security symbol", "stock",
    "symbol/cusip", "name/symbol", "product", "asset"],
  shares: ["quantity", "qty", "shares", "share quantity", "units", "quantity owned",
    "shares owned", "position", "no. of shares"],
  // per-share cost. Checked BEFORE the total, because a file carrying both is
  // telling us the per-share figure directly and we should not re-derive it.
  cost: ["cost basis per share", "average cost", "average cost basis", "avg cost",
    "avg cost basis", "average price", "avg price", "price paid", "purchase price",
    "cost per share", "cost/share", "unit cost", "average price paid"],
  costTotal: ["cost basis", "cost basis total", "total cost", "total cost basis",
    "book cost", "cost"],
  entry: ["date acquired", "acquired", "purchase date", "open date", "trade date",
    "date opened", "buy date"],
  ern: ["earnings date", "report date", "next earnings", "next report"],
  // not imported — read only to recognise a cash sweep, which has a
  // perfectly ticker-shaped symbol and is not a position
  desc: ["description", "security description", "name", "security name", "instrument name"],
};

/* Money-market sweeps clear TICKER_RE — SPAXX is five letters and looks exactly
   like a stock. They are the default cash vehicle at most brokers, so almost
   every export has one, and importing it as a holding puts a $1.00 "position"
   in the book that the screener then tries to price and rank.
   Caught two ways: the description usually says so, and these are the sweeps
   common enough to name outright. */
const SWEEP_DESC = /money market|mmkt|mm(k|f)t|sweep|cash reserves|government portfolio|treasury obligations/i;
const SWEEP_SYMS = new Set(["SPAXX", "FDRXX", "FZFXX", "SPRXX", "FCASH", "SWVXX", "SNVXX", "SNSXX",
  "VMFXX", "VMRXX", "VUSXX", "TIMXX", "QACDS", "QRCDS"]);

/* Rows that are structurally not positions. Brokers put a cash line, one or
   more subtotal lines and a legal paragraph in the same file as the holdings,
   and every one of them has something in the symbol column. */
const NOT_A_POSITION = new Set([
  "cash", "cash & cash investments", "cash and cash investments", "total",
  "account total", "grand total", "subtotal", "totals", "pending activity",
  "money market", "cash balance", "sweep", "n/a", "--", "—",
]);

// a plausible US listing: 1–5 letters, optional class suffix. Deliberately
// strict — letting "ACCOUNTTOTAL" through as a ticker is how a junk row becomes
// a position you then try to price.
const TICKER_RE = /^[A-Z][A-Z0-9]{0,4}([.\-][A-Z]{1,2})?$/;

/* One CSV line into fields, respecting quotes. A company name with a comma in
   it — "Alphabet Inc, Class C" — shifts every column after it when you split on
   commas, which silently reads the shares column as the cost. */
export function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === "\t") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/* A broker's number. Handles $, thousands separators, a trailing %, and
   accounting negatives in parentheses. Returns null — never 0 — for anything
   that is not a number, because "--" in a cost column means "we do not know
   what you paid", and zero would mean you got it for free. */
export function parseNum(v) {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s || /^(n\/?a|--+|—|\.|-)$/i.test(s)) return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, "").replace(/[$£€\s,]/g, "").replace(/%$/, "");
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

// ISO if we can get there; otherwise leave it alone rather than guess between
// the American and the rest-of-world reading of 03/04/2025
export function parseDate(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (!m) return "";
  let [, a, b, y] = m;
  if (y.length === 2) y = String(2000 + +y);
  // ambiguous when both are ≤ 12: US exports dominate here, so month-first, but
  // a day > 12 in the first slot settles it the other way
  const month = +a > 12 ? b : a, day = +a > 12 ? a : b;
  if (+month < 1 || +month > 12 || +day < 1 || +day > 31) return "";
  return `${y}-${String(+month).padStart(2, "0")}-${String(+day).padStart(2, "0")}`;
}

const norm = (h) => String(h || "").trim().toLowerCase().replace(/[_"']/g, " ").replace(/\s+/g, " ");

// which column holds which field, or null when the row is not a header
export function mapHeader(cells) {
  const idx = {};
  // the file's OWN header text, kept so the import report can name the columns
  // it matched in the words the user is looking at rather than our field keys
  idx._labels = {};
  cells.forEach((raw, i) => {
    const h = norm(raw);
    for (const [field, names] of Object.entries(ALIAS)) {
      if (idx[field] != null) continue;
      if (names.includes(h)) { idx[field] = i; idx._labels[field] = String(raw).trim(); return; }
    }
  });
  // a header is only a header if it tells us where the ticker is
  return idx.tk != null ? idx : null;
}

/* Returns { rows, skipped, mapped, positional }.
   `skipped` carries a reason per row so the UI can say what it did not take. */
export function parsePositions(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [], skipped = [];
  let idx = null, positional = false;

  // the header is rarely line 1 — brokers put an account summary above it
  let start = 0;
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const m = mapHeader(splitCsvLine(lines[i]));
    if (m) { idx = m; start = i + 1; break; }
  }
  if (!idx) {
    // no recognisable header: fall back to this app's own export order
    idx = { tk: 0, shares: 1, cost: 2, entry: 3, ern: 4 };
    positional = true;
    start = 0;
  }

  for (let i = start; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const rawTk = cells[idx.tk] || "";
    const sym = rawTk.toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
    const low = norm(rawTk);

    if (!sym) continue;                                   // blank symbol cell, no complaint
    if (NOT_A_POSITION.has(low)) { skipped.push({ raw: rawTk, why: "not a position" }); continue; }
    if (positional && /^ticker$/i.test(rawTk)) continue;  // our own header row
    if (!TICKER_RE.test(sym)) { skipped.push({ raw: rawTk.slice(0, 24), why: "not a ticker" }); continue; }
    const desc = idx.desc != null ? (cells[idx.desc] || "") : "";
    if (SWEEP_SYMS.has(sym) || SWEEP_DESC.test(desc)) { skipped.push({ raw: sym, why: "cash sweep" }); continue; }

    const shares = idx.shares != null ? parseNum(cells[idx.shares]) : null;
    let cost = idx.cost != null ? parseNum(cells[idx.cost]) : null;
    // only when the file gives a TOTAL and no per-share figure: dividing two real
    // numbers is arithmetic, not an assumption
    let derived = false;
    if (cost == null && idx.costTotal != null && shares) {
      const tot = parseNum(cells[idx.costTotal]);
      if (tot != null) { cost = +(tot / shares).toFixed(4); derived = true; }
    }
    rows.push({
      tk: sym,
      shares: shares != null && shares > 0 ? String(shares) : "",
      cost: cost != null && cost > 0 ? String(cost) : "",
      entry: idx.entry != null ? parseDate(cells[idx.entry]) : "",
      ern: idx.ern != null ? parseDate(cells[idx.ern]) : "",
      derivedCost: derived,
    });
  }

  // a symbol can appear once per lot; keep the last and sum nothing, because
  // summing two lots at different costs would invent a blended basis we were
  // not given
  const seen = new Map();
  for (const r of rows) seen.set(r.tk, r);
  return {
    rows: [...seen.values()],
    lots: rows.length - seen.size,
    skipped,
    positional,
    // labelled in the file's words, and never including `desc`, which is read to
    // recognise a cash sweep and never imported
    mapped: Object.keys(idx._labels || {}).filter((k) => k !== "desc").map((k) => idx._labels[k]),
  };
}
