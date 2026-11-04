import { useEffect, useMemo, useRef, useState } from "react";
import StatusMark from "../ui/StatusMark";
import { toNameCase } from "../../helpers";
import { hhmm, hoy, minutoAhora, CITA_STATUS, estadoVista, COLORES, duracion } from "./shared";

// El día en columnas, una por profesional o puesto (escritorio y tablet en horizontal).
//
// Lo primero que se tiene que leer es lo que pasa AHORA: bajo el nombre de cada uno dice a
// quién está atendiendo (o cuándo le toca el siguiente), y la cita en curso va rellena de su
// color, con su avance. Una cita cuya hora pasó sin empezar se marca en ámbar ("¿Llegó?"); lo
// terminado se atenúa. Lo rayado es fuera del horario. Tocar un hueco da una cita a esa hora;
// tocar una cita la abre. Nada aparece solo con hover: en una tablet no hay puntero.
const PX = 1.6;          // píxeles por minuto: 15 min = 24 px
const COL_MIN = 220;
const RAYADO = "repeating-linear-gradient(135deg, rgb(148 163 184 / 0.10) 0 6px, transparent 6px 12px)";

/** Citas que se pisan en un mismo puesto (capacidad > 1) van lado a lado. */
function carriles(citas) {
    const orden = [...citas].sort((a, b) => a.start_min - b.start_min || a.end_min - b.end_min);
    const out = new Map();
    let grupo = [], finGrupo = -1;
    const cerrar = () => {
        const lanes = [];
        for (const c of grupo) {
            let i = lanes.findIndex(fin => fin <= c.start_min);
            if (i < 0) { i = lanes.length; lanes.push(0); }
            lanes[i] = c.end_min;
            out.set(c.id, { lane: i });
        }
        for (const c of grupo) out.get(c.id).lanes = lanes.length;
        grupo = [];
    };
    for (const c of orden) {
        if (grupo.length && c.start_min >= finGrupo) cerrar();
        grupo.push(c);
        finGrupo = Math.max(finGrupo, c.end_min);
    }
    if (grupo.length) cerrar();
    return out;
}

const inicial = (n) => String(n || "?").trim().charAt(0).toUpperCase();
const nombre = (a) => toNameCase(a.customer_name) || "Sin nombre";

/**
 * Qué está pasando con un profesional en este momento: a quién atiende (y si va pasado de
 * tiempo), o quién sigue. Lo usa la cabecera de su columna y el panel "Ahora" de la agenda propia.
 */
export function momentoDe(citas, ahora) {
    const vivas = citas.filter(a => !["cancelada", "no_asistio"].includes(a.status));
    const atendiendo = vivas.find(a => a.status === "en_curso") || null;
    const siguiente = vivas
        .filter(a => ["pendiente", "confirmada"].includes(a.status) && a.end_min > ahora)
        .sort((a, b) => a.start_min - b.start_min)[0] || null;
    const sinLlegar = vivas.filter(a => ["pendiente", "confirmada"].includes(a.status) && a.start_min <= ahora - 5 && a.end_min > ahora - 120);
    return { atendiendo, siguiente, sinLlegar, pasado: atendiendo ? Math.max(0, ahora - atendiendo.end_min) : 0 };
}

