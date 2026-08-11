import { useState, useEffect } from "react";
import { useCatalog } from "../hooks/useCatalog";
import { useDebounce } from "../hooks/useDebounce";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import { Button } from "../components/ui/Button";
import Pagination from "../components/ui/Pagination";
import ConfirmModal from "../components/ui/ConfirmModal";
import CustomSelect from "../components/ui/CustomSelect";
import ProductTable from "../components/Catalog/ProductTable";
import ProductCards from "../components/Catalog/ProductCards";
import CategoriesTab from "../components/Catalog/CategoriesTab";
import PromotionsTab from "../components/Catalog/PromotionsTab";
import ProductModal from "../components/ProductModal";
import PublicLinkModal from "../components/Catalog/PublicLinkModal";
import PriceLabelsView from "../components/Catalog/PriceLabelsView";

const TABS = [
    { id: "products",   label: "Productos" },
    { id: "categories", label: "Categorías" },
    { id: "promotions", label: "Promociones" },
];

export default function CatalogPage() {
    const { employee, activeCurrencies } = useApp();
    const {
        products, setProducts, search, setSearch, loadProducts, can,
        categories, notify, loading,
        page, totalProducts, limit,
        filterCategory, setFilterCategory,
        filterType, setFilterType,
        filterStock, setFilterStock,
        filterVisible, setFilterVisible,
        activeFilterCount, clearFilters,
    } = useCatalog();
    const debouncedSearch = useDebounce(search, 400);

    const [activeTab, setActiveTab] = useState("products");
    const [productModal, setProductModal] = useState(false);
    const [publicLinkModal, setPublicLinkModal] = useState(false);
    // Vista lista/cuadrícula. Se recuerda entre sesiones: es una preferencia de trabajo,
    // no un filtro, y reiniciarla en cada carga resulta molesto.
    const [viewMode, setViewMode] = useState(() => localStorage.getItem("catalog_view") || "list");
    const [productEditData, setProductEditData] = useState(null);
    const [deleteProductDialog, setDeleteProductDialog] = useState(null);
    const [selectedProducts, setSelectedProducts] = useState([]);
    const [printingLabels, setPrintingLabels] = useState(false);
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [showWarehouse, setShowWarehouse] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [priceCurrency, setPriceCurrency] = useState("base");
    const [triggerNewCategory, setTriggerNewCategory] = useState(0);
    const [triggerNewPromo, setTriggerNewPromo] = useState(0);
    const localCurrency = activeCurrencies.find(c => !c.is_base) ?? null;

    const availableWarehouses = employee?.warehouses || [];
    const [warehouseId, setWarehouseId] = useState(() => availableWarehouses[0]?.id ?? null);

    useEffect(() => {
        if (warehouseId) loadProducts(1, warehouseId);
    }, [debouncedSearch, warehouseId, loadProducts, filterCategory, filterType]);

    useEffect(() => { localStorage.setItem("catalog_view", viewMode); }, [viewMode]);

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

    // Publicar/ocultar en el catálogo público. Se pinta el cambio de inmediato y se
    // revierte si el servidor falla: recargar la página entera por marcar una casilla
    // pierde el scroll justo cuando se están repasando decenas de productos.
    const applyVisibility = async (ids, visible) => {
        const previous = products;
        setProducts(prev => prev.map(p => (ids.includes(p.id) ? { ...p, visible_in_catalog: visible } : p)));
        try {
            await api.products.setCatalogVisibility(ids, visible);
            if (ids.length > 1) {
                notify(visible ? `${ids.length} productos publicados` : `${ids.length} productos ocultados`);
            }
            // Con el filtro de visibilidad activo el producto ya no pertenece a la lista
            // que se está viendo, así que hay que traer la página de nuevo.
            if (filterVisible) loadProducts(page, warehouseId);
        } catch (e) {
            setProducts(previous);
            notify(e.message, "err");
        }
    };

    const bulkVisibility = async (visible) => {
        await applyVisibility(selectedProducts.map(p => p.id), visible);
        setSelectedProducts([]);
        setIsSelectionMode(false);
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

    const actions = (
        <>
            {activeTab === "products" && (
                <>
                    {selectedProducts.length > 0 && (
                        <>
                            <Button onClick={() => setPrintingLabels(true)} variant="ghost" className="h-8 px-2 sm:px-3 text-[10px] shadow-none bg-info/10 text-info border border-info/30 hover:bg-info hover:text-black">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                <span className="hidden sm:inline">Imprimir</span> ({selectedProducts.length})
                            </Button>
                            {can("products") && (
                                <>
                                    <Button onClick={() => bulkVisibility(true)} variant="ghost"
                                        className="h-8 px-2 sm:px-3 text-[10px] shadow-none bg-success/10 text-success border border-success/30 hover:bg-success hover:text-black"
                                        title="Mostrar en el catálogo público">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                        <span className="hidden sm:inline">Publicar</span> ({selectedProducts.length})
                                    </Button>
                                    <Button onClick={() => bulkVisibility(false)} variant="ghost"
                                        className="h-8 px-2 sm:px-3 text-[10px] shadow-none border border-border dark:border-white/10 text-content-subtle hover:text-danger"
                                        title="Quitar del catálogo público">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                        <span className="hidden sm:inline">Ocultar</span>
                                    </Button>
                                </>
                            )}
                        </>
                    )}
                    <Button onClick={() => { setIsSelectionMode(!isSelectionMode); if (isSelectionMode) setSelectedProducts([]); }} variant="ghost"
                        className={`h-8 px-2 sm:px-3 text-[10px] shadow-none border ${isSelectionMode ? "bg-brand-500 text-black border-brand-500" : "bg-surface-3 dark:bg-white/5 text-content-subtle border-white/5 hover:bg-white/10"}`}>
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="hidden sm:inline">{isSelectionMode ? "Cancelar" : "Seleccionar"}</span>
                    </Button>
                    {can("config") && (
                        <Button onClick={() => setPublicLinkModal(true)} variant="ghost"
                            className="h-8 px-2 sm:px-3 text-[10px] shadow-none border border-border dark:border-white/10 text-content-subtle hover:text-brand-500"
                            title="Enlace de solo lectura para clientes">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m8.156-1.328l1.5-1.5a4 4 0 00-5.656-5.656l-3 3a4 4 0 000 5.656" /></svg>
                            <span className="hidden sm:inline">Compartir</span>
                        </Button>
                    )}
                    {can("products") && (
                        <Button onClick={() => { setProductEditData(null); setProductModal(true); }} className="h-8 px-2.5 sm:px-3 text-[10px] shadow-none">
                            + <span className="hidden sm:inline">Nuevo Producto</span><span className="sm:hidden">Nuevo</span>
                        </Button>
                    )}
                </>
            )}

            {activeTab === "categories" && can("products") && (
                <Button onClick={() => setTriggerNewCategory(prev => prev + 1)} className="h-8 px-2.5 sm:px-3 text-[10px] shadow-none">
                    + <span className="hidden sm:inline">Nueva Categoría</span><span className="sm:hidden">Nueva</span>
                </Button>
            )}

            {activeTab === "promotions" && can("products") && (
                <Button onClick={() => setTriggerNewPromo(prev => prev + 1)} className="h-8 px-2.5 sm:px-3 text-[10px] shadow-none">
                    + <span className="hidden sm:inline">Nueva Promoción</span><span className="sm:hidden">Nueva</span>
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
                                    <div className="absolute right-0 top-full mt-2 w-52 max-w-[calc(100vw-2rem)] bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
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
                                    <div className="absolute left-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] bg-surface-2 dark:bg-surface-dark-2 rounded-2xl border border-border/40 dark:border-white/10 shadow-2xl z-40 p-4 animate-in fade-in slide-in-from-top-2 duration-200 space-y-4">
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Categoría</div>
                                            {/* Select y no lista de botones: las categorías las crea el usuario y no
                                                tienen tope, así que en lista el panel de filtros crecía hasta volverse
                                                un scroll dentro de otro scroll. Los demás filtros de abajo sí son
                                                conjuntos fijos y cortos, y ahí el botón sigue siendo un clic menos. */}
                                            <CustomSelect
                                                value={filterCategory}
                                                onChange={setFilterCategory}
                                                height="h-9"
                                                options={[
                                                    { value: "", label: "Todas" },
                                                    ...categories.map(c => ({
                                                        value: String(c.id),
                                                        label: c.name,
                                                        color: c.color || "#fabd2f",
                                                    })),
                                                ]}
                                            />
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
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Stock</div>
                                            <div className="flex flex-col gap-1">
                                                {[
                                                    { value: "",     label: "Todos" },
                                                    { value: "with", label: "Con stock" },
                                                    { value: "no",   label: "Sin stock" },
                                                ].map(opt => (
                                                    <button key={opt.value} onClick={() => setFilterStock(opt.value)}
                                                        className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all text-left ${
                                                            filterStock === opt.value
                                                                ? opt.value === "no" ? "bg-warning text-black" : "bg-brand-500 text-black"
                                                                : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                                        }`}>
                                                        {opt.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-[9px] font-black text-content-subtle uppercase tracking-widest mb-1.5">Catálogo público</div>
                                            <div className="grid grid-cols-3 gap-1">
                                                {[
                                                    { value: "",    label: "Todos" },
                                                    { value: "yes", label: "Público" },
                                                    { value: "no",  label: "Oculto" },
                                                ].map(opt => (
                                                    <button key={opt.value} onClick={() => setFilterVisible(opt.value)}
                                                        className={`px-2 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                                            filterVisible === opt.value
                                                                ? "bg-brand-500 text-black"
                                                                : "bg-surface-3 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                                        }`}>
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

                        {/* Selector de moneda */}
                        {localCurrency && (
                            <div className="flex items-center rounded-xl border border-border/40 dark:border-white/10 overflow-hidden h-9">
                                <button
                                    onClick={() => setPriceCurrency("base")}
                                    className={`h-full px-3 text-[10px] font-black uppercase tracking-widest transition-all ${
                                        priceCurrency === "base"
                                            ? "bg-brand-500 text-black"
                                            : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                    }`}>
                                    $
                                </button>
                                <button
                                    onClick={() => setPriceCurrency("local")}
                                    className={`h-full px-3 text-[10px] font-black uppercase tracking-widest border-l border-border/40 dark:border-white/10 transition-all ${
                                        priceCurrency === "local"
                                            ? "bg-brand-500 text-black"
                                            : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                    }`}>
                                    Bs
                                </button>
                            </div>
                        )}

                        {/* Selector de vista: lista o cuadrícula. Va al extremo derecho
                            (ml-auto) para no competir con los filtros de la izquierda. */}
                        <div className="ml-auto flex items-center rounded-xl border border-border/40 dark:border-white/10 overflow-hidden h-9 shrink-0">
                            <button
                                onClick={() => setViewMode("list")}
                                title="Vista de lista"
                                className={`h-full px-2.5 flex items-center justify-center transition-all ${
                                    viewMode === "list"
                                        ? "bg-brand-500 text-black"
                                        : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                }`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
                            </button>
                            <button
                                onClick={() => setViewMode("grid")}
                                title="Vista de cuadrícula"
                                className={`h-full px-2.5 flex items-center justify-center border-l border-border/40 dark:border-white/10 transition-all ${
                                    viewMode === "grid"
                                        ? "bg-brand-500 text-black"
                                        : "bg-surface-2 dark:bg-white/5 text-content-subtle hover:text-content dark:hover:text-white"
                                }`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        <div className="card-premium overflow-auto flex-1">
                            {viewMode === "grid" ? (
                                <ProductCards
                                    products={products}
                                    canManageProducts={can("products")}
                                    openEditProduct={(p) => { setProductEditData(p); setProductModal(true); }}
                                    setDeleteProductDialog={setDeleteProductDialog}
                                    selectedProducts={selectedProducts.map(p => p.id)}
                                    onToggleSelect={toggleSelect}
                                    isSelectionMode={isSelectionMode}
                                    priceCurrency={priceCurrency}
                                    localCurrency={localCurrency}
                                    onToggleVisible={(p) => applyVisibility([p.id], !p.visible_in_catalog)}
                                />
                            ) : (
                                <ProductTable
                                    products={products}
                                    canManageProducts={can("products")}
                                    openEditProduct={(p) => { setProductEditData(p); setProductModal(true); }}
                                    setDeleteProductDialog={setDeleteProductDialog}
                                    selectedProducts={selectedProducts.map(p => p.id)}
                                    onToggleSelect={toggleSelect}
                                    onSelectAll={selectAll}
                                    isSelectionMode={isSelectionMode}
                                    priceCurrency={priceCurrency}
                                    localCurrency={localCurrency}
                                    onToggleVisible={(p) => applyVisibility([p.id], !p.visible_in_catalog)}
                                />
                            )}
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
                <CategoriesTab notify={notify} can={can} triggerNew={triggerNewCategory} />
            )}

            {/* Tab: Promociones */}
            {activeTab === "promotions" && (
                <PromotionsTab notify={notify} can={can} triggerNew={triggerNewPromo} />
            )}

            <ProductModal
                open={productModal}
                onClose={() => setProductModal(false)}
                onSave={saveProduct}
                editData={productEditData}
                categories={categories}
                loading={loading}
                warehouseId={warehouseId}
                warehouseName={selectedWarehouseName}
            />

            <PublicLinkModal
                open={publicLinkModal}
                onClose={() => setPublicLinkModal(false)}
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
