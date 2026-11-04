import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "../ui/Modal";
import Segmented from "../ui/Segmented";
import CustomSelect from "../ui/CustomSelect";
import DatePicker from "../ui/DatePicker";
import ConfirmModal from "../ui/ConfirmModal";
import Money from "../ui/Money";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import CustomerModal from "../Customers/CustomerModal";
import { INPUT, Field, SearchPick } from "../fabrica/shared";
import ServicePicker from "./ServicePicker";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { fmtMoney, toNameCase } from "../../helpers";
import { hhmm, parseHora, hoy, duracion } from "./shared";

// Dar una cita o moverla. Las horas que se ofrecen son las libres (las calcula el servidor con
// el horario, las ausencias y las otras citas); "Otra hora" deja escribir una a mano, y si choca
// se pregunta antes de agendarla igual (sobrecupo).
//
// initial: { date, start_min, resource_id } para una nueva; { appointment } para moverla;
// { walkin: true } para "atender ahora": el cliente que llega sin cita, que empieza en el acto.

const clienteNuevo = (q, extra = {}) => {
    const doc = q.match(/^([VEJGP])?-?(\d+)$/i);
    return { ...(doc ? { name: "", rif: `${(doc[1] || "V").toUpperCase()}-${doc[2]}` } : { name: q }), type: "cliente", ...extra };
};

