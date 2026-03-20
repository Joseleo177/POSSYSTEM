import Modal from "./Modal";
import { useApp } from "../context/AppContext";

const fmt = (n, sym = "$") => `${sym}${Number(n || 0).toFixed(2)}`;

// Normaliza el objeto sale ya sea de ContabilidadPage (getAll) o de CobroPage (checkout)
function normalizeSale(sale) {
  return {
    id:              sale.id,
    invoice_number:  sale.invoice_number || null,
    total:           sale.total,
    paid:            sale.paid,
    change:          sale.change,
    discount:        sale.discount_amount || 0,
    created_at:      sale.created_at,
    items:           (sale.items || []).map(i => ({
      ...i,
      subtotal: i.subtotal ?? parseFloat(i.price || 0) * parseFloat(i.quantity || 1),
    })),
    customer_name:   sale.customer_name || sale.customerName || null,
    employee_name:   sale.employee_name || null,
    warehouse_name:  sale.warehouse_name || null,
    journal_name:    sale.journal_name  || sale.journal?.name  || null,
    journal_color:   sale.journal_color || sale.journal?.color || null,
    exchange_rate:        sale.exchange_rate || sale.exchangeRate || 1,
    final_payment_rate:   sale.final_payment_rate || null,
    status:               sale.status || null,
  };
}

