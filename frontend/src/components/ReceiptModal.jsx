import Modal from "./Modal";
import { useApp } from "../context/AppContext";
import { fmtMoney, fmtDate } from "../helpers";

const fmt = fmtMoney;

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
    customer_rif:    sale.customer_rif || sale.customerRif || null,
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
function printReceipt(sale, companyInfo, displayCurrency) {
  const storeName = companyInfo?.name || "MI TIENDA POS";
  const s    = normalizeSale(sale);
  // Pagado: usar tasa del último pago (cuando se cerró la deuda)
  // Pendiente/Parcial: usar tasa histórica de la venta
  const effectiveRate = (s.status === 'pagado' && parseFloat(s.final_payment_rate) > 1)
    ? parseFloat(s.final_payment_rate)
    : parseFloat(s.exchange_rate || 1);
  const rate = (effectiveRate > 1) ? effectiveRate : parseFloat(displayCurrency?.exchange_rate || 1);
  const sym  = displayCurrency?.symbol || "$";
  const code = displayCurrency?.code   || "VES";
  const fmtP = n => fmt(parseFloat(n || 0) * rate, sym);
  const dateStr = fmtDate(s.created_at);

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
  ${companyInfo?.logo_url ? `<div style="text-align:center;margin-bottom:8px"><img src="${companyInfo.logo_url}" style="max-height:60px;max-width:200px;object-fit:contain" /></div>` : ""}
  <div class="store-name">${storeName}</div>
  ${companyInfo?.rif     ? `<div style="text-align:center;font-size:11px;margin-bottom:2px">RIF: ${companyInfo.rif}</div>` : ""}
  ${companyInfo?.slogan  ? `<div style="text-align:center;font-size:10px;font-style:italic;color:#555;margin-bottom:4px">${companyInfo.slogan}</div>` : ""}
  ${companyInfo?.address ? `<div style="text-align:center;font-size:10px;color:#555">${companyInfo.address}</div>` : ""}
  ${companyInfo?.city    ? `<div style="text-align:center;font-size:10px;color:#555">${companyInfo.city}</div>` : ""}
  ${(companyInfo?.phone || companyInfo?.phone2) ? `<div style="text-align:center;font-size:10px;color:#555">${[companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" / ")}</div>` : ""}
  ${companyInfo?.email   ? `<div style="text-align:center;font-size:10px;color:#555;margin-bottom:2px">${companyInfo.email}</div>` : ""}
  <div class="receipt-title">COMPROBANTE DE VENTA</div>

  <div class="meta">
    <div><span>Factura N°:</span><span><b>${s.invoice_number || `#${s.id}`}</b></span></div>
    <div><span>Fecha:</span><span>${dateStr}</span></div>
    ${s.employee_name  ? `<div><span>Vendedor:</span><span>${s.employee_name}</span></div>` : ""}
    ${s.journal_name   ? `<div><span>Diario:</span><span>${s.journal_name}</span></div>` : ""}
  </div>

  ${s.customer_name ? `
    <div class="customer">
      <div class="label">CLIENTE</div>
      <div>${s.customer_rif ? s.customer_rif + " - " : ""}${s.customer_name}</div>
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



  <div class="footer">${companyInfo?.footer || "¡Gracias por su compra!"}</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

export default function ReceiptModal({ open, onClose, sale }) {
  const { storeName, companyInfo, baseCurrency, activeCurrencies } = useApp();
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
  const rate = isBase ? 1 : parseFloat(effectiveRate > 1 ? effectiveRate : (displayCurrency.exchange_rate || 1));
  const sym    = isBase ? (baseCurrency?.symbol || "$") : (displayCurrency.symbol || "$");

  // Todos los montos vienen en USD base → multiplicar por tasa de display
  const fmtP = n => fmt(parseFloat(n || 0) * rate, sym);
  const dateStr = fmtDate(s.created_at);
  const invoiceLabel = s.invoice_number || `#${s.id}`;

  return (
    <Modal open={open} onClose={onClose} title={`FACTURA ${invoiceLabel}`} width={500}>
      {/* Encabezado empresa */}
      <div className="text-center mb-4 pb-4 border-b border-border/20 dark:border-white/10">
        {companyInfo?.logo_url && (
          <img src={companyInfo.logo_url} alt="logo" className="h-12 mx-auto mb-2 object-contain" />
        )}
        <div className="text-base font-black text-content dark:text-content-dark tracking-wide">{storeName}</div>
        {companyInfo?.rif    && <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">RIF: {companyInfo.rif}</div>}
        {companyInfo?.slogan && <div className="text-[10px] italic text-content-subtle mt-0.5">{companyInfo.slogan}</div>}
        {companyInfo?.address && <div className="text-[10px] text-content-muted dark:text-content-dark-muted mt-1">{companyInfo.address}</div>}
        {(companyInfo?.city || companyInfo?.phone) && (
          <div className="text-[10px] text-content-muted dark:text-content-dark-muted">
            {[companyInfo.city, companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" · ")}
          </div>
        )}
        {companyInfo?.email && <div className="text-[10px] text-content-subtle">{companyInfo.email}</div>}
        <div className="text-[10px] font-black text-content-subtle tracking-[0.2em] mt-2 uppercase">Comprobante de Venta</div>
      </div>

      {/* Metadata */}
      <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-lg p-4 mb-4 space-y-2">
        <div className="flex justify-between items-center py-1.5 text-sm">
          <span className="text-content-muted dark:text-content-dark-muted">Factura N°</span>
          <span className="text-content dark:text-content-dark font-medium">{invoiceLabel}</span>
        </div>
        <div className="flex justify-between items-center py-1.5 text-sm">
          <span className="text-content-muted dark:text-content-dark-muted">Fecha</span>
          <span className="text-content dark:text-content-dark font-medium">{dateStr}</span>
        </div>
        {s.employee_name && (
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-content-muted dark:text-content-dark-muted">Vendedor</span>
            <span className="text-content dark:text-content-dark font-medium">{s.employee_name}</span>
          </div>
        )}
        {s.journal_name && (
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-content-muted dark:text-content-dark-muted">Diario</span>
            <span className="text-content dark:text-content-dark font-medium inline-flex items-center gap-1.5">
              {s.journal_color && (
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: s.journal_color }}
                />
              )}
              {s.journal_name}
            </span>
          </div>
        )}
      </div>

      {/* Cliente */}
      {s.customer_name && (
        <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-lg px-4 py-2.5 mb-4 text-sm">
          <span className="text-content-muted dark:text-content-dark-muted text-xs tracking-wider">CLIENTE: </span>
          <span className="text-content dark:text-content-dark font-medium">
            {s.customer_rif ? s.customer_rif + " - " : ""}{s.customer_name}
          </span>
        </div>
      )}

      {/* Items */}
      <table className="w-full border-collapse mb-4 text-sm">
        <thead>
          <tr className="border-b border-border dark:border-border-dark text-content-muted dark:text-content-dark-muted text-xs">
            <th className="text-left px-1.5 py-1">Producto</th>
            <th className="text-center px-1.5 py-1">Cant.</th>
            <th className="text-right px-1.5 py-1">P.U.</th>
            <th className="text-right px-1.5 py-1">Total</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((item, idx) => (
            <tr key={idx} className="border-b border-dashed border-border dark:border-border-dark">
              <td className="px-1.5 py-1.5 text-content dark:text-content-dark">{item.name}</td>
              <td className="px-1.5 py-1.5 text-center text-content-muted dark:text-content-dark-muted">{item.quantity}</td>
              <td className="px-1.5 py-1.5 text-right text-content-muted dark:text-content-dark-muted">{fmtP(item.price)}</td>
              <td className="px-1.5 py-1.5 text-right text-content dark:text-content-dark font-medium">{fmtP(item.subtotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totales */}
      <div className="border-t border-border dark:border-border-dark pt-2.5 mb-4">
        {s.discount > 0 && (
          <div className="flex justify-between items-center py-1.5 text-sm">
            <span className="text-content-muted dark:text-content-dark-muted">Descuento</span>
            <span className="text-danger font-medium">-{fmtP(s.discount)}</span>
          </div>
        )}
        <div className="flex justify-between items-center py-1.5 border-t border-border dark:border-border-dark mt-1 pt-1.5">
          <span className="text-content dark:text-content-dark font-semibold text-base">TOTAL</span>
          <span className="text-content dark:text-content-dark font-bold text-base">{fmtP(s.total)}</span>
        </div>
      </div>



      {/* Footer */}
      <div className="text-center text-xs text-content-muted dark:text-content-dark-muted mb-4">¡Gracias por su compra!</div>

      {/* Botones */}
      <div className="flex gap-2.5">
        <button onClick={onClose} className="btn-md btn-secondary w-full">
          CERRAR
        </button>
        <button
          onClick={() => printReceipt(sale, companyInfo, displayCurrency)}
          className="btn-md btn-primary w-full"
          style={{ flex: 2 }}
        >
          🖨 IMPRIMIR
        </button>
      </div>
    </Modal>
  );
}
