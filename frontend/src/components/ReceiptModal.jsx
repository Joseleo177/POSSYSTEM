import Modal from "./ui/Modal";
import { useApp } from "../context/AppContext";
import { fmtMoney, fmtDate, resolveImageUrl } from "../helpers";

const fmt = fmtMoney;

// Normaliza el objeto sale ya sea de ContabilidadPage (getAll) o de CobroPage (checkout)
function normalizeSale(sale) {
    return {
        id: sale.id,
        invoice_number: sale.invoice_number || null,
        total: parseFloat(sale.total || 0),
        paid: parseFloat(sale.paid || 0),
        change: parseFloat(sale.change || 0),
        discount: parseFloat(sale.discount_amount || sale.discount || 0),
        created_at: sale.created_at,
        items: (sale.items || []).map(i => ({
            ...i,
            subtotal: i.subtotal ?? parseFloat(i.price || 0) * parseFloat(i.quantity || 1),
        })),
        customer_name: sale.customer_name || sale.customerName || null,
        customer_rif: sale.customer_rif || sale.customerRif || null,
        employee_name: sale.employee_name || null,
        warehouse_name: sale.warehouse_name || null,
        journal_name: sale.journal_name || sale.journal?.name || null,
        journal_color: sale.journal_color || sale.journal?.color || null,
        exchange_rate: sale.exchange_rate || sale.exchangeRate || 1,
        final_payment_rate: sale.final_payment_rate || null,
        status: sale.status || null,
    };
}

