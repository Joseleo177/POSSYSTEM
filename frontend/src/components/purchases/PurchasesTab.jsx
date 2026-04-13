import PurchasesTable from "./PurchasesTable";
import PurchaseDetails from "./PurchaseDetails";
import PurchaseForm from "./PurchaseForm";
import ConfirmModal from "../ui/ConfirmModal";
import CustomerModal from "../Customers/CustomerModal";
import ProductModal from "../ProductModal";
import { Button } from "../ui/Button";

import { usePurchases } from "../../hooks/purchases/usePurchases";

export default function PurchasesTab({ notify, onProductsUpdated }) {
    const state = usePurchases(notify, onProductsUpdated);

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

    return (
        <div className="h-full overflow-hidden flex flex-col bg-transparent">
            {view === "list" && (
                <>
                    {/* Toolbar Estándar Premium */}
                    <div className="shrink-0 px-4 pt-3 pb-2 flex items-center justify-between gap-3 border-b border-border/30 dark:border-white/5 bg-transparent">
                        <div>
                            <div className="text-[10px] font-black text-brand-500 uppercase tracking-widest leading-none mb-1">Módulo</div>
                            <h1 className="text-sm font-black uppercase tracking-tight">Compras</h1>
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={state.openNew}>+ NUEVO RECIBO</Button>
                        </div>
                    </div>

                    <PurchasesTable state={state} />
                </>
            )}

            {view === "detail" && <PurchaseDetails state={state} />}
            {view === "new" && <PurchaseForm state={state} />}


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
                title="Anular compra"
                message="¿Seguro que deseas anular este recibo?"
                onCancel={() => state.setCancelConfirm(null)}
                onConfirm={() => {
                    state.cancelPurchaseAction(state.cancelConfirm.id);
                    state.setCancelConfirm(null);
                }}
                type="danger"
                confirmText="Anular"
                cancelText="Cancelar"
            />
        </div>
    );
}
