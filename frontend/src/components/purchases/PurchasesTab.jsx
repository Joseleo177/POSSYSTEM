import Page from "../ui/Page";
import PurchasesHeader from "./PurchasesHeader";
import PurchasesTable from "./PurchasesTable";
import PurchaseDetails from "./PurchaseDetails";
import PurchaseForm from "./PurchaseForm";
import ConfirmModal from "../ui/ConfirmModal";
import CustomerModal from "../Customers/CustomerModal";
import ProductModal from "../ProductModal";

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
    <Page
      title="Compras"
      actions={<PurchasesHeader openNew={state.openNew} />}

    >
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
