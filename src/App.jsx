import { useState } from "react";
import EventDashboard from "./EventDashboard.jsx";
import Dashboard from "./Dashboard.jsx";

const PRODUCTS = [
  { id: "events", label: "VOLATILITY · MOMENTUM RADAR" },
  { id: "canslim", label: "CANSLIM RS DASHBOARD" },
];

export default function App() {
  const [product, setProduct] = useState("events");
  return (
    <div style={{ background: "#080b0e", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 4, padding: "8px 16px", background: "#05070a", borderBottom: "1px solid #1e2530", alignItems: "center" }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "#475569", marginRight: 10, letterSpacing: "0.05em" }}>TIGERTRADE ▸</span>
        {PRODUCTS.map((p) => (
          <button key={p.id} onClick={() => setProduct(p.id)}
            style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, fontWeight: 600, padding: "5px 12px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.04em",
              background: product === p.id ? "#f59e0b1e" : "transparent",
              color: product === p.id ? "#f59e0b" : "#64748b",
              border: `1px solid ${product === p.id ? "#f59e0b55" : "#1e2530"}` }}>
            {p.label}
          </button>
        ))}
      </div>
      {product === "events" ? <EventDashboard /> : <Dashboard />}
    </div>
  );
}
