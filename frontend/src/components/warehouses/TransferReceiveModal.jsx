import { useState, useEffect, useMemo } from "react";
import Modal from "../ui/Modal";
import { Button } from "../ui/Button";
import CustomSelect from "../ui/CustomSelect";
import { fmtDate } from "../../helpers";
import { isIntegerUnit, fmtQtyUnit } from "../../helpers/unitFormatter";

// Motivos del faltante. Se guardan en la línea para que después se sepa QUÉ pasó, no solo
// que la cuenta no cuadró.
const DIFF_REASONS = [
    { value: "Faltante en el bulto",     label: "Faltante en el bulto" },
    { value: "Dañado en el traslado",    label: "Dañado en el traslado" },
    { value: "No salió del origen",      label: "No salió del origen" },
    { value: "Error de conteo al despachar", label: "Error de conteo al despachar" },
    { value: "Otro",                     label: "Otro" },
];

/**
 * Recepción: el destino cuenta lo que llegó y confirma línea por línea. Lo que se confirma
 * es lo único que entra al stock; el resto queda como faltante por resolver.
 */
export default function TransferReceiveModal({ open, transfer, onClose, onConfirm, saving }) {
    const [lines, setLines] = useState([]);
    const [note, setNote]   = useState("");

    // Arranca con todo conforme: lo normal es que la mercancía llegue completa, y así el
    // receptor solo toca lo que no cuadró —pero tiene que mirar cada línea igual.
    useEffect(() => {
        if (!open || !transfer) return;
        setLines((transfer.items || []).map(i => ({
            id: i.id,
            product_name: i.product_name,
            unit: i.unit,
            qty_sent: parseFloat(i.qty_sent),
            qty_received: String(parseFloat(i.qty_sent)),
            diff_reason: "",
        })));
        setNote("");
    }, [open, transfer]);

    const setLine = (id, patch) =>
        setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

    const parsed = useMemo(() => lines.map(l => {
        const received = l.qty_received === "" ? NaN : parseFloat(l.qty_received);
        return { ...l, received, missing: isNaN(received) ? 0 : l.qty_sent - received };
    }), [lines]);

    const invalid   = parsed.some(l => isNaN(l.received) || l.received < 0 || l.received > l.qty_sent);
    const withDiff  = parsed.filter(l => l.missing > 0);
    const needReason = withDiff.some(l => !l.diff_reason);

    const receiveAll = () =>
        setLines(prev => prev.map(l => ({ ...l, qty_received: String(l.qty_sent), diff_reason: "" })));

    const confirm = () => {
        if (invalid) return;
        onConfirm(transfer.id, parsed.map(l => ({
            id: l.id,
            qty_received: l.received,
            diff_reason: l.missing > 0 ? l.diff_reason : null,
        })), note);
    };

    if (!transfer) return null;

    return (
        <Modal open={open} onClose={onClose} title={`Recibir ${transfer.code || `#${transfer.id}`}`} width={620}>
            <div className="space-y-4 p-1">
                {/* ── Datos del despacho ── */}
                <div className="rounded-xl border border-border/30 dark:border-white/10 p-3.5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Origen</span>
                        <span className="text-[11px] font-black uppercase tracking-tight">{transfer.from_warehouse_name || "Externo"}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Destino</span>
                        <span className="text-[11px] font-black uppercase tracking-tight text-brand-500">{transfer.to_warehouse_name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Despachado</span>
                        <span className="text-[11px] font-bold tabular-nums">{fmtDate(transfer.dispatched_at || transfer.created_at)} · {transfer.employee_name || "Sistema"}</span>
                    </div>
                    {transfer.note && (
                        <div className="pt-2 border-t border-border/20 dark:border-white/5 text-[10px] font-medium italic text-content-subtle leading-relaxed">
                            {transfer.note}
                        </div>
                    )}
                </div>

                {/* ── Conteo línea por línea ── */}
                <div className="rounded-xl border border-border/30 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-2 bg-surface-2/50 dark:bg-white/[0.03] flex items-center justify-between gap-3">
                        <span className="text-[10px] font-black uppercase tracking-widest text-content-subtle">Cuenta lo que llegó</span>
                        <button
                            onClick={receiveAll}
                            className="h-7 px-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-brand-500 hover:bg-brand-500/10 transition-all"
                        >
                            Todo conforme
                        </button>
                    </div>
                    <div className="max-h-[320px] overflow-y-auto divide-y divide-border/10 dark:divide-white/5">
                        {parsed.map(l => {
                            const intUnit = isIntegerUnit(l.unit);
                            const over    = !isNaN(l.received) && l.received > l.qty_sent;
                            return (
                                <div key={l.id} className="px-4 py-3 space-y-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-black uppercase tracking-tight truncate">{l.product_name}</p>
                                            <p className="text-[9px] font-bold text-content-subtle">
                                                Despachado: {fmtQtyUnit(l.qty_sent, l.unit)}
                                            </p>
                                        </div>
                                        <input
                                            type="number"
                                            min="0"
                                            max={l.qty_sent}
                                            step={intUnit ? "1" : "0.001"}
                                            value={l.qty_received}
                                            onChange={e => {
                                                let v = e.target.value;
                                                if (intUnit) v = String(v).replace(/[.,].*$/, "");
                                                setLine(l.id, { qty_received: v });
                                            }}
                                            className={`input h-10 w-28 text-center font-black tabular-nums ${
                                                over ? "border-danger text-danger" : l.missing > 0 ? "border-warning text-warning" : "text-brand-500"
                                            }`}
                                        />
                                    </div>
                                    {over && (
                                        <p className="text-[9px] font-black uppercase tracking-wide text-danger">
                                            No puedes recibir más de lo despachado
                                        </p>
                                    )}
                                    {l.missing > 0 && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-warning whitespace-nowrap">
                                                Faltan {fmtQtyUnit(l.missing, l.unit)}
                                            </span>
                                            <CustomSelect
                                                value={l.diff_reason}
                                                onChange={val => setLine(l.id, { diff_reason: val })}
                                                options={DIFF_REASONS}
                                                placeholder="Motivo del faltante..."
                                                className="flex-1"
                                                height="h-9"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Observación del receptor ── */}
                <div>
                    <label className="label mb-1.5 opacity-70">Observaciones de la recepción (Opcional)</label>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        placeholder="ej. Un bulto llegó abierto, se contó pieza por pieza..."
                        className="input min-h-[64px] py-3 px-3 resize-none text-[11px] leading-relaxed"
                        rows={2}
                    />
                </div>

                {withDiff.length > 0 && (
                    <div className="rounded-xl bg-warning/10 border border-warning/25 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-warning">
                            {withDiff.length} línea{withDiff.length !== 1 ? "s" : ""} con faltante
                        </p>
                        <p className="text-[10px] font-medium text-content-subtle mt-1 leading-relaxed">
                            Solo entra al almacén lo que confirmes. El faltante queda registrado contra esta
                            transferencia hasta que se decida si fue merma o si vuelve al origen.
                        </p>
                    </div>
                )}
            </div>

            <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-border/10 dark:border-white/5">
                <Button variant="ghost" onClick={onClose} className="h-10 px-6 font-black tracking-widest text-[10px] uppercase">
                    Cancelar
                </Button>
                <Button
                    variant="primary"
                    onClick={confirm}
                    disabled={invalid || needReason || saving}
                    className="h-10 px-8 shadow-lg shadow-brand-500/20 font-black tracking-[0.2em] text-[10px] uppercase"
                >
                    {saving ? "Registrando..." : needReason ? "Indica el motivo del faltante" : "Confirmar recepción"}
                </Button>
            </div>
        </Modal>
    );
}
