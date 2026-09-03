import { useState, useCallback, useEffect, useRef } from "react";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import { resolveImageUrl } from "../../helpers";
import { useApp } from "../../context/AppContext";

export default function CategoriesTab({ notify, can, triggerNew }) {
    const { company } = useApp();
    const catalogEnabled = !!company?.catalog_enabled;
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(false);       // false | "new" | {id, name, color}
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [form, setForm] = useState({ name: "", color: "#fabd2f", short_description: "" });
    const [saving, setSaving] = useState(false);
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
        setForm({ name: "", color: "#fabd2f", short_description: "" });
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
        setForm({ name: cat.name, color: cat.color || "#fabd2f", short_description: cat.short_description || "" });
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

    return (
        <>
            <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5 flex items-center justify-between gap-3">
                <span className="text-[11px] font-black text-content-subtle dark:text-white/30 uppercase tracking-wide">
                    {categories.length} categoría{categories.length !== 1 ? "s" : ""}
                </span>
            </div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 animate-pulse">Cargando…</div>
                ) : categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20">Sin categorías registradas</div>
                    </div>
                ) : (
                    <div className="card-premium overflow-auto flex-1">
                        <table className="w-full text-left border-collapse min-w-[520px]">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-surface-2 dark:bg-surface-dark-2">
                                    {["Color", "Nombre", "Productos", "Acciones"].map(h => (
                                        <th key={h} className={`px-4 py-3 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : ""}`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10 dark:divide-white/5">
                                {categories.map(cat => (
                                    <tr key={cat.id} className="group hover:bg-brand-500/[0.02] transition-colors">
                                        <td className="px-4 py-3 w-16">
                                            <div className="w-6 h-6 rounded-md border border-white/10" style={{ background: cat.color || "#fabd2f" }} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[13px] font-black text-content dark:text-white">{cat.name}</span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">{cat.product_count ?? "—"}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {can("products.edit") && (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button onClick={() => openEdit(cat)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black transition-all" title="Editar">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    </button>
                                                    <button onClick={() => setDeleteDialog(cat)} className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all" title="Eliminar">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <Modal open={!!modal} onClose={() => setModal(false)} title={modal === "new" ? "Nueva Categoría" : "Editar Categoría"} width={360}>
                <div className="space-y-3">
                    <div>
                        <label className="label">NOMBRE *</label>
                        <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ej: Bebidas, Lácteos..." className="input" autoFocus onKeyDown={e => e.key === "Enter" && save()} />
                    </div>
                    <div>
                        <label className="label">COLOR</label>
                        <div className="flex items-center gap-3">
                            <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-10 h-10 rounded-lg border border-border/30 dark:border-white/10 cursor-pointer bg-transparent" />
                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/30 uppercase tracking-wide">{form.color}</span>
                        </div>
                    </div>
                    {/* Frase corta y foto no sirven de nada sin el catálogo público (extra
                        que enciende el superusuario por empresa, ver CompanyModal): la
                        primera se ve en los mosaicos del tema de menú y la segunda en la
                        sección de categorías de la vitrina — ninguna de las dos existe si
                        esta empresa no tiene esa vitrina. */}
                    {catalogEnabled && (
                    <>
                    <div>
                        <label className="label">FRASE CORTA (OPCIONAL)</label>
                        <input
                            type="text"
                            value={form.short_description}
                            onChange={e => setForm(p => ({ ...p, short_description: e.target.value }))}
                            placeholder="Ej: Shawarmas y pepi shawarmas"
                            maxLength={160}
                            className="input"
                        />
                        <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-1 leading-relaxed">
                            Se ve bajo el nombre en los mosaicos del tema de menú.
                        </p>
                    </div>
                    <div>
                        <label className="label">FOTO PARA EL CATÁLOGO PÚBLICO</label>
                        <div className="flex items-center gap-3">
                            <label className="cursor-pointer group shrink-0">
                                <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-dashed border-border/40 dark:border-white/10 bg-surface-2 dark:bg-white/5 flex items-center justify-center group-hover:border-brand-500/50 transition-all">
                                    {imgPreview
                                        ? <img src={imgPreview} alt="" className="w-full h-full object-cover" />
                                        : <svg className="w-5 h-5 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                </div>
                                <input type="file" accept="image/*" className="hidden"
                                    onChange={e => e.target.files[0] && setImage(p => ({ ...p, file: e.target.files[0], clearImage: false }))} />
                            </label>
                            <div className="min-w-0">
                                <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 leading-relaxed">
                                    Opcional. Solo se ve en la vitrina pública, en la sección de categorías.
                                </p>
                                {imgPreview && (
                                    <button type="button"
                                        onClick={() => setImage({ file: null, current: null, clearImage: true })}
                                        className="text-[9px] font-black uppercase tracking-widest text-content-subtle hover:text-danger transition-colors mt-1">
                                        Quitar foto
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    </>
                    )}
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border/10 dark:border-white/5 mt-4">
                    <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>{saving ? "Guardando..." : modal === "new" ? "Crear" : "Guardar"}</Button>
                </div>
            </Modal>

            <ConfirmModal
                isOpen={!!deleteDialog}
                title="¿Eliminar Categoría?"
                message={`¿Seguro que deseas eliminar "${deleteDialog?.name}"? Los productos quedarán sin categoría.`}
                onConfirm={confirmDelete}
                onCancel={() => setDeleteDialog(null)}
                type="danger"
                confirmText="Sí, eliminar"
            />
        </>
    );
}
