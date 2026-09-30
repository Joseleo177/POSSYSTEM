import { useState } from "react";
import Segmented from "../ui/Segmented";
import { toNameCase } from "../../helpers";
import { fmtDayLabel, fmtDateShort, fmtTime } from "../../helpers/dates";
import { reasonLabel } from "./movementMeta";

const fmtN = n => Math.abs(Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 3 });

// Cuánto estuvo abierta: "22 min", "3 h 10 min" o "47 días". Las sesiones que cierra el
// arqueo pueden quedar abiertas semanas; decirlo en días se entiende mejor que dos fechas.
function duracion(desde, hasta) {
    const ms = new Date(hasta || Date.now()) - new Date(desde);
    if (!(ms >= 0)) return "";
    const min = Math.round(ms / 60000);
    if (min < 1) return "menos de 1 min";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
    const d = Math.round(h / 24);
    return `${d} ${d === 1 ? "día" : "días"}`;
}

const mismoDia = (a, b) => b && fmtDateShort(a) === fmtDateShort(b);

// Productos tocados en la sesión: "Azucar, Arroz y 2 más".
function productos(lines) {
    const nombres = [...new Set(lines.map(l => l.product_name))];
    if (!nombres.length) return "";
    const vis = nombres.slice(0, 2).map(n => toNameCase(n)).join(", ");
    return nombres.length > 2 ? `${vis} y ${nombres.length - 2} más` : vis;
}

