"use client";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const STAT_CONFIG = [
  { type: "banned", label: "Banned", icon: "🚫", color: "#dc2626", bg: "#fff5f5", border: "#fed7d7" },
  { type: "recalled", label: "Recalled", icon: "⚠️", color: "#d97706", bg: "#fffaf0", border: "#feebc8" },
  { type: "counterfeit", label: "Counterfeit", icon: "🔴", color: "#7c3aed", bg: "#faf5ff", border: "#e9d8fd" },
  { type: "nsq", label: "NSQ", icon: "📋", color: "#0369a1", bg: "#ebf8ff", border: "#bee3f8" },
];

function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) {
      setCount(0);
      return;
    }
    let start = 0;
    const increment = Math.ceil(duration / target);
    const timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start >= target) clearInterval(timer);
    }, increment);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function StatCard({ config, count }) {
  const [hovered, setHovered] = useState(false);
  const displayed = useCountUp(count);
  return (
    <div
      style={{
        background: config.bg,
        border: `1px solid ${config.border}`,
        borderRadius: "12px",
        padding: "16px 20px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flex: "1 1 140px",
        minWidth: "130px",
        boxShadow: hovered
          ? "0 4px 12px rgba(0,0,0,0.10)"
          : "0 1px 4px rgba(0,0,0,0.06)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: "default",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={{ fontSize: "24px" }}>{config.icon}</span>
      <div>
        <div style={{
          fontSize: "26px",
          fontWeight: "800",
          color: config.color,
          lineHeight: 1,
        }}>
          {displayed}
        </div>
        <div style={{
          fontSize: "12px",
          fontWeight: "600",
          color: "#6b7280",
          marginTop: "2px",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}>
          {config.label}
        </div>
      </div>
    </div>
  );
}

export default function SafetyStatsBanner() {
  const [banned, setBanned] = useState(0);
  const [recalled, setRecalled] = useState(0);
  const [counterfeit, setCounterfeit] = useState(0);
  const [nsq, setNsq] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAlerts() {
      const now = new Date();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
      ).toISOString();
      const endOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0
      ).toISOString();

      const { data, error } = await supabase
        .from("drug_alerts")
        .select("alert_type")
        .gte("created_at", startOfMonth)
        .lte("created_at", endOfMonth);

      if (!error && data) {
        let b = 0, r = 0, c = 0, n = 0;
        data.forEach((alert) => {
          const type = alert.alert_type?.toLowerCase();
          if (type === "banned") b++;
          else if (type === "recalled") r++;
          else if (type === "counterfeit") c++;
          else if (type === "nsq") n++;
        });
        setBanned(b);
        setRecalled(r);
        setCounterfeit(c);
        setNsq(n);
      }
      setLoading(false);
    }
    fetchAlerts();
  }, []);

  const now = new Date();
  const monthName = now.toLocaleString("default", { month: "long" });

  const cardData = [
    { ...STAT_CONFIG[0], count: banned },
    { ...STAT_CONFIG[1], count: recalled },
    { ...STAT_CONFIG[2], count: counterfeit },
    { ...STAT_CONFIG[3], count: nsq },
  ];

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e5e7eb",
      borderRadius: "16px",
      padding: "24px 28px",
      margin: "24px 0",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "16px",
        flexWrap: "wrap",
        gap: "8px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            background: "#dcfce7",
            color: "#15803d",
            fontSize: "12px",
            fontWeight: "700",
            padding: "3px 10px",
            borderRadius: "999px",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}>
            <span style={{
              width: "6px",
              height: "6px",
              background: "#22c55e",
              borderRadius: "50%",
              display: "inline-block",
            }} />
            Live
          </span>
          <span style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>
            Medicine Safety Alerts
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#6b7280" }}>
          📅 {monthName} {now.getFullYear()} · India
        </span>
      </div>

      {/* Cards */}
      {loading ? (
        <div style={{ color: "#9ca3af", fontSize: "14px" }}>
          Loading alerts...
        </div>
      ) : (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          {cardData.map((card) => (
            <StatCard key={card.type} config={card} count={card.count} />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: "14px",
        fontSize: "12px",
        color: "#9ca3af",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}>
        <span>🛡️</span>
        <span>Data sourced from CDSCO official registry. Updated in real-time.</span>
      </div>
    </div>
  );
}
