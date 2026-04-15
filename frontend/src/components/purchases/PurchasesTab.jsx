import PurchasesTable from "./PurchasesTable";
import PurchaseDetails from "./PurchaseDetails";
import PurchaseForm from "./PurchaseForm";
import ConfirmModal from "../ui/ConfirmModal";
import CustomerModal from "../Customers/CustomerModal";
import ProductModal from "../ProductModal";
import { Button } from "../ui/Button";
import Page from "../ui/Page";

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
        <Page module="INFORMACIÓN DEL RECIBO" title="Compras" actions={view === "list" ? <Button onClick={state.openNew}>+ NUEVO RECIBO</Button> : null}>
            {view === "list" && <PurchasesTable state={state} />}
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
        </Page>
    );
}
