import { useState, useRef } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";

/**
 * Venta con Cashea, desde la caja.
 *
 * El cliente paga una inicial —el % de su nivel, que Cashea le muestra al cajero— y Cashea
 * financia el resto. Aquí solo se escribe la inicial: lo financiado queda como cobro contra el
 * diario Cashea (services/cashea) y la venta pide después solo la inicial, que se cobra con
 * "Cobrar ahora" como cualquier otra (vuelto, bolívares, pago combinado).
 *
 * `saldo`: lo que falta por cobrar de la venta, en moneda base.
 * `alt`: { symbol, rate } de la otra moneda, para decir la inicial también en bolívares.
 */
export default function CasheaModal({ sale, saldo, baseSymbol = "Ref.", alt = null, onClose, onDone }) {
    const { notify } = useApp();
    const [inicialText, setInicialText] = useState("");
    const [orden, setOrden] = useState("");
    const [loading, setLoading] = useState(false);
    const enviado = useRef(false);

    const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;
    const total = round2(saldo);
    const inicial = round2(String(inicialText).replace(",", "."));
    const escrita = String(inicialText).trim() !== "";
    const financia = Math.max(0, round2(total - inicial));
    const excede = escrita && inicial >= total;
    const puede = escrita && inicial >= 0 && !excede && !loading;
    const fmt = (n) => `${baseSymbol} ${round2(n).toFixed(2)}`;
    const fmtAlt = (n) => (alt?.rate > 0 ? `${alt.symbol} ${round2(n * alt.rate).toFixed(2)}` : null);

    const registrar = async () => {
        if (!puede || enviado.current) return;
        enviado.current = true;
        setLoading(true);
        try {
            const res = await api.cashea.registerSale(sale.id, { inicial, order_number: orden.trim() || null });
            notify(inicial > 0
                ? `Cashea financia ${fmt(financia)}. Cobra la inicial: ${fmt(inicial)}`
                : `Cashea financia ${fmt(financia)}: venta cobrada`);
            onDone?.(res.data, { inicial });
        } catch (e) {
            notify(e.message, "err");
            enviado.current = false;
            setLoading(false);
        }
    };

    return (
        <Modal
            open
            onClose={loading ? () => {} : onClose}
            title="Venta con Cashea"
            width={440}
            footer={
                <div className="flex flex-col-reverse sm:flex-row gap-2">
                    <button type="button" onClick={onClose} disabled={loading}
                        className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">
                        Cancelar
                    </button>
                    <button type="button" onClick={registrar} disabled={!puede}
                        className="btn-accent sm:flex-1 h-12 sm:h-10 rounded-lg text-[13px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 tabular-nums">
                        {loading && <Spinner />}
                        {loading ? "Registrando…" : puede ? `Cashea financia ${fmt(financia)}` : "Registrar"}
                    </button>
                </div>
            }
        >
            <form onSubmit={e => { e.preventDefault(); registrar(); }} className="space-y-4">
                <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-[12px] text-content-subtle">Venta</p>
                        <p className="text-[15px] font-semibold text-content dark:text-white truncate tabular-nums">
                            {sale?.invoice_number || `Borrador #${sale?.id}`}
                        </p>
                    </div>
                    <div className="text-right shrink-0">
                        <p className="text-[12px] text-content-subtle">Por cobrar</p>
                        <Money value={fmt(total)} className="block text-[22px] font-bold tracking-tight text-content dark:text-white leading-tight" />
                        {fmtAlt(total) && <Money value={fmtAlt(total)} className="block text-[12px] text-content-subtle" />}
                    </div>
                </div>

                <div>
                    <p className="mb-1.5 text-[12px] font-medium text-content-subtle">Inicial que indica Cashea</p>
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{baseSymbol}</span>
                        <input
                            type="text" inputMode="decimal" autoComplete="off" data-autofocus
                            value={inicialText}
                            onChange={e => setInicialText(e.target.value.replace(/[^\d.,]/g, ""))}
                            placeholder="0.00"
                            aria-label="Inicial que indica Cashea"
                            className={`${INPUT} pl-11 text-[16px] font-semibold tabular-nums ${excede ? "!border-red-500" : ""}`}
                        />
                    </div>
                    <p className={`mt-1 text-[12px] leading-snug ${excede ? "text-red-600 dark:text-red-400" : "text-content-subtle"}`}>
                        {excede
                            ? "La inicial tiene que ser menor que lo que falta por cobrar"
                            : "La que te muestra Cashea para el nivel del cliente."}
                    </p>
                </div>

                <div>
                    <p className="mb-1.5 flex items-baseline justify-between gap-2">
                        <span className="text-[12px] font-medium text-content-subtle">N.º de orden de Cashea</span>
                        <span className="text-[11px] text-content-subtle/70">Opcional</span>
                    </p>
                    <input type="text" autoComplete="off" value={orden} maxLength={100}
                        onChange={e => setOrden(e.target.value)}
                        placeholder="Ej: 123456" className={INPUT} />
                </div>

                {/* Cómo queda la venta: lo que paga el cliente ahora y lo que se le cobra a Cashea. */}
                {escrita && !excede && (
                    <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                        <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                            <span className="text-[13px] text-content-subtle">El cliente paga ahora</span>
                            <span className="text-right">
                                <Money value={fmt(inicial)} className="block text-[15px] font-semibold text-content dark:text-white" />
                                {inicial > 0 && fmtAlt(inicial) && <Money value={`≈ ${fmtAlt(inicial)}`} className="block text-[12px] text-content-subtle" />}
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                            <span className="text-[13px] text-content-subtle">Te paga Cashea</span>
                            <Money value={fmt(financia)} className="text-[15px] font-semibold text-content dark:text-white" />
                        </div>
                    </div>
                )}
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
        </Modal>
    );
}

const INPUT = "w-full h-10 px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] font-medium text-content dark:text-white placeholder:text-content-subtle/50 dark:placeholder:text-white/25 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-colors";
