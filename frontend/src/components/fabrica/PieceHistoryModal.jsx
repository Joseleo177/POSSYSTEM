import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import StatusMark from "../ui/StatusMark";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase, fmtDateShort } from "../../helpers";
import { printPieceLabels } from "../../helpers/printPieceLabels";
import { INPUT, CARD, Field, fmtDims, fmtSize, PIECE_STATUS, ORIGIN_LABEL, orderCode, errMsg } from "./shared";
import { CutPreview } from "./CutLayout";

/**
 * La vida de una pieza: de la #51 salió el mesón de un cliente, quedó el 51-1, de ahí la
 * campana de otro... hasta que no queda nada. Se dibuja como árbol desde la pieza original,
 * aunque se haya abierto desde un retazo, y la pieza abierta queda resaltada.
 */
export default function PieceHistoryModal({ pieceId, onClose, onChanged, onOpenOrder }) {
    const { notify, baseCurrency, can, printerWidth } = useApp();
    const canManage = can("factory.manage");
    const [data, setData] = useState(null);
    const [discharge, setDischarge] = useState(null);
    const [reason, setReason] = useState("");

    const load = async () => {
        try {
            const r = await api.factory.piece(pieceId);
            setData(r.data);
        } catch (e) { notify(errMsg(e, "No se pudo abrir la pieza"), "err"); }
    };

    useEffect(() => {
        setData(null);
        if (pieceId) load();
    }, [pieceId]);

    if (!pieceId) return null;

    // Una fila por pieza, pero una pieza puede haber ido a una orden (op) o a ninguna.
    const nodes = new Map();
    for (const row of data?.tree || []) {
        if (!nodes.has(row.id)) nodes.set(row.id, { ...row, uses: [] });
        if (row.use_id) nodes.get(row.id).uses.push(row);
    }
    const children = new Map();
    let root = null;
    for (const n of nodes.values()) {
        if (!n.parent_id) root = n;
        else {
            if (!children.has(n.parent_id)) children.set(n.parent_id, []);
            children.get(n.parent_id).push(n);
        }
    }
    const activas = [...nodes.values()].filter(n => n.status === "disponible" || n.status === "en_taller");
    const consumido = [...nodes.values()].reduce((s, n) => s + n.uses.reduce((a, u) => a + (u.consumed || 0), 0), 0);
    const costoUsado = [...nodes.values()].reduce((s, n) => s + n.uses.reduce((a, u) => a + (u.use_cost || 0), 0), 0);
    const money = (n) => fmtBase(n, baseCurrency);

    const Node = ({ n, depth }) => {
        const kids = children.get(n.id) || [];
        const actual = n.id === pieceId;
        return (
            <div className={depth > 0 ? "pl-4 sm:pl-6 border-l border-border/70 dark:border-white/10 ml-2" : ""}>
                <div className={`${CARD} px-4 py-3 mt-2 ${actual ? "ring-2 ring-brand-500/40" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-[15px] font-semibold text-content dark:text-white tabular-nums">#{n.code}</span>
                                <span className="text-[13px] text-content dark:text-white tabular-nums">{fmtDims(n)}</span>
                                {(n.width_mm || n.is_irregular) && <span className="text-[12px] text-content-subtle tabular-nums">{fmtSize(n.size, n.unit)}</span>}
                            </div>
                            <div className="text-[12px] text-content-subtle">
                                {ORIGIN_LABEL[n.origin] || n.origin} · {fmtDateShort(n.created_at)}
                                {n.reference ? ` · ${n.reference}` : ""}
                            </div>
                        </div>
                        <StatusMark status={n.status} map={PIECE_STATUS} />
                    </div>

                    {n.uses.map(u => (
                        <div key={u.use_id} className="mt-2 pt-2 border-t border-border/60 dark:border-white/[0.06]">
                            <button onClick={() => onOpenOrder?.(u.use_order_id)} className="text-left w-full">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-medium text-content dark:text-white truncate">
                                            {orderCode(u.use_order_number)} · {u.use_order_description}
                                        </div>
                                        <div className="text-[12px] text-content-subtle truncate">
                                            {u.use_customer_name ? toNameCase(u.use_customer_name) : "Sin cliente"} · Entregada {fmtDateShort(u.delivered_at)}
                                        </div>
                                    </div>
                                    {u.returned_at ? (
                                        <div className="text-right shrink-0">
                                            <div className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{fmtSize(u.consumed, n.unit)}</div>
                                            <Money value={money(u.use_cost)} className="text-[12px] text-content-subtle" />
                                        </div>
                                    ) : (
                                        <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">En el taller</span>
                                    )}
                                </div>
                                {u.use_note && <p className="text-[13px] text-content-muted dark:text-white/70 mt-1">{u.use_note}</p>}
                            </button>
                            {u.use_layout && (
                                <div className="mt-2"><CutPreview piece={n} mode={n.piece_mode} layout={u.use_layout} /></div>
                            )}
                        </div>
                    ))}

                    {n.status === "baja" && n.notes && <p className="text-[12px] text-content-subtle mt-1.5">Baja: {n.notes}</p>}

                    {canManage && n.status === "disponible" && (
                        <div className="mt-2 flex gap-2">
                            <button onClick={() => printPieceLabels([n], printerWidth)} className="h-8 px-3 rounded-lg text-[12px] font-medium btn-outline">Etiqueta</button>
                            <button onClick={() => { setReason(""); setDischarge(n); }} className="h-8 px-3 rounded-lg text-[12px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400">Dar de baja</button>
                        </div>
                    )}
                </div>
                {kids.map(k => <Node key={k.id} n={k} depth={depth + 1} />)}
            </div>
        );
    };

    return (
        <>
            <Modal open={!!pieceId} onClose={discharge ? () => {} : onClose} width={680}
                title={data ? `Pieza #${data.root_number}` : "Pieza"}
                footer={activas.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                        <Button variant="ghost" className="h-12 sm:h-10" onClick={() => printPieceLabels(activas, printerWidth)}>
                            Imprimir etiquetas ({activas.length})
                        </Button>
                    </div>
                )}>
                {!data || !root ? (
                    <div className="py-20 flex justify-center"><Spinner /></div>
                ) : (
                    <div>
                        <div className="text-[13px] text-content dark:text-white">{toNameCase(root.product_name)}</div>
                        <dl className="mt-3 grid grid-cols-3 gap-4">
                            <div>
                                <dt className="text-[12px] text-content-subtle">Original</dt>
                                <dd className="text-[15px] font-semibold text-content dark:text-white tabular-nums">{fmtSize(root.size, root.unit)}</dd>
                            </div>
                            <div>
                                <dt className="text-[12px] text-content-subtle">Consumido</dt>
                                <dd className="text-[15px] font-semibold text-content dark:text-white tabular-nums">{fmtSize(consumido, root.unit)}</dd>
                                <dd className="text-[12px] text-content-subtle"><Money value={money(costoUsado)} /></dd>
                            </div>
                            <div>
                                <dt className="text-[12px] text-content-subtle">Queda</dt>
                                <dd className="text-[15px] font-semibold text-content dark:text-white tabular-nums">{fmtSize(activas.reduce((s, n) => s + n.size, 0), root.unit)}</dd>
                                <dd className="text-[12px] text-content-subtle">{activas.length === 1 ? "1 pieza" : `${activas.length} piezas`}</dd>
                            </div>
                        </dl>
                        <div className="mt-3">
                            <Node n={root} depth={0} />
                        </div>
                    </div>
                )}
            </Modal>

            <Modal open={!!discharge} onClose={() => setDischarge(null)} title={discharge ? `Dar de baja #${discharge.code}` : ""} width={440}
                footer={
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <button onClick={() => setDischarge(null)} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Volver</button>
                        <Button variant="danger" className="h-12 sm:h-10 px-5" onClick={async () => {
                            if (!reason.trim()) return notify("Escribe el motivo", "err");
                            try {
                                await api.factory.dischargePiece(discharge.id, { reason: reason.trim() });
                                notify(`#${discharge.code} dada de baja`);
                                setDischarge(null);
                                await load();
                                onChanged?.();
                            } catch (e) { notify(errMsg(e), "err"); }
                        }}>Dar de baja</Button>
                    </div>
                }>
                <p className="text-[13px] text-content-muted dark:text-white/70 mb-3">
                    {discharge ? `Sus ${fmtSize(discharge.size, discharge.unit)} salen del inventario.` : ""}
                </p>
                <Field label="Motivo">
                    <input value={reason} onChange={e => setReason(e.target.value)} data-autofocus className={INPUT}
                        placeholder="Se vendió como chatarra, se dañó…" />
                </Field>
            </Modal>
        </>
    );
}
