import StatusMark from "../ui/StatusMark";
import { toNameCase } from "../../helpers";
import { hhmm, hoy, minutoAhora, CITA_STATUS, estadoVista, COLORES } from "./shared";

// El día como lista, para el teléfono: lo que necesita el barbero entre un corte y otro es
// "quién sigue y a qué hora". Con varios profesionales, la pantalla filtra por uno arriba.
export default function DayList({ data, resourceId, onOpen, onNew }) {
    const { resources = [], appointments = [], blocks = [], date } = data;
    const colorDe = (id) => {
        const i = resources.findIndex(r => r.id === id);
        return resources[i]?.color || COLORES[Math.max(0, i) % COLORES.length];
    };
    const nombreDe = (id) => toNameCase(resources.find(r => r.id === id)?.name) || "";
    const lista = appointments
        .filter(a => a.status !== "cancelada" && (!resourceId || a.resource_id === resourceId))
        .sort((a, b) => a.start_min - b.start_min);
    const ausencias = blocks.filter(b => !resourceId || b.resource_id === resourceId);
    const ahora = date === hoy() ? minutoAhora() : -1;
    const variasColumnas = !resourceId && resources.length > 1;

    if (!lista.length && !ausencias.length) {
        return (
            <div className="py-14 text-center px-6">
                <div className="w-12 h-12 mx-auto rounded-xl bg-surface-3 dark:bg-white/[0.06] flex items-center justify-center text-content-subtle">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 3v3m8-3v3M4.5 9.5h15M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" /></svg>
                </div>
                <div className="text-[14px] font-semibold text-content dark:text-white mt-3">Sin citas este día</div>
                <div className="text-[13px] text-content-subtle mt-1">Las que se den aparecen aquí por hora.</div>
                {onNew && <button onClick={onNew} className="btn-outline h-12 px-5 rounded-lg text-[13px] font-medium mt-4">Nueva cita</button>}
            </div>
        );
    }

    return (
        <div className="px-4 py-3 space-y-2">
            {ausencias.map(b => (
                <div key={`b${b.id}`} className="rounded-xl border border-dashed border-border dark:border-white/15 px-3.5 py-2.5 text-[12px] text-content-subtle flex items-center justify-between gap-3">
                    <span className="truncate">{variasColumnas ? `${nombreDe(b.resource_id)} · ` : ""}{b.reason || "Ausente"}</span>
                    <span className="tabular-nums shrink-0">{b.start_min <= 0 && b.end_min >= 1440 ? "Todo el día" : `${hhmm(b.start_min)}–${hhmm(Math.min(b.end_min, 1439))}`}</span>
                </div>
            ))}
            {lista.map(a => {
                const vista = estadoVista(a);
                const ya = ahora >= a.start_min && ahora < a.end_min;
                const enCurso = a.status === "en_curso";
                return (
                    <button key={a.id} type="button" onClick={() => onOpen(a)}
                        className={`w-full text-left rounded-xl border bg-white dark:bg-white/[0.02] px-3.5 py-3 active:scale-[0.99] transition-transform flex gap-3
                            ${enCurso ? "border-transparent shadow-md text-white" : ya ? "border-brand-500/60 dark:border-brand-400/50" : "border-border/70 dark:border-white/[0.06]"} ${a.status === "no_asistio" ? "opacity-60" : ""}`}
                        style={{ borderLeft: `3px solid ${colorDe(a.resource_id)}`, ...(enCurso ? { background: colorDe(a.resource_id) } : {}) }}>
                        <div className="w-12 shrink-0">
                            <div className={`text-[15px] font-semibold tabular-nums ${enCurso ? "text-white" : "text-content dark:text-white"}`}>{hhmm(a.start_min)}</div>
                            <div className={`text-[11px] tabular-nums ${enCurso ? "text-white/80" : "text-content-subtle"}`}>{hhmm(a.end_min % 1440)}</div>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                                <span className={`text-[14px] font-semibold ${enCurso ? "text-white" : "text-content dark:text-white"} truncate`}>{toNameCase(a.customer_name) || "Sin nombre"}</span>
                                {enCurso
                                    ? <span className="shrink-0 inline-flex items-center gap-1.5 text-[12px] font-semibold text-white"><span className="relative flex w-2 h-2"><span className="absolute inset-0 rounded-full bg-white animate-ping opacity-70" /><span className="relative w-2 h-2 rounded-full bg-white" /></span>En curso</span>
                                    : vista !== "confirmada" && <span className="shrink-0"><StatusMark status={vista} map={CITA_STATUS} /></span>}
                            </div>
                            <div className={`text-[12px] truncate mt-0.5 ${enCurso ? "text-white/80" : "text-content-subtle"}`}>
                                {a.items.map(i => i.name).join(" + ")}{variasColumnas ? ` · ${nombreDe(a.resource_id)}` : ""}
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}
