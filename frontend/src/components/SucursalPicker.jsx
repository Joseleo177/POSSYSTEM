// src/components/SucursalPicker.jsx
import React from "react";
import { useApp } from "../context/AppContext";
import { toNameCase } from "../helpers";
import { ICONO_SUCURSAL } from "../layout/SucursalSwitcher";

// Lo primero después de entrar, si el usuario tiene más de una sucursal: en cuál va a trabajar.
// Antes cada pantalla traía su propio selector de almacén y era fácil quedarse mirando (o
// vendiendo) en la sucursal equivocada. Desde la barra se puede cambiar o sumar otras.
export default function SucursalPicker() {
    const { employee, sucursales, elegirSucursal, logout } = useApp();
    const nombre = toNameCase(employee?.full_name || "").split(" ")[0];

    return (
        <div className="fixed inset-0 overflow-y-auto bg-surface-2 dark:bg-surface-dark text-content dark:text-white">
            <div className="min-h-full flex items-center justify-center p-4">
                <div className="w-full max-w-[420px] bg-white dark:bg-white/[0.04] rounded-2xl border border-border/60 dark:border-white/[0.06] shadow-card dark:shadow-none p-6 sm:p-7 modal-in">
                    <div className="w-11 h-11 rounded-xl bg-surface-2 dark:bg-white/[0.06] flex items-center justify-center text-content-muted dark:text-white/70">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d={ICONO_SUCURSAL} />
                        </svg>
                    </div>
                    {nombre && <p className="mt-4 text-[13px] text-content-subtle">Hola, {nombre}</p>}
                    <h1 className={`${nombre ? "mt-0.5" : "mt-4"} text-[20px] font-semibold tracking-tight`}>
                        ¿En qué sucursal trabajas hoy?
                    </h1>
                    <p className="mt-1 text-[13px] text-content-subtle leading-relaxed">
                        Elige la sucursal. Después puedes cambiarla, o sumar otras para ver sus datos juntos, desde la barra de arriba.
                    </p>

                    <div className="mt-5 space-y-2">
                        {sucursales.map((w, i) => (
                            <button
                                key={w.id}
                                autoFocus={i === 0}
                                onClick={() => elegirSucursal(w.id)}
                                className="w-full h-14 sm:h-12 px-4 flex items-center gap-3 rounded-xl border border-border dark:border-white/10 bg-white dark:bg-white/[0.02] text-left hover:border-brand-500/50 hover:bg-brand-500/[0.04] focus:outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20 transition-colors"
                            >
                                <span className="flex-1 min-w-0 truncate text-[15px] font-medium">{w.name}</span>
                                {!w.sells && <span className="shrink-0 text-[12px] text-content-subtle">Depósito</span>}
                                <svg className="w-4 h-4 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        ))}
                    </div>

                    <button onClick={logout}
                        className="mt-5 text-[13px] font-medium text-content-subtle hover:text-content dark:hover:text-white transition-colors">
                        Entrar con otro usuario
                    </button>
                </div>
            </div>
        </div>
    );
}
