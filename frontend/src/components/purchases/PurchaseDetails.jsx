import { useState, useEffect, useCallback } from "react";
import PurchaseOriginInfo from "./PurchaseOriginInfo";
import PurchaseItemsTable from "./PurchaseItemsTable";
import PurchasePaymentModal from "./PurchasePaymentModal";
import ConfirmModal from "../ui/ConfirmModal";
import { api } from "../../services/api";
import { fmtDateShort } from "../../helpers";
import { useApp } from "../../context/AppContext";

const STATUS_BADGE = {
  pendiente: "bg-danger/10 text-danger border-danger/20",
  parcial:   "bg-warning/10 text-warning border-warning/20",
  pagado:    "bg-success/10 text-success border-success/20",
};
const STATUS_LABEL = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };

export default function PurchaseDetails({ state }) {
  const { detail, setView, refreshDetail } = state;
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

  const handlePaySuccess = async (res) => {
    setShowPayModal(false);
    // Refrescar detalle y pagos
    await refreshDetail?.(detail.id);
    await loadPayments();
  };

  const handleDeletePayment = async (id) => {
    try {
      await api.purchases.removePayment(id);
      notify("Pago eliminado");
      await refreshDetail?.(detail.id);
      await loadPayments();
    } catch (e) { notify(e.message, "err"); }
    setDeleteConfirm(null);
  };

  return (
    <div className="h-full flex flex-col">

      {/* Header */}
      <div className="shrink-0 px-4 pt-3 pb-2 flex items-center gap-3 border-b border-border/30 dark:border-white/5">
        <button
          onClick={() => setView("list")}
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-surface-2 dark:bg-white/5 text-content-subtle hover:bg-brand-500 hover:text-black transition-all border border-border/40"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-black text-brand-500 uppercase tracking-wide leading-none mb-0.5">MÓDULO DE COMPRAS</div>
          <h2 className="text-sm font-black text-content dark:text-white uppercase tracking-tight leading-none">
            Recibo de Compra <span className="text-warning">#{detail.id}</span>
          </h2>
        </div>
        {/* Badge de estado de pago */}
        <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${STATUS_BADGE[payStatus]}`}>
          {STATUS_LABEL[payStatus]}
        </span>
        {/* Botón pagar */}
        {payStatus !== "pagado" && (
          <button
            onClick={() => setShowPayModal(true)}
            className="h-8 px-4 rounded-xl bg-brand-500 text-black text-[11px] font-black uppercase tracking-wide hover:brightness-110 transition-all"
          >
            + Registrar Pago
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-4">
        <PurchaseOriginInfo detail={detail} />
        <PurchaseItemsTable detail={detail} />

        {/* ── Panel de Cuentas por Pagar ── */}
        <div className="rounded-xl border border-border/40 dark:border-white/10 overflow-hidden">
          {/* Cabecera del panel */}
          <div className="px-4 py-3 bg-surface-2 dark:bg-white/5 border-b border-border/20 dark:border-white/5 flex items-center justify-between">
            <div className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30">
              Estado de Pago al Proveedor
            </div>
            <span className={`text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-lg border ${STATUS_BADGE[payStatus]}`}>
              {STATUS_LABEL[payStatus]}
            </span>
          </div>

          {/* Barra de progreso + montos */}
          <div className="px-4 py-4 border-b border-border/10 dark:border-white/5">
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-0.5">Pagado</p>
                <p className="text-lg font-black text-success tabular-nums">${amountPaid.toFixed(2)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-content-subtle dark:text-white/30 mb-0.5">Saldo</p>
                <p className="text-lg font-black text-danger tabular-nums">${balance.toFixed(2)}</p>
              </div>
            </div>
            <div className="w-full h-2 rounded-full bg-surface-2 dark:bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-all duration-500"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <p className="text-[10px] font-bold text-content-subtle dark:text-white/20 mt-1 text-right">
              {paidPct.toFixed(0)}% de ${total.toFixed(2)}
            </p>
          </div>

          {/* Historial de pagos */}
          {loadingPay ? (
            <div className="px-4 py-6 text-center text-[11px] font-black uppercase tracking-widest text-brand-500 animate-pulse">
              Cargando pagos...
            </div>
          ) : payments.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] font-black uppercase tracking-wide text-content-subtle dark:text-white/20 opacity-50">
              Sin pagos registrados
            </div>
          ) : (
            <div className="divide-y divide-border/10 dark:divide-white/5">
              {payments.map(p => {
                const rate = parseFloat(p.exchange_rate || 1);
                const cur  = activeCurrencies?.find(c => c.id === p.currency_id);
                const sym  = cur?.symbol || baseCurrency?.symbol || "$";
                const isBase = !cur || cur.is_base;

                return (
                  <div key={p.id} className="px-4 py-3 flex items-center gap-3 group hover:bg-surface-2/50 dark:hover:bg-white/[0.02] transition-colors">
                    {/* Dot de color del diario */}
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: p.journal_color || "#22c55e" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-black text-content dark:text-white uppercase tracking-tight">
                          {p.journal_name || "—"}
                        </span>
                        {p.reference_number && (
                          <span className="text-[10px] font-bold text-brand-500 tracking-tight">
                            #{p.reference_number}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-content-subtle dark:text-white/30 mt-0.5">
                        {fmtDateShort(p.reference_date || p.created_at)}
                        {p.notes && <span className="ml-2 opacity-60">· {p.notes}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {!isBase ? (
                        <>
                          <p className="text-[12px] font-black text-success tabular-nums">
                            +{sym}{(parseFloat(p.amount) * rate).toFixed(2)}
                          </p>
                          <p className="text-[10px] font-bold text-content-subtle dark:text-white/30 tabular-nums">
                            ${parseFloat(p.amount).toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <p className="text-[12px] font-black text-success tabular-nums">
                          +${parseFloat(p.amount).toFixed(2)}
                        </p>
                      )}
                    </div>
                    {/* Botón eliminar */}
                    <button
                      onClick={() => setDeleteConfirm(p)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white transition-all"
                      title="Eliminar pago"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer: botón pagar si hay saldo */}
          {payStatus !== "pagado" && (
            <div className="px-4 py-3 border-t border-border/10 dark:border-white/5">
              <button
                onClick={() => setShowPayModal(true)}
                className="w-full h-9 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-500 text-[11px] font-black uppercase tracking-wide hover:bg-brand-500 hover:text-black transition-all"
              >
                + Registrar Pago al Proveedor
              </button>
            </div>
          )}
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
        title="¿Eliminar pago?"
        message={`¿Seguro que deseas eliminar este pago de $${parseFloat(deleteConfirm?.amount || 0).toFixed(2)}? El saldo de la compra se ajustará.`}
        onConfirm={() => handleDeletePayment(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
        type="danger"
        confirmText="Sí, eliminar"
      />
    </div>
  );
}
