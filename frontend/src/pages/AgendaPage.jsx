import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";
import Page from "../components/ui/Page";
import Modal from "../components/ui/Modal";
import DatePicker from "../components/ui/DatePicker";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import SucursalFilter, { useSucursalFilter } from "../components/ui/SucursalFilter";
import PaymentFormModal from "../components/PaymentFormModal";
import ReceiptModal from "../components/ReceiptModal";
import CustomerModal from "../components/Customers/CustomerModal";
import { SearchPick, Field } from "../components/fabrica/shared";
import DayGrid, { PanelAhora } from "../components/agenda/DayGrid";
import DayList from "../components/agenda/DayList";
import AppointmentModal from "../components/agenda/AppointmentModal";
import AppointmentSheet from "../components/agenda/AppointmentSheet";
import ToChargeView from "../components/agenda/ToChargeView";
import ConfigView from "../components/agenda/ConfigView";
import { hoy, masDias, fechaLarga, monedaPantalla, COLORES } from "../components/agenda/shared";
import { toNameCase } from "../helpers";

// Agenda de citas (extra por empresa; ver services/agenda en el backend).
//
// Una cita terminada abre su cuenta en espera y se cobra aquí mismo con el cobro de siempre
// (PaymentFormModal), o desde el POS: es una cuenta en espera más. Quien cobra lo decide su
// permiso (sales.create): en una barbería cobra cada barbero; en otra, la recepción.
//
// El día se refresca solo cada 15 s con la huella del servidor: sin cambios, es una consulta
// liviana (ver utils/huella).
const REFRESCO_MS = 15_000;
const TAB_KEY = "agenda_pestana";

