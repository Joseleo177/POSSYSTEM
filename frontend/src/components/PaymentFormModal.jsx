import { useState } from "react";
import { useApp } from "../context/AppContext";
import { api } from "../services/api";

const getEmpty = () => ({
  amount: "",
  reference_date: new Date().toISOString().split("T")[0],
  reference_number: "",
  notes: "", payment_journal_id: "", pay_currency_id: "",
});

const inp = {
  width: "100%", background: "#0f0f0f", border: "1px solid #444",
  color: "#e8e0d0", padding: "10px 12px", borderRadius: 4,
  fontFamily: "inherit", fontSize: 13, boxSizing: "border-box",
};

/**
 * Modal unificado para registrar pagos.
 *
 * Props:
 *   sale       – objeto de la venta/factura a pagar
 *   onClose    – fn para cerrar
 *   onSuccess  – fn(res) llamada tras pago exitoso
 */
export default function PaymentFormModal({ sale, onClose, onSuccess }) {
  const { notify, baseCurrency, activeCurrencies, activeJournals } = useApp();
  const [form, setForm]     = useState(getEmpty);
  const [loading, setLoading] = useState(false);

  // Moneda de display por defecto (Bs) cuando no hay diario seleccionado aún
  const displayCur = activeCurrencies.find(c => !c.is_base) || baseCurrency;
  const defaultRate = (!displayCur || displayCur.is_base) ? 1 : parseFloat(displayCur.exchange_rate || 1);
  const defaultSym  = displayCur?.symbol || baseCurrency?.symbol || "Bs.";

  // Moneda del pago (deriva del diario seleccionado)
  const payCur  = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
  const payRate = (!payCur || payCur.is_base) ? 1 : parseFloat(payCur.exchange_rate || 1);
  const paySym  = payCur?.symbol || baseCurrency?.symbol || "$";

  const balanceUsd = parseFloat(sale?.balance ?? sale?.total ?? 0);

  const submit = async () => {
    if (!form.payment_journal_id)        return notify("Selecciona el método de pago", "err");
    if (!form.amount)                    return notify("El monto es requerido", "err");
    if (!form.reference_date)            return notify("La fecha de referencia es requerida", "err");
    if (!form.reference_number?.trim())  return notify("El número de referencia es requerido", "err");

    const amtBase = parseFloat(String(form.amount).replace(",", ".")) / payRate;
    setLoading(true);
    try {
      const res = await api.payments.create({
        sale_id:            sale.id,
        amount:             amtBase,
        currency_id:        payCur?.id || null,
        exchange_rate:      payRate,
        reference_date:     form.reference_date,
        reference_number:   form.reference_number || null,
        notes:              form.notes || null,
        payment_journal_id: form.payment_journal_id || null,
      });
      if (res.sale_status === "pagado") notify("¡Factura pagada completamente! ✓");
      else notify("Pago parcial registrado ✓");
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
    <div onClick={onClose}
      style={{ position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.82)",
               display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:"#1a1a1a",border:"1px solid #f0a500",borderRadius:8,
                 width:"100%",maxWidth:460,fontFamily:"'Courier New',monospace",
                 boxShadow:"0 8px 40px rgba(0,0,0,0.8)",maxHeight:"90vh",overflowY:"auto" }}>

        {/* Header */}
        <div style={{ padding:"14px 20px",borderBottom:"1px solid #2a2a2a",
                      display:"flex",justifyContent:"space-between",alignItems:"center",
                      position:"sticky",top:0,background:"#1a1a1a",zIndex:1 }}>
          <div style={{ fontWeight:"bold",fontSize:13,color:"#f0a500",letterSpacing:2 }}>REGISTRAR PAGO</div>
          <button onClick={onClose}
            style={{ background:"transparent",border:"none",color:"#555",fontSize:18,cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ padding:20 }}>
          {/* Info de la factura */}
          <div style={{ background:"#111",borderRadius:4,padding:"10px 14px",marginBottom:16,fontSize:12 }}>
            <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
              <span style={{ color:"#555" }}>Factura</span>
              <span style={{ color:"#f0a500",fontWeight:"bold" }}>
                {sale.invoice_number || `#${sale.id}`}
              </span>
            </div>
            {sale.customer_name && (
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                <span style={{ color:"#555" }}>Cliente</span>
                <span style={{ color:"#5dade2" }}>{sale.customer_name}</span>
              </div>
            )}
            {(() => {
              // Usar la moneda/tasa del diario seleccionado; si no hay, Bs a tasa actual
              const infoRate = form.pay_currency_id ? payRate : defaultRate;
              const infoSym  = form.pay_currency_id ? paySym  : defaultSym;
              const fmt = (usdAmt) => `${infoSym}${(Number(usdAmt || 0) * infoRate).toFixed(2)}`;
              return (<>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                  <span style={{ color:"#555" }}>Total</span>
                  <span style={{ fontWeight:"bold" }}>{fmt(sale.total)}</span>
                </div>
                {(sale.amount_paid > 0) && (
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
                    <span style={{ color:"#555" }}>Ya pagado</span>
                    <span style={{ color:"#27ae60" }}>{fmt(sale.amount_paid)}</span>
                  </div>
                )}
                <div style={{ display:"flex",justifyContent:"space-between" }}>
                  <span style={{ color:"#555" }}>Saldo pendiente</span>
                  <span style={{ fontWeight:"bold",color:"#e74c3c" }}>{fmt(balanceUsd)}</span>
                </div>
              </>);
            })()}
          </div>

          <div style={{ display:"grid",gap:12 }}>
            {/* Método de pago (diario) */}
            <div>
              <div style={{ fontSize:11,color:"#888",marginBottom:6 }}>MÉTODO DE PAGO *</div>
              <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                {activeJournals.map(j => (
                  <button key={j.id}
                    onClick={() => {
                      const newCurId = j.currency_id || baseCurrency?.id;
                      const newCur   = activeCurrencies.find(c => c.id === parseInt(newCurId));
                      const newRate  = (!newCur || newCur.is_base) ? 1 : parseFloat(newCur.exchange_rate || 1);
                      setForm(p => ({ ...p, payment_journal_id: j.id, pay_currency_id: newCurId || p.pay_currency_id, amount: (balanceUsd * newRate).toFixed(2) }));
                    }}
                    style={{ padding:"6px 12px",borderRadius:4,fontFamily:"inherit",fontSize:11,
                             cursor:"pointer",fontWeight:"bold",letterSpacing:1,
                             background: form.payment_journal_id === j.id ? j.color || "#f0a500" : "#1a1a1a",
                             color:      form.payment_journal_id === j.id ? "#000" : "#888",
                             border:     form.payment_journal_id === j.id ? `2px solid ${j.color || "#f0a500"}` : "1px solid #333" }}>
                    {j.name}
                  </button>
                ))}
              </div>
              {/* Moneda derivada del diario — solo informativa, no editable */}
              {form.pay_currency_id && (() => {
                const cur = activeCurrencies.find(c => c.id === parseInt(form.pay_currency_id));
                if (!cur) return null;
                return (
                  <div style={{ fontSize:10,color:"#555",marginTop:5 }}>
                    💱 Moneda: <b style={{ color:"#f0a500" }}>{cur.symbol} {cur.code}</b>
                    {!cur.is_base ? ` · tasa ${parseFloat(cur.exchange_rate).toFixed(4)}` : ""}
                  </div>
                );
              })()}
            </div>

            {/* Monto */}
            <div>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>MONTO *</div>
              <input type="text" inputMode="decimal" value={form.amount}
                onChange={e => {
                  const val = e.target.value.replace(/[^\d.,]/g, "");
                  setForm(p => ({ ...p, amount: val }));
                }}
                style={inp} />
              {form.amount && !isNaN(parseFloat(String(form.amount).replace(",","."))) && payCur && !payCur.is_base && (
                <div style={{ fontSize:11,color:"#27ae60",marginTop:4 }}>
                  ≈ {baseCurrency?.symbol}
                  {(parseFloat(String(form.amount).replace(",",".")) / payRate).toFixed(2)} {baseCurrency?.code}
                  {" "}(tasa: {payRate})
                </div>
              )}
            </div>

            {/* Fecha */}
            <div>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>FECHA DE REFERENCIA *</div>
              <input type="date" value={form.reference_date}
                onChange={e => setForm(p => ({ ...p, reference_date: e.target.value }))}
                style={inp} />
            </div>

            {/* N° Referencia */}
            <div>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>N° REFERENCIA *</div>
              <input type="text" value={form.reference_number}
                onChange={e => setForm(p => ({ ...p, reference_number: e.target.value }))}
                placeholder="Ej: 000123456"
                style={inp} />
            </div>

            {/* Notas */}
            <div>
              <div style={{ fontSize:11,color:"#888",marginBottom:4 }}>NOTAS</div>
              <input type="text" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Observaciones..."
                style={inp} />
            </div>
          </div>

          {/* Botones */}
          <div style={{ display:"flex",gap:10,marginTop:20 }}>
            <button onClick={onClose}
              style={{ flex:1,background:"transparent",color:"#888",border:"1px solid #333",
                       padding:"10px 0",borderRadius:4,cursor:"pointer",fontFamily:"inherit",fontSize:13 }}>
              Cancelar
            </button>
            <button onClick={submit} disabled={!canSubmit}
              style={{ flex:2,background:canSubmit?"#27ae60":"#1a4a2a",
                       color:canSubmit?"#fff":"#555",border:"none",padding:"10px 0",borderRadius:4,
                       cursor:canSubmit?"pointer":"not-allowed",fontFamily:"inherit",fontSize:13,fontWeight:"bold" }}>
              {loading ? "Registrando..." : "✓ CONFIRMAR"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
