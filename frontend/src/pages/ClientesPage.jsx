import { useCustomersLogic } from "../hooks/useCustomersLogic";
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
        detail, detailSales, openDetail, closeDetail, refreshDetail,
        remove, baseCurrency, customerModal, customerEditData,
        deleteConfirm, setDeleteConfirm, payModal, setPayModal,
        openNew, openEdit, onSave, closeModal,
        page, setPage, total, LIMIT
    } = useCustomersLogic();

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
                    <div className="shrink-0 px-6 py-4 border-b border-border/10 dark:border-white/5 bg-surface-3/30 dark:bg-white/[0.01]">
                        <div className="relative max-w-md group">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-subtle opacity-40 group-focus-within:text-brand-500 group-focus-within:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                value={search} 
                                onChange={e => setSearch(e.target.value)}
                                className="input h-10 pl-10 font-medium"
                                placeholder="Buscar por nombre, RIF o teléfono..."
                            />
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
                message={`Estás a punto de eliminar a "${deleteConfirm?.name}". Esta acción es permanente.`}
                onConfirm={async () => { await remove(deleteConfirm.id, deleteConfirm.type); setDeleteConfirm(null); }}
                onCancel={() => setDeleteConfirm(null)}
                type="danger"
            />
        </Page>
    );
}