import { fmtDate } from "../../helpers";
import { fmt2 } from "../../utils/purchaseUtils";

export default function PurchaseOriginInfo({ detail }) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-3">

            {/* Proveedor */}
            <div className="card-premium p-4 flex flex-col justify-between">
                <div>
                    <div className="text-[11px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-wide mb-3 opacity-50">
                        Proveedor
                    </div>

                    <div
                        className={`text-lg font-black uppercase tracking-tight ${detail.supplier_name ? "text-brand-500" : "text-content-muted"
                            }`}
                    >
                        {detail.supplier_name || "PROVEEDOR FINAL"}
                    </div>

                    {detail.supplier_rif && (
                        <div className="text-[11px] font-bold text-content-subtle mt-1 opacity-60">
                            RIF: {detail.supplier_rif}
                        </div>
                    )}
                </div>

                {detail.notes && (
                    <div className="mt-6 pt-4 border-t border-border/10">
                        <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-1 opacity-40">
                            Observaciones:
                        </div>
                        <div className="text-xs italic text-content-subtle leading-relaxed opacity-70">
                            "{detail.notes}"
                        </div>
                    </div>
                )}
            </div>

            {/* Información de origen */}
            <div className="card-premium p-4">
                <div className="text-[11px] font-black text-content-subtle dark:text-content-dark-muted uppercase tracking-wide mb-3 opacity-50">
                    Información de Origen
                </div>

                <div className="space-y-4">

                    {/* Almacén */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center border border-info/20 shadow-inner">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </div>

                        <div>
                            <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide opacity-40">
                                Almacén Destino
                            </div>
                            <div className="text-xs font-black text-content uppercase">
                                {detail.warehouse_name || "—"}
                            </div>
                        </div>
                    </div>

                    {/* Empleado */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-3 dark:bg-white/10 text-content-subtle flex items-center justify-center border border-border/10 shadow-inner">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>

                        <div>
                            <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide opacity-40">
                                Empleado Registrador
                            </div>
                            <div className="text-xs font-black text-content uppercase">
                                {detail.employee_name || "—"}
                            </div>
                        </div>
                    </div>

                    {/* Fecha */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-surface-3 dark:bg-white/10 text-content-subtle flex items-center justify-center border border-border/10 shadow-inner">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>

                        <div>
                            <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide opacity-40">
                                Fecha de Registro
                            </div>
                            <div className="text-xs font-black text-content uppercase tracking-wider tabular-nums">
                                {fmtDate(detail.created_at)}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Total */}
            <div className="card-premium p-4 bg-warning/5 border-warning/20 flex flex-col items-end justify-center">
                <div className="text-[11px] font-black text-warning uppercase tracking-wide mb-2">
                    Total Compra Invertido
                </div>

                <div className="text-5xl font-black text-warning font-display drop-shadow-sm tabular-nums tracking-tighter">
                    ${fmt2(detail.total)}
                </div>

                <div className="text-[11px] font-bold text-warning/60 uppercase tracking-wide mt-2 italic">
                    * precios expresados en USD
                </div>
            </div>

        </div>
    );
}
