import { useState } from "react";
import { api } from "../services/api";

export default function LoginScreen({ onLogin }) {
  const [form, setForm]   = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await api.auth.login(form);
      localStorage.setItem("pos_token", res.token);
      onLogin(res.employee);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0f0f0f",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Courier New', monospace",
    }}>
      <div style={{ width: 340 }}>
        {/* Logo / título */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <div style={{ fontSize: 40, color: "#f0a500", marginBottom: 8 }}>▣</div>
          <div style={{ fontSize: 22, fontWeight: "bold", color: "#f0a500", letterSpacing: 4 }}>MI TIENDA POS</div>
          <div style={{ fontSize: 11, color: "#444", marginTop: 4, letterSpacing: 2 }}>SISTEMA DE PUNTO DE VENTA</div>
        </div>

        <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, letterSpacing: 1 }}>USUARIO</div>
            <input
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              autoFocus
              style={{ width: "100%", background: "#0f0f0f", border: "1px solid #333", color: "#e8e0d0", padding: "10px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 6, letterSpacing: 1 }}>CONTRASEÑA</div>
            <input
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={{ width: "100%", background: "#0f0f0f", border: "1px solid #333", color: "#e8e0d0", padding: "10px 12px", borderRadius: 4, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ background: "#2b1111", border: "1px solid #e74c3c", borderRadius: 4, padding: "8px 12px", marginBottom: 16, fontSize: 12, color: "#e74c3c" }}>
              {error}
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{
            width: "100%", background: loading ? "#7a5200" : "#f0a500",
            color: "#0f0f0f", border: "none", padding: 12, borderRadius: 4,
            fontFamily: "inherit", fontSize: 14, fontWeight: "bold",
            letterSpacing: 2, cursor: loading ? "not-allowed" : "pointer",
          }}>
            {loading ? "INGRESANDO..." : "INGRESAR"}
          </button>

          <div style={{ marginTop: 16, fontSize: 11, color: "#333", textAlign: "center" }}>
            Usuario por defecto: <span style={{ color: "#555" }}>admin / admin1234</span>
          </div>
        </div>
      </div>
    </div>
  );
}
