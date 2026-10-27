import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Cuadrícula del plano: la misma que valida el servidor (services/tables.js).
export const COLS = 40;
export const ROWS = 24;

// Minutos desde que se abrió la cuenta, contra la hora que pase quien dibuja.
export const minutosDesde = (iso, ahora) => Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));

const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);

// Lo que la cocina dice de una mesa: con una sola cuenta "lista" ya hay algo que llevar.
const cocinaDe = (cuentas) => {
    if (cuentas.some(c => c.kitchen_status === "lista")) return "lista";
    if (cuentas.some(c => c.kitchen_status === "nueva" || c.kitchen_status === "preparando")) return "cocina";
    return null;
};

// Desde cuándo la mesa pidió la cuenta (la primera de sus cuentas que la pidió), o null.
export const pidioDesde = (cuentas) => {
    const t = cuentas.map(c => c.bill_requested_at).filter(Boolean).map(d => new Date(d).getTime());
    return t.length ? Math.min(...t) : null;
};

// Marca de "pidió la cuenta": arriba a la izquierda, del lado contrario al check de cocina.
const MarcaCuenta = () => (
    <span title="Pidió la cuenta" className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center ring-2 ring-white dark:ring-surface-dark">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 7h6m-6 4h6m-6 4h3M6 3h12v18l-3-2-3 2-3-2-3 2V3z" /></svg>
    </span>
);

/**
 * Una mesa del plano. Libre es un contorno punteado; ocupada, una tarjeta llena con el total
 * y el tiempo. El único color es la señal: check verde cuando la cocina tiene algo listo.
 */
function Mesa({ t, cuentas, cell, ahora, fmtTotal, seleccionada, resaltada, editable, onPointerDown, onClick }) {
    const ocupada = cuentas.length > 0;
    const cocina = cocinaDe(cuentas);
    const total = ocupada && fmtTotal ? fmtTotal(cuentas) : null;
    const abierta = ocupada ? Math.min(...cuentas.map(c => new Date(c.created_at).getTime())) : null;
    const pidio = ocupada ? pidioDesde(cuentas) : null;
    const altoPx = t.h * cell;
    const nombrePx = Math.max(10, Math.min(15, cell * 0.85));
    const datoPx = Math.max(9, Math.min(12, cell * 0.68));
    const forma = t.shape === "round" ? "rounded-full" : "rounded-xl";

    return (
        <button
            type="button"
            onPointerDown={onPointerDown}
            onClick={onClick}
            style={{
                left: `${(t.x / COLS) * 100}%`, top: `${(t.y / ROWS) * 100}%`,
                width: `${(t.w / COLS) * 100}%`, height: `${(t.h / ROWS) * 100}%`,
                touchAction: editable ? "none" : undefined,
            }}
            className="absolute p-[3px] select-none"
        >
            <span className={[
                "w-full h-full flex flex-col items-center justify-center text-center leading-tight transition-colors px-1 overflow-hidden",
                forma,
                ocupada
                    ? "bg-white dark:bg-white/[0.09] border-2 border-content/70 dark:border-white/55 shadow-card dark:shadow-none"
                    : "bg-white/60 dark:bg-white/[0.02] border border-dashed border-content/25 dark:border-white/20",
                seleccionada || resaltada ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-1 dark:ring-offset-surface-dark" : "",
                editable ? "cursor-grab active:cursor-grabbing" : "active:scale-[0.97]",
            ].join(" ")}>
                <span style={{ fontSize: nombrePx }} className={`font-semibold truncate max-w-full ${ocupada ? "text-content dark:text-white" : "text-content-subtle"}`}>
                    {t.name}
                </span>
                {ocupada && altoPx >= 46 && total && (
                    <span style={{ fontSize: datoPx }} className="font-semibold text-content dark:text-white tabular-nums truncate max-w-full">{total}</span>
                )}
                {ocupada && altoPx >= 62 && (
                    pidio ? (
                        <span style={{ fontSize: datoPx }} className="font-semibold text-amber-700 dark:text-amber-400 tabular-nums whitespace-nowrap">
                            Cuenta · {fmtMin(minutosDesde(pidio, ahora))}
                        </span>
                    ) : (
                        <span style={{ fontSize: datoPx }} className="text-content-subtle tabular-nums whitespace-nowrap">
                            {fmtMin(minutosDesde(abierta, ahora))}{cuentas.length > 1 ? ` · ${cuentas.length} cuentas` : ""}
                        </span>
                    )
                )}
                {!ocupada && altoPx >= 46 && (
                    <span style={{ fontSize: datoPx }} className="text-content-subtle whitespace-nowrap">{t.seats} {t.seats === 1 ? "puesto" : "puestos"}</span>
                )}
            </span>
            {cocina === "lista" && (
                <span title="Pedido listo en cocina" className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-surface-dark">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </span>
            )}
            {pidio && <MarcaCuenta />}
        </button>
    );
}

/**
 * Plano de un área. Se dibuja a escala dentro del espacio que tenga (ancho y, si lo hay,
 * alto), con las medidas en celdas de la cuadrícula: el mismo plano se ve en un TV, una
 * tablet o una computadora.
 *
 * - Vista: `cuentasPorMesa` (Map id → cuentas abiertas) y `onTap(mesa)`.
 * - Edición: `editable`, `onMove(id, {x, y})` mientras se arrastra y `onTap` para elegirla.
 */
