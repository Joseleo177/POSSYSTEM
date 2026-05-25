import { fmtMoney, fmtDate, resolveImageUrl } from ".";

export function printQuotationDoc(quot, companyInfo, baseCurrency, activeCurrencies) {
    const displayCurrency = activeCurrencies?.find(c => !c.is_base) || baseCurrency;
    const isBase = !displayCurrency || displayCurrency.is_base;
    const rate = isBase ? 1 : parseFloat(
        parseFloat(quot.exchange_rate) > 1 ? quot.exchange_rate : (displayCurrency?.exchange_rate || 1)
    );
    const sym = isBase ? (baseCurrency?.symbol || "Ref.") : (displayCurrency?.symbol || "Ref.");
    const fmtP = n => fmtMoney(parseFloat(n || 0) * rate, sym);
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const dateStr = fmtDate(quot.created_at);

    const itemsRows = (quot.items || []).map(i => `
        <tr>
            <td><div class="item-name">${i.product_name}</div></td>
            <td class="td-center">${i.quantity}</td>
            <td class="td-right">${fmtP(i.price)}</td>
            <td class="td-right"><b>${fmtP(i.subtotal)}</b></td>
        </tr>
    `).join("");

    const total = parseFloat(quot.total || 0);
    const discount = parseFloat(quot.discount_amount || 0);
    const subtotalBeforeDiscount = total + discount;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Cotización #${quot.id}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            font-size: 11px;
            line-height: 1.2;
            color: #000;
            background: white;
            width: 302px;
            margin: 0 auto;
            padding: 10px;
        }
        .header { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }
        .logo { max-height: 50px; max-width: 80px; object-fit: contain; }
        .header-content { flex: 1; text-align: left; }
        .store-name { font-size: 14px; font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .store-rif { font-size: 10px; font-weight: 700; margin-bottom: 1px; }
        .store-slogan { font-size: 9px; font-weight: 700; font-style: italic; margin-bottom: 2px; }
        .store-info { font-size: 9px; line-height: 1.2; font-weight: 500; }
        .doc-header { text-align: center; margin: 8px 0; }
        .doc-title { font-size: 13px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .doc-warning { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 1px; }
        .meta { margin-bottom: 8px; font-size: 10.5px; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { color: #555; font-weight: 500; }
        .meta-value { font-weight: 700; text-align: right; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th { font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 6px 4px; text-align: left; border-bottom: 1.5px solid #000; }
        th:nth-child(2) { text-align: center; }
        th:nth-child(3), th:nth-child(4) { text-align: right; }
        td { padding: 5px 4px; font-size: 10px; vertical-align: top; border-bottom: 0.5px dashed #eee; }
        .item-name { font-weight: 600; line-height: 1.2; }
        .td-center { text-align: center; }
        .td-right { text-align: right; }
        .totals { border-top: 1.5px solid #000; padding-top: 6px; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11px; }
        .total-row.big { font-weight: 800; font-size: 14px; margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee; }
        .total-row.discount { font-style: italic; }
        .footer { text-align: center; margin-top: 15px; font-size: 9px; color: #333; font-weight: 500; border-top: 1px dashed #ccc; padding-top: 8px; }
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
        <div class="doc-title">COTIZACIÓN</div>
        <div class="doc-warning">*** DOCUMENTO NO FISCAL / PRESUPUESTO ***</div>
    </div>
    <div class="meta">
        <div class="meta-row"><span class="meta-label">Cotización Nº:</span><span class="meta-value">#${quot.id}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${dateStr}</span></div>
        ${quot.customer_rif ? `<div class="meta-row"><span class="meta-label">CI/RIF:</span><span class="meta-value">${quot.customer_rif}</span></div>` : ""}
        ${quot.customer_name ? `<div class="meta-row"><span class="meta-label">Cliente:</span><span class="meta-value">${quot.customer_name}</span></div>` : ""}
    </div>
    <table>
        <thead>
            <tr><th>Producto</th><th>Cant</th><th>P.U.</th><th>Total</th></tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>
    <div class="totals">
        ${discount > 0 ? `<div class="total-row"><span>SUBTOTAL</span><span>${fmtP(subtotalBeforeDiscount)}</span></div>` : ""}
        ${discount > 0 ? `<div class="total-row discount"><span>DESCUENTO</span><span>-${fmtP(discount)}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL</span><span>${fmtP(total)}</span></div>
        ${rate > 1 ? `<div class="total-row" style="margin-top:2px;font-weight:600;font-size:9px;opacity:0.7;justify-content:flex-end;gap:4px;"><span>EQUIV. REF.:</span><span>${fmtMoney(total)}</span></div>` : ""}
    </div>
    <div class="footer">${companyInfo?.footer || "Cotización válida por 30 días · ¡Gracias por su preferencia!"}</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}
