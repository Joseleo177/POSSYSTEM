import { useCallback, useEffect, useState } from "react";
import Modal from "../ui/Modal";
import Money from "../ui/Money";
import StatusMark from "../ui/StatusMark";
import ConfirmModal from "../ui/ConfirmModal";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useKeyedAction } from "./shared";
import { toNameCase, fmtBase, fmtDateShort, fmtTime } from "../../helpers";
import { fmtQtyUnit, isIntegerUnit } from "../../helpers/unitFormatter";
import { printPieceLabels } from "../../helpers/printPieceLabels";
import {
    INPUT, AGREGAR, CARD, Field, PlusIcon, XIcon, SHEET_ICON,
    ORDER_STATUS, SearchPick, fmtDims, fmtSize, parseNum, errMsg,
} from "./shared";
import OrderFormModal from "./OrderFormModal";
import DeliverPieceModal from "./DeliverPieceModal";
import { CutPreview } from "./CutLayout";
import ReturnPieceModal from "./ReturnPieceModal";
import InvoiceModal from "./InvoiceModal";
import StageMoveModal from "./StageMoveModal";

const fmtMin = (m) => {
    const n = Number(m || 0);
    if (n < 60) return `${n.toLocaleString("es-VE", { maximumFractionDigits: 1 })} min`;
    const h = Math.floor(n / 60), r = Math.round(n % 60);
    return r ? `${h} h ${r} min` : `${h} h`;
};
const fmtParam = (p) => p.kind === "medida"
    ? `${p.label} ${Number(p.value).toLocaleString("es-VE", { maximumFractionDigits: 3 })} ${p.unit}`
    : `${p.label} ${Number(p.value).toLocaleString("es-VE")}`;

const Dato = ({ label, children }) => (
    <div className="min-w-0">
        <dt className="text-[12px] text-content-subtle">{label}</dt>
        <dd className="text-[13px] font-medium text-content dark:text-white mt-0.5 truncate">{children}</dd>
    </div>
);

const SectionTitle = ({ children, right }) => (
    <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-[14px] font-semibold text-content dark:text-white">{children}</h3>
        {right}
    </div>
);

/**
 * Detalle de una orden de fabricación.
 *
 * Las piezas son el corazón: cada pieza o retazo que se entregó al taller, y al volver, cuánto
 * se consumió, qué retazos quedaron y por qué. Debajo, los accesorios, y a la derecha (abajo
 * en el teléfono) el costo contra el precio del lote.
 */
