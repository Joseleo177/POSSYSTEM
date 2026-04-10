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
                    <div className="px-4 py-2 bg-white/[0.02]">
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            className="h-8 w-full max-w-xs px-3 bg-white/5 border border-white/10 rounded-lg text-[11px] focus:border-brand-500 outline-none"
                            placeholder="Buscar Contacto..."
                        />
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