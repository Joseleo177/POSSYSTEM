import { useState, useEffect, useCallback } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { Button } from "../components/ui/Button";
import ProductTable from "../components/Catalog/ProductTable";
import ProductModal from "../components/ProductModal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Modal from "../components/ui/Modal";
import { useDebounce } from "../hooks/useDebounce";
import { api } from "../services/api";

const TABS = [
    { id: "products", label: "Productos" },
    { id: "categories", label: "Categorías" },
];

// ── Tab Categorías ────────────────────────────────────────────
function CategoriesTab({ notify, can }) {
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(false);
    const [modal, setModal] = useState(false);      // false | "new" | {id, name, color}
    const [deleteDialog, setDeleteDialog] = useState(null);
    const [form, setForm] = useState({ name: "", color: "#fabd2f" });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await api.categories.getAll(); setCategories(r.data || []); }
        catch (e) { notify(e.message, "err"); }
        finally { setLoading(false); }
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setForm({ name: "", color: "#fabd2f" }); setModal("new"); };
    const openEdit = (cat) => { setForm({ name: cat.name, color: cat.color || "#fabd2f" }); setModal(cat); };

    const save = async () => {
        if (!form.name.trim()) return notify("El nombre es requerido", "err");
        setSaving(true);
        try {
            if (modal === "new") {
                await api.categories.create(form);
                notify("Categoría creada");
            } else {
                await api.categories.update(modal.id, form);
                notify("Categoría actualizada");
            }
            setModal(false);
            load();
        } catch (e) { notify(e.message, "err"); }
        finally { setSaving(false); }
    };

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
                {can("products") && (
                    <Button onClick={openNew} className="h-8 px-3 text-[10px] shadow-none">
                        + Nueva Categoría
                    </Button>
                )}
            </div>

            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 animate-pulse">
                        Cargando…
                    </div>
                ) : categories.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-2 text-center">
                        <div className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 opacity-40">
                            Sin categorías registradas
                        </div>
                    </div>
                ) : (
                    <div className="card-premium overflow-auto flex-1">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 z-10">
                                <tr className="bg-surface-2 dark:bg-surface-dark-2">
                                    {["Color", "Nombre", "Productos", "Acciones"].map(h => (
                                        <th key={h} className={`px-4 py-3 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/30 border-b border-border/40 dark:border-white/5 ${h === "Acciones" ? "text-right" : ""}`}>
                                            {h}
                                        </th>
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
                                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">
                                                {cat.product_count ?? "—"}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {can("products") && (
                                                    <>
                                                        <button
                                                            onClick={() => openEdit(cat)}
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand-500/10 text-brand-500 border border-brand-500/20 hover:bg-brand-500 hover:text-black transition-all"
                                                            title="Editar"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteDialog(cat)}
                                                            className="w-7 h-7 rounded-lg flex items-center justify-center bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                                                            title="Eliminar"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal nueva/editar categoría */}
            <Modal open={!!modal} onClose={() => setModal(false)} title={modal === "new" ? "Nueva Categoría" : "Editar Categoría"} width={360}>
                <div className="space-y-3">
                    <div>
                        <label className="label">NOMBRE *</label>
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                            placeholder="Ej: Bebidas, Lácteos..."
                            className="input"
                            autoFocus
                            onKeyDown={e => e.key === "Enter" && save()}
                        />
                    </div>
                    <div>
                        <label className="label">COLOR</label>
                        <div className="flex items-center gap-3">
                            <input
                                type="color"
                                value={form.color}
                                onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                                className="w-10 h-10 rounded-lg border border-border/30 dark:border-white/10 cursor-pointer bg-transparent"
                            />
                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/30 uppercase tracking-wide">{form.color}</span>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border/10 dark:border-white/5 mt-4">
                    <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
                    <Button onClick={save} disabled={saving}>
                        {saving ? "Guardando..." : modal === "new" ? "Crear" : "Guardar"}
                    </Button>
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

// ── Página principal ──────────────────────────────────────────
export default function CatalogPage() {
    const { products, search, setSearch, loadProducts, can, categories, notify, loading } = useCatalog();
    const debouncedSearch = useDebounce(search, 400);

    const [activeTab, setActiveTab] = useState("products");
    const [productModal, setProductModal] = useState(false);
    const [productEditData, setProductEditData] = useState(null);
    const [deleteProductDialog, setDeleteProductDialog] = useState(null);

    useEffect(() => { loadProducts(); }, [debouncedSearch]);

    const saveProduct = async (form, imageFile) => {
        try {
            if (productEditData) {
                await api.products.update(productEditData.id, form, imageFile);
                notify("Producto actualizado");
            } else {
                await api.products.create(form, imageFile);
                notify("Producto creado");
            }
            setProductModal(false);
            loadProducts();
        } catch (e) { notify(e.message, "err"); }
    };

    const confirmDelete = async () => {
        try {
            await api.products.remove(deleteProductDialog);
            notify("Producto eliminado");
            setDeleteProductDialog(null);
            loadProducts();
        } catch (e) { notify(e.message, "err"); }
    };

    return (
        <div className="h-full flex flex-col bg-transparent">

            {/* Header */}
            <div className="shrink-0 px-4 pt-3 pb-0 border-b border-border/30 dark:border-white/5">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Módulo</div>
                        <h1 className="text-sm font-black uppercase tracking-tight text-content dark:text-white">Catálogo</h1>
                    </div>
                    {activeTab === "products" && can("products") && (
                        <Button onClick={() => { setProductEditData(null); setProductModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
                            + Nuevo Producto
                        </Button>
                    )}
                </div>

                {/* Tabs */}
                <div className="flex gap-1">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={[
                                "px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all",
                                activeTab === tab.id
                                    ? "border-brand-500 text-brand-500"
                                    : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                            ].join(" ")}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab: Productos */}
            {activeTab === "products" && (
                <>
                    <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5">
                        <div className="relative max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input h-8 pl-8 text-[11px] w-full"
                                placeholder="Buscar producto..."
                            />
                        </div>
                    </div>
                    <div className="flex-1 overflow-auto">
                        <ProductTable
                            products={products}
                            canManageProducts={can("products")}
                            openEditProduct={(p) => { setProductEditData(p); setProductModal(true); }}
                            setDeleteProductDialog={setDeleteProductDialog}
                        />
                    </div>
                </>
            )}

            {/* Tab: Categorías */}
            {activeTab === "categories" && (
                <CategoriesTab notify={notify} can={can} />
            )}

            <ProductModal
                open={productModal}
                onClose={() => setProductModal(false)}
                onSave={saveProduct}
                editData={productEditData}
                categories={categories}
                loading={loading}
            />

            <ConfirmModal
                isOpen={!!deleteProductDialog}
                title="¿Eliminar Producto?"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteProductDialog(null)}
                type="danger"
            />
        </div>
    );
}
