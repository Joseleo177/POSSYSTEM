import { toNameCase } from "../../helpers";

// Tarjeta de almacén. Cuenta tres cosas, en este orden: cuánto hay (existencias), en qué
// estado está (la barra de salud: en orden, bajos, agotados) y quién trabaja ahí.
//
// La barra usa los conteos out_count/low_count del backend, con la misma regla de "bajo"
// que ui/StockQty: el color aparece solo cuando hay algo que atender, y "en orden" va en
// el color de la marca.

const fmtInt = n => Math.round(parseFloat(n) || 0).toLocaleString("es-VE");

const initials = (name = "") =>
    name.trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase() || "?";

const ICON_TIENDA = "M3 9l1.5-5h15L21 9M3 9h18M3 9v1a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0V9M5 13v7h14v-7M10 20v-4h4v4";
const ICON_DEPOSITO = "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4";

function Leyenda({ dot, n, label }) {
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
            <span className="font-semibold text-content dark:text-white tabular-nums">{n}</span>
            {label}
        </span>
    );
}

export default function WarehouseGrid({ warehouses, employees = [], canManage = false, openAssign, startEdit, setDeleteConfirm, setSelectedWarehouse, setSubTab }) {
    const empById = new Map(employees.map(e => [e.id, e]));

    return (
        <div className="flex-1 overflow-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 content-start py-3">
            {warehouses.map(w => {
                const deposito = w.sells === false;
                const total = w.product_count || 0;
                const out = w.out_count || 0;
                const low = w.low_count || 0;
                const ok = Math.max(0, total - out - low);
                const asignados = w.assigned_employees || [];
                // Sin la lista de empleados (un rol sin permiso para verla) quedan las
                // iniciales fuera y se muestra solo el conteo.
                const equipo = asignados.map(a => empById.get(a.employee_id)).filter(Boolean);

                return (
                    <article key={w.id}
                        className={`card-premium flex flex-col ${w.active ? "" : "opacity-60"}`}>
                        {/* Filete de identidad: marca en un punto de venta, gris en un depósito. */}
                        <div className={`h-1 shrink-0 ${!w.active ? "bg-border dark:bg-white/10" : deposito ? "bg-content-subtle/30" : "bg-brand-500"}`} />

                        <div className="flex-1 p-4">
                            {/* Encabezado */}
                            <div className="flex items-start gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${w.active ? "bg-brand-500/10 text-brand-600 dark:text-brand-400" : "bg-surface-3 dark:bg-white/5 text-content-subtle"}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={deposito ? ICON_DEPOSITO : ICON_TIENDA} /></svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h3 className="text-[15px] font-semibold tracking-tight text-content dark:text-white truncate">{toNameCase(w.name)}</h3>
                                        {deposito && (
                                            <span className="badge badge-neutral shadow-none shrink-0" title="No factura: solo almacena">Depósito</span>
                                        )}
                                    </div>
                                    <p className="text-[12px] text-content-subtle truncate mt-0.5">
                                        {deposito && w.parent_warehouse_name
                                            ? `Depósito de ${toNameCase(w.parent_warehouse_name)}`
                                            : w.description || (deposito ? "Solo almacena" : "Punto de venta")}
                                    </p>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium shrink-0 mt-0.5 ${w.active ? "text-emerald-700 dark:text-emerald-400" : "text-content-subtle"}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${w.active ? "bg-emerald-500" : "bg-content-subtle/50"}`} />
                                    {w.active ? "Activo" : "Inactivo"}
                                </span>
                            </div>

                            {/* Cifras */}
                            <div className="mt-5 flex items-end justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="text-[12px] text-content-subtle">Existencias</div>
                                    <div className="mt-1 text-[28px] leading-none font-bold tracking-tight tabular-nums text-content dark:text-white">
                                        {fmtInt(w.total_stock)}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[12px] text-content-subtle">Productos</div>
                                    <div className="mt-1 text-[17px] leading-none font-semibold tabular-nums text-content dark:text-white">{total}</div>
                                </div>
                            </div>

                            {/* Salud del inventario */}
                            <div className="mt-4">
                                {total > 0 ? (
                                    <>
                                        <div className="flex h-1.5 gap-[2px] rounded-full overflow-hidden bg-surface-3 dark:bg-white/[0.06]"
                                            role="img" aria-label={`${ok} en orden, ${low} bajos, ${out} agotados`}>
                                            {ok > 0 && <div className="bg-brand-500" style={{ flexGrow: ok }} />}
                                            {low > 0 && <div className="bg-amber-400" style={{ flexGrow: low }} />}
                                            {out > 0 && <div className="bg-red-500" style={{ flexGrow: out }} />}
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-content-subtle">
                                            {(ok > 0 || (low === 0 && out === 0)) && <Leyenda dot="bg-brand-500" n={ok} label="en orden" />}
                                            {low > 0 && <Leyenda dot="bg-amber-400" n={low} label={low === 1 ? "bajo" : "bajos"} />}
                                            {out > 0 && <Leyenda dot="bg-red-500" n={out} label={out === 1 ? "agotado" : "agotados"} />}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-[12px] text-content-subtle">Todavía sin productos</p>
                                )}
                            </div>

                            {/* Equipo. "Asignar" va siempre visible: en una tablet no hay hover. */}
                            <div className="mt-4 flex items-center gap-2 min-h-7">
                                {equipo.length > 0 && (
                                    <div className="flex -space-x-1.5 shrink-0">
                                        {equipo.slice(0, 4).map(e => (
                                            <span key={e.id} title={toNameCase(e.full_name || e.username || "")}
                                                className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-surface-dark-2 bg-surface-3 dark:bg-white/10 text-[10px] font-semibold text-content-muted dark:text-white/80 flex items-center justify-center">
                                                {initials(e.full_name || e.username)}
                                            </span>
                                        ))}
                                        {equipo.length > 4 && (
                                            <span className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-surface-dark-2 bg-surface-3 dark:bg-white/10 text-[10px] font-semibold text-content-muted dark:text-white/80 flex items-center justify-center">
                                                +{equipo.length - 4}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <span className="text-[12px] text-content-subtle truncate">
                                    {asignados.length === 0 ? "Sin usuarios asignados"
                                        : `${asignados.length} ${asignados.length === 1 ? "usuario" : "usuarios"}`}
                                </span>
                                {canManage && (
                                    <button onClick={() => openAssign(w)}
                                        className="ml-auto h-7 px-2.5 rounded-md text-[12px] font-medium text-content-muted dark:text-white/60 hover:text-brand-700 dark:hover:text-brand-300 hover:bg-brand-500/10 transition-colors flex items-center gap-1.5 shrink-0">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v6m3-3h-6M13 7a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                                        Asignar
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Acciones. En móvil los rótulos van sin icono: con los dos botones a
                            flex-1 y los iconos de editar y borrar, el texto no cabía en una línea. */}
                        <div className="px-4 py-3 border-t border-border/60 dark:border-white/[0.06] flex items-center gap-2">
                            <button
                                onClick={() => { setSelectedWarehouse(w); setSubTab("stock"); }}
                                className="btn-accent flex-1 h-9 rounded-lg text-[13px] font-semibold whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-[0.98]"
                            >
                                <svg className="w-3.5 h-3.5 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d={ICON_DEPOSITO} /></svg>
                                Ver stock
                            </button>
                            <button
                                onClick={() => { setSelectedWarehouse(w); setSubTab("ajustes"); }}
                                className="btn-outline flex-1 h-9 rounded-lg text-[13px] font-medium whitespace-nowrap flex items-center justify-center gap-1.5 active:scale-[0.98]"
                            >
                                <svg className="w-3.5 h-3.5 hidden sm:block text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                                Mov. manual
                            </button>
                            {canManage && (
                                <>
                                    <button onClick={() => startEdit(w)} className="row-icon w-9 h-9 shrink-0" title="Editar" aria-label="Editar almacén">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                    <button onClick={() => setDeleteConfirm(w)} className="row-icon w-9 h-9 shrink-0 hover:!text-red-600 dark:hover:!text-red-400 hover:!bg-red-500/10" title="Eliminar" aria-label="Eliminar almacén">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                </>
                            )}
                        </div>
                    </article>
                );
            })}
        </div>
    );
}
