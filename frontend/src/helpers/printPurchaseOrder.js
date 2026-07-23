import { resolveImageUrl } from ".";

const fmtDate = d => d ? new Date(d).toLocaleString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export function printPurchaseOrderDoc(detail, items, companyInfo) {
    const isBorrador = detail.status === "borrador";
    const title   = isBorrador ? "LISTA DE PEDIDO" : "ORDEN DE COMPRA";
    const subTitle = isBorrador ? "DOCUMENTO INTERNO · NO FISCAL" : "DOCUMENTO INTERNO · NO FISCAL";
    const storeName = companyInfo?.name || "MI TIENDA POS";

    const itemsRows = items.map((i, idx) => {
        const empaque = i.package_unit?.toLowerCase() === "unidad"
            ? "UNIDAD"
            : `${i.package_unit || ""} × ${i.package_size || "1"}`;
        return `
        <tr>
            <td class="td-num">${idx + 1}</td>
            <td><div class="item-name">${i.product_name || i.product?.name || ""}</div><div class="item-pkg">${empaque}</div></td>
            <td class="td-center"><b>${i.package_qty}</b></td>
            <td class="td-check"></td>
        </tr>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            font-size: 11px;
            line-height: 1.3;
            color: #000;
            background: white;
            width: 302px;
            margin: 0 auto;
            padding: 10px;
        }
        .header { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 10px; border-bottom: 2px solid #000; padding-bottom: 8px; }
        .logo { max-height: 50px; max-width: 80px; object-fit: contain; }
        .header-content { flex: 1; }
        .store-name { font-size: 14px; font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 2px; }
        .store-rif  { font-size: 10px; font-weight: 700; margin-bottom: 1px; }
        .store-info { font-size: 9px; line-height: 1.2; font-weight: 500; }
        .doc-header { text-align: center; margin: 8px 0; }
        .doc-title  { font-size: 14px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }
        .doc-sub    { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; opacity: 0.6; }
        .meta { margin-bottom: 8px; font-size: 10.5px; }
        .meta-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
        .meta-label { color: #555; font-weight: 500; }
        .meta-value { font-weight: 700; text-align: right; max-width: 60%; }
        .notes { margin-bottom: 8px; font-size: 9.5px; background: #f5f5f5; padding: 5px 7px; border-radius: 4px; }
        .notes-label { font-weight: 800; text-transform: uppercase; font-size: 8px; letter-spacing: 0.5px; margin-bottom: 1px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
        th { font-size: 9px; font-weight: 800; text-transform: uppercase; padding: 6px 3px; text-align: left; border-bottom: 1.5px solid #000; border-top: 1.5px solid #000; }
        th:nth-child(1) { width: 18px; }
        th:nth-child(3) { text-align: center; }
        th:nth-child(4) { text-align: center; width: 28px; }
        td { padding: 5px 3px; font-size: 10px; vertical-align: middle; border-bottom: 0.5px dashed #ddd; }
        .item-name { font-weight: 700; line-height: 1.2; }
        .item-pkg  { font-size: 8.5px; color: #666; margin-top: 1px; }
        .td-num    { color: #aaa; font-size: 9px; text-align: right; padding-right: 5px; }
        .td-center { text-align: center; }
        .td-check  { text-align: center; font-size: 14px; color: #ccc; }
        .summary   { border-top: 1.5px solid #000; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; }
        .summary-count { font-size: 10px; font-weight: 700; color: #555; }
        .summary-total { font-size: 11px; font-weight: 800; }
        .count-badge { display: inline-block; background: #000; color: #fff; font-size: 8px; font-weight: 800; padding: 1px 5px; border-radius: 3px; margin-left: 4px; vertical-align: middle; }
        .footer { text-align: center; margin-top: 14px; font-size: 9px; color: #555; font-weight: 500; border-top: 1px dashed #ccc; padding-top: 8px; }
    </style>
</head>
<body>
    <div class="header">
        ${companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
        <div class="header-content">
            <div class="store-name">${storeName}</div>
            ${companyInfo?.slogan ? `<div style="font-size:9px;font-style:italic;margin-bottom:2px;">"${companyInfo.slogan}"</div>` : ""}
            ${companyInfo?.rif ? `<div class="store-rif">RIF: ${companyInfo.rif}</div>` : ""}
            <div class="store-info">
                ${companyInfo?.address ? `<div>${companyInfo.address}</div>` : ""}
                ${companyInfo?.phone ? `<div>Tel: ${[companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" / ")}</div>` : ""}
            </div>
        </div>
    </div>

    <div class="doc-header">
        <div class="doc-title">${title} <span class="count-badge">${items.length}</span></div>
        <div class="doc-sub">${subTitle}</div>
    </div>

    <div class="meta">
        <div class="meta-row"><span class="meta-label">Orden Nº:</span><span class="meta-value">${detail.id ? `#${detail.id}` : "BORRADOR"}</span></div>
        <div class="meta-row"><span class="meta-label">Fecha:</span><span class="meta-value">${fmtDate(detail.created_at)}</span></div>
        ${detail.supplier_name ? `<div class="meta-row"><span class="meta-label">Proveedor:</span><span class="meta-value">${detail.supplier_name}</span></div>` : ""}
        ${detail.warehouse_name ? `<div class="meta-row"><span class="meta-label">Almacén:</span><span class="meta-value">${detail.warehouse_name}</span></div>` : ""}
        ${detail.employee_name ? `<div class="meta-row"><span class="meta-label">Registrado por:</span><span class="meta-value">${detail.employee_name}</span></div>` : ""}
    </div>

    ${detail.notes ? `<div class="notes"><div class="notes-label">Referencia / Notas</div>${detail.notes}</div>` : ""}

    <table>
        <thead>
            <tr>
                <th></th>
                <th>Producto</th>
                <th>Cant</th>
                <th>✓</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>

    <div class="summary">
        <span class="summary-count">${items.length} ${items.length === 1 ? "producto" : "productos"}</span>
        <span class="summary-total">${items.reduce((s, i) => s + parseInt(i.package_qty || 0), 0)} empaques en total</span>
    </div>

    <div class="footer">Documento generado el ${new Date().toLocaleString("es-VE")} · ${storeName}</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("El navegador bloqueó la ventana emergente. Permite popups para esta página e inténtalo de nuevo."); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
}
