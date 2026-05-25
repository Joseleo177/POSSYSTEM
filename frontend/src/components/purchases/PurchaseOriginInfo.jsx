import { fmtDate } from "../../helpers";

const fmt2 = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseOriginInfo({ detail }) {
    return (
        <div className="bg-surface-2 dark:bg-white/[0.04] rounded-2xl border border-border/10 dark:border-white/[0.06] p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">

                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40 mb-1">Proveedor</p>
                    <p className={`text-[13px] font-bold leading-snug ${detail.supplier_name ? "text-content dark:text-white" : "italic text-content-subtle opacity-30"}`}>
                        {detail.supplier_name || "No registrado"}
                    </p>
                    {detail.supplier_rif && (
                        <p className="text-[10px] font-bold text-brand-500 tabular-nums mt-0.5">{detail.supplier_rif}</p>
                    )}
                </div>

                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40 mb-1">Almacén</p>
                    <p className="text-[13px] font-bold text-content dark:text-white">{detail.warehouse_name || "—"}</p>
                </div>

                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40 mb-1">Registrado por</p>
                    <p className="text-[13px] font-bold text-content dark:text-white">{detail.employee_name || "Sistema"}</p>
                </div>

                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40 mb-1">Fecha</p>
                    <p className="text-[13px] font-bold text-content dark:text-white tabular-nums">{fmtDate(detail.created_at)}</p>
                </div>
            </div>

            {detail.notes && (
                <div className="mt-4 pt-4 border-t border-border/10 dark:border-white/[0.06]">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40 mb-1">Observaciones</p>
                    <p className="text-[12px] italic text-content-subtle opacity-70">{detail.notes}</p>
                </div>
            )}
        </div>
    );
}
