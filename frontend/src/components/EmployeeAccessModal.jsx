import { useEffect, useState } from "react";
import { api } from "../services/api";
import Modal from "./ui/Modal";
import { fmtDateShort, fmtTime, fmtDayLabel, toLocalISO } from "../helpers/dates";
import { toNameCase } from "../helpers";

// Historial de accesos de un empleado (tabla login_events). Nació de una clienta que inactivó
// a una cajera y quería saber si seguía intentando entrar: lo que pide atención son los
// intentos estando inactivo (rojo); una contraseña mal tecleada es ámbar, pasa a diario.
const EVENTOS = {
    "login:ok":           { label: "Inició sesión" },
    "login:bad_password": { label: "Contraseña incorrecta", tone: "warning" },
    "login:inactive":     { label: "Intentó entrar estando inactivo", hint: "Con la contraseña correcta", tone: "danger" },
    "login:unknown":      { label: "Usuario inexistente", tone: "warning" },
    "login:blocked":      { label: "Empresa sin acceso", hint: "Suscripción suspendida o vencida" },
    "refresh:ok":         { label: "Siguió conectado", hint: "La sesión abierta se renovó sola" },
    "refresh:inactive":   { label: "Intentó seguir conectado estando inactivo", tone: "danger" },
    "session:inactive":   { label: "Se le cerró la sesión por estar inactivo", tone: "danger" },
};

const TONO = {
    danger:  { icon: "text-red-600 dark:text-red-400 bg-red-500/10", text: "text-red-600 dark:text-red-400" },
    warning: { icon: "text-amber-700 dark:text-amber-400 bg-amber-500/10", text: "text-content dark:text-white" },
    neutral: { icon: "text-content-subtle bg-surface-3 dark:bg-white/[0.06]", text: "text-content dark:text-white" },
};

const ICONO = {
    ok:   "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1",
    warn: "M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z",
    ban:  "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636",
    sync: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
};

// "Chrome en Android", "Safari en iPhone". Lo justo para reconocer si fue el teléfono de la
// persona o la computadora de la tienda; el user agent completo queda en el title.
export function dispositivo(ua) {
    if (!ua) return null;
    const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android"
        : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : null;
    const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet"
        : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : null;
    return [nav, so].filter(Boolean).join(" en ") || "Otro dispositivo";
}

// "Hace 4 min", "Hoy, 08:12", "Ayer, 19:40" o la fecha. Compartido con la lista de empleados.
export function haceCuanto(iso) {
    if (!iso) return null;
    const d = new Date(iso);
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "Ahora";
    if (min < 60) return `Hace ${min} min`;
    const label = fmtDayLabel(iso);
    if (label === "Hoy" || label === "Ayer") return `${label}, ${fmtTime(iso)}`;
    return fmtDateShort(iso);
}

const CLAVE_EVENTO = e => `${e.kind}:${e.result}`;