export default function DayGrid({ data, onSlot, onOpen, canBookFor }) {
    const { resources = [], appointments = [], blocks = [], step = 15, date } = data;
    const esHoy = date === hoy();
    const [ahora, setAhora] = useState(minutoAhora);
    useEffect(() => {
        if (!esHoy) return undefined;
        const t = setInterval(() => setAhora(minutoAhora()), 30_000);
        return () => clearInterval(t);
    }, [esHoy]);
    const reloj = esHoy ? ahora : -1;

    // Rango del día: del primer horario al último, en horas enteras, ampliado si hay citas fuera.
    const [desde, hasta] = useMemo(() => {
        const wd = new Date(`${date}T12:00:00`).getDay();
        const franjas = resources.flatMap(r => r.hours.filter(h => h.weekday === wd));
        const vivas = appointments.filter(a => a.status !== "cancelada");
        let a = Math.min(...franjas.map(f => f.start_min), ...vivas.map(c => c.start_min), 9 * 60);
        let b = Math.max(...franjas.map(f => f.end_min), ...vivas.map(c => c.end_min), 18 * 60);
        a = Math.floor(a / 60) * 60;
        b = Math.min(1440, Math.ceil(b / 60) * 60);
        return [a, b];
    }, [resources, appointments, date]);

    const alto = (hasta - desde) * PX;
    const y = (min) => (min - desde) * PX;
    const wd = new Date(`${date}T12:00:00`).getDay();

    // Al abrir hoy, la vista arranca cerca de la hora actual.
    const scrollRef = useRef(null);
    useEffect(() => {
        if (!esHoy || !scrollRef.current) return;
        scrollRef.current.scrollTop = Math.max(0, y(minutoAhora()) - 140);
    }, [date]); // eslint-disable-line react-hooks/exhaustive-deps

    const horas = [];
    for (let m = desde; m < hasta; m += 60) horas.push(m);

    const tocarHueco = (r, e) => {
        if (!canBookFor(r)) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const min = desde + Math.floor((e.clientY - rect.top) / PX / step) * step;
        onSlot(r, Math.max(desde, Math.min(min, hasta - step)));
    };

    if (!resources.length) return null;
    const verAhora = esHoy && ahora >= desde && ahora <= hasta;
    // Un solo profesional (el barbero mirando lo suyo): la columna centrada, no de lado a lado.
    const uno = resources.length === 1;

    return (
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto bg-white dark:bg-surface-dark-1">
            <div className={`flex ${uno ? "max-w-3xl mx-auto" : "min-w-max"}`}>
                {/* Eje de horas */}
                <div className="sticky left-0 z-20 w-16 shrink-0 bg-white dark:bg-surface-dark-1 border-r border-border/60 dark:border-white/[0.06]">
                    <div className="h-[72px] sticky top-0 z-10 bg-white dark:bg-surface-dark-1 border-b border-border/60 dark:border-white/[0.06]" />
                    <div className="relative" style={{ height: alto }}>
                        {horas.map(m => (
                            <div key={m} className="absolute right-2.5 -translate-y-1/2 text-[11px] font-medium tabular-nums text-content-subtle" style={{ top: y(m) }}>
                                {m === desde ? "" : hhmm(m)}
                            </div>
                        ))}
                        {verAhora && (
                            <div className="absolute right-1 -translate-y-1/2 z-10 h-5 px-1.5 rounded-md bg-brand-600 text-white text-[10px] font-bold tabular-nums flex items-center" style={{ top: y(ahora) }}>
                                {hhmm(ahora)}
                            </div>
                        )}
                    </div>
                </div>

                {resources.map((r, idx) => {
                    const color = r.color || COLORES[idx % COLORES.length];
                    const franjas = r.hours.filter(h => h.weekday === wd);
                    const suyas = appointments.filter(a => a.resource_id === r.id && a.status !== "cancelada");
                    const lanes = carriles(suyas);
                    const ausencias = blocks.filter(b => b.resource_id === r.id);
                    const reservable = canBookFor(r);
                    // Con un solo profesional, el panel "Ahora" de arriba ya lo dice: aquí no se repite.
                    const m = esHoy && !uno ? momentoDe(suyas, ahora) : null;
                    const cuantas = suyas.filter(a => a.status !== "no_asistio").length;
                    return (
                        <div key={r.id} className="flex-1 border-r border-border/60 dark:border-white/[0.06] last:border-r-0" style={{ minWidth: COL_MIN }}>
                            {/* Quién, y qué está haciendo ahora mismo */}
                            <div className="h-[72px] sticky top-0 z-10 px-3 flex items-center gap-2.5 bg-white/95 dark:bg-surface-dark-1/95 backdrop-blur border-b border-border/60 dark:border-white/[0.06]">
                                <span className="relative w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold shrink-0" style={{ background: color }}>
                                    {inicial(r.name)}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-baseline gap-2">
                                        <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(r.name)}</span>
                                        <span className="text-[11px] text-content-subtle shrink-0">{franjas.length ? `${cuantas} cita${cuantas === 1 ? "" : "s"}` : "No trabaja hoy"}</span>
                                    </div>
                                    {m?.atendiendo ? (
                                        <button type="button" onClick={() => onOpen(m.atendiendo)}
                                            className={`mt-1 max-w-full h-6 pl-2 pr-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 ${m.pasado > 0 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-sky-500/15 text-sky-800 dark:text-sky-300"}`}>
                                            <span className="relative flex w-2 h-2 shrink-0">
                                                <span className={`absolute inset-0 rounded-full animate-ping opacity-60 ${m.pasado > 0 ? "bg-amber-500" : "bg-sky-500"}`} />
                                                <span className={`relative w-2 h-2 rounded-full ${m.pasado > 0 ? "bg-amber-500" : "bg-sky-500"}`} />
                                            </span>
                                            <span className="truncate">Atendiendo a {nombre(m.atendiendo)}{m.pasado > 0 ? ` · ${m.pasado} min de más` : ""}</span>
                                        </button>
                                    ) : m?.siguiente ? (
                                        <button type="button" onClick={() => onOpen(m.siguiente)} className="mt-1 max-w-full text-[11px] text-content-subtle truncate block text-left hover:text-content dark:hover:text-white">
                                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Libre</span> · sigue {nombre(m.siguiente)} a las {hhmm(m.siguiente.start_min)}
                                        </button>
                                    ) : m && franjas.length ? (
                                        <div className="mt-1 text-[11px] text-content-subtle"><span className="text-emerald-700 dark:text-emerald-400 font-semibold">Libre</span> · sin más citas hoy</div>
                                    ) : null}
                                </div>
                            </div>
                            <div
                                className={`relative ${reservable ? "cursor-pointer" : ""}`}
                                style={{ height: alto, backgroundImage: RAYADO }}
                                onClick={e => tocarHueco(r, e)}
                            >
                                {/* Horario: lo que se trabaja va liso; lo demás queda rayado */}
                                {franjas.map((f, i) => (
                                    <div key={i} className="absolute inset-x-0 bg-white dark:bg-surface-dark-1"
                                        style={{ top: y(Math.max(f.start_min, desde)), height: (Math.min(f.end_min, hasta) - Math.max(f.start_min, desde)) * PX }} />
                                ))}
                                {horas.map(hm => (
                                    <div key={hm} className="pointer-events-none">
                                        <div className="absolute inset-x-0 border-t border-border/70 dark:border-white/[0.07]" style={{ top: y(hm) }} />
                                        <div className="absolute inset-x-0 border-t border-dashed border-border/35 dark:border-white/[0.035]" style={{ top: y(hm + 30) }} />
                                    </div>
                                ))}
                                {ausencias.map(b => (
                                    <div key={b.id} className="absolute inset-x-1.5 rounded-lg px-2.5 py-1.5 overflow-hidden pointer-events-none bg-surface-3/80 dark:bg-white/[0.05] border border-dashed border-border dark:border-white/15"
                                        style={{ top: y(Math.max(b.start_min, desde)) + 1, height: Math.max(0, (Math.min(b.end_min, hasta) - Math.max(b.start_min, desde)) * PX - 2) }}>
                                        <span className="text-[11px] font-semibold text-content-subtle">{b.reason || "Ausente"}</span>
                                    </div>
                                ))}
                                {suyas.map(a => {
                                    const l = lanes.get(a.id) || { lane: 0, lanes: 1 };
                                    const enCurso = a.status === "en_curso";
                                    // En curso y pasada de la hora: el bloque se estira hasta ahora,
                                    // para que se vea que todavía ocupa el sillón.
                                    const fin = enCurso && reloj > a.end_min ? reloj : a.end_min;
                                    const h = Math.max(26, (fin - a.start_min) * PX - 3);
                                    const vista = estadoVista(a);
                                    const apagada = a.status === "no_asistio";
                                    const hecha = a.status === "terminada";
                                    const sinLlegar = ["pendiente", "confirmada"].includes(a.status) && reloj >= 0 && a.start_min <= reloj - 5;
                                    const corta = h < 48;
                                    const avance = enCurso && reloj >= 0 ? Math.min(1, Math.max(0, (reloj - a.start_min) / Math.max(1, a.end_min - a.start_min))) : 0;
                                    const pasado = enCurso && reloj > a.end_min ? reloj - a.end_min : 0;
                                    return (
                                        <button
                                            key={a.id}
                                            type="button"
                                            onClick={e => { e.stopPropagation(); onOpen(a); }}
                                            className={`absolute rounded-xl text-left overflow-hidden transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-md
                                                ${enCurso ? "text-white shadow-lg z-[6]" : "agenda-cita"}
                                                ${corta ? "px-2.5 py-1" : "px-3 py-2"} ${apagada ? "opacity-45" : ""} ${hecha ? "opacity-70" : ""}`}
                                            style={{
                                                top: y(a.start_min) + 1.5,
                                                height: h,
                                                left: `calc(${(l.lane / l.lanes) * 100}% + 6px)`,
                                                width: `calc(${100 / l.lanes}% - 12px)`,
                                                "--tinte": color,
                                                ...(enCurso ? { background: color } : {}),
                                                borderLeft: `4px solid ${sinLlegar ? "#f59e0b" : color}`,
                                                boxShadow: enCurso ? undefined : "0 1px 2px rgb(0 0 0 / 0.06)",
                                            }}
                                        >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {enCurso && (
                                                    <span className="relative flex w-2 h-2 shrink-0">
                                                        <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" />
                                                        <span className="relative w-2 h-2 rounded-full bg-white" />
                                                    </span>
                                                )}
                                                <span className={`text-[12px] font-semibold truncate ${enCurso ? "text-white" : "text-neutral-900 dark:text-white"} ${a.status === "cancelada" ? "line-through" : ""}`}>
                                                    {nombre(a)}
                                                </span>
                                                {a.source === "vitrina" && (
                                                    <svg className={`w-3 h-3 shrink-0 ${enCurso ? "text-white/80" : "text-neutral-500 dark:text-white/60"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Reservó en línea">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
                                                    </svg>
                                                )}
                                                {hecha && <svg className="w-3.5 h-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M5 13l4 4L19 7" /></svg>}
                                                <span className={`ml-auto text-[11px] tabular-nums shrink-0 ${enCurso ? "text-white/85 font-semibold" : sinLlegar ? "text-amber-700 dark:text-amber-400 font-semibold" : "text-neutral-600 dark:text-white/65"}`}>
                                                    {enCurso ? (pasado ? `+${pasado} min` : "En curso") : sinLlegar ? "¿Llegó?" : corta ? hhmm(a.start_min) : ""}
                                                </span>
                                            </div>
                                            {!corta && (
                                                <div className={`text-[11px] truncate tabular-nums ${enCurso ? "text-white/85" : "text-neutral-600 dark:text-white/65"}`}>
                                                    {hhmm(a.start_min)}–{hhmm(a.end_min % 1440)} · {a.items.map(i => i.name).join(" + ")}
                                                </div>
                                            )}
                                            {enCurso && !corta && (
                                                <div className="mt-2 h-1 rounded-full bg-white/25 overflow-hidden">
                                                    <div className={`h-full rounded-full ${pasado ? "bg-amber-300" : "bg-white"}`} style={{ width: `${avance * 100}%` }} />
                                                </div>
                                            )}
                                            {!enCurso && h >= 70 && !["confirmada"].includes(vista) && (
                                                <div className="mt-1.5 inline-flex rounded-full bg-white/80 dark:bg-black/25 px-2 py-0.5"><StatusMark status={vista} map={CITA_STATUS} /></div>
                                            )}
                                        </button>
                                    );
                                })}
                                {verAhora && (
                                    <div className="absolute inset-x-0 z-[5] pointer-events-none" style={{ top: y(ahora) }}>
                                        <div className="border-t-2 border-brand-500" />
                                        {idx === 0 && <div className="absolute -left-1 -top-[5px] w-2.5 h-2.5 rounded-full bg-brand-500" />}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * "Ahora" y "Siguiente" de un profesional, para quien mira su propia agenda: lo que tiene en el
 * sillón (con cuánto lleva) y quién viene, con un toque para abrir cada uno.
 */
export function PanelAhora({ citas, color, onOpen }) {
    const [ahora, setAhora] = useState(minutoAhora);
    useEffect(() => { const t = setInterval(() => setAhora(minutoAhora()), 30_000); return () => clearInterval(t); }, []);
    const { atendiendo, siguiente, sinLlegar } = momentoDe(citas, ahora);
    const pendienteLlegar = sinLlegar.find(a => a.id !== siguiente?.id) || (siguiente && siguiente.start_min <= ahora - 5 ? siguiente : null);
    const tarjeta = "rounded-2xl px-4 py-3 text-left min-w-0 flex-1 transition-transform hover:-translate-y-px";
    return (
        <div className="shrink-0 px-4 pt-3 pb-1 max-w-3xl w-full mx-auto flex flex-col sm:flex-row gap-2">
            {atendiendo ? (
                <button type="button" onClick={() => onOpen(atendiendo)} className={`${tarjeta} text-white shadow-md`} style={{ background: color }}>
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-white/85 uppercase tracking-wide">
                        <span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" /><span className="relative w-2 h-2 rounded-full bg-white" /></span>
                        Atendiendo ahora
                    </div>
                    <div className="text-[18px] font-bold mt-0.5 truncate">{nombre(atendiendo)}</div>
                    <div className="text-[13px] text-white/85 truncate">
                        {atendiendo.items.map(i => i.name).join(" + ")} · {ahora > atendiendo.end_min ? `${ahora - atendiendo.end_min} min de más` : `termina ${hhmm(atendiendo.end_min)}`}
                    </div>
                </button>
            ) : (
                <div className={`${tarjeta} bg-emerald-500/10 hover:translate-y-0`}>
                    <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-400 uppercase tracking-wide">Ahora</div>
                    <div className="text-[18px] font-bold text-content dark:text-white mt-0.5">Libre</div>
                    <div className="text-[13px] text-content-subtle">Toca un hueco de la agenda para atender a alguien</div>
                </div>
            )}
            {(pendienteLlegar || siguiente) && (() => {
                const c = pendienteLlegar || siguiente;
                const tarde = c.start_min <= ahora - 5;
                return (
                    <button type="button" onClick={() => onOpen(c)}
                        className={`${tarjeta} border ${tarde ? "border-amber-500/40 bg-amber-500/[0.07]" : "border-border dark:border-white/10 bg-white dark:bg-white/[0.03]"}`}>
                        <div className={`text-[11px] font-semibold uppercase tracking-wide ${tarde ? "text-amber-800 dark:text-amber-400" : "text-content-subtle"}`}>
                            {tarde ? `¿Llegó? Era a las ${hhmm(c.start_min)}` : `Sigue · ${c.start_min - ahora <= 60 ? `en ${Math.max(0, c.start_min - ahora)} min` : `a las ${hhmm(c.start_min)}`}`}
                        </div>
                        <div className="text-[18px] font-bold text-content dark:text-white mt-0.5 truncate">{nombre(c)}</div>
                        <div className="text-[13px] text-content-subtle truncate">{c.items.map(i => i.name).join(" + ")} · {duracion(c.items.reduce((t, i) => t + i.duration_min, 0))}</div>
                    </button>
                );
            })()}
        </div>
    );
}
