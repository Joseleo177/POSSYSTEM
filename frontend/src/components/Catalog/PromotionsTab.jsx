import { useState, useCallback, useEffect } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";

const TYPE_LABELS = { percentage: "Porcentaje", buy_x_get_y: "Compra X lleva Y" };

function fmtDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

function isExpired(ends_at) {
    if (!ends_at) return false;
    return new Date(ends_at) < new Date();
}

const EMPTY_FORM = {
    name: "", type: "percentage", discount_pct: "", buy_qty: "", get_qty: "",
    starts_at: new Date().toISOString().slice(0, 10), ends_at: "", active: true, product_ids: [],
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

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.promotions.getAll(); setPromos(r.data || []); }
        catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [notify]);

    const loadProducts = useCallback(async () => {
        try {
            const r = await api.products.getAll({ limit: 9999 });
            setAllProducts(r.data?.products || r.data || []);
        } catch (e) { console.error(e); }
    }, []);

    useEffect(() => { load(); loadProducts(); }, [load, loadProducts]);

    const openNew = useCallback(() => { setForm(EMPTY_FORM); setProductSearch(""); setModal("new"); }, []);
    
    useEffect(() => {
        if (triggerNew > 0) openNew();
    }, [triggerNew, openNew]);

    const openEdit = (p) => {
        setForm({
            name: p.name, type: p.type,
            discount_pct: p.discount_pct ?? "",
            buy_qty: p.buy_qty ?? "",
            get_qty: p.get_qty ?? "",
            starts_at: p.starts_at ? p.starts_at.slice(0, 10) : "",
            ends_at: p.ends_at ? p.ends_at.slice(0, 10) : "",
            active: p.active,
            product_ids: (p.Products || []).map(pr => pr.id),
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
        setSaving(true);
        try {
            const body = {
                name: form.name.trim(),
                type: form.type,
                discount_pct: form.type === "percentage" ? parseFloat(form.discount_pct) : null,
                buy_qty: form.type === "buy_x_get_y" ? parseInt(form.buy_qty) : null,
                get_qty: form.type === "buy_x_get_y" ? parseInt(form.get_qty) : null,
                starts_at: form.starts_at,
                ends_at: form.ends_at || null,
                active: form.active,
                product_ids: form.product_ids,
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

    const filteredProducts = allProducts.filter(p =>
        p.name.toLowerCase().includes(productSearch.toLowerCase())
    );

    return (
        <>
            <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
                    {promos.length} promoción{promos.length !== 1 ? "es" : ""}
                </span>
            </div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 animate-pulse">Cargando…</div>
                ) : promos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 opacity-40">Sin promociones registradas</div>
                    </div>
                ) : (
                    <div className="card-premium overflow-auto flex-1">
                        <table className="w-full text-left border-collapse min-w-[640px]">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-surface-2 dark:bg-surface-dark-2">
                                    {["Nombre", "Tipo", "Detalle", "Productos", "Vigencia", "Estado", "Acciones"].map(h => (
                                        <th key={h} className={`px-4 py-3 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : ""}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                {promos.map(p => {
                                    const expired = isExpired(p.ends_at);
                                    const statusLabel = !p.active ? "Inactiva" : expired ? "Vencida" : "Activa";
                                    const statusClass = !p.active || expired
                                        ? "bg-surface-3 text-content-muted border-border dark:bg-white/5 dark:text-white/30 dark:border-white/10"
                                        : "bg-success/10 text-success border-success/20";
                                    return (
                                        <tr key={p.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                            <td className="px-4 py-3">
                                                <span className="text-[13px] font-black text-content dark:text-white">{p.name}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40">{TYPE_LABELS[p.type] || p.type}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {p.type === "percentage" && (
                                                    <span className="text-[12px] font-black text-brand-500">{p.discount_pct}% OFF</span>
                                                )}
                                                {p.type === "buy_x_get_y" && (
                                                    <span className="text-[12px] font-black text-brand-500">Compra {p.buy_qty} lleva {p.get_qty} gratis</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">{(p.Products || []).length}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-[11px] font-bold text-content-subtle dark:text-white/40">
                                                    <div>{fmtDate(p.starts_at)}</div>
                                                    {p.ends_at && <div className="opacity-60">→ {fmtDate(p.ends_at)}</div>}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`text-[10px] font-black px-2 py-1 rounded-lg border ${statusClass}`}>{statusLabel}</span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {can("products") && (
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button onClick={() => openEdit(p)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black transition-all" title="Editar">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button onClick={() => setDeleteDialog(p)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all" title="Eliminar">
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
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
                )}
            </div>

            <Modal open={!!modal} onClose={() => setModal(false)} title={modal === "new" ? "Nueva Promoción" : "Editar Promoción"} width={520}>
                <div className="space-y-4">
                    {/* Nombre */}
                    <div>
                        <label className="label">NOMBRE *</label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: 10% en lácteos esta semana" className="input" autoFocus />
                    </div>

                    {/* Tipo */}
                    <div>
                        <label className="label">TIPO *</label>
                        <div className="flex gap-2">
                            {[{ v: "percentage", l: "Porcentaje" }, { v: "buy_x_get_y", l: "Compra X lleva Y gratis" }].map(opt => (
                                <button key={opt.v} onClick={() => setForm(p => ({ ...p, type: opt.v }))}
                                    className={`flex-1 py-2 rounded-xl text-[11px] font-black border transition-all ${form.type === opt.v ? "bg-brand-500 text-white border-brand-500" : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:border-brand-500/40"}`}>
                                    {opt.l}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Campos según tipo */}
                    {form.type === "percentage" && (
                        <div>
                            <label className="label">DESCUENTO % *</label>
                            <div className="relative">
                                <input type="number" min="0.01" max="100" step="0.01" value={form.discount_pct} onChange={e => setForm(p => ({ ...p, discount_pct: e.target.value }))} placeholder="10" className="input pr-8" />
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-black text-content-subtle">%</span>
                            </div>
                        </div>
                    )}
                    {form.type === "buy_x_get_y" && (
                        <div className="flex gap-3">
                            <div className="flex-1">
                                <label className="label">COMPRA (N) *</label>
                                <input type="number" min="1" value={form.buy_qty} onChange={e => setForm(p => ({ ...p, buy_qty: e.target.value }))} placeholder="3" className="input" />
                            </div>
                            <div className="flex-1">
                                <label className="label">LLEVA GRATIS (M) *</label>
                                <input type="number" min="1" value={form.get_qty} onChange={e => setForm(p => ({ ...p, get_qty: e.target.value }))} placeholder="1" className="input" />
                            </div>
                        </div>
                    )}

                    {/* Fechas */}
                    <div className="flex gap-3">
                        <div className="flex-1">
                            <label className="label">DESDE *</label>
                            <input type="date" value={form.starts_at} onChange={e => setForm(p => ({ ...p, starts_at: e.target.value }))} className="input" />
                        </div>
                        <div className="flex-1">
                            <label className="label">HASTA (opcional)</label>
                            <input type="date" value={form.ends_at} onChange={e => setForm(p => ({ ...p, ends_at: e.target.value }))} className="input" />
                        </div>
                    </div>

                    {/* Activo */}
                    <div className="flex items-center gap-3">
                        <button onClick={() => setForm(p => ({ ...p, active: !p.active }))}
                            className={`w-10 h-6 rounded-full transition-all relative ${form.active ? "bg-brand-500" : "bg-surface-3 dark:bg-white/10"}`}>
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all ${form.active ? "translate-x-4" : ""}`} />
                        </button>
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">
                            {form.active ? "Activa" : "Inactiva"}
                        </span>
                    </div>

                    {/* Selector de productos */}
                    <div>
                        <label className="label">PRODUCTOS * ({form.product_ids.length} seleccionados)</label>
                        <input
                            type="text"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Buscar producto..."
                            className="input mb-2"
                        />
                        <div className="max-h-48 overflow-y-auto border border-border/20 dark:border-white/5 rounded-xl divide-y divide-border/10 dark:divide-white/5">
                            {filteredProducts.length === 0 ? (
                                <div className="px-3 py-4 text-[11px] text-center text-content-subtle dark:text-white/30">Sin resultados</div>
                            ) : filteredProducts.map(prod => {
                                const checked = form.product_ids.includes(prod.id);
                                return (
                                    <button key={prod.id} onClick={() => toggleProduct(prod.id)}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all ${checked ? "bg-brand-500/5" : "hover:bg-surface-2 dark:hover:bg-white/5"}`}>
                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? "bg-brand-500 border-brand-500" : "border-border dark:border-white/20"}`}>
                                            {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                        </div>
                                        <span className="text-[12px] font-bold text-content dark:text-white truncate">{prod.name}</span>
                                        <span className="text-[10px] text-content-subtle dark:text-white/30 ml-auto shrink-0">{prod.Category?.name || ""}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-border/10 dark:border-white/5 mt-4">
                    <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : modal === "new" ? "Crear" : "Guardar"}</Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteDialog}
                title="¿Eliminar Promoción?"
                message={`¿Seguro que deseas eliminar "${deleteDialog?.name}"?`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteDialog(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </>
    );
}
