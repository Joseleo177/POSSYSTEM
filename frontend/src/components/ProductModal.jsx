import { useState, useEffect } from "react";
import Modal from "./Modal";

const UNITS = ["unidad", "kg", "gramo", "litro", "ml", "metro", "cm"];
const PKG_UNITS = ["caja", "bulto", "paquete", "docena", "media caja", "fardo", "saco"];
const EMPTY = {
  name: "", price: "", stock: "", category_id: "", unit: "unidad", qty_step: "1",
  package_unit: "", package_size: "", cost_price: "", profit_margin: "",
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

const sectionLabel = {
  fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 10, marginTop: 16,
  borderBottom: "1px solid #1e1e1e", paddingBottom: 4,
};

export default function ProductModal({ open, onClose, onSave, editData, categories, loading }) {
  const [form, setForm]             = useState(EMPTY);
  const [imageFile, setImageFile]   = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          name:          editData.name,
          price:         editData.price,
          stock:         editData.stock,
          category_id:   editData.category_id || "",
          unit:          editData.unit || "unidad",
          qty_step:      editData.qty_step || "1",
          package_unit:  editData.package_unit || "",
          package_size:  editData.package_size || "",
          cost_price:    editData.cost_price || "",
          profit_margin: editData.profit_margin || "",
        });
        setImagePreview(editData.image_url || null);
      } else {
        setForm(EMPTY);
        setImagePreview(null);
      }
      setImageFile(null);
    }
  }, [open, editData]);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  // Auto-calculate sale price from cost + margin
  const calcSalePrice = (cost, margin) => {
    const c = parseFloat(cost);
    const m = parseFloat(margin);
    if (!isNaN(c) && c > 0 && !isNaN(m) && m >= 0) {
      return (c * (1 + m / 100)).toFixed(2);
    }
    return null;
  };

  const handleCostOrMarginChange = (key, val) => {
    const next = { ...form, [key]: val };
    const suggested = calcSalePrice(
      key === "cost_price"    ? val : form.cost_price,
      key === "profit_margin" ? val : form.profit_margin
    );
    if (suggested !== null) next.price = suggested;
    setForm(next);
  };

  const handleImageChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const handleSave = () => onSave(form, imageFile);

  const isEdit = !!editData;

  const suggestedPrice = calcSalePrice(form.cost_price, form.profit_margin);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "✏ EDITAR PRODUCTO" : "+ NUEVO PRODUCTO"} width={620}>

      {/* ── Imagen + campos básicos ── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "start" }}>
        {/* Imagen */}
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 6 }}>IMAGEN</div>
          <label style={{ display: "block", cursor: "pointer" }}>
            <div
              style={{ width: 110, height: 110, borderRadius: 6, overflow: "hidden", background: "#111", border: "2px dashed #333", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color .15s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#f0a500"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "#333"}
            >
              {imagePreview
                ? <img src={imagePreview} alt="preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <div style={{ textAlign: "center", color: "#444" }}>
                    <div style={{ fontSize: 28 }}>📷</div>
                    <div style={{ fontSize: 10, marginTop: 4 }}>Subir</div>
                  </div>
              }
            </div>
            <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
          </label>
          {imagePreview && (
            <button
              onClick={() => { setImageFile(null); setImagePreview(null); }}
              style={{ ...btnSmall, marginTop: 6, width: "100%", color: "#e74c3c", borderColor: "#444", padding: "4px 0" }}
            >Quitar</button>
          )}
        </div>

        {/* Campos básicos */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
            {[["Nombre *", "name", "text"], ["Precio venta *", "price", "number"], ["Stock", "stock", "number"]].map(([label, key, type]) => (
              <div key={key}>
                <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>{label}</div>
                {key === "stock" && editData?.id
                  ? <div style={{ ...inp, background: "#080808", color: "#5dade2", cursor: "default" }}>
                      {form[key] ?? 0}
                      <span style={{ fontSize: 10, color: "#555", marginLeft: 6 }}>— solo vía compras/ventas</span>
                    </div>
                  : <input
                      value={form[key]}
                      onChange={e => set(key, e.target.value)}
                      type={type} style={inp}
                      autoFocus={key === "name"}
                      step={key === "price" || key === "stock" ? "0.01" : undefined}
                    />
                }
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Categoría</div>
              <select value={form.category_id} onChange={e => set("category_id", e.target.value)} style={inp}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Unidad</div>
              <select value={form.unit} onChange={e => set("unit", e.target.value)} style={inp}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Venta mínima</div>
              <input
                value={form.qty_step}
                onChange={e => set("qty_step", e.target.value)}
                type="number" min="0.001" step="0.001" style={inp}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sección: Paquete / Bulto ── */}
      <div style={sectionLabel}>PAQUETE / BULTO (opcional)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Nombre del paquete</div>
          <input
            list="pkg-units-list"
            value={form.package_unit}
            onChange={e => set("package_unit", e.target.value)}
            placeholder="ej. caja, bulto, docena..."
            style={inp}
          />
          <datalist id="pkg-units-list">
            {PKG_UNITS.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Unidades por paquete</div>
          <input
            value={form.package_size}
            onChange={e => set("package_size", e.target.value)}
            type="number" min="1" step="1"
            placeholder="ej. 12"
            style={inp}
          />
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#444" }}>
        Ej: "caja" de 12 unidades → al registrar una compra se calcula el precio unitario automáticamente.
      </div>

      {/* ── Sección: Costo y Margen ── */}
      <div style={sectionLabel}>COSTO Y MARGEN DE GANANCIA (opcional)</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Precio de costo (unitario)</div>
          <input
            value={form.cost_price}
            onChange={e => handleCostOrMarginChange("cost_price", e.target.value)}
            type="number" min="0" step="0.01"
            placeholder="0.00"
            style={inp}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Margen de ganancia (%)</div>
          <input
            value={form.profit_margin}
            onChange={e => handleCostOrMarginChange("profit_margin", e.target.value)}
            type="number" min="0" step="0.1"
            placeholder="ej. 50"
            style={inp}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#888", marginBottom: 4 }}>Precio sugerido</div>
          <div style={{
            ...inp, display: "flex", alignItems: "center", justifyContent: "space-between",
            color: suggestedPrice ? "#f0a500" : "#333", fontWeight: suggestedPrice ? "bold" : "normal",
            cursor: suggestedPrice ? "pointer" : "default",
          }}
            title={suggestedPrice ? "Clic para aplicar al precio de venta" : ""}
            onClick={() => { if (suggestedPrice) set("price", suggestedPrice); }}
          >
            {suggestedPrice ? `$${suggestedPrice}` : "—"}
            {suggestedPrice && <span style={{ fontSize: 9, color: "#888" }}>↑ aplicar</span>}
          </div>
        </div>
      </div>

      {/* Botones */}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
        <button onClick={onClose} style={{ ...btnSmall, padding: "8px 18px", fontSize: 12 }}>Cancelar</button>
        <button
          onClick={handleSave} disabled={loading}
          style={{ background: loading ? "#7a5200" : "#f0a500", color: "#0f0f0f", border: "none", padding: "8px 24px", borderRadius: 4, fontFamily: "inherit", fontWeight: "bold", cursor: loading ? "not-allowed" : "pointer", fontSize: 13 }}
        >
          {loading ? "Guardando..." : isEdit ? "Guardar" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}