// displayCurrency: la moneda no-base (VES). Todos los montos del recibo se convierten a ella.
// sale.total y item.price están siempre en USD base.
function printReceipt(sale, companyInfo, displayCurrency, printerWidth = 80) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const s = normalizeSale(sale);
    // Pagado: usar tasa del último pago (cuando se cerró la deuda)
    // Pendiente/Parcial: usar tasa histórica de la venta
    const effectiveRate = (s.status === 'pagado' && parseFloat(s.final_payment_rate) > 1)
        ? parseFloat(s.final_payment_rate)
        : parseFloat(s.exchange_rate || 1);
    const rate = (effectiveRate > 1) ? effectiveRate : parseFloat(displayCurrency?.exchange_rate || 1);
    const sym = displayCurrency?.symbol || "Ref.";
    const code = displayCurrency?.code || "VES";
    const fmtP = n => fmt(parseFloat(n || 0) * rate, sym);
    const dateStr = fmtDate(s.created_at);

    const fmtQty = q => { const n = parseFloat(q); return n % 1 === 0 ? String(Math.round(n)) : n; }; const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Factura ${s.invoice_number || s.id}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');

        @page {
            size: ${printerWidth === 58 ? "58mm" : "80mm"} auto;
            margin: 0;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            font-size: ${printerWidth === 58 ? "8px" : "11px"};
            line-height: 1.3;
            color: #000;
            background: white;
            width: ${printerWidth === 58 ? "44mm" : "72mm"};
            margin: ${printerWidth === 58 ? "0" : "0 auto"};
            padding: ${printerWidth === 58 ? "2mm" : "3mm"};
        }

        .header { display: flex; align-items: flex-start; gap: ${printerWidth === 58 ? "4px" : "8px"}; margin-bottom: ${printerWidth === 58 ? "6px" : "10px"}; border-bottom: 2px solid #000; padding-bottom: ${printerWidth === 58 ? "5px" : "8px"}; }
        .logo { max-height: ${printerWidth === 58 ? "35px" : "50px"}; max-width: ${printerWidth === 58 ? "55px" : "80px"}; object-fit: contain; }
        .header-content { flex: 1; text-align: left; min-width: 0; }
        .store-name { font-size: ${printerWidth === 58 ? "10px" : "14px"}; font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .store-rif { font-size: ${printerWidth === 58 ? "7.5px" : "10px"}; font-weight: 700; color: #000; margin-bottom: 1px; }
        .store-slogan { font-size: ${printerWidth === 58 ? "7px" : "9px"}; font-weight: 700; font-style: italic; color: #000; margin-bottom: 2px; }
        .store-info { font-size: ${printerWidth === 58 ? "7px" : "9px"}; color: #000; line-height: 1.2; font-weight: 500; }

        .doc-header { text-align: center; margin: ${printerWidth === 58 ? "5px" : "8px"} 0; }
        .doc-title { font-size: ${printerWidth === 58 ? "10px" : "13px"}; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .doc-warning { font-size: ${printerWidth === 58 ? "7px" : "9px"}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }

        .meta { margin-bottom: ${printerWidth === 58 ? "5px" : "8px"}; font-size: ${printerWidth === 58 ? "8px" : "10.5px"}; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { color: #000; font-weight: 600; }
        .meta-value { font-weight: 700; text-align: right; }

        table { width: 100%; border-collapse: collapse; margin-bottom: ${printerWidth === 58 ? "5px" : "8px"}; }
        th {
            font-size: ${printerWidth === 58 ? "7px" : "9px"};
            font-weight: 800;
            text-transform: uppercase;
            padding: ${printerWidth === 58 ? "4px 2px" : "6px 4px"};
            text-align: left;
            border-bottom: 1.5px solid #000;
        }
        th:nth-child(1) { width: ${printerWidth === 58 ? "36%" : "45%"}; }
        th:nth-child(2) { width: ${printerWidth === 58 ? "9%"  : "10%"}; text-align: center; }
        th:nth-child(3) { width: ${printerWidth === 58 ? "27%" : "22%"}; text-align: right; }
        th:nth-child(4) { width: ${printerWidth === 58 ? "28%" : "23%"}; text-align: right; }

        td {
            padding: ${printerWidth === 58 ? "3px 1px" : "5px 4px"};
            font-size: ${printerWidth === 58 ? "8px" : "10px"};
            vertical-align: top;
            border-bottom: 0.5px dashed #eee;
        }
        td:nth-child(2) { text-align: center; white-space: nowrap; }
        td:nth-child(3), td:nth-child(4) { text-align: right; white-space: nowrap; font-size: ${printerWidth === 58 ? "7px" : "10px"}; }
        .item-name { font-weight: 600; line-height: 1.2; }
        .td-center { text-align: center; }
        .td-right { text-align: right; }

        .totals { border-top: 1.5px solid #000; padding-top: ${printerWidth === 58 ? "4px" : "6px"}; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: ${printerWidth === 58 ? "8px" : "11px"}; }
        .total-row.big { font-weight: 800; font-size: ${printerWidth === 58 ? "11px" : "14px"}; margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee; }
        .total-row.discount { color: #000; font-style: italic; }

        .footer {
            text-align: center;
            margin-top: ${printerWidth === 58 ? "8px" : "15px"};
            font-size: ${printerWidth === 58 ? "7px" : "9px"};
            color: #333;
            font-weight: 500;
            border-top: 1px dashed #ccc;
            padding-top: ${printerWidth === 58 ? "5px" : "8px"};
        }
    </style>
</head>
<body>
    <div class="header">
        ${companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
        <div class="header-content">
            <div class="store-name">${storeName}</div>
            ${companyInfo?.slogan ? `<div class="store-slogan">"${companyInfo.slogan}"</div>` : ""}
            ${companyInfo?.rif ? `<div class="store-rif">RIF: ${companyInfo.rif}</div>` : ""}
            <div class="store-info">
                ${companyInfo?.address ? `<div>${companyInfo.address}</div>` : ""}
                ${companyInfo?.city ? `<span>${companyInfo.city}</span>` : ""}
                ${(companyInfo?.phone || companyInfo?.phone2) ? `<span> | ${[companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" / ")}</span>` : ""}
            </div>
        </div>
    </div>

    <div class="doc-header">
        <div class="doc-title">TICKET DE CAJA</div>
        <div class="doc-warning">*** DOCUMENTO NO FISCAL ***</div>
    </div>

    <div class="meta">
        <div class="meta-row"><span class="meta-label">Recibo Nº:</span><span class="meta-value">${s.invoice_number || `#${s.id}`}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha Emisión:</span><span class="meta-value">${dateStr}</span></div>
        ${s.employee_name ? `<div class="meta-row"><span class="meta-label">Cajero:</span><span class="meta-value">${s.employee_name}</span></div>` : ""}
        ${s.journal_name ? `<div class="meta-row"><span class="meta-label">Método/Pago:</span><span class="meta-value">${s.journal_name}</span></div>` : ""}
        ${s.customer_rif ? `<div class="meta-row"><span class="meta-label">CI/RIF:</span><span class="meta-value">${s.customer_rif}</span></div>` : ""}
        ${s.customer_name ? `<div class="meta-row"><span class="meta-label">Cliente:</span><span class="meta-value">${s.customer_name}</span></div>` : ""}
    </div>

    <table>
        <thead>
            <tr>
                <th>Producto</th>
                <th>Cant</th>
                <th>P.U.</th>
                <th>Total</th>
            </tr>
        </thead>
        <tbody>
            ${s.items.map(i => `
                <tr>
                    <td><div class="item-name">${i.name}</div></td>
                    <td class="td-center">${fmtQty(i.quantity)}</td>
                    <td class="td-right">${fmtP(i.price)}</td>
                    <td class="td-right"><b>${fmtP(i.subtotal)}</b></td>
                </tr>
            `).join("")}
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row"><span>SUBTOTAL</span><span>${fmtP(s.total + s.discount)}</span></div>
        ${s.discount > 0 ? `<div class="total-row discount"><span>DESCUENTO</span><span>-${fmtP(s.discount)}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL</span><span>${fmtP(s.total)}</span></div>
        ${effectiveRate > 1 ? `
            <div class="total-row" style="margin-top:2px; font-weight:600; font-size:9px; opacity:0.7; justify-content: flex-end; gap: 4px;">
                <span>EQUIV. REF.:</span><span>${fmt(s.total)}</span>
            </div>
        ` : ""}
    </div>

    <div class="footer">${companyInfo?.footer || "¡Gracias por su compra!<br>Vuelva pronto"}</div>
</body>
</html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:300px;height:1200px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 2000);
    };
}

export default function ReceiptModal({ open, onClose, sale }) {
    const { storeName, companyInfo, baseCurrency, activeCurrencies, printerWidth } = useApp();
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
    const sym = isBase ? (baseCurrency?.symbol || "Ref.") : (displayCurrency.symbol || "Ref.");

    // Todos los montos vienen en USD base → multiplicar por tasa de display
    const fmtP = n => fmt(parseFloat(n || 0) * rate, sym);
    const dateStr = fmtDate(s.created_at);
    const invoiceLabel = s.invoice_number || `#${s.id}`;

    return (
        <Modal open={open} onClose={onClose} title={`FACTURA ${invoiceLabel}`} width={380}>
            {/* Encabezado empresa */}
            <div className="text-center mb-3 pb-3 border-b border-border/10 dark:border-white/5">
                {companyInfo?.logo_url && (
                    <img src={resolveImageUrl(companyInfo.logo_url)} alt="logo" className="mx-auto mb-2 max-h-16 w-auto object-contain" />
                )}
                <div className="text-sm font-black text-content dark:text-content-dark tracking-wide">{storeName}</div>
                {companyInfo?.rif && <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-0.5">RIF: {companyInfo.rif}</div>}
                {companyInfo?.slogan && <div className="text-[11px] italic text-content-subtle mt-0.5">{companyInfo.slogan}</div>}
                {companyInfo?.address && <div className="text-[11px] text-content-muted dark:text-content-dark-muted mt-1">{companyInfo.address}</div>}
                {(companyInfo?.city || companyInfo?.phone) && (
                    <div className="text-[11px] text-content-muted dark:text-content-dark-muted">
                        {[companyInfo.city, companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" · ")}
                    </div>
                )}
                {companyInfo?.email && <div className="text-[11px] text-content-subtle">{companyInfo.email}</div>}
                <div className="text-[11px] font-black text-content-subtle tracking-wide mt-2 uppercase">Comprobante de Venta</div>
            </div>

            {/* Metadata */}
            <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-lg p-3 mb-3 space-y-1">
                <div className="flex justify-between items-center py-1 text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted">Factura N°</span>
                    <span className="text-content dark:text-content-dark font-black tracking-tight">{invoiceLabel}</span>
                </div>
                <div className="flex justify-between items-center py-1 text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted">Fecha</span>
                    <span className="text-content dark:text-content-dark font-medium">{dateStr}</span>
                </div>
                {s.employee_name && (
                    <div className="flex justify-between items-center py-1 text-xs">
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
                <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-lg px-3 py-2 mb-3 text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted text-[10px] font-black uppercase tracking-wider block mb-0.5">CLIENTE</span>
                    <span className="text-content dark:text-content-dark font-bold leading-none">
                        {s.customer_rif ? s.customer_rif + " - " : ""}{s.customer_name}
                    </span>
                </div>
            )}

            {/* Items */}
            <table className="w-full border-collapse mb-3 text-xs">
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
                            <td className="px-1.5 py-1.5 text-center text-content-muted dark:text-content-dark-muted">{parseFloat(item.quantity) % 1 === 0 ? Math.round(parseFloat(item.quantity)) : item.quantity}</td>
                            <td className="px-1.5 py-1.5 text-right text-content-muted dark:text-content-dark-muted">{fmtP(item.price)}</td>
                            <td className="px-1.5 py-1.5 text-right text-content dark:text-content-dark font-medium">{fmtP(item.subtotal)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totales */}
            <div className="border-t border-border/10 dark:border-white/5 pt-2 mb-3">
                <div className="flex justify-between items-center py-0.5 text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted">Subtotal</span>
                    <span className="text-content dark:text-content-dark font-medium">{fmtP(s.total + s.discount)}</span>
                </div>
                {s.discount > 0 && (
                    <div className="flex justify-between items-center py-0.5 text-xs text-danger">
                        <span className="font-medium">Descuento</span>
                        <span className="font-bold">-{fmtP(s.discount)}</span>
                    </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-t border-border/10 dark:border-white/5 mt-1 pt-1.5">
                    <span className="text-content dark:text-content-dark font-black text-xs uppercase tracking-tighter">TOTAL</span>
                    <div className="text-right">
                        <div className="text-content dark:text-white font-black text-sm leading-none">{fmtP(s.total)}</div>
                        {!isBase && (
                            <div className="text-[10px] font-bold text-content-subtle dark:text-brand-500/60 mt-1">
                                EQUIV. {fmt(s.total)}
                            </div>
                        )}
                    </div>
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
                    onClick={() => printReceipt(sale, companyInfo, displayCurrency, printerWidth)}
                    className="btn-md btn-primary w-full"
                    style={{ flex: 2 }}
                >
                    🖨 IMPRIMIR
                </button>
            </div>
        </Modal>
    );
}
