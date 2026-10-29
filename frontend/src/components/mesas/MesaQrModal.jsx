import { useMemo, useState } from "react";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { encodeQr, qrSvgPath } from "../../helpers/qrcode";
import { printMesaQrs, urlDeMesa } from "./mesaQrPrint";

// Los QR de las mesas de un área, en pantalla: para verlos sin imprimir, abrir la página de una
// mesa, copiar su enlace (mandarlo por WhatsApp) o cambiarle el código si un QR salió del local.
// Desde aquí se imprime la hoja (ver mesaQrPrint.js).

const BORDER = 4;
const enLocal = () => /^(localhost|127\.|0\.0\.0\.0)/.test(window.location.hostname);

function Qr({ token }) {
    const qr = useMemo(() => encodeQr(urlDeMesa(token)), [token]);
    const n = qr.size + BORDER * 2;
    return (
        <svg viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" className="w-full h-auto bg-white rounded-lg" aria-hidden="true">
            <path fill="#000" d={qrSvgPath(qr, BORDER)} />
        </svg>
    );
}

export default function MesaQrModal({ open, area, storeName, onClose, onChanged, notify }) {
    const [cambiar, setCambiar] = useState(null);   // mesa a la que se le cambia el código
    const mesas = (area?.tables || []).filter(t => t.public_token);
    const local = enLocal();

    const copiar = async (t) => {
        try {
            await navigator.clipboard.writeText(urlDeMesa(t.public_token));
            notify(`Enlace de ${t.name} copiado`);
        } catch { notify("No se pudo copiar el enlace", "err"); }
    };

    return (
        <>
            <Modal open={open} onClose={onClose} title={`QR de las mesas · ${area?.name || ""}`} width={860}
                footer={
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cerrar</button>
                        {!local && mesas.length > 0 && (
                            <Button onClick={() => printMesaQrs({ storeName, areaName: area?.name, tables: mesas })} className="h-12 sm:h-10 px-5">
                                Imprimir {mesas.length === 1 ? "el QR" : `los ${mesas.length} QR`}
                            </Button>
                        )}
                    </div>
                }>
                {local && (
                    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-[13px] text-amber-900 dark:text-amber-200">
                        Estás entrando por «{window.location.hostname}»: estos QR no abren en el teléfono de un cliente. Para imprimirlos, entra al sistema con la dirección que usan los teléfonos (el dominio o la IP de la red).
                    </div>
                )}
                {mesas.length === 0 ? (
                    <p className="py-10 text-center text-[13px] text-content-subtle">Esta área no tiene mesas.</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {mesas.map(t => (
                            <div key={t.id} className="rounded-xl border border-border/70 dark:border-white/[0.08] p-3 flex flex-col">
                                <div className="text-[14px] font-semibold text-content dark:text-white truncate mb-2">{t.name}</div>
                                <Qr token={t.public_token} />
                                <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                                    <a href={urlDeMesa(t.public_token)} target="_blank" rel="noopener noreferrer"
                                        className="btn-outline h-9 rounded-lg text-[12px] font-medium flex items-center justify-center">Abrir</a>
                                    <button onClick={() => copiar(t)} title="Copiar el enlace de la mesa" className="btn-outline h-9 rounded-lg text-[12px] font-medium">Copiar</button>
                                </div>
                                <button onClick={() => setCambiar(t)}
                                    className="mt-1.5 h-9 rounded-lg text-[12px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                    Cambiar código
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>

            <ConfirmModal
                isOpen={!!cambiar}
                title={`Cambiar el código de ${cambiar?.name || ""}`}
                message="El QR que está en la mesa deja de servir al instante: nadie podrá ver la mesa ni pedir desde él. Úsalo si una foto del QR salió del local. Después imprime el nuevo."
                confirmText="Cambiar código"
                onCancel={() => setCambiar(null)}
                onConfirm={async () => {
                    try {
                        await api.tables.newQrCode(cambiar.id);
                        notify(`${cambiar.name} tiene código nuevo: imprime su QR`);
                        setCambiar(null);
                        onChanged?.();
                    } catch (e) { notify(e?.message || "No se pudo cambiar el código", "err"); }
                }}
            />
        </>
    );
}
