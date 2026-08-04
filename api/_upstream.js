// api/_upstream.js — outbound fetch with an optional residential proxy
//
// Yahoo's endpoints are free and unkeyed, which means they are defended by IP
// reputation instead: datacenter ranges get rate-limited, and Vercel's are
// heavily used. That is the suspected reason the cookie/crumb handshake fails in
// production while the same code works from a laptop. A residential proxy
// (Massive — https://massive.com) puts those requests behind an IP that isn't
// pre-judged.
//
//   MASSIVE_PROXY_URL   full proxy URL *with credentials*, exactly as Massive's
//                       dashboard gives it, e.g.
//                       http://user:pass@network.example.com:65535
//
// WHY THIS IS NOT APPLIED TO EVERYTHING. A residential proxy bills by the
// gigabyte. Keyed APIs (Finnhub, FMP) authenticate by token and do not care what
// IP you call from, so routing them through it would spend bandwidth for nothing.
// Only the unkeyed, IP-defended Yahoo calls go through it, and only the small
// ones by default:
//
//   • always proxied (when the URL is set): the crumb handshake, quoteSummary and
//     chart-events calls in /api/earnings — a few KB each, and the ones that
//     actually get refused.
//   • proxied only with MASSIVE_PROXY_BULK=1: /api/yahoo and the nightly
//     snapshot's ~500 one-year history pulls. That is tens of megabytes per full
//     compute, so it is opt-in on purpose — turn it on only if Yahoo starts
//     refusing the snapshot, and only with a Blob store connected so the compute
//     runs once a weekday rather than on every request.

import { ProxyAgent } from "undici";

const PROXY_URL = (process.env.MASSIVE_PROXY_URL || process.env.UPSTREAM_PROXY_URL || "").trim();
export const hasProxy = !!PROXY_URL;
export const proxyBulk = hasProxy && (process.env.MASSIVE_PROXY_BULK === "1" || process.env.MASSIVE_PROXY_BULK === "true");

let agent = null;
let agentFailed = false;

function dispatcher() {
  if (!hasProxy || agentFailed) return null;
  if (!agent) {
    try { agent = new ProxyAgent(PROXY_URL); }
    catch { agentFailed = true; return null; }    // a malformed URL must not take the endpoint down
  }
  return agent;
}

// Always goes through globalThis.fetch rather than importing undici's, so tests
// that stub the global still intercept these calls; `dispatcher` is simply an
// extra option the stub ignores.
export function uFetch(url, opts = {}) {
  const d = dispatcher();
  return globalThis.fetch(url, d ? { ...opts, dispatcher: d } : opts);
}

// For the bulk paths: proxied only when explicitly opted in, plain otherwise.
export function bulkFetch(url, opts = {}) {
  return proxyBulk ? uFetch(url, opts) : globalThis.fetch(url, opts);
}
