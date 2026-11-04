import { useRef, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import Money from "../ui/Money";
import { toNameCase } from "../../helpers";
import { fmtBaseCon, nuevaClave, r2 } from "./shared";

const MAX = 20;

/**
 * Dejar mercancía a crédito: una factura con N unidades del producto de la cobranza, al precio
 * de la sucursal del sector. Se numera en el acto y queda en Cuentas por cobrar.
 *
 * La clave de idempotencia se genera al abrir: si la señal se cae justo después de tocar el
 * botón y el cobrador lo vuelve a tocar, el servidor devuelve la misma factura en vez de dejar
 * dos bolsas.
 */
export default function DejarBolsaModal({ cliente, bolsa, onClose, onDone }) {
    const { notify, baseCurrency } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);
    const [qty, setQty] = useState(1);
    const clave = useRef(nuevaClave("bolsa"));

    const total = r2(qty * (parseFloat(bolsa.price) || 0));
    const pocas = bolsa.stock < qty;
    const nombre = bolsa.name.toLowerCase();

    const dejar = async () => {
        try {
            const r = await api.cobranza.dejarBolsa(cliente.id, { qty, idempotency_key: clave.current });
            const d = r.data || {};
            // Un solo aviso: el segundo taparía al primero.
            notify(`${d.invoice_number || "Factura"} · ${qty} a crédito${d.stock_negativo?.length ? " · la existencia quedó en negativo" : ""}`);
            onDone?.(d);
        } catch (e) { notify(e.message, "err"); }
    };

    const Paso = ({ d, label, disabled }) => (
        <button type="button" onClick={() => setQty(q => Math.min(MAX, Math.max(1, q + d)))} disabled={disabled} aria-label={label}
            className="w-12 h-12 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-content dark:text-white flex items-center justify-center active:scale-95 disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={d > 0 ? "M12 5v14M5 12h14" : "M5 12h14"} /></svg>
        </button>
    );

    return (
        <Modal open onClose={onClose} title={`Dejar ${nombre}`} width={420}>
            <div className="space-y-4">
                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-2/50 dark:bg-white/[0.03] px-3.5 py-3">
                    <p className="text-[12px] text-content-subtle">Cliente</p>
                    <p className="text-[15px] font-semibold text-content dark:text-white">{toNameCase(cliente.name)}</p>
                    <p className="text-[12px] text-content-subtle">{cliente.sector_name}</p>
                </div>

                <div>
                    <p className="text-[12px] text-content-subtle mb-2">Cantidad</p>
                    <div className="flex items-center gap-3">
                        <Paso d={-1} label="Una menos" disabled={qty <= 1} />
                        <span className="w-14 text-center text-[28px] font-bold tracking-tight tabular-nums text-content dark:text-white">{qty}</span>
                        <Paso d={1} label="Una más" disabled={qty >= MAX} />
                        <div className="ml-auto text-right">
                            <p className="text-[12px] text-content-subtle">{fmtBase(bolsa.price)} c/u</p>
                            <Money value={fmtBase(total)} className="text-[20px] font-bold tracking-tight text-content dark:text-white" />
                        </div>
                    </div>
                    {pocas && (
                        <p className="mt-2 text-[12px] text-warning">
                            En la sucursal quedan {Math.max(0, bolsa.stock)}: la existencia quedará en negativo.
                        </p>
                    )}
                </div>

                <p className="text-[12px] text-content-subtle">Se registra como venta a crédito y se suma a lo que debe.</p>

                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-medium">Cancelar</button>
                    <Button onClick={dejar} className="!h-12 sm:!h-10 sm:flex-1">
                        Dejar {qty} · {fmtBase(total)}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
