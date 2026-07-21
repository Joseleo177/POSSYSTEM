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
        categories,
        savingProduct,
    } = state;

    const getPageTitle = () => {
        if (view === "detail") {
            const os = state.detail?.status || "recibido";
            const prefix = os === "borrador" ? "BORRADOR" : os === "pendiente" ? "ORDEN" : "RECIBO";
            return `${prefix} #${state.detail?.id}`;
        }
        if (view === "new") return state.editingDraftId ? `EDITAR BORRADOR #${state.editingDraftId}` : "NUEVA ORDEN DE COMPRA";
        return "Listado de Compras";
    };

    const getPageActions = () => {
        if (view === "list") return <Button onClick={state.openNew}>+ NUEVA ORDEN</Button>;
        if (view === "detail" || view === "new") {
            return (
                <Button variant="ghost" onClick={() => state.setView("list")} className="h-10 px-4">
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    VOLVER AL LISTADO
                </Button>
            );
        }
        return null;
    };

    return (
        <Page 
            module="MÓDULO DE COMPRAS" 
            title={getPageTitle()} 
            actions={getPageActions()}
        >
            <div className={`flex-1 flex flex-col min-h-0 ${view !== "list" ? "p-4 overflow-auto" : ""}`}>
                {view === "list" && (
                    <div className="flex-1 min-h-0 flex flex-col">
                        {/* Subheader: buscador + dropdown de filtros */}
                        <div className="shrink-0 px-6 py-4 border-b border-border/10 dark:border-white/5 bg-surface-3/30 dark:bg-white/[0.01] flex flex-wrap items-center gap-3">
                            <div className="relative max-w-md flex-1 min-w-[240px] group">
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

                            <div className="relative">
                                <button
                                    onClick={() => setShowFilterDrop(p => !p)}
                                    className={[
                                        "h-10 px-3 rounded-lg text-[11px] font-black uppercase tracking-wide border flex items-center gap-2 transition-all",
                                        hasFilters
                                            ? "bg-brand-500/10 text-brand-500 border-brand-500/30"
                                            : "bg-surface-2 dark:bg-white/5 border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"
                                    ].join(" ")}
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                                    Filtros
                                    {hasFilters && (
                                        <span className="bg-brand-500 text-black w-4 h-4 rounded flex items-center justify-center text-[9px]">
                                            {filtersCount}
                                        </span>
                                    )}
                                </button>
                                {showFilterDrop && (
                                    <>
                                        <div className="fixed inset-0 z-[60]" onClick={() => setShowFilterDrop(false)} />
                                        <div className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-surface-dark-2 border border-border/40 dark:border-white/10 rounded-lg shadow-2xl z-[70] animate-in fade-in zoom-in-95 duration-150">
                                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado de Orden</div>
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {[
                                                        { id: "borrador",  label: "Borrador" },
                                                        { id: "pendiente", label: "Pendiente" },
                                                        { id: "recibido",  label: "Recibido" },
                                                    ].map(f => {
                                                        const active = state.listOrderStatus === f.id;
                                                        return (
                                                            <button key={f.id}
                                                                onClick={() => { state.setListOrderStatus(active ? "" : f.id); state.setPurchasesPage(1); }}
                                                                className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${active ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                                {f.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Estado de Pago</div>
                                                <div className="grid grid-cols-3 gap-1.5">
                                                    {[
                                                        { id: "pagado",    label: "Pagado" },
                                                        { id: "parcial",   label: "Parcial" },
                                                        { id: "pendiente", label: "Debe" },
                                                    ].map(f => {
                                                        const active = state.listStatus === f.id;
                                                        return (
                                                            <button key={f.id}
                                                                onClick={() => { state.setListStatus(active ? "" : f.id); state.setPurchasesPage(1); }}
                                                                className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${active ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                                {f.label}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Rango de Fecha</div>
                                                <DateRangePicker
                                                    from={state.listDateFrom}
                                                    to={state.listDateTo}
                                                    setFrom={v => { state.setListDateFrom(v); state.setPurchasesPage(1); }}
                                                    setTo={v => { state.setListDateTo(v); state.setPurchasesPage(1); }}
                                                />
                                            </div>
                                            <div className="px-4 py-2">
                                                <button onClick={clearFilters} className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
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
                categories={categories}
                loading={savingProduct}
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
                confirmText="SÍ, ELIMINAR"
                cancelText="CANCELAR"
            />
        </Page>
    );
}
