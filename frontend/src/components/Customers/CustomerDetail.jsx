import { useState } from "react";
import { Button } from "../ui/Button";
import { exportToCSV } from "../../utils/exportUtils";
import { fmtBase, fmtSale as fmtSaleHelper } from "../../helpers";
import { useApp } from "../../context/AppContext";
import SaleDetailModal from "./SaleDetailModal";
import Modal from "../ui/Modal";
import { api } from "../../services/api";

const SECTION = "bg-surface-2 dark:bg-white/[0.04] rounded-2xl border border-border/10 dark:border-white/[0.06]";
const LABEL   = "text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40";

export default function CustomerDetail({ detail, detailSales, onClose, onPay, onRefresh }) {
    const { baseCurrency, notify, activeJournals, activeCurrencies } = useApp();
    const [selectedSaleId, setSelectedSaleId] = useState(null);
    const [clearingCredit, setClearingCredit] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);
    const [showRefund, setShowRefund] = useState(false);
    const [refundForm, setRefundForm] = useState({ amount: "", journal_id: "", reference_date: new Date().toISOString().split("T")[0], notes: "" });
    const [refunding, setRefunding] = useState(false);

    const fmtPrice = (n) => fmtBase(n, baseCurrency);
    const fmtSale  = (sale, amount) => fmtSaleHelper(sale, amount, baseCurrency);

    // Moneda/tasa del diario seleccionado para la devolución
    const refundJournal  = activeJournals.find(j => j.id === refundForm.journal_id);
    const refundCurrency = refundJournal?.currency_id ? activeCurrencies.find(c => c.id === parseInt(refundJournal.currency_id)) : null;
    const refundRate     = (!refundCurrency || refundCurrency.is_base) ? 1 : parseFloat(refundCurrency.exchange_rate || 1);
    const refundSym      = refundCurrency?.symbol || baseCurrency?.symbol || "Ref.";

    // amount en el form está en moneda LOCAL del diario; se envía al backend en base dividiendo por rate
    const refundAmountBase = parseFloat(String(refundForm.amount).replace(",", ".") || 0) / refundRate;

    const handleRefund = async () => {
        setRefunding(true);
        try {
            await api.customers.creditRefund(detail.id, {
                amount:         refundAmountBase,
                journal_id:     refundForm.journal_id,
                reference_date: refundForm.reference_date,
                notes:          refundForm.notes || null,
            });
            notify("Devolución registrada correctamente");
            setShowRefund(false);
            setRefundForm({ amount: "", journal_id: "", reference_date: new Date().toISOString().split("T")[0], notes: "" });
            onRefresh?.();
        } catch (e) { notify(e.message, "err"); }
        setRefunding(false);
    };

    const handleClearCredit = async () => {
        setClearingCredit(true);
        try {
            await api.customers.adjustCredit(detail.id, 0);
            notify("Crédito anulado correctamente");
            setConfirmClear(false);
            onRefresh?.();
        } catch (e) { notify(e.message, "err"); }
        setClearingCredit(false);
    };

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

                        {/* Crédito disponible */}
                        {parseFloat(detail.credit_balance || 0) > 0.001 && (
                            <div className="flex-1">
                                <p className={`${LABEL} mb-0.5`}>Crédito Disponible</p>
                                {confirmClear ? (
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-content-subtle dark:text-white/40">¿Anular todo?</span>
                                        <button onClick={handleClearCredit} disabled={clearingCredit}
                                            className="h-6 px-2 rounded-lg bg-danger text-white text-[10px] font-black uppercase transition-all hover:brightness-110 disabled:opacity-50">
                                            {clearingCredit ? "…" : "Sí"}
                                        </button>
                                        <button onClick={() => setConfirmClear(false)}
                                            className="h-6 px-2 rounded-lg border border-border/30 dark:border-white/10 text-[10px] font-black uppercase text-content-subtle hover:text-content dark:hover:text-white transition-all">
                                            No
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <p className="text-[15px] font-black text-brand-500 tabular-nums">{fmtPrice(detail.credit_balance)}</p>
                                        <button onClick={() => { setShowRefund(true); setConfirmClear(false); }}
                                            title="Devolver crédito en efectivo"
                                            className="h-6 px-2 rounded-lg border border-brand-500/30 text-brand-500 text-[10px] font-black uppercase tracking-wide hover:bg-brand-500/10 transition-all">
                                            Devolver
                                        </button>
                                        <button onClick={() => setConfirmClear(true)}
                                            title="Anular crédito"
                                            className="w-5 h-5 rounded-md flex items-center justify-center text-content-subtle/40 hover:text-danger hover:bg-danger/10 transition-all">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/>
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

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

        {/* ── Modal devolución de crédito ── */}
        <Modal
            open={showRefund}
            onClose={() => setShowRefund(false)}
            title="Devolver crédito en efectivo"
            width={440}
        >
            <div className="space-y-4">
                {/* Crédito disponible */}
                <div className="rounded-xl bg-brand-500/5 border border-brand-500/20 px-4 py-3 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-brand-500">Crédito disponible</span>
                    <span className="text-[15px] font-black text-brand-500 tabular-nums">{fmtPrice(detail.credit_balance)}</span>
                </div>

                {/* Monto + fecha */}
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">
                            Monto a devolver * {refundSym && <span className="text-brand-500 normal-case">({refundSym})</span>}
                        </p>
                        <input
                            type="text" inputMode="decimal"
                            value={refundForm.amount}
                            placeholder={refundForm.journal_id ? (parseFloat(detail.credit_balance || 0) * refundRate).toFixed(2) : "0.00"}
                            onChange={e => setRefundForm(p => ({ ...p, amount: e.target.value.replace(/[^\d.,]/g, "") }))}
                            className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                        />
                        {refundForm.journal_id && refundRate !== 1 && refundForm.amount && (
                            <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-1 tabular-nums">
                                ≈ {baseCurrency?.symbol}{refundAmountBase.toFixed(2)}
                            </p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Fecha *</p>
                        <input
                            type="date"
                            value={refundForm.reference_date}
                            onChange={e => setRefundForm(p => ({ ...p, reference_date: e.target.value }))}
                            className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all"
                        />
                    </div>
                </div>

                {/* Diario */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Diario de salida *</p>
                    <div className="flex flex-wrap gap-1.5">
                        {activeJournals.map(j => {
                            const jCur  = j.currency_id ? activeCurrencies.find(c => c.id === parseInt(j.currency_id)) : null;
                            const jRate = (!jCur || jCur.is_base) ? 1 : parseFloat(jCur.exchange_rate || 1);
                            const autoAmt = (parseFloat(detail.credit_balance || 0) * jRate).toFixed(2);
                            return (
                                <button key={j.id} type="button"
                                    onClick={() => setRefundForm(p => ({ ...p, journal_id: j.id, amount: autoAmt }))}
                                    style={refundForm.journal_id === j.id && j.color ? { borderColor: j.color, backgroundColor: j.color, color: "#000" } : undefined}
                                    className={[
                                        "px-3.5 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border-2 transition-all",
                                        refundForm.journal_id === j.id && !j.color
                                            ? "border-brand-500 bg-brand-500 text-black"
                                            : refundForm.journal_id !== j.id
                                            ? "border-border/40 dark:border-white/10 text-content-subtle dark:text-white/40 hover:border-brand-400 dark:hover:border-brand-400/50"
                                            : ""
                                    ].join(" ")}
                                >
                                    {j.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Notas */}
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-1.5">Notas</p>
                    <input
                        type="text"
                        value={refundForm.notes}
                        onChange={e => setRefundForm(p => ({ ...p, notes: e.target.value }))}
                        placeholder="Observaciones..."
                        className="w-full h-10 bg-white/[0.02] dark:bg-white/[0.04] border border-border/20 dark:border-white/[0.08] rounded-xl px-3.5 text-[13px] font-bold text-content dark:text-white outline-none focus:border-brand-500/60 transition-all placeholder:text-content-subtle/40 dark:placeholder:text-white/20"
                    />
                </div>

                {/* Acciones */}
                <div className="flex gap-2.5 pt-2 border-t border-border/20 dark:border-white/5">
                    <button onClick={() => setShowRefund(false)}
                        className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white hover:border-border dark:hover:border-white/20 transition-all">
                        Cancelar
                    </button>
                    <button
                        onClick={handleRefund}
                        disabled={refunding || !refundForm.amount || !refundForm.journal_id || !refundForm.reference_date}
                        className="flex-[2] h-10 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                        {refunding ? "Registrando…" : "Confirmar devolución"}
                    </button>
                </div>
            </div>
        </Modal>
        </>
    );
}
