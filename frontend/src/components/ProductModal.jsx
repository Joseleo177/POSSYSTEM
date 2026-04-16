import { useState, useEffect, useRef } from "react";
import Modal from "./ui/Modal";
import { Button } from "./ui/Button";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import CustomSelect from "./ui/CustomSelect";
import { calcSalePrice as calcSalePriceHelper } from "../helpers";
import { resolveImageUrl } from "../helpers";

const UNITS = ["UNIDAD", "KG", "LITRO", "METRO"];
const PKG_UNITS = ["CAJA", "BULTO", "PAQUETE", "DOCENA", "MEDIA CAJA", "FARDO", "SACO"];
const EMPTY = {
    name: "", price: "", stock: "", category_id: "", unit: "UNIDAD", qty_step: "1",
    package_unit: "", package_size: "", cost_price: "", profit_margin: "", min_stock: "0",
    is_combo: false, combo_items: [], is_service: false, barcode: ""
};

export default function ProductModal({ open, onClose, onSave, editData, categories, loading }) {
    const { notify } = useApp();
    const [form, setForm] = useState(EMPTY);
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [removeImage, setRemoveImage] = useState(false);

    // Combo states
    const [searchIngredient, setSearchIngredient] = useState("");
    const [ingredientResults, setIngredientResults] = useState([]);
    const [loadingIngredients, setLoadingIngredients] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const ingredientRef = useRef(null);
    const ingredientTimer = useRef(null);

    // Búsqueda debounced de ingredientes (server-side, no carga todo el catálogo)
    useEffect(() => {
        if (!form.is_combo || !searchIngredient.trim()) {
            setIngredientResults([]);
            return;
        }
        clearTimeout(ingredientTimer.current);
        ingredientTimer.current = setTimeout(async () => {
            setLoadingIngredients(true);
            try {
                const r = await api.products.getAll({ search: searchIngredient, is_combo: false, limit: 10 });
                setIngredientResults(r.data.filter(p => p.id !== editData?.id));
            } catch {}
            finally { setLoadingIngredients(false); }
        }, 250);
        return () => clearTimeout(ingredientTimer.current);
    }, [searchIngredient, form.is_combo, editData?.id]);

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
                    barcode: editData.barcode || "",
                    combo_items: editData.comboItems ? editData.comboItems.map(c => ({
                        product_id: c.ingredient.id,
                        name: c.ingredient.name,
                        unit: c.ingredient.unit || "uds",
                        quantity: c.quantity
                    })) : []
                });
                setImagePreview(resolveImageUrl(editData.image_url) || null);
            } else {
                setForm(EMPTY);
                setImagePreview(null);
            }
            setImageFile(null);
            setRemoveImage(false);
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

        // Validar tamaño: 1MB máximo
        if (f.size > 1024 * 1024) {
            e.target.value = ""; // Limpiar input
            return notify("La imagen seleccionada es muy pesada (máximo 1MB)", "err");
        }

        setImageFile(f);
        setImagePreview(URL.createObjectURL(f));
    };

    const handleSave = () => onSave(form, imageFile, removeImage);

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
        const val = parseFloat(q);
        if (val < 0) return; // Evitar negativos
        setForm({ ...form, combo_items: form.combo_items.map(i => i.product_id === id ? { ...i, quantity: q } : i) });
    };

    // Click outside listener para el dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (ingredientRef.current && !ingredientRef.current.contains(event.target)) setShowDropdown(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredProducts = ingredientResults;

    return (
        <Modal open={open} onClose={onClose} title={isEdit ? "Edición de Producto" : "Nuevo Producto"} width={720}>
            <div className="flex flex-col gap-3">

                {/* ── Sección Principal: Imagen + Datos ── */}
                <div className="flex flex-col lg:flex-row gap-4">
                    {/* Imagen Subida */}
                    <div className="flex-shrink-0 flex flex-col items-center">
                        <label className="block cursor-pointer relative group">
                            <div className="w-[100px] h-[100px] rounded-xl overflow-hidden bg-surface-2 dark:bg-surface-dark-2 border border-dashed border-border/60 dark:border-white/10 flex items-center justify-center hover:border-brand-500/50 transition-all shadow-sm">
                                {imagePreview ? (
                                    <>
                                        <img src={imagePreview} alt="preview" className="w-full h-full object-cover group-hover:opacity-60 transition-opacity" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center">
                                            <svg className="w-6 h-6 text-white mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center flex flex-col items-center text-content-subtle dark:text-content-dark-muted group-hover:text-brand-500 transition-colors">
                                        <svg className="w-6 h-6 mb-1 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        <div className="text-[10px] font-bold uppercase tracking-wide">Imagen</div>
                                    </div>
                                )}
                            </div>
                            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                        </label>
                        {imagePreview && (
                            <button
                                onClick={(e) => { e.preventDefault(); setImageFile(null); setImagePreview(null); setRemoveImage(true); }}
                                className="mt-3 text-[11px] font-black text-danger uppercase tracking-wide opacity-60 hover:opacity-100 transition-opacity flex items-center gap-1.5"
                            >
                                <span className="text-xs">×</span> Eliminar
                            </button>
                        )}
                    </div>

                    {/* Información Principal */}
                    {/* Información Principal */}
                    <div className="flex-1 space-y-3">
                        {/* Fila 1 */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="col-span-12 md:col-span-8">
                                <label className="label">Nombre del Artículo / Referencia</label>
                                <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus className="input " placeholder="Ej. Computadora Portátil Gamer X-1..." />
                            </div>
                            <div className="col-span-12 md:col-span-4">
                                <label className="label">Categoría</label>
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
                        </div>

                        {/* Fila 2 */}
                        <div className={`grid grid-cols-1 gap-3 items-end ${editData?.id && !form.is_combo && !form.is_service ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
                            <div>
                                <label className="label">Unidad de Medida</label>
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
                            <div>
                                <label className="label">Código de Barras</label>
                                <input value={form.barcode} onChange={e => set("barcode", e.target.value)} className="input" placeholder="Ej. 123456789012" />
                            </div>
                            <div>
                                <label className="label">Precio de Venta</label>
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <span className="text-content-subtle font-bold">$</span>
                                    </div>
                                    <input value={form.price} onChange={e => set("price", e.target.value)} type="number" step="0.01" className="input !pl-8" placeholder="0.00" />
                                </div>
                            </div>
                            {editData?.id && !form.is_combo && !form.is_service && (
                                <div>
                                    <label className="label">Stock Actual</label>
                                    <div className="bg-surface-2 dark:bg-surface-dark-3 text-content-subtle border border-border/40 rounded-lg px-3 flex justify-between items-center cursor-not-allowed opacity-80 h-10">
                                        <span className="text-sm font-bold">{form.stock ?? 0} <span className="text-[10px] uppercase opacity-60 ml-1">{form.unit}</span></span>
                                        <span className="text-[10px] bg-black/10 dark:bg-white/10 px-2 py-0.5 rounded uppercase font-bold tracking-wide">Lectura</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Toggles de Tipo (Servicio / Combo) ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                    {/* Toggle Servicio */}
                    <div className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 ${form.is_service ? "bg-brand-50/50 border-brand-200 dark:bg-brand-500/10 dark:border-brand-500/20" : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/5"}`}>
                        <div>
                            <div className="text-xs font-bold text-content dark:text-content-dark">Servicio</div>
                            <div className="text-[10px] text-content-subtle dark:text-content-dark-muted mt-0.5">No afecta inventario.</div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={form.is_service} onChange={e => set("is_service", e.target.checked)} />
                            <div className="w-9 h-5 bg-border/50 peer-focus:outline-none dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
                        </label>
                    </div>

                    {/* Toggle Combo */}
                    {!form.is_service && (
                        <div className={`p-3 rounded-lg border transition-all flex items-center justify-between gap-3 ${form.is_combo ? "bg-brand-50/50 border-brand-200 dark:bg-brand-500/10 dark:border-brand-500/20" : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/5"}`}>
                            <div>
                                <div className="text-xs font-bold text-content dark:text-content-dark">Producto Compuesto</div>
                                <div className="text-[10px] text-content-subtle dark:text-content-dark-muted mt-0.5">Compuesto por otros ítems.</div>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={form.is_combo} onChange={e => set("is_combo", e.target.checked)} disabled={isEdit && form.combo_items.length > 0} />
                                <div className="w-9 h-5 bg-border/50 peer-focus:outline-none dark:bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-500"></div>
                            </label>
                        </div>
                    )}
                </div>

                {/* ── Si NO es combo y NO es servicio: Mostrar Costos. Si es Combo: Mostrar Componentes ── */}
                {!form.is_combo && !form.is_service ? (
                    <div className="space-y-3 animate-in fade-in duration-300">
                        {/* ── Rentabilidad ── */}
                        <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-xl p-4 border border-border/40 dark:border-white/5">
                            <h3 className="text-xs font-bold uppercase text-content-subtle dark:text-content-dark-muted mb-3">Costos y Rentabilidad</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="label">Costo Unitario</label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-bold">$</span>
                                            <input value={form.cost_price} onChange={e => handleCostOrMarginChange("cost_price", e.target.value)} type="number" step="0.01" className="input !pl-6" placeholder="0.00" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="label">Margen (%)</label>
                                        <div className="relative">
                                            <input value={form.profit_margin} onChange={e => handleCostOrMarginChange("profit_margin", e.target.value)} type="number" step="0.1" className="input pr-6" placeholder="0" />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-bold">%</span>
                                        </div>
                                    </div>
                                </div>
                                <div
                                    className={`flex flex-col justify-center p-3 px-4 rounded-lg border transition-all cursor-pointer ${suggestedPrice ? "bg-green-500/5 border-green-500/20 hover:bg-green-500/10" : "bg-surface-2 dark:bg-white/5 border-border/40 opacity-60"}`}
                                    onClick={() => { if (suggestedPrice) set("price", suggestedPrice); }}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">PVP Sugerido</span>
                                        {suggestedPrice && <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded font-bold uppercase transition-all">Aplicar</span>}
                                    </div>
                                    <div className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
                                        {suggestedPrice ? `$${suggestedPrice}` : "—"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Configuración Avanzada ── */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-xl p-4 border border-border/40 dark:border-white/5">
                                <h3 className="text-xs font-bold uppercase text-content-subtle dark:text-content-dark-muted mb-3">Unidades de Embalaje</h3>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <input list="pkg-units-list" value={form.package_unit} onChange={e => set("package_unit", e.target.value)} placeholder="Ej. Caja, Bulto..." className="input" />
                                        <datalist id="pkg-units-list">{PKG_UNITS.map(u => <option key={u} value={u} />)}</datalist>
                                    </div>
                                    <div className="w-24 relative">
                                        <input value={form.package_size} onChange={e => set("package_size", e.target.value)} type="number" placeholder="Cant." className="input text-center" />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-content-subtle font-bold uppercase">uds</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-xl p-4 border border-border/40 dark:border-white/5">
                                <h3 className="text-xs font-bold uppercase text-content-subtle dark:text-content-dark-muted mb-3">Alerta de Reposición</h3>
                                <div className="relative">
                                    <input value={form.min_stock} onChange={e => set("min_stock", e.target.value)} type="number" className="input" placeholder="Min. para notificar..." />
                                </div>
                            </div>
                        </div>
                    </div>
                ) : form.is_combo ? (
                    /* ── Interfaz de Ingredientes (Combo) ── */
                    <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-xl p-4 border border-border/40 dark:border-white/5 animate-in slide-in-from-bottom-2 duration-300">
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-content dark:text-white">Fórmula del Producto</h3>
                            <div className="text-xs text-content-subtle mt-0.5">Selecciona los componentes que lo integran</div>
                        </div>

                        <div className="space-y-4">
                            {/* Buscador de Ingredientes */}
                            <div className="relative" ref={ingredientRef}>
                                <input
                                    value={searchIngredient}
                                    onChange={e => { setSearchIngredient(e.target.value); setShowDropdown(true); }}
                                    onFocus={() => setShowDropdown(true)}
                                    placeholder="Buscar componente..."
                                    className="input pl-10"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                </div>

                                {showDropdown && searchIngredient.trim() !== "" && (
                                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-surface-dark-2 border border-border dark:border-white/10 rounded-lg shadow-lg p-1 max-h-[200px] overflow-y-auto">
                                        {loadingIngredients ? (
                                            <div className="p-4 text-center text-xs text-content-subtle">Buscando...</div>
                                        ) : filteredProducts.length === 0 ? (
                                            <div className="p-4 text-center text-xs text-content-subtle">Sin resultados</div>
                                        ) : (
                                            filteredProducts.map(p => (
                                                <div key={p.id} onClick={() => addIngredient(p)} className="p-2 hover:bg-surface-2 dark:hover:bg-white/5 rounded-lg cursor-pointer flex justify-between items-center transition-colors">
                                                    <div>
                                                        <div className="text-sm font-medium">{p.name}</div>
                                                        <div className="text-[10px] text-content-subtle">{p.category_name || "General"}</div>
                                                    </div>
                                                    <span className="text-xs font-medium text-brand-500">${p.price}</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Lista de ingredientes */}
                            {form.combo_items.length === 0 ? (
                                <div className="py-8 border border-dashed border-border/40 dark:border-white/10 rounded-xl text-center">
                                    <div className="text-xs text-content-subtle">No hay componentes añadidos</div>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex px-3 text-[10px] font-bold text-content-subtle uppercase mb-1">
                                        <div className="flex-1">Componente</div>
                                        <div className="w-24 text-center">Cant.</div>
                                        <div className="w-8"></div>
                                    </div>
                                    {form.combo_items.map((item, idx) => (
                                        <div key={idx} className="flex items-center gap-3 bg-surface-2 dark:bg-surface-dark-3 p-2 px-3 rounded-lg border border-border/40 dark:border-white/5">
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{item.name}</div>
                                            </div>
                                            <div className="flex items-center gap-2 w-24">
                                                <input
                                                    value={item.quantity}
                                                    onChange={e => updateIngredientQty(item.product_id, e.target.value)}
                                                    type="number"
                                                    step={item.unit === 'unidad' || item.unit === 'uds' ? "1" : "0.001"}
                                                    className="input !h-8 text-center text-sm"
                                                />
                                            </div>
                                            <button onClick={() => removeIngredient(item.product_id)} className="w-8 h-8 flex items-center justify-center text-content-muted hover:text-danger hover:bg-danger/10 rounded-md transition-colors">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex justify-end pt-2">
                                        <span className="text-xs font-medium text-content-subtle">Total unidades: {form.combo_items.length}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}

                {/* ── Footer de Acción ── */}
                <div className="flex gap-3 justify-end mt-3 pt-3 border-t border-border/40 dark:border-border-dark/40">
                    <Button onClick={onClose} variant="ghost" className="border border-border/40 dark:border-white/10 min-w-[100px]">
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSave} disabled={loading}
                        variant="primary"
                        className="min-w-[160px]"
                    >
                        {loading ? (
                            <svg className="animate-spin h-4 w-4 text-black" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        ) : (
                            isEdit ? "Guardar Cambios" : "Registrar Producto"
                        )}
                    </Button>
                </div>

            </div>
        </Modal>
    );
}
