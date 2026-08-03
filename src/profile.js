// ── company profile ──────────────────────────────────────────────────────────
// Real company name, sector, industry, market cap, description and HQ for ANY
// symbol — one lazy FMP call per name, de-duplicated in flight and cached in
// memory + localStorage for 7 days (profiles barely change).
//
// This is what lets a holding outside the tracked S&P 500 universe behave like
// any other name: without it the app has only the ticker, so the "company name"
// falls back to the ticker itself and the sector is unknown. Returns null when
// the symbol has no profile — callers show "—" rather than inventing anything.
const cache = new Map();
const inflight = new Map();

export async function fetchProfile(tk) {
  if (!tk) return null;
  if (cache.has(tk)) return cache.get(tk);
  if (inflight.has(tk)) return inflight.get(tk);
  // v2 key: the earlier cache shape had no name/sector
  try {
    const raw = localStorage.getItem("tt_prof2_" + tk);
    if (raw) { const { t, d } = JSON.parse(raw); if (Date.now() - t < 7 * 864e5) { cache.set(tk, d); return d; } }
  } catch {}
  const job = (async () => {
    try {
      const r = await fetch(`/api/fmp?endpoint=profile&symbol=${encodeURIComponent(tk)}`);
      if (!r.ok) return null;
      const j = await r.json();
      const p = Array.isArray(j) ? j[0] : j;
      if (!p || !(p.symbol || p.companyName)) return null;
      const d = {
        name: p.companyName || null,
        sector: p.sector || null,
        industry: p.industry || null,
        cap: p.marketCap ?? p.mktCap ?? null,
        desc: p.description || null,
        city: p.city || null, state: p.state || null, country: p.country || null,
        exchange: p.exchangeShortName || p.exchange || null,
      };
      cache.set(tk, d);
      try { localStorage.setItem("tt_prof2_" + tk, JSON.stringify({ t: Date.now(), d })); } catch {}
      return d;
    } catch { return null; }
  })();
  inflight.set(tk, job);
  try { return await job; } finally { inflight.delete(tk); }
}
