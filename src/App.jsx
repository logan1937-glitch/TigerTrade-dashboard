import { useState } from "react";
import EventDashboard from "./EventDashboard.jsx";
import Dashboard from "./Dashboard.jsx";

const PRODUCTS = [
  { id: "events", label: "VOLATILITY · MOMENTUM RADAR" },
  { id: "canslim", label: "CANSLIM SCREENER" },
];

export default function App() {
  const [product, setProduct] = useState("events");
  return (
    <div style={{ background: "#e6ebf2", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 6, padding: "9px 18px", background: "#f7f9fc", borderBottom: "1px solid #dde3ec", alignItems: "center", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        <span style={{ fontFamily: "'Syne',sans-serif", fontSize: 13, fontWeight: 800, color: "#1e3a8a", marginRight: 8, letterSpacing: "-0.01em" }}>
          TIGER<span style={{ color: "#ea580c" }}>TRADE</span>
        </span>
        {PRODUCTS.map((p) => {
          const on = product === p.id;
          return (
            <button key={p.id} onClick={() => setProduct(p.id)}
              style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 600, padding: "6px 13px", borderRadius: 999, cursor: "pointer", letterSpacing: "0.03em",
                background: on ? "#eff6ff" : "transparent",
                color: on ? "#2563eb" : "#64748b",
                border: `1px solid ${on ? "#dbeafe" : "transparent"}` }}>
              {p.label}
            </button>
          );
        })}
      </div>
      {product === "events" ? <EventDashboard /> : <Dashboard />}
    </div>
  );
}
