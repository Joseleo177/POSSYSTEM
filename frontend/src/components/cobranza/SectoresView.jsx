import { useEffect, useState } from "react";
import { api } from "../../services/api";
import { useApp } from "../../context/AppContext";
import Money from "../ui/Money";
import SectorModal from "./SectorModal";
import AsignarClientesModal from "./AsignarClientesModal";
import ProductoCobranza from "./ProductoCobranza";
import CategoriaRegalos from "./CategoriaRegalos";
import { fmtBaseCon } from "./shared";

/**
 * Sectores (solo quien administra la cobranza): qué se deja, los pueblos o zonas con su
 * sucursal y sus cobradores, y los clientes que todavía no tienen sector.
 */
export default function SectoresView({ version = 0, nuevo = 0, onChanged }) {
    const { notify, baseCurrency } = useApp();
    const fmtBase = fmtBaseCon(baseCurrency);
    const [res, setRes] = useState(null);
    const [editando, setEditando] = useState(null);   // null cerrado · {} nuevo · fila
    const [asignando, setAsignando] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let vivo = true;
        api.cobranza.sectores(true)
            .then(r => { if (vivo) setRes(r); })
            .catch(e => { if (vivo) { notify(e.message, "err"); setRes({ data: [] }); } });
        return () => { vivo = false; };
    }, [version, tick]);   // eslint-disable-line react-hooks/exhaustive-deps

    // El botón "+ Nuevo sector" vive en la cabecera de la página.
    useEffect(() => { if (nuevo) setEditando({}); }, [nuevo]);

    const listo = () => { setTick(t => t + 1); onChanged?.(); };
    const sectores = res?.data || [];

    return (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
            <div className="max-w-5xl p-4 space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <ProductoCobranza />
                    <CategoriaRegalos />
                </div>

                {res?.sin_sector > 0 && (
                    <div className="relative rounded-xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] pl-4 pr-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 overflow-hidden">
                        <span aria-hidden="true" className="absolute left-0 inset-y-0 w-[3px] bg-amber-500" />
                        <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-semibold text-content dark:text-white">
                                {res.sin_sector} {res.sin_sector === 1 ? "cliente sin sector" : "clientes sin sector"}
                            </p>
                            <p className="text-[12px] text-content-subtle">Ningún cobrador los ve en su ruta hasta que se les asigne uno.</p>
                        </div>
                        <button type="button" onClick={() => setAsignando(true)} disabled={!sectores.some(s => s.active)}
                            className="btn-outline h-12 sm:h-9 px-4 rounded-lg text-[13px] font-semibold disabled:opacity-50">
                            Asignar sector
                        </button>
                    </div>
                )}

                {res === null ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {[0, 1, 2].map(i => <div key={i} className="h-36 rounded-2xl bg-surface-2 dark:bg-white/[0.04] animate-pulse" />)}
                    </div>
                ) : sectores.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border dark:border-white/10 py-12 text-center">
                        <p className="text-[15px] font-semibold text-content dark:text-white">Todavía no hay sectores</p>
                        <p className="mt-1 text-[13px] text-content-subtle">Crea uno por pueblo o zona y asígnale su cobrador.</p>
                        <button type="button" onClick={() => setEditando({})} className="btn-accent mt-4 h-10 px-5 rounded-lg text-[13px] font-semibold">Crear sector</button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 auto-rows-max">
                        {sectores.map(s => (
                            <button key={s.id} type="button" onClick={() => setEditando(s)}
                                className={`text-left rounded-2xl border border-border/60 dark:border-white/[0.06] bg-white dark:bg-white/[0.04] shadow-card dark:shadow-none p-4 transition-colors hover:border-border dark:hover:border-white/15 ${s.active ? "" : "opacity-60"}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-semibold text-content dark:text-white truncate">{s.name}</p>
                                        <p className="text-[12px] text-content-subtle truncate">{s.warehouse_name}{s.active ? "" : " · Inactivo"}</p>
                                    </div>
                                    <svg className="w-4 h-4 mt-1 shrink-0 text-content-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </div>
                                <div className="mt-3 flex items-end justify-between gap-3">
                                    <div className="text-[12px] text-content-subtle tabular-nums">
                                        <p>{s.clientes} {s.clientes === 1 ? "cliente" : "clientes"}</p>
                                        <p>{s.con_deuda} con deuda</p>
                                    </div>
                                    {s.deuda > 0
                                        ? <Money value={fmtBase(s.deuda)} className="text-[18px] font-bold tracking-tight text-content dark:text-white" />
                                        : <span className="text-[12px] text-content-subtle">Sin deuda</span>}
                                </div>
                                <p className="mt-3 pt-3 border-t border-border/60 dark:border-white/[0.06] text-[12px] text-content-subtle truncate">
                                    {s.employees.length ? s.employees.map(e => e.name).join(", ") : "Sin cobrador asignado"}
                                </p>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {editando && (
                <SectorModal sector={editando.id ? editando : null} opciones={res?.opciones}
                    onClose={() => setEditando(null)}
                    onSaved={() => { setEditando(null); listo(); }} />
            )}
            {asignando && (
                <AsignarClientesModal sectores={sectores.filter(s => s.active)}
                    onClose={() => setAsignando(false)}
                    onSaved={() => { setAsignando(false); listo(); }} />
            )}
        </div>
    );
}
