import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import { LedgerSkeleton, LedgerEmpty } from "../ui/Ledger";
import { resolveImageUrl, toNameCase } from "../../helpers";
import { useApp } from "../../context/AppContext";

// Colores listos para elegir de un toque. El selector nativo abría una rueda de color donde
// cada quien inventaba un tono distinto y el catálogo terminaba con cinco verdes casi
// iguales; con la paleta los colores quedan separados entre sí. "Otro" sigue abriendo el
// selector para quien necesite el tono exacto de su marca.
const PALETA = [
    "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899",
    "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#14b8a6", "#64748b",
];
const COLOR_INICIAL = PALETA[0];

// Muestra de la categoría: su foto si tiene, si no el color con la inicial.
function Muestra({ color, image, name, size = "w-9 h-9", text = "text-[14px]" }) {
    if (image) return <img src={image} alt="" className={`${size} rounded-xl object-cover shrink-0`} />;
    return (
        <span className={`${size} rounded-xl shrink-0 flex items-center justify-center font-bold text-white ${text}`}
            style={{ backgroundColor: color || COLOR_INICIAL }}>
            {(name || "?").trim().charAt(0).toUpperCase() || "?"}
        </span>
    );
}

export default function CategoriesTab({ notify, can, triggerNew }) {
    const { company } = useApp();
    const catalogEnabled = !!company?.catalog_enabled;
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(false);       // false | "new" | {id, name, color}
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [form, setForm] = useState({ name: "", color: COLOR_INICIAL, short_description: "" });
    const [saving, setSaving] = useState(false);
    const [q, setQ] = useState("");
    // Foto de la categoría: solo la usa la vitrina pública. `file` es la nueva elegida y
    // `clearImage` marca que se quitó la que había — no mandar archivo es lo que pasa en
    // cualquier guardado normal, así que no puede significar "bórrala".
    const [image, setImage] = useState({ file: null, current: null, clearImage: false });

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.categories.getAll(); setCategories(r.data || []); }
        catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const openNew  = useCallback(() => {
        setForm({ name: "", color: COLOR_INICIAL, short_description: "" });
        setImage({ file: null, current: null, clearImage: false });
        setModal("new");
    }, []);

    // Solo abre el modal cuando el contador CAMBIA, no cuando ya viene alto.
    // CatalogPage monta esta pestaña únicamente mientras está activa, así que al ir a
    // Productos y volver, el componente se remonta con triggerNew ya en 1 y la condición
    // `> 0` disparaba el modal sola.
    const lastTrigger = useRef(triggerNew);
    useEffect(() => {
        if (triggerNew !== lastTrigger.current) {
            lastTrigger.current = triggerNew;
            openNew();
        }
    }, [triggerNew, openNew]);

    const openEdit = (cat) => {
        setForm({ name: cat.name, color: cat.color || COLOR_INICIAL, short_description: cat.short_description || "" });
        setImage({ file: null, current: cat.image_url || null, clearImage: false });
        setModal(cat);
    };

    const save = async () => {
        if (!form.name.trim()) return notify("El nombre es requerido", "err");
        setSaving(true);
        try {
            if (modal === "new") {
                await api.categories.create(form, image.file);
                notify("Categoría creada");
            } else {
                await api.categories.update(modal.id, form, image.file, image.clearImage);
                notify("Categoría actualizada");
            }
            setModal(false);
            load();
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

    // La elegida ahora manda sobre la guardada: así se ve qué se va a reemplazar antes de
    // guardar, y "Quitar foto" deja el recuadro vacío aunque la categoría todavía tenga una.
    const imgPreview = image.file ? URL.createObjectURL(image.file) : (image.clearImage ? null : resolveImageUrl(image.current));

    const confirmDelete = async () => {
        try {
            await api.categories.remove(deleteDialog.id);
            notify("Categoría eliminada");
            setDeleteDialog(null);
            load();
        } catch (e) { notify(e.message, "err"); }
    };

    // Peso de cada categoría en el catálogo: la barra deja ver de un vistazo dónde está el grueso.
    const totalProductos = categories.reduce((a, c) => a + (parseInt(c.product_count) || 0), 0);
    const filtro = q.trim().toLowerCase();
    const visibles = filtro ? categories.filter(c => c.name.toLowerCase().includes(filtro)) : categories;
    const colorPropio = !PALETA.includes((form.color || "").toLowerCase());
    const puedeEditar = can("products.edit");

    return (
        <>
            <div className="shrink-0 px-4 py-2.5 border-b border-border/60 dark:border-white/[0.06] flex items-center justify-between gap-3">
                <span className="text-[13px] text-content-subtle">
                    <span className="font-semibold text-content dark:text-white tabular-nums">{categories.length}</span> {categories.length === 1 ? "categoría" : "categorías"}
                    {totalProductos > 0 && <> · <span className="tabular-nums">{totalProductos}</span> productos clasificados</>}
                </span>
                {/* Con pocas categorías el buscador sobra: se ven todas de un vistazo. */}
                {categories.length > 8 && (
                    <div className="relative w-56">
                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar categoría…" className="input h-9 pl-9 w-full" autoComplete="off" spellCheck={false} />
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-auto py-3">
                <div className="card-premium overflow-auto">
                    <table className="table-ledger min-w-[560px]">
                        <thead className="sticky top-0 z-10">
                            <tr>
                                <th className="pl-4">Categoría</th>
                                <th className="w-[42%]">Productos</th>
                                <th className="w-[96px] pr-4" />
                            </tr>
                        </thead>
                        <tbody>
                            {loading && categories.length === 0 ? <LedgerSkeleton cols={3} rows={5} />
                                : visibles.length === 0 ? (
                                    <LedgerEmpty cols={3}
                                        title={filtro ? "Ninguna categoría coincide" : "Todavía no hay categorías"}
                                        hint={filtro ? `No hay categorías con «${q}».` : "Agrupan los productos en el catálogo, el POS y los reportes."}
                                        onClear={filtro ? () => setQ("") : undefined} />
                                ) : visibles.map(cat => {
                                    const n = parseInt(cat.product_count) || 0;
                                    const pct = totalProductos > 0 ? (n / totalProductos) * 100 : 0;
                                    return (
                                        <tr key={cat.id}>
                                            <td className="pl-4">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <Muestra color={cat.color} name={cat.name} image={cat.image_url ? resolveImageUrl(cat.image_url) : null} />
                                                    <div className="min-w-0">
                                                        <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(cat.name)}</div>
                                                        {cat.short_description && (
                                                            <div className="text-[12px] text-content-subtle truncate">{cat.short_description}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    <span className="w-10 text-[13px] font-semibold tabular-nums text-content dark:text-white text-right shrink-0">{n}</span>
                                                    <div className="flex-1 max-w-[220px] h-1.5 rounded-full bg-surface-3 dark:bg-white/[0.06] overflow-hidden">
                                                        <div className="h-full rounded-full" style={{ width: `${Math.max(pct, n > 0 ? 2 : 0)}%`, backgroundColor: cat.color || COLOR_INICIAL }} />
                                                    </div>
                                                    <span className="text-[12px] text-content-subtle tabular-nums w-10 shrink-0">{n > 0 ? `${Math.round(pct)} %` : "—"}</span>
                                                </div>
                                            </td>
                                            <td className="pr-4 text-right">
                                                {puedeEditar && (
                                                    <div className="inline-flex items-center gap-0.5">
                                                        <button onClick={() => openEdit(cat)} className="row-icon" title="Editar" aria-label="Editar categoría">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                                        </button>
                                                        <button onClick={() => setDeleteDialog(cat)} className="row-icon hover:!text-red-600 dark:hover:!text-red-400 hover:!bg-red-500/10" title="Eliminar" aria-label="Eliminar categoría">
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

            <Modal open={!!modal} onClose={() => setModal(false)} title={modal === "new" ? "Nueva categoría" : "Editar categoría"} width={420}>
                <div className="space-y-5">
                    {/* Vista previa: cómo se verá la categoría en las listas. */}
                    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface-2 dark:bg-white/[0.04]">
                        <Muestra color={form.color} name={form.name} image={imgPreview} size="w-11 h-11" text="text-[17px]" />
                        <div className="min-w-0">
                            <div className={`text-[15px] font-semibold truncate ${form.name.trim() ? "text-content dark:text-white" : "text-content-subtle"}`}>
                                {form.name.trim() ? toNameCase(form.name.trim()) : "Nombre de la categoría"}
                            </div>
                            <div className="text-[12px] text-content-subtle truncate">
                                {form.short_description.trim() || (modal === "new" ? "Nueva categoría" : `${modal?.product_count ?? 0} productos`)}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="label">Nombre <span className="text-red-500">*</span></label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Ej: Bebidas, Lácteos…" className="input h-10" autoFocus autoComplete="off"
                            onKeyDown={e => e.key === "Enter" && save()} />
                    </div>

                    <div>
                        <label className="label">Color</label>
                        <div className="flex flex-wrap items-center gap-2">
                            {PALETA.map(c => {
                                const on = (form.color || "").toLowerCase() === c;
                                return (
                                    <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                                        title={c} aria-label={`Color ${c}`} aria-pressed={on}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform active:scale-90 ${on ? "ring-2 ring-offset-2 ring-content dark:ring-white ring-offset-white dark:ring-offset-surface-dark-2" : "hover:scale-110"}`}
                                        style={{ backgroundColor: c }}>
                                        {on && <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </button>
                                );
                            })}
                            {/* Tono propio: el selector nativo, escondido tras un botón del mismo tamaño. */}
                            <label title="Otro color" className={`relative w-8 h-8 rounded-full cursor-pointer flex items-center justify-center border-[1.5px] border-dashed transition-transform hover:scale-110 ${colorPropio ? "ring-2 ring-offset-2 ring-content dark:ring-white ring-offset-white dark:ring-offset-surface-dark-2 border-transparent" : "border-content-subtle/50 text-content-subtle"}`}
                                style={colorPropio ? { backgroundColor: form.color } : undefined}>
                                {colorPropio
                                    ? <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14M5 12h14" /></svg>}
                                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="absolute inset-0 opacity-0 cursor-pointer" />
                            </label>
                        </div>
                    </div>

                    {/* Frase corta y foto no sirven de nada sin el catálogo público (extra
                        que enciende el superusuario por empresa, ver CompanyModal): la
                        primera se ve en los mosaicos del tema de menú y la segunda en la
                        sección de categorías de la vitrina — ninguna de las dos existe si
                        esta empresa no tiene esa vitrina. */}
                    {catalogEnabled && (
                        <div className="pt-4 border-t border-border/60 dark:border-white/[0.06] space-y-4">
                            <div className="text-[13px] font-semibold text-content dark:text-white">
                                Catálogo público <span className="font-normal text-content-subtle">· opcional</span>
                            </div>
                            <div>
                                <label className="label">Frase corta</label>
                                <input
                                    type="text"
                                    value={form.short_description}
                                    onChange={e => setForm(p => ({ ...p, short_description: e.target.value }))}
                                    placeholder="Ej: Shawarmas y pepi shawarmas"
                                    maxLength={160}
                                    className="input h-10"
                                    autoComplete="off"
                                />
                                <p className="text-[12px] text-content-subtle mt-1.5">Se ve bajo el nombre en los mosaicos del tema de menú.</p>
                            </div>
                            <div>
                                <label className="label">Foto</label>
                                <div className="flex items-center gap-3">
                                    <label className="cursor-pointer group shrink-0">
                                        <div className="w-20 h-20 rounded-xl overflow-hidden border-[1.5px] border-dashed border-border dark:border-white/15 bg-surface-2 dark:bg-white/[0.04] flex items-center justify-center group-hover:border-brand-500/60 transition-colors">
                                            {imgPreview
                                                ? <img src={imgPreview} alt="" className="w-full h-full object-cover" />
                                                : <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                        </div>
                                        <input type="file" accept="image/*" className="hidden"
                                            onChange={e => e.target.files[0] && setImage(p => ({ ...p, file: e.target.files[0], clearImage: false }))} />
                                    </label>
                                    <div className="min-w-0 text-[12px] text-content-subtle leading-relaxed">
                                        Se ve en la vitrina pública, en la sección de categorías.
                                        {imgPreview && (
                                            <button type="button"
                                                onClick={() => setImage({ file: null, current: null, clearImage: true })}
                                                className="block mt-1 text-[12px] font-medium text-content-muted dark:text-white/60 hover:text-red-600 dark:hover:text-red-400 transition-colors">
                                                Quitar foto
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                    <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : modal === "new" ? "Crear categoría" : "Guardar cambios"}</Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteDialog}
                title="¿Eliminar categoría?"
                message={`¿Seguro que deseas eliminar "${deleteDialog?.name}"? Los productos quedarán sin categoría.`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteDialog(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </>
    );
}
