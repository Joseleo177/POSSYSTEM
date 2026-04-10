import { Button } from "../ui/Button";
import { exportToCSV } from "../../utils/exportUtils";
import { fmtBase, fmtSale as fmtSaleHelper } from "../../helpers";
import { useApp } from "../../context/AppContext";

export default function CustomerDetail({ detail, detailSales, onClose, onPay }) {
    const { baseCurrency } = useApp();

    const fmtPrice = (n) => fmtBase(n, baseCurrency);
    const fmtSale = (sale, amount) => fmtSaleHelper(sale, amount, baseCurrency);

    // 1. EL SEGURO CRÍTICO: Si detailSales aún no llega del padre, usamos []
    const safeSales = detailSales || [];
    const pendingSales = safeSales.filter(s => s.status === 'pendiente' || s.status === 'parcial');
    const paidSales = safeSales.filter(s => s.status === 'pagado');

    // 2. MUDAMOS LA LÓGICA DEL CSV AQUÍ ADENTRO
    const handleExportStatement = () => {
        if (!safeSales.length) return;
        const headers = ['Factura', 'Fecha', 'Estado', 'Cargo', 'Abonado', 'Saldo'];
        const rows = safeSales.map(s => [
            s.id,
            new Date(s.created_at).toLocaleDateString("es-VE"),
            s.status.toUpperCase(),
            s.total,
            s.amount_paid,
            s.balance
        ]);
        exportToCSV(`Estado_Cuenta_${detail.name.replace(/\s+/g, '_')}`, rows, headers);
    };

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-300">
            {/* Header */}
            <div className="shrink-0 px-4 pt-3 pb-2 flex justify-between items-center border-b border-border/30 dark:border-white/5 print-hidden">
                <Button variant="ghost" onClick={onClose} className="!px-0 hover:!text-brand-500">
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                    Volver al listado
                </Button>
                <div className="flex gap-2">
                    <Button variant="ghost" onClick={handleExportStatement}>CSV</Button>
                    <Button onClick={() => window.print()}>Imprimir</Button>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-4 py-3">
                {/* Print header */}
                <div className="hidden print-force-break mb-4 text-center text-black">
                    <h1 className="text-xl font-black uppercase tracking-tight">Estado de Cuenta</h1>
                    <p className="text-xs mt-1 tracking-wide font-bold opacity-70">{detail.name} — RIF: {detail.rif || 'S/N'}</p>
                    <p className="text-[11px] uppercase font-black tracking-wide opacity-50 mt-1">Fecha: {new Date().toLocaleDateString("es-VE")}</p>
                </div>

                {/* Card de Resumen */}
                <div className="card-premium p-3 mb-3 bg-surface-2 dark:bg-white/5 border border-border/30 rounded-xl">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-center">
                        <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-sm font-black shadow border-2 border-white/10 shrink-0 ${detail.type === "proveedor" ? "bg-violet-500/10 text-violet-500" : "bg-info/10 text-info"}`}>
                                {detail.name.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h2 className="text-sm font-black text-content dark:text-white tracking-tight uppercase leading-none mb-1">{detail.name}</h2>
                                <div className="flex flex-wrap gap-1">
                                    {detail.rif && <span className="text-[11px] font-black bg-surface-2 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/50 text-content-subtle uppercase tracking-wider">RIF: {detail.rif}</span>}
                                    {detail.phone && <span className="text-[11px] font-black bg-surface-2 dark:bg-white/5 px-1.5 py-0.5 rounded border border-border/50 text-content-subtle tracking-wider">{detail.phone}</span>}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-surface-2/50 dark:bg-white/5 rounded-xl p-2.5 border border-border/30">
                                <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-0.5">Transacciones</div>
                                <div className="text-sm font-black text-warning tabular-nums">{detail.total_purchases}</div>
                            </div>
                            <div className="bg-surface-2/50 dark:bg-white/5 rounded-xl p-2.5 border border-border/30">
                                <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-0.5">Facturación</div>
                                <div className="text-sm font-black text-success tabular-nums">{fmtPrice(detail.total_spent)}</div>
                            </div>
                        </div>

                        <div className="bg-surface-2/50 dark:bg-white/5 rounded-xl p-2.5 border border-brand-500/10 text-right">
                            <div className="text-[11px] font-black text-content-subtle uppercase tracking-wide mb-1">SALDO PENDIENTE</div>
                            {parseFloat(detail.total_debt || 0) > 0
                                ? <div className="text-xl font-black text-danger tabular-nums">{fmtPrice(detail.total_debt)}</div>
                                : <div className="text-sm font-black text-success flex items-center justify-end gap-1.5">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    SALDO AL DÍA
                                </div>
                            }
                        </div>
                    </div>
                </div>

                {/* Cuentas por Cobrar */}
                {pendingSales.length > 0 && (
                    <div className="mb-3">
                        <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-[11px] font-black text-danger uppercase tracking-wide whitespace-nowrap">Cuentas por Cobrar</h3>
                            <div className="h-px flex-1 bg-danger/10 rounded-full" />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {pendingSales.map(sale => (
                                <div key={sale.id} className="bg-white dark:bg-surface-dark-2 border border-border/50 hover:border-danger/30 transition-all rounded-xl p-3 shadow-sm">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <div className="text-[11px] font-black text-content-subtle mb-0.5 tracking-wide uppercase opacity-60">Factura #{sale.id}</div>
                                            <div className="text-[11px] font-bold text-content-subtle">{new Date(sale.created_at).toLocaleDateString("es-VE")}</div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide border ${sale.status === "parcial" ? "bg-warning/10 text-warning border-warning/20" : "bg-danger/10 text-danger border-danger/20"}`}>
                                            {sale.status === "parcial" ? "Parcial" : "Pendiente"}
                                        </span>
                                    </div>
                                    <div className="flex items-end justify-between border-t border-border/30 pt-2">
                                        <div className="text-right">
                                            <div className="text-[11px] font-black text-danger uppercase mb-0.5">Saldo</div>
                                            <div className="text-sm font-black text-danger tabular-nums">{fmtSale(sale, sale.balance)}</div>
                                        </div>
                                    </div>
                                    <Button onClick={() => onPay(sale)} className="w-full mt-2 !py-1.5 !bg-success/10 !text-success border border-success/20 !text-[11px] hover:!bg-success hover:!text-black">
                                        Registrar Cobro
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Historial Pagado */}
                <div className="flex items-center gap-3 mb-2 mt-4">
                    <h3 className="text-[11px] font-black text-content-subtle uppercase tracking-wide whitespace-nowrap opacity-60">Historial de Pagos</h3>
                    <div className="h-px flex-1 bg-border/30 rounded-full" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {paidSales.length === 0
                        ? <div className="col-span-full text-center text-content-subtle/40 py-8 text-[11px] font-black uppercase tracking-wide">Sin pagos finalizados</div>
                        : paidSales.map(sale => (
                            <div key={sale.id} className="bg-white dark:bg-surface-dark-3 border border-border/40 rounded-xl p-3">
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[11px] font-black text-content-subtle/60 uppercase tracking-wide">#{sale.id}</span>
                                    <span className="px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[11px] font-black uppercase border border-success/20">PAGADO</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[11px] text-content-subtle/70 italic">{new Date(sale.created_at).toLocaleDateString("es-VE")}</span>
                                    <span className="text-sm font-black text-success tabular-nums">{fmtSale(sale, sale.total)}</span>
                                </div>
                            </div>
                        ))}
                </div>
            </div>
        </div>
    );
}