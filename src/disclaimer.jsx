import { useState } from "react";

const ACK_KEY = "tt_disclaimer_ack_v1";

const POINTS = [
  "TigerTrade Terminal is provided for informational and educational purposes only.",
  "Nothing here is investment, financial, legal, tax, or other professional advice, nor an offer, solicitation, or recommendation to buy or sell any security or to adopt any strategy.",
  "Market data, prices, scores, signals and analytics may be delayed, incomplete, inaccurate, or illustrative / simulated, and must be independently verified before any decision.",
  "Trading and investing involve substantial risk, including the possible loss of all capital invested. Past performance does not guarantee future results.",
  "You are solely responsible for your own decisions and any resulting outcomes.",
  "To the maximum extent permitted by law, TigerTrade and its creators, owners and operators disclaim all warranties (express or implied) and shall not be liable for any losses, damages or claims of any kind arising from use of, or reliance on, this site or its content.",
];

export function Disclaimer() {
  const [acked, setAcked] = useState(() => {
    try { return localStorage.getItem(ACK_KEY) === "1"; } catch { return false; }
  });
  const [open, setOpen] = useState(false); // manual reopen via footer link

  const accept = () => {
    try { localStorage.setItem(ACK_KEY, "1"); } catch {}
    setAcked(true); setOpen(false);
  };

  const showModal = !acked || open;
  const txt = { fontFamily: "var(--font-mono)", color: "var(--muted)" };

  return (
    <>
      {/* persistent footer */}
      <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 60,
        display: "flex", alignItems: "center", gap: 12, justifyContent: "center", flexWrap: "wrap",
        padding: "7px 16px", background: "color-mix(in oklch, var(--bg) 86%, transparent)",
        backdropFilter: "blur(10px)", borderTop: "1px solid var(--border)" }}>
        <span style={{ ...txt, fontSize: 10.5, letterSpacing: "0.02em", textAlign: "center" }}>
          For educational use only — <b style={{ color: "var(--text)", fontWeight: 600 }}>not investment advice</b>.
          Data may be delayed or illustrative; verify before trading. No liability assumed.
        </span>
        <button onClick={() => setOpen(true)} className="linkbtn" style={{ fontSize: 9.5, padding: "4px 9px" }}>Full disclaimer</button>
      </div>

      {showModal && (
        <div className="cmdk-backdrop" style={{ alignItems: "center", paddingTop: 0, zIndex: 220 }}
          onMouseDown={(e) => { if (acked && e.target === e.currentTarget) setOpen(false); }}>
          <div className="cmdk" style={{ width: "min(620px, 94vw)", maxHeight: "84vh", padding: "26px 28px 22px" }} role="dialog" aria-modal="true" aria-label="Disclaimer and terms of use">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span className="hero-badge" style={{ padding: "3px 9px", fontSize: 9, "--accent": "var(--sev-high)", color: "var(--sev-high)" }}>IMPORTANT</span>
              <h2 style={{ fontFamily: "var(--font-display)", fontWeight: "var(--display-weight)", letterSpacing: "-0.015em", fontSize: 21, margin: 0, color: "var(--text)" }}>
                Disclaimer &amp; Terms of Use
              </h2>
            </div>
            <ul style={{ margin: "0 0 18px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 11, overflowY: "auto" }}>
              {POINTS.map((p, i) => (
                <li key={i} style={{ ...txt, fontSize: 12.5, lineHeight: 1.55, display: "grid", gridTemplateColumns: "16px 1fr", gap: 9, alignItems: "start" }}>
                  <span style={{ color: "var(--accent)", marginTop: 1 }}>›</span><span>{p}</span>
                </li>
              ))}
            </ul>
            <p style={{ ...txt, fontSize: 11.5, lineHeight: 1.5, margin: "0 0 16px", color: "var(--dim)" }}>
              By continuing to use this site you acknowledge that you have read, understood and agree to the above.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {acked && (
                <button className="ed-btn" style={{ flex: "none", padding: "11px 16px" }} onClick={() => setOpen(false)}>Close</button>
              )}
              <button className="ed-btn ed-btn-primary" style={{ flex: "none", padding: "11px 18px", fontWeight: 700 }} onClick={accept}>
                I understand and agree
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
