import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import Check from "../ui/Check";
import Segmented from "../ui/Segmented";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, fmtBase } from "../../helpers";
import { printPieceLabels } from "../../helpers/printPieceLabels";
import {
    INPUT, AGREGAR, QUITAR, CARD, Field, PlusIcon, XIcon, DimsInput, UnitSwitch, useMeasureUnit,
    toMm, parseNum, fmtDims, fmtSize, unitLabel, errMsg,
} from "./shared";
import { CutEditor, canDraw, initialRegions, remnantsOf, suggestLayout } from "./CutLayout";

const r3 = (n) => Math.round(n * 1000) / 1000;
const rect = () => ({ kind: "rect", w: "", l: "" });
const irregular = () => ({ kind: "irregular", size: "" });

/**
 * Lo que volvió del taller. El material no se corta siempre igual —a lo largo o a lo ancho,
 * según el trabajo—, así que hay dos maneras de contarlo:
 *
 *   Dibujar el corte   la pieza a escala: se pica donde se cortó y cada pedazo se marca como
 *                      usado o retazo. El dibujo queda en el historial de la lámina.
 *   Escribir medidas   los retazos como rectángulos (o pieza irregular con su área) en una
 *                      lámina, o por su largo en un tubo o perfil.
 *
 * Lo consumido (pieza − retazos) sale de la existencia y se carga a la orden al costo de la
 * pieza de origen. Cada retazo queda con su número (51-1, 51-2) para el próximo trabajo.
 */
