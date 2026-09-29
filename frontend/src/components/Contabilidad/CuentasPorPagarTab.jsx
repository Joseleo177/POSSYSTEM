import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import CuentasTab from "./CuentasTab";
import PurchasePaymentModal from "../purchases/PurchasePaymentModal";
import PurchaseDetailModal from "./PurchaseDetailModal";
import { toNameCase } from "../../helpers";

// Las compras cargadas solo con nombre (sin ficha de proveedor) se agrupan por ese nombre:
// siguen siendo deuda con alguien.
const contact = (x) => ({
  key:  x.supplier_id ? `id:${x.supplier_id}` : `name:${x.supplier_name}`,
  name: toNameCase(x.supplier_name),
  rif:  x.supplier_rif,
});

/** Contabilidad → Cuentas → Por Pagar: lo que se les debe a los proveedores. */
export default function CuentasPorPagarTab({ notify, fmtPrice }) {
  const { can } = useApp();

  const config = {
    fetch: async (params) => {
      const { data } = await api.purchases.payables(params);
      return { ...data, contacts: data.suppliers };
    },
    contact,
    docLabel: (inv) => `#${inv.id}`,
    canAct: can("purchases.pay"),
    actionLabel: "Pagar",
    bulkActionLabel: "Pagar juntas",
    // Un pago conjunto es una transferencia a UN proveedor con un egreso de UNA sucursal.
    groupRuleText: "Solo se pagan juntas compras del mismo proveedor y sucursal",
    // Un depósito también recibe compras: acá entran todas las sucursales.
    warehouseFilter: null,
    text: {
      contact: "proveedor", contactTitle: "Proveedor", contactsTitle: "Proveedores",
      doc: "compra", docs: "compras", docTitle: "Compra", docsTitle: "Compras",
      docDateLabel: "Fecha compra", viewDocLabel: "Ver compra",
      totalLabel: "Total por pagar",
      searchPlaceholder: "Buscar proveedor, RIF o N° de compra...",
      emptyContacts: "No le debes nada a ningún proveedor",
      emptyDocs: "No hay compras pendientes de pago",
      loading: "Cargando cuentas por pagar...",
    },
    renderModals: ({ toAct, closeAct, afterAct, detailId, closeDetail, reload }) => (
      <>
        {/* El mismo modal de pago que la ficha de la compra. Con varias hace un pago conjunto
            (una transferencia, un egreso). */}
        {toAct && <PurchasePaymentModal purchases={toAct} onClose={closeAct} onSuccess={afterAct} />}
        <PurchaseDetailModal purchaseId={detailId} onClose={closeDetail} onChanged={reload} />
      </>
    ),
  };

  return <CuentasTab notify={notify} fmtPrice={fmtPrice} config={config} />;
}
