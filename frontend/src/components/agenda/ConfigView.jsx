import { useEffect, useState } from "react";
import Segmented from "../ui/Segmented";
import Check from "../ui/Check";
import Money from "../ui/Money";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";
import { INPUT, CARD } from "../fabrica/shared";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { fmtMoney, toNameCase } from "../../helpers";
import ResourceModal from "./ResourceModal";
import MapPicker from "../PublicCatalog/MapPicker";
import MiniMapa from "../MiniMapa";
import { sheetSkin } from "../PublicCatalog/CatalogSheet";
import { hhmm, DIAS_CORTOS, COLORES, duracion } from "./shared";

// Configuración de la agenda de una sucursal:
//   Profesionales  quién atiende (o qué puesto), su horario y sus ausencias
//   Servicios      cuánto dura cada servicio y quién lo hace
//   Ajustes        cada cuántos minutos se ofrecen las horas
const SECCIONES = [
    { key: "recursos", label: "Profesionales" },
    { key: "servicios", label: "Servicios" },
    { key: "ajustes", label: "Ajustes" },
];

/** "Lun–Sáb 09:00–13:00, 14:00–19:00" agrupando los días con el mismo horario. */
function resumenHorario(hours) {
    const porDia = [1, 2, 3, 4, 5, 6, 0].map(d => ({
        d, txt: hours.filter(h => h.weekday === d).map(h => `${hhmm(h.start_min)}–${hhmm(h.end_min % 1440 || 1440)}`).join(", "),
    }));
    const grupos = [];
    for (const x of porDia) {
        const ult = grupos[grupos.length - 1];
        if (ult && ult.txt === x.txt) ult.hasta = x.d;
        else grupos.push({ desde: x.d, hasta: x.d, txt: x.txt });
    }
    const out = grupos.filter(g => g.txt).map(g => `${DIAS_CORTOS[g.desde]}${g.hasta !== g.desde ? `–${DIAS_CORTOS[g.hasta]}` : ""} ${g.txt}`);
    return out.length ? out.join(" · ") : "Sin horario";
}