export default function EmployeeAccessModal({ employee, onClose }) {
    const [data, setData]       = useState(null);
    const [error, setError]     = useState(null);

    useEffect(() => {
        if (!employee) return;
        setData(null); setError(null);
        api.employees.getAccess(employee.id)
            .then(r => setData(r.data))
            .catch(e => setError(e.message));
    }, [employee]);

    const eventos  = data?.events || [];
    const hace30   = Date.now() - 30 * 24 * 3600 * 1000;
    const fallidos = eventos.filter(e => e.result !== "ok" && new Date(e.created_at).getTime() > hace30).length;

    // Agrupados por día, como el resto de los listados con fecha.
    const dias = [];
    for (const e of eventos) {
        const dia = toLocalISO(new Date(e.created_at));
        if (dias.at(-1)?.dia !== dia) dias.push({ dia, iso: e.created_at, items: [] });
        dias.at(-1).items.push(e);
    }

    return (
        <Modal open={!!employee} onClose={onClose} title={employee ? `Accesos · ${toNameCase(employee.full_name)}` : ""} width={560}>
            {error && <p className="py-10 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>}

            {!error && !data && (
                <div className="space-y-3 py-2" aria-hidden="true">
                    {[0, 1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-surface-3 dark:bg-white/[0.06] animate-pulse" />)}
                </div>
            )}

            {data && (
                <>
                    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                        <div>
                            <dt className="text-[12px] text-content-subtle">Último inicio de sesión</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums mt-0.5">
                                {data.last_login_at ? `${fmtDateShort(data.last_login_at)} · ${fmtTime(data.last_login_at)}` : "Sin registro"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Última actividad</dt>
                            <dd className="text-[13px] font-medium text-content dark:text-white tabular-nums mt-0.5">
                                {haceCuanto(data.last_seen_at) || "Sin registro"}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[12px] text-content-subtle">Intentos fallidos (30 días)</dt>
                            <dd className={`text-[13px] font-semibold tabular-nums mt-0.5 ${fallidos ? (data.active ? "text-amber-700 dark:text-amber-400" : "text-red-600 dark:text-red-400") : "text-content dark:text-white"}`}>
                                {fallidos}
                            </dd>
                        </div>
                    </dl>

                    {eventos.length === 0 ? (
                        <div className="mt-5 py-12 text-center border-t border-border/60 dark:border-white/[0.06]">
                            <span className="w-11 h-11 mx-auto mb-3 rounded-full bg-surface-3 dark:bg-white/[0.06] text-content-subtle flex items-center justify-center">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </span>
                            <div className="text-[14px] font-semibold text-content dark:text-white">Sin accesos registrados</div>
                            <div className="text-[12px] text-content-subtle mt-1">El registro empezó con esta versión: lo anterior no quedó guardado.</div>
                        </div>
                    ) : (
                        <div className="mt-5 border-t border-border/60 dark:border-white/[0.06]">
                            {dias.map(g => (
                                <section key={g.dia}>
                                    <div className="pt-4 pb-1.5 flex items-baseline gap-2.5">
                                        <span className="text-[14px] font-semibold text-content dark:text-white">{fmtDayLabel(g.iso)}</span>
                                        <span className="text-[12px] text-content-subtle tabular-nums">{fmtDateShort(g.iso)}</span>
                                    </div>
                                    <ul className="divide-y divide-border/60 dark:divide-white/[0.06]">
                                        {g.items.map(e => {
                                            const ev  = EVENTOS[CLAVE_EVENTO(e)] || { label: `${e.kind} · ${e.result}` };
                                            const t   = TONO[ev.tone] || TONO.neutral;
                                            const ico = e.result === "ok" ? (e.kind === "refresh" ? ICONO.sync : ICONO.ok)
                                                : ev.tone === "danger" ? ICONO.ban : ICONO.warn;
                                            const disp = dispositivo(e.user_agent);
                                            return (
                                                <li key={e.id} className="py-2.5 flex items-start gap-3">
                                                    <span className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center ${t.icon}`}>
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ico} /></svg>
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-baseline justify-between gap-3">
                                                            <span className={`text-[13px] font-medium ${t.text}`}>{ev.label}</span>
                                                            <span className="shrink-0 text-[12px] text-content-subtle tabular-nums">{fmtTime(e.created_at)}</span>
                                                        </div>
                                                        <div className="text-[12px] text-content-subtle break-words" title={e.user_agent || undefined}>
                                                            {[ev.hint, disp, e.ip && `IP ${e.ip}`].filter(Boolean).join(" · ")}
                                                        </div>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}

                    <p className="mt-4 pt-3 border-t border-border/60 dark:border-white/[0.06] text-[12px] text-content-subtle">
                        La actividad se actualiza cada pocos minutos mientras la persona usa el sistema. Se muestran los últimos 100 eventos.
                    </p>
                </>
            )}
        </Modal>
    );
}
