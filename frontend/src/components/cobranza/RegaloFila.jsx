import { useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import StatusMark, { GIFT_STATUS } from "../ui/StatusMark";
import { fmtDateShort, toNameCase } from "../../helpers";

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });

/**
 * Un regalo en una lista: qué, para quién (si `conCliente`), su estado y lo que se puede hacer.
 * Entregar lo descuenta de la existencia. Anular uno apartado lo puede quien da regalos; uno ya
 * entregado, solo quien administra (el servidor lo exige y devuelve la existencia).
 */
export default function RegaloFila({ r, conCliente = false, onChanged }) {
    const { notify, can } = useApp();
    const puedeDar = can("cobranza.gifts");
    const admin = can("cobranza.manage");
    const [entregando, setEntregando] = useState(false);
    const [anulando, setAnulando] = useState(false);

    const entregar = async () => {
        setEntregando(true);
        try {
            await api.cobranza.entregarRegalo(r.id);
            notify(`${r.code} entregado`);
            onChanged?.();
        } catch (e) { notify(e.message, "err"); }
        finally { setEntregando(false); }
    };

    const pendiente = r.status === "por_entregar";
    const puedeAnular = (pendiente && (puedeDar || admin)) || (r.status === "entregado" && admin);
    const cuando = r.status === "entregado"
        ? `Entregado ${fmtDateShort(r.delivered_at)}${r.delivered_by_name ? ` · ${toNameCase(r.delivered_by_name)}` : ""}`
        : r.status === "anulado"
            ? `Anulado ${fmtDateShort(r.voided_at)}${r.void_reason ? ` · ${r.void_reason}` : ""}`
            : `Apartado ${fmtDateShort(r.assigned_at)}${r.assigned_by_name ? ` · ${toNameCase(r.assigned_by_name)}` : ""}`;

    const hayAcciones = (pendiente && puedeDar) || puedeAnular;

    // Una fila por regalo. En escritorio todo va en una línea (qué · para quién · estado y
    // acciones) para que quepa la ruta entera; en el teléfono las acciones bajan a su renglón.
    // Entregar va con borde: en una lista de diez, diez botones rojos eran puro ruido.
    return (
        <div className={`relative px-3.5 py-2.5 ${pendiente ? "pl-4" : ""}`}>
            {pendiente && <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px] bg-amber-500" />}
            <div className={`flex flex-col gap-2 ${conCliente
                ? "md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_auto] md:items-center md:gap-4"
                : "sm:flex-row sm:items-center sm:gap-4"}`}>
                <div className="min-w-0 sm:flex-1">
                    <p className={`text-[13px] font-semibold text-content dark:text-white truncate ${r.status === "anulado" ? "line-through decoration-1 text-content-subtle" : ""}`}>
                        {fmtCant(r.qty)} × {r.product_name}
                    </p>
                    <p className="text-[12px] text-content-subtle tabular-nums truncate">
                        {r.code}{r.invoice_number ? ` · por ${r.invoice_number}` : ""} · {cuando}
                    </p>
                </div>
                {conCliente && (
                    <div className="min-w-0">
                        <p className="text-[13px] text-content dark:text-white/85 truncate">
                            {toNameCase(r.customer_name)}{r.sector_name ? <span className="text-content-subtle"> · {r.sector_name}</span> : null}
                        </p>
                        {r.customer_address && <p className="text-[12px] text-content-subtle truncate">{r.customer_address}</p>}
                    </div>
                )}
                <div className="flex items-center gap-2 sm:justify-end">
                    <span className="shrink-0 mr-auto sm:mr-1"><StatusMark status={r.status} map={GIFT_STATUS} /></span>
                    {hayAcciones && pendiente && puedeDar && (
                        <Button variant="ghost" onClick={entregar} loading={entregando} className="!h-12 sm:!h-9 px-3.5">Marcar entregado</Button>
                    )}
                    {hayAcciones && puedeAnular && (
                        <button type="button" onClick={() => setAnulando(true)}
                            className="h-12 sm:h-9 px-2.5 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/[0.06]">
                            Anular
                        </button>
                    )}
                </div>
            </div>

            {anulando && <AnularRegaloModal r={r} onClose={() => setAnulando(false)} onDone={() => { setAnulando(false); onChanged?.(); }} />}
        </div>
    );
}

function AnularRegaloModal({ r, onClose, onDone }) {
    const { notify } = useApp();
    const [motivo, setMotivo] = useState("");
    const anular = async () => {
        try {
            await api.cobranza.anularRegalo(r.id, { reason: motivo.trim() });
            notify(`${r.code} anulado${r.status === "entregado" ? " · volvió a la existencia" : ""}`);
            onDone?.();
        } catch (e) { notify(e.message, "err"); }
    };
    return (
        <Modal open onClose={onClose} title={`Anular ${r.code}`} width={420}>
            <div className="space-y-3">
                <p className="text-[13px] text-content dark:text-white">
                    {fmtCant(r.qty)} × {r.product_name} para {toNameCase(r.customer_name)}.
                </p>
                <p className="text-[12px] text-content-subtle">
                    {r.status === "entregado"
                        ? "Ya se entregó: al anularlo vuelve a la existencia de la sucursal."
                        : "Está apartado: al anularlo queda libre para otro cliente."}
                </p>
                <div>
                    <p className="text-[12px] text-content-subtle mb-1.5">Motivo</p>
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} autoComplete="off" data-autofocus placeholder="Ej. el cliente prefirió otro"
                        className="h-10 w-full px-3 rounded-lg border border-border dark:border-white/10 bg-white dark:bg-white/[0.04] text-[13px] text-content dark:text-white outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20" />
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
                    <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 sm:flex-1 rounded-lg text-[13px] font-medium">Volver</button>
                    {motivo.trim() && <Button variant="danger" onClick={anular} className="!h-12 sm:!h-10 sm:flex-1">Anular regalo</Button>}
                </div>
            </div>
        </Modal>
    );
}
