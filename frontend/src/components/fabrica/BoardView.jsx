import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import { toNameCase, todayISO } from "../../helpers";
import { Spinner } from "../ui/Spinner";
import { errMsg } from "./shared";

// Días hasta la fecha comprometida (negativo = vencida), sin pasar por la zona horaria.
const dayNum = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const daysLeft = (due) => (due ? dayNum(due) - dayNum(todayISO()) : null);

function DueChip({ due }) {
    const d = daysLeft(due);
    if (d == null) return null;
    const label = d < 0 ? `Vencida ${-d} día${d === -1 ? "" : "s"}` : d === 0 ? "Vence hoy" : d === 1 ? "Vence mañana" : `${d} días`;
    const tone = d < 0 ? "text-red-600 dark:text-red-400" : d <= 2 ? "text-amber-700 dark:text-amber-400" : "text-content-subtle";
    return <span className={`text-[12px] whitespace-nowrap ${tone}`}>{label}</span>;
}

/**
 * Tablero del taller: una columna por etapa, en el orden que definió la empresa, más "Por
 * empezar". Cada tarjeta se mueve con un botón y no arrastrando: en una tablet con guantes,
 * arrastrar es lo primero que falla.
 */
export default function BoardView({ stages, warehouseId, search, version, canManage, onOpen, onMove, onFinish }) {
    const { notify } = useApp();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        const params = { status: "abierta", limit: 200 };
        if (warehouseId) params.warehouse_id = warehouseId;
        if (search?.trim()) params.search = search.trim();
        api.factory.orders(params)
            .then(r => { if (vivo) setRows(r.data || []); })
            .catch(e => { if (vivo) notify(errMsg(e), "err"); })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
    }, [warehouseId, search, version]);

    const active = stages.filter(s => s.active !== false);
    const columns = [{ id: null, name: "Por empezar" }, ...active];
    const nextOf = (stageId) => {
        const i = active.findIndex(s => s.id === stageId);
        return stageId == null ? active[0] : active[i + 1];
    };

    if (loading) return <div className="py-16 flex justify-center"><Spinner /></div>;
    if (!active.length) {
        return (
            <div className="py-16 text-center px-6">
                <div className="text-[14px] font-semibold text-content dark:text-white">El tablero necesita etapas</div>
                <div className="text-[13px] text-content-subtle mt-1">Defínelas en la pestaña Etapas: Corte, Doblez, Soldadura… las que use tu taller.</div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden px-4 py-3 snap-x">
            <div className="flex gap-3 h-full min-w-max">
                {columns.map(col => {
                    const cards = rows.filter(o => (o.current_stage_id ?? null) === col.id);
                    return (
                        <section key={col.id ?? "inicio"} className="w-[280px] shrink-0 flex flex-col min-h-0 rounded-2xl bg-surface-2/60 dark:bg-white/[0.03] snap-start">
                            <header className="px-3.5 pt-3 pb-2 flex items-center justify-between gap-2">
                                <h3 className="text-[13px] font-semibold text-content dark:text-white truncate">{col.name}</h3>
                                <span className="text-[12px] text-content-subtle tabular-nums">{cards.length}</span>
                            </header>
                            <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-3 space-y-2">
                                {cards.length === 0 && <div className="text-[12px] text-content-subtle text-center py-6">Nada aquí</div>}
                                {cards.map(o => {
                                    const next = nextOf(o.current_stage_id);
                                    const overdue = daysLeft(o.due_date) < 0;
                                    return (
                                        <div key={o.id} role="button" tabIndex={0} onClick={() => onOpen(o)}
                                            onKeyDown={e => { if (e.key === "Enter") onOpen(o); }}
                                            style={overdue ? { boxShadow: "inset 3px 0 0 #ef4444" } : o.pieces_in_shop > 0 ? { boxShadow: "inset 3px 0 0 #f59e0b" } : undefined}
                                            className="rounded-xl border border-border/70 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 px-3 py-2.5 active:scale-[0.99] transition-transform">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-[13px] font-semibold text-content dark:text-white tabular-nums">{o.code}</span>
                                                <DueChip due={o.due_date} />
                                            </div>
                                            <div className="text-[13px] text-content dark:text-white mt-0.5 line-clamp-2">{o.description}</div>
                                            <div className="text-[12px] text-content-subtle mt-1 truncate">
                                                {o.destination === "stock" ? "Para inventario" : (o.customer_name ? toNameCase(o.customer_name) : "Sin cliente")}
                                                {o.quantity !== 1 ? ` · ${Number(o.quantity).toLocaleString("es-VE")} und.` : ""}
                                                {o.assignee ? ` · ${o.assignee}` : ""}
                                            </div>
                                            {o.pieces_in_shop > 0 && (
                                                <div className="text-[12px] text-amber-700 dark:text-amber-400 mt-0.5">
                                                    {o.pieces_in_shop === 1 ? "1 pieza en el taller" : `${o.pieces_in_shop} piezas en el taller`}
                                                </div>
                                            )}
                                            {canManage && (
                                                <div className="mt-2" onClick={e => e.stopPropagation()}>
                                                    {next ? (
                                                        <button onClick={() => onMove(o, next.id)} className="btn-outline w-full h-9 rounded-lg text-[12px] font-medium">
                                                            Pasar a {next.name}
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => onFinish(o)} className="btn-accent w-full h-9 rounded-lg text-[12px] font-semibold">
                                                            Terminar
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
