import { fmtMoney, fmtDate, resolveImageUrl } from ".";

// printerWidth (58 u 80 mm) sale de la configuración de la tienda. Sin él el documento se
// maquetaba siempre a 80mm y en una impresora de 58 salía cortado por el lado derecho.
export function printNotaCreditoDoc(returnData, sale, companyInfo, baseCurrency, activeCurrencies, printerWidth = 80) {
    const w58 = printerWidth === 58;
    const displayCurrency = activeCurrencies?.find(c => !c.is_base) || baseCurrency;
    const isBase = !displayCurrency || displayCurrency.is_base;
    const exchangeRate = parseFloat(sale?.exchange_rate || 1);
    const rate = isBase ? 1 : parseFloat(exchangeRate > 1 ? exchangeRate : (displayCurrency?.exchange_rate || 1));
    const sym = isBase ? (baseCurrency?.symbol || "Ref.") : (displayCurrency?.symbol || "Ref.");
    const fmtP = n => fmtMoney(parseFloat(n || 0) * rate, sym);

    const storeName = companyInfo?.name || "MI TIENDA POS";
    const dateStr = fmtDate(returnData.created_at || new Date().toISOString());
    const invoiceRef = sale?.invoice_number || `#${sale?.id}`;
    const total = parseFloat(returnData.total || 0);
    const ncLabel = returnData.nc_number || `NC-${returnData.return_id}`;

    const itemsRows = (returnData.items || []).map(i => `
        <tr>
            <td><div class="item-name">${i.name}</div></td>
            <td class="td-center">${i.qty}</td>
            <td class="td-right">${fmtP(i.price)}</td>
            <td class="td-right"><b>${fmtP(i.subtotal)}</b></td>
        </tr>
    `).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Nota de Crédito ${ncLabel}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        @page { size: ${w58 ? "58mm" : "80mm"} auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            font-size: ${w58 ? "8px" : "11px"};
            line-height: 1.2;
            color: #000;
            background: white;
            width: ${w58 ? "216px" : "302px"};
            margin: 0 auto;
            padding: ${w58 ? "6px" : "10px"};
        }
        .header { display: flex; align-items: flex-start; gap: ${w58 ? "4px" : "8px"}; margin-bottom: ${w58 ? "6px" : "10px"}; border-bottom: 2px solid #000; padding-bottom: ${w58 ? "5px" : "8px"}; }
        .logo { max-height: ${w58 ? "35px" : "50px"}; max-width: ${w58 ? "55px" : "80px"}; object-fit: contain; }
        .header-content { flex: 1; }
        .store-name { font-size: ${w58 ? "10px" : "14px"}; font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .store-rif { font-size: ${w58 ? "7.5px" : "10px"}; font-weight: 700; margin-bottom: 1px; }
        .store-slogan { font-size: ${w58 ? "7px" : "9px"}; font-weight: 700; font-style: italic; margin-bottom: 2px; }
        .store-info { font-size: ${w58 ? "7px" : "9px"}; line-height: 1.2; font-weight: 600; }
        .doc-header { text-align: center; margin: ${w58 ? "5px 0" : "8px 0"}; }
        .doc-title { font-size: ${w58 ? "11px" : "15px"}; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .doc-subtitle { font-size: ${w58 ? "7px" : "9px"}; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
        .meta { margin-bottom: ${w58 ? "5px" : "8px"}; font-size: ${w58 ? "7.5px" : "10.5px"}; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { color: #000; font-weight: 600; }
        .meta-value { font-weight: 700; text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-bottom: ${w58 ? "5px" : "8px"}; }
        th { font-size: ${w58 ? "7px" : "9px"}; font-weight: 800; text-transform: uppercase; padding: ${w58 ? "4px 2px" : "6px 4px"}; text-align: left; border-bottom: 1.5px solid #000; }
        th:nth-child(2) { text-align: center; }
        th:nth-child(3), th:nth-child(4) { text-align: right; }
        td { padding: ${w58 ? "3px 2px" : "5px 4px"}; font-size: ${w58 ? "8px" : "10px"}; vertical-align: top; border-bottom: 0.5px dashed #000; }
        .item-name { font-weight: 600; line-height: 1.2; }
        .td-center { text-align: center; white-space: nowrap; }
        .td-right { text-align: right; white-space: nowrap; }
        .totals { border-top: 1.5px solid #000; padding-top: ${w58 ? "4px" : "6px"}; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: ${w58 ? "8px" : "11px"}; }
        .total-row.big { font-weight: 800; font-size: ${w58 ? "10px" : "14px"}; margin-top: 4px; padding-top: 4px; border-top: 1px solid #000; }
        .reason-box { margin-top: ${w58 ? "5px" : "8px"}; border-top: 1px dashed #000; padding-top: ${w58 ? "4px" : "6px"}; font-size: ${w58 ? "7px" : "9px"}; color: #000; }
        .footer { text-align: center; margin-top: ${w58 ? "10px" : "15px"}; font-size: ${w58 ? "7px" : "9px"}; color: #000; font-weight: 600; border-top: 1px dashed #000; padding-top: ${w58 ? "5px" : "8px"}; }
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
        <div class="doc-title">NOTA DE CRÉDITO</div>
        <div class="doc-subtitle">*** DOCUMENTO NO FISCAL ***</div>
    </div>

    <div class="meta">
        <div class="meta-row"><span class="meta-label">N/C Nº:</span><span class="meta-value">${ncLabel}</span></div>
        <div class="meta-row"><span class="meta-label">Ref. Factura:</span><span class="meta-value">${invoiceRef}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr}</span></div>
        ${sale?.customer_rif ? `<div class="meta-row"><span class="meta-label">CI/RIF:</span><span class="meta-value">${sale.customer_rif}</span></div>` : ""}
        ${sale?.customer_name ? `<div class="meta-row"><span class="meta-label">Cliente:</span><span class="meta-value">${sale.customer_name}</span></div>` : ""}
    </div>

    <table>
        <thead>
            <tr><th>Producto</th><th>Cant</th><th>P.U.</th><th>Total</th></tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>

    <div class="totals">
        <div class="total-row big"><span>TOTAL ACREDITADO</span><span>${fmtP(total)}</span></div>
    </div>

    ${returnData.reason ? `<div class="reason-box"><b>Motivo:</b> ${returnData.reason}</div>` : ""}

    <div class="footer">${companyInfo?.footer || "Este documento certifica el crédito a favor del cliente."}</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}
