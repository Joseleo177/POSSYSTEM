import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import CustomSelect from "../ui/CustomSelect";
import DatePicker from "../ui/DatePicker";
import Segmented from "../ui/Segmented";
import Check from "../ui/Check";
import StatusMark from "../ui/StatusMark";
import { LedgerSkeleton, LedgerEmpty } from "../ui/Ledger";
import { todayISO, toNameCase } from "../../helpers";
import { toLocalISO } from "../../helpers/dates";

// Estado que se ve en la lista. Solo "Activa" lleva color: es la que está cambiando lo que
// cobra la caja ahora mismo. "Programada" avisa que todavía no corre.
const PROMO_STATUS = {
    activa:     { label: "Activa",     tone: "success" },
    programada: { label: "Programada", tone: "info" },
    vencida:    { label: "Vencida",    tone: "neutral" },
    inactiva:   { label: "Pausada",    tone: "neutral" },
};

// Día del calendario que se eligió al crear la promo. Las primeras se guardaron a medianoche
// UTC (su fecha UTC es la elegida); desde que el servidor fija inicio y fin del día en la
// hora de la empresa, la elegida es la fecha local. Leerlas igual corría un día las viejas.
const diaDe = (v) => {
    if (!v) return "";
    const d = new Date(v);
    if (isNaN(d)) return "";
    const utcMedianoche = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0;
    return utcMedianoche ? d.toISOString().slice(0, 10) : toLocalISO(d);
};
// "2026-09-30" → "30 sep" (con el año solo si no es el actual). A mediodía para que ninguna
// zona horaria lo mueva de día.
const fmtDia = (iso) => {
    if (!iso) return "";
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString("es-VE", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() && { year: "numeric" }) });
};

const estadoDe = (p) => {
    if (!p.active) return "inactiva";
    const hoy = todayISO();
    const fin = diaDe(p.ends_at);
    if (fin && fin < hoy) return "vencida";
    if (diaDe(p.starts_at) > hoy) return "programada";
    return "activa";
};

// Lo que gana el cliente, dicho como se diría en el mostrador.
const beneficio = (type, pct, buy, get) => {
    if (type === "percentage") return pct ? { corto: `−${Number(pct).toLocaleString("es-VE")} %`, largo: `${Number(pct).toLocaleString("es-VE")} % de descuento` } : null;
    const b = parseInt(buy), g = parseInt(get);
    if (!(b > 0 && g > 0)) return null;
    return { corto: `${b}+${g}`, largo: `Lleva ${b + g}, paga ${b}` };
};

const EMPTY_FORM = {
    name: "", type: "percentage", discount_pct: "", buy_qty: "", get_qty: "",
    // warehouse_id vacío = corre en todas las sucursales, que es el caso habitual.
    starts_at: todayISO(), ends_at: "", active: true, product_ids: [], warehouse_id: "",
};

