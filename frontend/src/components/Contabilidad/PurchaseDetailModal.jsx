import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, fmtQty, todayISO, toNameCase } from "../../helpers";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import { Spinner } from "../ui/Spinner";
import PurchasePaymentModal from "../purchases/PurchasePaymentModal";

const fmt2  = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
const LABEL = "text-[12px] font-medium text-content-subtle dark:text-white/50";
const BOX   = "rounded-xl border border-border/30 dark:border-white/[0.06] bg-surface-2/60 dark:bg-white/[0.02]";

const ORDER_LABEL = { borrador: "Borrador", pendiente: "Pendiente", parcial: "Recibiendo", recibido: "Recibido" };
const PAY_LABEL   = { pendiente: "Pendiente", parcial: "Parcial", pagado: "Pagado" };

/**
 * Detalle de una compra visto desde Cuentas por Pagar: de solo lectura, sin salir de
 * Contabilidad. Lo que aquí interesa es cuánto se debe, cuándo vence y qué se pagó; editar
 * las líneas o recibir mercancía sigue siendo cosa del módulo de Compras.
 *
 * Props:
 *   purchaseId – id de la compra a mostrar (null = cerrado)
 *   onClose    – cerrar
 *   onChanged  – algo cambió (pago o vencimiento): el listado de atrás se recarga
 */
