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
        openNew, openEdit, onSave, closeModal
    } = useCustomersLogic();

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

                    <CustomerTable
                        customers={customers}
                        onDetail={openDetail}
                        onEdit={openEdit}
                        onDelete={setDeleteConfirm}
                        fmtPrice={fmtPrice}
                    />
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