export default function OrderDetailModal({ orderId, materials, warehouses, stages = [], onClose, onChanged, onOpenPiece }) {
    const { notify, baseCurrency, can, printerWidth } = useApp();
    const canManage = can("factory.manage");
    const canInvoice = can("factory.invoice");
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(false);

    const [editing, setEditing] = useState(false);
    const [delivering, setDelivering] = useState(null);   // null · {} · { productId, w_mm, l_mm }
    const [returning, setReturning] = useState(null);
    const [invoicing, setInvoicing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [undoUse, setUndoUse] = useState(null);
    const [moving, setMoving] = useState(null);     // null · { finish }

    const [itemProduct, setItemProduct] = useState(null);
    const [itemQty, setItemQty] = useState("");
    const { run, busy } = useKeyedAction();

    const load = useCallback(async () => {
        if (!orderId) return;
        try {
            const r = await api.factory.order(orderId);
            setOrder(r.data);
        } catch (e) {
            notify(errMsg(e, "No se pudo abrir la orden"), "err");
        }
    }, [orderId]);

    useEffect(() => {
        if (!orderId) { setOrder(null); return; }
        setLoading(true);
        setItemProduct(null); setItemQty("");
        load().finally(() => setLoading(false));
    }, [orderId]);

    const changed = async () => { await load(); onChanged?.(); };

    const searchAccessories = useCallback(async (term) => {
        const r = await api.products.getAll({ search: term, is_combo: false, is_service: false, limit: 20 });
        return (r.data || []).filter(p => !p.piece_mode && !p.is_variant_parent);
    }, []);

    if (!orderId) return null;
    const money = (n) => fmtBase(n, baseCurrency);
    const o = order;
    const open = o?.status === "abierta";
    const enTaller = (o?.uses || []).filter(u => !u.returned_at).length;
    // Abierta y con receta, la utilidad se mide contra lo que la receta dice que va a costar
    // (o lo ya gastado, si pasó de eso): contra lo consumido hasta ahora, una orden recién
    // empezada mostraba 100% de utilidad.
    const estimada = !!(o?.plan && o.status === "abierta");
    const costoBase = o ? (estimada ? Math.max(o.total_cost, o.plan.estimated_cost) : o.total_cost) : 0;
    const margen = o && o.sale_price != null ? o.sale_price - costoBase : null;
    const porFacturar = o && o.destination === "cliente" && !o.invoiced && o.status !== "anulada";
    const encima = editing || !!delivering || !!returning || invoicing || cancelling || !!undoUse || !!moving;

    const action = (key, fn, okMsg) => run(key, async () => {
        try {
            await fn();
            if (okMsg) notify(okMsg);
            await changed();
        } catch (e) { notify(errMsg(e), "err"); }
    });

    const addItem = () => {
        const q = parseNum(itemQty);
        if (!itemProduct) return notify("Elige el accesorio", "err");
        if (!(q > 0)) return notify("Escribe la cantidad", "err");
        if (isIntegerUnit(itemProduct.unit) && !Number.isInteger(q)) return notify("Ese producto se cuenta por unidades", "err");
        return action("item", async () => {
            await api.factory.addItem(o.id, { product_id: itemProduct.id, quantity: q });
            setItemProduct(null); setItemQty("");
        }, "Accesorio descontado del inventario");
    };

    // Acción principal según el momento de la orden: una sola en tinta, el resto en borde.
    const footer = o && (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            {canManage && open && (
                <button onClick={() => { setCancelReason(""); setCancelling(true); }}
                    className="h-12 sm:h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-red-600 dark:hover:text-red-400 sm:mr-auto">
                    Anular orden
                </button>
            )}
            {canManage && o.status === "terminada" && !o.invoiced && (
                <Button variant="ghost" onClick={() => action("reopen", () => api.factory.reopen(o.id), "Orden reabierta")}
                    className="h-12 sm:h-10 sm:mr-auto">Reabrir</Button>
            )}
            {canManage && o.status === "terminada" && o.invoiced && <span className="sm:mr-auto" />}
            {porFacturar && canInvoice && (
                <Button variant={open ? "ghost" : "primary"} onClick={() => setInvoicing(true)} className="h-12 sm:h-10">
                    Facturar{o.sale_price ? ` ${money(o.sale_price)}` : ""}
                </Button>
            )}
            {canManage && open && (
                <Button onClick={() => setMoving({ finish: true })} className="h-12 sm:h-10">
                    Terminar orden
                </Button>
            )}
        </div>
    );

    return (
        <>
            {/* Con otra ventana encima, Escape le toca a ella: los dos Modal escuchan en window y
                sin esto se cerraban juntos. */}
            <Modal open={!!orderId} onClose={encima ? () => {} : onClose} width={860} title={o ? o.code : "Orden"} footer={footer}>
                {loading || !o ? (
                    <div className="py-20 flex justify-center"><Spinner /></div>
                ) : (
                    <div className="space-y-5">
                        {/* Cabecera */}
                        <div className="flex items-start gap-3">
                            <span className="w-10 h-10 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-muted dark:text-white/60 flex items-center justify-center shrink-0">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={SHEET_ICON} /></svg>
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="text-[20px] font-semibold tracking-[-0.01em] text-content dark:text-white leading-tight break-words">{o.description}</div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    <StatusMark status={o.status} map={ORDER_STATUS} />
                                    <span className="text-[12px] text-content-subtle">
                                        {o.type === "estandar" ? "Estándar" : "A medida"} · {o.destination === "stock" ? "Para inventario" : "Para un cliente"}
                                    </span>
                                    {o.Sale && <span className="text-[12px] text-content-subtle tabular-nums">Factura {o.Sale.invoice_number}{o.invoiced ? "" : " (anulada)"}</span>}
                                    {open && <span className="text-[12px] font-medium text-content dark:text-white">{o.current_stage ? `En ${o.current_stage.name}` : "Por empezar"}</span>}
                                </div>
                            </div>
                            {canManage && open && stages.length > 0 && (
                                <button onClick={() => setMoving({})} className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium shrink-0">Cambiar etapa</button>
                            )}
                            {canManage && o.status !== "anulada" && (
                                <button onClick={() => setEditing(true)} className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium shrink-0">Editar</button>
                            )}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
                            <div className="space-y-5 min-w-0">
                                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
                                    <Dato label={o.destination === "stock" ? "Producto" : "Cliente"}>
                                        {o.destination === "stock"
                                            ? toNameCase(o.Product?.name || "—")
                                            : o.Customer ? toNameCase(o.Customer.name) : <span className="text-amber-700 dark:text-amber-400">Sin cliente</span>}
                                    </Dato>
                                    <Dato label="Cantidad">{o.Product ? fmtQtyUnit(o.quantity, o.Product.unit).toLowerCase() : Number(o.quantity).toLocaleString("es-VE")}</Dato>
                                    <Dato label="Almacén">{toNameCase(o.Warehouse?.name || "—")}</Dato>
                                    <Dato label="Creada">{fmtDateShort(o.created_at)} · {fmtTime(o.created_at)}</Dato>
                                    {o.due_date && <Dato label="Comprometida">{fmtDateShort(o.due_date)}</Dato>}
                                    {o.assignee && <Dato label="Responsable">{o.assignee}</Dato>}
                                </dl>
                                {o.params?.length > 0 && (
                                    <p className="text-[13px] text-content dark:text-white">{o.params.map(fmtParam).join(" · ")}</p>
                                )}
                                {o.notes && <p className="text-[13px] text-content-muted dark:text-white/70 whitespace-pre-line">{o.notes}</p>}
                                {o.status === "anulada" && o.cancel_reason && (
                                    <p className="text-[13px] text-content-subtle">Anulada: {o.cancel_reason}</p>
                                )}

                                {/* Receta: lo que debía llevar contra lo que se gastó */}
                                {o.plan && (
                                    <section>
                                        <SectionTitle>Receta</SectionTitle>
                                        {o.instructions && (
                                            <p className="text-[13px] text-content-muted dark:text-white/70 whitespace-pre-line mb-2">{o.instructions}</p>
                                        )}
                                        <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                                            {o.plan.lines.map(l => (
                                                <div key={l.id} className="px-4 py-2.5 flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[13px] font-medium text-content dark:text-white truncate">
                                                            {l.kind === "material"
                                                                ? `${l.total_cuts} corte${l.total_cuts === 1 ? "" : "s"} de ${fmtDims({ width_mm: l.cut_width_mm, length_mm: l.cut_length_mm })}`
                                                                : l.kind === "proceso"
                                                                ? `${l.name} · ${fmtMin(l.expected)}`
                                                                : `${Number(l.expected).toLocaleString("es-VE")} × ${toNameCase(l.name)}`}
                                                        </div>
                                                        <div className="text-[12px] text-content-subtle truncate">
                                                            {l.kind === "material"
                                                                ? `${toNameCase(l.name)} · ${fmtSize(l.expected, l.unit)}`
                                                                : l.kind === "proceso" ? "Mano de obra" : "Accesorio"}
                                                        </div>
                                                        {/* Qué piezas cubren este corte y cuánto falta */}
                                                        {l.kind === "material" && (
                                                            <div className={`text-[12px] mt-0.5 font-medium ${l.cuts_missing === 0 ? "text-emerald-700 dark:text-emerald-400" : l.cuts_covered > 0 ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                                {l.cuts_missing === 0
                                                                    ? <span className="inline-flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>Cubierto con {l.pieces.map(x => `#${x.code}`).join(", ")}</span>
                                                                    : l.cuts_covered > 0
                                                                    ? `${l.cuts_covered} de ${l.cuts_needed} con ${l.pieces.map(x => `#${x.code}`).join(", ")} · falta${l.cuts_missing === 1 ? "" : "n"} ${l.cuts_missing}`
                                                                    : "Sin pieza asignada"}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <Money value={money(l.cost)} className="text-[13px] text-content-subtle" />
                                                    {canManage && open && l.kind === "material" && l.cuts_missing > 0 && (
                                                        <button onClick={() => setDelivering({
                                                            productId: l.component_id, w_mm: l.cut_width_mm, l_mm: l.cut_length_mm,
                                                            planId: l.id, needed: l.cuts_needed, missing: l.cuts_missing,
                                                        })}
                                                            className="btn-outline h-8 px-3 rounded-lg text-[12px] font-medium shrink-0">
                                                            Entregar
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        {/* Por componente: debía contra usado. Lo de más es la merma. */}
                                        <div className="mt-2 space-y-1">
                                            {o.plan.by_component.map(c => {
                                                const falta = c.kind === "accesorio" && c.actual < c.expected;
                                                const merma = (c.kind === "material" || c.kind === "proceso") && c.actual > 0 && c.diff > 0;
                                                return (
                                                    <div key={c.key} className="text-[12px] flex justify-between gap-3">
                                                        <span className="text-content-subtle truncate">{c.kind === "proceso" ? c.name : toNameCase(c.name)}</span>
                                                        <span className={`tabular-nums shrink-0 ${merma ? "text-amber-700 dark:text-amber-400" : "text-content-subtle"}`}>
                                                            {c.kind === "proceso"
                                                                ? (c.actual > 0
                                                                    ? `Debía ${fmtMin(c.expected)} · tomó ${fmtMin(c.actual)}${c.diff_pct != null ? ` (${c.diff_pct > 0 ? "+" : ""}${c.diff_pct.toLocaleString("es-VE")}%)` : ""}`
                                                                    : `Debe tomar ${fmtMin(c.expected)}`)
                                                                : c.kind === "material"
                                                                ? (c.actual > 0
                                                                    ? `Debía ${fmtSize(c.expected, c.unit)} · usó ${fmtSize(c.actual, c.unit)}${c.diff_pct != null ? ` (${c.diff_pct > 0 ? "+" : ""}${c.diff_pct.toLocaleString("es-VE")}%)` : ""}`
                                                                    : `Debe usar ${fmtSize(c.expected, c.unit)}`)
                                                                : (falta && open
                                                                    ? `Anotados ${Number(c.actual).toLocaleString("es-VE")} de ${Number(c.expected).toLocaleString("es-VE")} · el resto sale al terminar`
                                                                    : `Anotados ${Number(c.actual).toLocaleString("es-VE")} de ${Number(c.expected).toLocaleString("es-VE")}`)}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                )}

                                {/* Paso por el taller: cada etapa con su tiempo y su costo */}
                                {o.stages?.length > 0 && (
                                    <section>
                                        <SectionTitle right={<Money value={money(o.labor_cost)} className="text-[13px] font-semibold text-content dark:text-white" />}>Taller</SectionTitle>
                                        <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                                            {o.stages.map(st => (
                                                <div key={st.id} className="px-4 py-2.5 flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[13px] font-medium text-content dark:text-white truncate">{st.stage_name}{st.worker ? ` · ${st.worker}` : ""}</div>
                                                        <div className="text-[12px] text-content-subtle truncate">
                                                            {st.finished_at
                                                                ? `${fmtMin(st.minutes)} · ${fmtDateShort(st.started_at)}`
                                                                : `En curso desde ${fmtDateShort(st.started_at)} · ${fmtTime(st.started_at)}`}
                                                            {st.note ? ` · ${st.note}` : ""}
                                                        </div>
                                                    </div>
                                                    {st.finished_at
                                                        ? <Money value={money(st.cost)} className="text-[13px] text-content-subtle" />
                                                        : <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">En curso</span>}
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                )}

                                {/* Piezas */}
                                <section>
                                    <SectionTitle right={enTaller > 0 && (
                                        <span className="text-[12px] text-amber-700 dark:text-amber-400">{enTaller === 1 ? "1 en el taller" : `${enTaller} en el taller`}</span>
                                    )}>Piezas y retazos</SectionTitle>

                                    {o.uses.length === 0 && (
                                        <div className={`${CARD} px-4 py-6 text-center`}>
                                            <div className="text-[13px] font-semibold text-content dark:text-white">Todavía no se ha entregado material</div>
                                            <div className="text-[12px] text-content-subtle mt-1">Entrega al taller la pieza o el retazo con que se va a fabricar.</div>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {o.uses.map(u => {
                                            const vuelto = !!u.returned_at;
                                            return (
                                                <div key={u.id} className={`${CARD} px-4 py-3`} style={!vuelto ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined}>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <button onClick={() => onOpenPiece?.(u.piece_id)} className="min-w-0 text-left">
                                                            <div className="text-[14px] font-semibold text-content dark:text-white tabular-nums">#{u.code}</div>
                                                            <div className="text-[12px] text-content-subtle truncate">
                                                                {toNameCase(u.product_name)} · {fmtDims(u)}{u.width_mm || u.is_irregular ? ` · ${fmtSize(u.size, u.unit)}` : ""}
                                                            </div>
                                                            {/* Los cortes de la receta que cubre: pueden ser varios (cuerpo y puertas) */}
                                                            {(() => {
                                                                const para = (u.cuts || []).map(c => {
                                                                    const pl = o.plan?.lines.find(x => x.id === c.plan_id);
                                                                    return pl ? `${c.cuts} corte${c.cuts === 1 ? "" : "s"} de ${fmtDims({ width_mm: pl.cut_width_mm, length_mm: pl.cut_length_mm })}` : null;
                                                                }).filter(Boolean);
                                                                return para.length ? <div className="text-[12px] text-content-subtle">Para {para.join(" y ")}</div> : null;
                                                            })()}
                                                        </button>
                                                        {vuelto ? (
                                                            <div className="text-right shrink-0">
                                                                <Money value={money(u.cost)} className="text-[13px] font-semibold text-content dark:text-white" />
                                                                <div className="text-[12px] text-content-subtle tabular-nums">{fmtSize(u.consumed, u.unit)} usados</div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[12px] font-semibold text-amber-700 dark:text-amber-400 whitespace-nowrap">En el taller</span>
                                                        )}
                                                    </div>

                                                    {vuelto && (
                                                        <div className="mt-2 space-y-1.5">
                                                            {u.note && <p className="text-[13px] text-content-muted dark:text-white/70">{u.note}</p>}
                                                            {u.layout && <CutPreview piece={u} mode={u.piece_mode} layout={u.layout} maxHeight="140px" />}
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {u.remnants.length === 0 ? (
                                                                    <span className="text-[12px] text-content-subtle">Se gastó completa</span>
                                                                ) : u.remnants.map(r => (
                                                                    <button key={r.id} onClick={() => onOpenPiece?.(r.id)}
                                                                        className="h-7 px-2.5 rounded-md bg-surface-3 dark:bg-white/[0.06] text-[12px] text-content dark:text-white tabular-nums hover:bg-surface-2 dark:hover:bg-white/10">
                                                                        #{r.code} · {fmtDims(r)}{r.is_irregular ? ` ${fmtSize(r.size, u.unit)}` : ""}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {canManage && open && (
                                                        <div className="mt-3 flex flex-wrap items-center gap-2">
                                                            {!vuelto ? (
                                                                <>
                                                                    <button onClick={() => setReturning(u)} className="btn-accent h-9 px-3 rounded-lg text-[13px] font-semibold">Registrar devolución</button>
                                                                    <button onClick={() => action(`cancel-${u.id}`, () => api.factory.cancelDelivery(o.id, u.id), `#${u.code} volvió sin cortar`)}
                                                                        disabled={busy(`cancel-${u.id}`)}
                                                                        className="h-9 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                                                                        Volvió sin cortar
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    {u.remnants.length > 0 && (
                                                                        <button onClick={() => printPieceLabels(u.remnants.map(r => ({ ...r, product_name: u.product_name, unit: u.unit })), printerWidth)}
                                                                            className="h-8 px-3 rounded-lg text-[12px] font-medium btn-outline">
                                                                            Etiquetas de retazos
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => setUndoUse(u)} className="h-8 px-3 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white">
                                                                        Deshacer devolución
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {canManage && open && (
                                        <button onClick={() => setDelivering({})} className={`${AGREGAR} mt-2`}>
                                            <PlusIcon /> Entregar pieza o retazo
                                        </button>
                                    )}
                                </section>

                                {/* Accesorios */}
                                <section>
                                    <SectionTitle>Accesorios</SectionTitle>
                                    {o.items.length === 0 && !(canManage && open) && (
                                        <p className="text-[13px] text-content-subtle">Sin accesorios.</p>
                                    )}
                                    {o.items.length > 0 && (
                                        <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                                            {o.items.map(it => (
                                                <div key={it.id} className="px-4 py-2.5 flex items-center gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(it.product_name)}</div>
                                                        <div className="text-[12px] text-content-subtle tabular-nums">
                                                            {Number(it.quantity).toLocaleString("es-VE")} × {money(it.unit_cost)}
                                                        </div>
                                                    </div>
                                                    <Money value={money(it.quantity * it.unit_cost)} className="text-[13px] font-semibold text-content dark:text-white" />
                                                    {canManage && open && (
                                                        <button onClick={() => action(`rm-${it.id}`, () => api.factory.removeItem(o.id, it.id), "Accesorio devuelto al inventario")}
                                                            disabled={busy(`rm-${it.id}`)} aria-label="Quitar" className="w-8 h-8 rounded-lg flex items-center justify-center text-content-subtle hover:text-red-600 dark:hover:text-red-400">
                                                            {busy(`rm-${it.id}`) ? <Spinner /> : <XIcon />}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {canManage && open && (
                                        <div className="mt-2 flex flex-col sm:flex-row gap-2">
                                            <div className="flex-1 min-w-0">
                                                <SearchPick searchFn={searchAccessories} value={itemProduct} onChange={setItemProduct}
                                                    placeholder="Tornillos, bisagras…"
                                                    renderItem={p => (
                                                        <span className="flex items-center justify-between gap-3">
                                                            <span className="truncate">{toNameCase(p.name)}</span>
                                                            <span className="text-[11px] text-content-subtle shrink-0">{p.unit}</span>
                                                        </span>
                                                    )} />
                                            </div>
                                            <div className="flex gap-2">
                                                <input value={itemQty} onChange={e => setItemQty(e.target.value)} inputMode="decimal" placeholder="Cant."
                                                    className={`${INPUT} sm:w-24 tabular-nums`} />
                                                <button onClick={addItem} disabled={busy("item")} className="btn-outline h-10 px-4 rounded-lg text-[13px] font-medium shrink-0 flex items-center gap-2">
                                                    {busy("item") && <Spinner />} Agregar
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </section>
                            </div>

                            {/* Costo contra precio */}
                            <aside className="space-y-3">
                                <div className={`${CARD} p-4`}>
                                    <div className="text-[12px] text-content-subtle">Costo de la orden</div>
                                    <Money value={money(o.total_cost)} className="block text-[24px] font-bold tracking-tight text-content dark:text-white mt-0.5" />
                                    {o.quantity !== 1 && (
                                        <div className="text-[12px] text-content-subtle tabular-nums">{money(o.unit_cost)} por unidad</div>
                                    )}
                                    <dl className="mt-3 pt-3 border-t border-border/60 dark:border-white/[0.06] space-y-1.5 text-[13px]">
                                        <div className="flex justify-between gap-3"><dt className="text-content-subtle">Material</dt><dd><Money value={money(o.material_cost)} /></dd></div>
                                        <div className="flex justify-between gap-3"><dt className="text-content-subtle">Accesorios</dt><dd><Money value={money(o.accessories_cost)} /></dd></div>
                                        <div className="flex justify-between gap-3"><dt className="text-content-subtle">Mano de obra</dt><dd><Money value={money(o.labor_cost)} /></dd></div>
                                        {o.plan && (
                                            <div className="flex justify-between gap-3 pt-1.5 border-t border-border/60 dark:border-white/[0.06]">
                                                <dt className="text-content-subtle">Según la receta</dt><dd><Money value={money(o.plan.estimated_cost)} /></dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>

                                {o.destination === "cliente" ? (
                                    <div className={`${CARD} p-4`}>
                                        <div className="text-[12px] text-content-subtle">Precio del lote</div>
                                        {o.sale_price != null ? (
                                            <>
                                                <Money value={money(o.sale_price)} className="block text-[22px] font-bold tracking-tight text-content dark:text-white mt-0.5" />
                                                <div className={`mt-2 text-[13px] font-medium ${margen < 0 ? "text-red-600 dark:text-red-400" : "text-content dark:text-white"}`}>
                                                    {margen < 0 ? "Pérdida" : "Utilidad"}{estimada ? " estimada" : ""} <Money value={money(Math.abs(margen))} />
                                                    {o.sale_price > 0 && (
                                                        <span className="text-content-subtle font-normal"> · {Math.round((margen / o.sale_price) * 100)}%</span>
                                                    )}
                                                </div>
                                                {open && <div className="text-[11px] text-content-subtle mt-1">{estimada ? "Según la receta" : "Con lo consumido hasta ahora"}</div>}
                                            </>
                                        ) : (
                                            <div className="text-[13px] text-content-subtle mt-1">Sin precio. Ponlo al editar la orden o al facturar.</div>
                                        )}
                                    </div>
                                ) : (
                                    <div className={`${CARD} p-4`}>
                                        <div className="text-[12px] text-content-subtle">{o.status === "terminada" ? "Entró al inventario" : "Al terminar"}</div>
                                        <div className="text-[13px] text-content dark:text-white mt-1">
                                            {o.status === "terminada" ? "Entraron" : "Entran"} {o.Product ? fmtQtyUnit(o.quantity, o.Product.unit).toLowerCase() : o.quantity} de {toNameCase(o.Product?.name || "")} a <Money value={money(o.unit_cost)} /> cada una.
                                        </div>
                                    </div>
                                )}
                            </aside>
                        </div>
                    </div>
                )}
            </Modal>

            {o && (
                <>
                    <OrderFormModal open={editing} order={o} warehouses={warehouses}
                        onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await changed(); }} />
                    <DeliverPieceModal open={!!delivering} initial={delivering?.productId ? delivering : null} order={o} materials={materials}
                        onClose={() => setDelivering(null)} onDone={async () => { setDelivering(null); await changed(); }} />
                    <ReturnPieceModal use={returning} order={o}
                        onClose={() => setReturning(null)} onDone={async () => { setReturning(null); await changed(); }} />
                    <StageMoveModal
                        order={moving ? { id: o.id, code: o.code, current_stage_id: o.current_stage?.id ?? null, stage_name: o.current_stage?.name, assignee: o.assignee } : null}
                        finish={!!moving?.finish} stages={stages}
                        onClose={() => setMoving(null)} onDone={async () => { setMoving(null); await changed(); }} />
                    <InvoiceModal open={invoicing} order={o}
                        onClose={() => setInvoicing(false)} onDone={async () => { setInvoicing(false); await changed(); }}
                        onEdit={() => { setInvoicing(false); setEditing(true); }} />
                </>
            )}

            <ConfirmModal
                isOpen={!!undoUse}
                title="Deshacer devolución"
                message={undoUse ? `La pieza #${undoUse.code} vuelve a quedar en el taller, se borran sus retazos y el material consumido regresa al inventario.` : ""}
                confirmText="Deshacer"
                type="warning"
                onCancel={() => setUndoUse(null)}
                onConfirm={async () => {
                    try {
                        await api.factory.undoReturn(o.id, undoUse.id);
                        notify("Devolución deshecha");
                        setUndoUse(null);
                        await changed();
                    } catch (e) { notify(errMsg(e), "err"); }
                }}
            />

            <Modal open={cancelling} onClose={() => setCancelling(false)} title={o ? `Anular ${o.code}` : "Anular"} width={440}
                footer={
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <button onClick={() => setCancelling(false)} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Volver</button>
                        <Button variant="danger" className="h-12 sm:h-10 px-5" onClick={async () => {
                            if (!cancelReason.trim()) return notify("Escribe el motivo", "err");
                            try {
                                await api.factory.cancel(o.id, { reason: cancelReason.trim() });
                                notify("Orden anulada");
                                setCancelling(false);
                                await changed();
                            } catch (e) { notify(errMsg(e), "err"); }
                        }}>Anular orden</Button>
                    </div>
                }>
                <p className="text-[13px] text-content-muted dark:text-white/70 mb-3">
                    Las piezas que estén en el taller vuelven a quedar disponibles y los accesorios regresan al inventario.
                </p>
                <Field label="Motivo">
                    <input value={cancelReason} onChange={e => setCancelReason(e.target.value)} data-autofocus className={INPUT}
                        placeholder="El cliente canceló el pedido" />
                </Field>
            </Modal>
        </>
    );
}
