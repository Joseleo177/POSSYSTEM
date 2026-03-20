import { useState, useEffect } from "react";
import Modal from "./Modal";

const UNITS = ["unidad", "kg", "gramo", "litro", "ml", "metro", "cm"];
const PKG_UNITS = ["caja", "bulto", "paquete", "docena", "media caja", "fardo", "saco"];
const EMPTY = {
  name: "", price: "", stock: "", category_id: "", unit: "unidad", qty_step: "1",
  package_unit: "", package_size: "", cost_price: "", profit_margin: "",
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
      <div className="grid grid-cols-[auto_1fr] gap-[18px] items-start">
        {/* Imagen */}
        <div>
          <div className="label">IMAGEN</div>
          <label className="block cursor-pointer">
            <div className="w-[110px] h-[110px] rounded-md overflow-hidden bg-surface-dark dark:bg-surface-dark border-2 border-dashed border-border dark:border-border-dark hover:border-brand-400 transition-colors flex items-center justify-center cursor-pointer">
              {imagePreview
                ? <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                : <div className="text-center text-content-muted dark:text-content-dark-muted">
                    <div className="text-[28px]">📷</div>
                    <div className="text-[10px] mt-1">Subir</div>
                  </div>
              }
            </div>
            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
          </label>
          {imagePreview && (
            <button
              onClick={() => { setImageFile(null); setImagePreview(null); }}
              className="btn-sm btn-danger mt-1.5 w-full"
            >Quitar</button>
          )}
        </div>

        {/* Campos básicos */}
        <div>
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-[10px] mb-[10px]">
            {[["Nombre *", "name", "text"], ["Precio venta *", "price", "number"], ["Stock", "stock", "number"]].map(([lbl, key, type]) => (
              <div key={key}>
                <label className="label">{lbl}</label>
                {key === "stock" && editData?.id
                  ? <div className="input flex items-center bg-surface-dark-3 dark:bg-surface-dark-3 text-info cursor-default">
                      {form[key] ?? 0}
                      <span className="text-[10px] text-content-muted dark:text-content-dark-muted ml-1.5">— solo vía compras/ventas</span>
                    </div>
                  : <input
                      value={form[key]}
                      onChange={e => set(key, e.target.value)}
                      type={type} className="input"
                      autoFocus={key === "name"}
                      step={key === "price" || key === "stock" ? "0.01" : undefined}
                    />
                }
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-[10px]">
            <div>
              <label className="label">Categoría</label>
              <select value={form.category_id} onChange={e => set("category_id", e.target.value)} className="input">
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Unidad</label>
              <select value={form.unit} onChange={e => set("unit", e.target.value)} className="input">
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Venta mínima</label>
              <input
                value={form.qty_step}
                onChange={e => set("qty_step", e.target.value)}
                type="number" min="0.001" step="0.001" className="input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Sección: Paquete / Bulto ── */}
      <div className="text-[10px] uppercase tracking-[2px] text-content-muted dark:text-content-dark-muted mt-4 mb-[10px] pb-1 border-b border-border dark:border-border-dark">
        PAQUETE / BULTO (opcional)
      </div>
      <div className="grid grid-cols-2 gap-[10px] mb-[10px]">
        <div>
          <label className="label">Nombre del paquete</label>
          <input
            list="pkg-units-list"
            value={form.package_unit}
            onChange={e => set("package_unit", e.target.value)}
            placeholder="ej. caja, bulto, docena..."
            className="input"
          />
          <datalist id="pkg-units-list">
            {PKG_UNITS.map(u => <option key={u} value={u} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Unidades por paquete</label>
          <input
            value={form.package_size}
            onChange={e => set("package_size", e.target.value)}
            type="number" min="1" step="1"
            placeholder="ej. 12"
            className="input"
          />
        </div>
      </div>
      <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
        Ej: "caja" de 12 unidades → al registrar una compra se calcula el precio unitario automáticamente.
      </div>

      {/* ── Sección: Costo y Margen ── */}
      <div className="text-[10px] uppercase tracking-[2px] text-content-muted dark:text-content-dark-muted mt-4 mb-[10px] pb-1 border-b border-border dark:border-border-dark">
        COSTO Y MARGEN DE GANANCIA (opcional)
      </div>
      <div className="grid grid-cols-3 gap-[10px]">
        <div>
          <label className="label">Precio de costo (unitario)</label>
          <input
            value={form.cost_price}
            onChange={e => handleCostOrMarginChange("cost_price", e.target.value)}
            type="number" min="0" step="0.01"
            placeholder="0.00"
            className="input"
          />
        </div>
        <div>
          <label className="label">Margen de ganancia (%)</label>
          <input
            value={form.profit_margin}
            onChange={e => handleCostOrMarginChange("profit_margin", e.target.value)}
            type="number" min="0" step="0.1"
            placeholder="ej. 50"
            className="input"
          />
        </div>
        <div>
          <label className="label">Precio sugerido</label>
          <div
            className={[
              "input flex items-center justify-between",
              suggestedPrice
                ? "text-warning font-bold cursor-pointer"
                : "text-content-muted dark:text-content-dark-muted cursor-default",
            ].join(" ")}
            title={suggestedPrice ? "Clic para aplicar al precio de venta" : ""}
            onClick={() => { if (suggestedPrice) set("price", suggestedPrice); }}
          >
            {suggestedPrice ? `$${suggestedPrice}` : "—"}
            {suggestedPrice && <span className="text-[9px] text-content-muted dark:text-content-dark-muted">↑ aplicar</span>}
          </div>
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-[10px] justify-end mt-5">
        <button onClick={onClose} className="btn-sm btn-secondary">Cancelar</button>
        <button
          onClick={handleSave} disabled={loading}
          className={[
            "btn-md font-bold border-none rounded",
            loading
              ? "opacity-60 cursor-not-allowed bg-warning/60 text-surface-dark"
              : "bg-warning text-surface-dark hover:bg-amber-400 cursor-pointer",
          ].join(" ")}
        >
          {loading ? "Guardando..." : isEdit ? "Guardar" : "Agregar"}
        </button>
      </div>
    </Modal>
  );
}