export default function TablePlan({ tables, cuentasPorMesa, fmtTotal, editable = false, selectedId, highlightId, onTap, onMove }) {
    const caja = useRef(null);
    const [cell, setCell] = useState(0);
    const [ahora, setAhora] = useState(Date.now());
    const arrastre = useRef(null);

    useLayoutEffect(() => {
        const el = caja.current;
        if (!el) return;
        const medir = () => {
            const W = el.clientWidth, H = el.clientHeight;
            // Sin alto propio (la página se desplaza), manda el ancho.
            setCell(H > 80 ? Math.min(W / COLS, H / ROWS) : W / COLS);
        };
        medir();
        const ro = new ResizeObserver(medir);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        const t = setInterval(() => setAhora(Date.now()), 30_000);
        return () => clearInterval(t);
    }, []);

    // Arrastrar mueve de a una celda. Un toque sin movimiento elige la mesa.
    const empezar = (t) => (e) => {
        if (!editable) return;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        arrastre.current = { id: t.id, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y, w: t.w, h: t.h, movio: false };
    };
    const mover = (e) => {
        const a = arrastre.current;
        if (!a || !cell) return;
        const dx = Math.round((e.clientX - a.sx) / cell);
        const dy = Math.round((e.clientY - a.sy) / cell);
        if (dx || dy) a.movio = true;
        const x = Math.min(Math.max(a.ox + dx, 0), COLS - a.w);
        const y = Math.min(Math.max(a.oy + dy, 0), ROWS - a.h);
        onMove?.(a.id, { x, y });
    };
    const soltar = () => {
        const a = arrastre.current;
        arrastre.current = null;
        if (a && !a.movio) onTap?.(tables.find(t => t.id === a.id));
    };

    const lineas = "rgba(127,127,127,0.13)";

    return (
        <div ref={caja} className="w-full h-full min-h-0 flex items-start justify-center">
            {cell > 0 && (
                <div
                    onPointerMove={editable ? mover : undefined}
                    onPointerUp={editable ? soltar : undefined}
                    onPointerCancel={editable ? () => { arrastre.current = null; } : undefined}
                    style={{
                        width: cell * COLS, height: cell * ROWS,
                        backgroundImage: editable ? `linear-gradient(to right, ${lineas} 1px, transparent 1px), linear-gradient(to bottom, ${lineas} 1px, transparent 1px)` : undefined,
                        backgroundSize: editable ? `${cell}px ${cell}px` : undefined,
                    }}
                    className="relative shrink-0 rounded-2xl bg-surface-2/50 dark:bg-white/[0.02] border border-border/60 dark:border-white/[0.06]"
                >
                    {tables.map(t => (
                        <Mesa key={t.id} t={t} cell={cell} ahora={ahora} fmtTotal={fmtTotal}
                            cuentas={cuentasPorMesa?.get(t.id) || []}
                            seleccionada={selectedId === t.id} resaltada={highlightId === t.id}
                            editable={editable}
                            onPointerDown={empezar(t)}
                            onClick={editable ? undefined : () => onTap?.(t)} />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Las mismas mesas como cuadrícula de tarjetas, para el teléfono: a 390px el plano deja cada
 * mesa del tamaño de una uña.
 */
export function TableGrid({ tables, cuentasPorMesa, fmtTotal, highlightId, onTap, className = "grid grid-cols-3 gap-2" }) {
    const ahora = Date.now();
    const orden = [...tables].sort((a, b) => a.y - b.y || a.x - b.x);
    return (
        <div className={className}>
            {orden.map(t => {
                const cuentas = cuentasPorMesa?.get(t.id) || [];
                const ocupada = cuentas.length > 0;
                const cocina = cocinaDe(cuentas);
                const abierta = ocupada ? Math.min(...cuentas.map(c => new Date(c.created_at).getTime())) : null;
                const pidio = ocupada ? pidioDesde(cuentas) : null;
                return (
                    <button key={t.id} type="button" onClick={() => onTap?.(t)}
                        className={[
                            "relative h-[76px] rounded-xl px-2 flex flex-col items-center justify-center text-center active:scale-[0.97] transition-transform",
                            ocupada
                                ? "bg-white dark:bg-white/[0.09] border-2 border-content/70 dark:border-white/55 shadow-card dark:shadow-none"
                                : "bg-white/60 dark:bg-white/[0.02] border border-dashed border-content/25 dark:border-white/20",
                            highlightId === t.id ? "ring-2 ring-brand-500" : "",
                        ].join(" ")}>
                        <span className={`text-[14px] font-semibold truncate max-w-full ${ocupada ? "text-content dark:text-white" : "text-content-subtle"}`}>{t.name}</span>
                        {ocupada ? (
                            <>
                                {fmtTotal && <span className="text-[12px] font-semibold text-content dark:text-white tabular-nums">{fmtTotal(cuentas)}</span>}
                                {pidio
                                    ? <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 tabular-nums">Cuenta · {fmtMin(minutosDesde(pidio, ahora))}</span>
                                    : <span className="text-[11px] text-content-subtle tabular-nums">{fmtMin(minutosDesde(abierta, ahora))}</span>}
                            </>
                        ) : (
                            <span className="text-[11px] text-content-subtle">{t.seats} {t.seats === 1 ? "puesto" : "puestos"}</span>
                        )}
                        {cocina === "lista" && (
                            <span title="Pedido listo en cocina" className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center ring-2 ring-white dark:ring-surface-dark">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                            </span>
                        )}
                        {pidio && <MarcaCuenta />}
                    </button>
                );
            })}
        </div>
    );
}

/** Cuentas abiertas agrupadas por mesa, desde el listado de cuentas en espera. */
export const agruparPorMesa = (cuentas) => {
    const m = new Map();
    for (const c of cuentas || []) {
        if (!c.table_id) continue;
        if (!m.has(c.table_id)) m.set(c.table_id, []);
        m.get(c.table_id).push(c);
    }
    return m;
};