export default function AppointmentModal({ open, initial, warehouseId, resources, ownOnly, onClose, onSaved }) {
    const { can, notify, baseCurrency } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";
    const editando = initial?.appointment || null;
    const ahora = !!initial?.walkin;
    const buscaClientes = can("customers.view") || can("sales.create");

    const [servicios, setServicios] = useState(null);
    const [form, setForm] = useState(null);
    const [pendiente, setPendiente] = useState("");     // lo tecleado en el buscador sin elegir
    const [slots, setSlots] = useState(null);
    const [cargandoSlots, setCargandoSlots] = useState(false);
    const [otraHora, setOtraHora] = useState("");
    const [registrando, setRegistrando] = useState(null);
    const [choque, setChoque] = useState(null);         // mensaje del 409 por sobrecupo
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (!open) return;
        const a = editando;
        setForm({
            customer: a?.customer_id ? { id: a.customer_id, name: a.customer_name, phone: a.customer_phone } : null,
            customer_name: a && !a.customer_id ? a.customer_name || "" : "",
            customer_phone: a?.customer_phone || "",
            product_ids: a ? a.items.map(i => i.product_id) : [],
            resource_id: String(a?.resource_id ?? initial?.resource_id ?? (ownOnly && resources.length === 1 ? resources[0].id : "")),
            date: a?.date || initial?.date || hoy(),
            start_min: a?.start_min ?? initial?.start_min ?? null,
            status: "confirmada",
            notes: a?.notes || "",
        });
        setPendiente("");
        setOtraHora("");
        setSlots(null);
        setChoque(null);
        api.agenda.services({ warehouse_id: warehouseId })
            .then(r => setServicios(r.data || []))
            .catch(e => { notify(e.message, "err"); setServicios([]); });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    // Horas libres para lo elegido. "Cualquiera" junta las de todos.
    useEffect(() => {
        if (!open || !form || !form.product_ids.length || ahora) { setSlots(null); return undefined; }
        let vivo = true;
        setCargandoSlots(true);
        const t = setTimeout(() => {
            api.agenda.slots({
                warehouse_id: warehouseId, date: form.date, product_ids: form.product_ids.join(","),
                ...(form.resource_id ? { resource_id: form.resource_id } : {}),
                ...(editando ? { exclude: editando.id } : {}),
            })
                .then(r => { if (vivo) setSlots(r.data); })
                .catch(e => { if (vivo) { setSlots({ resources: [], error: e.message }); } })
                .finally(() => { if (vivo) setCargandoSlots(false); });
        }, 150);
        return () => { vivo = false; clearTimeout(t); };
    }, [open, form?.date, form?.resource_id, form?.product_ids?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

    const horas = useMemo(() => {
        if (!slots?.resources) return [];
        return [...new Set(slots.resources.flatMap(r => r.slots))].sort((a, b) => a - b);
    }, [slots]);

    const elegidos = (servicios || []).filter(s => form?.product_ids.includes(s.id));
    const totalMin = form ? form.product_ids.reduce((t, id) => t + ((servicios || []).find(s => s.id === id)?.duration_min || 0), 0) : 0;
    const totalPrecio = elegidos.reduce((t, s) => t + (s.price || 0), 0);
    const alternar = (id) => set("product_ids", form.product_ids.includes(id) ? form.product_ids.filter(x => x !== id) : [...form.product_ids, id]);

    const searchCustomers = useCallback(async (term) => {
        const r = await api.customers.getAll({ search: term, type: "cliente", limit: 20 });
        return r.data || [];
    }, []);

    const nombreLibre = buscaClientes ? pendiente : form?.customer_name;
    const horaManual = otraHora.trim() ? parseHora(otraHora) : null;
    const inicio = horaManual ?? form?.start_min;
    const listo = form && form.product_ids.length && (ahora || inicio != null) && (form.customer || String(nombreLibre || "").trim())
        && (!ahora || form.resource_id);

    const guardar = async (forzar = false) => {
        if (!listo || guardando) return;
        setGuardando(true);
        const cuerpo = {
            warehouse_id: warehouseId,
            resource_id: form.resource_id ? parseInt(form.resource_id, 10) : null,
            date: ahora ? hoy() : form.date,
            start_min: ahora ? null : inicio,
            product_ids: form.product_ids,
            ...(form.customer
                ? { customer_id: form.customer.id, customer_name: null }
                : { customer_id: null, customer_name: String(nombreLibre).trim() }),
            customer_phone: form.customer_phone || form.customer?.phone || null,
            notes: form.notes,
            ...(forzar ? { forzar: true } : {}),
        };
        try {
            const r = editando
                ? await api.agenda.update(editando.id, cuerpo)
                : await api.agenda.create({ ...cuerpo, status: ahora ? "en_curso" : form.status });
            notify(editando ? "Cita movida" : ahora ? "Cliente en el sillón: la cita está en curso" : `Cita agendada a las ${hhmm(inicio)}`);
            setChoque(null);
            onSaved?.(r.data);
        } catch (e) {
            if (e.code === "NO_CABE" && !forzar) setChoque(e.message);
            else notify(e.message, "err");
        }
        setGuardando(false);
    };

    const registrar = async (body) => {
        try {
            const r = await api.customers.create({ ...body, type: "cliente" });
            set("customer", r.data);
            setRegistrando(null);
            notify("Cliente registrado");
        } catch (e) { notify(e.message, "err"); }
    };

    const opcionesRecurso = [
        ...(ownOnly ? [] : [{ value: "", label: "Cualquiera disponible" }]),
        ...resources.map(r => ({ value: String(r.id), label: toNameCase(r.name) })),
    ];

    const footer = form && (
        <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
            <div className="sm:mr-auto text-[12px] text-content-subtle">
                {totalMin > 0 && <>{duracion(totalMin)} · <Money value={fmtMoney(totalPrecio, sym)} /></>}
            </div>
            <button type="button" onClick={onClose} className="btn-outline h-12 sm:h-10 px-5 rounded-lg text-[13px] font-medium">Cancelar</button>
            {!!listo && (
                <Button onClick={() => guardar(false)} loading={guardando} className="h-12 sm:h-10 px-5 text-[13px]">
                    {ahora ? "Empezar ahora" : editando ? `Mover a las ${hhmm(inicio)}` : `Agendar a las ${hhmm(inicio)}`}
                </Button>
            )}
        </div>
    );

    return (
        <Modal open={open} onClose={onClose} title={ahora ? "Atender ahora" : editando ? "Mover cita" : "Nueva cita"} width={620} footer={footer}>
            {!form ? null : (
                <div className="space-y-5">
                    {/* Cliente */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
                        <Field label="Cliente">
                            {buscaClientes ? (
                                <SearchPick
                                    searchFn={searchCustomers}
                                    value={form.customer}
                                    onChange={c => set("customer", c)}
                                    onTermChange={setPendiente}
                                    placeholder="Nombre, cédula o teléfono"
                                    autoFocus={!editando}
                                    onCreate={can("customers.create") ? (term => setRegistrando(clienteNuevo(term, { phone: form.customer_phone }))) : undefined}
                                    createLabel="Registrar cliente"
                                    renderItem={c => (
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="truncate">{toNameCase(c.name)}</span>
                                            <span className="text-[11px] text-content-subtle shrink-0">{c.rif || c.phone || ""}</span>
                                        </span>
                                    )}
                                />
                            ) : (
                                <input value={form.customer_name} onChange={e => set("customer_name", e.target.value)} placeholder="Nombre del cliente"
                                    autoComplete="off" data-autofocus className={INPUT} />
                            )}
                        </Field>
                        <Field label="Teléfono" hint="Opcional">
                            <input value={form.customer?.phone || form.customer_phone} disabled={!!form.customer?.phone}
                                onChange={e => set("customer_phone", e.target.value)} inputMode="tel" autoComplete="off"
                                placeholder="0414…" className={`${INPUT} disabled:opacity-60`} />
                        </Field>
                    </div>
                    {buscaClientes && !form.customer && pendiente && (
                        <p className="-mt-3 text-[12px] text-content-subtle">Se agenda a nombre de «{pendiente}» sin registrarlo. Al cobrar se registra o se elige.</p>
                    )}

                    {/* Servicios */}
                    <Field label="Servicios" hint={totalMin ? duracion(totalMin) : null}>
                        {servicios === null ? (
                            <div className="h-10 flex items-center"><Spinner /></div>
                        ) : servicios.length === 0 ? (
                            <p className="text-[13px] text-content-subtle">No hay servicios con duración. Configúralos en Agenda → Configuración.</p>
                        ) : (
                            <ServicePicker services={servicios} selected={form.product_ids} onToggle={alternar} sym={sym} />
                        )}
                    </Field>

                    {/* Quién y cuándo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label="Profesional">
                            <CustomSelect value={form.resource_id} onChange={v => set("resource_id", v)}
                                options={ahora ? opcionesRecurso.filter(o => o.value) : opcionesRecurso}
                                placeholder="Quién lo atiende"
                                disabled={ownOnly && resources.length === 1} />
                        </Field>
                        {!ahora && (
                            <Field label="Día">
                                <DatePicker value={form.date} onChange={v => v && set("date", v)} clearable={false} />
                            </Field>
                        )}
                    </div>

                    {!ahora && <Field label="Hora" hint={slots?.step ? `cada ${slots.step} min` : null}>
                        {!form.product_ids.length ? (
                            <p className="text-[13px] text-content-subtle">Elige los servicios para ver las horas libres.</p>
                        ) : cargandoSlots && !slots ? (
                            <div className="h-10 flex items-center"><Spinner /></div>
                        ) : slots?.error ? (
                            <p className="text-[13px] text-red-600 dark:text-red-400">{slots.error}</p>
                        ) : !slots?.resources?.length ? (
                            <p className="text-[13px] text-content-subtle">Nadie en esta sucursal hace todos esos servicios.</p>
                        ) : horas.length === 0 ? (
                            <p className="text-[13px] text-content-subtle">No quedan horas libres ese día. Prueba otro día u otra persona, o escribe la hora abajo.</p>
                        ) : (
                            <div className={`grid grid-cols-4 sm:grid-cols-6 gap-1.5 ${cargandoSlots ? "opacity-60" : ""}`}>
                                {horas.map(m => {
                                    const on = !otraHora.trim() && form.start_min === m;
                                    return (
                                        <button key={m} type="button" onClick={() => { set("start_min", m); setOtraHora(""); }}
                                            className={`h-11 sm:h-9 rounded-lg border text-[13px] tabular-nums font-medium transition-colors
                                                ${on ? "border-brand-600 bg-brand-600 text-white dark:bg-brand-500 dark:border-brand-500 dark:text-brand-ink"
                                                    : "border-border dark:border-white/10 text-content dark:text-white hover:border-content-subtle/50"}`}>
                                            {hhmm(m)}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {form.product_ids.length > 0 && (
                            <div className="mt-2 flex items-center gap-2">
                                <span className="text-[12px] text-content-subtle shrink-0">Otra hora</span>
                                <input value={otraHora} onChange={e => setOtraHora(e.target.value)} placeholder="16:45" inputMode="numeric" autoComplete="off"
                                    className={`${INPUT} !w-24 tabular-nums ${otraHora.trim() && horaManual == null ? "!border-red-500" : ""}`} />
                                {form.start_min != null && !otraHora.trim() && editando && form.start_min === editando.start_min && form.date === editando.date && (
                                    <span className="text-[12px] text-content-subtle">Hora actual: {hhmm(editando.start_min)}</span>
                                )}
                            </div>
                        )}
                    </Field>}

                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-3 sm:items-end">
                        {!editando && !ahora && (
                            <Field label="Estado">
                                <Segmented value={form.status} onChange={v => set("status", v)}
                                    options={[{ key: "confirmada", label: "Confirmada" }, { key: "pendiente", label: "Por confirmar" }]} />
                            </Field>
                        )}
                        <Field label="Nota" hint="Opcional">
                            <input value={form.notes} onChange={e => set("notes", e.target.value)} maxLength={300} autoComplete="off"
                                placeholder="Degradado bajo, trae foto…" className={INPUT} />
                        </Field>
                    </div>
                </div>
            )}

            {registrando && (
                <CustomerModal open onClose={() => setRegistrando(null)} onSave={registrar} editData={registrando} />
            )}

            <ConfirmModal
                isOpen={!!choque}
                type="warning"
                title="Ese horario está ocupado"
                message={`${choque || ""}. ¿Quieres agendar igual? Quedarán dos citas a la vez.`}
                confirmText="Agendar igual"
                onConfirm={() => guardar(true)}
                onCancel={() => setChoque(null)}
            />
        </Modal>
    );
}
