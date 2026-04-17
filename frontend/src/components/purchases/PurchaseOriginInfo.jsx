import { fmtDate } from "../../helpers";

const fmt2 = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseOriginInfo({ detail }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">

            {/* Proveedor y Observaciones */}
            <div className="md:col-span-4 card-premium flex flex-col justify-between">
                <div>
                    <div className="text-[10px] font-bold text-content-subtle dark:text-content-dark-muted uppercase tracking-[0.15em] mb-4">
                        Identidad del Proveedor
                    </div>

                    <div className={`text-lg font-bold uppercase tracking-tight leading-tight ${detail.supplier_name ? "text-content dark:text-white" : "text-content-subtle opacity-40 italic"}`}>
                        {detail.supplier_name || "Proveedor no registrado"}
                    </div>

                    {detail.supplier_rif && (
                        <div className="text-[10px] font-bold text-brand-500 mt-2 px-2 py-0.5 bg-brand-500/5 border border-brand-500/20 rounded-md w-fit tabular-nums">
                            RIF: {detail.supplier_rif}
                        </div>
                    )}
                </div>

                {detail.notes && (
                    <div className="mt-6 pt-4 border-t border-border/10 dark:border-white/5">
                        <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest mb-1 opacity-50">Observaciones</div>
                        <div className="text-[11px] italic text-content-subtle leading-snug opacity-80 border-l-2 border-brand-500/20 pl-3">
                            "{detail.notes}"
                        </div>
                    </div>
                )}
            </div>

            {/* Información Operativa */}
            <div className="md:col-span-4 card-premium flex flex-col gap-6">
                <div className="text-[10px] font-bold text-content-subtle dark:text-content-dark-muted uppercase tracking-[0.15em]">Trazabilidad</div>

                <div className="grid grid-cols-1 gap-4">
                    {/* Almacén */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-white/5 text-brand-500 flex items-center justify-center border border-border/10">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-40">Almacén Destino</div>
                            <div className="text-[11px] font-bold text-content dark:text-white uppercase tracking-tight">
                                {detail.warehouse_name || "—"}
                            </div>
                        </div>
                    </div>

                    {/* Empleado */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-white/5 text-content-subtle flex items-center justify-center border border-border/10">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-40">Registrado por</div>
                            <div className="text-[11px] font-bold text-content dark:text-white uppercase tracking-tight leading-none">
                                {detail.employee_name || "Sistema POS"}
                            </div>
                        </div>
                    </div>

                    {/* Fecha */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-2 dark:bg-white/5 text-content-subtle flex items-center justify-center border border-border/10">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        </div>
                        <div>
                            <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest opacity-40">Fecha Contable</div>
                            <div className="text-[11px] font-bold text-content dark:text-white uppercase tabular-nums">
                                {fmtDate(detail.created_at)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Total Section (Elegance approach) */}
            <div className="md:col-span-4 bg-brand-500/10 dark:bg-brand-500/[0.03] border border-brand-500/20 rounded-2xl p-6 flex flex-col justify-center items-end relative overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-500" />
                
                <div className="relative z-10 text-right">
                    <div className="text-[10px] font-bold text-brand-500 uppercase tracking-[0.2em] mb-3">Resumen de Valor Recibido</div>
                    <div className="text-4xl font-black text-brand-500 tabular-nums tracking-tighter leading-none mb-3">
                        <span className="text-xl mr-1 opacity-60">$</span>{fmt2(detail.total)}
                    </div>
                    <div className="flex items-center justify-end gap-2 text-[10px] font-bold text-content-subtle uppercase tracking-widest opacity-40">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.39 2.1-1.39 1.47 0 2.01.59 2.1 1.58h1.01c-.11-1.49-1.11-2.42-2.3-2.67V5h-1.62v2.02c-1.38.3-2.4 1.13-2.4 2.46 0 1.54 1.29 2.27 3.16 2.73 1.93.47 2.39 1.1 2.39 1.81 0 .91-.76 1.41-2.15 1.41-1.05 0-2.2-.43-2.36-1.57H8.2c.18 1.55 1.26 2.41 2.49 2.71V19h1.62v-2.02c1.37-.28 2.45-1.07 2.45-2.49 0-1.83-1.49-2.41-3.45-2.91z"/></svg>
                        Auditoría en Divisas
                    </div>
                </div>
            </div>

        </div>
    );
}
