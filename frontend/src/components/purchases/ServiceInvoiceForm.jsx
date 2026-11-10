import { useEffect, useState } from "react";
import ReceiptInfo from "./ReceiptInfo";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useFacturaProveedor, FacturaProveedorCampos } from "./SupplierInvoice";

const fmt2 = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const SECTION = "bg-surface dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none";

// Factura de servicios: una compra sin mercancía, solo con líneas de gasto (mano de obra, una
// reparación, la ferretería, la luz a crédito). Cada línea con su alícuota y su categoría. No pasa
// por recibir: queda registrada y por pagar, y entra a Cuentas por pagar y al Libro de compras como
// cualquier compra. La cabecera (proveedor, sucursal, moneda) es la misma de la orden de mercancía.
export default function ServiceInvoiceForm({ state }) {
    const { notify, company, baseCurrency } = useApp();
    const { selectedSupplier, selectedWarehouseId, notes, invoiceCurrency, invoiceCurrencyId, invoiceRate,
            resetForm, loadPurchases, openDetail } = state;
    const ivaEnabled = !!company?.iva_enabled;
    const rate = invoiceCurrency && invoiceRate > 0 ? invoiceRate : 1;
    const sym = invoiceCurrency && !invoiceCurrency.is_base ? (invoiceCurrency.symbol || invoiceCurrency.code) : (baseCurrency?.symbol || "Ref.");
    const f = useFacturaProveedor({ kind: "servicios" }, rate, { servicios: true, ivaEnabled });
    const [saving, setSaving] = useState(false);

    // El RIF de la factura arranca con el de la ficha del proveedor elegido (se puede cambiar).
    const { setRif } = f;
    useEffect(() => {
        if (selectedSupplier?.rif) setRif(selectedSupplier.rif);
    }, [selectedSupplier?.id, selectedSupplier?.rif, setRif]);

    const guardar = async () => {
        if (!selectedSupplier) return notify("Elige el proveedor de la factura", "err");
        if (!selectedWarehouseId) return notify("Elige la sucursal a la que corresponde la factura", "err");
        setSaving(true);
        try {
            const r = await api.purchases.create({
                kind: "servicios",
                supplier_id: selectedSupplier.id,
                supplier_name: selectedSupplier.name,
                warehouse_id: parseInt(selectedWarehouseId),
                notes: notes || undefined,
                currency_id: invoiceCurrencyId ? parseInt(invoiceCurrencyId) : null,
                exchange_rate: invoiceCurrencyId ? rate : 1,
                ...f.payload(),
            });
            notify("Factura de servicios registrada");
            resetForm?.();
            loadPurchases?.();
            const id = r?.data?.id;
            if (id) await openDetail?.(id);
        } catch (e) {
            notify(e.message, "err");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            <ReceiptInfo state={state} servicios />

            <div className={`${SECTION} p-4 sm:p-5`}>
                <div className="mb-4">
                    <p className="text-[14px] font-semibold text-content dark:text-white">Factura de servicios</p>
                    <p className="text-[12px] text-content-subtle">No entra al inventario: queda registrada y por pagar al proveedor.</p>
                </div>
                <FacturaProveedorCampos f={f} sym={sym} servicios ivaEnabled={ivaEnabled} />
                <div className="mt-5 pt-4 border-t border-border/60 dark:border-white/[0.06] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button onClick={guardar} loading={saving} className="h-12 sm:h-10 px-5 text-[13px]">
                        Registrar factura · {sym} {fmt2(f.factura.total)}
                    </Button>
                </div>
            </div>
        </div>
    );
}
