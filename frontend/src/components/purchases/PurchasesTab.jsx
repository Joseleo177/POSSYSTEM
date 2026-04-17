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

    const getPageTitle = () => {
        if (view === "detail") return `RECIBO DE COMPRA #${state.detail?.id}`;
        if (view === "new") return "NUEVO RECIBO DE COMPRA";
        return "Listado de Compras";
    };

    const getPageActions = () => {
        if (view === "list") return <Button onClick={state.openNew}>+ NUEVO RECIBO</Button>;
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
                {view === "list" && <PurchasesTable state={state} />}
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
                title="Anular compra"
                message="¿Seguro que deseas anular este recibo?"
                onCancel={() => state.setCancelConfirm(null)}
                onConfirm={() => {
                    state.cancelPurchaseAction(state.cancelConfirm.id);
                    state.setCancelConfirm(null);
                }}
                type="danger"
                confirmText="SI, ANULAR"
                cancelText="CANCELAR"
            />
        </Page>
    );
}
