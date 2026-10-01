import { useState, useEffect, useRef } from "react";
import Modal from "./ui/Modal";
import { Button } from "./ui/Button";
import { useApp } from "../context/AppContext";
import CustomSelect from "./ui/CustomSelect";
import { calcSalePrice as calcSalePriceHelper, resolveImageUrl } from "../helpers";
import ComboItemsEditor from "./ComboItemsEditor";
import BenefitTagPicker from "./BenefitTagPicker";
import VariantsEditor from "./VariantsEditor";
import { PKG_UNITS } from "../constants/pkg";
import { fmtQtyUnit } from "../helpers/unitFormatter";

const UNITS = ["UNIDAD", "KG", "LITRO", "METRO"];
const EMPTY = {
    name: "", price: "", stock: "", category_id: "", unit: "UNIDAD", qty_step: "1",
    package_unit: "", package_size: "", cost_price: "", profit_margin: "", min_stock: "0",
    is_combo: false, combo_items: [], is_service: false, barcode: "", bulk_price: "",
    brand: "", short_description: "", description: "", benefit_tag_ids: [],
    visible_in_catalog: false, sellable: true, has_variants: false
};

export default function ProductModal({ open, onClose, onSave, editData, categories, loading, warehouseId, warehouseName, warehouseCount = 1, initialName = "" }) {
    const { notify, activeCurrencies, company } = useApp();
    const catalogEnabled = !!company?.catalog_enabled;
    const localCurrency = activeCurrencies.find(c => !c.is_base) ?? null;
    const exchangeRate = parseFloat(localCurrency?.exchange_rate || 0);

    const [form, setForm] = useState(EMPTY);
    // El guardado lo bloquea el propio modal, sin depender de que cada pantalla le pase un
    // `loading` de verdad: el catálogo le pasaba el de cargar la lista, así que mientras se
    // subía la foto y se guardaba el botón seguía activo y sin señal. La gente volvía a
    // pulsarlo y cada clic era otro PUT, o —al crear— otro producto duplicado. El ref corta
    // el segundo clic en el acto; el estado solo pinta el spinner.
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);
    const [priceInBs, setPriceInBs] = useState("");
    const [priceCurrency, setPriceCurrency] = useState("base");
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [removeImage, setRemoveImage] = useState(false);
    // El modal creció campo a campo hasta volverse una sola pantalla larga —tipo, costos,
    // vitrina, todo apilado—. Se reparte en pestañas para que abrir la ficha no sea siempre
    // desplazar hasta el fondo a buscar el margen o el texto de la vitrina; el nombre, la
    // categoría y el precio quedan arriba, fuera de las pestañas, porque son lo que se mira
    // primero sea cual sea la tarea.
    const [tab, setTab] = useState("general");
    // Lo que arma la pestaña Variantes: { attribute_ids, variants }. Vive fuera de `form`
    // porque el editor lo recalcula entero en cada cambio.
    const [variantData, setVariantData] = useState(null);

    // Nombrar la sucursal solo tiene sentido para quien maneja varias y necesita saber cuál
    // está tocando. A quien atiende una sola, "Precio en CENTRO" no le aclara nada: le cuenta
    // que existen otras tiendas, que es justo lo que el recorte por sucursal evita.
    const sucursal = warehouseId && warehouseName && warehouseCount > 1 ? warehouseName : null;


    useEffect(() => {
        if (open) {
            setTab("general");
            setVariantData(null);
            if (editData) {
                let initialBulkPrice = editData.bulk_price || "";
                if (!initialBulkPrice && editData.cost_price && editData.package_size) {
                    initialBulkPrice = (parseFloat(editData.cost_price) * parseFloat(editData.package_size)).toFixed(2);
                }

                setForm({
                    name: editData.name,
                    price: editData.price,
                    // Cuando el catálogo está filtrado por almacén, la tabla muestra
                    // warehouse_stock (existencias en ESE almacén) mientras que `stock` es el
                    // total de todos. Con un solo almacén coinciden; con varios, el modal
                    // mostraba una cifra que no correspondía a la fila abierta.
                    stock: (warehouseId && editData.warehouse_stock != null)
                        ? editData.warehouse_stock
                        : editData.stock,
                    category_id: editData.category_id || "",
                    unit: editData.unit || "unidad",
                    qty_step: editData.qty_step || "1",
                    // Los combos no tienen presentación ni precio por bulto: esos campos les
                    // quedan de cuando el producto todavía no era combo y no aplican.
                    // Se limpian al abrir la ficha para que no aparezca "Precio por CAJA" en Costos.
                    package_unit: editData.is_combo ? "" : (editData.package_unit ? editData.package_unit.toUpperCase() : ""),
                    // Una presentación "UNIDAD" contiene una unidad. Los productos guardados
                    // antes de que el campo se bloqueara pueden traer otra cosa (UNIDAD × 4,
                    // que además infla las órdenes de compra): se corrige al abrir la ficha,
                    // y guardar deja el dato sano.
                    package_size: editData.is_combo ? "" : ((editData.package_unit || "").toUpperCase() === "UNIDAD"
                        ? 1
                        : (editData.package_size != null && editData.package_size !== "" ? parseFloat(editData.package_size) : "")),
                    bulk_price: editData.is_combo ? "" : initialBulkPrice,
                    cost_price: editData.cost_price || "",
                    profit_margin: editData.profit_margin || "",
                    min_stock: editData.min_stock != null ? parseFloat(editData.min_stock) : 0,
                    is_combo: editData.is_combo || false,
                    is_service: editData.is_service || false,
                    barcode: editData.barcode || "",
                    brand: editData.brand || "",
                    short_description: editData.short_description || "",
                    description: editData.description || "",
                    benefit_tag_ids: editData.benefit_tag_ids || [],
                    visible_in_catalog: editData.visible_in_catalog || false,
                    // Los productos creados antes de que existiera la marca vienen sin el
                    // campo: se asumen vendibles, que es como se comportaban.
                    sellable: editData.sellable !== false,
                    has_variants: !!editData.is_variant_parent,
                    combo_items: editData.comboItems ? editData.comboItems.map(c => ({
                        product_id: c.ingredient.id,
                        name: c.ingredient.name,
                        unit: c.ingredient.unit || "uds",
                        quantity: parseFloat(c.quantity),
                        price: parseFloat(c.ingredient.price || 0),
                        cost_price: parseFloat(c.ingredient.cost_price || 0)
                    })) : []
                });
                // Un modelo sin foto se lista con la de un color (image_from_variant); esa no es
                // suya y no se ofrece para cambiar ni quitar aquí.
                setImagePreview(editData.image_from_variant ? null : (resolveImageUrl(editData.image_url) || null));
            } else {
                // initialName: lo que el usuario ya escribió en el buscador que lo trajo hasta
                // acá. Volver a teclear el mismo nombre es trabajo repetido y una oportunidad
                // de escribirlo distinto.
                setForm({ ...EMPTY, name: initialName || "" });
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
    }, [open, editData, warehouseId]);

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

        // Cambiar el costo de un producto con precio fijado a mano no debe moverle el precio:
        // lo que cambia es cuánto se está ganando. Se recalcula el margen y el precio queda.
        const precioFijoSinMargen = key === "cost_price"
            && String(next.profit_margin ?? "").trim() === ""
            && parseFloat(next.price) > 0;

        if (precioFijoSinMargen) {
            const m = deriveMargin(next.price, val);
            if (m !== null) next.profit_margin = m;
            setForm(next);
            return;
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

    // Margen que se desprende de un precio puesto a mano. El usuario fija el precio y el
    // porcentaje sale solo, en vez de quedar en blanco: así la ficha no dice "0%" de algo
    // que sí deja ganancia.
    const deriveMargin = (price, cost) => {
        const p = parseFloat(price);
        const c = parseFloat(cost);
        if (isNaN(p) || isNaN(c) || c <= 0 || p <= 0) return null;
        return (((p / c) - 1) * 100).toFixed(2);
    };

    const handlePriceChange = (val) => {
        setForm(prev => {
            const next = { ...prev, price: val };
            const m = deriveMargin(val, prev.cost_price);
            if (m !== null) next.profit_margin = m;
            return next;
        });
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

            // Precio por caja con precio de venta ya fijado: el margen se deduce del costo
            // unitario que acaba de salir de esa caja.
            if (String(form.profit_margin ?? "").trim() === "" && parseFloat(form.price) > 0) {
                const m = deriveMargin(form.price, unitCost);
                if (m !== null) updates.profit_margin = m;
                setForm(prev => ({ ...prev, ...updates }));
                return;
            }

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

    // Cuántas unidades trae cada presentación, cuando el nombre ya lo dice. Se propone al
    // elegirla; el usuario la puede pisar (hay "docenas" de 10 en la vida real).
    const PKG_SIZE_SUGERIDO = { UNIDAD: "1", DOCENA: "12" };

    // La presentación manda sobre el contenido. "UNIDAD" es la presentación suelta: contiene
    // exactamente una unidad, y dejar teclear otra cosa producía fichas que se contradicen
    // ("UNIDAD × 4 unidad") y, peor, compras infladas: la orden multiplica cantidad por
    // contenido, así que 3 "UNIDAD" de contenido 4 metían 12 al inventario.
    const handlePackageUnitChange = (val) => {
        setForm(prev => {
            const next = { ...prev, package_unit: val };
            if (!val) {                       // NINGUNO: no se compra por bulto
                next.package_size = "";
                next.bulk_price   = "";
                return next;
            }
            const sugerido = PKG_SIZE_SUGERIDO[val];
            // Solo se pisa lo tecleado cuando la presentación no admite otro contenido
            // (UNIDAD). Para el resto es una propuesta, y solo si el campo está vacío.
            if (val === "UNIDAD") next.package_size = "1";
            else if (sugerido && !String(prev.package_size ?? "").trim()) next.package_size = sugerido;

            const size = parseFloat(next.package_size);
            if (next.cost_price && size > 0) next.bulk_price = (parseFloat(next.cost_price) * size).toFixed(2);
            return next;
        });
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

    const handleSave = async () => {
        if (savingRef.current) return;
        // Al insumo no se le pide precio porque no se vende; se guarda en 0 junto con el
        // margen vacío, así no arrastra un precio viejo si algún día vuelve a venderse.
        if (form.sellable && (parseFloat(form.price) <= 0 || form.price === "")) {
            return notify("El precio de venta debe ser mayor a 0", "err");
        }
        if (form.cost_price !== "" && parseFloat(form.cost_price) < 0) return notify("El costo unitario no puede ser negativo", "err");
        const submissionForm = { ...form };
        if (form.has_variants) {
            // Sin abrir la pestaña no hay nada que mandar: el servidor deja las variantes como
            // están y solo les pasa lo que cambió en el modelo (nombre, precio, categoría).
            const tocadas = variantData !== null;
            const vs = variantData?.variants || [];
            if (!vs.length && (tocadas || !editData?.is_variant_parent)) {
                setTab("variantes");
                return notify("Arma al menos una variante en la pestaña Variantes", "err");
            }
            if (tocadas) {
                submissionForm.variant_attribute_ids = variantData.attribute_ids;
                submissionForm.variants = vs;
            }
            // El modelo no lleva código propio: se escanea la variante.
            submissionForm.barcode = "";
            submissionForm.is_combo = false;
            submissionForm.is_service = false;
        }
        if (!form.sellable) {
            submissionForm.price = 0;
            submissionForm.profit_margin = "";
        }
        // Al crear sirve para dar el stock inicial en ese almacén; al editar marca el alcance:
        // el precio, el costo y el mínimo son de esta sucursal y no de la empresa entera.
        if (warehouseId) submissionForm.warehouse_id = warehouseId;
        savingRef.current = true;
        setSaving(true);
        try {
            await onSave(submissionForm, imageFile, removeImage);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    };

    const busy = loading || saving;

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

    const handleIsServiceChange = (e) => {
        const checked = e.target.checked;
        setForm(prev => {
            const next = { ...prev, is_service: checked };
            if (checked) {
                next.is_combo = false;
                next.package_unit = "";
                next.package_size = "";
                next.bulk_price = "";
            }
            return next;
        });
    };

    const handleIsComboChange = (e) => {
        const checked = e.target.checked;
        setForm(prev => {
            const next = { ...prev, is_combo: checked };
            if (checked) {
                next.package_unit = "";
                next.package_size = "";
                next.bulk_price = "";
                
                const sumCost = prev.combo_items.reduce((acc, item) => {
                    const qty = parseFloat(item.quantity) || 0;
                    const c = parseFloat(item.cost_price) || 0;
                    return acc + (c * qty);
                }, 0);
                next.cost_price = sumCost.toFixed(4);

                if (next.profit_margin) {
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
            }
            return next;
        });
    };

    // La existencia solo se muestra al editar un producto que la lleva: un combo descuenta la
    // de sus ingredientes y un servicio no tiene.
    const conStock = !!editData?.id && !form.is_combo && !form.is_service && !form.has_variants;
    // Unidades en caja de oración ("Unidad", "Kg") y no en mayúsculas.
    const unidadLabel = (u) => u === "KG" ? "Kg" : u.charAt(0) + u.slice(1).toLowerCase();

    // Acciones fijas al pie del modal: el formulario es largo (y con variantes, mucho) y había
    // que bajar hasta el final para guardar.
    const pieAcciones = (
        <div className="flex gap-2 sm:justify-end">
            <button onClick={onClose} disabled={saving}
                className="btn-outline h-11 sm:h-10 px-5 rounded-lg text-[13px] font-medium disabled:opacity-50">
                Cancelar
            </button>
            <Button
                onClick={handleSave} loading={busy}
                variant="primary"
                className="flex-1 sm:flex-none sm:min-w-[160px] h-11 sm:h-10"
            >
                {busy ? "Guardando…" : (isEdit ? "Guardar cambios" : "Crear producto")}
            </Button>
        </div>
    );

    return (
        <Modal open={open} onClose={onClose} title={isEdit ? "Editar producto" : "Nuevo producto"} width={720} footer={pieAcciones}>
            <div className="flex flex-col gap-4">

                {/* ── Foto + datos principales ──
                    En el teléfono la foto va a la izquierda, chica, con sus acciones al lado:
                    centrada y sola en su fila se llevaba media pantalla antes del primer campo. */}
                <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex lg:flex-col items-center gap-3 lg:gap-1.5 shrink-0">
                        <label className="block cursor-pointer relative group shrink-0" title={imagePreview ? "Cambiar foto" : "Subir foto"}>
                            <div className="w-[72px] h-[72px] lg:w-[104px] lg:h-[104px] rounded-xl overflow-hidden bg-surface-2 dark:bg-white/[0.04] border border-dashed border-border dark:border-white/15 flex items-center justify-center hover:border-content-subtle/60 transition-colors">
                                {imagePreview ? (
                                    <>
                                        <img src={imagePreview} alt="Foto del producto" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 [@media(hover:hover)]:group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                                            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center text-content-subtle">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                        <div className="text-[11px] font-medium mt-1">Foto</div>
                                    </div>
                                )}
                            </div>
                            <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                        </label>
                        <div className="min-w-0 lg:text-center">
                            <p className="lg:hidden text-[13px] font-medium text-content dark:text-white">Foto del producto</p>
                            <p className="lg:hidden text-[12px] text-content-subtle">
                                {imagePreview ? "Toca la foto para cambiarla." : "Toca el recuadro para subir una."}
                            </p>
                            {imagePreview && (
                                <button
                                    type="button"
                                    onClick={(e) => { e.preventDefault(); setImageFile(null); setImagePreview(null); setRemoveImage(true); }}
                                    className="mt-0.5 h-8 px-2 -ml-2 lg:ml-0 rounded-lg text-[12px] font-medium text-red-600 dark:text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    Quitar foto
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Información principal */}
                    <div className="flex-1 min-w-0 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                            <div className="md:col-span-8">
                                <label className="label">Nombre</label>
                                <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus className="input" placeholder="Ej. Harina de maíz 1 kg" />
                            </div>
                            <div className="md:col-span-4">
                                <label className="label">Categoría</label>
                                <CustomSelect
                                    value={form.category_id}
                                    onChange={val => set("category_id", val)}
                                    options={[{ value: "", label: "Sin categoría" }, ...categories.map(c => ({ value: String(c.id), label: c.name }))]}
                                    placeholder="Sin categoría"
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {/* En el teléfono, unidad y existencia comparten fila (son cortas) y el
                            código y el precio van a lo ancho; en escritorio, todo en una línea. */}
                        <div className={`grid grid-cols-2 gap-3 items-end ${conStock ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
                            <div className={`order-1 min-w-0 ${conStock ? "" : "col-span-2 md:col-span-1"}`}>
                                <label className="label">Unidad de medida</label>
                                <CustomSelect
                                    value={form.unit}
                                    onChange={val => set("unit", val)}
                                    options={UNITS.map(u => ({ value: u, label: unidadLabel(u) }))}
                                    placeholder="Unidad de medida"
                                    className="w-full"
                                />
                            </div>
                            <div className="order-3 md:order-2 col-span-2 md:col-span-1 min-w-0">
                                <label className="label">Código de barras</label>
                                {form.has_variants ? (
                                    <div className="h-10 px-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] flex items-center text-[13px] text-content-subtle truncate">
                                        En cada variante
                                    </div>
                                ) : (
                                    <input value={form.barcode} onChange={e => set("barcode", e.target.value)} className="input" inputMode="numeric" placeholder="Ej. 7591234567890" />
                                )}
                            </div>
                            {form.sellable && (
                            <div className="order-4 md:order-3 col-span-2 md:col-span-1 min-w-0">
                                <label className="label flex items-center justify-between gap-2">
                                    {/* Mismo criterio que la existencia: se nombra la sucursal en
                                        la que se está trabajando, porque es la que se cambia. */}
                                    <span className="truncate">{sucursal ? `Precio en ${sucursal}` : "Precio de venta"}</span>
                                    {localCurrency && (
                                        <span className="inline-flex shrink-0 rounded-md bg-surface-3 dark:bg-white/[0.06] p-0.5">
                                            {[["base", "$"], ["local", localCurrency.symbol || "Bs."]].map(([k, l]) => (
                                                <button key={k} type="button" onClick={() => setPriceCurrency(k)}
                                                    className={`px-2 h-5 rounded text-[11px] font-semibold transition-colors ${priceCurrency === k
                                                        ? "bg-white dark:bg-white/15 text-content dark:text-white shadow-sm"
                                                        : "text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                    {l}
                                                </button>
                                            ))}
                                        </span>
                                    )}
                                </label>
                                {priceCurrency === "base" || !localCurrency ? (
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle font-medium text-[12px]">$</span>
                                        <input value={form.price} onChange={e => handlePriceChange(e.target.value.replace(/[^0-9.]/g, ""))} type="text" inputMode="decimal" className="input !pl-7 tabular-nums" placeholder="0.00" />
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-[12px] font-medium">{localCurrency.symbol || "Bs."}</span>
                                        <input value={priceInBs} onChange={e => handlePriceInBsChange(e.target.value)} type="number" step="0.01" min="0" inputMode="decimal" className="input !pl-9 tabular-nums" placeholder="0.00" />
                                    </div>
                                )}
                            </div>
                            )}
                            {conStock && (
                                <div className="order-2 md:order-4 min-w-0">
                                    <label className="label truncate">{sucursal ? `Existencia en ${sucursal}` : "Existencia"}</label>
                                    {/* Solo lectura: la existencia se mueve con compras, ventas y
                                        ajustes de Inventario, nunca escribiendo un número aquí. */}
                                    <div className="h-10 px-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.06] flex justify-between items-center gap-2 min-w-0"
                                        title="Se ajusta desde Inventario">
                                        <span className="text-[13px] font-semibold text-content dark:text-white truncate min-w-0 tabular-nums">
                                            {fmtQtyUnit(form.stock ?? 0, form.unit).toLowerCase()}
                                        </span>
                                        <svg className="w-3.5 h-3.5 shrink-0 text-content-subtle/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Pestañas ──
                    Vitrina y Receta quedan fuera de la lista solo cuando NADA que mostrar
                    depende de un ajuste externo (el extra de catálogo, en el caso de
                    Vitrina). Cuando lo que falta es un interruptor del propio producto
                    (Producto Compuesto para Receta, visible_in_catalog para Vitrina), la
                    pestaña se queda visible con un aviso de "actívalo primero" adentro: que
                    desaparezca sola en cuanto se apaga el interruptor —estando uno parado
                    en ella— sería más confuso que el aviso. */}
                <div className="flex items-center gap-1 border-b border-border/40 dark:border-white/10 -mx-1">
                    {[
                        ["general", "General"],
                        ["receta", "Receta"],
                        ["variantes", "Variantes"],
                        ["costos", "Costos"],
                        // El extra del catálogo público lo enciende el superusuario por
                        // empresa (ver CompanyModal): sin él, esta pestaña no tendría nada
                        // que ofrecer — sus campos son marca, descripción y beneficios de
                        // cara a una vitrina que esta empresa no tiene.
                        ...(catalogEnabled ? [["vitrina", "Vitrina"]] : []),
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setTab(id)}
                            className={`px-3 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors ${tab === id
                                ? "border-brand-500 text-brand-700 dark:text-brand-300"
                                : "border-transparent text-content-subtle dark:text-content-dark-muted hover:text-content dark:hover:text-white"}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* ── Tipo y disponibilidad ──
                    Una lista agrupada, como los ajustes del teléfono: cada fila entera se toca
                    para cambiarla. Antes eran cuatro cajas sueltas que se teñían de color al
                    encenderse y competían con el botón de guardar. */}
                {tab === "general" && (
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] overflow-hidden">
                        {!form.has_variants && (
                        <Interruptor
                            titulo="Servicio"
                            detalle="No lleva inventario: no se cuenta ni se descuenta."
                            checked={form.is_service}
                            onChange={handleIsServiceChange}
                        />
                        )}
                        {!form.is_service && !form.has_variants && (
                            <Interruptor
                                titulo="Producto compuesto"
                                detalle={isEdit && form.combo_items.length > 0
                                    ? "Tiene receta: quítale los ítems para apagarlo."
                                    : "Se arma con otros productos (pestaña Receta)."}
                                checked={form.is_combo}
                                onChange={handleIsComboChange}
                                disabled={isEdit && form.combo_items.length > 0}
                            />
                        )}
                        {/* Ropa y calzado: un mismo producto en varias tallas o colores, cada uno
                            con su código y su existencia. Se apaga solo sin variantes: el modelo
                            no tiene inventario propio que devolverle. */}
                        {!form.is_service && !form.is_combo && (
                            <Interruptor
                                titulo="Tiene variantes"
                                detalle={isEdit && editData?.is_variant_parent && (editData?.variant_count ?? 1) > 0
                                    ? "Tiene variantes creadas: quítalas en la pestaña Variantes para apagarlo."
                                    : "Tallas, colores u otra opción: cada una con su código y su existencia."}
                                checked={form.has_variants}
                                disabled={isEdit && editData?.is_variant_parent && (editData?.variant_count ?? 1) > 0}
                                onChange={e => setForm(p => ({ ...p, has_variants: e.target.checked, ...(e.target.checked ? { is_combo: false, is_service: false } : {}) }))}
                            />
                        )}
                        {/* Van juntos porque se leen juntos: el primero decide si el producto se
                            vende, y el segundo solo tiene sentido si la respuesta es que sí.
                            Marcarlo como insumo lo baja del catálogo en el mismo gesto: un insumo
                            publicado sería algo que el cliente puede pedir y la caja no puede cobrar. */}
                        <Interruptor
                            titulo="No disponible para venta"
                            detalle="Insumo de producción: se compra y se inventaría, pero no se cobra en caja."
                            checked={!form.sellable}
                            tono="ambar"
                            onChange={e => setForm(p => ({ ...p, sellable: !e.target.checked, visible_in_catalog: e.target.checked ? false : p.visible_in_catalog }))}
                        />
                        {catalogEnabled && (
                            <Interruptor
                                titulo="Mostrar en catálogo público"
                                detalle={form.sellable
                                    ? (form.has_variants
                                        ? "Se publica el producto y el cliente elige talla o color. Nunca el stock ni el costo."
                                        : "Los clientes ven foto, categoría y precio. Nunca el stock ni el costo.")
                                    : "Los insumos no se publican."}
                                checked={form.visible_in_catalog && form.sellable}
                                disabled={!form.sellable}
                                onChange={e => set("visible_in_catalog", e.target.checked)}
                            />
                        )}
                    </div>
                )}

                {tab === "receta" && (
                    form.is_combo ? (
                        <ComboItemsEditor
                            comboItems={form.combo_items}
                            onChange={handleComboItemsChange}
                            excludeId={editData?.id}
                            warehouseId={warehouseId}
                        />
                    ) : (
                        <div className="p-4 rounded-lg border border-border/40 dark:border-white/5 bg-surface-2 dark:bg-white/5 text-center mt-1">
                            <p className="text-xs font-semibold text-content dark:text-content-dark">Este producto no es compuesto</p>
                            <p className="text-[11px] text-content-subtle dark:text-content-dark-muted mt-1">
                                Activa "Producto compuesto" en General para armarlo con otros ítems.
                            </p>
                        </div>
                    )
                )}

                {/* El editor queda montado mientras haya variantes, aunque se mire otra
                    pestaña: desmontarlo perdía lo tecleado al ir a General y volver. */}
                {form.has_variants && (
                    <div className={tab === "variantes" ? "" : "hidden"}>
                        <VariantsEditor
                            productId={editData?.is_variant_parent ? editData.id : null}
                            modelPrice={form.price}
                            onChange={setVariantData}
                            notify={notify}
                            warehouseId={warehouseId}
                        />
                    </div>
                )}
                {tab === "variantes" && !form.has_variants && (
                        <div className="p-4 rounded-lg border border-border/40 dark:border-white/5 bg-surface-2 dark:bg-white/5 text-center mt-1">
                            <p className="text-xs font-semibold text-content dark:text-content-dark">Este producto no tiene variantes</p>
                            <p className="text-[11px] text-content-subtle dark:text-content-dark-muted mt-1">
                                {form.is_combo || form.is_service
                                    ? "Un combo o un servicio no lleva tallas ni colores."
                                    : 'Activa "Tiene variantes" en General para venderlo por talla o color.'}
                            </p>
                        </div>
                )}

                {tab === "vitrina" && (
                    <div className="p-4 rounded-lg border border-border/40 dark:border-white/5 bg-surface-2 dark:bg-white/5 space-y-3 mt-1">
                        {form.visible_in_catalog && form.sellable ? (
                            <>
                                <div>
                                    <label className="label">Marca o línea</label>
                                    <input
                                        value={form.brand}
                                        onChange={e => set("brand", e.target.value)}
                                        className="input"
                                        maxLength={80}
                                        placeholder="Ej. Poción Kids"
                                    />
                                </div>
                                <div>
                                    <label className="label">Frase de beneficio</label>
                                    <input
                                        value={form.short_description}
                                        onChange={e => set("short_description", e.target.value)}
                                        className="input"
                                        maxLength={200}
                                        placeholder="Ej. Desenreda sin dolor · 450 ml"
                                    />
                                    <div className="text-[11px] text-content-subtle dark:text-content-dark-muted mt-1">
                                        Una línea corta bajo el nombre. Se ve en el catálogo público, no en la factura.
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Descripción</label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => set("description", e.target.value)}
                                        className="input !h-auto py-2 resize-none"
                                        rows={4}
                                        placeholder="Texto largo para la ficha del producto. Un párrafo por línea en blanco."
                                    />
                                    <div className="text-[11px] text-content-subtle dark:text-content-dark-muted mt-1">
                                        Se muestra en la página propia del producto, no en la tarjeta del catálogo.
                                    </div>
                                </div>
                                <div>
                                    <label className="label">Beneficios</label>
                                    <BenefitTagPicker
                                        selectedIds={form.benefit_tag_ids}
                                        onChange={(ids) => set("benefit_tag_ids", ids)}
                                    />
                                </div>
                            </>
                        ) : (
                            // No es un aviso de error: es lo esperable con el producto todavía
                            // sin publicar. Explica qué interruptor prender y en qué pestaña
                            // está, para no dejar al usuario buscándolo.
                            <p className="text-[12px] font-semibold text-content-subtle dark:text-content-dark-muted text-center py-4">
                                {form.sellable
                                    ? 'Activa "Mostrar en catálogo público" en la pestaña General para escribir estos textos.'
                                    : "Los insumos no se publican, así que no tienen textos de vitrina."}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Costos y Rentabilidad ──
                    También para servicios: un servicio tiene costo (la hora del técnico, el
                    material que consume) y sin cargarlo queda fuera del reporte de márgenes,
                    que solo mide lo que tiene costo conocido. Lo que sí se les oculta es el
                    presentación y el stock mínimo, que no aplican. */}
                {tab === "costos" && (
                    <div className="space-y-3">
                        {/* ── Rentabilidad ── */}
                        <div className="rounded-xl p-4 border border-border/70 dark:border-white/[0.08]">
                            <h3 className="text-[13px] font-semibold text-content dark:text-white mb-3">
                                {form.sellable ? "Costos y rentabilidad" : "Costo del insumo"}
                            </h3>
                            {/* Sin precio de venta no hay rentabilidad que mostrar: el bloque
                                queda con el costo solo, a ancho completo. */}
                            <div className={form.sellable ? "grid grid-cols-1 md:grid-cols-2 gap-4" : ""}>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="label">Costo unitario</label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-semibold">$</span>
                                                <input value={form.cost_price} onChange={e => handleCostOrMarginChange("cost_price", e.target.value)} type="number" step="0.0001" min="0" className={`input !pl-6 ${form.is_combo ? "bg-surface-2 dark:bg-white/5" : ""}`} placeholder="0.0000" readOnly={form.is_combo} />
                                            </div>
                                        </div>
                                        {form.sellable && (
                                        <div>
                                            <label className="label">Margen (%)</label>
                                            <div className="relative">
                                                <input value={form.profit_margin} onChange={e => handleCostOrMarginChange("profit_margin", e.target.value)} type="number" step="0.1" className="input pr-6" placeholder="0" />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-semibold">%</span>
                                            </div>
                                        </div>
                                        )}
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
                                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle text-xs font-semibold">$</span>
                                                    <input
                                                        value={form.bulk_price}
                                                        onChange={e => handleBulkPriceChange(e.target.value)}
                                                        type="number" step="0.01" min="0"
                                                        className="input !pl-6"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                                {form.bulk_price && parseFloat(form.package_size) > 0 && (
                                                    <span className="text-[12px] text-content-subtle font-medium whitespace-nowrap tabular-nums">
                                                        = $ {(parseFloat(form.bulk_price) / parseFloat(form.package_size)).toFixed(4)} c/u
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                                {form.sellable && (
                                <div className="flex items-center justify-between gap-3 p-3 px-4 rounded-lg bg-surface-2 dark:bg-white/[0.04]">
                                    <div className="min-w-0">
                                        <p className="text-[12px] text-content-subtle">Precio sugerido</p>
                                        <p className="text-[17px] font-semibold tracking-tight text-content dark:text-white tabular-nums">
                                            {suggestedPrice ? `Ref. ${suggestedPrice}` : "—"}
                                        </p>
                                        <p className="text-[11px] text-content-subtle">{suggestedPrice ? "Costo más el margen" : "Carga costo y margen"}</p>
                                    </div>
                                    {suggestedPrice && (
                                        <button type="button" onClick={() => handlePriceChange(suggestedPrice)}
                                            className="btn-outline h-9 px-3.5 rounded-lg text-[13px] font-medium shrink-0">
                                            Aplicar
                                        </button>
                                    )}
                                </div>
                                )}
                            </div>
                        </div>

                        {/* ── Configuración Avanzada ── */}
                        {!form.is_combo && !form.is_service && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="rounded-xl p-4 border border-border/70 dark:border-white/[0.08]">
                                <h3 className="text-[13px] font-semibold text-content dark:text-white mb-3">Presentación de compra</h3>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <CustomSelect
                                            value={form.package_unit}
                                            onChange={handlePackageUnitChange}
                                            options={[
                                                { value: "", label: "Ninguno" },
                                                ...Array.from(new Set([
                                                    ...PKG_UNITS,
                                                    ...(form.package_unit && !PKG_UNITS.includes(form.package_unit.toUpperCase()) ? [form.package_unit.toUpperCase()] : [])
                                                ])).map(u => ({ value: u, label: u.charAt(0) + u.slice(1).toLowerCase() }))
                                            ]}
                                            placeholder="Presentación"
                                            className="w-full"
                                        />
                                    </div>
                                    {/* El contenido solo se teclea cuando la presentación es un
                                        bulto de verdad. Sin presentación no hay nada que contar,
                                        y una "UNIDAD" contiene una unidad por definición. */}
                                    <div className="w-24 relative">
                                        <input
                                            value={form.package_size}
                                            onChange={e => handlePackageSizeChange(e.target.value)}
                                            type="number" min="1" step="1"
                                            disabled={!form.package_unit || form.package_unit === "UNIDAD"}
                                            placeholder={form.package_unit ? "Cant." : "—"}
                                            title={form.package_unit === "UNIDAD" ? "Una unidad contiene una unidad" : undefined}
                                            className="input text-center !pr-9 disabled:opacity-45 disabled:cursor-not-allowed"
                                        />
                                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-content-subtle pointer-events-none">{(form.unit || "uds").toLowerCase()}</span>
                                    </div>
                                </div>
                                <p className="mt-2 text-[12px] text-content-subtle leading-snug">
                                    {!form.package_unit
                                        ? "Este producto se compra suelto, sin bulto."
                                        : form.package_unit === "UNIDAD"
                                            ? "Se compra por unidad suelta."
                                            : `Cuántas ${(form.unit || "uds").toLowerCase()} trae cada ${form.package_unit.toLowerCase()}. Es lo que multiplica la orden de compra.`}
                                </p>
                            </div>

                            <div className="rounded-xl p-4 border border-border/70 dark:border-white/[0.08]">
                                <h3 className="text-[13px] font-semibold text-content dark:text-white mb-3">
                                    {sucursal ? `Alerta de reposición en ${sucursal}` : "Alerta de reposición"}
                                </h3>
                                <div className="relative">
                                    <input value={form.min_stock} onChange={e => set("min_stock", e.target.value)} type="number" className="input" placeholder="Min. para notificar..." />
                                </div>
                                {/* El aviso se mide sucursal por sucursal, no sobre la suma de
                                    todas: una tienda en cero tiene que avisar aunque otra esté llena. */}
                                <p className="mt-2 text-[12px] text-content-subtle leading-snug">
                                    Avisa cuando esta sucursal baje de aquí.
                                </p>
                            </div>
                        </div>
                        )}
                    </div>
                )}


            </div>
        </Modal>
    );
}

// Fila de interruptor de la lista agrupada: título, una línea que explica qué implica y el
// switch a la derecha. La fila entera es la etiqueta, así que se toca en cualquier parte.
// `tono="ambar"` para el que marca una excepción (insumo), no un estado normal.
function Interruptor({ titulo, detalle, checked, onChange, disabled = false, tono }) {
    return (
        <label className={`flex items-center justify-between gap-4 px-4 py-3 transition-colors ${disabled ? "opacity-55 cursor-not-allowed" : "cursor-pointer hover:bg-surface-2/60 dark:hover:bg-white/[0.02]"}`}>
            <span className="min-w-0">
                <span className="block text-[13px] font-medium text-content dark:text-white">{titulo}</span>
                <span className="block text-[12px] text-content-subtle mt-0.5 leading-snug">{detalle}</span>
            </span>
            <span className="relative inline-flex items-center shrink-0">
                <input type="checkbox" className="sr-only peer" checked={!!checked} disabled={disabled} onChange={onChange} />
                <span className={`block w-10 h-6 rounded-full bg-border dark:bg-white/15 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500/40 ${tono === "ambar" ? "peer-checked:bg-amber-500" : "peer-checked:bg-brand-600 dark:peer-checked:bg-brand-500"} after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4`} />
            </span>
        </label>
    );
}
