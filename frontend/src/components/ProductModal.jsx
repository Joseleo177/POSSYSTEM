import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import { api } from "../services/api";
import CustomSelect from "./CustomSelect";
import { calcSalePrice as calcSalePriceHelper } from "../helpers";

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

  const calcSalePrice = calcSalePriceHelper;

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
    <Modal open={open} onClose={onClose} title={isEdit ? "Edición de Producto" : "Nuevo Producto"} width={780}>
      <div className="flex flex-col gap-5">

        {/* ── Sección Principal: Imagen + Datos ── */}
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Imagen Subida Premium */}
          <div className="flex-shrink-0 flex flex-col items-center">
            <label className="block cursor-pointer relative group">
              <div className="w-[140px] h-[140px] rounded-[24px] overflow-hidden bg-surface-2 dark:bg-surface-dark-2 border-2 border-dashed border-border/60 dark:border-white/5 flex items-center justify-center hover:border-brand-500/50 transition-all duration-500 shadow-inner group-hover:shadow-brand-500/10">
                {imagePreview ? (
                  <>
                    <img src={imagePreview} alt="preview" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-brand-900/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center backdrop-blur-sm">
                      <svg className="w-8 h-8 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <span className="text-white text-[9px] font-black tracking-[2px] uppercase">Reemplazar</span>
                    </div>
                  </>
                ) : (
                  <div className="text-center flex flex-col items-center text-content-subtle dark:text-content-dark-muted group-hover:text-brand-500 transition-all duration-300">
                    <div className="w-10 h-10 rounded-full bg-white dark:bg-surface-dark-3 border border-border/40 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                    <div className="text-[9px] font-black uppercase tracking-[2px]">Subir Imagen</div>
                    <div className="text-[8px] mt-1 opacity-50 font-bold tracking-wider">JPG, PNG</div>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            </label>
            {imagePreview && (
              <button
                onClick={(e) => { e.preventDefault(); setImageFile(null); setImagePreview(null); }}
                className="mt-3 text-[9px] font-black text-danger uppercase tracking-[2px] opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1.5"
              >
                <span className="text-xs">×</span> Eliminar
              </button>
            )}
          </div>

          {/* Información Principal */}
          <div className="flex-1 space-y-4">
            <div>
              <label className="label !text-[10px] !tracking-[3px] opacity-60 uppercase mb-1 text-content-subtle dark:text-content-dark-muted">Nombre del Artículo / Referencia</label>
              <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus className="input py-3 !text-bas shadow-sm border border-border/60" placeholder="Ej. Computadora Portátil Gamer X-1..." />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-[2px] text-content-subtle dark:text-content-dark-muted mb-1 block">Categoría Vinculada</label>
                <div className="relative group">
                  <CustomSelect 
                    value={form.category_id} 
                    onChange={val => set("category_id", val)} 
                    options={[{ value: "", label: "Sin Categoría" }, ...categories.map(c => ({ value: String(c.id), label: c.name }))]}
                    placeholder="Sin Categoría"
                    className="w-full"
                  />
                </div>
              </div>
              <div>
                <label className="label !text-[10px] !tracking-[3px] opacity-60 uppercase mb-1">Unidad de Medida</label>
                <div className="relative">
                  <CustomSelect 
                    value={form.unit} 
                    onChange={val => set("unit", val)} 
                    options={UNITS.map(u => ({ value: u, label: u.toUpperCase() }))}
                    placeholder="Unidad de Medida"
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
              <div>
                <label className="label !text-[10px] !tracking-[3px] opacity-60 uppercase mb-1">Precio de Venta Público (PVPR)</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <span className="text-brand-500 font-black tracking-widest">$</span>
                  </div>
                  <input value={form.price} onChange={e => set("price", e.target.value)} type="number" step="0.01" className="input !h-12 !pl-10 !pr-4 !text-xl !font-black !text-brand-500 !bg-brand-500/5 !border-brand-500/20 focus:!ring-brand-500/30 transition-all" placeholder="0.00" />
                </div>
              </div>

              {editData?.id && !form.is_combo && !form.is_service && (
                <div>
                  <label className="label !text-[10px] !tracking-[3px] opacity-60 uppercase mb-1">Stock Global (Acumulado)</label>
                  <div className="h-12 bg-surface-2 dark:bg-surface-dark-3 text-content-subtle border border-border/40 rounded-xl px-4 flex justify-between items-center cursor-not-allowed opacity-80">
                    <span className="text-lg font-black">{form.stock ?? 0} <span className="text-[10px] opacity-40 uppercase tracking-widest">{form.unit}</span></span>
                    <span className="text-[8px] bg-black/10 dark:bg-white/10 px-2 py-1 rounded-lg font-black uppercase tracking-widest">Lectura</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Toggles de Tipo (Servicio / Combo) ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {/* Toggle Servicio */}
            <div className={`p-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-4 ${form.is_service ? "bg-amber-500/10 border-amber-500/30" : "bg-surface-2 dark:bg-white/5 border-border/60 dark:border-white/5"}`}>
              <div>
                <div className="text-[11px] font-black text-content dark:text-content-dark uppercase tracking-[1px]">Registro como Servicio</div>
                <div className="text-[9px] text-content-subtle dark:text-content-dark-muted font-bold mt-0.5 opacity-70">Desactiva el seguimiento de inventario.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer scale-90">
                <input type="checkbox" className="sr-only peer" checked={form.is_service} onChange={e => set("is_service", e.target.checked)} />
                <div className="w-12 h-7 bg-surface-3 dark:bg-white/10 rounded-full border-2 border-transparent transition-all duration-300 peer-checked:bg-amber-500 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 shadow-inner"></div>
              </label>
            </div>

            {/* Toggle Combo */}
            {!form.is_service && (
              <div className={`p-4 py-3 rounded-2xl border transition-all flex items-center justify-between gap-4 ${form.is_combo ? "bg-brand-500/10 border-brand-500/30" : "bg-surface-2 dark:bg-white/5 border-border/60 dark:border-white/5"}`}>
                <div>
                  <div className="text-[11px] font-black text-content dark:text-content-dark uppercase tracking-[1px]">Producto Compuesto</div>
                  <div className="text-[9px] text-content-subtle dark:text-content-dark-muted font-bold mt-0.5 opacity-70">Combina stock de ingredientes.</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer scale-90">
                  <input type="checkbox" className="sr-only peer" checked={form.is_combo} onChange={e => set("is_combo", e.target.checked)} disabled={isEdit && form.combo_items.length > 0} />
                  <div className="w-12 h-7 bg-surface-3 dark:bg-white/10 rounded-full border-2 border-transparent transition-all duration-300 peer-checked:bg-brand-500 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 shadow-inner"></div>
                </label>
              </div>
            )}
        </div>

        {/* ── Si NO es combo y NO es servicio: Mostrar Costos. Si es Combo: Mostrar Componentes ── */}
        {!form.is_combo && !form.is_service ? (
          <div className="space-y-4 animate-in fade-in duration-500">
            {/* ── Rentabilidad ── */}
            <div className="bg-surface-2 dark:bg-white/5 rounded-3xl p-5 border border-border/40 dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-green-500/10 text-green-500 flex items-center justify-center text-lg shadow-sm border border-white/20"></div>
                <h3 className="text-sm font-black tracking-[2px] uppercase text-content dark:text-heading-dark font-display">Modelo de Negocio y Rentabilidad</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="label !text-[9px] !tracking-[2px] opacity-60 uppercase">Costo Unitario</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle font-black">$</span>
                      <input value={form.cost_price} onChange={e => handleCostOrMarginChange("cost_price", e.target.value)} type="number" step="0.01" className="input !h-10 !pl-6 shrink-0 !rounded-xl !text-sm !font-black !bg-white dark:!bg-surface-dark-3" placeholder="0.00" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="label !text-[9px] !tracking-[2px] opacity-60 uppercase">Margen (%)</label>
                    <div className="relative">
                      <input value={form.profit_margin} onChange={e => handleCostOrMarginChange("profit_margin", e.target.value)} type="number" step="0.1" className="input !h-10 shrink-0 !pr-6 !rounded-xl !text-sm !font-black !bg-white dark:!bg-surface-dark-3 text-center" placeholder="0" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle font-black">%</span>
                    </div>
                  </div>
                </div>

                <div 
                  className={`flex-1 flex flex-col justify-center p-3 px-5 rounded-2xl border-2 border-dashed transition-all group ${suggestedPrice ? "bg-green-500/5 border-green-500/30 hover:bg-green-500/10 cursor-pointer shadow-sm active:scale-98" : "bg-surface-1 dark:bg-white/5 border-border/40 opacity-50"}`}
                  title={suggestedPrice ? "Haz clic para aplicar este precio automáticamente" : ""}
                  onClick={() => { if (suggestedPrice) set("price", suggestedPrice); }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-black uppercase tracking-[2px] text-green-600 dark:text-green-400">PVP Sugerido</span>
                    {suggestedPrice && <span className="bg-green-500 text-white text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-all">Aplicar</span>}
                  </div>
                  <div className="text-2xl font-black text-green-600 dark:text-green-400 font-display tabular-nums tracking-tighter">
                    {suggestedPrice ? `$${suggestedPrice}` : "—"}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Configuración Avanzada ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-surface-2 dark:bg-white/5 rounded-3xl p-5 border border-border/40 dark:border-white/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center shadow-sm border border-white/20">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  </div>
                  <h3 className="text-[10px] font-black tracking-[2px] uppercase text-content-subtle dark:text-content-dark-muted font-display">Unidades de Embalaje</h3>
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <input list="pkg-units-list" value={form.package_unit} onChange={e => set("package_unit", e.target.value)} placeholder="Ej. Caja, Bulto..." className="input !h-10 !rounded-xl !text-sm !font-bold dark:text-white" />
                    <datalist id="pkg-units-list">{PKG_UNITS.map(u => <option key={u} value={u} />)}</datalist>
                  </div>
                  <div className="w-24 relative">
                    <input value={form.package_size} onChange={e => set("package_size", e.target.value)} type="number" placeholder="Cant." className="input !h-10 !rounded-xl !text-sm !font-black text-center dark:text-white" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-content-subtle dark:text-content-dark-muted font-black opacity-30 uppercase">uds</span>
                  </div>
                </div>
              </div>

              <div className="bg-surface-2 dark:bg-white/5 rounded-3xl p-5 border border-border/40 dark:border-white/5 border-dashed border-2 border-danger/10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-xl bg-danger/10 text-danger flex items-center justify-center shadow-sm border border-white/20">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                  </div>
                  <h3 className="text-[10px] font-black tracking-[2px] uppercase text-content-subtle dark:text-content-dark-muted font-display">Alerta de Reposición</h3>
                </div>
                <div className="relative">
                  <input value={form.min_stock} onChange={e => set("min_stock", e.target.value)} type="number" className="input !h-10 !rounded-xl !text-sm !font-black !border-danger/20 focus:!ring-danger/20 dark:text-white" placeholder="Min. para notificar..." />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-danger/40 dark:text-danger/60 font-black uppercase tracking-widest">Registros</span>
                </div>
              </div>
            </div>
          </div>
        ) : form.is_combo ? (
          /* ── Interfaz de Ingredientes (Combo Premium) ── */
          <div className="bg-surface-2 dark:bg-white/5 rounded-[40px] p-8 border border-brand-500/20 shadow-sm animate-in slide-in-from-bottom-6 duration-500">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[20px] bg-brand-500 text-white flex items-center justify-center shadow-lg shadow-brand-500/30 font-bold">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-black tracking-[3px] uppercase text-content dark:text-white font-display">Fórmula del Producto Compuesto</h3>
                  <div className="text-[10px] text-content-subtle dark:text-content-dark-muted font-bold uppercase tracking-widest mt-1 opacity-60">Define los componentes que se descontarán automáticamente</div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {/* Buscador de Ingredientes */}
              <div className="relative" ref={ingredientRef}>
                <input
                  value={searchIngredient}
                  onChange={e => { setSearchIngredient(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar componentes por nombre o código..."
                  className="input !h-14 !pl-14 !pr-6 !rounded-2xl border-brand-500/30 focus:border-brand-500 dark:text-white"
                />
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-brand-500/50">
                   <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                </div>

                {showDropdown && searchIngredient.trim() !== "" && (
                  <div className="absolute z-50 w-full mt-3 bg-white dark:bg-surface-dark-2 border border-border dark:border-white/5 rounded-[32px] shadow-2xl p-2 max-h-[280px] overflow-y-auto animate-in zoom-in-95 backdrop-blur-xl">
                    {filteredProducts.length === 0 ? (
                      <div className="p-10 text-center flex flex-col items-center gap-2">
                        <span className="text-3xl opacity-20 text-brand-500">
                          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </span>
                        <div className="text-[11px] font-black uppercase tracking-[2px] text-content-subtle">Sin Coincidencias</div>
                      </div>
                    ) : (
                      filteredProducts.map(p => (
                        <div key={p.id} onClick={() => addIngredient(p)} className="p-4 hover:bg-brand-500/10 rounded-[20px] cursor-pointer flex justify-between items-center transition-all group active:scale-98">
                          <div className="flex flex-col">
                            <span className="text-sm font-black text-content dark:text-content-dark group-hover:text-brand-500 transition-colors">{p.name}</span>
                            <span className="text-[10px] text-content-subtle dark:text-content-dark-muted font-black uppercase tracking-widest mt-0.5 opacity-60">{p.category_name || "General"}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-black text-brand-500 opacity-60">${p.price}</span>
                            <span className="w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center font-bold shadow-md shadow-brand-500/20 group-hover:scale-110 transition-transform">+</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Lista de ingredientes Premium */}
              {form.combo_items.length === 0 ? (
                <div className="py-16 border-2 border-dashed border-border/40 dark:border-white/5 rounded-[40px] flex flex-col items-center justify-center text-center bg-surface-1 dark:bg-white/2">
                  <div className="w-20 h-20 rounded-full bg-surface-2 dark:bg-white/5 flex items-center justify-center mb-4 text-brand-500 opacity-20">
                    <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>
                  </div>
                  <h4 className="text-[11px] font-black uppercase tracking-[3px] text-content-subtle dark:text-content-dark-muted">Receta Vacía</h4>
                  <p className="text-[10px] text-content-subtle/60 dark:text-content-dark-muted/40 font-bold mt-1 uppercase tracking-wider">Comienza agregando componentes arriba</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex px-8 text-[10px] font-black tracking-[3px] uppercase text-content-subtle/50 mb-2">
                    <div className="flex-1">Componente / Ingrediente</div>
                    <div className="w-32 text-center">Dosificación</div>
                    <div className="w-12"></div>
                  </div>
                  {form.combo_items.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-6 bg-white dark:bg-surface-dark-3 p-4 px-8 rounded-[24px] border border-border/40 dark:border-white/5 shadow-sm transition-all hover:shadow-md animate-in slide-in-from-right-4 duration-400" style={{ animationDelay: `${idx * 50}ms` }}>
                      <div className="flex-1 flex flex-col">
                        <span className="text-sm font-black text-content dark:text-content-dark truncate uppercase tracking-tight" title={item.name}>{item.name}</span>
                        <span className="text-[9px] font-black text-content-subtle uppercase tracking-widest opacity-60">ID #00{item.product_id}</span>
                      </div>
                      <div className="flex items-center gap-3 w-40">
                        <div className="w-32 relative">
                          <input 
                            value={item.quantity} 
                            onChange={e => updateIngredientQty(item.product_id, e.target.value)} 
                            type="number" 
                            step={item.unit === 'unidad' || item.unit === 'uds' ? "1" : "0.001"}
                            className="input !h-12 !rounded-2xl !text-sm !font-black text-center bg-surface-2 dark:bg-surface-dark-2 dark:text-white border-2 border-brand-500/20 focus:border-brand-500" 
                          />
                        </div>
                        <span className="text-[10px] text-content-subtle/60 font-black uppercase tracking-widest w-12 truncate">{item.unit || "uds"}</span>
                      </div>
                      <button onClick={() => removeIngredient(item.product_id)} className="w-10 h-10 flex items-center justify-center text-danger/40 hover:text-danger hover:bg-danger/10 rounded-xl transition-all active:scale-90">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    </div>
                  ))}
                  <div className="pt-6 flex justify-end">
                    <div className="bg-brand-500/10 px-8 py-3 rounded-2xl border border-brand-500/20">
                      <span className="text-[10px] font-black text-brand-600 dark:text-brand-400 uppercase tracking-[3px]">Total Componentes: {form.combo_items.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* ── Footer de Acción ── */}
        <div className="flex gap-4 justify-end mt-4 pt-4 border-t border-border/40">
          <button onClick={onClose} className="px-6 py-2.5 text-xs font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-[2px] hover:bg-surface-2 dark:hover:bg-white/5 rounded-xl transition-all border-none bg-transparent active:scale-95">
            Cancelar Operación
          </button>
          <button
            onClick={handleSave} disabled={loading}
            className={`flex items-center justify-center gap-3 px-8 py-2.5 rounded-xl text-xs font-black text-white uppercase tracking-[2px] shadow-lg transition-all h-12 min-w-[200px] ${loading ? "bg-surface-3 cursor-not-allowed shadow-none" : "bg-brand-500 hover:bg-brand-600 hover:shadow-brand-500/30 active:scale-95"} border-none`}
          >
            {loading ? (
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            ) : (
              isEdit ? "Guardar Cambios" : "Registrar Producto"
            )}
          </button>
        </div>

      </div>
    </Modal>
  );
}
