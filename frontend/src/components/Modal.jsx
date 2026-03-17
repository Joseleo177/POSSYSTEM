import { useEffect } from "react";

export default function Modal({ open, onClose, title, children, width = 560 }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#1a1a1a", border: "1px solid #f0a500",
          borderRadius: 8, width: "100%", maxWidth: width,
          maxHeight: "90vh", overflowY: "auto",
          fontFamily: "'Courier New', monospace",
          boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid #2a2a2a",
        }}>
          <div style={{ fontWeight: "bold", fontSize: 13, color: "#f0a500", letterSpacing: 2 }}>
            {title}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "none", color: "#555",
              fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px",
            }}
            onMouseEnter={e => e.currentTarget.style.color = "#e74c3c"}
            onMouseLeave={e => e.currentTarget.style.color = "#555"}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