// Historial de sesiones de ajuste, leído como un libro: agrupado por día, cada sesión con
// quién, cuánto duró, qué tocó y cuántas entradas y salidas hizo. Al abrirla se ven sus
// líneas con el antes y el después; tocar un producto abre su historial completo.
export default function SessionHistory({ history = [], loading, onOpenProduct }) {
    const [ver, setVer] = useState("con");
    const [abierta, setAbierta] = useState(null);

    const vacias = history.filter(s => !(s.lines?.length || s.line_count)).length;
    const lista = ver === "con" ? history.filter(s => s.lines?.length || s.line_count) : history;

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center py-16">
                <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    let dia = null;

    return (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="px-4 lg:px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12px] text-content-subtle">
                    <span className="font-semibold text-content dark:text-white">{history.length}</span> {history.length === 1 ? "sesión" : "sesiones"} recientes
                </p>
                {vacias > 0 && (
                    <Segmented
                        value={ver}
                        onChange={setVer}
                        options={[
                            { key: "con", label: "Con movimientos", count: history.length - vacias },
                            { key: "todas", label: "Todas", count: history.length },
                        ]}
                    />
                )}
            </div>

            {lista.length === 0 ? (
                <div className="py-20 text-center px-6">
                    <div className="text-[14px] font-semibold text-content dark:text-white">Sin sesiones</div>
                    <div className="text-[13px] text-content-subtle mt-1">
                        {history.length ? "Ninguna sesión registró movimientos." : "Cuando registres un ajuste en este almacén, su sesión aparecerá aquí."}
                    </div>
                </div>
            ) : (
                <div className="pb-6">
                    {lista.map(s => {
                        const d = fmtDayLabel(s.opened_at);
                        const cabecera = d !== dia ? (dia = d) : null;
                        const lines = s.lines || [];
                        const entradas = lines.filter(l => parseFloat(l.qty_adjusted) > 0).length;
                        const salidas = lines.filter(l => parseFloat(l.qty_adjusted) < 0).length;
                        const isOpen = s.status === "open";
                        const expanded = abierta === s.id;
                        const vacia = lines.length === 0;
                        const rango = mismoDia(s.opened_at, s.closed_at) || !s.closed_at
                            ? `${fmtTime(s.opened_at)}${s.closed_at ? ` – ${fmtTime(s.closed_at)}` : ""}`
                            : `${fmtDateShort(s.opened_at)} → ${fmtDateShort(s.closed_at)}`;

                        return (
                            <div key={s.id}>
                                {cabecera && (
                                    <div className="px-4 lg:px-6 pt-5 pb-2 border-b border-border dark:border-border-dark">
                                        <span className="text-[14px] font-bold tracking-[-0.01em] text-content dark:text-white">{cabecera}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => !vacia && setAbierta(expanded ? null : s.id)}
                                    disabled={vacia}
                                    aria-expanded={expanded}
                                    className={`w-full px-4 lg:px-6 py-3 flex items-center gap-3 text-left border-b border-border/50 dark:border-white/[0.04] transition-colors ${vacia ? "opacity-60 cursor-default" : "hover:bg-surface-2/70 dark:hover:bg-white/[0.025]"} ${expanded ? "bg-surface-2/70 dark:bg-white/[0.025]" : ""}`}
                                >
                                    {/* Estado: la abierta lleva color; las cerradas, gris. */}
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isOpen ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-surface-3 dark:bg-white/[0.06] text-content-subtle"}`}
                                        title={isOpen ? "Abierta" : "Cerrada"}>
                                        {isOpen
                                            ? <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M5 13l4 4L19 7" /></svg>}
                                    </span>

                                    <div className="min-w-0 flex-1 md:flex-none md:w-[260px]">
                                        <div className="text-[13px] font-semibold text-content dark:text-white truncate">
                                            {toNameCase(s.employee_name) || "Sistema"}
                                            {isOpen && <span className="ml-2 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">Abierta</span>}
                                        </div>
                                        <div className="text-[12px] text-content-subtle tabular-nums truncate">
                                            {rango} · {duracion(s.opened_at, s.closed_at)}
                                        </div>
                                    </div>

                                    <div className="hidden md:block min-w-0 flex-1">
                                        <div className="text-[13px] text-content dark:text-white truncate">{vacia ? "Sin movimientos" : productos(lines)}</div>
                                        {s.notes && <div className="text-[12px] text-content-subtle truncate">{s.notes}</div>}
                                    </div>

                                    <div className="shrink-0 text-right">
                                        <div className="text-[13px] tabular-nums text-content dark:text-white">
                                            <span className="font-semibold">{lines.length}</span>
                                            <span className="text-content-subtle"> mov.</span>
                                        </div>
                                        {!vacia && (
                                            <div className="text-[12px] tabular-nums text-content-subtle whitespace-nowrap">
                                                {entradas > 0 && <span className="text-emerald-700 dark:text-emerald-400">{entradas} {entradas === 1 ? "entrada" : "entradas"}</span>}
                                                {entradas > 0 && salidas > 0 && " · "}
                                                {salidas > 0 && <span>{salidas} {salidas === 1 ? "salida" : "salidas"}</span>}
                                            </div>
                                        )}
                                    </div>

                                    <svg className={`w-4 h-4 shrink-0 text-content-subtle transition-transform ${expanded ? "rotate-180" : ""} ${vacia ? "invisible" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>

                                {expanded && (
                                    <div className="bg-surface-2/40 dark:bg-white/[0.015] border-b border-border/50 dark:border-white/[0.04]">
                                        {s.notes && <div className="md:hidden px-4 pt-2.5 text-[12px] text-content-subtle">{s.notes}</div>}
                                        {lines.map(line => {
                                            const q = parseFloat(line.qty_adjusted);
                                            const entra = q > 0;
                                            return (
                                                <div key={line.id} className="pl-[60px] lg:pl-[68px] pr-4 lg:pr-6 py-2.5 flex items-center gap-3">
                                                    <span className="hidden sm:block w-12 shrink-0 text-[12px] text-content-subtle tabular-nums">{fmtTime(line.created_at || line.createdAt)}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <button
                                                            onClick={() => onOpenProduct?.(line.product_id)}
                                                            className="max-w-full text-[13px] font-medium text-content dark:text-white truncate hover:text-brand-700 dark:hover:text-brand-300 hover:underline underline-offset-2 text-left"
                                                            title="Ver movimientos del producto"
                                                        >
                                                            {line.product_name}
                                                        </button>
                                                        <p className="text-[12px] text-content-subtle truncate">{reasonLabel(line.reason)}{line.notes ? ` · ${line.notes}` : ""}</p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className={`text-[13px] font-semibold tabular-nums ${entra ? "text-emerald-700 dark:text-emerald-400" : "text-content dark:text-white"}`}>
                                                            {entra ? "+" : "−"}{fmtN(q)}
                                                        </p>
                                                        <p className="text-[11px] text-content-subtle tabular-nums">{fmtN(line.qty_before)} → {fmtN(line.qty_after)}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
