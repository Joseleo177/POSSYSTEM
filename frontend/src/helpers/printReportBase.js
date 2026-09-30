import { resolveImageUrl } from ".";
import { printHtml } from "./printDocument";

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

        /* Los márgenes NO dependen del diálogo de impresión. En un POS el diálogo casi siempre
           está en "Márgenes: ninguno" —así se imprimen los tickets térmicos, y Chrome recuerda
           el último ajuste—, y con eso Chrome ignora el margin de @page: la hoja carta salía
           pegada al borde y con el título cortado arriba. Así que @page va en 0 y el aire lo
           pone el propio documento:
             · a los lados, padding del body, que sí se respeta en todas las hojas;
             · arriba y abajo, la tabla-marco que monta openPrintFrame: su thead y su tfoot son
               un espacio en blanco que el navegador repite en cada hoja. Con padding vertical
               solo se abría margen al principio y al final del flujo, y la segunda hoja
               arrancaba pegada al papel.
           Sale igual con márgenes "predeterminados", "ninguno" o "mínimos". */
        @page { size: letter; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', system-ui, sans-serif;
            font-size: 10.5px; line-height: 1.5; color: #2b2b2b; background: #fff;
            width: 100%;
            padding: 0 13mm;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .page-frame { width: 100%; border-collapse: collapse; }
        .page-frame > thead { display: table-header-group; background: none; }
        .page-frame > tfoot { display: table-footer-group; }
        .page-frame > thead > tr > td,
        .page-frame > tfoot > tr > td,
        .page-frame > tbody > tr > td { padding: 0; border: 0; background: none; font-size: inherit; }
        .page-frame > tbody > tr { page-break-inside: auto; break-inside: auto; }
        .page-space { height: 13mm; }

        /* Tipografía en caja de oración, sin mayúsculas espaciadas: la jerarquía la dan el
           tamaño y el peso, igual que en la pantalla. */
        .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .doc-title { font-size: 20px; font-weight: 600; letter-spacing: -0.2px; color: #111; line-height: 1.2; }
        .doc-sub { font-size: 10px; color: #888; margin-top: 3px; }
        .logo { max-height: 56px; max-width: 140px; object-fit: contain; }

        .issuer { margin-top: 14px; padding-bottom: 12px; border-bottom: 1px solid #e6e6e6; }
        .issuer-name { font-size: 12px; font-weight: 600; color: #1a1a1a; }
        .issuer-line { font-size: 9.5px; color: #888; margin-top: 1px; }

        /* Resumen en tarjetas: es lo primero que se mira al recibir la hoja. */
        .kpis { display: flex; gap: 8px; margin: 14px 0 20px; }
        .kpi { flex: 1; border: 1px solid #e6e6e6; border-radius: 8px; padding: 10px 12px; }
        .kpi-label { font-size: 9.5px; font-weight: 500; color: #888; }
        .kpi-value { font-size: 15px; font-weight: 700; color: #111; margin-top: 2px; white-space: nowrap; letter-spacing: -0.2px; }
        .kpi-sub { font-size: 9px; color: #999; margin-top: 1px; }

        .block-label { font-size: 12px; font-weight: 600; color: #1a1a1a; margin-bottom: 7px; }
        .block-label .muted { font-weight: 400; }

        table { width: 100%; border-collapse: collapse; }
        /* La cabecera se repite en cada hoja: un listado largo pasa de página y sin esto no se
           sabe qué es cada columna en la segunda. */
        thead { background: #f4f4f4; display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { font-size: 9px; font-weight: 600; padding: 7px 10px; text-align: left; color: #666; border-bottom: 1px solid #e0e0e0; }
        td { padding: 7px 10px; font-size: 10.5px; vertical-align: middle; border-bottom: 1px solid #eee; }
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

// Marco de página: todo el contenido va en la única celda del cuerpo, y el thead y el tfoot
// —un espacio en blanco cada uno— se repiten en cada hoja. Es lo que da el margen de arriba y
// de abajo en todas las páginas sin depender de lo que diga el diálogo de impresión (ver
// .page-frame en REPORT_CSS).
const MARCO_ABRE = `<table class="page-frame">
    <thead><tr><td><div class="page-space"></div></td></tr></thead>
    <tfoot><tr><td><div class="page-space"></div></td></tr></tfoot>
    <tbody><tr><td>`;
const MARCO_CIERRA = `</td></tr></tbody></table>`;

/**
 * Manda el reporte a la impresora. Se conserva como nombre propio de los reportes; el cómo
 * —iframe oculto en escritorio, documento montado en la página en iOS— vive en printDocument.
 */
export function openPrintFrame(html) {
    printHtml(
        html.replace(/<body([^>]*)>/i, `<body$1>${MARCO_ABRE}`)
            .replace(/<\/body>/i, `${MARCO_CIERRA}</body>`)
    );
}
