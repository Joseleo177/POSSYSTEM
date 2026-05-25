import { useState } from "react";
import { Button } from "../ui/Button";
import { exportToCSV } from "../../utils/exportUtils";
import { fmtBase, fmtSale as fmtSaleHelper } from "../../helpers";
import { useApp } from "../../context/AppContext";
import SaleDetailModal from "./SaleDetailModal";

const SECTION = "bg-surface-2 dark:bg-white/[0.04] rounded-2xl border border-border/10 dark:border-white/[0.06]";
const LABEL   = "text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40";

export default function CustomerDetail({ detail, detailSales, onClose, onPay }) {
    const { baseCurrency } = useApp();
    const [selectedSaleId, setSelectedSaleId] = useState(null);

    const fmtPrice = (n) => fmtBase(n, baseCurrency);
    const fmtSale  = (sale, amount) => fmtSaleHelper(sale, amount, baseCurrency);

    const safeSales    = detailSales || [];
    const pendingSales = safeSales.filter(s => s.status === "borrador" || s.status === "pendiente" || s.status === "parcial");
    const paidSales    = safeSales.filter(s => s.status === "pagado");
    const hasPending   = parseFloat(detail.total_debt || 0) > 0;

    const handleExportStatement = () => {
        if (!safeSales.length) return;
        const headers = ["Factura", "Fecha", "Estado", "Cargo", "Abonado", "Saldo"];
        const rows = safeSales.map(s => [
            s.id,
            new Date(s.created_at).toLocaleDateString("es-VE"),
            s.status.toUpperCase(),
            s.total, s.amount_paid, s.balance,
        ]);
        exportToCSV(`Estado_Cuenta_${detail.name.replace(/\s+/g, "_")}`, rows, headers);
    };

    return (
        <>
        <div className="h-full flex flex-col animate-in fade-in duration-300">

            {/* ── Barra superior ── */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex justify-between items-center border-b border-border/10 dark:border-white/[0.06] print-hidden">
                <button onClick={onClose} className="flex items-center gap-1.5 text-[11px] font-bold text-content-subtle dark:text-white/40 hover:text-brand-500 dark:hover:text-brand-500 transition-colors uppercase tracking-widest">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                    Volver
                </button>
                <div className="flex gap-2">
                    <button onClick={handleExportStatement} className="h-8 px-3 rounded-xl border border-border/20 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/40 hover:border-border dark:hover:border-white/20 hover:text-content dark:hover:text-white transition-all">
                        CSV
                    </button>
                    <button onClick={() => window.print()} className="h-8 px-4 rounded-xl bg-brand-500 text-black text-[10px] font-black uppercase tracking-widest hover:brightness-105 transition-all active:scale-95">
                        Imprimir
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 py-4 flex flex-col gap-4">

                {/* Print header */}
                <div className="hidden print-force-break mb-4 text-center text-black">
                    <h1 className="text-xl font-black uppercase tracking-tight">Estado de Cuenta</h1>
                    <p className="text-xs mt-1 tracking-wide font-bold opacity-70">{detail.name} — RIF: {detail.rif || "S/N"}</p>
                    <p className="text-[11px] uppercase font-black tracking-wide opacity-50 mt-1">Fecha: {new Date().toLocaleDateString("es-VE")}</p>
                </div>

                {/* ── Card resumen de cliente ── */}
                <div className={`${SECTION} p-5`}>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">

                        {/* Identidad */}
                        <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-black shrink-0 border border-white/10 ${detail.type === "proveedor" ? "bg-violet-500/10 text-violet-400" : "bg-info/10 text-info"}`}>
                                {detail.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[13px] font-bold text-content dark:text-white uppercase tracking-tight leading-none">{detail.name}</p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {detail.rif   && <span className="text-[10px] font-bold bg-surface-3 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/40 dark:border-white/10 text-content-subtle uppercase tracking-wide">RIF: {detail.rif}</span>}
                                    {detail.phone && <span className="text-[10px] font-bold bg-surface-3 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/40 dark:border-white/10 text-content-subtle tracking-wide">{detail.phone}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="h-7 w-px bg-border/20 dark:bg-white/[0.06] hidden sm:block" />

                        {/* Transacciones */}
                        <div>
                            <p className={`${LABEL} mb-0.5`}>Transacciones</p>
                            <p className="text-[13px] font-black text-warning tabular-nums">{detail.total_purchases}</p>
                        </div>

                        <div className="h-7 w-px bg-border/20 dark:bg-white/[0.06] hidden sm:block" />

                        {/* Facturación */}
                        <div>
                            <p className={`${LABEL} mb-0.5`}>Facturación</p>
                            <p className="text-[13px] font-black text-success tabular-nums">{fmtPrice(detail.total_spent)}</p>
                        </div>

                        {/* Saldo — empujado a la derecha */}
                        <div className="ml-auto text-right">
                            <p className={`${LABEL} mb-0.5`}>Saldo Pendiente</p>
                            {hasPending
                                ? <p className="text-[15px] font-black text-danger tabular-nums">{fmtPrice(detail.total_debt)}</p>
                                : <div className="flex items-center justify-end gap-1 text-[12px] font-black text-success">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>
                                    Al día
                                </div>
                            }
                        </div>
                    </div>
                </div>

                {/* ── Cuentas por Cobrar ── */}
                {pendingSales.length > 0 && (
                    <div className={`${SECTION} overflow-hidden`}>
                        <div className="px-5 py-3 border-b border-border/10 dark:border-white/[0.06] flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-danger" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-danger opacity-70">Cuentas por Cobrar</p>
                        </div>
                        <div className="divide-y divide-border/10 dark:divide-white/[0.05]">
                            {pendingSales.map(sale => (
                                <div key={sale.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={() => setSelectedSaleId(sale.id)}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-bold text-content dark:text-white">#{sale.id}</span>
                                            <span className={`text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${
                                                sale.status === "parcial"  ? "bg-warning/10 text-warning border-warning/20" :
                                                sale.status === "borrador" ? "bg-surface-3 dark:bg-white/5 text-content-subtle dark:text-white/40 border-border/30 dark:border-white/10" :
                                                "bg-danger/10 text-danger border-danger/20"
                                            }`}>
                                                {sale.status === "parcial" ? "Parcial" : sale.status === "borrador" ? "Sin factura" : "Pendiente"}
                                            </span>
                                        </div>
                                        <p className={`${LABEL} mt-0.5 normal-case`}>{new Date(sale.created_at).toLocaleDateString("es-VE")}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={`${LABEL} mb-0.5`}>Saldo</p>
                                        <p className="text-[13px] font-black text-danger tabular-nums">{fmtSale(sale, sale.balance)}</p>
                                    </div>
                                    <button
                                        onClick={e => { e.stopPropagation(); onPay(sale); }}
                                        className="h-8 px-3 rounded-xl border border-success/20 bg-success/5 text-success text-[10px] font-black uppercase tracking-widest hover:bg-success hover:text-black transition-all active:scale-95 shrink-0"
                                    >
                                        Cobrar
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ── Historial de Pagos ── */}
                <div className={`${SECTION} overflow-hidden`}>
                    <div className="px-5 py-3 border-b border-border/10 dark:border-white/[0.06]">
                        <p className={LABEL}>Historial de Pagos</p>
                    </div>
                    {paidSales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-10 opacity-20">
                            <p className={LABEL}>Sin pagos finalizados</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-border/10 dark:divide-white/[0.05]">
                            {paidSales.map(sale => (
                                <div key={sale.id} className="px-5 py-3.5 flex items-center gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer group" onClick={() => setSelectedSaleId(sale.id)}>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[12px] font-bold text-content dark:text-white">#{sale.id}</span>
                                            <span className="text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-full border bg-success/10 text-success border-success/20">
                                                Pagado
                                            </span>
                                        </div>
                                        <p className={`${LABEL} mt-0.5 normal-case`}>{new Date(sale.created_at).toLocaleDateString("es-VE")}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[13px] font-black text-success tabular-nums">{fmtSale(sale, sale.total)}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-content-subtle dark:text-white/20 group-hover:text-brand-500 transition-colors uppercase tracking-widest shrink-0">
                                        Ver →
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>

        {selectedSaleId && (
            <SaleDetailModal saleId={selectedSaleId} onClose={() => setSelectedSaleId(null)} />
        )}
        </>
    );
}
