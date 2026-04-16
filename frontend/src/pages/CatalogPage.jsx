import { useState, useEffect, useCallback } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { Button } from "../components/ui/Button";
import ProductTable from "../components/Catalog/ProductTable";
import ProductModal from "../components/ProductModal";
import ConfirmModal from "../components/ui/ConfirmModal";
import Modal from "../components/ui/Modal";
import { useDebounce } from "../hooks/useDebounce";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import PriceLabelsView from "../components/Catalog/PriceLabelsView";

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
    const { employee } = useApp();
    const {
        products, search, setSearch, loadProducts, can,
        categories, notify, loading,
        page, setPage, totalProducts, limit,
        filterCategory, setFilterCategory,
        filterType, setFilterType,
        activeFilterCount, clearFilters,
    } = useCatalog();
    const debouncedSearch = useDebounce(search, 400);

    const [activeTab, setActiveTab] = useState("products");
    const [productModal, setProductModal] = useState(false);
    const [productEditData, setProductEditData] = useState(null);
    const [deleteProductDialog, setDeleteProductDialog] = useState(null);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [printingLabels, setPrintingLabels] = useState(false);
    const [isSelectionMode, setIsSelectionMode] = useState(false);

    // Almacenes con acceso (solo los que el empleado tiene asignados)
    const availableWarehouses = employee?.warehouses || [];

    // Dropdowns
    const [showWarehouse, setShowWarehouse] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [warehouseId, setWarehouseId] = useState(() => {
        return availableWarehouses.length > 0 ? availableWarehouses[0].id : null;
    });

    useEffect(() => {
        if (warehouseId) {
            loadProducts(1, warehouseId);
        }
    }, [debouncedSearch, warehouseId, loadProducts, filterCategory, filterType]);

    // Obtener nombre del almacén seleccionado
    const selectedWarehouseName = availableWarehouses.find(w => w.id === warehouseId)?.name;

    const totalPages = Math.ceil(totalProducts / limit);
    const startItem = (page - 1) * limit + 1;
    const endItem = Math.min(page * limit, totalProducts);

    const saveProduct = async (form, imageFile, removeImage) => {
        try {
            if (productEditData) {
                await api.products.update(productEditData.id, form, imageFile, removeImage);
                notify("Producto actualizado");
            } else {
                await api.products.create(form, imageFile);
                notify("Producto creado");
            }
            setProductModal(false);
            loadProducts(page, warehouseId);
        } catch (e) { notify(e.message, "err"); }
    };

    const confirmDelete = async () => {
        try {
            await api.products.remove(deleteProductDialog);
            notify("Producto eliminado");
            setDeleteProductDialog(null);
            loadProducts(page, warehouseId);
        } catch (e) { notify(e.message, "err"); }
    };

    // Handlers para selección masiva
    const toggleSelect = (id) => {
        const product = products.find(p => p.id === id);
        if (!product) return;

        setSelectedProducts(prev => {
            const exists = prev.find(x => x.id === id);
            return exists ? prev.filter(x => x.id !== id) : [...prev, product];
        });
    };

    const selectAll = () => {
        const pageIds = products.map(p => p.id);
        const allPageSelected = pageIds.every(id => selectedProducts.find(x => x.id === id));

        if (allPageSelected) {
            setSelectedProducts(prev => prev.filter(p => !pageIds.includes(p.id)));
        } else {
            const newToAdd = products.filter(p => !selectedProducts.find(x => x.id === p.id));
            setSelectedProducts(prev => [...prev, ...newToAdd]);
        }
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
                    <div className="flex gap-2">
                        {selectedProducts.length > 0 && (
                            <Button 
                                onClick={() => setPrintingLabels(true)} 
                                variant="ghost"
                                className="h-8 px-3 text-[10px] shadow-none bg-info/10 text-info border border-info/30 hover:bg-info hover:text-black"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
                                Imprimir ({selectedProducts.length})
                            </Button>
                        )}
                        
                        <Button 
                            onClick={() => {
                                setIsSelectionMode(!isSelectionMode);
                                if (isSelectionMode) setSelectedProducts([]); // Limpiar al salir
                            }} 
                            variant="ghost"
                            className={`h-8 px-3 text-[10px] shadow-none border ${isSelectionMode ? 'bg-brand-500 text-black border-brand-500' : 'bg-surface-3 dark:bg-white/5 text-content-subtle border-white/5 hover:bg-white/10'}`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            {isSelectionMode ? 'Cancelar Selección' : 'Seleccionar'}
                        </Button>

                        {activeTab === "products" && can("products") && (
                            <Button onClick={() => { setProductEditData(null); setProductModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
                                + Nuevo Producto
                            </Button>
                        )}
                    </div>
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
                    <div className="shrink-0 px-4 py-3 border-b border-border/20 dark:border-white/5 flex flex-wrap items-center gap-2">
                        {/* Buscador */}
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input h-9 pl-9 text-[11px] w-full"
                                placeholder="Buscar producto..."
                            />
                        </div>

                        {/* Almacén */}
                        <div className="relative">
                            <button
                                onClick={() => { setShowWarehouse(!showWarehouse); setShowFilters(false); }}
                                className={`h-9 px-3 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${warehouseId ? 'bg-brand-500/10 border-brand-500/30 text-brand-500' : 'bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle'}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                <span>{selectedWarehouseName || 'Almacén'}</span>
                                <svg className={`w-3 h-3 transition-transform duration-200 ${showWarehouse ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showWarehouse && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowWarehouse(false)} />
                                    <div className="absolute left-0 top-full mt-2 w-52 bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-2 px-1">Almacén</div>
                                        <div className="space-y-0.5">
                                            {availableWarehouses.map(w => (
                                                <button
                                                    key={w.id}
                                                    onClick={() => { setWarehouseId(w.id); setShowWarehouse(false); }}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-between ${warehouseId === w.id ? 'bg-brand-500 text-black' : 'hover:bg-brand-500/10 text-content-subtle hover:text-brand-500'}`}
                                                >
                                                    <span>{w.name}</span>
                                                    {warehouseId === w.id && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Filtros */}
                        <div className="relative">
                            <button
                                onClick={() => { setShowFilters(!showFilters); setShowWarehouse(false); }}
                                className={`h-9 px-3 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeFilterCount > 0 ? 'bg-warning/10 border-warning/30 text-warning' : 'bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle hover:text-content'}`}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                                Filtros
                                {activeFilterCount > 0 && (
                                    <span className="w-4 h-4 rounded-full bg-warning text-black text-[9px] font-black flex items-center justify-center">{activeFilterCount}</span>
                                )}
                                <svg className={`w-3 h-3 transition-transform duration-200 ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showFilters && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-4 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">

                                        {/* Categoría */}
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Categoría</div>
                                            <div className="space-y-0.5">
                                                <button onClick={() => setFilterCategory("")} className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${!filterCategory ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white'}`}>Todas</button>
                                                {categories.map(c => (
                                                    <button key={c.id} onClick={() => setFilterCategory(String(c.id))} className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2 ${filterCategory === String(c.id) ? 'bg-brand-500 text-black' : 'hover:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white'}`}>
                                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color || "#fabd2f" }} />
                                                        {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Tipo */}
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Tipo</div>
                                            <div className="grid grid-cols-2 gap-1">
                                                {[
                                                    { value: "", label: "Todos" },
                                                    { value: "normal", label: "Normal" },
                                                    { value: "service", label: "Servicio" },
                                                    { value: "combo", label: "Combo" },
                                                ].map(opt => (
                                                    <button key={opt.value} onClick={() => setFilterType(opt.value)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === opt.value ? 'bg-brand-500 text-black' : 'bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white'}`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {activeFilterCount > 0 && (
                                            <button onClick={() => { clearFilters(); setShowFilters(false); }} className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-danger hover:bg-danger/10 transition-all border border-danger/20">
                                                Limpiar filtros
                                            </button>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 overflow-auto">
                            <ProductTable
                                products={products}
                                canManageProducts={can("products")}
                                openEditProduct={(p) => { setProductEditData(p); setProductModal(true); }}
                                setDeleteProductDialog={setDeleteProductDialog}
                                selectedProducts={selectedProducts.map(p => p.id)}
                                onToggleSelect={toggleSelect}
                                onSelectAll={selectAll}
                                isSelectionMode={isSelectionMode}
                            />
                        </div>

                        {/* Paginación */}
                        {totalPages > 1 && (
                            <div className="shrink-0 px-4 py-2 bg-surface-2 dark:bg-white/[0.02] border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3">
                                <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                                    Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{totalProducts}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button 
                                        disabled={page === 1}
                                        onClick={() => loadProducts(1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        «
                                    </button>
                                    <button 
                                        disabled={page === 1}
                                        onClick={() => loadProducts(page - 1)}
                                        className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        Anterior
                                    </button>
                                    <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                        Página {page} de {totalPages}
                                    </div>
                                    <button 
                                        disabled={page === totalPages}
                                        onClick={() => loadProducts(page + 1)}
                                        className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        Siguiente
                                    </button>
                                    <button 
                                        disabled={page === totalPages}
                                        onClick={() => loadProducts(totalPages)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        »
                                    </button>
                                </div>
                            </div>
                        )}
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

            {/* Modal de Impresión Masiva de Etiquetas */}
            {printingLabels && (
                <div id="print-section">
                    <PriceLabelsView 
                        products={selectedProducts} 
                        onClose={() => setPrintingLabels(false)} 
                    />
                </div>
            )}
        </div>
    );
}
