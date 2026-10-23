import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import CustomSelect from "../ui/CustomSelect";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { INPUT, CARD, Field, Prefijo, parseNum, errMsg } from "./shared";

/**
 * Factura una orden para un cliente con el precio pactado por el lote. Sale por cobrar, con
 * el correlativo de la serie del almacén de la orden; el cobro sigue por Cobro o por Cuentas,
 * como cualquier factura a crédito.
 */
export default function InvoiceModal({ open, order, onClose, onDone, onEdit }) {
    const { notify, baseCurrency } = useApp();
    const [series, setSeries] = useState([]);
    const [serieId, setSerieId] = useState("");
    const [price, setPrice] = useState("");

    useEffect(() => {
        if (!open) return;
        setPrice(order.sale_price != null ? String(order.sale_price) : "");
        api.series.getMy({ warehouse_id: order.warehouse_id })
            .then(r => {
                const fact = (r.data || []).filter(s => !s.type || s.type === "factura");
                setSeries(fact);
                setSerieId(fact.length === 1 ? String(fact[0].id) : "");
            })
            .catch(() => setSeries([]));
    }, [open]);

    const money = (n) => fmtBase(n, baseCurrency);
    const p = parseNum(price);
    const margen = p > 0 ? p - order.total_cost : null;
    const qty = order.quantity;

    const save = async () => {
        if (!serieId) return notify("Elige la serie", "err");
        if (!(p > 0)) return notify("Escribe el precio del lote", "err");
        try {
            const r = await api.factory.invoice(order.id, { serie_id: parseInt(serieId), sale_price: p });
            notify(`Factura ${r.data.invoice_number} emitida: queda por cobrar`);
            onDone?.();
        } catch (e) { notify(errMsg(e), "err"); }
    };

    return (
        <Modal open={open} onClose={onClose} title={`Facturar ${order.code}`} width={480}
            footer={order.Customer && (
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={save} disabled={!series.length} className="h-12 sm:h-10 px-5">
                        Facturar{p > 0 ? ` ${money(p)}` : ""}
                    </Button>
                </div>
            )}>
            {!order.Customer ? (
                <div className="py-4 text-center">
                    <div className="text-[14px] font-semibold text-content dark:text-white">La orden no tiene cliente</div>
                    <div className="text-[13px] text-content-subtle mt-1">Asígnale uno para poder facturarla.</div>
                    <button onClick={onEdit} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium mt-4">Editar la orden</button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className={`${CARD} px-4 py-3 flex items-start justify-between gap-3`}>
                        <div className="min-w-0">
                            <div className="text-[12px] text-content-subtle">Cliente</div>
                            <div className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(order.Customer.name)}</div>
                            {order.Customer.rif && <div className="text-[12px] text-content-subtle">{order.Customer.rif}</div>}
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-[12px] text-content-subtle">Costo</div>
                            <Money value={money(order.total_cost)} className="text-[14px] font-semibold text-content dark:text-white" />
                        </div>
                    </div>

                    <div className="text-[13px] text-content dark:text-white">
                        {order.description}
                        <span className="text-content-subtle"> · {Number(qty).toLocaleString("es-VE")} und.</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Precio del lote">
                            <div className="relative">
                                <Prefijo>{baseCurrency?.symbol || "Ref."}</Prefijo>
                                <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" data-autofocus
                                    placeholder="0.00" className={`${INPUT} pl-11 tabular-nums`} />
                            </div>
                        </Field>
                        <Field label="Serie">
                            {series.length ? (
                                <CustomSelect value={serieId} onChange={setSerieId} placeholder="Elegir…"
                                    options={series.map(s => ({ value: String(s.id), label: `${s.name} (${s.prefix})` }))} />
                            ) : (
                                <div className="h-10 flex items-center text-[12px] text-amber-700 dark:text-amber-400">
                                    No tienes series de factura en este almacén
                                </div>
                            )}
                        </Field>
                    </div>

                    {p > 0 && (
                        <div className="text-[13px]">
                            {qty !== 1 && <div className="text-content-subtle tabular-nums">{money(p / qty)} por unidad</div>}
                            <div className={margen < 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-content dark:text-white font-medium"}>
                                {margen < 0 ? "Pérdida" : "Utilidad"} <Money value={money(Math.abs(margen))} />
                                <span className="text-content-subtle font-normal"> · {Math.round((margen / p) * 100)}%</span>
                            </div>
                            {order.status === "abierta" && (
                                <div className="text-[12px] text-content-subtle mt-0.5">La orden sigue abierta: el costo puede subir con lo que falte por consumir.</div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
