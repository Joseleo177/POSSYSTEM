import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import { api } from "../services/api";

const UNITS = ["unidad", "kg", "gramo", "litro", "ml", "metro", "cm"];
const PKG_UNITS = ["caja", "bulto", "paquete", "docena", "media caja", "fardo", "saco"];
const EMPTY = {
  name: "", price: "", stock: "", category_id: "", unit: "unidad", qty_step: "1",
  package_unit: "", package_size: "", cost_price: "", profit_margin: "", min_stock: "0",
  is_combo: false, combo_items: [], is_service: false
};

export default function ProductModal({ open, onClose, onSave, editData, categories, loading }) {
  const [form, setForm] = useState(EMPTY);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // Combo states
  const [allProducts, setAllProducts] = useState([]);
  const [searchIngredient, setSearchIngredient] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const ingredientRef = useRef(null);

  // Cargar productos para el combo
  useEffect(() => {
    if (form.is_combo && allProducts.length === 0) {
      api.products.getAll({ limit: 1000 }).then(res => setAllProducts(res.data)).catch(console.error);
    }
  }, [form.is_combo]);

  useEffect(() => {
    if (open) {
      if (editData) {
        setForm({
          name: editData.name,
          price: editData.price,
          stock: editData.stock,
          category_id: editData.category_id || "",
          unit: editData.unit || "unidad",
          qty_step: editData.qty_step || "1",
          package_unit: editData.package_unit || "",
          package_size: editData.package_size || "",
          cost_price: editData.cost_price || "",
          profit_margin: editData.profit_margin || "",
          min_stock: editData.min_stock ?? "0",
          is_combo: editData.is_combo || false,
          is_service: editData.is_service || false,
          combo_items: editData.comboItems ? editData.comboItems.map(c => ({
            product_id: c.ingredient.id,
            name: c.ingredient.name,
            unit: c.ingredient.unit || "uds",
            quantity: c.quantity
          })) : []
        });
        setImagePreview(editData.image_url || null);
      } else {
        setForm(EMPTY);
        setImagePreview(null);
      }
      setImageFile(null);
      setSearchIngredient("");
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
      key === "cost_price" ? val : form.cost_price,
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

  // Funciones de Combo
  const addIngredient = (prod) => {
    if (form.combo_items.find(i => i.product_id === prod.id)) return;
    setForm({ ...form, combo_items: [...form.combo_items, { product_id: prod.id, name: prod.name, unit: prod.unit || "uds", quantity: 1 }] });
    setSearchIngredient("");
    setShowDropdown(false);
  };

  const removeIngredient = (id) => {
    setForm({ ...form, combo_items: form.combo_items.filter(i => i.product_id !== id) });
  };

  const updateIngredientQty = (id, q) => {
    setForm({ ...form, combo_items: form.combo_items.map(i => i.product_id === id ? { ...i, quantity: parseFloat(q) || 0 } : i) });
  };

  // Click outside listener para el dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (ingredientRef.current && !ingredientRef.current.contains(event.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredProducts = allProducts.filter(p => !p.is_combo && p.id !== editData?.id && p.name.toLowerCase().includes(searchIngredient.toLowerCase())).slice(0, 10);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "✏ Editar Detalles del Producto" : "✨ Nuevo Producto"} width={720}>
      <div className="flex flex-col gap-6">

        {/* ── Sección Principal: Imagen + Datos ── */}
        <div className="bg-white dark:bg-surface-dark-2 p-5 rounded-2xl border border-border/40 dark:border-border-dark/40 shadow-sm flex flex-col sm:flex-row gap-6">

          {/* Imagen Subida Premium */}
          <div className="flex-shrink-0">
            <label className="block cursor-pointer relative group">
              <div className="w-[110px] h-[110px] rounded-lg overflow-hidden bg-surface-dark border-2 border-dashed border-border dark:border-border-dark flex items-center justify-center hover:border-brand-400 transition-colors">
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center backdrop-blur-sm rounded-2xl">
                      <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span className="text-white text-[10px] font-bold tracking-widest uppercase">Cambiar</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center flex flex-col items-center text-content-muted dark:text-content-dark-muted group-hover:text-brand-500 transition-colors">
                    <div className="w-12 h-12 rounded-full bg-surface-1 dark:bg-surface-dark-1 border border-border dark:border-border-dark flex items-center justify-center mb-3 group-hover:bg-white dark:group-hover:bg-brand-500/20 group-hover:border-brand-500/30 shadow-sm transition-all duration-300 group-hover:-translate-y-1">
                      <svg className="w-6 h-6 opacity-60 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                    <div className="text-[10px] font-black uppercase tracking-[2px]">Subir Foto</div>
                    <div className="text-[9px] mt-1 opacity-60">PNG, JPG (Max 2MB)</div>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>
            {imagePreview && (
              <button
                onClick={(e) => { e.preventDefault(); setImageFile(null); setImagePreview(null); }}
                className="mt-3 w-full py-2 rounded-xl border border-danger/30 text-danger text-xs font-bold hover:bg-danger/10 transition-colors"
              >
                Eliminar Foto
              </button>
            )}
          </div>

          {/* Información Principal */}
          <div className="flex-1 flex flex-col gap-4 justify-center">
            <div>
              <label className="block text-[10px] font-black tracking-widest uppercase text-content-muted dark:text-content-dark-muted mb-1.5 ml-1"> Nombre del Producto <span className="text-danger">*</span></label>
              <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus className="w-full bg-surface-1 dark:bg-surface-dark-3 text-content dark:text-content-dark border border-border/60 dark:border-border-dark/60 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:bg-white dark:focus:bg-surface-dark-1 transition-all" placeholder="Ej. Coca-Cola 2L, Harina PAN..." />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black tracking-widest uppercase text-content-muted dark:text-content-dark-muted mb-1.5 ml-1"> Categoría </label>
                <select value={form.category_id} onChange={e => set("category_id", e.target.value)} className="w-full bg-surface-1 dark:bg-surface-dark-3 text-content dark:text-content-dark border border-border/60 dark:border-border-dark/60 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:bg-white dark:focus:bg-surface-dark-1 transition-all appearance-none cursor-pointer">
                  <option value="">-- Sin categoría --</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest uppercase text-content-muted dark:text-content-dark-muted mb-1.5 ml-1"> ¿Cómo se vende? </label>
                <select value={form.unit} onChange={e => set("unit", e.target.value)} className="w-full bg-surface-1 dark:bg-surface-dark-3 text-content dark:text-content-dark border border-border/60 dark:border-border-dark/60 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:bg-white dark:focus:bg-surface-dark-1 transition-all appearance-none cursor-pointer">
                  {UNITS.map(u => <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-black tracking-widest uppercase text-content-muted dark:text-content-dark-muted mb-1.5 ml-1 flex items-center gap-1"> Precio Final <span className="text-danger">*</span></label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-content-subtle font-bold tracking-widest">$</span>
                  </div>
                  <input value={form.price} onChange={e => set("price", e.target.value)} type="number" step="0.01" className="w-full bg-brand-500/5 text-brand-500 border border-brand-500/20 rounded-xl pl-10 pr-4 py-3 text-lg font-black focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:bg-brand-500/10 transition-all placeholder-brand-500/30" placeholder="0.00" />
                </div>
              </div>

              {!form.is_combo && !form.is_service && (
                <div>
                  <label className="block text-[10px] font-black tracking-widest uppercase text-content-muted dark:text-content-dark-muted mb-1.5 ml-1"> Inventario Inicial </label>
                  {editData?.id ? (
                    <div className="w-full bg-surface-2 dark:bg-surface-dark-3 text-content-muted border border-border/40  rounded-xl px-4 py-3 text-sm font-bold flex justify-between items-center cursor-not-allowed">
                      {form.stock ?? 0}
                      <span className="text-[9px] bg-black/5 dark:bg-white/5 px-2 py-1 rounded">Vía compras/ventas</span>
                    </div>
                  ) : (
                    <input value={form.stock} onChange={e => set("stock", e.target.value)} type="number" step="0.01" className="w-full bg-surface-1 dark:bg-surface-dark-3 text-content border border-border/60 rounded-xl px-4 py-3 text-base font-bold focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-all" placeholder="0" />
                  )}
                </div>
              )}
            </div>

            {/* Toggle Servicio */}
            <div className="mt-2 bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
              <div>
                <div className="text-[12px] font-bold text-amber-600 dark:text-amber-400">Es un Servicio (Sin Inventario)</div>
                <div className="text-[10px] text-amber-500/70 dark:text-amber-400/70 mt-0.5">Ej: Corte de cabello, Consulta, Envío. No descuenta stock.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={form.is_service} onChange={e => set("is_service", e.target.checked)} />
                <div className="w-11 h-6 bg-surface-3 dark:bg-surface-dark-2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
              </label>
            </div>

            {/* Toggle Combo — oculto si es servicio */}
            {!form.is_service && (
              <div className="mt-2 bg-brand-500/5 dark:bg-brand-500/10 border border-brand-500/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[12px] font-bold text-brand-600 dark:text-brand-400">Producto Compuesto (Kit / Receta)</div>
                  <div className="text-[10px] text-brand-500/70 dark:text-brand-400/70 mt-0.5">Descuenta stock de sus componentes al venderse.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={form.is_combo} onChange={e => set("is_combo", e.target.checked)} disabled={isEdit && form.combo_items.length > 0} />
                  <div className="w-11 h-6 bg-surface-3 dark:bg-surface-dark-2 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-500"></div>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* ── Banner informativo si es servicio ── */}
        {form.is_service && (
          <div className="bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-start gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <div className="font-black text-sm text-amber-700 dark:text-amber-400 mb-1">Producto de tipo Servicio</div>
              <p className="text-[12px] text-amber-600/80 dark:text-amber-400/70 leading-relaxed">
                Este ítem <strong>no gestiona inventario</strong>. Al venderlo no se descontará stock de ningún almacén. Ideal para servicios como cortes de cabello, consultas, envíos, garantías, etc.
              </p>
            </div>
          </div>
        )}

        {/* ── Si NO es combo y NO es servicio: Mostrar Costos. Si es Combo: Mostrar Componentes ── */}
        {!form.is_combo && !form.is_service ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ── Costo y Rendimiento ── */}
            <div className="bg-surface-1/50 dark:bg-surface-dark-2/50 rounded-2xl border border-border/40 dark:border-border-dark/40 p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 rounded-md bg-success/10 text-success flex items-center justify-center">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </div>
                <h3 className="text-[11px] font-black tracking-widest uppercase text-content dark:text-content-dark">Rentabilidad</h3>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold tracking-widest uppercase text-content-muted mb-1.5 ml-1"> Costo Unitario </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle font-bold">$</span>
                      <input value={form.cost_price} onChange={e => handleCostOrMarginChange("cost_price", e.target.value)} type="number" step="0.01" placeholder="0.00" className="w-full bg-white dark:bg-surface-dark-3 border border-border/60 dark:border-border-dark/60 rounded-xl pl-7 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-success/30 transition-all outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold tracking-widest uppercase text-content-muted mb-1.5 ml-1"> Ganancia (%) </label>
                    <div className="relative">
                      <input value={form.profit_margin} onChange={e => handleCostOrMarginChange("profit_margin", e.target.value)} type="number" step="0.1" placeholder="0" className="w-full bg-white dark:bg-surface-dark-3 border border-border/60 dark:border-border-dark/60 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-success/30 transition-all outline-none" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle font-bold">%</span>
                    </div>
                  </div>
                </div>

                <div className={`input flex justify-between items-center group ${suggestedPrice ? "cursor-pointer" : ""} hover:bg-success/10 transition-colors`} title={suggestedPrice ? "Clic para aplicar este precio como Precio Final" : ""} onClick={() => { if (suggestedPrice) set("price", suggestedPrice); }}>
                  <span className="text-[10px] font-black uppercase tracking-widest text-success opacity-80">Precio Sugerido</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-base font-black ${suggestedPrice ? "text-success" : "text-content-muted"}`}>{suggestedPrice ? `$${suggestedPrice}` : "—"}</span>
                    {suggestedPrice && <span className="text-[9px] bg-success text-white px-2 py-0.5 rounded uppercase font-bold tracking-widest opacity-0 group-hover:opacity-100 transition-opacity -translate-x-2 group-hover:translate-x-0 duration-200">Aplicar</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Paquetes y Alertas ── */}
            <div className="flex flex-col gap-4">
              {/* Paquete */}
              <div className="bg-surface-1/50 dark:bg-surface-dark-2/50 rounded-2xl border border-border/40 dark:border-border-dark/40 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-6 h-6 rounded-md bg-info/10 text-info flex items-center justify-center">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  </div>
                  <h3 className="text-[11px] font-black tracking-widest uppercase text-content dark:text-content-dark">Venta al Mayor</h3>
                </div>

                <div className="grid grid-cols-5 gap-3">
                  <div className="col-span-3">
                    <input list="pkg-units-list" value={form.package_unit} onChange={e => set("package_unit", e.target.value)} placeholder="Agrupación (Ej. Caja)" className="w-full bg-white dark:bg-surface-dark-3 border border-border/60 dark:border-border-dark/60 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-info/30 transition-all outline-none" />
                    <datalist id="pkg-units-list">{PKG_UNITS.map(u => <option key={u} value={u} />)}</datalist>
                  </div>
                  <div className="col-span-2 relative">
                    <input value={form.package_size} onChange={e => set("package_size", e.target.value)} type="number" placeholder="Cant." className="w-full bg-white dark:bg-surface-dark-3 border border-border/60 dark:border-border-dark/60 rounded-xl pl-3 pr-8 py-2.5 text-sm focus:ring-2 focus:ring-info/30 transition-all outline-none" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-content-subtle font-bold uppercase">uds</span>
                  </div>
                </div>
              </div>

              {/* Alerta Stock (Solo si no es servicio) */}
              {!form.is_service && (
                <div className="bg-surface-1/50 dark:bg-surface-dark-2/50 rounded-2xl border border-border/40 dark:border-border-dark/40 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-6 h-6 rounded-md bg-danger/10 text-danger flex items-center justify-center">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    </div>
                    <h3 className="text-[11px] font-black tracking-widest uppercase text-content dark:text-content-dark">Alarma Mínima Stock</h3>
                  </div>
                  <input value={form.min_stock} onChange={e => set("min_stock", e.target.value)} type="number" step="1" placeholder="Cantidad donde saltará alerta" className="w-full bg-white dark:bg-surface-dark-3 border border-border/60 dark:border-border-dark/60 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-danger/30 transition-all outline-none" />
                </div>
              )}
            </div>
          </div>
        ) : form.is_combo ? (
          /* ── Interfaz de Ingredientes (Combo) ── */
          <div className="bg-surface-1/50 dark:bg-surface-dark-2/50 rounded-2xl border border-border/40 dark:border-border-dark/40 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-md bg-brand-500/10 text-brand-500 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <h3 className="text-[11px] font-black tracking-widest uppercase text-content dark:text-content-dark">Componentes del Producto</h3>
            </div>

            <div className="flex flex-col gap-4">
              {/* Buscador */}
              <div className="relative" ref={ingredientRef}>
                <input
                  value={searchIngredient}
                  onChange={e => { setSearchIngredient(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="🔎 Buscar producto para agregar..."
                  className="w-full bg-white dark:bg-surface-dark-3 border border-border/60 dark:border-border-dark/60 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-brand-500/30 transition-all outline-none shadow-sm"
                />

                {showDropdown && searchIngredient.trim() !== "" && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-surface-dark-1 border border-border/50 dark:border-border-dark/50 rounded-xl shadow-xl max-h-[200px] overflow-y-auto overflow-x-hidden animate-in slide-in-from-top-2">
                    {filteredProducts.length === 0 ? (
                      <div className="p-3 text-xs text-center text-content-muted">No se encontraron productos o ya son un combo</div>
                    ) : (
                      filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addIngredient(p)} className="p-3 hover:bg-surface-2 dark:hover:bg-surface-dark-3 cursor-pointer border-b border-border/30 dark:border-border-dark/30 last:border-0 flex justify-between items-center transition-colors">
                          <span className="text-[13px] font-bold text-content dark:text-content-dark">{p.name}</span>
                          <span className="text-[10px] text-content-muted uppercase tracking-wider">${p.price} / {p.unit}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Lista de ingredientes */}
              {form.combo_items.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-border/60 dark:border-border-dark/60 rounded-xl flex flex-col items-center">
                  <span className="text-2xl mb-2 grayscale opacity-50">🍔</span>
                  <p className="text-[11px] font-bold text-content-muted dark:text-content-dark-muted">Añade los ingredientes que componen este combo.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex text-[9px] font-black tracking-widest uppercase text-content-muted px-2">
                    <div className="flex-1">Producto</div>
                    <div className="w-28 text-center">Cantidad</div>
                    <div className="w-8"></div>
                  </div>
                  {form.combo_items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-white dark:bg-surface-dark-3 p-2 rounded-xl border border-border/40 shadow-sm animate-in fade-in">
                      <div className="flex-1 text-[12px] font-bold text-content dark:text-content-dark truncate px-1" title={item.name}>{item.name}</div>
                      <div className="flex items-center gap-1.5 w-28">
                        <input
                          type="number"
                          step={item.unit === 'unidad' || item.unit === 'uds' ? "1" : "0.001"}
                          min={item.unit === 'unidad' || item.unit === 'uds' ? "1" : "0.001"}
                          value={item.quantity}
                          onChange={e => updateIngredientQty(item.product_id, e.target.value)}
                          className="flex-1 min-w-0 bg-surface-1 dark:bg-surface-dark-3 text-content dark:text-content-dark border border-border/60 dark:border-border-dark/60 rounded-lg px-2 py-1.5 text-center text-xs font-black focus:outline-none focus:ring-2 focus:ring-brand-500/40 transition-all shadow-sm"
                        />
                        <span className="text-[10px] text-content-subtle font-bold uppercase tracking-wider w-8 truncate" title={item.unit || "uds"}>{item.unit || "uds"}</span>
                      </div>
                      <button onClick={() => removeIngredient(item.product_id)} className="w-8 h-8 flex items-center justify-center text-danger hover:bg-danger/10 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                  <div className="text-right mt-2 text-[10px] text-content-subtle font-bold">
                    Total Componentes: {form.combo_items.length}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Footer ── */}
        <div className="flex gap-2.5 justify-end mt-5">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-content-muted dark:text-content-dark-muted hover:bg-surface-2 dark:hover:bg-surface-dark-3 transition-colors border-none bg-transparent">
            Cancelar
          </button>
          <button
            onClick={handleSave} disabled={loading}
            className={`flex items-center gap-2 px-8 py-2.5 rounded-xl text-sm font-black text-white uppercase tracking-widest shadow-lg transition-all ${loading ? "bg-brand-500/50 cursor-not-allowed shadow-none" : "bg-brand-500 hover:bg-brand-600 hover:-translate-y-0.5 shadow-brand-500/30"} border-none`}
          >
            {loading && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
            {isEdit ? "Guardar Cambios" : "✨ Guardar"}
          </button>
        </div>

      </div>
    </Modal>
  );
}
