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
 * Dejar mercancía a crédito: una factura con lo que se elija de la lista de la cobranza, al
 * precio de la sucursal del sector. Se numera en el acto y queda en Cuentas por cobrar. Con un
 * solo producto arranca en 1; con varios, en cero, para que el cobrador diga cuáles.
 *
 * La clave de idempotencia se genera al abrir: si la señal se cae justo después de tocar el
 * botón y el cobrador lo vuelve a tocar, el servidor devuelve la misma factura en vez de dejar
 * dos veces.
 */
export default function DejarBolsaModal({ cliente, productos, onClose, onDone }) {
    const { notify, baseCurrency } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);
    const uno = productos.length === 1;
    const [cant, setCant] = useState(() => (uno ? { [productos[0].id]: 1 } : {}));
    const clave = useRef(nuevaClave("bolsa"));

    const mover = (id, d) => setCant(c => ({ ...c, [id]: Math.min(MAX, Math.max(uno ? 1 : 0, (c[id] || 0) + d)) }));
    const lineas = productos.filter(p => (cant[p.id] || 0) > 0);
    const unidades = lineas.reduce((s, p) => s + cant[p.id], 0);
    const total = r2(lineas.reduce((s, p) => s + r2(cant[p.id] * (parseFloat(p.price) || 0)), 0));
    const titulo = uno ? `Dejar ${productos[0].name.toLowerCase()}` : "Dejar mercancía";

    const dejar = async () => {
        try {
            const r = await api.cobranza.dejarBolsa(cliente.id, {
                items: lineas.map(p => ({ product_id: p.id, qty: cant[p.id] })),
                idempotency_key: clave.current,
            });
            const d = r.data || {};
            // Un solo aviso: el segundo taparía al primero.
            notify(`${d.invoice_number || "Factura"} · ${unidades} a crédito${d.stock_negativo?.length ? " · la existencia quedó en negativo" : ""}`);
            onDone?.(d);
        } catch (e) { notify(e.message, "err"); }
    };

    const Paso = ({ id, d, label, disabled }) => (
        <button type="button" onClick={() => mover(id, d)} disabled={disabled} aria-label={label}
            className="w-11 h-11 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-content dark:text-white flex items-center justify-center active:scale-95 disabled:opacity-40">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={d > 0 ? "M12 5v14M5 12h14" : "M5 12h14"} /></svg>
        </button>
    );

    return (
        <Modal open onClose={onClose} title={titulo} width={460}>
            <div className="space-y-4">
                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-2/50 dark:bg-white/[0.03] px-3.5 py-3">
                    <p className="text-[12px] text-content-subtle">Cliente</p>
                    <p className="text-[15px] font-semibold text-content dark:text-white">{toNameCase(cliente.name)}</p>
                    <p className="text-[12px] text-content-subtle">{cliente.sector_name}</p>
                </div>

                <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                    {productos.map(p => {
                        const n = cant[p.id] || 0;
                        return (
                            <div key={p.id} className="px-3.5 py-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[14px] font-semibold text-content dark:text-white truncate">{p.name}</p>
                                        <p className="text-[12px] text-content-subtle tabular-nums">{fmtBase(p.price)} c/u</p>
                                    </div>
                                    <div className="shrink-0 flex items-center gap-1.5">
                                        <Paso id={p.id} d={-1} label={`Una menos de ${p.name}`} disabled={n <= (uno ? 1 : 0)} />
                                        <span className="w-9 text-center text-[20px] font-bold tabular-nums text-content dark:text-white">{n}</span>
                                        <Paso id={p.id} d={1} label={`Una más de ${p.name}`} disabled={n >= MAX} />
                                    </div>
                                </div>
                                {n > 0 && p.stock < n && (
                                    <p className="mt-1.5 text-[12px] text-warning">En la sucursal quedan {Math.max(0, p.stock)}: la existencia quedará en negativo.</p>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12px] text-content-subtle">Va como venta a crédito y se suma a lo que debe.</p>
                    <Money value={fmtBase(total)} className="shrink-0 text-[20px] font-bold tracking-tight text-content dark:text-white" />
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-medium">Cancelar</button>
                    {unidades > 0 && (
                        <Button onClick={dejar} className="!h-12 sm:!h-10 sm:flex-1">Dejar {unidades} · {fmtBase(total)}</Button>
                    )}
                </div>
            </div>
        </Modal>
    );
}
