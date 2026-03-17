import { useState, useEffect } from "react";
import Modal from "./Modal";

const EMPTY = {
  type: "cliente",
  name: "", phone: "", email: "", address: "",
  rif: "", tax_name: "", notes: "",
};

const inp = {
  width: "100%", background: "#0f0f0f", border: "1px solid #333",
  color: "#e8e0d0", padding: "8px 10px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};
const btnSmall = {
  background: "transparent", color: "#888", border: "1px solid #333",
  padding: "3px 8px", borderRadius: 3, cursor: "pointer", fontFamily: "inherit", fontSize: 11,
};

export default function CustomerModal({ open, onClose, onSave, editData, loading }) {
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (open) {
      if (editData?.id) {
        // Editing existing record
        setForm({
          type:     editData.type     || "cliente",
          name:     editData.name     || "",
          phone:    editData.phone    || "",
          email:    editData.email    || "",
          address:  editData.address  || "",
          rif:      editData.rif      || "",
          tax_name: editData.tax_name || "",
          notes:    editData.notes    || "",
        });
      } else {
        // New record — pre-set type and optional name if provided
        setForm({ ...EMPTY, type: editData?._newType || "cliente", name: editData?._newName || "" });
      }
    }
  }, [open, editData]);

  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const isEdit = !!editData;
  const isProveedor = form.type === "proveedor";

  const typeLabel   = isProveedor ? "Proveedor" : "Cliente";
  const modalTitle  = isEdit
    ? `✏ EDITAR ${typeLabel.toUpperCase()}`
    : `+ REGISTRAR ${typeLabel.toUpperCase()}`;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} width={600}>

      {/* ── Toggle tipo ── */}
      <div style={{ display: "flex", gap: 0, marginBottom: 18, background: "#111", borderRadius: 4, padding: 3, width: "fit-content" }}>
        {[["cliente", "👤 Cliente"], ["proveedor", "🏭 Proveedor"]].map(([val, label]) => (
          <button
            key={val}
            onClick={() => setForm(p => ({ ...p, type: val }))}
            style={{
              background: form.type === val ? (val === "cliente" ? "#2980b9" : "#8e44ad") : "transparent",
              color: form.type === val ? "#fff" : "#555",
              border: "none", padding: "6px 20px", borderRadius: 3,
              fontFamily: "inherit", fontSize: 12, fontWeight: "bold",
              cursor: "pointer", transition: "all .15s",
            }}
          >{label}</button>
        ))}
      </div>

      {/* ── Datos de contacto ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>
            {isProveedor ? "Nombre o empresa *" : "Nombre *"}
          </div>
          <input value={form.name} onChange={set("name")} type="text" style={inp} autoFocus />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Teléfono</div>
          <input value={form.phone} onChange={set("phone")} type="text" style={inp} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Correo</div>
          <input value={form.email} onChange={set("email")} type="email" style={inp} />
        </div>
      </div>

      {/* ── Dirección ── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Dirección</div>
        <input value={form.address} onChange={set("address")} type="text" style={inp} />
      </div>

      {/* ── Datos fiscales ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isProveedor ? "1fr 1fr" : "1fr",
        gap: 10, marginBottom: 10,
      }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>RIF / Cédula</div>
          <input
            value={form.rif} onChange={set("rif")} type="text"
            placeholder={isProveedor ? "J-12345678-9" : "V-12345678"}
            style={inp}
          />
        </div>

        {isProveedor && (
          <div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Razón social</div>
            <input value={form.tax_name} onChange={set("tax_name")} type="text" style={inp} />
          </div>
        )}
      </div>

      {/* ── Notas ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Notas</div>
        <textarea
          value={form.notes} onChange={set("notes")} rows={2}
          style={{ ...inp, resize: "vertical", minHeight: 52 }}
        />
      </div>

      {/* ── Botones ── */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={{ ...btnSmall, padding: "8px 18px", fontSize: 12 }}>Cancelar</button>
        <button
          onClick={() => onSave(form)} disabled={loading}
          style={{
            background: loading ? "#444" : isProveedor ? "#8e44ad" : "#2980b9",
            color: "#fff", border: "none", padding: "8px 24px", borderRadius: 4,
            fontFamily: "inherit", fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer", fontSize: 13,
          }}
        >
          {loading ? "Guardando..." : isEdit ? "Guardar" : `Registrar ${typeLabel}`}
        </button>
      </div>
    </Modal>
  );
}
