// src/layout/SucursalSwitcher.jsx
import React, { useRef, useState } from "react";
import { useApp } from "../context/AppContext";
import FilterPopover from "../components/ui/FilterPopover";
import Check from "../components/ui/Check";

export const ICONO_SUCURSAL = "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01";

// Selector de sucursales junto al nombre del usuario, como el de empresas de Odoo. El nombre
// es la sucursal ACTUAL (con la que se vende y se opera); las casillas suman otras a lo que
// se ve en listados y reportes. Reemplaza a los selectores de almacén que tenía cada pantalla.
export default function SucursalSwitcher({ compact = false }) {
    const { sucursales, sucursalActual, sucursalesMarcadas, elegirSucursal, alternarSucursal, marcarTodas } = useApp();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    if (!sucursalActual) return null;
    const otras = sucursalesMarcadas.length - 1;
    const varias = sucursales.length > 1;

    const boton = (
        <>
            {/* En el teléfono la barra no da para el icono: queda el nombre. */}
            {!compact && (
                <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={ICONO_SUCURSAL} />
                </svg>
            )}
            <span className={`truncate font-medium text-content dark:text-white ${compact ? "max-w-[96px] text-[12px]" : "max-w-[140px] lg:max-w-[200px] text-[13px]"}`}>
                {sucursalActual.name}
            </span>
            {otras > 0 && (
                <span className="shrink-0 text-[11px] font-semibold px-1.5 py-px rounded-md bg-surface-3 dark:bg-white/10 text-content-muted dark:text-white/70 tabular-nums">
                    +{otras}
                </span>
            )}
            {varias && (
                <svg className={`w-3 h-3 shrink-0 text-content-subtle transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
            )}
        </>
    );

    // Con una sola sucursal no hay nada que elegir: solo se informa dónde se está.
    if (!varias) {
        return (
            <div title="Sucursal en la que trabajas" className={`flex items-center gap-1.5 ${compact ? "h-8 px-2 shrink-0" : "h-9 px-2.5 min-w-0"}`}>
                {boton}
            </div>
        );
    }

    const todas = sucursalesMarcadas.length === sucursales.length;

    return (
        <>
            <button
                ref={ref}
                onClick={() => setOpen(o => !o)}
                title={sucursalesMarcadas.map(w => w.name).join(", ")}
                aria-haspopup="true"
                aria-expanded={open}
                className={`flex items-center gap-1.5 rounded-lg border transition-colors ${compact ? "h-8 px-2 shrink-0" : "h-9 px-2.5 min-w-0"} ${open
                    ? "border-brand-500/40 bg-brand-500/[0.06]"
                    : "border-border dark:border-white/10 bg-white dark:bg-white/[0.04] hover:bg-surface-2 dark:hover:bg-white/[0.06]"}`}
            >
                {boton}
            </button>

            <FilterPopover open={open} onClose={() => setOpen(false)} anchorRef={ref} width={288}>
                <div className="p-1.5">
                    <div className="px-2.5 pt-1.5 pb-2">
                        <div className="text-[12px] text-content-subtle">Sucursales</div>
                        <p className="mt-0.5 text-[12px] text-content-subtle leading-snug">
                            Toca un nombre para trabajar solo en ella. Marca varias para ver sus datos juntos.
                        </p>
                    </div>
                    {sucursales.map(w => {
                        const marcada = sucursalesMarcadas.some(m => m.id === w.id);
                        const actual = w.id === sucursalActual.id;
                        const unica = marcada && sucursalesMarcadas.length === 1;
                        return (
                            <div key={w.id}
                                className={`flex items-center gap-2.5 pl-2.5 pr-1 rounded-lg ${actual ? "bg-brand-500/10 ring-1 ring-inset ring-brand-500/30" : ""}`}>
                                <Check
                                    checked={marcada}
                                    disabled={unica}
                                    title={unica ? "Tiene que quedar al menos una" : marcada ? `Dejar de ver ${w.name}` : `Ver también ${w.name}`}
                                    onChange={() => alternarSucursal(w.id)}
                                />
                                <button
                                    onClick={() => { elegirSucursal(w.id); setOpen(false); }}
                                    className={`flex-1 min-w-0 h-10 flex items-center gap-2 text-left text-[13px] ${actual ? "font-semibold text-brand-700 dark:text-brand-300" : "font-medium text-content dark:text-white/85"}`}
                                >
                                    <span className="truncate">{w.name}</span>
                                    {!w.sells && <span className="shrink-0 text-[11px] font-normal text-content-subtle">Depósito</span>}
                                </button>
                                {actual && (
                                    <span className="shrink-0 pr-2 text-[11px] font-medium text-brand-700 dark:text-brand-300">Actual</span>
                                )}
                            </div>
                        );
                    })}
                    {!todas && (
                        <div className="mt-1 pt-1 border-t border-border/60 dark:border-white/[0.06]">
                            <button onClick={marcarTodas}
                                className="w-full h-9 px-2.5 rounded-lg text-left text-[13px] font-medium text-content-muted dark:text-white/70 hover:bg-surface-2 dark:hover:bg-white/[0.06]">
                                Ver todas
                            </button>
                        </div>
                    )}
                </div>
            </FilterPopover>
        </>
    );
}
