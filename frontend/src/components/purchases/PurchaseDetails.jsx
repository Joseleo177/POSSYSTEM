import { useState, useEffect, useCallback } from "react";
import PurchaseOriginInfo from "./PurchaseOriginInfo";
import PurchaseItemsTable from "./PurchaseItemsTable";
import PurchasePaymentModal from "./PurchasePaymentModal";
import ConfirmModal from "../ui/ConfirmModal";
import { api } from "../../services/api";
import { fmtDateShort } from "../../helpers";
import { useApp } from "../../context/AppContext";

const fmt2 = (num) => Number(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseDetails({ state }) {
  const { detail, refreshDetail } = state;
  const { notify, baseCurrency, activeCurrencies } = useApp();

  const [payments, setPayments]         = useState([]);
  const [loadingPay, setLoadingPay]     = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const loadPayments = useCallback(async () => {
    if (!detail?.id) return;
    setLoadingPay(true);
    try {
      const res = await api.purchases.getPayments(detail.id);
      setPayments(res.data || []);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoadingPay(false); }
  }, [detail?.id, notify]);

  useEffect(() => { loadPayments(); }, [loadPayments]);

  if (!detail) return null;

  const payStatus  = detail.payment_status || "pendiente";
  const amountPaid = parseFloat(detail.amount_paid || 0);
  const balance    = parseFloat(detail.balance ?? (parseFloat(detail.total) - amountPaid));
  const total      = parseFloat(detail.total || 0);
  const paidPct    = total > 0 ? Math.min(100, (amountPaid / total) * 100) : 0;

  const handlePaySuccess = async () => {
    setShowPayModal(false);
    await refreshDetail?.(detail.id);
    await loadPayments();
  };

  const handleDeletePayment = async (id) => {
    try {
      await api.purchases.removePayment(id);
      notify("Pago eliminado con éxito", "success");
      await refreshDetail?.(detail.id);
      await loadPayments();
    } catch (e) { notify(e.message, "err"); }
    setDeleteConfirm(null);
  };

  const currentBadgeClass = payStatus === "pagado" ? "badge-success" : payStatus === "parcial" ? "badge-warning" : "badge-danger";
  const labels = { pagado: "PAGADO", parcial: "PARCIAL", pendiente: "PENDIENTE" };

  return (
    <div className="flex flex-col gap-6 pb-20 overflow-visible animate-in fade-in duration-500">
      
      {/* ── SECCIÓN SUPERIOR: Info Origen y Estado ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
            <PurchaseOriginInfo detail={detail} />
        </div>

        <div className="card-premium h-full flex flex-col justify-center items-center text-center p-6 gap-2 bg-surface-1 dark:bg-white/[0.02]">
            <span className={`badge ${currentBadgeClass} shadow-none !px-3 font-bold`}>
                {labels[payStatus] || payStatus.toUpperCase()}
            </span>
            <div className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-40">Estado de Liquidación</div>
            
            {payStatus !== "pagado" && (
                <button
                    onClick={() => setShowPayModal(true)}
                    className="mt-3 h-9 px-6 rounded-xl bg-brand-500 text-black text-[11px] font-bold uppercase tracking-widest hover:brightness-105 transition-all active:scale-95 shadow-lg shadow-brand-500/10"
                >
                    + Registrar Pago
                </button>
            )}
        </div>
      </div>

      {/* ── TABLA DE PRODUCTOS ── */}
      <div className="card-premium !p-0 overflow-hidden border-border/10">
        <div className="px-5 py-3 border-b border-border/20 dark:border-white/5 bg-surface-2 dark:bg-white/[0.01] flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-500">Detalle de Mercancía Recibida</div>
            <div className="text-[10px] font-bold opacity-30 uppercase tabular-nums tracking-widest">{detail.item_count} Items total</div>
        </div>
        <PurchaseItemsTable detail={detail} />
      </div>

      {/* ── PANEL DE CUENTAS POR PAGAR & BALANCE ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Balance y Gráfico de Pago */}
        <div className="card-premium bg-surface-1 dark:bg-white/[0.01]">
          <div className="flex items-center justify-between mb-6">
            <div className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50">Resumen Financiero</div>
            <span className="text-[9px] font-bold text-success border border-success/20 bg-success/5 px-2 py-0.5 rounded-md">Conciliación Bancaria</span>
          </div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="relative w-32 h-32 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle className="text-surface-3 dark:text-white/5" strokeWidth="8" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
                <circle className="text-brand-500 transition-all duration-1000" strokeWidth="8" strokeDasharray={2 * Math.PI * 40} strokeDashoffset={2 * Math.PI * 40 * (1 - paidPct / 100)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="40" cx="50" cy="50" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-xl font-black tabular-nums leading-none tracking-tighter">{paidPct.toFixed(1)}%</span>
                <span className="text-[8px] font-bold text-content-subtle uppercase opacity-50">Saldado</span>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-2 gap-4 w-full">
              <div className="p-4 rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/10">
                <div className="text-[9px] font-bold text-content-subtle uppercase tracking-widest mb-1 opacity-50">Total Pagado</div>
                <div className="text-2xl font-black text-content dark:text-white tabular-nums tracking-tight border-b border-success/30 pb-1 mb-1 leading-none">
                  ${fmt2(detail.total_paid)}
                </div>
                <div className="text-[9px] font-bold text-success uppercase tracking-widest">Monto Conciliado</div>
              </div>

              <div className="p-4 rounded-xl bg-brand-500/5 border border-brand-500/10">
                <div className="text-[9px] font-bold text-brand-500 uppercase tracking-widest mb-1">Saldo Pendiente</div>
                <div className="text-2xl font-black text-brand-500 tabular-nums tracking-tight pb-1 mb-1 leading-none">
                  ${fmt2(detail.balance)}
                </div>
                <div className="text-[9px] font-bold text-brand-500/50 uppercase tracking-widest italic">Cuentas x Pagar</div>
              </div>
            </div>
          </div>
        </div>

        {/* Historial de Movimientos de Pago */}
        <div className="card-premium !p-0 overflow-hidden flex flex-col min-h-[300px] bg-surface-1 dark:bg-white/[0.01]">
          <div className="px-5 py-3 border-b border-border/20 dark:border-white/5 bg-surface-2 dark:bg-white/[0.02] flex items-center justify-between shrink-0">
             <div className="text-[10px] font-bold uppercase tracking-widest text-content-subtle opacity-50">Historial de Pagos</div>
             <button onClick={loadPayments} disabled={loadingPay} className="p-1.5 hover:bg-brand-500/10 rounded-lg transition-colors text-brand-500">
                <svg className={`w-3.5 h-3.5 ${loadingPay ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
             </button>
          </div>

          <div className="flex-1 overflow-auto max-h-[250px] scrollbar-thin scrollbar-thumb-white/10">
            {loadingPay ? (
                <div className="h-full flex items-center justify-center p-10">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-brand-500 animate-pulse">Sincronizando movimientos...</div>
                </div>
            ) : payments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-10 opacity-20 filter grayscale">
                    <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                    <div className="text-[10px] font-bold uppercase tracking-widest">Sin pagos registrados</div>
                </div>
            ) : (
                <div className="divide-y divide-border/10 dark:divide-white/5">
                {payments.map(p => {
                    const rate = parseFloat(p.exchange_rate || 1);
                    const cur  = activeCurrencies?.find(c => c.id === p.currency_id);
                    const sym  = cur?.symbol || baseCurrency?.symbol || "$";
                    const isBase = !cur || cur.is_base;

                    return (
                    <div key={p.id} className="px-5 py-4 flex items-center gap-4 group hover:bg-brand-500/[0.03] transition-colors">
                        <div className="w-8 h-8 rounded-xl bg-surface-3 dark:bg-white/5 flex items-center justify-center text-xs shadow-sm border border-border/10">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.journal_color || "#22c55e" }} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-content dark:text-white uppercase tracking-tight">
                                    {p.journal_name || "—"}
                                </span>
                                {p.reference_number && (
                                    <span className="text-[10px] font-black text-brand-500 tabular-nums px-1.5 py-0.5 bg-brand-500/10 rounded-md">
                                        #{p.reference_number}
                                    </span>
                                )}
                            </div>
                            <div className="text-[10px] font-bold text-content-subtle opacity-50 mt-1 uppercase">
                                {fmtDateShort(p.reference_date || p.created_at)}
                                {p.notes && <span className="ml-2 italic normal-case font-medium">· {p.notes}</span>}
                            </div>
                        </div>

                        <div className="text-right shrink-0">
                            {!isBase ? (
                                <>
                                    <p className="text-[13px] font-black text-success tabular-nums">
                                        +{sym}{(parseFloat(p.amount) * rate).toFixed(2)}
                                    </p>
                                    <p className="text-[9px] font-bold text-content-subtle opacity-40 tabular-nums">
                                        ${parseFloat(p.amount).toFixed(2)}
                                    </p>
                                </>
                            ) : (
                                <p className="text-[13px] font-black text-success tabular-nums">
                                    +${parseFloat(p.amount).toFixed(2)}
                                </p>
                            )}
                        </div>

                        <button
                            onClick={() => setDeleteConfirm(p)}
                            className="w-8 h-8 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-danger/10 text-danger transition-all active:scale-90"
                            title="Eliminar pago"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    );
                })}
                </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de pago */}
      {showPayModal && (
        <PurchasePaymentModal
          purchase={{ ...detail, balance, amount_paid: amountPaid }}
          onClose={() => setShowPayModal(false)}
          onSuccess={handlePaySuccess}
        />
      )}

      {/* Confirmar eliminar pago */}
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="¿ELIMINAR MOVIMIENTO?"
        message={`¿Estás seguro de que deseas anular este pago de $${parseFloat(deleteConfirm?.amount || 0).toLocaleString()}? Este proceso revertirá el saldo de la compra.`}
        onConfirm={() => handleDeletePayment(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="SI, ELIMINAR"
        cancelText="CANCELAR"
      />
    </div>
  );
}
