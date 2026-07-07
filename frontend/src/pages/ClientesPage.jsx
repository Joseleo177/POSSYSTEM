import { useEffect, useState } from "react";
import { useCustomersLogic } from "../hooks/useCustomersLogic";
import { useApp } from "../context/AppContext";
import { fmtBase } from "../helpers";
import { Button } from "../components/ui/Button";
import Page from "../components/ui/Page";
import Pagination from "../components/ui/Pagination";

// Componentes descompuestos
import CustomerTable from "../components/Customers/CustomerTable";
import CustomerDetail from "../components/Customers/CustomerDetail";
import CustomerModal from "../components/Customers/CustomerModal";
import PaymentFormModal from "../components/PaymentFormModal";
import ConfirmModal from "../components/ui/ConfirmModal";

export default function ClientesPage() {
    const {
        customers, search, setSearch,
        typeFilter, setTypeFilter,
        debtorsFilter, setDebtorsFilter,
        detail, detailPending, detailPaid, detailPaidTotal, detailPaidPage,
        openDetail, closeDetail, refreshDetail, setDetailPage,
        remove, baseCurrency, customerModal, customerEditData,
        deleteConfirm, setDeleteConfirm, payModal, setPayModal,
        openNew, openEdit, onSave, closeModal,
        page, setPage, total, LIMIT
    } = useCustomersLogic();

    const { pendingAction, setPendingAction } = useApp();
    useEffect(() => {
        if (pendingAction === "clientes:nuevo") { openNew("cliente"); setPendingAction(null); }
    }, [pendingAction]);

    const [showFilterDrop, setShowFilterDrop] = useState(false);
    const hasFilters = !!(typeFilter || debtorsFilter);
    const filtersCount = (typeFilter ? 1 : 0) + (debtorsFilter ? 1 : 0);
    const clearFilters = () => { setTypeFilter(""); setDebtorsFilter(false); };

    const fmtPrice = (n) => fmtBase(n, baseCurrency);

    // Acciones de la página
    const pageActions = !detail && (
        <Button onClick={() => openNew("cliente")}>+ NUEVO CONTACTO</Button>
    );

    return (
        <Page
            module="MÓDULO CONTACTOS"
            title={detail ? `Detalle: ${detail.name}` : "Contactos"}
            actions={pageActions}
        >
            {!detail ? (
                <div className="flex-1 min-h-0 flex flex-col">
                    {/* Filtros rápidos: h-10 pattern */}
                    <div className="shrink-0 px-6 py-4 border-b border-border/10 dark:border-white/5 bg-surface-3/30 dark:bg-white/[0.01] flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[220px] max-w-md group">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:text-brand-500 group-focus-within:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="input h-10 pl-10 font-medium w-full"
                                placeholder="Buscar por nombre, RIF o teléfono..."
                            />
                        </div>

                        {/* Dropdown de filtros */}
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
                                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Tipo de Contacto</div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {[
                                                    { id: "cliente",   label: "Clientes" },
                                                    { id: "proveedor", label: "Proveedores" },
                                                ].map(f => {
                                                    const active = typeFilter === f.id;
                                                    return (
                                                        <button key={f.id}
                                                            onClick={() => setTypeFilter(active ? "" : f.id)}
                                                            className={`px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all ${active ? "bg-brand-500 text-black border-brand-500" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-content dark:hover:text-white"}`}>
                                                            {f.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className="px-4 py-3 border-b border-border/20 dark:border-white/5">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle mb-2">Balance</div>
                                            <button
                                                onClick={() => setDebtorsFilter(!debtorsFilter)}
                                                className={`w-full px-2 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wide border transition-all flex items-center justify-center gap-2 ${debtorsFilter ? "bg-danger text-white border-danger" : "border-border/30 dark:border-white/10 text-content-subtle hover:text-danger hover:border-danger/40"}`}>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Solo Deudores
                                            </button>
                                        </div>
                                        {hasFilters && (
                                            <div className="px-4 py-2">
                                                <button onClick={clearFilters} className="w-full py-1.5 text-[10px] font-black uppercase tracking-wide text-danger hover:bg-danger/5 rounded-lg transition-colors">
                                                    Limpiar todo
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col">
                        <CustomerTable
                            customers={customers}
                            onDetail={openDetail}
                            onEdit={openEdit}
                            onDelete={setDeleteConfirm}
                            fmtPrice={fmtPrice}
                        />

                        {/* Paginación Estandarizada */}
                        <Pagination 
                            page={page}
                            totalPages={Math.ceil(total / LIMIT)}
                            total={total}
                            limit={LIMIT}
                            onPageChange={setPage}
                        />
                    </div>
                </div>
            ) : (
                <CustomerDetail
                    detail={detail}
                    pending={detailPending}
                    paid={detailPaid}
                    paidTotal={detailPaidTotal}
                    paidPage={detailPaidPage}
                    onPaidPageChange={setDetailPage}
                    onClose={closeDetail}
                    onPay={setPayModal}
                    onRefresh={() => refreshDetail(detail?.id)}
                />
            )}

            {/* Modales usando el estado del hook */}
            <CustomerModal
                open={customerModal}
                onClose={closeModal}
                onSave={onSave}
                editData={customerEditData}
            />

            {payModal && (
                <PaymentFormModal
                    sale={payModal}
                    onClose={() => setPayModal(null)}
                    onSuccess={() => { setPayModal(null); refreshDetail(detail?.id); }}
                />
            )}

            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar contacto?"
                message={`Estás a punto de eliminar a "${deleteConfirm?.name}". Esta acción es permanente.`}
                onConfirm={async () => { await remove(deleteConfirm.id, deleteConfirm.type); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
            />
        </Page>
    );
}