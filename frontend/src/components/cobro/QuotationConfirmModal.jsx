import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { Button } from "../ui/Button";
import { printQuotationDoc } from "../../helpers";

export default function QuotationConfirmModal({ quotation, onNext }) {
    const { companyInfo, baseCurrency, activeCurrencies, notify } = useApp();

    const receiptRate   = parseFloat(quotation?.exchange_rate || 1);
    const receiptIsBase = receiptRate <= 1;
    const displayCurrency = activeCurrencies?.find(c => !c.is_base) || baseCurrency;
    const sym = receiptIsBase ? (baseCurrency?.symbol || "$") : (displayCurrency?.symbol || "$");
    const rate = receiptIsBase ? 1 : parseFloat(receiptRate > 1 ? receiptRate : (displayCurrency?.exchange_rate || 1));
    const fmt = n => `${sym}${Number(parseFloat(n || 0) * rate).toFixed(2)}`;

    const total    = parseFloat(quotation?.total || 0);
    const discount = parseFloat(quotation?.discount_amount || 0);

    const handlePrint = async () => {
        try {
            const res = await api.quotations.getOne(quotation.id);
            printQuotationDoc(res.data, companyInfo, baseCurrency, activeCurrencies);
        } catch (e) {
            notify?.(e.message, "err");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white dark:bg-surface-dark-2 rounded-xl shadow-2xl border border-border/20 dark:border-white/5 overflow-hidden">

                {/* Header */}
                <div className="px-5 py-4 border-b border-border/20 dark:border-white/5 flex items-center gap-3 bg-brand-500/5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-brand-500/10 text-brand-500 border border-brand-500/20">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">Cotización Guardada</div>
                        <div className="text-sm font-black text-content dark:text-white">Cotización #{quotation.id}</div>
                    </div>
                    <div className="ml-auto text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border bg-amber-500/10 text-amber-500 border-amber-500/20">
                        Pendiente
                    </div>
                </div>

                {/* Totales */}
                <div className="px-5 py-4 space-y-2 border-b border-border/20 dark:border-white/5">
                    {discount > 0 && (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Subtotal</span>
                                <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 tabular-nums">{fmt(total + discount)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-[11px] font-bold text-danger uppercase tracking-wide">Descuento</span>
                                <span className="text-[11px] font-bold text-danger tabular-nums">-{fmt(discount)}</span>
                            </div>
                        </>
                    )}
                    <div className="flex justify-between items-center pt-1">
                        <span className="text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/40">Total</span>
                        <span className="text-xl font-black text-brand-500 tabular-nums">{fmt(total)}</span>
                    </div>
                    {quotation.customer_name && (
                        <div className="flex justify-between items-center">
                            <span className="text-[11px] font-bold text-content-subtle dark:text-white/40 uppercase tracking-wide">Cliente</span>
                            <span className="text-[11px] font-bold text-content dark:text-white/70 tabular-nums">{quotation.customer_name}</span>
                        </div>
                    )}
                </div>

                {/* Acciones */}
                <div className="px-5 py-4 flex gap-2">
                    <Button variant="ghost" onClick={handlePrint} className="flex-1 h-9 border border-border/30 dark:border-white/10">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                        </svg>
                        Imprimir
                    </Button>
                    <Button onClick={onNext} className="flex-1 h-9 shadow-none">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Siguiente
                    </Button>
                </div>
            </div>
        </div>
    );
}