export default function PurchaseDetailModal({ purchaseId, onClose, onChanged }) {
  const { notify, can, activeCurrencies } = useApp();
  const canPay    = can("purchases.pay");
  const canSetDue = can("purchases.edit") || can("purchases.pay");

  const [detail, setDetail]     = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [savingDue, setSavingDue] = useState(false);
  const [showPay, setShowPay]   = useState(false);

  const load = useCallback(async () => {
    if (!purchaseId) return;
    setLoading(true);
    try {
      const [d, p] = await Promise.all([
        api.purchases.getOne(purchaseId),
        api.purchases.getPayments(purchaseId),
      ]);
      setDetail(d.data);
      setPayments(p.data || []);
    } catch (e) { notify(e.message, "err"); }
    finally { setLoading(false); }
  }, [purchaseId, notify]);

  useEffect(() => {
    setDetail(null);
    setPayments([]);
    load();
  }, [load]);

  const saveDueDate = async (value) => {
    if (savingDue) return;
    setSavingDue(true);
    try {
      await api.purchases.setDueDate(purchaseId, value || null);
      notify(value ? "Vencimiento actualizado" : "Vencimiento según el crédito del proveedor");
      await load();
      onChanged?.();
    } catch (e) { notify(e.message, "err"); }
    finally { setSavingDue(false); }
  };

  const open = !!purchaseId;
  const d    = detail;

  // Montos en base; con moneda de compra se muestra además lo que decía la factura.
  const invoiceCur  = d?.currency_id ? (activeCurrencies || []).find(c => c.id === d.currency_id) : null;
  const invoiceRate = invoiceCur && !invoiceCur.is_base ? parseFloat(d.exchange_rate) || 1 : 1;
  const inInvoice   = invoiceRate > 1;
  const Money = ({ n, className = "" }) => (
    <span className={`tabular-nums ${className}`}>
      Ref. {fmt2(n)}
      {inInvoice && <span className="block text-[11px] font-semibold text-content-subtle dark:text-white/40">{invoiceCur.symbol} {fmt2(n * invoiceRate)}</span>}
    </span>
  );

  const total      = parseFloat(d?.total || 0);
  const amountPaid = parseFloat(d?.amount_paid || 0);
  const balance    = parseFloat(d?.balance ?? total - amountPaid);
  const isPaid     = d?.payment_status === "pagado";
  const dueDate    = d?.effective_due_date || null;
  const daysOverdue = dueDate ? Math.round((new Date(todayISO()) - new Date(dueDate)) / 86400000) : null;

  // El pago no se abre DENTRO de este modal sino en su lugar: Modal no apila (Escape cerraría
  // los dos, y el desenfoque del fondo descoloca al de encima). Al terminar, el detalle vuelve
  // ya recargado con el pago.
  return (
    <>
    <Modal open={open && !showPay} onClose={onClose} title={d ? `COMPRA #${d.id}` : "COMPRA"} width={760}>
      {loading && !d ? (
        <div className="py-16 flex items-center justify-center"><Spinner /></div>
      ) : !d ? null : (
        <div className="space-y-4">
          {/* Cabecera */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {[
              ["Proveedor", d.supplier_name || "—"],
              ["Sucursal",  d.warehouse_name || "—"],
              ["Fecha",     fmtDateShort(d.created_at)],
              ["Estado",    `${ORDER_LABEL[d.status] || d.status} · ${PAY_LABEL[d.payment_status] || d.payment_status}`],
            ].map(([label, val]) => (
              <div key={label} className="min-w-0">
                <p className={LABEL}>{label}</p>
                <p className="text-[12px] font-semibold text-content dark:text-white break-words">{val}</p>
              </div>
            ))}
          </div>

          {/* Saldo */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`${BOX} p-3`}>
              <p className={LABEL}>Total</p>
              <Money n={total} className="text-[14px] font-bold text-content dark:text-white" />
            </div>
            <div className={`${BOX} p-3`}>
              <p className={LABEL}>Pagado</p>
              <Money n={amountPaid} className="text-[14px] font-bold text-success" />
            </div>
            <div className="rounded-xl border border-brand-500/20 bg-brand-500/[0.06] p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-brand-500/70">Saldo</p>
              <Money n={balance} className="text-[14px] font-bold text-brand-500" />
            </div>
          </div>

          {/* Vencimiento */}
          {dueDate && (
            <div className={`${BOX} p-3 flex flex-wrap items-center justify-between gap-3`}>
              <div className="min-w-0">
                <p className={LABEL}>Vence</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-bold text-content dark:text-white tabular-nums">{fmtDateShort(dueDate)}</span>
                  {!isPaid && daysOverdue > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-danger/10 text-danger border border-danger/20">
                      Vencida hace {daysOverdue} día{daysOverdue !== 1 ? "s" : ""}
                    </span>
                  )}
                  {!isPaid && daysOverdue <= 0 && daysOverdue >= -7 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20">
                      {daysOverdue === 0 ? "Vence hoy" : `En ${-daysOverdue} día${daysOverdue !== -1 ? "s" : ""}`}
                    </span>
                  )}
                </div>
                <p className="text-[11px] font-medium text-content-subtle dark:text-white/35 mt-0.5">
                  {d.due_date
                    ? "Fecha pactada para esta compra"
                    : d.supplier_credit_days
                      ? `Crédito del proveedor: ${d.supplier_credit_days} días`
                      : "De contado: el proveedor no tiene días de crédito"}
                </p>
              </div>
              {canSetDue && !isPaid && (
                <div className="flex items-center gap-2 shrink-0">
                  {savingDue && <Spinner />}
                  <DatePicker value={dueDate} onChange={v => v && v !== dueDate && saveDueDate(v)} clearable={false} className="shrink-0" />
                  {d.due_date && (
                    <button
                      onClick={() => saveDueDate(null)}
                      disabled={savingDue}
                      className="h-8 px-2.5 rounded-lg text-[11px] font-bold text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/5 transition-all disabled:opacity-40"
                      title="Volver al plazo de crédito del proveedor"
                    >
                      Restablecer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Productos */}
          <div>
            <p className={`${LABEL} mb-1.5`}>Productos ({(d.items || []).length})</p>
            <div className={`${BOX} divide-y divide-border/20 dark:divide-white/5 max-h-[220px] overflow-y-auto`}>
              {(d.items || []).map(it => (
                <div key={it.id} className="px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold text-content dark:text-white tracking-tight break-words">{it.product_name}</p>
                    <p className="text-[11px] font-semibold text-content-subtle">
                      {fmtQty(it.package_qty)} × {it.package_unit}{parseFloat(it.package_size) !== 1 ? ` de ${fmtQty(it.package_size)}` : ""} · Ref. {fmt2(it.package_price)}
                    </p>
                  </div>
                  <span className="text-[12px] font-bold tabular-nums text-content dark:text-white shrink-0">Ref. {fmt2(it.subtotal)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Pagos */}
          <div>
            <p className={`${LABEL} mb-1.5`}>Pagos ({payments.length})</p>
            {payments.length === 0 ? (
              <div className={`${BOX} px-3 py-4 text-center text-[12px] font-semibold text-content-subtle`}>Sin pagos registrados</div>
            ) : (
              <div className={`${BOX} divide-y divide-border/20 dark:divide-white/5`}>
                {payments.map(p => {
                  const cur  = (activeCurrencies || []).find(c => c.id === p.currency_id);
                  const rate = parseFloat(p.exchange_rate || 1);
                  return (
                    <div key={p.id} className="px-3 py-2 flex items-center gap-3">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.journal_color || "#22c55e" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-content dark:text-white truncate">
                          {toNameCase(p.journal_name) || "—"}
                          {p.reference_number && <span className="ml-1.5 text-[10px] font-bold text-brand-500">#{p.reference_number}</span>}
                          {p.batch_id && <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-500">Conjunto</span>}
                        </p>
                        <p className="text-[11px] font-semibold text-content-subtle">{fmtDateShort(p.reference_date || p.created_at)}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[12px] font-bold text-success tabular-nums">Ref. {fmt2(p.amount)}</p>
                        {cur && !cur.is_base && (
                          <p className="text-[11px] font-semibold text-content-subtle tabular-nums">{cur.symbol} {fmt2(parseFloat(p.amount) * rate)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 mt-6 pt-4 border-t border-border/60 dark:border-white/[0.06]">
            <button onClick={onClose}
              className="flex-1 h-10 rounded-xl border border-border/40 dark:border-white/10 text-[12px] font-bold text-content-subtle dark:text-white/40 hover:text-content dark:hover:text-white transition-all">
              Cerrar
            </button>
            {canPay && !isPaid && balance > 0.01 && (
              <button onClick={() => setShowPay(true)}
                className="flex-[2] h-10 rounded-xl btn-accent text-[12px] font-bold transition-all">
                Registrar pago
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>

    {open && showPay && d && (
      <PurchasePaymentModal
        purchase={{ ...d, balance, amount_paid: amountPaid }}
        onClose={() => setShowPay(false)}
        onSuccess={async () => { setShowPay(false); await load(); onChanged?.(); }}
      />
    )}
    </>
  );
}
