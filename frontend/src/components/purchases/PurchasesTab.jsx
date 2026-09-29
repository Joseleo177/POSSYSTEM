import { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import PurchasesTable from "./PurchasesTable";
import PurchaseDetails from "./PurchaseDetails";
import PurchaseForm from "./PurchaseForm";
import ConfirmModal from "../ui/ConfirmModal";
import CustomerModal from "../Customers/CustomerModal";
import ProductModal from "../ProductModal";
import DateRangePicker from "../ui/DateRangePicker";
import { Button } from "../ui/Button";
import Page from "../ui/Page";

import { usePurchases } from "../../hooks/purchases/usePurchases";

export default function PurchasesTab({ notify, onProductsUpdated }) {
    const state = usePurchases(notify, onProductsUpdated);
    const [showFilterDrop, setShowFilterDrop] = useState(false);

    const { pendingAction, setPendingAction } = useApp();
    useEffect(() => {
        if (pendingAction === "compras:nuevo") {
            state.openNew();
            setPendingAction(null);
        } else if (pendingAction && pendingAction.startsWith("compras:abrir:")) {
            const id = parseInt(pendingAction.split(":")[2]);
            if (!isNaN(id)) state.openDetail(id);
            setPendingAction(null);
        }
    }, [pendingAction, state]);

    const hasFilters = !!(state.listStatus || state.listOrderStatus || state.listDateFrom || state.listDateTo);
    const filtersCount = (state.listStatus ? 1 : 0) + (state.listOrderStatus ? 1 : 0) + ((state.listDateFrom || state.listDateTo) ? 1 : 0);
    const clearFilters = () => {
        state.setListStatus("");
        state.setListOrderStatus("");
        state.setListDateFrom("");
        state.setListDateTo("");
        state.setPurchasesPage(1);
    };

    const {
        view,
        supplierModal,
        closeSupplierModal,
        saveSupplier,
        supplierEditData,
        savingSupplier,

        productModal,
        closeProductModal,
        saveProduct,
        productEditData,
        productInitialName,
        categories,
        savingProduct,
        selectedWarehouseId,
    } = state;

    const getPageTitle = () => {
        if (view === "detail") {
            const os = state.detail?.status || "recibido";
            const prefix = os === "borrador" ? "Borrador" : os === "pendiente" ? "Orden" : "Recibo";
            return `${prefix} #${state.detail?.id}`;
        }
        if (view === "new") return state.editingDraftId ? `Editar borrador #${state.editingDraftId}` : "Nueva orden de compra";
        return "Órdenes de compra";
    };

    const getPageActions = () => {
        if (view === "list") return (
            <Button onClick={state.openNew} className="h-8 px-2.5 sm:px-3 text-[11px]">
                + <span className="hidden sm:inline">Nueva orden</span><span className="sm:hidden">Nueva</span>
            </Button>
        );
        // Volver ya no vive aquí: es navegación, no una acción sobre el documento, y va a la
        // izquierda del título (ver la prop `onBack` de Page).
        return null;
    };

    return (
        <Page
            module="Compras"
            title={getPageTitle()}
            actions={getPageActions()}
            onBack={view === "detail" || view === "new" ? () => state.setView("list") : undefined}
            backLabel="Volver al listado"
        >
            <div className={`flex-1 flex flex-col min-h-0 ${view !== "list" ? "p-4 overflow-auto" : ""}`}>
                {view === "list" && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        {/* Subheader: buscador + dropdown de filtros */}
                        <div className="shrink-0 px-6 py-4 border-b border-border/10 dark:border-white/5 bg-surface-3/30 dark:bg-white/[0.01] flex flex-wrap items-center gap-3">
                            {/* min-w-0 en móvil: el mínimo de 240px impedía que el input se
                                encogiera y empujaba el botón de filtros a una segunda línea. */}
                            <div className="relative max-w-md flex-1 min-w-0 sm:min-w-[240px] group">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:text-brand-500 group-focus-within:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    value={state.listSearch}
                                    onChange={e => { state.setListSearch(e.target.value); state.setPurchasesPage(1); }}
                                    className="input h-10 pl-10 font-medium w-full"
                                    placeholder="Buscar por #, proveedor, RIF o notas..."
                                />
                            </div>

                            <div className="relative shrink-0">
                                <button
                                    onClick={() => setShowFilterDrop(p => !p)}
                                    className={[
                                        "h-10 px-3 rounded-lg text-[12px] font-bold border flex items-center gap-2 transition-all",
                                        hasFilters
                                            ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40"
                                            : "bg-white dark:bg-white/5 border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:text-white"
                                    ].join(" ")}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                                    Filtros
                                    {hasFilters && (
                                        <span className="bg-content text-white dark:bg-white dark:text-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center text-[10px]">
                                            {filtersCount}
                                        </span>
                                    )}
                                </button>
                                {showFilterDrop && (
                                    <>
                                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                                        {/* Anclado por la derecha siempre: el botón vive al final de
                                            la barra, así que con left-0 el panel crecía hacia afuera
                                            y en móvil se salía de la pantalla. */}
                                        <div className="absolute top-full right-0 mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-surface-dark-2 border border-black/[0.07] dark:border-white/10 rounded-xl shadow-[0_12px_40px_-8px_rgb(0_0_0/0.22)] z-[70] popover-in">
                                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                                <div className="text-[12px] font-medium text-content-subtle mb-2">Estado de orden</div>
                                                {/* flex-wrap y no grid-cols-3: en tres columnas fijas
                                                    cada botón se quedaba en 81px y "PENDIENTE" no
                                                    cabía, así que el rótulo salía cortado. Así se
                                                    reparten el ancho y bajan de línea si hace falta. */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { id: "borrador",  label: "Borrador" },
                                                        { id: "pendiente", label: "Pendiente" },
                                                        { id: "recibido",  label: "Recibido" },
                                                    ].map(f => {
                                                        const active = state.listOrderStatus === f.id;
                                                        return (
                                                            <button key={f.id}
                                                                onClick={() => { state.setListOrderStatus(active ? "" : f.id); state.setPurchasesPage(1); }}
                                                                className={`flex-1 whitespace-nowrap h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all ${active ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}>
                                                                {f.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                                <div className="text-[12px] font-medium text-content-subtle mb-2">Estado de Pago</div>
                                                {/* flex-wrap y no grid-cols-3: en tres columnas fijas
                                                    cada botón se quedaba en 81px y "PENDIENTE" no
                                                    cabía, así que el rótulo salía cortado. Así se
                                                    reparten el ancho y bajan de línea si hace falta. */}
                                                <div className="flex flex-wrap gap-1.5">
                                                    {[
                                                        { id: "pagado",    label: "Pagado" },
                                                        { id: "parcial",   label: "Parcial" },
                                                        { id: "pendiente", label: "Debe" },
                                                    ].map(f => {
                                                        const active = state.listStatus === f.id;
                                                        return (
                                                            <button key={f.id}
                                                                onClick={() => { state.setListStatus(active ? "" : f.id); state.setPurchasesPage(1); }}
                                                                className={`flex-1 whitespace-nowrap h-8 px-2.5 rounded-lg text-[13px] font-medium border transition-all ${active ? "bg-brand-500/10 text-brand-700 dark:text-brand-300 border-brand-500/40" : "border-border dark:border-white/10 text-content-muted dark:text-white/70 hover:bg-surface-2 hover:text-content dark:hover:bg-white/5 dark:hover:text-white"}`}>
                                                                {f.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                                <div className="text-[12px] font-medium text-content-subtle mb-2">Rango de fecha</div>
                                                <DateRangePicker
                                                    from={state.listDateFrom}
                                                    to={state.listDateTo}
                                                    setFrom={v => { state.setListDateFrom(v); state.setPurchasesPage(1); }}
                                                    setTo={v => { state.setListDateTo(v); state.setPurchasesPage(1); }}
                                                />
                                            </div>
                                            <div className="px-4 py-2">
                                                <button onClick={clearFilters} className="w-full h-8 text-[13px] font-medium text-content-muted hover:text-content hover:bg-surface-2 dark:text-white/60 dark:hover:text-white dark:hover:bg-white/5 rounded-lg transition-colors">
                                                    Limpiar todo
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        <PurchasesTable state={state} />
                    </div>
                )}
                {view === "detail" && <PurchaseDetails state={state} />}
                {view === "new" && <PurchaseForm state={state} />}
            </div>

            <CustomerModal
                open={supplierModal}
                onClose={closeSupplierModal}
                onSave={saveSupplier}
                editData={supplierEditData}
                loading={savingSupplier}
            />

            <ProductModal
                open={productModal}
                onClose={closeProductModal}
                onSave={saveProduct}
                editData={productEditData}
                initialName={productInitialName}
                categories={categories}
                loading={savingProduct}
                warehouseId={selectedWarehouseId || null}
            />

            <ConfirmModal
                isOpen={!!state.cancelConfirm}
                title={state.cancelConfirm?.status === "recibido" ? "Anular compra recibida" : "Eliminar orden"}
                message={
                    state.cancelConfirm?.status === "recibido"
                        ? "Esta compra ya fue recibida. Eliminarla revertirá el stock. ¿Seguro que deseas continuar?"
                        : "¿Seguro que deseas eliminar esta orden? No se afectará el stock."
                }
                onCancel={() => state.setCancelConfirm(null)}
                onConfirm={() => {
                    state.cancelPurchaseAction(state.cancelConfirm.id);
                    state.setCancelConfirm(null);
                }}
                type="danger"
                confirmText="Sí, eliminar"
                cancelText="CANCELAR"
            />
        </Page>
    );
}
