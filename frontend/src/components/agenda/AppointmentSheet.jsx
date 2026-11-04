import { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import ConfirmModal from "../ui/ConfirmModal";
import StatusMark from "../ui/StatusMark";
import Money from "../ui/Money";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { INPUT, AGREGAR, QUITAR } from "../fabrica/shared";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { useDebounce } from "../../hooks/useDebounce";
import { fmtMoney, toNameCase } from "../../helpers";
import { hhmm, fechaLarga, duracion, CITA_STATUS, estadoVista, enlaceWhatsapp, COLORES } from "./shared";

// Ficha de una cita con lo que se puede hacer en su estado:
//   por confirmar → confirmar · confirmada → empezar · en curso → terminar · terminada → cobrar
// Terminar abre la cuenta (en espera, como la de una mesa) con los servicios y lo que se haya
// vendido en el sillón; cobrarla abre el cobro de siempre.
export default function AppointmentSheet({ appointment: a, resources, can, ownIds, onClose, onChanged, onMove, onCharge, onReceipt }) {
    const { notify, baseCurrency, storeName } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";
    const [corriendo, setCorriendo] = useState(null);
    const [confirmar, setConfirmar] = useState(null);   // { status, title, message }
    const [terminando, setTerminando] = useState(false);
    const [extras, setExtras] = useState([]);           // [{ product, qty }]
    const [quitados, setQuitados] = useState([]);       // servicios reservados que no se hicieron
    const [precios, setPrecios] = useState({});         // product_id → precio de la sucursal
    const [busqueda, setBusqueda] = useState("");
    const [productos, setProductos] = useState(null);
    const buscar = useDebounce(busqueda, 250);

    useEffect(() => { setTerminando(false); setExtras([]); setQuitados([]); setBusqueda(""); setConfirmar(null); }, [a?.id]);

    // Precio de lo reservado, para mostrar la cuenta completa antes de terminar.
    useEffect(() => {
        if (!terminando || !a) return;
        api.agenda.services({ warehouse_id: a.warehouse_id })
            .then(r => setPrecios(Object.fromEntries((r.data || []).map(s => [s.id, s.price]))))
            .catch(() => {});
    }, [terminando, a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!terminando || !a) return;
        let vivo = true;
        api.agenda.products({ warehouse_id: a.warehouse_id, search: buscar })
            .then(r => { if (vivo) setProductos(r.data || []); })
            .catch(e => { if (vivo) { notify(e.message, "err"); setProductos([]); } });
        return () => { vivo = false; };
    }, [terminando, buscar, a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!a) return null;
    const idx = resources.findIndex(r => r.id === a.resource_id);
    const recurso = resources[idx];
    const color = recurso?.color || COLORES[Math.max(0, idx) % COLORES.length];
    const puedeAtender = can.book || ownIds.includes(a.resource_id);
    const vista = estadoVista(a);
    const porCobrar = a.status === "terminada" && a.payment_state === "por_cobrar";
    // Terminada sin cuenta viva (se borró en el POS o se anuló): se vuelve a terminar.
    const sinCuenta = a.status === "terminada" && (!a.sale_id || a.payment_state === "anulada");

    const correr = async (clave, fn) => {
        if (corriendo) return;
        setCorriendo(clave);
        try { await fn(); } catch (e) { notify(e.message, "err"); }
        setCorriendo(null);
    };
    const estado = (status, aviso) => correr(status, async () => {
        const r = await api.agenda.setStatus(a.id, status);
        if (aviso) notify(aviso);
        setConfirmar(null);
        onChanged(r.data);
    });
    const terminar = () => correr("terminar", async () => {
        const r = await api.agenda.finish(a.id, { extras: extras.map(x => ({ product_id: x.product.id, qty: x.qty })), quitar: quitados });
        notify(a.status === "terminada" ? "Agregado a la cuenta" : "Cita terminada: la cuenta quedó por cobrar");
        setTerminando(false);
        setExtras([]);
        setQuitados([]);
        onChanged(r.data);
    });

    const sumar = (p) => setExtras(xs => {
        const i = xs.findIndex(x => x.product.id === p.id);
        if (i >= 0) return xs.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
        return [...xs, { product: p, qty: 1 }];
    });
    const cambiar = (id, d) => setExtras(xs => xs.map(x => (x.product.id === id ? { ...x, qty: x.qty + d } : x)).filter(x => x.qty > 0));
    const totalExtras = extras.reduce((t, x) => t + x.product.price * x.qty, 0);
    // La cuenta que va a quedar: lo reservado (menos lo que no se hizo) y lo agregado. Si la cita
    // ya está terminada, lo reservado ya está en su cuenta (sale_total).
    const yaTerminada = a?.status === "terminada" && !sinCuenta;
    const reservados = (a?.items || []).filter(i => !quitados.includes(i.product_id));
    const totalReservado = yaTerminada ? (a?.sale_total || 0) : reservados.reduce((t, i) => t + (precios[i.product_id] || 0), 0);
    const totalCuenta = totalReservado + totalExtras;
    const nada = !yaTerminada && !reservados.length && !extras.length;

    const wa = enlaceWhatsapp(a.customer_phone,
        `Hola ${toNameCase(a.customer_name) || ""}, te escribimos de ${storeName || "la barbería"} por tu cita del ${fechaLarga(a.date)} a las ${hhmm(a.start_min)}.`);

    // Acción principal, una sola por estado.
    let principal = null;
    if (puedeAtender && !terminando) {
        if (a.status === "pendiente") principal = { label: "Confirmar cita", run: () => estado("confirmada", "Cita confirmada"), key: "confirmada" };
        else if (a.status === "confirmada") principal = { label: "Empezar", run: () => estado("en_curso"), key: "en_curso" };
        else if (a.status === "en_curso" || sinCuenta) principal = { label: "Terminar", run: () => setTerminando(true), key: "abrir" };
    }
    if (porCobrar && can.charge && !terminando) {
        principal = { label: `Cobrar ${fmtMoney(a.sale_total, sym)}`, run: () => onCharge(a), key: "cobrar" };
    }

    const secundarias = [];
    if (puedeAtender && !terminando) {
        if (["pendiente", "confirmada"].includes(a.status)) {
            secundarias.push({ label: "Mover", run: () => onMove(a) });
            secundarias.push({ label: "No llegó", run: () => setConfirmar({ status: "no_asistio", title: "¿El cliente no llegó?", message: "La cita queda marcada como «No llegó» y libera el horario.", confirmText: "Marcar «No llegó»" }) });
            secundarias.push({ label: "Cancelar cita", run: () => setConfirmar({ status: "cancelada", title: "¿Cancelar esta cita?", message: "El horario queda libre. Una cita cancelada no se puede reactivar.", confirmText: "Cancelar cita", danger: true }) });
        }
        if (a.status === "en_curso") secundarias.push({ label: "No empezó aún", run: () => estado("confirmada") });
        if (a.status === "no_asistio") secundarias.push({ label: "Sí llegó", run: () => estado("confirmada", "La cita volvió a la agenda") });
        if (porCobrar) secundarias.push({ label: "Agregar producto", run: () => setTerminando(true) });
    }
    if (!terminando && a.sale_id && ["cobrada", "debe"].includes(a.payment_state)) {
        secundarias.push({ label: "Ver ticket", run: () => onReceipt?.(a) });
    }

    const footer = (
        <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center gap-2">
            {terminando ? (
                <>
                    <button type="button" onClick={() => { setTerminando(false); setExtras([]); setQuitados([]); }} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium sm:mr-auto">Volver</button>
                    {!nada && !(yaTerminada && !extras.length) && (
                        <Button onClick={terminar} loading={corriendo === "terminar"} className="h-12 sm:h-10 px-5 text-[13px]">
                            {yaTerminada ? `Agregar ${fmtMoney(totalExtras, sym)} a la cuenta` : `Terminar · ${fmtMoney(totalCuenta, sym)}`}
                        </Button>
                    )}
                </>
            ) : (
                <>
                    {secundarias.map(s => (
                        <button key={s.label} type="button" onClick={s.run} disabled={!!corriendo}
                            className="btn-outline h-12 sm:h-10 px-4 rounded-lg text-[13px] font-medium">{s.label}</button>
                    ))}
                    {wa && (
                        <a href={wa} target="_blank" rel="noreferrer" className="sm:mr-auto h-12 sm:h-10 px-3 rounded-lg text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white inline-flex items-center justify-center gap-1.5 order-last sm:order-first">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4.3-.9L3 20l1.4-3.7A7.4 7.4 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" /></svg>
                            WhatsApp
                        </a>
                    )}
                    {principal && (
                        <Button onClick={principal.run} loading={corriendo === principal.key} className="h-12 sm:h-10 px-5 text-[13px]">{principal.label}</Button>
                    )}
                </>
            )}
        </div>
    );

    return (
        <Modal open={!!a} onClose={onClose} title={terminando ? (a.status === "terminada" ? "Agregar a la cuenta" : "Terminar cita") : "Cita"} width={560} footer={footer}>
            {!terminando ? (
                <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-[20px] font-semibold tracking-tight text-content dark:text-white truncate">{toNameCase(a.customer_name) || "Sin nombre"}</div>
                            <div className="text-[13px] text-content-subtle mt-0.5 first-letter:uppercase">
                                {fechaLarga(a.date)} · <span className="tabular-nums whitespace-nowrap">{hhmm(a.start_min)}–{hhmm(a.end_min % 1440)}</span>
                            </div>
                        </div>
                        <div className="shrink-0 pt-1"><StatusMark status={vista} map={CITA_STATUS} /></div>
                    </div>

                    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border/60 dark:border-white/[0.06] px-4 py-3">
                        <div>
                            <dt className="text-[12px] text-content-subtle">Profesional</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white flex items-center gap-1.5 mt-0.5">
                                <span className="w-2 h-2 rounded-full" style={{ background: color }} />{toNameCase(recurso?.name) || "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Teléfono</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white mt-0.5 tabular-nums">
                                {a.customer_phone ? <a href={`tel:${a.customer_phone}`} className="hover:underline">{a.customer_phone}</a> : "—"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Cliente</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white mt-0.5">{a.customer_id ? (a.customer_doc || "Registrado") : "Sin registrar"}</dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Origen</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white mt-0.5">{a.source === "vitrina" ? "Catálogo en línea" : "Agenda"}</dd>
                        </div>
                    </dl>

                    <div>
                        <div className="text-[14px] font-semibold text-content dark:text-white mb-1.5">Servicios</div>
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            {a.items.map((i, n) => (
                                <div key={n} className="py-2 flex items-center justify-between gap-3 text-[13px]">
                                    <span className="text-content dark:text-white truncate">{i.name}</span>
                                    <span className="text-content-subtle tabular-nums shrink-0">{duracion(i.duration_min)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {a.notes && (
                        <div className="rounded-lg bg-surface-2 dark:bg-white/[0.04] px-3 py-2.5 text-[13px] text-content dark:text-white">{a.notes}</div>
                    )}

                    {a.sale_id && (
                        <div className="rounded-xl border border-border/60 dark:border-white/[0.06] px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-[12px] text-content-subtle">{a.invoice_number ? `Factura ${a.invoice_number}` : "Cuenta abierta"}</div>
                                <div className="text-[22px] font-bold tracking-tight text-content dark:text-white"><Money value={fmtMoney(a.sale_total, sym)} /></div>
                            </div>
                            {porCobrar && !can.charge && (
                                <span className="text-[12px] text-content-subtle text-right">Lo cobra la caja</span>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    {/* La cuenta como va a quedar: lo reservado ya cargado, lo agregado y el total */}
                    <div className="rounded-xl border border-border/60 dark:border-white/[0.06] overflow-hidden">
                        <div className="px-3 py-2 text-[12px] font-semibold text-content-subtle bg-surface-2/70 dark:bg-white/[0.03] flex items-center justify-between">
                            <span>En la cuenta de {toNameCase(a.customer_name) || "la cita"}</span>
                            {quitados.length > 0 && !yaTerminada && (
                                <button type="button" onClick={() => setQuitados([])} className="font-medium text-content-subtle hover:text-content dark:hover:text-white">Deshacer</button>
                            )}
                        </div>
                        <div className="divide-y divide-border/60 dark:divide-white/[0.06]">
                            {yaTerminada ? (
                                <div className="px-3 py-2.5 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[13px] font-medium text-content dark:text-white truncate">{a.items.map(i => i.name).join(" + ")}</div>
                                        <div className="text-[12px] text-content-subtle">Ya está en la cuenta</div>
                                    </div>
                                    <Money value={fmtMoney(a.sale_total, sym)} className="text-[13px] font-semibold text-content dark:text-white" />
                                </div>
                            ) : a.items.map(i => {
                                const fuera = quitados.includes(i.product_id);
                                return (
                                    <div key={i.product_id} className={`px-3 py-2.5 flex items-center gap-3 ${fuera ? "opacity-45" : ""}`}>
                                        <div className="min-w-0 flex-1">
                                            <div className={`text-[13px] font-medium text-content dark:text-white truncate ${fuera ? "line-through" : ""}`}>{i.name}</div>
                                            <div className="text-[12px] text-content-subtle">{fuera ? "No se hizo" : `Reservado · ${duracion(i.duration_min)}`}</div>
                                        </div>
                                        <Money value={fmtMoney(precios[i.product_id] ?? 0, sym)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                                        <button type="button" aria-label={fuera ? "Volver a cobrar" : "No se hizo"} title={fuera ? "Volver a cobrar" : "No se hizo"}
                                            onClick={() => setQuitados(q => (fuera ? q.filter(x => x !== i.product_id) : [...q, i.product_id]))}
                                            className={QUITAR}>
                                            {fuera
                                                ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 010 10H9M3 10l4-4M3 10l4 4" /></svg>
                                                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>}
                                        </button>
                                    </div>
                                );
                            })}
                            {extras.map(x => (
                                <div key={x.product.id} className="px-3 py-2 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(x.product.name)}</div>
                                        <div className="text-[12px] text-content-subtle tabular-nums">Agregado · {x.qty} × {fmtMoney(x.product.price, sym)}</div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <button type="button" onClick={() => cambiar(x.product.id, -1)} className={QUITAR} aria-label="Quitar uno">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 12h14" /></svg>
                                        </button>
                                        <span className="w-6 text-center text-[14px] font-semibold tabular-nums">{x.qty}</span>
                                        <button type="button" onClick={() => cambiar(x.product.id, 1)} className={QUITAR.replace("hover:text-red-600 hover:border-red-500/40 dark:hover:text-red-400", "hover:text-content hover:border-content-subtle/60")} aria-label="Sumar uno">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-3 py-2.5 border-t border-border/60 dark:border-white/[0.06] flex items-center justify-between">
                            <span className="text-[13px] text-content-subtle">Total</span>
                            <Money value={fmtMoney(totalCuenta, sym)} className="text-[18px] font-bold text-content dark:text-white" />
                        </div>
                    </div>
                    {nada && <p className="text-[12px] text-red-600 dark:text-red-400 -mt-2">Quitaste todo: deja al menos un servicio o agrega algo.</p>}

                    <p className="text-[12px] font-semibold text-content-subtle -mb-2">¿Se hizo o se vendió algo más?</p>
                    <div>
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar un producto o un servicio" autoComplete="off" className={INPUT} />
                        <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-border/50 dark:divide-white/[0.05]">
                            {productos === null ? (
                                <div className="py-6 flex justify-center"><Spinner /></div>
                            ) : productos.length === 0 ? (
                                <div className="py-6 text-center text-[13px] text-content-subtle">Sin productos con existencia</div>
                            ) : productos.map(p => (
                                <button key={p.id} type="button" onClick={() => sumar(p)}
                                    className="w-full py-2.5 px-1 flex items-center justify-between gap-3 text-left hover:bg-surface-2 dark:hover:bg-white/[0.03] rounded-md">
                                    <span className="min-w-0">
                                        <span className="block text-[13px] font-medium text-content dark:text-white truncate">{toNameCase(p.name)}</span>
                                        <span className="block text-[11px] text-content-subtle">{p.is_service ? (p.duration_min ? duracion(p.duration_min) : "Servicio") : `${Number(p.stock).toLocaleString("es-VE")} disponibles`}</span>
                                    </span>
                                    <span className="flex items-center gap-2 shrink-0">
                                        <Money value={fmtMoney(p.price, sym)} className="text-[13px] font-semibold text-content dark:text-white" />
                                        <span className={`${AGREGAR} !w-9 !h-9`} aria-hidden="true">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                                        </span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={!!confirmar}
                type={confirmar?.danger ? "danger" : "warning"}
                title={confirmar?.title}
                message={confirmar?.message}
                confirmText={confirmar?.confirmText}
                cancelText="Volver"
                onConfirm={() => estado(confirmar.status)}
                onCancel={() => setConfirmar(null)}
            />
        </Modal>
    );
}