export default function AgendaPage() {
    const { can, notify, activeCurrencies, baseCurrency, employee } = useApp();
    const suc = useSucursalFilter({ todas: false, soloVenden: true });
    const warehouseId = suc.warehouseId ? parseInt(suc.warehouseId, 10) : null;

    const [tab, setTabState] = useState(() => { try { return localStorage.getItem(TAB_KEY) || "agenda"; } catch { return "agenda"; } });
    const setTab = (t) => { setTabState(t); try { localStorage.setItem(TAB_KEY, t); } catch { /* modo privado */ } };
    const [fecha, setFecha] = useState(hoy);
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const huellaRef = useRef(null);
    const [filtro, setFiltro] = useState(null);        // recurso elegido en la lista del teléfono

    const [nueva, setNueva] = useState(null);          // initial del modal de cita
    const [abierta, setAbierta] = useState(null);      // cita en la ficha
    const [cobro, setCobro] = useState(null);          // { cita, paso: "cliente" | "pago", sale }
    const [recibo, setRecibo] = useState(null);

    const cargar = useCallback(async ({ forzar = false } = {}) => {
        if (!warehouseId) return;
        try {
            const r = await api.agenda.day({ warehouse_id: warehouseId, date: fecha, ...(!forzar && huellaRef.current ? { v: huellaRef.current } : {}) });
            setError(null);
            if (r.unchanged) return;
            huellaRef.current = r.v;
            setData(r.data);
            // La ficha abierta se pone al día con lo que llegó.
            setAbierta(a => (a ? r.data.appointments.find(x => x.id === a.id) || r.data.to_charge.find(x => x.id === a.id) || a : a));
        } catch (e) { setError(e.message); }
    }, [warehouseId, fecha]);

    useEffect(() => { huellaRef.current = null; setData(null); cargar({ forzar: true }); }, [cargar]);
    useEffect(() => {
        const t = setInterval(() => { if (!document.hidden) cargar(); }, REFRESCO_MS);
        return () => clearInterval(t);
    }, [cargar]);
    const refrescar = () => cargar({ forzar: true });

    const permisos = data?.can || {};
    const recursos = data?.resources || [];
    // Los recursos enlazados a quien mira: ese barbero da y atiende sus citas sin agenda.book.
    const propios = recursos.filter(r => r.employee_id && r.employee_id === employee?.id).map(r => r.id);
    const canBookFor = (r) => !!(permisos.book || propios.includes(r.id));
    const puedeDar = !!(permisos.book || propios.length);
    const porCobrar = data?.to_charge || [];
    const vivas = (data?.appointments || []).filter(a => a.status !== "cancelada");
    const resumen = {
        citas: vivas.filter(a => a.status !== "no_asistio").length,
        enCurso: vivas.filter(a => a.status === "en_curso").length,
        terminadas: vivas.filter(a => a.status === "terminada").length,
        noLlegaron: vivas.filter(a => a.status === "no_asistio").length,
        web: vivas.filter(a => a.source === "vitrina").length,
    };

    // ── Cobro ──
    const empezarCobro = (cita) => {
        setAbierta(null);
        if (!cita.customer_id) setCobro({ cita, paso: "cliente" });
        else prepararPago(cita, cita.customer_id);
    };
    const prepararPago = async (cita, customerId) => {
        const moneda = monedaPantalla(activeCurrencies, baseCurrency);
        try {
            const r = await api.agenda.charge(cita.id, {
                customer_id: customerId,
                currency_id: moneda?.id ?? null,
                exchange_rate: moneda?.exchange_rate ? parseFloat(moneda.exchange_rate) : 1,
            });
            setCobro({ cita, paso: "pago", sale: r.data });
        } catch (e) { notify(e.message, "err"); setCobro(null); refrescar(); }
    };

    const subheader = (
        <div className="flex gap-1 px-4 border-b border-border/20 dark:border-white/5 overflow-x-auto scrollbar-hide">
            {[
                { id: "agenda", label: "Agenda" },
                { id: "cobrar", label: "Por cobrar", count: porCobrar.length },
                ...(can("agenda.setup") ? [{ id: "config", label: "Configuración" }] : []),
            ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                    className={["px-4 py-2 text-[13px] font-semibold border-b-2 transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5",
                        tab === t.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle dark:text-white/30 hover:text-content dark:hover:text-white"
                    ].join(" ")}>
                    {t.label}
                    {t.count > 0 && <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 text-[11px] font-semibold tabular-nums inline-flex items-center justify-center">{t.count}</span>}
                </button>
            ))}
        </div>
    );

    const actions = tab === "agenda" && puedeDar && (
        <div className="flex items-center gap-2">
            <button type="button" onClick={() => setNueva({ walkin: true })} className="btn-outline h-9 px-3 rounded-lg text-[13px] font-medium whitespace-nowrap">Atender ahora</button>
            <Button onClick={() => setNueva({ date: fecha })} className="h-9 px-3 text-[13px] whitespace-nowrap">+ Nueva cita</Button>
        </div>
    );

    if (!warehouseId) {
        return <Page module="Agenda" title="Agenda"><div className="p-8 text-center text-[13px] text-content-subtle">Elige una sucursal que venda para ver su agenda.</div></Page>;
    }

    return (
        <Page module="Agenda" title={tab === "config" ? "Configuración de la agenda" : tab === "cobrar" ? "Por cobrar" : "Agenda"} subheader={subheader} actions={actions}>
            {tab === "agenda" && (
                <div className="flex-1 min-h-0 flex flex-col">
                    {/* Día y sucursal en una fila */}
                    <div className="shrink-0 px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-border/40 dark:border-white/[0.05]">
                        <div className="flex items-center gap-1">
                            <button type="button" onClick={() => setFecha(f => masDias(f, -1))} aria-label="Día anterior" className="w-10 h-10 rounded-lg border border-border dark:border-white/10 flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                            </button>
                            <button type="button" onClick={() => setFecha(hoy())} disabled={fecha === hoy()}
                                className="h-10 px-3 rounded-lg border border-border dark:border-white/10 text-[13px] font-medium text-content dark:text-white disabled:opacity-50">Hoy</button>
                            <button type="button" onClick={() => setFecha(f => masDias(f, 1))} aria-label="Día siguiente" className="w-10 h-10 rounded-lg border border-border dark:border-white/10 flex items-center justify-center text-content-subtle hover:text-content dark:hover:text-white">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                        <div className="w-40"><DatePicker value={fecha} onChange={v => v && setFecha(v)} clearable={false} /></div>
                        <span className="hidden md:inline text-[14px] font-semibold text-content dark:text-white first-letter:uppercase ml-1">{fechaLarga(fecha)}</span>
                        <div className="ml-auto"><SucursalFilter filter={suc} /></div>
                    </div>

                    {/* El día en números: lo que hay, lo que va y lo que falta cobrar */}
                    {data && recursos.length > 0 && (
                        <div className="shrink-0 px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide border-b border-border/40 dark:border-white/[0.05]">
                            {[
                                { label: "Citas", n: resumen.citas },
                                { label: "En curso", n: resumen.enCurso, tono: resumen.enCurso ? "text-sky-700 dark:text-sky-400" : "" },
                                { label: "Terminadas", n: resumen.terminadas },
                                { label: "No llegaron", n: resumen.noLlegaron },
                                { label: "Reservadas en línea", n: resumen.web },
                            ].map(x => (
                                <div key={x.label} className="h-9 px-3 rounded-lg bg-surface-2 dark:bg-white/[0.04] flex items-center gap-2 shrink-0">
                                    <span className={`text-[15px] font-bold tabular-nums ${x.tono || "text-content dark:text-white"}`}>{x.n}</span>
                                    <span className="text-[12px] text-content-subtle whitespace-nowrap">{x.label}</span>
                                </div>
                            ))}
                            {porCobrar.length > 0 && (
                                <button type="button" onClick={() => setTab("cobrar")}
                                    className="h-9 px-3 rounded-lg bg-amber-500/10 text-amber-800 dark:text-amber-400 flex items-center gap-2 shrink-0 hover:bg-amber-500/15">
                                    <span className="text-[12px] whitespace-nowrap">Por cobrar</span>
                                    <span className="text-[14px] font-bold tabular-nums whitespace-nowrap">{baseCurrency?.symbol || "Ref."} {porCobrar.reduce((t, a) => t + (a.sale_total || 0), 0).toFixed(2)}</span>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            )}
                        </div>
                    )}

                    {error && !data ? (
                        <div className="p-8 text-center text-[13px] text-red-600 dark:text-red-400">{error}</div>
                    ) : !data ? (
                        <div className="flex-1 flex items-center justify-center"><Spinner className="h-5 w-5" /></div>
                    ) : recursos.length === 0 ? (
                        <div className="py-16 text-center px-6">
                            <div className="text-[14px] font-semibold text-content dark:text-white">La agenda está vacía</div>
                            <div className="text-[13px] text-content-subtle mt-1">
                                {can("agenda.setup") ? "Agrega a tus profesionales y la duración de cada servicio en Configuración." : "Pide al administrador que te agregue a la agenda."}
                            </div>
                            {can("agenda.setup") && <button onClick={() => setTab("config")} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium mt-4">Ir a Configuración</button>}
                        </div>
                    ) : (
                        <>
                            {/* Un solo profesional hoy (el barbero en su agenda): qué tiene ahora y quién sigue. */}
                            {recursos.length === 1 && fecha === hoy() && (
                                <PanelAhora citas={data.appointments.filter(x => x.resource_id === recursos[0].id)}
                                    color={recursos[0].color || COLORES[0]} onOpen={setAbierta} />
                            )}
                            <div className="hidden lg:flex flex-1 min-h-0 flex-col">
                                <DayGrid data={data} canBookFor={canBookFor}
                                    onSlot={(r, min) => setNueva({ date: fecha, start_min: min, resource_id: r.id })}
                                    onOpen={setAbierta} />
                            </div>
                            <div className="lg:hidden flex-1 min-h-0 overflow-y-auto">
                                {recursos.length > 1 && (
                                    <div className="px-4 pt-3 flex gap-2 overflow-x-auto scrollbar-hide">
                                        {[{ id: null, name: "Todos" }, ...recursos].map((r, i) => (
                                            <button key={r.id ?? "todos"} type="button" onClick={() => setFiltro(r.id)}
                                                className={`h-9 px-3 rounded-full border text-[13px] font-medium whitespace-nowrap inline-flex items-center gap-1.5 shrink-0
                                                    ${filtro === r.id ? "border-content dark:border-white bg-content text-white dark:bg-white dark:text-surface-dark-1" : "border-border dark:border-white/10 text-content dark:text-white"}`}>
                                                {r.id && <span className="w-2 h-2 rounded-full" style={{ background: r.color || COLORES[(i - 1) % COLORES.length] }} />}
                                                {toNameCase(r.name)}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <DayList data={data} resourceId={filtro} onOpen={setAbierta}
                                    onNew={puedeDar ? () => setNueva({ date: fecha }) : null} />
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "cobrar" && (
                !data ? <div className="flex-1 flex items-center justify-center"><Spinner className="h-5 w-5" /></div>
                    : <ToChargeView rows={porCobrar} resources={recursos} canCharge={!!permisos.charge} onOpen={setAbierta} onCharge={empezarCobro} />
            )}

            {tab === "config" && can("agenda.setup") && (
                <ConfigView warehouseId={warehouseId} onChanged={refrescar} />
            )}

            {nueva && data && (
                <AppointmentModal open initial={nueva} warehouseId={warehouseId}
                    resources={permisos.book ? recursos : recursos.filter(r => propios.includes(r.id))}
                    ownOnly={!permisos.book}
                    onClose={() => setNueva(null)}
                    onSaved={(cita) => {
                        setNueva(null);
                        if (cita?.date && cita.date !== fecha) setFecha(cita.date); else refrescar();
                    }} />
            )}

            {abierta && data && (
                <AppointmentSheet appointment={abierta} resources={recursos} can={permisos} ownIds={propios}
                    onClose={() => setAbierta(null)}
                    onChanged={(c) => { setAbierta(c); refrescar(); }}
                    onMove={(c) => { setAbierta(null); setNueva({ appointment: c }); }}
                    onCharge={empezarCobro}
                    onReceipt={(c) => setRecibo({ id: c.sale_id })} />
            )}

            {cobro?.paso === "cliente" && (
                <ClienteDelCobro cita={cobro.cita} onClose={() => setCobro(null)}
                    onPick={(c) => prepararPago(cobro.cita, c.id)} />
            )}

            {cobro?.paso === "pago" && cobro.sale && (
                <PaymentFormModal sale={cobro.sale}
                    onClose={() => { setCobro(null); refrescar(); }}
                    onSuccess={(res) => {
                        const id = cobro.sale.id;
                        setCobro(null);
                        refrescar();
                        // Pagada o abonada: el ticket queda a mano para imprimirlo.
                        if (res?.sale_status) setRecibo({ id });
                    }} />
            )}

            {recibo && <ReceiptModal open sale={recibo} onClose={() => setRecibo(null)} />}
        </Page>
    );
}

/**
 * La factura lleva cliente, como en la caja. La cita puede venir con un nombre suelto (el que
 * llamó por teléfono): se busca entre los registrados o se registra con lo que ya trae.
 */
function ClienteDelCobro({ cita, onClose, onPick }) {
    const { can, notify } = useApp();
    const [cliente, setCliente] = useState(null);
    const [registrando, setRegistrando] = useState(null);
    const [listo, setListo] = useState(false);

    const buscar = useCallback(async (term) => (await api.customers.getAll({ search: term, type: "cliente", limit: 20 })).data || [], []);
    const registrar = async (body) => {
        try {
            const r = await api.customers.create({ ...body, type: "cliente" });
            setRegistrando(null);
            setCliente(r.data);
        } catch (e) { notify(e.message, "err"); }
    };

    const footer = (
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            {cliente && (
                <Button loading={listo} onClick={async () => { setListo(true); await onPick(cliente); }} className="h-12 sm:h-10 px-5 text-[13px]">Seguir al cobro</Button>
            )}
        </div>
    );

    return (
        <Modal open onClose={onClose} title="¿A nombre de quién va la factura?" width={480} footer={footer}>
            <div className="space-y-3">
                <p className="text-[13px] text-content-subtle">
                    La cita está a nombre de «{toNameCase(cita.customer_name)}» sin registrar. Búscalo o regístralo: queda guardado en la cita para la próxima vez.
                </p>
                <Field label="Cliente">
                    <SearchPick searchFn={buscar} value={cliente} onChange={setCliente} placeholder="Nombre, cédula o teléfono" autoFocus
                        onCreate={can("customers.create") ? (term => setRegistrando({ name: term, phone: cita.customer_phone || "", rif: cita.customer_doc || "", type: "cliente" })) : undefined}
                        createLabel="Registrar cliente"
                        renderItem={c => (
                            <span className="flex items-center justify-between gap-3">
                                <span className="truncate">{toNameCase(c.name)}</span>
                                <span className="text-[11px] text-content-subtle shrink-0">{c.rif || c.phone || ""}</span>
                            </span>
                        )} />
                </Field>
                {!cliente && can("customers.create") && (
                    <button type="button" onClick={() => setRegistrando({ name: cita.customer_name || "", phone: cita.customer_phone || "", rif: cita.customer_doc || "", type: "cliente" })}
                        className="text-[13px] font-medium text-brand-600 dark:text-brand-400">
                        Registrar a «{toNameCase(cita.customer_name)}»
                    </button>
                )}
            </div>
            {registrando && <CustomerModal open onClose={() => setRegistrando(null)} onSave={registrar} editData={registrando} />}
        </Modal>
    );
}
