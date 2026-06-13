import { useState, useEffect } from "react";
import EventDashboard from "./EventDashboard.jsx";
import Dashboard from "./Dashboard.jsx";

const GOOGLE_FONT = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Syne:wght@400;600;700;800&display=swap";

// ── design tokens + global polish + responsive (single source of truth) ──────
const THEME_CSS = `
:root{
  --bg:#e6ebf2; --surface:#f7f9fc; --surface-2:#eef2f7;
  --surface-grad:linear-gradient(180deg,#fdfeff 0%,#f3f6fb 100%);
  --border:#dde3ec; --border-strong:#cbd5e1;
  --ink:#0f172a; --ink-soft:#475569; --ink-mute:#94a3b8;
  --blue-deep:#1e3a8a; --blue-soft:#dbeafe; --blue-wash:#eff6ff;
  --orange-soft:#ffedd5; --orange-wash:#fff7ed;
  --green-soft:#dcfce7; --red-soft:#fee2e2;
  --shadow-sm:0 1px 2px rgba(15,23,42,0.08);
  --shadow-card:0 1px 2px rgba(15,23,42,0.05), 0 4px 14px rgba(15,23,42,0.08);
  --shadow-hover:0 16px 34px rgba(15,23,42,0.18);
  --shadow-modal:0 24px 50px rgba(15,23,42,0.22);
}
[data-theme="dark"]{
  --bg:#0a1120; --surface:#121b2e; --surface-2:#0e1626;
  --surface-grad:linear-gradient(180deg,#18233b 0%,#111a2c 100%);
  --border:#23304a; --border-strong:#33415c;
  --ink:#e9eef7; --ink-soft:#9fb1ca; --ink-mute:#64748b;
  --blue-deep:#93c5fd; --blue-soft:#1e3a8a; --blue-wash:#14233f;
  --orange-soft:#7c2d1255; --orange-wash:#241410;
  --green-soft:#0e3a2c; --red-soft:#3a1417;
  --shadow-sm:0 1px 2px rgba(0,0,0,0.45);
  --shadow-card:0 1px 2px rgba(0,0,0,0.4), 0 6px 18px rgba(0,0,0,0.5);
  --shadow-hover:0 18px 38px rgba(0,0,0,0.6);
  --shadow-modal:0 30px 60px rgba(0,0,0,0.75);
  color-scheme:dark;
}
html,body{margin:0;background:var(--bg);transition:background-color .25s ease;}
input[type="range"]{accent-color:#3b82f6;}
.tt-card{box-shadow:var(--shadow-card); transition:transform .16s ease, box-shadow .16s ease, border-color .16s ease;}
.tt-card:hover{transform:translateY(-3px); box-shadow:var(--shadow-hover); border-color:var(--border-strong);}
.tt-btn{transition:transform .1s ease, filter .12s ease;}
.tt-btn:hover{filter:brightness(1.05);}
.tt-btn:active{transform:translateY(1px);}
.tt-img{-webkit-user-drag:none; user-select:none;}
.tt-scroll{overflow-x:auto;}
.tt-scroll-inner{min-width:720px;}
@media (max-width:760px){
  .tt-content{padding-left:14px !important; padding-right:14px !important;}
  .tt-cal{grid-template-columns:1fr !important;}
  .tt-stat5{grid-template-columns:repeat(2,1fr) !important;}
}
`;

const PRODUCTS = [
  { id: "events", label: "VOLATILITY · MOMENTUM RADAR" },
  { id: "canslim", label: "CANSLIM SCREENER" },
];

export default function App() {
  const [product, setProduct] = useState("events");
  const [theme, setTheme] = useState(() => (typeof localStorage !== "undefined" && localStorage.getItem("tt-theme")) || "light");

  useEffect(() => {
    const link = document.createElement("link"); link.rel = "stylesheet"; link.href = GOOGLE_FONT;
    document.head.appendChild(link);
    const style = document.createElement("style"); style.textContent = THEME_CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("tt-theme", theme); } catch {}
  }, [theme]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 6, padding: "9px 16px", background: "var(--surface)", borderBottom: "1px solid var(--border)", alignItems: "center", boxShadow: "var(--shadow-sm)", flexWrap: "wrap" }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800, color: "var(--blue-deep)", marginRight: 6, letterSpacing: "-0.01em" }}>
          TIGER<span style={{ color: "#f97316" }}>TRADE</span>
        </span>
        {PRODUCTS.map((p) => {
          const on = product === p.id;
          return (
            <button key={p.id} className="tt-btn" onClick={() => setProduct(p.id)}
              style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", letterSpacing: "0.03em",
                background: on ? "var(--blue-wash)" : "transparent",
                color: on ? "#3b82f6" : "var(--ink-soft)",
                border: `1px solid ${on ? "var(--blue-soft)" : "transparent"}` }}>
              {p.label}
            </button>
          );
        })}
        <button className="tt-btn" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title="Toggle theme"
          style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, lineHeight: 1, padding: "6px 11px", borderRadius: 999, cursor: "pointer", background: "var(--surface-2)", color: "var(--ink-soft)", border: "1px solid var(--border)" }}>
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>
      {product === "events" ? <EventDashboard /> : <Dashboard />}
    </div>
  );
}
