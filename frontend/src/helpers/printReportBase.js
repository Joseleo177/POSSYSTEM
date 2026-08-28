import { resolveImageUrl } from ".";

// Base común de los reportes en tamaño carta (ventas, cuentas por cobrar…).
//
// Vive aparte de cada generador porque dos de sus reglas son arreglos que costaron encontrar y
// que TODO reporte multipágina necesita: el margen por @page y el pie de tabla que no se repite.
// Duplicarlas en cada documento garantizaba que el siguiente naciera con los mismos bugs.
//
// No lo usan la factura ni la cotización: esos son documentos de una sola hoja con su propia
// maqueta (ancho fijo de 216mm y padding en el body), y unificarlos no aportaría nada.

export const esc = v => String(v ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

// Cantidades que pueden ser fraccionarias (kilos, litros): decimales solo cuando los tienen,
// para que "12" no salga como "12,000".
export const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(3);
};

export const pctOf = (parte, total) => {
    const t = parseFloat(total || 0);
    if (!(t > 0)) return "—";
    return `${((parseFloat(parte || 0) / t) * 100).toFixed(1)}%`;
};

export const REPORT_CSS = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap');

        /* El aire va en @page y NO en el padding del body, al revés que la factura o la
           cotización: el padding solo abre margen al principio y al final del flujo, así que en
           un documento de varias hojas la segunda arrancaba pegada al borde del papel.
           Con margen de página el ancho útil ya viene recortado por el navegador, de ahí que el
           body no lleve el width fijo de 216mm de los documentos de una sola hoja: con los dos
           a la vez, el contenido se salía por la derecha. */
        @page { size: letter; margin: 14mm 12mm; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 10.5px; line-height: 1.5; color: #2b2b2b; background: #fff;
            width: 100%;
        }

        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .doc-title { font-size: 19px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #1a1a1a; }
        .doc-sub { font-size: 8.5px; font-weight: 500; color: #999; text-transform: uppercase; letter-spacing: 0.8px; margin-top: 1px; }
        .logo { max-height: 62px; max-width: 145px; object-fit: contain; }

        .issuer { margin-top: 16px; padding-bottom: 12px; border-bottom: 1px solid #ededed; }
        .issuer-name { font-size: 12.5px; font-weight: 700; color: #1a1a1a; }
        .issuer-line { font-size: 9.5px; color: #777; margin-top: 1px; }

        /* Resumen en tarjetas: es lo primero que se mira al recibir la hoja. */
        .kpis { display: flex; gap: 8px; margin: 14px 0 18px; }
        .kpi { flex: 1; border: 1px solid #ededed; border-radius: 6px; padding: 9px 11px; }
        .kpi-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #999; }
        .kpi-value { font-size: 14px; font-weight: 700; color: #1a1a1a; margin-top: 2px; white-space: nowrap; }
        .kpi-sub { font-size: 8.5px; color: #999; }

        .block-label { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.2px; color: #999; margin-bottom: 6px; }

        table { width: 100%; border-collapse: collapse; }
        /* La cabecera se repite en cada hoja: un listado largo pasa de página y sin esto no se
           sabe qué es cada columna en la segunda. */
        thead { background: #e9e9e9; display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 8px 10px; text-align: left; color: #444; }
        td { padding: 7px 10px; font-size: 10.5px; vertical-align: middle; border-bottom: 1px solid #ededed; }
        .item-name { color: #2b2b2b; overflow-wrap: break-word; }
        .td-num, th.td-num { width: 30px; color: #aaa; text-align: right; }
        .td-center, th.td-center { text-align: center; white-space: nowrap; width: 70px; }
        .td-right, th.td-right { text-align: right; white-space: nowrap; width: 105px; }
        .td-total { font-weight: 700; color: #1a1a1a; }
        .td-pct { color: #777; width: 58px; }
        .empty { text-align: center; color: #999; padding: 24px 0; font-style: italic; }
        /* El pie de la tabla va como grupo normal para que salga UNA vez, al final del listado:
           como table-footer-group el navegador lo repite en cada hoja y el mismo total
           aparecería tres veces en un reporte de tres páginas. */
        tfoot { display: table-row-group; }
        tfoot td { border-top: 2px solid #ddd; border-bottom: none; font-weight: 700; background: #f7f7f7; }

        .cols { display: flex; gap: 24px; margin-top: 20px; page-break-inside: avoid; }
        .col { flex: 1; }
        .row-line { display: flex; justify-content: space-between; gap: 16px; font-size: 10px; padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
        .total-line { border-top: 2px solid #ddd; border-bottom: none; margin-top: 2px; padding-top: 6px; font-weight: 700; color: #1a1a1a; }
        .muted { color: #999; }
        .strong { font-weight: 700; color: #1a1a1a; white-space: nowrap; }
        .danger { color: #a33; }

        .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e5e5e5; text-align: center; font-size: 9px; color: #999; }
`;

/**
 * Encabezado común: título del documento, subtítulo y los datos de la empresa.
 * `show_header` en false deja solo el nombre, que es como se configuran los negocios que
 * imprimen sobre papel membretado.
 */
export function reportHeader({ title, subtitle, companyInfo }) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    const showHeader = companyInfo?.show_header !== false;

    const issuerLine = [
        companyInfo?.rif ? `RIF: ${esc(companyInfo.rif)}` : "",
        [companyInfo?.address, companyInfo?.city].filter(Boolean).map(esc).join(", "),
        [companyInfo?.phone, companyInfo?.phone2].filter(Boolean).map(esc).join(" / "),
    ].filter(Boolean).join(" · ");

    return `
    <div class="top">
        <div>
            <div class="doc-title">${esc(title)}</div>
            ${subtitle ? `<div class="doc-sub">${esc(subtitle)}</div>` : ""}
        </div>
        ${showHeader && companyInfo?.logo_url ? `<img src="${resolveImageUrl(companyInfo.logo_url)}" class="logo" />` : ""}
    </div>

    <div class="issuer">
        <span class="issuer-name">${esc(storeName)}</span>
        ${showHeader && issuerLine ? `<div class="issuer-line">${issuerLine}</div>` : ""}
    </div>`;
}

/**
 * Manda el HTML a la impresora del navegador desde un iframe oculto: sin pestaña nueva y sin
 * bloqueadores de popup. 816px es el ancho de la hoja carta a 96dpi.
 */
export function openPrintFrame(html) {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:816px;height:1056px;border:0;";
    document.body.appendChild(iframe);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.onload = () => {
        // La fuente y el logo llegan por red: sin la espera el diálogo puede abrirse con el
        // layout a medio armar y el PDF sale con la tipografía de respaldo.
        setTimeout(() => {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => document.body.removeChild(iframe), 2000);
        }, 350);
    };
}
