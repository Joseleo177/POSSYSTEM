import { useCustomersLogic } from "../hooks/useCustomersLogic";
import { fmtBase } from "../helpers";
import { Button } from "../components/ui/Button";

// Componentes descompuestos
import CustomerTable from "../components/Customers/CustomerTable";
import CustomerDetail from "../components/Customers/CustomerDetail";
import CustomerModal from "../components/Customers/CustomerModal";
import PaymentFormModal from "../components/PaymentFormModal";
import ConfirmModal from "../components/ui/ConfirmModal";

export default function ClientesPage() {
    // 1. Usamos TU lógica centralizada
    const {
        customers, search, setSearch, typeFilter, setTypeFilter,
        detail, detailSales, openDetail, closeDetail, refreshDetail,
        remove, baseCurrency, customerModal, customerEditData,
        deleteConfirm, setDeleteConfirm, payModal, setPayModal,
        openNew, openEdit, onSave, closeModal,
        page, setPage, total, LIMIT
    } = useCustomersLogic();

    const totalPages = Math.ceil(total / LIMIT);
    const startItem = (page - 1) * LIMIT + 1;
    const endItem = Math.min(page * LIMIT, total);

    const fmtPrice = (n) => fmtBase(n, baseCurrency);

    return (
        <div className="h-full overflow-hidden flex flex-col">
            {!detail ? (
                <>
                    {/* Toolbar */}
                    <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5">
                        <div>
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Módulo</div>
                            <h1 className="text-sm font-black uppercase tracking-tight">Contactos</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={() => openNew("cliente")}>+ NUEVO CONTACTO</Button>
                        </div>
                    </div>

                    {/* Filtros rápidos */}
                    <div className="shrink-0 px-4 py-2 border-b border-border/20 dark:border-white/5">
                        <div className="relative max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-subtle opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                value={search} onChange={e => setSearch(e.target.value)}
                                className="input h-8 pl-8 text-[11px] w-full"
                                placeholder="Buscar contacto..."
                            />
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex-1 overflow-auto">
                            <CustomerTable
                                customers={customers}
                                onDetail={openDetail}
                                onEdit={openEdit}
                                onDelete={setDeleteConfirm}
                                fmtPrice={fmtPrice}
                            />
                        </div>

                        {/* Paginación */}
                        {totalPages > 1 && (
                            <div className="shrink-0 px-4 py-2 border-t border-border/20 dark:border-white/5 flex items-center justify-between gap-3 bg-surface-2/50 dark:bg-white/[0.01]">
                                <div className="text-[10px] font-bold text-content-subtle dark:text-white/20 uppercase tracking-widest">
                                    Mostrando <span className="text-content dark:text-white">{startItem}-{endItem}</span> de <span className="text-content dark:text-white">{total}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <button 
                                        disabled={page === 1}
                                        onClick={() => setPage(1)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        «
                                    </button>
                                    <button 
                                        disabled={page === 1}
                                        onClick={() => setPage(page - 1)}
                                        className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        Anterior
                                    </button>
                                    <div className="px-3 h-7 flex items-center justify-center text-[10px] font-black text-brand-500 bg-brand-500/10 rounded-lg border border-brand-500/20">
                                        Pág {page}/{totalPages}
                                    </div>
                                    <button 
                                        disabled={page === totalPages}
                                        onClick={() => setPage(page + 1)}
                                        className="h-7 px-3 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        Siguiente
                                    </button>
                                    <button 
                                        disabled={page === totalPages}
                                        onClick={() => setPage(totalPages)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border/30 dark:border-white/5 text-[10px] font-black hover:bg-brand-500 hover:text-black transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-inherit"
                                    >
                                        »
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <CustomerDetail
                    detail={detail}
                    detailSales={detailSales}
                    onClose={closeDetail}
                    onPay={setPayModal}
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
                    onSuccess={() => { setPayModal(null); refreshDetail(); }}
                />
            )}

            <ConfirmModal
                isOpen={!!deleteConfirm}
                title="¿Eliminar contacto?"
                onConfirm={async () => { await remove(deleteConfirm.id, deleteConfirm.type); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
            />
        </div>
    );
}