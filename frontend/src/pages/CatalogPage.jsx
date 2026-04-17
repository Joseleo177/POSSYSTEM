import { useState, useEffect } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { useDebounce } from "../hooks/useDebounce";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";
import ProductTable from "../components/Catalog/ProductTable";
import CategoriesTab from "../components/Catalog/CategoriesTab";
import ProductModal from "../components/ProductModal";
import PriceLabelsView from "../components/Catalog/PriceLabelsView";

const TABS = [
    { id: "products",   label: "Productos" },
    { id: "categories", label: "Categorías" },
];

export default function CatalogPage() {
    const { employee } = useApp();
    const {
        products, search, setSearch, loadProducts, can,
        categories, notify, loading,
        page, totalProducts, limit,
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
    const [showWarehouse, setShowWarehouse] = useState(false);
    const [showFilters, setShowFilters] = useState(false);

    const availableWarehouses = employee?.warehouses || [];
    const [warehouseId, setWarehouseId] = useState(() => availableWarehouses[0]?.id ?? null);

    useEffect(() => {
        if (warehouseId) loadProducts(1, warehouseId);
    }, [debouncedSearch, warehouseId, loadProducts, filterCategory, filterType]);

    const selectedWarehouseName = availableWarehouses.find(w => w.id === warehouseId)?.name;
    const totalPages = Math.ceil(totalProducts / limit);

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
        const allSelected = pageIds.every(id => selectedProducts.find(x => x.id === id));
        if (allSelected) {
            setSelectedProducts(prev => prev.filter(p => !pageIds.includes(p.id)));
        } else {
            const toAdd = products.filter(p => !selectedProducts.find(x => x.id === p.id));
            setSelectedProducts(prev => [...prev, ...toAdd]);
        }
    };

    // ── Subheader: tabs ───────────────────────────────────────
    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5">
            {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={["px-4 py-2 text-[11px] font-black uppercase tracking-wide border-b-2 transition-all",
                        activeTab === tab.id ? "border-brand-500 text-brand-500" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                    ].join(" ")}>
                    {tab.label}
                </button>
            ))}
        </div>
    );

    // ── Actions del header ────────────────────────────────────
    const actions = (
        <>
            {selectedProducts.length > 0 && (
                <Button onClick={() => setPrintingLabels(true)} variant="ghost" className="h-8 px-3 text-[10px] shadow-none bg-info/10 text-info border border-info/30 hover:bg-info hover:text-black">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Imprimir ({selectedProducts.length})
                </Button>
            )}
            <Button onClick={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedProducts([]); }} variant="ghost"
                className={`h-8 px-3 text-[10px] shadow-none border ${isSelectionMode ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 text-content-subtle border-white/5 hover:bg-white/10"}`}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {isSelectionMode ? "Cancelar" : "Seleccionar"}
            </Button>
            {activeTab === "products" && can("products") && (
                <Button onClick={() => { setProductEditData(null); setProductModal(true); }} className="h-8 px-3 text-[10px] shadow-none">
                    + Nuevo Producto
                </Button>
            )}
        </>
    );

    return (
        <Page module="Módulo" title="Catálogo" subheader={subheader} actions={actions}>

            {/* Tab: Productos */}
            {activeTab === "products" && (
                <>
                    {/* Barra de herramientas */}
                    <div className="shrink-0 py-2 flex flex-wrap items-center gap-2 border-b border-border/20 dark:border-white/5">
                        {/* Buscador */}
                        <div className="relative flex-1 min-w-[180px] max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} className="input h-9 pl-9 text-[11px] w-full" placeholder="Buscar producto..." />
                        </div>

                        {/* Selector de almacén */}
                        <div className="relative">
                            <button onClick={() => { setShowWarehouse(!showWarehouse); setShowFilters(false); }}
                                className={`h-9 px-3 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${warehouseId ? "bg-brand-500/10 border-brand-500/30 text-brand-500" : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                {selectedWarehouseName || "Almacén"}
                                <svg className={`w-3 h-3 transition-transform ${showWarehouse ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showWarehouse && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowWarehouse(false)} />
                                    <div className="absolute left-0 top-full mt-2 w-52 bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-2 px-1">Almacén</div>
                                        <div className="space-y-0.5">
                                            {availableWarehouses.map(w => (
                                                <button key={w.id} onClick={() => { setWarehouseId(w.id); setShowWarehouse(false); }}
                                                    className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center justify-between ${warehouseId === w.id ? "bg-brand-500 text-black" : "hover:bg-brand-500/10 text-content-subtle hover:text-brand-500"}`}>
                                                    {w.name}
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
                            <button onClick={() => { setShowFilters(!showFilters); setShowWarehouse(false); }}
                                className={`h-9 px-3 flex items-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${activeFilterCount > 0 ? "bg-warning/10 border-warning/30 text-warning" : "bg-surface-2 dark:bg-white/5 border-border/40 dark:border-white/10 text-content-subtle hover:text-content"}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                                Filtros
                                {activeFilterCount > 0 && <span className="w-4 h-4 rounded-full bg-warning text-black text-[9px] font-black flex items-center justify-center">{activeFilterCount}</span>}
                                <svg className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showFilters && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                                    <div className="absolute right-0 top-full mt-2 w-64 bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-4 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Categoría</div>
                                            <div className="space-y-0.5">
                                                <button onClick={() => setFilterCategory("")} className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${!filterCategory ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"}`}>Todas</button>
                                                {categories.map(c => (
                                                    <button key={c.id} onClick={() => setFilterCategory(String(c.id))} className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-bold transition-all flex items-center gap-2 ${filterCategory === String(c.id) ? "bg-brand-500 text-black" : "hover:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color || "#fabd2f" }} />
                                                        {c.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Tipo</div>
                                            <div className="grid grid-cols-2 gap-1">
                                                {[{ value: "", label: "Todos" }, { value: "normal", label: "Normal" }, { value: "service", label: "Servicio" }, { value: "combo", label: "Combo" }].map(opt => (
                                                    <button key={opt.value} onClick={() => setFilterType(opt.value)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterType === opt.value ? "bg-brand-500 text-black" : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"}`}>
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

                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="card-premium overflow-auto flex-1">
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
                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            total={totalProducts}
                            limit={limit}
                            onPageChange={(p) => loadProducts(p, warehouseId)}
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

            {printingLabels && (
                <div id="print-section">
                    <PriceLabelsView products={selectedProducts} onClose={() => setPrintingLabels(false)} />
                </div>
            )}
        </Page>
    );
}
