import { useEffect, useRef, useState } from "react";
import Money from "../ui/Money";
import { Spinner } from "../ui/Spinner";
import PaymentFields, { pagoVacio, faltaEnPago } from "./PaymentFields";
import CatalogSheet, { SheetHeader, sheetSkin } from "./CatalogSheet";
import Celebracion from "./Celebracion";

// Reportar el pago de un pedido ya enviado, desde "Mis pedidos": la tienda lo aceptó y el cliente
// paga ahora, o paga lo que le falta. Mismo formulario que el paso final del pedido.
//
// Al registrarse, la hoja no se cierra de golpe: muestra el visto con chispas y "Pago
// reportado" un par de segundos (o hasta que toque "Listo"). Antes se cerraba sola y el cliente
// no sabía si el pago había entrado o si la hoja se había caído.
const CIERRE_MS = 2600;

export default function ReportPaymentModal({ order, options, onClose, onSend, fmt, baseCur, altCur, panel = null }) {
    const [pago, setPago] = useState(pagoVacio);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [intento, setIntento] = useState(0);
    const [listo, setListo] = useState(false);
    const timer = useRef(null);

    useEffect(() => () => clearTimeout(timer.current), []);

    if (!order) return null;
    const skin = sheetSkin(panel);
    const owed = order.owed || 0;

    const enviar = async () => {
        const falta = faltaEnPago(pago);
        setIntento((n) => n + 1);
        if (falta) return setError(falta);
        setSending(true);
        setError(null);
        try {
            await onSend(order, { ...pago, amount: String(pago.amount).replace(",", ".") });
            setListo(true);
            timer.current = setTimeout(onClose, CIERRE_MS);
        } catch (e) {
            setError(e.message || "No se pudo registrar el pago. Intenta de nuevo.");
        } finally {
            setSending(false);
        }
    };

    if (listo) {
        return (
            <CatalogSheet skin={skin} onClose={onClose} label="Pago reportado" z="z-[70]">
                <div className="flex-1 overflow-y-auto px-6 pt-10 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
                    <Celebracion />
                    <div className="rise-in mt-6 space-y-1.5" style={{ "--i": 4 }}>
                        <p className="text-[13px] font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">Pedido #{order.id}</p>
                        <h2 className={`text-[22px] font-bold tracking-tight ${skin.ink}`}>Pago reportado</h2>
                        <p className={`text-[14px] ${skin.muted} leading-relaxed max-w-xs mx-auto`}>
                            La tienda lo busca en su banco con tu referencia y te avisa cuando lo confirme.
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                        className={`rise-in mt-7 w-full h-12 inline-flex items-center justify-center ${skin.primary}`} style={{ "--i": 6 }}>
                        Listo
                    </button>
                    {/* La barra se vacía hasta que la hoja se cierra sola. */}
                    <div className="mt-4 h-1 rounded-full bg-black/[0.06] dark:bg-white/10 overflow-hidden">
                        <div className="h-full bg-emerald-500/70 auto-close" style={{ "--dur": `${CIERRE_MS}ms` }} />
                    </div>
                </div>
            </CatalogSheet>
        );
    }

    return (
        <CatalogSheet skin={skin} onClose={sending ? null : onClose} label="Reportar pago" z="z-[70]">
            <SheetHeader
                skin={skin}
                icon={skin.carta ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="2" strokeWidth={2} /><path strokeLinecap="round" strokeWidth={2} d="M3 10h18M7 15h3" /></svg> : null}
                eyebrow={`Pedido #${order.id}`}
                title="Reportar pago"
                onClose={onClose}
                closeDisabled={sending}
            />

            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
                {/* Lo que falta, arriba y grande: es la cifra que el cliente va a transferir. */}
                <div className={`${skin.carta ? skin.card : skin.soft} px-4 py-3 flex items-center justify-between gap-3`}>
                    <span className={`text-[13px] ${skin.muted}`}>Falta por pagar</span>
                    <span className="text-right">
                        <Money value={fmt(owed, baseCur)} className={`block text-[20px] font-bold tracking-tight ${skin.ink}`} />
                        {altCur && <Money value={fmt(owed, altCur)} className={`block text-[12px] ${skin.subtle}`} />}
                    </span>
                </div>
                <PaymentFields options={options} value={pago} onChange={setPago} owedBase={owed} skin={skin} />
            </div>

            <div className={`shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t ${skin.line} space-y-3`}>
                {error && (
                    <p key={intento} className="shake flex items-start gap-1.5 text-[13px] font-medium text-red-600 dark:text-red-400 leading-snug">
                        <svg className="w-4 h-4 mt-px shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7.5v5M12 16h.01" /></svg>
                        {error}
                    </p>
                )}
                <button onClick={enviar} disabled={sending}
                    className={`w-full h-12 inline-flex items-center justify-center gap-2 active:scale-[0.99] transition disabled:opacity-80 ${skin.primary}`}>
                    {sending && <Spinner />}
                    {sending ? "Registrando el pago" : "Reportar pago"}
                </button>
            </div>
        </CatalogSheet>
    );
}
