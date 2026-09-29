import { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import CuentasTab from "./CuentasTab";
import PaymentFormModal from "../PaymentFormModal";
import BulkPaymentModal from "../Customers/BulkPaymentModal";
import SaleDetailModal from "../Customers/SaleDetailModal";
import { toNameCase } from "../../helpers";

const contact = (x) => ({
  key:  x.customer_id ? `id:${x.customer_id}` : "none",
  name: toNameCase(x.customer_name),
  rif:  x.customer_rif,
});

/** Contabilidad → Cuentas → Por Cobrar: lo que deben los clientes. */
export default function CuentasPorCobrarTab({ notify, fmtPrice }) {
  const { can } = useApp();

  const config = {
    fetch: async (params) => {
      const { data } = await api.sales.receivables(params);
      return { ...data, contacts: data.customers };
    },
    contact,
    docLabel: (inv) => inv.invoice_number || `#${inv.id}`,
    // Mismo permiso que registrar un cobro en el resto del sistema.
    canAct: can("sales.create"),
    actionLabel: "Cobrar",
    bulkActionLabel: "Cobrar juntas",
    // El cobro conjunto es un solo movimiento de caja: del mismo cliente y de una sucursal.
    groupRuleText: "Solo se cobran juntas facturas del mismo cliente y sucursal",
    // Un depósito no vende: no tiene facturas que cobrar.
    warehouseFilter: (w) => w.sells !== false,
    text: {
      contact: "cliente", contactTitle: "Cliente", contactsTitle: "Clientes",
      doc: "factura", docs: "facturas", docTitle: "Factura", docsTitle: "Facturas",
      docDateLabel: "Fecha factura", viewDocLabel: "Ver factura",
      totalLabel: "Total por cobrar",
      searchPlaceholder: "Buscar cliente, cédula/RIF o N° de factura...",
      emptyContacts: "Ningún cliente tiene saldo pendiente",
      emptyDocs: "No hay facturas pendientes de cobro",
      loading: "Cargando cuentas por cobrar...",
    },
    renderModals: ({ toAct, closeAct, afterAct, detailId, closeDetail, reload }) => (
      <>
        <CobroLauncher rows={toAct} onClose={closeAct} onDone={afterAct} notify={notify} />
        {detailId && <SaleDetailModal saleId={detailId} onClose={closeDetail} onChanged={reload} />}
      </>
    ),
  };

  return <CuentasTab notify={notify} fmtPrice={fmtPrice} config={config} />;
}

/**
 * Abre el cobro de las facturas elegidas con los mismos modales del resto del sistema: el de
 * una factura (que también permite exonerar) o el cobro conjunto.
 *
 * Antes de abrirlos se pide cada venta completa: el listado trae el saldo, pero el cobro en
 * bolívares valora línea por línea (con descuentos, devoluciones y lo exonerado) y necesita
 * la factura entera para no pedir de más ni de menos.
 */
function CobroLauncher({ rows, onClose, onDone, notify }) {
  const [sales, setSales] = useState(null);

  useEffect(() => {
    // Siempre desde cero: sin esto, al abrir otro cobro asomaba un instante el modal anterior.
    setSales(null);
    if (!rows?.length) return;
    let active = true;
    Promise.all(rows.map(r => api.sales.getOne(r.id).then(res => res.data ?? res)))
      .then(full => { if (active) setSales(full); })
      .catch(e => { if (active) { notify(e.message, "err"); onClose(); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  if (!rows?.length || !sales) return null;

  if (sales.length === 1) {
    return <PaymentFormModal sale={sales[0]} onClose={onClose} onSuccess={onDone} />;
  }
  return (
    <BulkPaymentModal
      customer={{ id: rows[0].customer_id, name: rows[0].customer_name }}
      sales={sales}
      onClose={onClose}
      onSuccess={onDone}
    />
  );
}
