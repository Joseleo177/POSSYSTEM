import { useEffect, useMemo, useState } from "react";
import CatalogSheet, { SheetHeader, sheetSkin } from "./CatalogSheet";
import { publicApi } from "../../services/api";
import { hora12, fmtHora, duracion, iniciales, nombrePropio, FotoServicio } from "./agendaShared";
import { DOC_PREFIXES, docMaxLen } from "./shared";
import LegalLink from "./LegalLink";

// Reservar una cita desde la vitrina (Agenda de citas, ver services/agenda/publico.js).
//
// Cuatro pasos pensados para el teléfono: qué se van a hacer (una o varias personas: el papá y
// su hijo), con quién, cuándo, y quién reserva. Las horas que se ofrecen son las libres de
// verdad; para un grupo, cada hora ya trae quién atiende a cada uno (ver huecosGrupo). Si otro
// toma la hora un segundo antes, el servidor lo rechaza y se vuelve a elegir.
//
// Quien reserva entra con su cédula, como en el resto de la vitrina: si ya es cliente se le
// saluda por su nombre y no escribe nada más.

const masDias = (fecha, n) => { const [y, m, d] = fecha.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const diaSemana = (fecha) => { const [y, m, d] = fecha.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const fechaLarga = (fecha) => { const [y, m, d] = fecha.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" }); };
const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const CLIENTE_KEY = (token) => `agenda_cliente_${token}`;
// Iconos del ingreso, del mismo juego que la bienvenida de la vitrina (WelcomeSheets).
const ICO = {
    id: "M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2",
    user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
    phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
    bolt: "M13 10V3L4 14h7v7l9-11h-7z",
    cal: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    cash: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
    lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
    note: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
};
const Ico = ({ d, className = "w-4 h-4", w = 1.9 }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={w} d={d} /></svg>
);
// Campo con su icono a la izquierda, como en la bienvenida.
const Campo = ({ icon, children }) => (
    <span className="relative block">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg bg-brand-500/10 text-brand-600 flex items-center justify-center pointer-events-none"><Ico d={icon} /></span>
        {children}
    </span>
);
const MES = (fecha) => { const [y, m] = fecha.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("es-VE", { month: "short" }).replace(".", ""); };
const enmascarar = (tel) => { const n = String(tel || "").replace(/\D/g, ""); return n.length >= 7 ? `${n.slice(0, 4)} ••• ${n.slice(-4)}` : tel; };
const nuevaPersona = (n) => ({ key: `p${Date.now()}${n}`, name: "", services: [] });

const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Agregar la cita al calendario. Un .ics lo abre el iPhone (y Outlook en la computadora), pero
// Android no sabe qué hacer con él: allí sirve el enlace de Google Calendar, que abre la app o
// la web con la cita ya llena. Se ofrecen los dos.
const marca = (fecha, m) => `${fecha.replace(/-/g, "")}T${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
function enlaceGoogle({ store, fecha, desde, hasta, titulo }) {
    const p = new URLSearchParams({
        action: "TEMPLATE",
        text: `${titulo} · ${store?.name || ""}`,
        dates: `${marca(fecha, desde)}/${marca(fecha, hasta)}`,
        ctz: "America/Caracas",
        ...(store?.address ? { location: store.address } : {}),
    });
    return `https://calendar.google.com/calendar/render?${p}`;
}
/** Archivo .ics para el iPhone y Outlook. */
function enlaceCalendario({ store, fecha, desde, hasta, titulo }) {
    const f = fecha.replace(/-/g, "");
    const t = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}00`;
    const ics = [
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//NXUS//Agenda//ES", "BEGIN:VEVENT",
        `UID:${f}${t(desde)}-${Math.random().toString(36).slice(2)}@nxus`,
        `DTSTART;TZID=America/Caracas:${f}T${t(desde)}`, `DTEND;TZID=America/Caracas:${f}T${t(hasta)}`,
        `SUMMARY:${titulo} · ${store?.name || ""}`.replace(/[\n,;]/g, " "),
        ...(store?.address ? [`LOCATION:${store.address.replace(/[\n,;]/g, " ")}`] : []),
        "END:VEVENT", "END:VCALENDAR",
    ].join("\r\n");
    return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export default function BookingSheet({ open, onClose, token, store, info, initial, identity, onIdentified, fmt, baseCur, altCur, panel }) {
    const skin = sheetSkin(panel);
    const [paso, setPaso] = useState("servicio");
    const [personas, setPersonas] = useState([nuevaPersona(0)]);
    const [activa, setActiva] = useState(0);
    const [forma, setForma] = useState("juntos");      // juntos | seguidos (con 2+ personas)
    const [quien, setQuien] = useState(null);          // null = quien esté libre
    const [fecha, setFecha] = useState(null);
    const [hueco, setHueco] = useState(null);          // { start, plan }
    const [libres, setLibres] = useState(null);
    const [cargando, setCargando] = useState(false);
    // Ingreso: cédula → cliente conocido, o nombre y teléfono.
    const [prefijo, setPrefijo] = useState("V");
    const [numero, setNumero] = useState("");
    const [cliente, setCliente] = useState(null);      // { found, document, name, phone }
    const [sinCedula, setSinCedula] = useState(false);
    const [buscando, setBuscando] = useState(false);
    const [datos, setDatos] = useState({ name: "", phone: "", notes: "" });
    const [enviando, setEnviando] = useState(false);
    const [error, setError] = useState(null);
    const [hecha, setHecha] = useState(null);
    const [buscarSv, setBuscarSv] = useState("");
    const [catSv, setCatSv] = useState("");

    const equipo = info?.team || [];
    const catalogo = info?.services || [];
    const maxPersonas = info?.max_people || 4;

    useEffect(() => {
        if (!open) return;
        let guardado = {};
        try { guardado = JSON.parse(localStorage.getItem(CLIENTE_KEY(token))) || {}; } catch { /* modo privado */ }
        const p = nuevaPersona(0);
        if (initial?.serviceId) p.services = [initial.serviceId];
        setPersonas([p]); setActiva(0); setForma("juntos");
        setQuien(initial?.resourceId ?? null);
        setFecha(null); setHueco(null); setLibres(null); setError(null); setHecha(null);
        const doc = identity?.document || guardado.document || "";
        const md = String(doc).toUpperCase().match(/^([VEJGP])-?(\d+)$/);
        setPrefijo(md?.[1] || "V");
        setNumero(md?.[2] || "");
        setCliente(identity?.document ? { found: true, document: identity.document, name: identity.name, phone: identity.phone } : null);
        setSinCedula(false);
        setDatos({ name: guardado.name || "", phone: guardado.phone || "", notes: "" });
        setPaso("servicio");
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const cedulaCompleta = `${prefijo}-${numero}`;
    const grupo = personas.length > 1;
    // Con muchos servicios (un spa, un consultorio) se busca y se filtra por categoría.
    const categoriasSv = [...new Set(catalogo.map(sv => sv.category_name || "Otros"))];
    const muchos = catalogo.length > 8 || categoriasSv.length > 1;
    const filtradosSv = catalogo.filter(sv => (!catSv || (sv.category_name || "Otros") === catSv)
        && (!buscarSv.trim() || sinAcentos(sv.name).includes(sinAcentos(buscarSv.trim()))));
    const de = (p) => catalogo.filter(s => p.services.includes(s.id));
    const minutos = (p) => de(p).reduce((t, s) => t + s.duration_min, 0);
    const precioTotal = personas.reduce((t, p) => t + de(p).reduce((u, s) => u + (s.price || 0), 0), 0);
    const listos = personas.every(p => p.services.length);
    const nombrePersona = (p, i) => (i === 0 ? "Tú" : (p.name.trim() || `Persona ${i + 1}`));

    // Quién puede atender todo lo elegido (un servicio sin lista lo hacen todos). En grupo y
    // "uno después del otro", tiene que poder con lo de todos.
    const todos = personas.flatMap(de);
    const capaces = equipo.filter(r => todos.every(s => !s.resource_ids?.length || s.resource_ids.includes(r.id)));
    const eligeQuien = !grupo || forma === "seguidos";

    // Días que se ofrecen: desde hoy, los que alguien del equipo trabaja.
    const dias = useMemo(() => {
        if (!info) return [];
        const abiertos = new Set((info.hours || []).map(h => h.weekday));
        return Array.from({ length: (info.days_ahead || 30) + 1 }, (_, i) => masDias(info.today, i))
            .map(f => ({ fecha: f, abierto: abiertos.has(diaSemana(f)) }));
    }, [info]);

    const grupos = personas.map(p => p.services.join(",")).join("|");
    useEffect(() => {
        if (!open || paso !== "cuando" || !fecha || !listos) return undefined;
        let vivo = true;
        setCargando(true);
        setHueco(null);
        publicApi.agendaSlots(token, {
            warehouse_id: info.warehouse_id, date: fecha, groups: grupos, mode: grupo ? forma : "juntos",
            ...(eligeQuien && quien ? { resource_id: quien } : {}),
        })
            .then(r => { if (vivo) setLibres(r.data); })
            .catch(e => { if (vivo) { setLibres({ slots: [] }); setError(e.message); } })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [open, paso, fecha, quien, forma, grupos]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (paso === "cuando" && !fecha) setFecha(dias.find(d => d.abierto)?.fecha || null);
    }, [paso]); // eslint-disable-line react-hooks/exhaustive-deps

    const slots = libres?.slots || [];
    const tramos = [
        { label: "Mañana", slots: slots.filter(x => x.start < 720) },
        { label: "Tarde", slots: slots.filter(x => x.start >= 720 && x.start < 1080) },
        { label: "Noche", slots: slots.filter(x => x.start >= 1080) },
    ].filter(t => t.slots.length);

    const nombreDe = (id) => equipo.find(r => r.id === id)?.name || "";

    const editarPersona = (i, patch) => setPersonas(ps => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    const alternar = (id) => {
        const p = personas[activa];
        editarPersona(activa, { services: p.services.includes(id) ? p.services.filter(x => x !== id) : [...p.services, id] });
    };
    const agregarPersona = () => { setPersonas(ps => [...ps, nuevaPersona(ps.length)]); setActiva(personas.length); };
    const quitarPersona = (i) => { setPersonas(ps => ps.filter((_, j) => j !== i)); setActiva(0); };

    const identificar = async () => {
        if (buscando || numero.length < 6) return;
        setBuscando(true); setError(null);
        try {
            const r = await publicApi.identify(token, cedulaCompleta);
            setCliente(r.data);
            if (r.data.found) {
                setDatos(d => ({ ...d, name: r.data.name || d.name, phone: r.data.phone || d.phone }));
                onIdentified?.({ document: r.data.document, name: r.data.name, phone: r.data.phone });
            }
        } catch (e) { setError(e.message); }
        setBuscando(false);
    };

    const reservar = async () => {
        if (enviando) return;
        setEnviando(true); setError(null);
        const conocido = cliente?.found && !sinCedula;
        const nombre = conocido ? cliente.name : datos.name;
        const telefono = conocido && cliente.phone ? cliente.phone : datos.phone;
        try {
            const r = await publicApi.agendaBook(token, {
                warehouse_id: info.warehouse_id, date: fecha, start_min: hueco.start,
                mode: grupo ? forma : "juntos", resource_id: eligeQuien ? quien : null,
                name: nombre, phone: telefono, document: sinCedula ? "" : (cliente?.document || cedulaCompleta), notes: datos.notes,
                people: personas.map((p, i) => ({ name: i === 0 ? nombre : p.name, product_ids: p.services })),
            });
            try { localStorage.setItem(CLIENTE_KEY(token), JSON.stringify({ name: nombre, phone: telefono, document: sinCedula ? "" : (cliente?.document || cedulaCompleta) })); } catch { /* modo privado */ }
            setHecha(r.data);
            setPaso("listo");
        } catch (e) {
            setError(e.message);
            if (e.status === 409) { setPaso("cuando"); setLibres(null); setHueco(null); }
        }
        setEnviando(false);
    };

    if (!open || !info) return null;

    const pasos = ["servicio", ...((grupo || equipo.length > 1) ? ["quien"] : []), "cuando", "datos"];
    const n = pasos.indexOf(paso) + 1;
    const atras = () => { setError(null); setPaso(pasos[Math.max(0, pasos.indexOf(paso) - 1)]); };
    const siguiente = () => {
        setError(null);
        if (paso === "servicio" && quien && !capaces.some(r => r.id === quien)) setQuien(null);
        setPaso(pasos[pasos.indexOf(paso) + 1]);
    };

    const conocido = cliente?.found && !sinCedula;
    const telOk = String(conocido && cliente.phone ? cliente.phone : datos.phone).replace(/\D/g, "").length >= 10;
    const nombreOk = (conocido ? cliente.name : datos.name).trim().length > 1;
    const datosListos = (conocido || sinCedula || cliente?.found === false) && nombreOk && telOk;

    const titulo = {
        servicio: grupo ? "¿Qué se van a hacer?" : "¿Qué te vas a hacer?",
        quien: grupo ? "¿Cómo los atendemos?" : "¿Con quién?",
        cuando: "¿Cuándo?",
        datos: conocido ? `¡Hola, ${nombrePropio(cliente.name).split(" ")[0]}!` : "¿Quién reserva?",
        listo: hecha?.status === "confirmada" ? "¡Cita confirmada!" : "¡Solicitud enviada!",
    }[paso];

    let accion = null;
    if (paso === "servicio" && listos) accion = { label: `Continuar · ${grupo ? `${personas.length} personas` : duracion(minutos(personas[0]))}`, run: siguiente };
    if (paso === "quien") accion = { label: !eligeQuien ? "Continuar" : quien ? `Continuar con ${nombreDe(quien)}` : "Continuar con quien esté libre", run: siguiente };
    if (paso === "cuando" && hueco) accion = { label: `Continuar · ${fmtHora(hueco.start)}`, run: siguiente };
    if (paso === "datos" && !cliente && !sinCedula) accion = { label: buscando ? "Verificando…" : "Continuar", run: identificar, off: numero.length < 6 };
    if (paso === "datos" && datosListos) accion = { label: enviando ? "Reservando…" : conocido ? (grupo ? `Sí, soy yo · reservar ${personas.length} citas` : "Sí, soy yo · reservar") : (grupo ? `Reservar ${personas.length} citas` : "Reservar cita"), run: reservar };
    if (paso === "listo") accion = { label: "Listo", run: onClose };

    const tarjetaServicio = (s) => {
        const on = personas[activa].services.includes(s.id);
        return (
            <button key={s.id} type="button" onClick={() => alternar(s.id)}
                className={`w-full text-left p-2.5 pr-4 flex items-center gap-3 rounded-2xl transition-all ${on ? skin.selected : skin.option}`}>
                <FotoServicio s={s} className="w-16 h-16 rounded-xl shrink-0" />
                <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-semibold ${skin.ink}`}>{s.name}</span>
                    <span className={`block text-[12px] ${skin.subtle}`}>{duracion(s.duration_min)}{s.short_description ? ` · ${s.short_description}` : ""}</span>
                    <span className={`block text-[14px] font-semibold ${skin.ink} mt-0.5 tabular-nums`}>{fmt(s.price, baseCur)}</span>
                </span>
                <span className={`w-6 h-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${on ? "bg-brand-500 border-brand-500 text-white" : "border-black/20"}`}>
                    {on && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>}
                </span>
            </button>
        );
    };

    const avatar = (r, size = "w-14 h-14 text-[18px]") => (
        <span className={`${size} rounded-full flex items-center justify-center text-white font-bold`} style={{ background: r.color || "#334155" }}>{iniciales(r.name)}</span>
    );

    return (
        <CatalogSheet skin={skin} onClose={enviando ? null : onClose} label="Reservar cita" width="sm:max-w-xl">
            <SheetHeader skin={skin} onClose={onClose} closeDisabled={enviando}
                eyebrow={paso === "listo" ? store?.name : `Paso ${n} de ${pasos.length}`}
                title={titulo}
                actions={paso !== "listo" && n > 1 && (
                    <button type="button" onClick={atras} className={`h-9 px-3 text-[13px] font-medium ${skin.secondary}`}>Atrás</button>
                )} />

            {/* pt-1: el anillo de lo elegido se dibuja por fuera de la tarjeta y el scroll lo cortaba arriba. */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-1 pb-4">
                {error && <div className="mb-3 rounded-xl bg-red-500/10 text-red-700 px-3.5 py-2.5 text-[13px]">{error}</div>}

                {paso === "servicio" && (
                    <div className="space-y-3">
                        {grupo && (
                            <div className="-mx-5 px-5 flex gap-2 overflow-x-auto scrollbar-hide">
                                {personas.map((p, i) => (
                                    <button key={p.key} type="button" onClick={() => setActiva(i)}
                                        className={`h-10 pl-3.5 ${i ? "pr-2" : "pr-3.5"} rounded-full text-[13px] font-semibold whitespace-nowrap flex items-center gap-1.5 shrink-0 transition-all
                                            ${i === activa ? "bg-neutral-900 text-white" : `${skin.option} ${skin.ink}`}`}>
                                        {nombrePersona(p, i)}
                                        <span className={`text-[11px] font-medium ${i === activa ? "text-white/70" : skin.subtle}`}>{p.services.length || ""}</span>
                                        {i > 0 && (
                                            <span role="button" tabIndex={0} aria-label="Quitar persona" onClick={(e) => { e.stopPropagation(); quitarPersona(i); }}
                                                className={`w-6 h-6 rounded-full flex items-center justify-center ${i === activa ? "hover:bg-white/15" : "hover:bg-black/[0.06]"}`}>
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                        {activa > 0 && (
                            <label className="block">
                                <span className={skin.label}>¿Cómo se llama?</span>
                                <input value={personas[activa].name} onChange={e => editarPersona(activa, { name: e.target.value })} placeholder="Ej.: Mateo"
                                    autoComplete="off" className={`${skin.field} mt-1`} />
                            </label>
                        )}
                        {grupo && <p className={`text-[13px] font-medium ${skin.ink}`}>Servicios para {activa === 0 ? "ti" : (personas[activa].name.trim() || "esta persona")}</p>}
                        {muchos && (
                            <div className="space-y-2">
                                {catalogo.length > 8 && (
                                    <div className="relative">
                                        <svg className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${skin.subtle} pointer-events-none`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" /></svg>
                                        <input value={buscarSv} onChange={e => setBuscarSv(e.target.value)} placeholder="Buscar servicio" autoComplete="off" className={`${skin.field} pl-10`} />
                                    </div>
                                )}
                                {categoriasSv.length > 1 && (
                                    <div className="-mx-5 px-5 flex gap-2 overflow-x-auto scrollbar-hide">
                                        {["", ...categoriasSv].map(c => (
                                            <button key={c || "todas"} type="button" onClick={() => setCatSv(c)}
                                                className={`h-9 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap shrink-0 transition-all ${catSv === c ? "bg-neutral-900 text-white" : `${skin.option} ${skin.ink}`}`}>
                                                {c || "Todos"}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="space-y-2">
                            {filtradosSv.map(tarjetaServicio)}
                            {!filtradosSv.length && <p className={`text-center text-[13px] ${skin.subtle} py-6`}>Ningún servicio coincide.</p>}
                        </div>
                        {personas.length < maxPersonas && (
                            <button type="button" onClick={agregarPersona} className={`w-full h-12 flex items-center justify-center gap-2 text-[14px] font-semibold ${skin.dashed}`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2.2} d="M12 5v14M5 12h14" /></svg>
                                {grupo ? "Agregar otra persona" : "Reservar también para otra persona"}
                            </button>
                        )}
                        {grupo && !listos && <p className={`text-[12px] ${skin.subtle}`}>Elige al menos un servicio para cada persona.</p>}
                    </div>
                )}

                {paso === "quien" && (
                    <div className="space-y-4">
                        {grupo && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {[
                                    { key: "juntos", t: "Al mismo tiempo", d: "Cada uno con un profesional distinto. Terminan juntos." },
                                    { key: "seguidos", t: "Uno después del otro", d: "Con el mismo profesional, en turnos seguidos." },
                                ].map(o => (
                                    <button key={o.key} type="button" onClick={() => setForma(o.key)}
                                        className={`text-left p-4 rounded-2xl transition-all ${forma === o.key ? skin.selected : skin.option}`}>
                                        <span className={`block text-[15px] font-semibold ${skin.ink}`}>{o.t}</span>
                                        <span className={`block text-[12px] ${skin.subtle} mt-0.5`}>{o.d}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                        {grupo && forma === "juntos" && (
                            <div className={`${skin.soft} px-4 py-3 text-[13px] ${skin.muted}`}>Al elegir la hora verás quién atiende a cada uno.</div>
                        )}
                        {eligeQuien && (
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => setQuien(null)}
                                    className={`px-3 py-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${quien === null ? skin.selected : skin.option}`}>
                                    <span className="w-14 h-14 rounded-full bg-black/[0.06] flex items-center justify-center text-neutral-600">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.4-1.8M17 20H7m10 0v-2c0-.7-.1-1.3-.4-1.8M7 20H2v-2a3 3 0 015.4-1.8M7 20v-2c0-.7.1-1.3.4-1.8m0 0a5 5 0 019.2 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    </span>
                                    <span className={`text-[14px] font-semibold ${skin.ink}`}>Quien esté libre</span>
                                    <span className={`text-[11px] ${skin.subtle} -mt-1.5`}>Más horas para elegir</span>
                                </button>
                                {capaces.map(r => (
                                    <button key={r.id} type="button" onClick={() => setQuien(r.id)}
                                        className={`px-3 py-4 rounded-2xl flex flex-col items-center gap-2 transition-all ${quien === r.id ? skin.selected : skin.option}`}>
                                        {avatar(r)}
                                        <span className={`text-[14px] font-semibold ${skin.ink}`}>{r.name}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {paso === "cuando" && (
                    <div className="space-y-4">
                        <div className="-mx-5 px-5 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                            {dias.map(d => {
                                const on = d.fecha === fecha;
                                const [, m, dd] = d.fecha.split("-").map(Number);
                                return (
                                    <button key={d.fecha} type="button" disabled={!d.abierto} onClick={() => setFecha(d.fecha)}
                                        className={`w-[58px] h-[72px] shrink-0 rounded-2xl flex flex-col items-center justify-center transition-all disabled:opacity-35
                                            ${on ? "bg-brand-500 text-white shadow-[0_8px_20px_-10px_rgb(var(--c-brand-600)/0.8)]" : `${skin.option} ${skin.ink}`}`}>
                                        <span className={`text-[11px] font-medium ${on ? "text-white/85" : skin.subtle}`}>{d.fecha === info.today ? "Hoy" : DIAS[diaSemana(d.fecha)]}</span>
                                        <span className="text-[20px] font-bold leading-tight tabular-nums">{dd}</span>
                                        <span className={`text-[10px] ${on ? "text-white/80" : skin.subtle}`}>{d.abierto ? new Date(2000, m - 1, 1).toLocaleDateString("es-VE", { month: "short" }).replace(".", "") : "Cerrado"}</span>
                                    </button>
                                );
                            })}
                        </div>
                        {fecha && (
                            <p className={`text-[13px] font-medium ${skin.ink} first-letter:uppercase`}>
                                {fechaLarga(fecha)}{eligeQuien && quien ? ` · con ${nombreDe(quien)}` : ""}{grupo ? ` · ${personas.length} personas` : ""}
                            </p>
                        )}
                        {cargando && !libres ? (
                            <div className="py-10 flex justify-center"><span className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>
                        ) : !slots.length ? (
                            <div className={`${skin.soft} px-4 py-6 text-center`}>
                                <p className={`text-[14px] font-semibold ${skin.ink}`}>No quedan horas este día</p>
                                <p className={`text-[12px] ${skin.subtle} mt-1`}>Prueba otro día{eligeQuien && quien ? " o con quien esté libre" : grupo ? " o uno después del otro" : ""}.</p>
                            </div>
                        ) : (
                            <div className={`space-y-4 ${cargando ? "opacity-60" : ""}`}>
                                {tramos.map(t => (
                                    <div key={t.label}>
                                        <p className={`text-[12px] font-medium ${skin.subtle} mb-2`}>{t.label}</p>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                            {t.slots.map(x => {
                                                const on = hueco?.start === x.start;
                                                const h = hora12(x.start);
                                                return (
                                                    <button key={x.start} type="button" onClick={() => setHueco(x)}
                                                        className={`h-12 rounded-xl tabular-nums transition-all flex items-center justify-center
                                                            ${on ? "bg-brand-500 text-white" : `${skin.option} ${skin.ink}`}`}>
                                                        <span className="flex items-baseline gap-1">
                                                            <span className="text-[15px] font-semibold">{h.h}</span>
                                                            <span className={`text-[11px] font-medium ${on ? "text-white/80" : skin.subtle}`}>{h.ampm}</span>
                                                        </span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {hueco && grupo && (
                            <div className={`${skin.card} divide-y ${skin.divide}`}>
                                {hueco.plan.map((p, i) => (
                                    <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3 text-[13px]">
                                        <span className={`${skin.ink} font-medium`}>{nombrePersona(personas[i], i)}</span>
                                        <span className={skin.muted}>{fmtHora(p.start)} · con {nombreDe(p.resource_id)}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {paso === "datos" && (
                    <div className="space-y-4">
                        {/* La cita como un comprobante: el día en grande, la hora, quién y qué. */}
                        <div className="rounded-3xl bg-white ring-1 ring-black/[0.06] shadow-[0_10px_30px_-18px_rgba(0,0,0,0.35)] overflow-hidden">
                            <div className="flex">
                                <div className="w-[76px] shrink-0 bg-neutral-900 text-white flex flex-col items-center justify-center py-3">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">{DIAS[diaSemana(fecha)]}</span>
                                    <span className="font-display text-[30px] font-bold leading-none my-0.5 tabular-nums">{Number(fecha.split("-")[2])}</span>
                                    <span className="text-[11px] font-medium text-white/60">{MES(fecha)}</span>
                                </div>
                                <div className="flex-1 min-w-0 px-4 py-3">
                                    <p className="tabular-nums leading-tight">
                                        <span className="font-display text-[22px] font-bold text-neutral-900">{hora12(hueco.start).h}</span>
                                        <span className="text-[13px] font-semibold text-neutral-500 ml-1">{hora12(hueco.start).ampm}</span>
                                    </p>
                                    <div className="mt-2 space-y-1.5">
                                        {personas.map((p, i) => {
                                            const r = equipo.find(x => x.id === hueco.plan[i]?.resource_id);
                                            return (
                                                <div key={p.key} className="flex items-center gap-2 min-w-0">
                                                    <div className="flex -space-x-2 shrink-0">
                                                        {de(p).slice(0, 2).map(sv => <FotoServicio key={sv.id} s={sv} className="w-7 h-7 rounded-full ring-2 ring-white" icono="w-3.5 h-3.5" />)}
                                                    </div>
                                                    <p className="text-[13px] text-neutral-800 truncate">
                                                        {grupo && <span className="font-semibold">{nombrePersona(p, i)} · </span>}
                                                        {de(p).map(sv => sv.name).join(" + ")}
                                                        {r && <span className="text-neutral-500"> con {r.name}</span>}
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                            <div className="border-t border-dashed border-black/10 px-4 py-2.5 flex items-center justify-between text-[13px]">
                                <span className="text-neutral-500">Pagas en el local</span>
                                <span className="tabular-nums"><span className="font-bold text-neutral-900">{fmt(precioTotal, baseCur)}</span>{altCur && <span className="text-neutral-500"> · {fmt(precioTotal, altCur)}</span>}</span>
                            </div>
                        </div>

                        {/* 1. La cédula */}
                        {!cliente && !sinCedula && (
                            <div key="doc" className="rise-in space-y-3">
                                <div>
                                    <p className={`font-display text-[19px] font-bold ${skin.ink}`}>Identifícate para reservar</p>
                                    <p className={`text-[13px] ${skin.muted} mt-0.5`}>Si ya viniste, te reconocemos y no escribes nada más.</p>
                                </div>
                                {/* El tipo de documento como pastillas: son cinco letras y se eligen de un toque. */}
                                <div className="flex gap-1.5" role="radiogroup" aria-label="Tipo de documento">
                                    {DOC_PREFIXES.map(x => (
                                        <button key={x} type="button" role="radio" aria-checked={prefijo === x}
                                            onClick={() => { setPrefijo(x); setNumero(n => n.slice(0, docMaxLen(x))); }}
                                            className={`flex-1 h-10 rounded-xl text-[14px] font-bold transition-all ${prefijo === x ? "bg-neutral-900 text-white shadow-sm" : "bg-black/[0.05] text-neutral-600 hover:bg-black/[0.08]"}`}>
                                            {x}
                                        </button>
                                    ))}
                                </div>
                                <Campo icon={ICO.id}>
                                    <span className="absolute left-12 top-1/2 -translate-y-1/2 text-[17px] font-semibold text-neutral-400 pointer-events-none">{prefijo}-</span>
                                    <input value={numero} onChange={e => setNumero(e.target.value.replace(/\D/g, "").slice(0, docMaxLen(prefijo)))}
                                        onKeyDown={e => { if (e.key === "Enter") identificar(); }}
                                        inputMode="numeric" autoComplete="off" aria-label="Número de cédula o RIF" placeholder={"0".repeat(docMaxLen(prefijo))}
                                        className="w-full h-14 pl-[4.6rem] pr-4 rounded-2xl border border-black/10 bg-white text-[18px] font-semibold tracking-wide text-neutral-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 placeholder:text-neutral-300 tabular-nums transition-shadow" />
                                </Campo>
                                <ul className="grid grid-cols-3 gap-2">
                                    {[[ICO.bolt, "Reserva en segundos"], [ICO.cal, "Tu cita a tu nombre"], [ICO.cash, "Pagas en el local"]].map(([d, t], i) => (
                                        <li key={t} style={{ "--i": i + 1 }} className={`rise-in ${skin.card} px-2 py-3 flex flex-col items-center gap-1.5 text-center`}>
                                            <span className="w-8 h-8 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center"><Ico d={d} /></span>
                                            <span className={`text-[11px] font-medium ${skin.muted} leading-tight`}>{t}</span>
                                        </li>
                                    ))}
                                </ul>
                                <div className="flex items-center justify-between gap-3">
                                    <button type="button" onClick={() => setSinCedula(true)} className={`text-[13px] font-medium ${skin.muted} underline underline-offset-2`}>No tengo la cédula a mano</button>
                                    <span className={`flex items-center gap-1 text-[11px] ${skin.subtle}`}><Ico d={ICO.lock} className="w-3.5 h-3.5" /> <LegalLink nueva>Privacidad</LegalLink></span>
                                </div>
                            </div>
                        )}

                        {/* 2a. Ya es cliente: ¿eres tú? */}
                        {conocido && (
                            <div key="yo" className="rise-in text-center pt-1">
                                <div className="ring-grow relative w-[72px] h-[72px] mx-auto">
                                    <span className="absolute -inset-2 rounded-full bg-brand-500/15" aria-hidden="true" />
                                    <span className="relative w-[72px] h-[72px] rounded-full bg-brand-500 text-white flex items-center justify-center font-display text-[24px] font-bold"
                                        style={{ backgroundImage: "linear-gradient(145deg, rgb(255 255 255 / .25), rgb(0 0 0 / .08))" }}>
                                        {iniciales(cliente.name)}
                                    </span>
                                </div>
                                <p className={`mt-3 text-[13px] ${skin.subtle}`}>¿Eres tú?</p>
                                <p className={`font-display text-[20px] font-bold ${skin.ink}`}>{nombrePropio(cliente.name)}</p>
                                <p className={`text-[13px] ${skin.subtle} tabular-nums`}>{cliente.document}{cliente.phone ? ` · ${enmascarar(cliente.phone)}` : ""}</p>
                                <button type="button" onClick={() => { setCliente(null); setNumero(""); setDatos(d => ({ ...d, name: "", phone: "" })); }} className={`mt-1 h-9 text-[13px] font-medium ${skin.subtle} hover:text-neutral-900`}>No, corregir la cédula</button>
                            </div>
                        )}

                        {/* 2b. Primera vez, o sin cédula: nombre y WhatsApp */}
                        {(sinCedula || cliente?.found === false || (conocido && !cliente.phone)) && (
                            <div key="nuevo" className="rise-in space-y-3">
                                {!conocido && (
                                    <div>
                                        <p className={`font-display text-[19px] font-bold ${skin.ink}`}>{sinCedula ? "¿A nombre de quién?" : "Es tu primera vez"}</p>
                                        <p className={`text-[13px] ${skin.muted} mt-0.5`}>
                                            {sinCedula ? "Con tu nombre y tu WhatsApp basta." : <>Deja tus datos y quedas registrado con <span className="font-semibold tabular-nums">{cedulaCompleta}</span>.</>}
                                        </p>
                                    </div>
                                )}
                                {!conocido && (
                                    <Campo icon={ICO.user}>
                                        <input value={datos.name} onChange={e => setDatos(d => ({ ...d, name: e.target.value }))} autoComplete="name" placeholder="Nombre y apellido" className={`${skin.field} pl-12`} />
                                    </Campo>
                                )}
                                <Campo icon={ICO.phone}>
                                    <input value={datos.phone} onChange={e => setDatos(d => ({ ...d, phone: e.target.value }))} type="tel" inputMode="tel" autoComplete="tel" placeholder="WhatsApp: 0414 5550000" className={`${skin.field} pl-12 tabular-nums`} />
                                </Campo>
                                {sinCedula && (
                                    <button type="button" onClick={() => setSinCedula(false)} className={`text-[13px] font-medium ${skin.muted} underline underline-offset-2`}>Mejor uso mi cédula</button>
                                )}
                            </div>
                        )}

                        {(conocido || sinCedula || cliente?.found === false) && (
                            <>
                                <Campo icon={ICO.note}>
                                    <input value={datos.notes} onChange={e => setDatos(d => ({ ...d, notes: e.target.value }))} maxLength={300} autoComplete="off"
                                        placeholder="Nota opcional: degradado bajo, traigo foto…" className={`${skin.field} pl-12`} />
                                </Campo>
                                <p className={`text-[12px] ${skin.subtle} text-center`}>
                                    {info.mode === "confirmada" ? "Tu cita queda confirmada al instante." : "La tienda confirmará tu cita y te escribirá por WhatsApp."}
                                </p>
                            </>
                        )}
                    </div>
                )}

                {paso === "listo" && hecha && (
                    <div className="space-y-4 pt-1">
                        <div className="flex flex-col items-center text-center gap-2 py-2">
                            <span className="w-16 h-16 rounded-full bg-brand-500 text-white flex items-center justify-center">
                                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            </span>
                            <p className={`text-[14px] ${skin.muted} max-w-xs first-letter:uppercase`}>
                                {fechaLarga(hecha.date)}. {hecha.status === "confirmada" ? "Te esperamos." : "Te escribiremos para confirmarla."}
                            </p>
                        </div>
                        <div className={`${skin.card} divide-y ${skin.divide}`}>
                            {hecha.appointments.map(a => (
                                <div key={a.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        {grupo && <p className={`text-[12px] ${skin.subtle}`}>{a.person}</p>}
                                        <p className={`text-[14px] font-semibold ${skin.ink}`}>{a.items.map(i => i.name).join(" + ")}</p>
                                        <p className={`text-[13px] ${skin.muted}`}>con {a.resource_name}</p>
                                    </div>
                                    <span className={`text-[14px] font-semibold ${skin.ink} tabular-nums shrink-0`}>{fmtHora(a.start_min)}</span>
                                </div>
                            ))}
                            <div className="px-4 py-2.5 flex justify-between text-[14px]">
                                <span className={skin.subtle}>Total</span>
                                <span className={`${skin.ink} font-semibold tabular-nums`}>{fmt(precioTotal, baseCur)}</span>
                            </div>
                        </div>
                        {(() => {
                            const ev = {
                                store, fecha: hecha.date,
                                desde: Math.min(...hecha.appointments.map(a => a.start_min)),
                                hasta: Math.max(...hecha.appointments.map(a => a.end_min)),
                                titulo: hecha.appointments.flatMap(a => a.items.map(i => i.name)).join(" + "),
                            };
                            const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
                            const google = (
                                <a key="g" href={enlaceGoogle(ev)} target="_blank" rel="noreferrer" className={`h-12 flex-1 flex items-center justify-center gap-2 ${skin.secondary}`}>
                                    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.6a4.8 4.8 0 01-2.1 3.1v2.6h3.4c2-1.8 3.1-4.5 3.1-7.5z"/><path fill="#34A853" d="M12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.3H2.7v2.7A10 10 0 0012 22z"/><path fill="#FBBC05" d="M6.2 13.6a6 6 0 010-3.2V7.7H2.7a10 10 0 000 8.6l3.5-2.7z"/><path fill="#EA4335" d="M12 6c1.5 0 2.9.5 4 1.5l3-3A10 10 0 002.7 7.7l3.5 2.7C7 7.8 9.3 6 12 6z"/></svg>
                                    Google Calendar
                                </a>
                            );
                            const apple = (
                                <a key="a" href={enlaceCalendario(ev)} download="cita.ics" className={`h-12 flex-1 flex items-center justify-center gap-2 ${skin.secondary}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    {ios ? "Calendario" : "Apple / Outlook"}
                                </a>
                            );
                            return (
                                <div>
                                    <p className={`text-[12px] ${skin.subtle} text-center mb-2`}>Agrégala a tu calendario</p>
                                    {/* Lo que sirve en el aparato que se usa, primero. */}
                                    <div className="flex gap-2">{ios ? [apple, google] : [google, apple]}</div>
                                </div>
                            );
                        })()}
                        {store?.address && <p className={`text-[12px] ${skin.subtle} text-center`}>{store.address}</p>}
                    </div>
                )}
            </div>

            {accion && (
                <div className={`shrink-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] border-t ${skin.line}`}>
                    <button type="button" onClick={accion.run} disabled={enviando || buscando || accion.off}
                        className={`w-full min-h-[52px] ${skin.primary} disabled:opacity-50`}>
                        {accion.label}
                    </button>
                </div>
            )}
        </CatalogSheet>
    );
}
