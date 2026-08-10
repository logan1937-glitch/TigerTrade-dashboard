/* Nasdaq-100 and Dow 30 membership — committed fallback for the nightly snapshot.
   Same role, and the same caveats, as src/sp500.js.

   WHY THIS FILE EXISTS. `fmpConstituents()` has always had a committed S&P list
   to fall back on, which is why the screener's S&P 500 filter works. The Nasdaq
   and Dow lists had no fallback, so `fmpIndexMembers()` returned an empty array
   and NO NAME WAS EVER TAGGED — both filters silently produced zero rows. On
   FMP's Starter plan the constituent endpoints answer 403: they need Premium or
   above, and so does the ETF-holdings endpoint that would otherwise let QQQ and
   DIA stand in for the two lists. Nothing in the code was wrong; the data was
   simply never there, and the filter had no way to say so.

   PROVENANCE, stated because it matters. These are committed snapshots, not a
   live feed. `api/snapshot.js` still PREFERS FMP whenever the key's plan can
   serve it, and only falls back here — so upgrading the plan silently makes
   this file dormant rather than requiring a code change.

   Index membership is a fact about the world that changes: the Dow is amended
   every year or two, and the Nasdaq-100 reconstitutes each December plus ad-hoc
   replacements on delisting. Regenerate both when you notice a change. A stale
   entry mislabels which INDEX a name belongs to; it never invents a price, a
   signal or a score, all of which are computed from bars regardless. */

// As of the 2024 reconstitution: NVDA replaced INTC and SHW replaced DOW
// (Nov 2024), AMZN replaced WBA (Feb 2024).
export const DOW30 = [
  "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
  "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK",
  "MSFT", "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
];

// The Nasdaq-100 reconstitutes each December; this is the list as of the most
// recent one I can account for. Treat a mismatch as a prompt to regenerate.
export const NDX100 = [
  "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
  "AMZN", "ANSS", "APP", "ARM", "ASML", "AVGO", "AXON", "AZN", "BIIB", "BKNG",
  "BKR", "CCEP", "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD",
  "CSCO", "CSGP", "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DXCM", "EA", "EXC",
  "FANG", "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL", "HON", "IDXX",
  "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU", "MAR",
  "MCHP", "MDB", "MDLZ", "MELI", "META", "MNST", "MRVL", "MSFT", "MU", "NFLX",
  "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX", "PCAR", "PDD", "PEP",
  "PLTR", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX", "SNPS", "TEAM", "TMUS",
  "TSLA", "TTD", "TTWO", "TXN", "VRSK", "VRTX", "WBD", "WDAY", "XEL", "ZS",
];

export const INDEX_FALLBACK = { nasdaq: NDX100, dowjones: DOW30 };
