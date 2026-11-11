import { printHtml, esPantallaTactil, abrirParaGuardar } from "./printDocument";
import { tema, esc, conSaltos, precioTxt, absoluta } from "./catalogPdf";

// Lista de precios en PDF (11-11-2026): el segundo formato del Catálogo PDF, para tiendas de
// repuestos, bodegas o la carpeta del vendedor. Una fila por producto, agrupada por
// categoría, en hoja A4 vertical. Sin descripciones ni fotos grandes: entran unas 40 filas por
// hoja y una tienda de 3.000 productos cabe en unas 80 páginas.
//
// La cabecera de la tabla se repite en cada hoja (thead) y el pie numera las páginas.

const UNIDAD_CORTA = { UNIDAD: "und", KG: "kg", LITRO: "L", METRO: "m", M2: "m²" };
const enBolivares = (n) => Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap');
@page {
  size: A4 portrait; margin: 11mm 10mm 13mm;
  @bottom-right { content: "Página " counter(page) " de " counter(pages); font: 8pt 'Source Sans 3', sans-serif; color: #888; }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Source Sans 3', 'Segoe UI', sans-serif; color: #222; font-size: 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.cab { display: flex; align-items: center; gap: 5mm; padding-bottom: 4mm; margin-bottom: 3mm; border-bottom: 0.6mm solid var(--acento); }
.cab img { height: 16mm; max-width: 40mm; object-fit: contain; }
.cab-txt { flex: 1; min-width: 0; }
.cab h1 { font-size: 17pt; font-weight: 700; color: var(--acento); line-height: 1.1; }
.cab .tienda { font-size: 10pt; font-weight: 600; }
.cab .datos { font-size: 8.5pt; color: #666; margin-top: 0.8mm; }
.cab-der { text-align: right; font-size: 8.5pt; color: #555; line-height: 1.4; white-space: nowrap; }
.cab-der b { color: #222; }
.cond { font-size: 8.5pt; color: #444; background: var(--claro); padding: 2mm 3mm; margin-bottom: 3mm; border-left: 0.8mm solid var(--acento); }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .6pt; color: #666; text-align: left; padding: 1.6mm 1.5mm; border-bottom: 0.4mm solid #bbb; }
td { padding: 1.1mm 1.5mm; border-bottom: 0.15mm solid #e4e4e4; vertical-align: middle; }
tr { break-inside: avoid; page-break-inside: avoid; }
tr.par td { background: #fafafa; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
th.num { text-align: right; }
.cod { color: #777; font-size: 8pt; white-space: nowrap; font-variant-numeric: tabular-nums; }
.uni { color: #777; font-size: 8pt; white-space: nowrap; }
.nom small { color: #888; font-size: 8pt; margin-left: 1.5mm; }
.precio { font-weight: 700; }
.foto { width: 10mm; padding-top: 0.6mm; padding-bottom: 0.6mm; }
.foto img { width: 8mm; height: 8mm; object-fit: contain; display: block; }
tr.grupo td { padding: 3.5mm 1.5mm 1.2mm; border-bottom: 0.4mm solid var(--g); background: #fff; break-after: avoid; page-break-after: avoid; }
tr.grupo span { font-weight: 700; font-size: 10pt; color: var(--g); text-transform: uppercase; letter-spacing: .5pt; }
tr.grupo i { font-style: normal; color: #999; font-size: 8pt; margin-left: 2mm; }
.vacio { color: #bbb; }
`;

/**
 * Arma el HTML de la lista. `datos` es la respuesta de GET /products/catalog-pdf?formato=lista.
 * opciones: { titulo, condiciones, columnas: { foto, codigo, detal, mayor, bs }, tasa,
 *             simboloLocal, simbolo, fecha }
 */
export function armarListaHtml(datos, opciones) {
    const store = datos.store || {};
    const col = opciones.columnas || {};
    const acento = tema(store.color, 0);
    const lineas = (datos.lines || []).map((l, i) => ({ ...l, t: tema(l.color, i) }));
    const tasa = parseFloat(opciones.tasa) || 0;
    const conBs = col.bs && tasa > 0;
    // Lo que se pasa a Bs.: el detal si sale, si no el al mayor.
    const baseBs = (p) => (col.detal || !col.mayor ? p.price : p.wholesale_price);
    const productos = datos.products || [];

    const cabeceras = [
        col.foto && `<th class="foto"></th>`,
        col.codigo && `<th>Código</th>`,
        `<th>Producto</th>`,
        `<th>Und.</th>`,
        col.detal && `<th class="num">${col.mayor ? "Detal" : "Precio"}</th>`,
        col.mayor && `<th class="num">${col.detal ? "Al mayor" : "Precio"}</th>`,
        conBs && `<th class="num">${esc(opciones.simboloLocal || "Bs.")}</th>`,
    ].filter(Boolean);

    const filas = [];
    for (const l of lineas) {
        const prods = productos.filter(p => (p.category_id ?? null) === (l.id ?? null));
        if (!prods.length) continue;
        if (lineas.length > 1 || l.id) {
            filas.push(`<tr class="grupo" style="--g:${l.t.tinta}"><td colspan="${cabeceras.length}"><span>${esc(l.name)}</span><i>${prods.length}</i></td></tr>`);
        }
        prods.forEach((p, i) => {
            const aBs = baseBs(p);
            const unidad = String(p.unit || "").toUpperCase();
            filas.push(`<tr${i % 2 ? ' class="par"' : ""}>${[
                col.foto && `<td class="foto">${p.image_url ? `<img src="${esc(absoluta(p.image_url))}" alt="">` : ""}</td>`,
                col.codigo && `<td class="cod">${esc(p.barcode || "")}</td>`,
                `<td class="nom">${esc(p.name)}${p.net_content ? `<small>${esc(p.net_content)}</small>` : ""}</td>`,
                `<td class="uni">${esc(UNIDAD_CORTA[unidad] || unidad.toLowerCase())}</td>`,
                col.detal && `<td class="num precio">${esc(precioTxt(p.price, opciones.simbolo))}</td>`,
                col.mayor && `<td class="num precio">${p.wholesale_price != null ? esc(precioTxt(p.wholesale_price, opciones.simbolo)) : `<span class="vacio">—</span>`}</td>`,
                conBs && `<td class="num">${aBs != null ? esc(enBolivares(aBs * tasa)) : `<span class="vacio">—</span>`}</td>`,
            ].filter(Boolean).join("")}</tr>`);
        });
    }

    const contacto = [
        store.whatsapp && `WhatsApp +${store.whatsapp}`,
        store.phone && `Tel. ${store.phone}`,
        store.rif && `RIF ${store.rif}`,
        store.address,
    ].filter(Boolean).join(" · ");

    return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(opciones.titulo || "Lista de precios")} - ${esc(store.name || "")}</title>
<style>${CSS}</style></head>
<body style="--acento:${acento.acento};--claro:${acento.fondoClaro}">
  <div class="cab">
    ${store.logo_url ? `<img src="${esc(absoluta(store.logo_url))}" alt="">` : ""}
    <div class="cab-txt">
      <h1>${esc(opciones.titulo || "Lista de precios")}</h1>
      <div class="tienda">${esc(store.name || "")}</div>
      ${contacto ? `<div class="datos">${esc(contacto)}</div>` : ""}
    </div>
    <div class="cab-der">
      <div><b>${esc(opciones.fecha)}</b></div>
      <div>${productos.length} ${productos.length === 1 ? "producto" : "productos"}</div>
      ${conBs ? `<div>Tasa ${esc(enBolivares(tasa))} ${esc(opciones.simboloLocal || "Bs.")}</div>` : ""}
    </div>
  </div>
  ${opciones.condiciones ? `<div class="cond">${conSaltos(opciones.condiciones)}</div>` : ""}
  <table>
    <thead><tr>${cabeceras.join("")}</tr></thead>
    <tbody>${filas.join("")}</tbody>
  </table>
</body></html>`;
}

// Hojas aproximadas: unas 40 filas por hoja vertical (cada categoría suma una fila).
export function paginasLista(datos) {
    const productos = datos.products || [];
    const grupos = new Set(productos.map(p => p.category_id ?? 0)).size;
    return Math.max(1, Math.ceil((productos.length + grupos + 4) / 40));
}

export function imprimirLista(datos, opciones) {
    // 794 x 1123 es la hoja A4 vertical a 96 dpi.
    const html = armarListaHtml(datos, opciones);
    if (esPantallaTactil() && abrirParaGuardar(html, { ancho: 794 })) return "pestaña";
    printHtml(html, { width: 794, height: 1123 });
    return "dialogo";
}