export default function PromotionsTab({ notify, can, triggerNew }) {
    const [promos, setPromos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);

    // Para el selector de productos
    const [allProducts, setAllProducts] = useState([]);
    const [productSearch, setProductSearch] = useState("");
    // Sucursales donde puede correr la promoción. Solo las que atienden público: en un
    // depósito no se factura, así que un descuento ahí no tendría dónde aplicarse.
    const [warehouses, setWarehouses] = useState([]);

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.promotions.getAll(); setPromos(r.data || []); }
        catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [notify]);

    // Sin warehouse_id trae el catálogo entero (promo "todas las sucursales"). Con una
    // sucursal elegida, filtra a lo que ESA sucursal tiene ficha de stock — el mismo
    // criterio que ya usa el POS y el módulo Catálogo, para no ofrecer un producto que ahí
    // ni siquiera se vende.
    const loadProducts = useCallback(async (warehouse_id = "") => {
        try {
            const r = await api.products.getAll({ limit: 9999, ...(warehouse_id ? { warehouse_id } : {}) });
            const list = r.data?.products || r.data || [];
            setAllProducts(list);
            return list;
        } catch (e) { console.error(e); return []; }
    }, []);

    const loadWarehouses = useCallback(async () => {
        try {
            const r = await api.warehouses.getAll();
            setWarehouses((r.data || []).filter(w => w.active && w.sells !== false));
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => { load(); loadProducts(); loadWarehouses(); }, [load, loadProducts, loadWarehouses]);

    // Recarga la lista de productos cada vez que se elige o cambia la sucursal DENTRO del
    // modal (sea al abrir para editar una promo que ya tenía una, o al tocar el selector).
    // Los ya elegidos que queden fuera de la sucursal nueva se sueltan solos: dejarlos
    // marcados guardaría una promoción con un producto que esa sucursal ni siquiera vende.
    useEffect(() => {
        if (!modal) return;
        let alive = true;
        loadProducts(form.warehouse_id).then(list => {
            if (!alive || !form.warehouse_id) return;
            const validIds = new Set(list.map(p => p.id));
            setForm(prev => {
                const kept = prev.product_ids.filter(id => validIds.has(id));
                return kept.length === prev.product_ids.length ? prev : { ...prev, product_ids: kept };
            });
        });
        return () => { alive = false; };
    }, [modal, form.warehouse_id, loadProducts]);

    const openNew = useCallback(() => { setForm({ ...EMPTY_FORM, starts_at: todayISO() }); setProductSearch(""); setModal("new"); }, []);

    // Mismo caso que CategoriesTab: la pestaña se remonta al volver a ella, y con la
    // condición `> 0` el modal se abría solo. Se compara contra el valor previo.
    const lastTrigger = useRef(triggerNew);
    useEffect(() => {
        if (triggerNew !== lastTrigger.current) {
            lastTrigger.current = triggerNew;
            openNew();
        }
    }, [triggerNew, openNew]);

    const openEdit = (p) => {
        setForm({
            name: p.name, type: p.type,
            discount_pct: p.discount_pct ?? "",
            buy_qty: p.buy_qty ?? "",
            get_qty: p.get_qty ?? "",
            starts_at: diaDe(p.starts_at),
            ends_at: diaDe(p.ends_at),
            active: p.active,
            product_ids: (p.Products || []).map(pr => pr.id),
            warehouse_id: p.warehouse_id ?? "",
        });
        setProductSearch("");
        setModal(p);
    };

    const toggleProduct = (pid) => {
        setForm(prev => ({
            ...prev,
            product_ids: prev.product_ids.includes(pid)
                ? prev.product_ids.filter(id => id !== pid)
                : [...prev.product_ids, pid],
        }));
    };

    const save = async () => {
        if (!form.name.trim()) return notify("El nombre es requerido", "err");
        if (!form.product_ids.length) return notify("Selecciona al menos un producto", "err");
        if (form.ends_at && form.starts_at && form.ends_at < form.starts_at) return notify("La fecha de fin es anterior a la de inicio", "err");
        setSaving(true);
        try {
            const body = {
                name: form.name.trim(),
                type: form.type,
                discount_pct: form.type === "percentage" ? parseFloat(String(form.discount_pct).replace(",", ".")) : null,
                buy_qty: form.type === "buy_x_get_y" ? parseInt(form.buy_qty) : null,
                get_qty: form.type === "buy_x_get_y" ? parseInt(form.get_qty) : null,
                starts_at: form.starts_at,
                ends_at: form.ends_at || null,
                active: form.active,
                product_ids: form.product_ids,
                warehouse_id: form.warehouse_id || null,
            };
            if (modal === "new") {
                await api.promotions.create(body);
                notify("Promoción creada");
            } else {
                await api.promotions.update(modal.id, body);
                notify("Promoción actualizada");
            }
            setModal(false);
            load();
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

    const confirmDelete = async () => {
        try {
            await api.promotions.remove(deleteDialog.id);
            notify("Promoción eliminada");
            setDeleteDialog(null);
            load();
        } catch (e) { notify(e.message, "err"); }
    };

    // Los marcados primero cuando no se está buscando: al editar una promo se ve de entrada
    // qué lleva, en vez de tener que recorrer todo el catálogo.
    const texto = productSearch.trim().toLowerCase();
    const filteredProducts = (texto
        ? allProducts.filter(p => p.name.toLowerCase().includes(texto))
        : [...allProducts].sort((a, b) => Number(form.product_ids.includes(b.id)) - Number(form.product_ids.includes(a.id)))
    );
    const todosVisiblesMarcados = filteredProducts.length > 0 && filteredProducts.every(p => form.product_ids.includes(p.id));
    const marcarVisibles = () => setForm(prev => {
        const ids = new Set(prev.product_ids);
        if (todosVisiblesMarcados) filteredProducts.forEach(p => ids.delete(p.id));
        else filteredProducts.forEach(p => ids.add(p.id));
        return { ...prev, product_ids: [...ids] };
    });

    const conteo = promos.reduce((a, p) => { const e = estadoDe(p); a[e] = (a[e] || 0) + 1; return a; }, {});
    const vista = beneficio(form.type, form.discount_pct, form.buy_qty, form.get_qty);
    const puedeEditar = can("products.edit");

    return (
        <>
            <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] text-[13px] text-content-subtle">
                <span className="font-semibold text-content dark:text-white tabular-nums">{promos.length}</span> {promos.length === 1 ? "promoción" : "promociones"}
                {conteo.activa > 0 && <> · <span className="text-emerald-700 dark:text-emerald-400 font-medium">{conteo.activa} {conteo.activa === 1 ? "activa" : "activas"}</span></>}
                {conteo.programada > 0 && <> · {conteo.programada} {conteo.programada === 1 ? "programada" : "programadas"}</>}
            </div>

            <div className="flex-1 overflow-auto py-3">
                <div className="card-premium overflow-auto">
                    <table className="table-ledger min-w-[760px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Promoción</th>
                                <th>Beneficio</th>
                                <th className="text-right w-[96px]">Productos</th>
                                <th className="w-[190px]">Vigencia</th>
                                <th className="w-[130px]">Estado</th>
                                <th className="w-[96px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && promos.length === 0 ? <LedgerSkeleton cols={6} rows={4} />
                                : promos.length === 0 ? (
                                    <LedgerEmpty cols={6} title="Todavía no hay promociones"
                                        hint="Un porcentaje de descuento o un «lleva más, paga menos» sobre los productos que elijas." />
                                ) : promos.map(p => {
                                    const estado = estadoDe(p);
                                    const b = beneficio(p.type, p.discount_pct, p.buy_qty, p.get_qty);
                                    const ini = diaDe(p.starts_at), fin = diaDe(p.ends_at);
                                    const apagada = estado === "vencida" || estado === "inactiva";
                                    return (
                                        <tr key={p.id} className={apagada ? "opacity-60" : undefined}>
                                            <td className="pl-4">
                                                <div className="text-[14px] font-semibold text-content dark:text-white truncate">{p.name}</div>
                                                {/* Solo se nombra cuando está limitada: decir "todas"
                                                    en cada fila sería ruido, porque es lo normal. */}
                                                <div className="text-[12px] text-content-subtle truncate">
                                                    {p.warehouse_id
                                                        ? `Solo en ${toNameCase(warehouses.find(w => w.id === p.warehouse_id)?.name || "una sucursal")}`
                                                        : "Todas las sucursales"}
                                                </div>
                                            </td>
                                            <td>
                                                {b ? (
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="h-7 min-w-[52px] px-2 rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-300 text-[13px] font-bold tabular-nums flex items-center justify-center">{b.corto}</span>
                                                        <span className="text-[13px] text-content dark:text-white">{b.largo}</span>
                                                    </div>
                                                ) : <span className="text-content-subtle">—</span>}
                                            </td>
                                            <td className="text-right text-[13px] font-semibold tabular-nums">{(p.Products || []).length}</td>
                                            <td className="text-[13px] tabular-nums">
                                                {fin ? <>{fmtDia(ini)} <span className="text-content-subtle">→</span> {fmtDia(fin)}</> : <>Desde {fmtDia(ini)}</>}
                                                {!fin && <div className="text-[12px] text-content-subtle">Sin fecha de fin</div>}
                                            </td>
                                            <td><StatusMark status={estado} map={PROMO_STATUS} /></td>
                                            <td className="pr-4 text-right">
                                                {puedeEditar && (
                                                    <div className="inline-flex items-center gap-0.5">
                                                        <button onClick={() => openEdit(p)} className="row-icon" title="Editar" aria-label="Editar promoción">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </button>
                                                        <button onClick={() => setDeleteDialog(p)} className="row-icon hover:!text-red-600 dark:hover:!text-red-400 hover:!bg-red-500/10" title="Eliminar" aria-label="Eliminar promoción">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal open={!!modal} onClose={() => setModal(false)} title={modal === "new" ? "Nueva promoción" : "Editar promoción"} width={560}>
                <div className="space-y-5">
                    <div>
                        <label className="label">Nombre <span className="text-red-500">*</span></label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Ej: 10 % en lácteos esta semana" className="input h-10" autoFocus autoComplete="off" />
                    </div>

                    {/* Qué gana el cliente, con la vista previa de cómo lo anuncia la caja. */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <label className="label !mb-0">Beneficio</label>
                            <Segmented
                                value={form.type}
                                onChange={v => setForm(p => ({ ...p, type: v }))}
                                options={[{ key: "percentage", label: "Descuento %" }, { key: "buy_x_get_y", label: "Lleva más, paga menos" }]}
                            />
                        </div>

                        <div className="flex items-end gap-3">
                            {form.type === "percentage" ? (
                                <div className="flex-1">
                                    <label className="label">Descuento <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <input type="text" inputMode="decimal" value={form.discount_pct}
                                            onChange={e => setForm(p => ({ ...p, discount_pct: e.target.value.replace(/[^\d.,]/g, "") }))}
                                            placeholder="10" className="input h-10 pr-9 tabular-nums" autoComplete="off" />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-content-subtle pointer-events-none">%</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex-1">
                                        <label className="label">Compra <span className="text-red-500">*</span></label>
                                        <input type="text" inputMode="numeric" value={form.buy_qty}
                                            onChange={e => setForm(p => ({ ...p, buy_qty: e.target.value.replace(/\D/g, "") }))}
                                            placeholder="3" className="input h-10 tabular-nums" autoComplete="off" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="label">Lleva gratis <span className="text-red-500">*</span></label>
                                        <input type="text" inputMode="numeric" value={form.get_qty}
                                            onChange={e => setForm(p => ({ ...p, get_qty: e.target.value.replace(/\D/g, "") }))}
                                            placeholder="1" className="input h-10 tabular-nums" autoComplete="off" />
                                    </div>
                                </>
                            )}
                        </div>
                        <div className="flex items-center gap-2 text-[12px] text-content-subtle">
                            En caja se anuncia como
                            <span className={`h-6 min-w-[44px] px-2 rounded-md text-[12px] font-bold tabular-nums whitespace-nowrap inline-flex items-center justify-center ${vista ? "bg-brand-500/10 text-brand-700 dark:text-brand-300" : "bg-surface-3 dark:bg-white/[0.06] text-content-subtle"}`}>
                                {vista?.corto || "—"}
                            </span>
                            {vista && <span className="text-content dark:text-white truncate">{vista.largo}</span>}
                        </div>
                    </div>

                    {/* Vigencia y alcance */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Desde <span className="text-red-500">*</span></label>
                            <DatePicker value={form.starts_at} onChange={v => setForm(p => ({ ...p, starts_at: v || todayISO() }))} className="w-full" />
                        </div>
                        <div>
                            <label className="label">Hasta <span className="font-normal text-content-subtle">· opcional</span></label>
                            <DatePicker value={form.ends_at} onChange={v => setForm(p => ({ ...p, ends_at: v || "" }))} placeholder="Sin fecha de fin" className="w-full" />
                        </div>
                    </div>

                    {/* Sucursal donde corre. Lo normal es que sea en todas; limitarla es la
                        excepción, así que esa es la opción por defecto. Con una sola sucursal
                        "todas" y "esa" son lo mismo: el selector no aporta nada. */}
                    {warehouses.length > 1 && (
                        <div>
                            <label className="label">Sucursal</label>
                            <CustomSelect
                                value={String(form.warehouse_id || "")}
                                onChange={val => setForm(p => ({ ...p, warehouse_id: val }))}
                                options={[
                                    { value: "", label: "Todas las sucursales" },
                                    ...warehouses.map(w => ({ value: String(w.id), label: toNameCase(w.name) })),
                                ]}
                                placeholder="Todas las sucursales"
                                className="w-full"
                            />
                        </div>
                    )}

                    {/* Activa / pausada: tarjeta con explicación, como los interruptores de ProductModal. */}
                    <label className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-2 dark:bg-white/[0.04] cursor-pointer">
                        <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-content dark:text-white">{form.active ? "Activa" : "Pausada"}</div>
                            <div className="text-[12px] text-content-subtle">
                                {form.active ? "Se aplica en caja mientras esté vigente." : "No se aplica en caja aunque esté dentro de sus fechas."}
                            </div>
                        </div>
                        <span className="relative inline-flex items-center shrink-0">
                            <input type="checkbox" className="sr-only peer" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} />
                            <span className="w-10 h-6 rounded-full bg-surface-3 dark:bg-white/10 peer-checked:bg-brand-500 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:w-4 after:h-4 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-4" />
                        </span>
                    </label>

                    {/* Productos */}
                    <div>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                            <label className="label !mb-0">
                                Productos <span className="text-red-500">*</span>
                                <span className="ml-1.5 font-normal text-content-subtle tabular-nums">{form.product_ids.length} {form.product_ids.length === 1 ? "elegido" : "elegidos"}</span>
                            </label>
                            <div className="flex items-center gap-1">
                                {filteredProducts.length > 0 && (
                                    <button type="button" onClick={marcarVisibles}
                                        className="h-7 px-2 rounded-md text-[12px] font-medium text-content-muted dark:text-white/60 hover:bg-surface-2 dark:hover:bg-white/[0.05] hover:text-content dark:hover:text-white transition-colors">
                                        {todosVisiblesMarcados ? "Desmarcar" : "Marcar"} {texto ? "resultados" : "todos"}
                                    </button>
                                )}
                                {form.product_ids.length > 0 && !texto && (
                                    <button type="button" onClick={() => setForm(p => ({ ...p, product_ids: [] }))}
                                        className="h-7 px-2 rounded-md text-[12px] font-medium text-content-muted dark:text-white/60 hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                        Quitar todos
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border dark:border-white/10 overflow-hidden">
                            <div className="relative border-b border-border/70 dark:border-white/[0.06]">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                <input type="text" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                                    placeholder="Buscar producto…" autoComplete="off" spellCheck={false}
                                    className="w-full h-10 pl-9 pr-3 bg-transparent outline-none text-[13px] text-content dark:text-white placeholder:text-content-subtle" />
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                                {filteredProducts.length === 0 ? (
                                    <div className="px-3 py-6 text-[13px] text-center text-content-subtle">
                                        {texto ? `Ningún producto con «${productSearch}»` : "No hay productos en esta sucursal"}
                                    </div>
                                ) : filteredProducts.map(prod => {
                                    const checked = form.product_ids.includes(prod.id);
                                    return (
                                        <div key={prod.id} role="button" tabIndex={0} onClick={() => toggleProduct(prod.id)}
                                            onKeyDown={e => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleProduct(prod.id); } }}
                                            className={`flex items-center gap-3 px-3 h-10 cursor-pointer transition-colors ${checked ? "bg-brand-500/[0.06]" : "hover:bg-surface-2 dark:hover:bg-white/[0.04]"}`}>
                                            <Check checked={checked} onChange={() => toggleProduct(prod.id)} />
                                            <span className="text-[13px] text-content dark:text-white truncate flex-1">{prod.name}</span>
                                            <span className="text-[12px] text-content-subtle shrink-0">{toNameCase(prod.Category?.name || prod.category_name || "")}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : modal === "new" ? "Crear promoción" : "Guardar cambios"}</Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteDialog}
                title="¿Eliminar promoción?"
                message={`¿Seguro que deseas eliminar "${deleteDialog?.name}"?`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteDialog(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </>
    );
}
