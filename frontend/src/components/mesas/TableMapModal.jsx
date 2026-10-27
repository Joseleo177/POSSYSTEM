import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api";
import { fmtTime, toNameCase } from "../../helpers";
import TablePlan, { TableGrid, agruparPorMesa, minutosDesde } from "./TablePlan";
import KitchenMark from "../KitchenMark";
import { Spinner } from "../ui/Spinner";

// Las áreas de cada sucursal se recuerdan mientras la caja esté abierta: el plano casi nunca
// cambia en un turno, y abrir el mapa no tiene por qué esperar a la red.
const planos = new Map();

/**
 * Mapa de mesas desde la caja. Ocupa la pantalla entera, como la vista BARRA.
 *
 * - Mesa libre: la venta en pantalla queda asignada a esa mesa. La cuenta se abre al pausar
 *   (F4) o se cobra directo.
 * - Mesa ocupada: se recupera su cuenta al carrito para seguir sumando o cobrarla. Con varias
 *   cuentas en la mesa, se elige cuál.
 *
 * La ocupación sale de las cuentas en espera que la caja ya consulta; no hay otra consulta
 * en bucle por tener el mapa abierto.
 */
export default function TableMapModal({ open, onClose, warehouseId, heldCarts, cartTable, cartHasItems, fmtTotal, onPickFree, onTake, notify }) {
    const [areas, setAreas] = useState(() => planos.get(warehouseId) || null);
    const [areaId, setAreaId] = useState(null);
    const [mesa, setMesa] = useState(null);   // mesa ocupada con varias cuentas

    useEffect(() => {
        if (!open || !warehouseId) return;
        setAreas(planos.get(warehouseId) || null);
        api.tables.areas({ warehouse_id: warehouseId })
            .then(r => { planos.set(warehouseId, r.data || []); setAreas(r.data || []); })
            .catch(e => { notify?.(e.message || "No se pudo cargar el plano", "err"); setAreas(a => a || []); });
    }, [open, warehouseId, notify]);

    useEffect(() => {
        if (!open) { setMesa(null); return; }
        const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); mesa ? setMesa(null) : onClose(); } };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, mesa, onClose]);

    const cuentasPorMesa = useMemo(() => agruparPorMesa(heldCarts), [heldCarts]);

    if (!open) return null;

    const area = areas?.find(a => a.id === areaId) || areas?.[0] || null;

    const tocar = (t) => {
        if (!t) return;
        const cuentas = cuentasPorMesa.get(t.id) || [];
        // La mesa de la venta que está en pantalla: ya está aquí, no hay nada que abrir.
        if (cartTable?.id === t.id && !cuentas.length) return onClose();
        if (!cuentas.length) {
            onPickFree(t);
            return onClose();
        }
        if (cartHasItems) {
            return notify?.("Pausa (F4) o cobra la venta en pantalla antes de abrir otra mesa", "err");
        }
        if (cuentas.length === 1) return abrirCuenta(cuentas[0]);
        setMesa(t);
    };

    const abrirCuenta = (c) => {
        if (c.held_by && !c.held_by.is_mine) {
            return notify?.(`La está atendiendo ${c.held_by.name}`, "err");
        }
        onTake(c.id);
        onClose();
    };

    const cuentasMesa = mesa ? cuentasPorMesa.get(mesa.id) || [] : [];
    const ocupadas = area ? area.tables.filter(t => cuentasPorMesa.has(t.id)).length : 0;

    return (
        <div className="fixed inset-0 z-[150] bg-surface-2 dark:bg-surface-dark flex flex-col modal-in">
            <header className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border/40 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2">
                <div className="min-w-0">
                    <h2 className="text-[17px] font-bold tracking-[-0.015em] text-content dark:text-white">Mesas</h2>
                    <p className="text-[12px] text-content-subtle truncate">
                        {cartTable ? `La venta en pantalla es de ${cartTable.name}` : "Toca una mesa libre para asignarle la venta, o una ocupada para abrir su cuenta"}
                    </p>
                </div>
                <button onClick={onClose} aria-label="Cerrar" title="Cerrar (Esc)"
                    className="ml-auto w-10 h-10 shrink-0 rounded-lg btn-outline flex items-center justify-center">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </header>

            {areas && areas.length > 1 && (
                <div className="shrink-0 flex gap-1 px-4 border-b border-border/40 dark:border-white/[0.06] bg-white dark:bg-surface-dark-2 overflow-x-auto scrollbar-hide">
                    {areas.map(a => (
                        <button key={a.id} onClick={() => setAreaId(a.id)}
                            className={["px-4 py-2.5 text-[13px] font-semibold border-b-2 whitespace-nowrap shrink-0",
                                a.id === area?.id ? "border-brand-500 text-brand-700 dark:text-brand-300" : "border-transparent text-content-subtle",
                            ].join(" ")}>
                            {a.name}
                            <span className="ml-1.5 text-[12px] font-medium text-content-subtle tabular-nums">{a.tables.filter(t => cuentasPorMesa.has(t.id)).length}/{a.tables.length}</span>
                        </button>
                    ))}
                </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto sm:overflow-hidden p-3 sm:p-4 flex flex-col">
                {!areas ? (
                    <div className="py-16 flex justify-center"><Spinner /></div>
                ) : !area || area.tables.length === 0 ? (
                    <div className="py-16 text-center">
                        <div className="text-[15px] font-semibold text-content dark:text-white">Esta sucursal no tiene plano</div>
                        <div className="text-[13px] text-content-subtle mt-1">Se arma en el módulo Mesas → Editar plano.</div>
                    </div>
                ) : (
                    <>
                        <div className="text-[12px] text-content-subtle tabular-nums mb-2">
                            {ocupadas === 0 ? "Todas las mesas libres" : `${ocupadas} de ${area.tables.length} ${area.tables.length === 1 ? "mesa ocupada" : "mesas ocupadas"}`}
                        </div>
                        <div className="hidden sm:block flex-1 min-h-0">
                            <TablePlan tables={area.tables} cuentasPorMesa={cuentasPorMesa} fmtTotal={fmtTotal}
                                highlightId={cartTable?.id} onTap={tocar} />
                        </div>
                        <div className="sm:hidden">
                            <TableGrid tables={area.tables} cuentasPorMesa={cuentasPorMesa} fmtTotal={fmtTotal}
                                highlightId={cartTable?.id} onTap={tocar} />
                        </div>
                    </>
                )}
            </div>

            {/* Varias cuentas en la misma mesa (cada quien paga lo suyo): se elige cuál abrir. */}
            {mesa && (
                <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/40 dark:bg-black/60 p-0 sm:p-4" onClick={() => setMesa(null)}>
                    <div onClick={e => e.stopPropagation()}
                        className="w-full sm:max-w-md bg-white dark:bg-surface-dark-2 rounded-t-2xl sm:rounded-2xl border border-border/60 dark:border-white/[0.08] p-4 space-y-2 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-1">
                            <h3 className="text-[15px] font-semibold text-content dark:text-white">{mesa.name} · {cuentasMesa.length} cuentas</h3>
                            <button onClick={() => setMesa(null)} className="text-[13px] text-content-subtle">Cerrar</button>
                        </div>
                        {cuentasMesa.map(c => {
                            const otra = c.held_by && !c.held_by.is_mine;
                            return (
                                <button key={c.id} onClick={() => abrirCuenta(c)} disabled={otra}
                                    className="w-full text-left rounded-xl border border-border/70 dark:border-white/[0.08] px-3.5 py-3 flex items-center gap-3 disabled:opacity-60 active:scale-[0.99]">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[14px] font-semibold text-content dark:text-white truncate">{toNameCase(c.customer_name) || "Cliente general"}</span>
                                            <KitchenMark status={c.kitchen_status} />
                                        </div>
                                        <div className="text-[12px] text-content-subtle tabular-nums">
                                            {otra ? `La atiende ${c.held_by.name}` : `Abierta ${fmtTime(c.created_at)} · ${minutosDesde(c.created_at, Date.now())} min`}
                                        </div>
                                    </div>
                                    <span className="text-[15px] font-bold text-content dark:text-white tabular-nums">{fmtTotal([c])}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