export default function ReturnPieceModal({ use, order, onClose, onDone }) {
    const { notify, baseCurrency, printerWidth } = useApp();
    const [unit, setUnit] = useMeasureUnit();
    const [rows, setRows] = useState([]);
    const [note, setNote] = useState("");
    const [print, setPrint] = useState(true);
    const [way, setWay] = useState("dibujo");
    const [regions, setRegions] = useState([]);
    const [suggested, setSuggested] = useState(null);
    const [fresh, setFresh] = useState(0);     // reinicia el editor al empezar de cero
    const [askOver, setAskOver] = useState(false);

    const mode = use ? use.piece_mode || (use.width_mm ? "area" : "length") : "area";
    const drawable = !!use && canDraw(use, mode);

    // Los cortes de la receta que se le asignaron a esta pieza al entregarla.
    const planCuts = (use?.cuts || []).map(c => {
        const pl = order?.plan?.lines.find(x => x.id === c.plan_id);
        return pl ? { w: pl.cut_width_mm, l: pl.cut_length_mm, count: c.cuts } : null;
    }).filter(Boolean);

    useEffect(() => {
        if (!use) return;
        setRows([]);
        setNote("");
        setWay(drawable ? "dibujo" : "medidas");
        // El dibujo arranca con esos cortes ya acomodados; si no hay, con la pieza entera.
        const s = drawable ? suggestLayout(use, mode, planCuts) : null;
        setSuggested(s);
        setRegions(drawable ? (s ? s.regions : initialRegions(use, mode)) : []);
        setFresh(n => n + 1);
    }, [use]);

    const startOver = () => { setSuggested(null); setRegions(initialRegions(use, mode)); setFresh(n => n + 1); };
    const cutsText = planCuts.map(c => `${c.count} corte${c.count === 1 ? "" : "s"} de ${fmtDims({ width_mm: c.w, length_mm: c.l })}`).join(" y ");

    if (!use) return null;

    const drawing = way === "dibujo" && drawable;
    const retazos = drawing ? remnantsOf(regions, mode) : [];
    const nRetazos = drawing ? retazos.length : rows.length;
    const setRow = (i, patch) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    const sizeRow = (r) => {
        if (r.kind === "irregular") { const a = parseNum(r.size); return a > 0 ? r3(a) : 0; }
        const l = toMm(r.l, unit);
        if (mode === "length") return l > 0 ? r3(l / 1000) : 0;
        const w = toMm(r.w, unit);
        return w > 0 && l > 0 ? r3((w * l) / 1e6) : 0;
    };
    const back = drawing
        ? r3(retazos.reduce((s, r) => s + r.size, 0))
        : r3(rows.reduce((s, r) => s + sizeRow(r), 0));
    const consumed = r3(use.size - back);
    const over = consumed < 0;
    const cost = Math.max(0, consumed) * (use.unit_cost || 0);

    // Lo que pedían los cortes de la receta asignados a esta pieza. Si se va a consumir mucho
    // más, lo típico es que sobró un pedazo y no se anotó: saldría del inventario sin estar gastado.
    const expected = r3(planCuts.reduce((s, c) => s + c.count * (mode === "length" ? c.l / 1000 : (c.w * c.l) / 1e6), 0));
    const excess = r3(consumed - expected);
    const tooMuch = planCuts.length > 0 && !over && excess > 0.25 * expected && excess >= (mode === "length" ? 0.1 : 0.05);

    const save = async (force = false) => {
        const remnants = [];
        for (let i = 0; !drawing && i < rows.length; i++) {
            const r = rows[i];
            if (r.kind === "irregular") {
                const a = parseNum(r.size);
                if (!(a > 0)) return notify(`Retazo ${i + 1}: escribe su área aproximada`, "err");
                remnants.push({ irregular: true, size: a });
            } else if (mode === "length") {
                const l = toMm(r.l, unit);
                if (!(l > 0)) return notify(`Retazo ${i + 1}: escribe el largo`, "err");
                remnants.push({ length_mm: l });
            } else {
                const w = toMm(r.w, unit), l = toMm(r.l, unit);
                if (!(w > 0) || !(l > 0)) return notify(`Retazo ${i + 1}: escribe el ancho y el largo`, "err");
                remnants.push({ width_mm: w, length_mm: l });
            }
        }
        if (over) return notify("Los retazos suman más que la pieza entregada", "err");
        if (consumed <= 0) return notify("No se consumió nada: si volvió sin cortar, usa Volvió sin cortar", "err");
        if (tooMuch && !force) { setAskOver(true); return; }

        try {
            await api.factory.returnPiece(order.id, use.id, drawing
                ? { layout: { regions }, note: note.trim() || null }
                : { remnants, note: note.trim() || null });
            notify(nRetazos ? `Devolución registrada: ${nRetazos} retazo(s) nuevo(s)` : "Devolución registrada: se gastó completa");
            if (print && nRetazos) {
                // Los números los pone el servidor: se leen de la orden ya actualizada.
                const r = await api.factory.order(order.id);
                const u = (r.data.uses || []).find(x => x.id === use.id);
                if (u?.remnants?.length) printPieceLabels(u.remnants.map(x => ({ ...x, product_name: use.product_name, unit: use.unit })), printerWidth);
            }
            onDone?.();
        } catch (e) {
            notify(errMsg(e), "err");
        }
    };

    return (
        <>
        <Modal open={!!use} onClose={askOver ? () => {} : onClose} title={`Devolución de #${use.code}`} width={drawing ? 720 : 600}
            footer={
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="sm:mr-auto text-[13px]">
                        <span className="text-content-subtle">Se consumió </span>
                        <span className={`font-semibold tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>{fmtSize(consumed, use.unit)}</span>
                        {!over && <> <span className="text-content-subtle">· </span><Money value={fmtBase(cost, baseCurrency)} className="font-semibold text-content dark:text-white" /></>}
                        {tooMuch && (
                            <div className="text-[12px] text-amber-700 dark:text-amber-400">
                                {fmtSize(excess, use.unit)} más de lo que pide la receta ({fmtSize(expected, use.unit)})
                            </div>
                        )}
                    </div>
                    <div className="flex flex-col-reverse sm:flex-row gap-2">
                        <button onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
                        <Button onClick={() => save()} disabled={over} className="h-12 sm:h-10 px-5">Registrar devolución</Button>
                    </div>
                </div>
            }>
            <div className="space-y-4">
                <div className={`${CARD} px-4 py-3 flex items-center justify-between gap-3`}>
                    <div className="min-w-0">
                        <div className="text-[12px] text-content-subtle">Se entregó</div>
                        <div className="text-[14px] font-semibold text-content dark:text-white tabular-nums">#{use.code} · {fmtDims(use)}</div>
                        <div className="text-[12px] text-content-subtle truncate">{toNameCase(use.product_name)}</div>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-[12px] text-content-subtle">{mode === "length" ? "Largo" : "Área"}</div>
                        <div className="text-[14px] font-semibold text-content dark:text-white tabular-nums">{fmtSize(use.size, use.unit)}</div>
                    </div>
                </div>

                {drawable && (
                    <Segmented className="w-full [&>button]:flex-1 [&>button]:justify-center" value={way} onChange={setWay}
                        options={[{ key: "dibujo", label: "Dibujar el corte" }, { key: "medidas", label: "Escribir medidas" }]} />
                )}

                {drawing ? (
                <div className="space-y-3">
                    {suggested && (
                        <div className="rounded-xl bg-surface-2/70 dark:bg-white/[0.04] px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2">
                            <div className="flex-1 min-w-0 text-[13px]">
                                <div className="font-semibold text-content dark:text-white">Sugerido según la receta: {cutsText}</div>
                                <div className={suggested.placed < suggested.total ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}>
                                    {suggested.placed < suggested.total
                                        ? `Solo caben ${suggested.placed} de los ${suggested.total} cortes en esta pieza: revisa el dibujo.`
                                        : "Si el taller lo cortó distinto, pica sobre el dibujo o empieza de cero."}
                                </div>
                            </div>
                            <button onClick={startOver} className="h-[36px] px-3 rounded-lg text-[13px] font-medium btn-outline shrink-0">Empezar de cero</button>
                        </div>
                    )}
                    <CutEditor key={fresh} piece={use} mode={mode} value={regions} onChange={setRegions} unit={unit} setUnit={setUnit} />
                    <div className="text-[13px]">
                        <span className="text-[12px] font-medium text-content-subtle">Retazos que vuelven</span>
                        {retazos.length === 0 ? (
                            <p className="text-content-subtle mt-1">Ninguno: la pieza se gastó completa. Pica donde se cortó y marca lo que vuelve.</p>
                        ) : (
                            <ul className="mt-1 space-y-0.5">
                                {retazos.map((r, i) => (
                                    <li key={i} className="flex justify-between gap-3 tabular-nums">
                                        <span className="text-content dark:text-white">Retazo {i + 1} · {r.irregular ? `una pieza irregular de ${fmtDims(r)} por fuera` : fmtDims(r)}</span>
                                        <span className="text-content-subtle">{fmtSize(r.size, use.unit)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                ) : (
                <div>
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                        <span className="text-[12px] font-medium text-content-subtle">Retazos que vuelven</span>
                        <UnitSwitch unit={unit} setUnit={setUnit} />
                    </div>
                    {rows.length === 0 && (
                        <p className="text-[13px] text-content-subtle mb-2">Sin retazos: la pieza se gastó completa.</p>
                    )}
                    <div className="space-y-2">
                        {rows.map((r, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span className="w-6 text-[12px] text-content-subtle tabular-nums shrink-0">{i + 1}</span>
                                <div className="flex-1 min-w-0">
                                    {r.kind === "rect" ? (
                                        <DimsInput mode={mode} w={r.w} l={r.l} onW={v => setRow(i, { w: v })} onL={v => setRow(i, { l: v })} unit={unit} autoFocus={i === rows.length - 1} />
                                    ) : (
                                        <div className="relative">
                                            <input value={r.size} onChange={e => setRow(i, { size: e.target.value })} inputMode="decimal"
                                                placeholder="Área aproximada de la pieza irregular" data-autofocus={i === rows.length - 1 || undefined}
                                                className={`${INPUT} pr-10 tabular-nums`} />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">{unitLabel(use.unit)}</span>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} aria-label="Quitar retazo" className={QUITAR}>
                                    <XIcon />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className={`grid grid-cols-1 ${mode === "area" ? "sm:grid-cols-2" : ""} gap-2 mt-2`}>
                        <button onClick={() => setRows(rs => [...rs, rect()])} className={AGREGAR}><PlusIcon /> {mode === "area" ? "Retazo rectangular" : "Retazo"}</button>
                        {mode === "area" && (
                            <button onClick={() => setRows(rs => [...rs, irregular()])} className={AGREGAR}><PlusIcon /> Pieza irregular</button>
                        )}
                    </div>
                </div>
                )}

                <Field label="Qué se fabricó y por qué quedó así" hint="Opcional">
                    <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000}
                        placeholder={mode === "area" ? "Se cortó el mesón a lo largo; queda una tira de 0,84 m" : "Se cortaron las patas de la mesa; queda un tramo de 2,5 m"}
                        className={`${INPUT} h-auto py-2 resize-none`} />
                </Field>

                {nRetazos > 0 && (
                    <label className="flex items-center gap-2.5 cursor-pointer select-none" onClick={() => setPrint(p => !p)}>
                        <Check checked={print} onChange={setPrint} title="Imprimir etiquetas" />
                        <span className="text-[13px] text-content dark:text-white">Imprimir las etiquetas de los retazos</span>
                    </label>
                )}
            </div>
        </Modal>

        <ConfirmModal
            isOpen={askOver}
            type="warning"
            title="¿No sobró nada útil?"
            message={`La receta pedía ${fmtSize(expected, use.unit)} de esta pieza y se van a consumir ${fmtSize(consumed, use.unit)}. Si sobró un pedazo que sirve, regístralo como retazo; si no, sale del inventario como gastado.`}
            confirmText="Registrar igual"
            cancelText="Revisar"
            onConfirm={async () => { await save(true); setAskOver(false); }}
            onCancel={() => setAskOver(false)}
        />
        </>
    );
}
