import { useState, useEffect, useCallback } from "react";
import { useApp } from "../../context/AppContext";
import { api } from "../../services/api";
import { fmtDateShort, fmtQty, todayISO, toNameCase } from "../../helpers";
import Modal from "../ui/Modal";
import DatePicker from "../ui/DatePicker";
import { Spinner } from "../ui/Spinner";
import PurchasePaymentModal from "../purchases/PurchasePaymentModal";
import Money from "../ui/Money";

const fmt2  = (n) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

// Cómo va la mercancía de la orden (el pago se muestra aparte, en Saldo).
const ORDER_LABEL = { borrador: "Borrador", pendiente: "Por recibir", parcial: "Recibiendo", recibido: "Recibida" };

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
  const ref = (n) => `Ref. ${fmt2(n)}`;

  const total      = parseFloat(d?.total || 0);
  const amountPaid = parseFloat(d?.amount_paid || 0);
  const balance    = parseFloat(d?.balance ?? total - amountPaid);
  const isPaid     = d?.payment_status === "pagado";
  const dueDate    = d?.effective_due_date || null;
  const daysOverdue = dueDate ? Math.round((new Date(todayISO()) - new Date(dueDate)) / 86400000) : null;
  const vencida    = !isPaid && daysOverdue > 0;
  const pronto     = !isPaid && daysOverdue !== null && daysOverdue <= 0 && daysOverdue >= -7;

  // El pago no se abre DENTRO de este modal sino en su lugar: Modal no apila (Escape cerraría
  // los dos, y el desenfoque del fondo descoloca al de encima). Al terminar, el detalle vuelve
  // ya recargado con el pago.
  return (
    <>
    <Modal open={open && !showPay} onClose={onClose} title={d ? `Compra #${d.id}` : "Compra"} width={600}>
      {loading && !d ? (
        <div className="py-16 flex items-center justify-center gap-2.5 text-[13px] text-content-subtle"><Spinner /> Cargando…</div>
      ) : !d ? null : (
        <div className="space-y-5">
          {/* ── Cabecera: a quién y cuánto ── */}
          <div className="rounded-xl bg-surface-2 dark:bg-white/[0.03] border border-border/60 dark:border-white/[0.06] px-4 py-3.5 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[12px] text-content-subtle">Proveedor</p>
              <p className="text-[15px] font-semibold text-content dark:text-white truncate">{toNameCase(d.supplier_name) || "—"}</p>
              <p className="text-[12px] text-content-subtle tabular-nums truncate">
                {fmtDateShort(d.created_at)}{d.warehouse_name ? ` · ${toNameCase(d.warehouse_name)}` : ""}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[12px] text-content-subtle">Total</p>
              <Money value={ref(total)} className="block text-[24px] font-bold tracking-tight leading-tight text-content dark:text-white" />
              {inInvoice && <Money value={`${invoiceCur.symbol} ${fmt2(total * invoiceRate)}`} className="block text-[12px] text-content-subtle" />}
            </div>
          </div>

          {/* ── Estado y saldo ── */}
          <dl className="grid grid-cols-3 gap-x-4">
            <div className="min-w-0">
              <dt className="text-[12px] text-content-subtle">Mercancía</dt>
              <dd className="text-[13px] font-medium text-content dark:text-white truncate">{ORDER_LABEL[d.status] || d.status}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-content-subtle">Pagado</dt>
              <dd><Money value={ref(amountPaid)} className="text-[13px] font-medium text-content dark:text-white" /></dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[12px] text-content-subtle">Saldo</dt>
              <dd>
                {isPaid ? (
                  <span className="inline-flex items-center gap-1 text-[13px] font-medium text-emerald-700 dark:text-emerald-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    Pagada
                  </span>
                ) : (
                  <Money value={ref(balance)} className="text-[13px] font-semibold text-red-600 dark:text-red-400" />
                )}
              </dd>
            </div>
          </dl>

          {/* ── Vencimiento: filete rojo si venció, ámbar si vence en la semana ── */}
          {dueDate && !isPaid && (
            <div className={`rounded-lg border border-border/60 dark:border-white/[0.06] border-l-[3px] px-3.5 py-3 flex flex-wrap items-center justify-between gap-3 ${
              vencida ? "border-l-red-500" : pronto ? "border-l-amber-500" : "border-l-border dark:border-l-white/10"
            }`}>
              <div className="min-w-0">
                <p className="text-[12px] text-content-subtle">Vence</p>
                <p className="text-[13px] font-medium text-content dark:text-white tabular-nums whitespace-nowrap">
                  {fmtDateShort(dueDate)}
                  {vencida && (
                    <span className="ml-2 font-medium text-red-600 dark:text-red-400">Vencida hace {daysOverdue} día{daysOverdue !== 1 ? "s" : ""}</span>
                  )}
                  {pronto && (
                    <span className="ml-2 font-medium text-amber-700 dark:text-amber-400">
                      {daysOverdue === 0 ? "Vence hoy" : `En ${-daysOverdue} día${daysOverdue !== -1 ? "s" : ""}`}
                    </span>
                  )}
                </p>
                <p className="text-[12px] text-content-subtle mt-0.5">
                  {d.due_date
                    ? "Fecha pactada para esta compra"
                    : d.supplier_credit_days
                      ? `Crédito del proveedor: ${d.supplier_credit_days} días`
                      : "De contado: el proveedor no tiene días de crédito"}
                </p>
              </div>
              {canSetDue && (
                <div className="flex items-center gap-2 shrink-0">
                  {savingDue && <Spinner />}
                  <DatePicker value={dueDate} onChange={v => v && v !== dueDate && saveDueDate(v)} clearable={false} className="shrink-0" />
                  {d.due_date && (
                    <button
                      onClick={() => saveDueDate(null)}
                      disabled={savingDue}
                      className="h-9 px-2.5 rounded-lg text-[12px] font-medium text-content-subtle hover:text-content dark:hover:text-white hover:bg-surface-3 dark:hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                      title="Volver al plazo de crédito del proveedor"
                    >
                      Restablecer
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Productos: dos renglones por línea ── */}
          <div>
            <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
              Productos <span className="font-normal text-content-subtle">· {(d.items || []).length}</span>
            </p>
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06] lg:max-h-[240px] lg:overflow-y-auto">
              {(d.items || []).map(it => (
                <div key={it.id} className="px-3.5 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-content dark:text-white min-w-0 break-words">{it.product_name}</span>
                    <Money value={ref(it.subtotal)} className="text-[13px] font-semibold text-content dark:text-white shrink-0" />
                  </div>
                  <div className="text-[12px] text-content-subtle tabular-nums mt-0.5">
                    {fmtQty(it.package_qty)} × {toNameCase(it.package_unit || "unidad")}{parseFloat(it.package_size) !== 1 ? ` de ${fmtQty(it.package_size)}` : ""} · {ref(it.package_price)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pagos ── */}
          <div>
            <p className="text-[13px] font-semibold text-content dark:text-white mb-2">
              Pagos <span className="font-normal text-content-subtle">· {payments.length}</span>
            </p>
            {payments.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border dark:border-white/15 px-3.5 py-4 text-center text-[13px] text-content-subtle">Sin pagos registrados</p>
            ) : (
              <div className="rounded-xl border border-border/70 dark:border-white/[0.08] divide-y divide-border/60 dark:divide-white/[0.06]">
                {payments.map(p => {
                  const cur  = (activeCurrencies || []).find(c => c.id === p.currency_id);
                  const rate = parseFloat(p.exchange_rate || 1);
                  return (
                    <div key={p.id} className="px-3.5 py-2.5 flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-content dark:text-white flex items-center gap-1.5 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-content-subtle/40" style={p.journal_color ? { backgroundColor: p.journal_color } : undefined} />
                          <span className="truncate">{toNameCase(p.journal_name) || "Sin caja"}</span>
                        </p>
                        <p className="text-[12px] text-content-subtle tabular-nums truncate">
                          {fmtDateShort(p.reference_date || p.created_at)}
                          {p.reference_number && ` · Ref. ${p.reference_number}`}
                          {p.batch_id && " · Pago conjunto"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {/* En la moneda en que salió, y debajo su equivalente en Ref. */}
                        {cur && !cur.is_base ? (
                          <>
                            <Money value={`${cur.symbol} ${fmt2(parseFloat(p.amount) * rate)}`} className="block text-[13px] font-semibold text-content dark:text-white" />
                            <Money value={`≈ ${ref(p.amount)}`} className="block text-[12px] text-content-subtle" />
                          </>
                        ) : (
                          <Money value={ref(p.amount)} className="block text-[13px] font-semibold text-content dark:text-white" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex gap-2 pt-4 border-t border-border/60 dark:border-white/[0.06]">
            <button onClick={onClose} className="btn-outline h-11 px-5 rounded-lg text-[13px] font-medium">
              Cerrar
            </button>
            {canPay && !isPaid && balance > 0.01 && (
              <button onClick={() => setShowPay(true)}
                className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold tabular-nums">
                Pagar {ref(balance)}
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
