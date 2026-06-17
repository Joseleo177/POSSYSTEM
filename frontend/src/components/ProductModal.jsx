import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { Button } from "./ui/Button";
import { useApp } from "../context/AppContext";
import CustomSelect from "./ui/CustomSelect";
import { calcSalePrice as calcSalePriceHelper, resolveImageUrl } from "../helpers";
import ComboItemsEditor from "./ComboItemsEditor";

const UNITS = ["UNIDAD", "KG", "LITRO", "METRO"];
const PKG_UNITS = ["CAJA", "BULTO", "PAQUETE", "DOCENA", "MEDIA CAJA", "FARDO", "SACO"];
const EMPTY = {
    name: "", price: "", stock: "", category_id: "", unit: "UNIDAD", qty_step: "1",
    package_unit: "", package_size: "", cost_price: "", profit_margin: "", min_stock: "0",
    is_combo: false, combo_items: [], is_service: false, barcode: "", bulk_price: ""
};

export default function ProductModal({ open, onClose, onSave, editData, categories, loading, warehouseId, warehouseName }) {
    const { notify, activeCurrencies } = useApp();
    const localCurrency = activeCurrencies.find(c => !c.is_base) ?? null;
    const exchangeRate = parseFloat(localCurrency?.exchange_rate || 0);

    const [form, setForm] = useState(EMPTY);
    const [priceInBs, setPriceInBs] = useState("");
    const [priceCurrency, setPriceCurrency] = useState("base");
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [removeImage, setRemoveImage] = useState(false);


    useEffect(() => {
        if (open) {
            if (editData) {
                let initialBulkPrice = editData.bulk_price || "";
                if (!initialBulkPrice && editData.cost_price && editData.package_size) {
                    initialBulkPrice = (parseFloat(editData.cost_price) * parseFloat(editData.package_size)).toFixed(2);
                }

                setForm({
                    name: editData.name,
                    price: editData.price,
                    stock: editData.stock,
                    category_id: editData.category_id || "",
                    unit: editData.unit || "unidad",
                    qty_step: editData.qty_step || "1",
                    package_unit: editData.package_unit ? editData.package_unit.toUpperCase() : "",
                    package_size: editData.package_size != null && editData.package_size !== "" ? parseFloat(editData.package_size) : "",
                    bulk_price: initialBulkPrice,
                    cost_price: editData.cost_price || "",
                    profit_margin: editData.profit_margin || "",
                    min_stock: editData.min_stock != null ? parseFloat(editData.min_stock) : 0,
                    is_combo: editData.is_combo || false,
                    is_service: editData.is_service || false,
                    barcode: editData.barcode || "",
                    combo_items: editData.comboItems ? editData.comboItems.map(c => ({
                        product_id: c.ingredient.id,
                        name: c.ingredient.name,
                        unit: c.ingredient.unit || "uds",
                        quantity: parseFloat(c.quantity),
                        price: parseFloat(c.ingredient.price || 0),
                        cost_price: parseFloat(c.ingredient.cost_price || 0)
                    })) : []
                });
                setImagePreview(resolveImageUrl(editData.image_url) || null);
            } else {
                setForm(EMPTY);
                setImagePreview(null);
            }
            setImageFile(null);
            setRemoveImage(false);
            setPriceCurrency("base");
            if (editData && exchangeRate > 0) {
                setPriceInBs((parseFloat(editData.price) * exchangeRate).toFixed(2));
            } else {
                setPriceInBs("");
            }

        }
    }, [open, editData]);

    const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

    const handleCostOrMarginChange = (key, val) => {
        const next = { ...form, [key]: val };
        
        if (key === "cost_price" && next.package_size) {
            const size = parseFloat(next.package_size);
            if (size > 0 && val !== "") {
                next.bulk_price = (parseFloat(val) * size).toFixed(2);
            } else if (val === "") {
                next.bulk_price = "";
            }
        }

        const suggested = calcSalePriceHelper(
            key === "cost_price" ? val : next.cost_price,
            key === "profit_margin" ? val : next.profit_margin
        );
        if (suggested !== null) {
            next.price = suggested;
            if (exchangeRate > 0) {
                setPriceInBs((parseFloat(suggested) * exchangeRate).toFixed(2));
            } else {
                setPriceInBs("");
            }
        }
        setForm(next);
    };

    const handlePriceChange = (val) => {
        set("price", val);
        if (exchangeRate > 0 && val) {
            setPriceInBs((parseFloat(val) * exchangeRate).toFixed(2));
        } else {
            setPriceInBs("");
        }
    };

    const handlePriceInBsChange = (val) => {
        setPriceInBs(val);
        if (exchangeRate > 0 && val) {
            set("price", (parseFloat(val) / exchangeRate).toFixed(5));
        } else {
            set("price", "");
        }
    };

    const handleBulkPriceChange = (val) => {
        const size = parseFloat(form.package_size);
        const updates = { bulk_price: val };

        if (val && size > 0) {
            const unitCost = (parseFloat(val) / size).toFixed(4);
            updates.cost_price = unitCost;
            
            const suggested = calcSalePriceHelper(unitCost, form.profit_margin);
            if (suggested !== null) {
                updates.price = suggested;
                if (exchangeRate > 0) {
                    setPriceInBs((parseFloat(suggested) * exchangeRate).toFixed(2));
                } else {
                    setPriceInBs("");
                }
            }
        }
        setForm(prev => ({ ...prev, ...updates }));
    };

    const handlePackageSizeChange = (val) => {
        const next = { ...form, package_size: val };
        if (next.cost_price && val) {
            const size = parseFloat(val);
            if (size > 0) {
                next.bulk_price = (parseFloat(next.cost_price) * size).toFixed(2);
            }
        } else if (!val) {
            next.bulk_price = "";
        }
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

    const handleSave = () => {
        if (parseFloat(form.price) <= 0 || form.price === "") return notify("El precio de venta debe ser mayor a 0", "err");
        if (form.cost_price !== "" && parseFloat(form.cost_price) < 0) return notify("El costo unitario no puede ser negativo", "err");
        const submissionForm = { ...form };
        if (!isEdit && warehouseId) {
            submissionForm.warehouse_id = warehouseId;
        }
        onSave(submissionForm, imageFile, removeImage);
    };

    const isEdit = !!editData;

    const suggestedPrice = calcSalePriceHelper(form.cost_price, form.profit_margin);

    const handleComboItemsChange = (items) => {
        const sumCost = items.reduce((acc, item) => {
            const qty = parseFloat(item.quantity) || 0;
            const c = parseFloat(item.cost_price) || 0;
            return acc + (c * qty);
        }, 0);
        
        const updates = { combo_items: items };
        if (sumCost > 0 || items.length === 0) {
            updates.cost_price = sumCost.toFixed(4);
        }
        
        setForm(prev => {
            const next = { ...prev, ...updates };
            if (next.profit_margin && next.cost_price !== "") {
                 const suggested = calcSalePriceHelper(next.cost_price, next.profit_margin);
                 if (suggested !== null) {
                     next.price = suggested;
                     setTimeout(() => {
                         if (exchangeRate > 0) {
                             setPriceInBs((parseFloat(suggested) * exchangeRate).toFixed(2));
                         } else {
                             setPriceInBs("");
                         }
                     }, 0);
                 }
            }
            return next;
        });
    };

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
                                <label className="label flex items-center justify-between">
                                    Precio de Venta
                                    {localCurrency && (
                                        <div className="flex text-[9px] font-black rounded overflow-hidden border border-border/30 dark:border-white/10">
                                            <button type="button" onClick={() => setPriceCurrency("base")}
                                                className={`px-2 py-0.5 transition-colors ${priceCurrency === "base" ? "bg-brand-500 text-black" : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content"}`}>
                                                $
                                            </button>
                                            <button type="button" onClick={() => setPriceCurrency("local")}
                                                className={`px-2 py-0.5 transition-colors ${priceCurrency === "local" ? "bg-brand-500 text-black" : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content"}`}>
                                                {localCurrency.symbol || "Bs."}
                                            </button>
                                        </div>
                                    )}
                                </label>
                                {priceCurrency === "base" || !localCurrency ? (
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle font-bold text-xs">$</span>
                                        <input value={form.price} onChange={e => handlePriceChange(e.target.value.replace(/[^0-9.]/g, ""))} type="text" inputMode="decimal" className="input !pl-7" placeholder="0.00000" />
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-[11px] font-bold">{localCurrency.symbol || "Bs."}</span>
                                        <input value={priceInBs} onChange={e => handlePriceInBsChange(e.target.value)} type="number" step="0.01" min="0" className="input !pl-9" placeholder="0.00" />
                                    </div>
                                )}
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

                {/* ── Componentes de Combo ── */}
                {form.is_combo && (
                    <ComboItemsEditor
                        comboItems={form.combo_items}
                        onChange={handleComboItemsChange}
                        excludeId={editData?.id}
                        warehouseId={warehouseId}
                    />
                )}

                {/* ── Si NO es servicio: Mostrar Costos y Rentabilidad ── */}
                {!form.is_service && (
                    <div className="space-y-3 animate-in fade-in duration-300 mt-2">
                        {/* ── Rentabilidad ── */}
                        <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-xl p-4 border border-border/40 dark:border-white/5">
                            <h3 className="text-xs font-bold uppercase text-content-subtle dark:text-content-dark-muted mb-3">Costos y Rentabilidad</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="label">Costo Unitario</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-bold">$</span>
                                                <input value={form.cost_price} onChange={e => handleCostOrMarginChange("cost_price", e.target.value)} type="number" step="0.0001" min="0" className={`input !pl-6 ${form.is_combo ? "bg-surface-2 dark:bg-white/5" : ""}`} placeholder="0.0000" readOnly={form.is_combo} />
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

                                    {/* Precio por bulto */}
                                    {form.package_unit && form.package_size ? (
                                        <div>
                                            <label className="label">
                                                Precio por {form.package_unit}
                                                <span className="ml-1 text-content-subtle opacity-60 normal-case font-normal">({form.package_size} uds)</span>
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <div className="relative flex-1">
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-bold">$</span>
                                                    <input
                                                        value={form.bulk_price}
                                                        onChange={e => handleBulkPriceChange(e.target.value)}
                                                        type="number" step="0.01" min="0"
                                                        className="input !pl-6"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                {form.bulk_price && parseFloat(form.package_size) > 0 && (
                                                    <span className="text-[11px] text-brand-500 font-bold whitespace-nowrap">
                                                        = $ {(parseFloat(form.bulk_price) / parseFloat(form.package_size)).toFixed(4)} c/u
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                <div
                                    className={`flex flex-col justify-center p-3 px-4 rounded-lg border transition-all cursor-pointer ${suggestedPrice ? "bg-green-500/5 border-green-500/20 hover:bg-green-500/10" : "bg-surface-2 dark:bg-white/5 border-border/40 opacity-60"}`}
                                    onClick={() => { if (suggestedPrice) handlePriceChange(suggestedPrice); }}
                                >
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">PVP Sugerido</span>
                                        {suggestedPrice && <span className="text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded font-bold uppercase transition-all">Aplicar</span>}
                                    </div>
                                    <div className="text-lg font-bold text-green-600 dark:text-green-400 tabular-nums">
                                        {suggestedPrice ? `Ref. ${suggestedPrice}` : "—"}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Configuración Avanzada ── */}
                        {!form.is_combo && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-surface-1 dark:bg-surface-dark-2 rounded-xl p-4 border border-border/40 dark:border-white/5">
                                <h3 className="text-xs font-bold uppercase text-content-subtle dark:text-content-dark-muted mb-3">Unidades de Embalaje</h3>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <CustomSelect
                                            value={form.package_unit}
                                            onChange={val => set("package_unit", val)}
                                            options={[
                                                { value: "", label: "NINGUNO" },
                                                ...Array.from(new Set([
                                                    ...PKG_UNITS,
                                                    ...(form.package_unit && !PKG_UNITS.includes(form.package_unit.toUpperCase()) ? [form.package_unit.toUpperCase()] : [])
                                                ])).map(u => ({ value: u, label: u }))
                                            ]}
                                            placeholder="Unidad de Embalaje"
                                            className="w-full"
                                        />
                                    </div>
                                    <div className="w-24 relative">
                                        <input value={form.package_size} onChange={e => handlePackageSizeChange(e.target.value)} type="number" placeholder="Cant." className="input text-center !pr-9" />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-content-subtle font-bold uppercase">{form.unit || "uds"}</span>
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
                        )}
                    </div>
                )}

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