// displayCurrency: la moneda no-base (VES). Todos los montos del recibo se convierten a ella.
// sale.total y item.price están siempre en USD base.
function printReceipt(sale, storeName, displayCurrency) {
  const s    = normalizeSale(sale);
  // Pagado: usar tasa del último pago (cuando se cerró la deuda)
  // Pendiente/Parcial: usar tasa histórica de la venta
  const effectiveRate = (s.status === 'pagado' && parseFloat(s.final_payment_rate) > 1)
    ? parseFloat(s.final_payment_rate)
    : parseFloat(s.exchange_rate || 1);
  const rate = parseFloat(effectiveRate || displayCurrency?.exchange_rate || 1);
  const sym  = displayCurrency?.symbol || "Bs.";
  const code = displayCurrency?.code   || "VES";
  const fmtP = n => fmt(parseFloat(n || 0) * rate, sym);
  const dateStr = new Date(s.created_at).toLocaleString("es-VE");

  const itemsRows = s.items.map(i => `
    <tr>
      <td>${i.name}</td>
      <td style="text-align:center">${i.quantity}</td>
      <td style="text-align:right">${fmtP(i.price)}</td>
      <td style="text-align:right">${fmtP(i.subtotal)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Factura ${s.invoice_number || s.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 20px; max-width: 380px; margin: 0 auto; }
    .store-name { font-size: 18px; font-weight: bold; text-align: center; margin-bottom: 4px; }
    .receipt-title { text-align: center; font-size: 13px; letter-spacing: 2px; margin-bottom: 12px; border-bottom: 2px dashed #000; padding-bottom: 10px; }
    .meta { font-size: 11px; margin-bottom: 10px; }
    .meta div { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .customer { background: #f5f5f5; padding: 8px; margin-bottom: 10px; border-radius: 3px; font-size: 11px; }
    .customer .label { font-weight: bold; margin-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    thead tr { border-bottom: 1px solid #000; }
    th { font-size: 10px; padding: 4px 6px; text-align: left; }
    th:nth-child(2) { text-align: center; }
    th:nth-child(3), th:nth-child(4) { text-align: right; }
    td { padding: 4px 6px; font-size: 11px; border-bottom: 1px dashed #ccc; }
    .totals { border-top: 2px solid #000; padding-top: 8px; }
    .totals .row { display: flex; justify-content: space-between; margin-bottom: 3px; font-size: 12px; }
    .totals .row.total { font-weight: bold; font-size: 14px; border-top: 1px solid #000; padding-top: 6px; margin-top: 4px; }
    .totals .row.discount { color: #c00; }
    .payment { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; font-size: 11px; }
    .payment .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
    .footer { text-align: center; margin-top: 16px; font-size: 11px; color: #555; border-top: 1px dashed #000; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="store-name">${storeName}</div>
  <div class="receipt-title">COMPROBANTE DE VENTA</div>

  <div class="meta">
    <div><span>Factura N°:</span><span><b>${s.invoice_number || `#${s.id}`}</b></span></div>
    <div><span>Fecha:</span><span>${dateStr}</span></div>
    ${s.employee_name  ? `<div><span>Vendedor:</span><span>${s.employee_name}</span></div>` : ""}
    ${s.warehouse_name ? `<div><span>Almacén:</span><span>${s.warehouse_name}</span></div>` : ""}
    ${s.journal_name   ? `<div><span>Diario:</span><span>${s.journal_name}</span></div>` : ""}
    <div><span>Moneda:</span><span>${code} · tasa ${rate.toFixed(4)}</span></div>
  </div>

  ${s.customer_name ? `
    <div class="customer">
      <div class="label">CLIENTE</div>
      <div>${s.customer_name}</div>
    </div>
  ` : ""}

  <table>
    <thead>
      <tr>
        <th>Producto</th>
        <th>Cant.</th>
        <th>P.U.</th>
        <th>Total</th>
      </tr>
    </thead>
    <tbody>${itemsRows}</tbody>
  </table>

  <div class="totals">
    ${s.discount > 0 ? `
      <div class="row discount">
        <span>DESCUENTO</span><span>-${fmtP(s.discount)}</span>
      </div>
    ` : ""}
    <div class="row total">
      <span>TOTAL</span><span>${fmtP(s.total)}</span>
    </div>
  </div>

  <div class="payment">
    <div class="row"><span>PAGADO</span><span>${fmtP(s.paid)}</span></div>
    <div class="row"><span>CAMBIO</span><span>${fmtP(s.change)}</span></div>
  </div>

  <div class="footer">¡Gracias por su compra!</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

export default function ReceiptModal({ open, onClose, sale }) {
  const { storeName, baseCurrency, activeCurrencies } = useApp();
  if (!open || !sale) return null;

  const s = normalizeSale(sale);

  // Siempre mostrar en la moneda no-base (VES). Si no hay, fallback a base.
  const displayCurrency = activeCurrencies?.find(c => !c.is_base) || baseCurrency;
  const isBase = !displayCurrency || displayCurrency.is_base;
  // Pagado: tasa del último pago (cuando se cerró la deuda)
  // Pendiente/Parcial: tasa histórica de la venta
  const effectiveRate = (s.status === 'pagado' && parseFloat(s.final_payment_rate) > 1)
    ? parseFloat(s.final_payment_rate)
    : parseFloat(s.exchange_rate || 1);
  const rate = isBase ? 1 : parseFloat(effectiveRate || displayCurrency.exchange_rate || 1);
  const sym    = isBase ? (baseCurrency?.symbol || "$") : (displayCurrency.symbol || "Bs.");

  // Todos los montos vienen en USD base → multiplicar por tasa de display
  const fmtP = n => fmt(parseFloat(n || 0) * rate, sym);
  const dateStr = new Date(s.created_at).toLocaleString("es-VE");
  const invoiceLabel = s.invoice_number || `#${s.id}`;

  return (
    <Modal open={open} onClose={onClose} title={`FACTURA ${invoiceLabel}`} width={500}>
      {/* Encabezado empresa */}
      <div style={{ textAlign:"center", marginBottom:16 }}>
        <div style={{ fontSize:16, fontWeight:"bold", color:"#f0a500", letterSpacing:2 }}>{storeName}</div>
        <div style={{ fontSize:11, color:"#555", letterSpacing:3, marginTop:2 }}>COMPROBANTE DE VENTA</div>
      </div>

      {/* Metadata */}
      <div style={{ background:"#111", borderRadius:4, padding:"10px 14px", marginBottom:14, fontSize:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ color:"#555" }}>Factura N°</span>
          <span style={{ fontWeight:"bold", color:"#f0a500" }}>{invoiceLabel}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ color:"#555" }}>Fecha</span>
          <span>{dateStr}</span>
        </div>
        {s.employee_name && (
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ color:"#555" }}>Vendedor</span>
            <span>{s.employee_name}</span>
          </div>
        )}
        {s.warehouse_name && (
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ color:"#555" }}>Almacén</span>
            <span>{s.warehouse_name}</span>
          </div>
        )}
        {s.journal_name && (
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <span style={{ color:"#555" }}>Diario</span>
            <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
              {s.journal_color && <span style={{ width:8, height:8, borderRadius:"50%", background:s.journal_color, display:"inline-block" }} />}
              {s.journal_name}
            </span>
          </div>
        )}
        {!isBase && (
          <div style={{ display:"flex", justifyContent:"space-between" }}>
            <span style={{ color:"#555" }}>Moneda</span>
            <span style={{ color:"#5dade2" }}>{displayCurrency?.code} · tasa {rate.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* Cliente */}
      {s.customer_name && (
        <div style={{ background:"#0d1f2b", border:"1px solid #2980b9", borderRadius:4, padding:"8px 14px", marginBottom:14, fontSize:12 }}>
          <span style={{ color:"#5dade2", fontSize:11, letterSpacing:1 }}>CLIENTE: </span>
          <span style={{ fontWeight:"bold" }}>{s.customer_name}</span>
        </div>
      )}

      {/* Items */}
      <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:14, fontSize:12 }}>
        <thead>
          <tr style={{ borderBottom:"1px solid #f0a500", color:"#f0a500", fontSize:11 }}>
            <th style={{ textAlign:"left",  padding:"4px 6px" }}>Producto</th>
            <th style={{ textAlign:"center",padding:"4px 6px" }}>Cant.</th>
            <th style={{ textAlign:"right", padding:"4px 6px" }}>P.U.</th>
            <th style={{ textAlign:"right", padding:"4px 6px" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom:"1px dashed #222" }}>
              <td style={{ padding:"5px 6px" }}>{item.name}</td>
              <td style={{ padding:"5px 6px", textAlign:"center", color:"#888" }}>{item.quantity}</td>
              <td style={{ padding:"5px 6px", textAlign:"right", color:"#888" }}>{fmtP(item.price)}</td>
              <td style={{ padding:"5px 6px", textAlign:"right", color:"#f0a500", fontWeight:"bold" }}>{fmtP(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div style={{ borderTop:"1px solid #333", paddingTop:10, marginBottom:14 }}>
        {s.discount > 0 && (
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
            <span style={{ color:"#555" }}>Descuento</span>
            <span style={{ color:"#e74c3c" }}>-{fmtP(s.discount)}</span>
          </div>
        )}
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:15, fontWeight:"bold", borderTop:"1px solid #333", paddingTop:6, marginTop:4 }}>
          <span>TOTAL</span>
          <span style={{ color:"#f0a500" }}>{fmtP(s.total)}</span>
        </div>
      </div>

      {/* Pago */}
      <div style={{ background:"#111", borderRadius:4, padding:"8px 14px", marginBottom:18, fontSize:12 }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ color:"#555" }}>Pagado</span>
          <span style={{ color:"#27ae60" }}>{fmtP(s.paid)}</span>
        </div>
        <div style={{ display:"flex", justifyContent:"space-between" }}>
          <span style={{ color:"#555" }}>Cambio</span>
          <span>{fmtP(s.change)}</span>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign:"center", fontSize:11, color:"#444", marginBottom:16 }}>¡Gracias por su compra!</div>

      {/* Botones */}
      <div style={{ display:"flex", gap:10 }}>
        <button onClick={onClose}
          style={{ flex:1, background:"transparent", border:"1px solid #333", color:"#888", padding:"10px", borderRadius:4, fontFamily:"inherit", cursor:"pointer", fontSize:12 }}>
          CERRAR
        </button>
        <button onClick={() => printReceipt(sale, storeName, displayCurrency)}
          style={{ flex:2, background:"#f0a500", color:"#0f0f0f", border:"none", padding:"10px", borderRadius:4, fontFamily:"inherit", fontWeight:"bold", letterSpacing:2, cursor:"pointer", fontSize:13 }}>
          🖨 IMPRIMIR
        </button>
      </div>
    </Modal>
  );
}
