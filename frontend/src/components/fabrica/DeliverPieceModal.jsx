import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import CustomSelect from "../ui/CustomSelect";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { toNameCase } from "../../helpers";
import {
    INPUT, Field, DimsInput, UnitSwitch, useMeasureUnit, toMm, fromMm, fmtDims, fmtSize, ORIGIN_LABEL, errMsg, useKeyedAction,
} from "./shared";

/**
 * Entregar al taller la pieza con que se va a fabricar.
 *
 * Si se escribe la medida que hace falta, la lista se ordena de la pieza más chica donde cabe
 * a la más grande (probando también girarla): así se gastan primero los retazos y no se abre
 * una lámina nueva para un corte pequeño. Las irregulares solo se comparan por área y
 * salen al final, para que alguien las mida antes de entregarlas.
 */
// initial: { productId, w_mm, l_mm, planId, needed, missing } para entregar para un corte de la
// receta: el material queda fijo, cada pieza dice cuántos cortes rinde y el servidor valida.

// Cuántos cortes de w × l (o de largo l) salen de una pieza: cuadrícula simple, probando girarla.
// Es el mismo cálculo que hace el servidor al validar la entrega.
const grid = (W, L, w, l) => Math.max(Math.floor(W / w) * Math.floor(L / l), Math.floor(W / l) * Math.floor(L / w));
const shaped = (p) => Array.isArray(p.shape) && p.shape.length > 0;
function cutsIn(p, w, l) {
    if (!(l > 0)) return 0;
    if (!w) return Math.floor((p.length_mm || 0) / l);
    // Un retazo en L rinde lo que rinda cada una de sus partes.
    if (shaped(p)) return p.shape.reduce((s, r) => s + grid(r.dy, r.dx, w, l), 0);
    if (p.is_irregular || !p.width_mm) return Math.floor((p.size || 0) / ((w * l) / 1e6));
    return grid(p.width_mm, p.length_mm, w, l);
}
// Lo que le queda a una pieza que ya cubre otros cortes (taken: [{ w, l, cuts }]): se descuenta
// del largo o del área. Igual que cutsLeft del servidor.
function cutsLeft(p, w, l, taken) {
    const grid = cutsIn(p, w, l);
    if (!taken.length || grid < 1) return grid;
    if (!w) return Math.max(0, Math.floor(((p.length_mm || 0) - taken.reduce((s, t) => s + t.cuts * (t.l || 0), 0)) / l));
    const free = (p.size || 0) - taken.reduce((s, t) => s + t.cuts * (t.w || 0) * (t.l || 0), 0) / 1e6;
    return Math.max(0, Math.min(grid, Math.floor(free / ((w * l) / 1e6) + 1e-9)));
}
export default function DeliverPieceModal({ open, order, materials, initial = null, onClose, onDone }) {
    const { notify } = useApp();
    const [unit, setUnit] = useMeasureUnit();
    const [productId, setProductId] = useState("");
    const [w, setW] = useState("");
    const [l, setL] = useState("");
    const [code, setCode] = useState("");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const { run, busy } = useKeyedAction();

    // Láminas: ancho × largo. Tubos y perfiles: solo largo.
    const fitMode = materials.find(m => String(m.id) === productId)?.piece_mode || "area";
    const fitW = toMm(w, unit), fitL = toMm(l, unit);
    const hasFit = fitL > 0 && (fitMode === "length" || fitW > 0);
    const dCode = useDebounce(code, 250);
    const key = `${productId}|${hasFit ? `${fitMode}:${fitW}x${fitL}` : ""}|${dCode}`;

    useEffect(() => {
        if (!open) return;
        setCode("");
        setW(initial?.w_mm ? fromMm(initial.w_mm, unit) : "");
        setL(initial?.l_mm ? fromMm(initial.l_mm, unit) : "");
        setProductId(initial?.productId ? String(initial.productId) : materials.length === 1 ? String(materials[0].id) : "");
    }, [open]);

    useEffect(() => {
        if (!open) return;
        let vivo = true;
        setLoading(true);
        const params = { status: "disponible", warehouse_id: order.warehouse_id, limit: 60 };
        if (productId) params.product_id = productId;
        if (hasFit) { params.fit_l = fitL; if (fitMode === "area") params.fit_w = fitW; }
        if (dCode.trim()) params.search = dCode.trim();
        api.factory.pieces(params)
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(errMsg(e), "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [open, key]);

    const planId = initial?.planId || null;
    const cutLabel = planId ? fmtDims({ width_mm: initial.w_mm, length_mm: initial.l_mm }) : null;

    // Piezas del mismo material que ya están en el taller para esta orden y todavía rinden este
    // corte: de una lámina salen a la vez el cuerpo y las puertas, sin entregarla otra vez.
    const lineOf = (id) => order.plan?.lines.find(x => x.id === id);
    const inShop = !planId ? [] : (order.uses || [])
        .filter(u => !u.returned_at && u.product_id === initial.productId && !(u.cuts || []).some(c => c.plan_id === planId))
        .map(u => {
            const taken = (u.cuts || []).map(c => ({ cuts: c.cuts, w: lineOf(c.plan_id)?.cut_width_mm, l: lineOf(c.plan_id)?.cut_length_mm }));
            return { ...u, id: u.piece_id, rinde: cutsLeft(u, initial.w_mm, initial.l_mm, taken), taken };
        })
        .filter(u => u.rinde > 0);

    const deliver = (p) => run(p.id, async () => {
        try {
            const r = await api.factory.deliverPiece(order.id, { piece_id: p.id, plan_id: planId });
            if (planId && r.added) {
                notify(r.cuts_remaining > 0
                    ? `#${p.code} cubre también ${r.cuts_covered} corte${r.cuts_covered === 1 ? "" : "s"} de ${cutLabel}. Falta${r.cuts_remaining === 1 ? "" : "n"} ${r.cuts_remaining}`
                    : `#${p.code} cubre también los cortes de ${cutLabel}`);
            } else if (planId) {
                notify(r.cuts_remaining > 0
                    ? `#${p.code} cubre ${r.cuts_covered} corte${r.cuts_covered === 1 ? "" : "s"}. Falta${r.cuts_remaining === 1 ? "" : "n"} ${r.cuts_remaining}: entrega otra pieza`
                    : `#${p.code} entregada: los ${r.cuts_needed} cortes de ${cutLabel} quedan cubiertos`);
            } else {
                notify(`#${p.code} entregada al taller`);
            }
            onDone?.();
        } catch (e) { notify(errMsg(e), "err"); }
    });

    return (
        <Modal open={open} onClose={onClose} title={`Entregar material · ${order.code}`} width={620}>
            <div className="space-y-4">
                {planId && (
                    <div className="rounded-xl bg-surface-2/70 dark:bg-white/[0.04] px-4 py-3 text-[13px]">
                        <div className="font-semibold text-content dark:text-white">
                            Para {initial.needed} corte{initial.needed === 1 ? "" : "s"} de {cutLabel}
                        </div>
                        <div className="text-content-subtle mt-0.5">
                            {initial.missing === initial.needed
                                ? "Todavía no hay piezas para este corte."
                                : `Faltan ${initial.missing}. Elige una pieza que rinda al menos un corte.`}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Material">
                        <CustomSelect value={productId} onChange={setProductId} disabled={!!planId}
                            options={[{ value: "", label: "Todos los materiales" }, ...materials.map(m => ({ value: String(m.id), label: toNameCase(m.name) }))]} />
                    </Field>
                    <Field label="Número de pieza" hint="Opcional">
                        <input value={code} onChange={e => setCode(e.target.value)} placeholder="51 o 51-2" autoComplete="off"
                            inputMode="numeric" className={`${INPUT} tabular-nums`} />
                    </Field>
                </div>

                <Field label="¿Qué medida necesitas cortar?" hint="Opcional">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex-1 min-w-0"><DimsInput mode={fitMode} w={w} l={l} onW={setW} onL={setL} unit={unit} /></div>
                        <UnitSwitch unit={unit} setUnit={setUnit} className="self-start" />
                    </div>
                </Field>

                {inShop.length > 0 && (
                    <div>
                        <div className="text-[12px] text-content-subtle mb-1.5">Ya en el taller para esta orden</div>
                        <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06]">
                            {inShop.map(u => (
                                <div key={u.id} className="px-3.5 py-2.5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">#{u.code}</span>
                                            <span className="text-[13px] text-content dark:text-white tabular-nums">{fmtDims(u)}</span>
                                        </div>
                                        <div className="text-[12px] text-content-subtle truncate">
                                            Ya cubre {u.taken.map(t => `${t.cuts} de ${fmtDims({ width_mm: t.w, length_mm: t.l })}`).join(" y ")}
                                        </div>
                                        <div className={`text-[12px] font-medium ${u.rinde >= initial.missing ? "text-content dark:text-white" : "text-amber-700 dark:text-amber-400"}`}>
                                            {u.rinde >= initial.missing
                                                ? `Con lo que le queda alcanza para los ${initial.missing} corte${initial.missing === 1 ? "" : "s"}`
                                                : `Con lo que le queda rinde ${u.rinde} de ${initial.missing}`}
                                        </div>
                                    </div>
                                    <button onClick={() => deliver(u)} disabled={busy(u.id)}
                                        className="btn-outline h-9 px-3 rounded-lg text-[13px] font-semibold shrink-0 flex items-center gap-2">
                                        {busy(u.id) && <Spinner />} Usar también
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <div className="text-[12px] text-content-subtle mb-1.5">
                        {hasFit ? "Donde cabe, de la más chica a la más grande" : "Piezas disponibles en este almacén"}
                    </div>
                    {loading ? (
                        <div className="py-10 flex justify-center"><Spinner /></div>
                    ) : rows.length === 0 ? (
                        <div className="py-8 text-center">
                            <div className="text-[13px] font-semibold text-content dark:text-white">{hasFit ? "No hay una pieza donde quepa" : "No hay piezas disponibles"}</div>
                            <div className="text-[12px] text-content-subtle mt-1">
                                {hasFit ? "Prueba con otro material, o compra piezas nuevas." : "Lo que se compra aparece aquí al recibirlo en Compras."}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border/60 dark:border-white/[0.06] divide-y divide-border/60 dark:divide-white/[0.06] max-h-[45vh] overflow-y-auto">
                            {rows.map(p => {
                                const rinde = planId ? cutsIn(p, initial.w_mm, initial.l_mm) : null;
                                return (
                                <div key={p.id} className="px-3.5 py-2.5 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-[14px] font-semibold text-content dark:text-white tabular-nums">#{p.code}</span>
                                            <span className="text-[13px] text-content dark:text-white tabular-nums">{fmtDims(p)}</span>
                                        </div>
                                        <div className="text-[12px] text-content-subtle truncate">
                                            {fmtSize(p.size, p.unit)} · {toNameCase(p.product_name)} · {ORIGIN_LABEL[p.origin] || p.origin}
                                            {p.is_irregular && !shaped(p) && hasFit && <span className="text-amber-700 dark:text-amber-400"> · mídela antes</span>}
                                        </div>
                                        {planId && (
                                            <div className={`text-[12px] font-medium ${rinde >= initial.missing ? "text-content dark:text-white" : "text-amber-700 dark:text-amber-400"}`}>
                                                {rinde >= initial.missing
                                                    ? `Alcanza para los ${initial.missing} corte${initial.missing === 1 ? "" : "s"}`
                                                    : `Rinde ${rinde} corte${rinde === 1 ? "" : "s"} de ${initial.missing}: hará falta otra pieza`}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => deliver(p)} disabled={busy(p.id)}
                                        className="btn-accent h-9 px-3 rounded-lg text-[13px] font-semibold shrink-0 flex items-center gap-2">
                                        {busy(p.id) && <Spinner />} Entregar
                                    </button>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
}
