import { useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";

const getEmpty = () => ({
 amount: "",
 reference_date: new Date().toISOString().split("T")[0],
 reference_number: "",
 notes: "", payment_journal_id: "", pay_currency_id: "",
});

/**
 * Modal unificado para registrar pagos.
 *
 * Props:
 * sale – objeto de la venta/factura a pagar
 * onClose – fn para cerrar
 * onSuccess – fn(res) llamada tras pago exitoso
 */
export default function PaymentFormModal({ sale, onClose, onSuccess }) {
 const { notify, baseCurrency, activeCurrencies, activeJournals } = useApp();
 const [form, setForm] = useState(getEmpty);
 const [loading, setLoading] = useState(false);

 // Moneda de display por defecto (Bs) cuando no hay diario seleccionado aún
 const displayCur = activeCurrencies.find(c => !c.is_base) || baseCurrency;
 const defaultRate = (!displayCur || displayCur.is_base) ? 1 : parseFloat(displayCur.exchange_rate || 1);
 const defaultSym = displayCur?.symbol || baseCurrency?.symbol || "$";

 // Moneda del pago (deriva del diario seleccionado)
 const payCur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
 const payRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
 const paySym = payCur?.symbol || baseCurrency?.symbol || "$";

 const balanceUsd = parseFloat(sale?.balance ?? sale?.total ?? 0);

 const submit = async () => {
 if (!form.payment_journal_id) return notify("Selecciona el método de pago", "err");
 if (!form.amount) return notify("El monto es requerido", "err");
 if (!form.reference_date) return notify("La fecha de referencia es requerida", "err");
 if (!form.reference_number?.trim()) return notify("El número de referencia es requerido", "err");

 const amtBase = parseFloat(String(form.amount).replace(",", ".")) / payRate;
 setLoading(true);
 try {
 const res = await api.payments.create({
 sale_id: sale.id,
 amount: amtBase,
 currency_id: payCur?.id || null,
 exchange_rate: payRate,
 reference_date: form.reference_date,
 reference_number: form.reference_number || null,
 notes: form.notes || null,
 payment_journal_id: form.payment_journal_id || null,
 });
 if (res.sale_status === "pagado") notify("¡Factura pagada completamente!");
 else notify("Pago parcial registrado");
 setForm(getEmpty());
 onSuccess?.(res);
 } catch (e) { notify(e.message, "err"); }
 setLoading(false);
 };

 const amountNum = parseFloat(String(form.amount).replace(",", "."));
 const canSubmit = !loading && form.payment_journal_id &&
 !isNaN(amountNum) && amountNum > 0 &&
 form.reference_date && form.reference_number?.trim();

 return (
 <div
 onClick={onClose}
 className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
 >
 <div
 onClick={e => e.stopPropagation()}
 className="bg-white dark:bg-surface-dark-2 border border-border dark:border-border-dark rounded-xl shadow-card-lg w-full overflow-y-auto"
 style={{ maxWidth: 460, maxHeight: "90vh" }}
 >

 {/* Header */}
 <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-border-dark sticky top-0 bg-white dark:bg-surface-dark-2 z-10">
 <div className="text-sm font-semibold text-content dark:text-content-dark">REGISTRAR PAGO</div>
 <button
 onClick={onClose}
 className="w-10 rounded-full bg-surface-2 dark:bg-white/5 flex items-center justify-center hover:bg-danger/10 hover:text-danger transition-all"
 >
 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
 </button>
 </div>

 <div className="p-5">
 {/* Info de la factura */}
 <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-lg p-4 mb-4 space-y-2">
 <div className="flex justify-between items-center py-1.5 text-sm">
 <span className="text-content-muted dark:text-content-dark-muted">Factura</span>
 <span className="text-content dark:text-content-dark font-medium">
 {sale.invoice_number || `#${sale.id}`}
 </span>
 </div>
 {sale.customer_name && (
 <div className="flex justify-between items-center py-1.5 text-sm">
 <span className="text-content-muted dark:text-content-dark-muted">Cliente</span>
 <span className="text-content dark:text-content-dark font-medium">{sale.customer_name}</span>
 </div>
 )}
 {(() => {
 // Usar la moneda/tasa del diario seleccionado; si no hay, Bs a tasa actual
 const infoRate = form.pay_currency_id ? payRate : defaultRate;
 const infoSym = form.pay_currency_id ? paySym : defaultSym;
 const fmt = (usdAmt) => `${infoSym}${(Number(usdAmt || 0) * infoRate).toFixed(2)}`;
 return (<>
 <div className="flex justify-between items-center py-1.5 text-sm">
 <span className="text-content-muted dark:text-content-dark-muted">Total</span>
 <span className="text-content dark:text-content-dark font-medium">{fmt(sale.total)}</span>
 </div>
 {(sale.amount_paid > 0) && (
 <div className="flex justify-between items-center py-1.5 text-sm">
 <span className="text-content-muted dark:text-content-dark-muted">Ya pagado</span>
 <span className="text-success font-medium">{fmt(sale.amount_paid)}</span>
 </div>
 )}
 <div className="flex justify-between items-center py-1.5 text-sm">
 <span className="text-content-muted dark:text-content-dark-muted">Saldo pendiente</span>
 <span className="text-danger font-medium">{fmt(balanceUsd)}</span>
 </div>
 </>);
 })()}
 </div>

 <div className="grid gap-3">
 {/* Método de pago (diario) */}
 <div>
 <label className="label">MÉTODO DE PAGO *</label>
 <div className="flex flex-wrap gap-1.5 mt-1">
 {activeJournals.map(j => (
 <button key={j.id}
 onClick={() => {
 const newCurId = j.currency_id || baseCurrency?.id;
 const newCur = activeCurrencies.find(c => c.id === parseInt(newCurId));
 const newRate = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
 setForm(p => ({ ...p, payment_journal_id: j.id, pay_currency_id: newCurId || p.pay_currency_id, amount: (balanceUsd * newRate).toFixed(2) }));
 }}
 className={
 form.payment_journal_id === j.id
 ? "px-3 py-2 rounded-lg text-sm font-semibold border-2 border-brand-500 bg-brand-500 text-white"
 : "px-3 py-2 rounded-lg text-sm font-semibold border border-border dark:border-border-dark text-content-muted dark:text-content-dark-muted hover:border-brand-400"
 }
 style={
 form.payment_journal_id === j.id && j.color
 ? { borderColor: j.color, backgroundColor: j.color, color: "#000" }
 : undefined
 }
 >
 {j.name}
 </button>
 ))}
 </div>
 {/* Moneda derivada del diario — solo informativa, no editable */}
 {form.pay_currency_id && (() => {
 const cur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
 if (!cur) return null;
 return (
 <div className="flex items-center gap-1.5 text-xs text-content-muted dark:text-content-dark-muted mt-1">
 <span className="opacity-40"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></span>
 Moneda: <b className="text-content dark:text-content-dark">{cur.symbol} {cur.code}</b>
 {!cur.is_base ? ` · tasa ${parseFloat(cur.exchange_rate).toFixed(4)}` : ""}
 </div>
 );
 })()}
 </div>

 {/* Monto */}
 <div>
 <label className="label">MONTO *</label>
 <input
 type="text"
 inputMode="decimal"
 value={form.amount}
 onChange={e => {
 const val = e.target.value.replace(/[^\d.,]/g, "");
 setForm(p => ({ ...p, amount: val }));
 }}
 className="input"
 />
 {form.amount && !isNaN(parseFloat(String(form.amount).replace(",","."))) && payCur && !payCur.is_base && (
 <div className="text-xs text-success mt-1">
 ≈ {baseCurrency?.symbol}
 {(parseFloat(String(form.amount).replace(",",".")) / payRate).toFixed(2)} {baseCurrency?.code}
 {" "}(tasa: {payRate})
 </div>
 )}
 </div>

 {/* Fecha */}
 <div>
 <label className="label">FECHA DE REFERENCIA *</label>
 <input
 type="date"
 value={form.reference_date}
 onChange={e => setForm(p => ({ ...p, reference_date: e.target.value }))}
 className="input"
 />
 </div>

 {/* N° Referencia */}
 <div>
 <label className="label">N° REFERENCIA *</label>
 <input
 type="text"
 value={form.reference_number}
 onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
 placeholder="Ej: 000123456"
 className="input"
 />
 </div>

 {/* Notas */}
 <div>
 <label className="label">NOTAS</label>
 <input
 type="text"
 value={form.notes}
 onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
 placeholder="Observaciones..."
 className="input"
 />
 </div>
 </div>

 {/* Botones */}
 <div className="border-t border-border dark:border-border-dark my-4" />
 <div className="flex gap-2.5">
 <button onClick={onClose} className="btn-md btn-secondary w-full">
 Cancelar
 </button>
 <button
 onClick={submit}
 disabled={!canSubmit}
 className="btn-md btn-success w-full"
 style={{ flex: 2 }}
 >
 {loading ? "Registrando..." : "CONFIRMAR PAGO"}
 </button>
 </div>
 </div>
 </div>
 </div>
 );
}