export default function ConfigView({ warehouseId, onChanged }) {
    const { notify, baseCurrency } = useApp();
    const sym = baseCurrency?.symbol || "Ref.";
    const [seccion, setSeccion] = useState("recursos");
    const [recursos, setRecursos] = useState(null);
    const [servicios, setServicios] = useState(null);
    const [opciones, setOpciones] = useState(null);
    const [editando, setEditando] = useState(null);
    const [borradores, setBorradores] = useState({});   // product_id → { duration, resource_ids }
    const [guardando, setGuardando] = useState(null);
    const [paso, setPaso] = useState(null);
    const [version, setVersion] = useState(0);
    const [lugar, setLugar] = useState(null);          // { name, lat, lng } de la sucursal
    const [ubicando, setUbicando] = useState(false);

    useEffect(() => {
        setRecursos(null);
        api.agenda.resources({ warehouse_id: warehouseId, all: 1 }).then(r => setRecursos(r.data || [])).catch(e => { notify(e.message, "err"); setRecursos([]); });
        api.agenda.services({ warehouse_id: warehouseId, all: 1 }).then(r => setServicios(r.data || [])).catch(() => setServicios([]));
        api.agenda.settings().then(r => setPaso(r.data)).catch(() => {});
        api.agenda.location({ warehouse_id: warehouseId }).then(r => setLugar(r.data)).catch(() => {});
    }, [warehouseId, version, notify]);
    useEffect(() => { api.agenda.setupOptions().then(r => setOpciones(r.data)).catch(() => setOpciones({ sellers: [], employees: [] })); }, []);

    const recargar = () => { setVersion(v => v + 1); onChanged?.(); };
    const guardarAjuste = async (body, aviso = "Guardado") => {
        try { setPaso((await api.agenda.saveSettings(body)).data); notify(aviso); onChanged?.(); }
        catch (e) { notify(e.message, "err"); }
    };
    const activos = (recursos || []).filter(r => r.active);

    const borrador = (s) => borradores[s.id] || { duration: s.duration_min ? String(s.duration_min) : "", resource_ids: s.resource_ids || [] };
    const editar = (s, patch) => setBorradores(b => ({ ...b, [s.id]: { ...borrador(s), ...patch } }));
    const sucio = (s) => {
        const b = borradores[s.id];
        if (!b) return false;
        const ids = (x) => [...x].sort((a, c) => a - c).join(",");
        return b.duration !== (s.duration_min ? String(s.duration_min) : "") || ids(b.resource_ids) !== ids(s.resource_ids || []);
    };
    const guardarServicio = async (s) => {
        const b = borrador(s);
        setGuardando(s.id);
        try {
            await api.agenda.saveService(s.id, { duration_min: b.duration ? parseInt(b.duration, 10) : null, warehouse_id: warehouseId, resource_ids: b.resource_ids });
            setBorradores(x => { const y = { ...x }; delete y[s.id]; return y; });
            notify(b.duration ? `${s.name}: ${duracion(parseInt(b.duration, 10))}` : `${s.name} ya no se agenda`);
            recargar();
        } catch (e) { notify(e.message, "err"); }
        setGuardando(null);
    };

    return (
        <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 py-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                    <Segmented value={seccion} onChange={setSeccion} options={SECCIONES} />
                    {seccion === "recursos" && (
                        <Button onClick={() => setEditando({})} className="h-10 px-4 text-[13px] hidden sm:inline-flex">+ Agregar</Button>
                    )}
                </div>

                {seccion === "recursos" && (
                    recursos === null ? <div className="py-10 flex justify-center"><Spinner /></div> : (
                        <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                            {recursos.length === 0 && (
                                <div className="py-12 text-center px-6">
                                    <div className="text-[14px] font-semibold text-content dark:text-white">Nadie en la agenda todavía</div>
                                    <div className="text-[13px] text-content-subtle mt-1">Agrega a cada barbero (o cada puesto, como una bahía de lavado) con su horario.</div>
                                </div>
                            )}
                            {recursos.map((r, i) => (
                                <button key={r.id} type="button" onClick={() => setEditando(r)}
                                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-2 dark:hover:bg-white/[0.03] ${r.active ? "" : "opacity-60"}`}>
                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color || COLORES[i % COLORES.length] }} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[14px] font-semibold text-content dark:text-white truncate">
                                            {toNameCase(r.name)}
                                            <span className="ml-2 text-[12px] font-normal text-content-subtle">
                                                {r.kind === "puesto" ? `Puesto · ${r.capacity} a la vez` : "Persona"}{r.active ? "" : " · fuera de la agenda"}
                                            </span>
                                        </span>
                                        <span className="block text-[12px] text-content-subtle truncate">{resumenHorario(r.hours)}</span>
                                    </span>
                                    <span className="hidden sm:block text-right text-[12px] text-content-subtle shrink-0">
                                        {r.employee_name ? <span className="block">Usuario: {toNameCase(r.employee_name)}</span> : <span className="block">Sin usuario</span>}
                                        {r.seller_name && <span className="block">Comisión: {toNameCase(r.seller_name)}</span>}
                                    </span>
                                    <svg className="w-4 h-4 text-content-subtle shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            ))}
                            <button type="button" onClick={() => setEditando({})} className="sm:hidden w-full h-12 text-[13px] font-medium text-brand-600 dark:text-brand-400">+ Agregar profesional o puesto</button>
                        </div>
                    )
                )}

                {seccion === "servicios" && (
                    servicios === null ? <div className="py-10 flex justify-center"><Spinner /></div> : (
                        <>
                            <p className="text-[13px] text-content-subtle">
                                Los servicios salen del Catálogo (productos tipo servicio). Ponle la duración a los que se agendan; sin duración no aparecen en la agenda.
                                Si nadie está marcado, lo hacen todos.
                            </p>
                            <div className={`${CARD} divide-y divide-border/60 dark:divide-white/[0.06]`}>
                                {servicios.length === 0 && (
                                    <div className="py-12 text-center text-[13px] text-content-subtle px-6">No hay productos tipo servicio. Créalos en el Catálogo marcando «Es un servicio».</div>
                                )}
                                {servicios.map(s => {
                                    const b = borrador(s);
                                    return (
                                        <div key={s.id} className="px-4 py-3 space-y-2">
                                            <div className="flex items-center gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-[14px] font-semibold text-content dark:text-white truncate">{s.name}</div>
                                                    <Money value={fmtMoney(s.price, sym)} className="text-[12px] text-content-subtle" />
                                                </div>
                                                <div className="relative shrink-0">
                                                    <input value={b.duration} onChange={e => editar(s, { duration: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                                                        inputMode="numeric" placeholder="—" autoComplete="off" aria-label={`Duración de ${s.name}`}
                                                        className={`${INPUT} !w-28 pr-12 text-right tabular-nums`} />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-content-subtle pointer-events-none">min</span>
                                                </div>
                                            </div>
                                            {activos.length > 1 && b.duration && (
                                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                                    <span className="text-[12px] text-content-subtle">Lo hacen</span>
                                                    {activos.map(r => (
                                                        <label key={r.id} className="inline-flex items-center gap-2 text-[13px] text-content dark:text-white cursor-pointer">
                                                            <Check checked={b.resource_ids.includes(r.id)}
                                                                onChange={v => editar(s, { resource_ids: v ? [...b.resource_ids, r.id] : b.resource_ids.filter(x => x !== r.id) })} />
                                                            {toNameCase(r.name)}
                                                        </label>
                                                    ))}
                                                    {!b.resource_ids.length && <span className="text-[12px] text-content-subtle">· todos</span>}
                                                </div>
                                            )}
                                            {sucio(s) && (
                                                <div className="flex justify-end">
                                                    <Button onClick={() => guardarServicio(s)} loading={guardando === s.id} className="h-12 sm:h-9 px-4 text-[13px]">Guardar</Button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )
                )}

                {seccion === "ajustes" && paso && (
                    <div className={`${CARD} px-4 py-4 space-y-2`}>
                        <div className="text-[14px] font-semibold text-content dark:text-white">Horas que se ofrecen</div>
                        <p className="text-[13px] text-content-subtle">Cada cuántos minutos arranca una cita al darla: con 15, se ofrecen 9:00, 9:15, 9:30…</p>
                        <Segmented value={paso.step_min} options={[10, 15, 20, 30].map(n => ({ key: n, label: `${n} min` }))}
                            onChange={async (n) => {
                                try { setPaso((await api.agenda.saveSettings({ step_min: n })).data); notify("Guardado"); onChanged?.(); }
                                catch (e) { notify(e.message, "err"); }
                            }} />
                    </div>
                )}

                {seccion === "ajustes" && lugar && (
                    <div className={`${CARD} px-4 py-4 space-y-3`}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-[14px] font-semibold text-content dark:text-white">Ubicación del local</div>
                                <p className="text-[13px] text-content-subtle mt-0.5">
                                    El punto del mapa en el catálogo virtual y el de «Cómo llegar». Sin marcarlo, el catálogo no muestra el mapa.
                                </p>
                            </div>
                            <Button onClick={() => setUbicando(true)} variant={lugar.lat != null ? "ghost" : "primary"} className="h-10 px-4 text-[13px] shrink-0">
                                {lugar.lat != null ? "Mover el punto" : "Marcar en el mapa"}
                            </Button>
                        </div>
                        {lugar.lat != null && (
                            <div className="rounded-xl overflow-hidden border border-border/60 dark:border-white/[0.06]">
                                <MiniMapa lat={lugar.lat} lng={lugar.lng} className="h-44" />
                            </div>
                        )}
                    </div>
                )}

                {seccion === "ajustes" && paso && (
                    <div className={`${CARD} px-4 py-4 space-y-3`}>
                        <div>
                            <div className="text-[14px] font-semibold text-content dark:text-white">Reservas en línea</div>
                            <p className="text-[13px] text-content-subtle mt-0.5">
                                Los clientes reservan desde el catálogo virtual con «Reservar cita». Solo ven las horas libres; no hay sobrecupo.
                            </p>
                        </div>
                        <Segmented value={paso.web_mode}
                            options={[{ key: "off", label: "Apagadas" }, { key: "pendiente", label: "Por confirmar" }, { key: "confirmada", label: "Confirmadas al instante" }]}
                            onChange={(v) => guardarAjuste({ web_mode: v }, v === "off" ? "Reservas en línea apagadas" : "Reservas en línea encendidas")} />
                        {paso.web_mode !== "off" && (
                            <>
                                <p className="text-[12px] text-content-subtle">
                                    {paso.web_mode === "pendiente"
                                        ? "Cada reserva entra como «Por confirmar»: confírmala desde la agenda y escríbele al cliente por WhatsApp."
                                        : "Cada reserva entra confirmada a la agenda."}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[13px] text-content dark:text-white">Se puede reservar hasta</span>
                                    <Segmented value={paso.web_days} options={[7, 14, 30, 60].map(n => ({ key: n, label: `${n} días` }))}
                                        onChange={(n) => guardarAjuste({ web_days: n })} />
                                    <span className="text-[13px] text-content-subtle">por delante</span>
                                </div>
                                <p className="text-[12px] text-content-subtle">
                                    Para que el catálogo se vea como el de una barbería o un spa, elige el tema «Servicios» en Configuración → Vitrina.
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {ubicando && (
                <MapPicker skin={sheetSkin(null)} initial={lugar?.lat != null ? { lat: lugar.lat, lng: lugar.lng } : null}
                    titulo={`Ubicación de ${toNameCase(lugar?.name) || "la sucursal"}`} ayuda="Mueve el mapa hasta que el pin quede en la puerta del local" accion="Guardar ubicación"
                    onClose={() => setUbicando(false)}
                    onPick={async (p) => {
                        try {
                            const r = await api.agenda.saveLocation({ warehouse_id: warehouseId, lat: p.lat, lng: p.lng });
                            setLugar(l => ({ ...l, lat: r.data.lat, lng: r.data.lng }));
                            setUbicando(false);
                            notify("Ubicación guardada");
                            onChanged?.();
                        } catch (e) { notify(e.message, "err"); }
                    }} />
            )}

            {editando && (
                <ResourceModal resource={editando} warehouseId={warehouseId} options={opciones}
                    onClose={() => setEditando(null)}
                    onSaved={() => { setEditando(null); recargar(); }} />
            )}
        </div>
    );
}
