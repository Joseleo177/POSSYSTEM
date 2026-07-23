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
        total_precise: parseFloat(sale.total_precise ?? sale.total ?? 0),
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
// Helper para calcular precios y subtotals del recibo alineado con el carrito POS
function calcReceiptTotals(s, rate, sym) {
    const isBs = rate > 1;
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

    const items = s.items.map(i => {
        const qty = parseFloat(i.quantity || 1);
        if (isBs) {
            const priceBs = round2((parseFloat(i.price) || 0) * rate);
            const discountBs = round2((parseFloat(i.discount) || 0) * rate);
            const subtotalBs = round2((priceBs - discountBs) * qty);
            return {
                ...i,
                fmtPrice: fmt(priceBs, sym),
                fmtSubtotal: fmt(subtotalBs, sym),
                subtotalBs,
            };
        } else {
            const p = parseFloat(i.price || 0);
            const sub = i.subtotal ?? (p * qty);
            return {
                ...i,
                fmtPrice: fmt(p, sym),
                fmtSubtotal: fmt(sub, sym),
                subtotalBs: sub,
            };
        }
    });

    let subtotalBs = 0;
    let discountBs = isBs ? round2(s.discount * rate) : s.discount;
    let totalBs = 0;

    if (isBs) {
        subtotalBs = items.reduce((acc, i) => acc + i.subtotalBs, 0);
        totalBs = Math.max(0, subtotalBs - discountBs);
    } else {
        subtotalBs = s.total_precise + s.discount;
        totalBs = s.total_precise;
    }

    return {
        items,
        fmtSubtotal: fmt(subtotalBs, sym),
        fmtDiscount: fmt(discountBs, sym),
        fmtTotal: fmt(totalBs, sym),
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
    const totals = calcReceiptTotals(s, rate, sym);
    const dateStr = fmtDate(s.created_at);

    const fmtQty  = q => { const n = parseFloat(q); return n % 1 === 0 ? String(Math.round(n)) : n; };
    const fmtPRow = text => {
        if (printerWidth !== 58) return text;
        const len = String(text).length;
        const size = len >= 14 ? "5.5px" : len >= 12 ? "6px" : len >= 10 ? "6.5px" : "7.5px";
        return `<span style="font-size:${size};white-space:nowrap">${text}</span>`;
    };

    const html = `<!DOCTYPE html>
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
            line-height: 1.3;
            color: #000;
            background: white;
            width: ${printerWidth === 58 ? "44mm" : "72mm"};
            margin: ${printerWidth === 58 ? "0" : "0 auto"};
            padding: ${printerWidth === 58 ? "2mm" : "3mm"};
        }

        .header { text-align: center; margin-bottom: 2mm; border-bottom: 1px dashed #000; padding-bottom: 2mm; }
        .logo { max-height: 12mm; margin-bottom: 1mm; }
        .store-name { font-size: ${printerWidth === 58 ? "10px" : "13px"}; font-weight: 800; text-transform: uppercase; }
        .store-slogan { font-size: ${printerWidth === 58 ? "6.5px" : "8.5px"}; font-style: italic; margin-top: 0.5mm; }
        .store-rif { font-size: ${printerWidth === 58 ? "7.5px" : "9.5px"}; margin-top: 0.5mm; }
        .store-info { font-size: ${printerWidth === 58 ? "7px" : "8.5px"}; color: #333; margin-top: 0.5mm; }

        .doc-header { text-align: center; margin-bottom: 2mm; }
        .doc-title { font-size: ${printerWidth === 58 ? "8.5px" : "10.5px"}; font-weight: 800; text-transform: uppercase; }
        .doc-warning { font-size: ${printerWidth === 58 ? "6.5px" : "8px"}; font-weight: 700; margin-top: 0.5mm; }

        .meta { margin-bottom: 2mm; font-size: ${printerWidth === 58 ? "7.5px" : "9.5px"}; border-bottom: 1px dashed #000; padding-bottom: 2mm; }
        .meta-row { display: flex; justify-content: space-between; }
        .meta-label { font-weight: 400; }
        .meta-value { font-weight: 700; }

        table { width: 100%; border-collapse: collapse; margin-bottom: 2mm; }
        th { text-align: left; border-bottom: 1px solid #000; padding: 1mm 0; font-size: ${printerWidth === 58 ? "7.5px" : "9px"}; }
        td { padding: 1mm 0; font-size: ${printerWidth === 58 ? "7.5px" : "9px"}; vertical-align: top; }
        .item-name { max-width: ${printerWidth === 58 ? "20mm" : "32mm"}; word-break: break-word; font-weight: 600; }
        .td-center { text-align: center; }
        .td-right { text-align: right; }

        .totals { border-top: 1px dashed #000; padding-top: 2mm; margin-bottom: 2mm; }
        .total-row { display: flex; justify-content: space-between; font-size: ${printerWidth === 58 ? "8px" : "10px"}; margin-bottom: 0.5mm; }
        .total-row.big { font-size: ${printerWidth === 58 ? "10px" : "12px"}; font-weight: 800; border-top: 1px solid #000; padding-top: 1mm; margin-top: 1mm; }
        .total-row.discount { color: #000; }

        .footer { text-align: center; font-size: ${printerWidth === 58 ? "7px" : "8.5px"}; border-top: 1px dashed #000; padding-top: 2mm; margin-top: 2mm; }
    </style>
</head>
<body>
    ${companyInfo?.show_header !== false ? `
    <div class="header">
        ${companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
        <div class="store-name">${storeName}</div>
        ${companyInfo?.slogan ? `<div class="store-slogan">"${companyInfo.slogan}"</div>` : ""}
        ${companyInfo?.rif ? `<div class="store-rif">RIF: ${companyInfo.rif}</div>` : ""}
        <div class="store-info">
            ${[companyInfo.address, companyInfo.city].filter(Boolean).join(", ")}
            ${(companyInfo?.phone || companyInfo?.phone2) ? `<br>${[companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" / ")}` : ""}
        </div>
    </div>
    ` : ""}

    <div class="doc-header">
        <div class="doc-title">TICKET DE CAJA</div>
        <div class="doc-warning">*** DOCUMENTO NO FISCAL ***</div>
    </div>

    <div class="meta">
        <div class="meta-row"><span class="meta-label">Recibo:</span><span class="meta-value">${s.invoice_number || `#${s.id}`}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr}</span></div>
        ${s.employee_name ? `<div class="meta-row"><span class="meta-label">Cajero:</span><span class="meta-value">${s.employee_name}</span></div>` : ""}
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
            ${totals.items.map(i => `
                <tr>
                    <td><div class="item-name">${i.name}</div></td>
                    <td class="td-center">${fmtQty(i.quantity)}</td>
                    <td class="td-right">${fmtPRow(i.fmtPrice)}</td>
                    <td class="td-right"><b>${fmtPRow(i.fmtSubtotal)}</b></td>
                </tr>
            `).join("")}
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row"><span>SUBTOTAL</span><span>${totals.fmtSubtotal}</span></div>
        ${s.discount > 0 ? `<div class="total-row discount"><span>DESCUENTO</span><span>-${totals.fmtDiscount}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL</span><span>${totals.fmtTotal}</span></div>
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
    const totals = calcReceiptTotals(s, rate, sym);

    const dateStr = fmtDate(s.created_at);
    const invoiceLabel = s.invoice_number || `#${s.id}`;

    return (
        <Modal open={open} onClose={onClose} title={`FACTURA ${invoiceLabel}`} width={380}>
            {/* Encabezado empresa */}
            <div className="text-center mb-3 pb-3 border-b border-border/10 dark:border-white/5">
                {companyInfo?.show_header !== false && (
                    <>
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
                    </>
                )}
                <div className={`text-[11px] font-black text-content-subtle tracking-wide uppercase ${companyInfo?.show_header !== false ? "mt-2" : ""}`}>Comprobante de Venta</div>
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
            </div>

            {/* Cliente */}
            {(s.customer_name || s.customer_rif) && (
                <div className="bg-surface-2 dark:bg-surface-dark-3 rounded-lg p-3 mb-3">
                    <span className="text-[10px] font-black uppercase text-content-subtle block mb-1">Cliente</span>
                    <span className="text-xs font-bold text-content dark:text-white uppercase block">
                        {[s.customer_rif, s.customer_name].filter(Boolean).join(" - ")}
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
                    {totals.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-dashed border-border dark:border-border-dark">
                            <td className="px-1.5 py-1.5 text-content dark:text-content-dark">{item.name}</td>
                            <td className="px-1.5 py-1.5 text-center text-content-muted dark:text-content-dark-muted">{parseFloat(item.quantity) % 1 === 0 ? Math.round(parseFloat(item.quantity)) : item.quantity}</td>
                            <td className="px-1.5 py-1.5 text-right text-content-muted dark:text-content-dark-muted">{item.fmtPrice}</td>
                            <td className="px-1.5 py-1.5 text-right text-content dark:text-content-dark font-medium">{item.fmtSubtotal}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totales */}
            <div className="border-t border-border/10 dark:border-white/5 pt-2 mb-3">
                <div className="flex justify-between items-center py-0.5 text-xs">
                    <span className="text-content-muted dark:text-content-dark-muted">Subtotal</span>
                    <span className="text-content dark:text-content-dark font-medium">{totals.fmtSubtotal}</span>
                </div>
                {s.discount > 0 && (
                    <div className="flex justify-between items-center py-0.5 text-xs text-danger">
                        <span className="font-medium">Descuento</span>
                        <span className="font-bold">-{totals.fmtDiscount}</span>
                    </div>
                )}
                <div className="flex justify-between items-center py-1.5 border-t border-border/10 dark:border-white/5 mt-1 pt-1.5">
                    <span className="text-content dark:text-content-dark font-black text-xs uppercase tracking-tighter">TOTAL</span>
                    <div className="text-right">
                        <div className="text-content dark:text-white font-black text-sm leading-none">{totals.fmtTotal}</div>
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
