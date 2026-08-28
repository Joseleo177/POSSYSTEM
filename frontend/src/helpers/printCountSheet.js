import { fmtDate } from ".";
import { REPORT_CSS, esc, reportHeader, openPrintFrame } from "./printReportBase";

// Planilla para el conteo físico: la hoja que uno se lleva al depósito, con una casilla vacía
// por producto para anotar a lápiz.
//
// VA EN BLANCO A PROPÓSITO. No muestra lo que el sistema dice que hay, porque quien cuenta con
// la cifra delante tiende a "confirmarla" en vez de contar: si el papel dice 48 y hay 46, la
// mano escribe 48. Contando a ciegas, la diferencia aparece recién al cargar los números en
// Ajustes, que es donde debe aparecer.
//
// El orden es alfabético y no por lo más vendido, que es como los devuelve la API: en el
// depósito se busca el producto por su nombre, recorriendo el estante.

// Cada cuántas filas se repite el encabezado de columnas dentro de la hoja no hace falta
// controlarlo: thead ya se repite por página (ver REPORT_CSS).

/**
 * @param {array}  productos filas de /warehouses/:id/products (name, unit)
 * @param {object} contexto  { warehouseName, categoryName, search }
 */
export function printCountSheet(productos, contexto, companyInfo) {
    const storeName = companyInfo?.name || "MI TIENDA POS";

    // Copia antes de ordenar: `productos` es el estado de la pantalla y ordenarlo en el sitio
    // le cambiaría el orden a la lista que el usuario está mirando.
    const filas = [...(productos || [])].sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""), "es", { sensitivity: "base" })
    );

    const filtros = [
        contexto?.warehouseName ? `Almacén: ${contexto.warehouseName}` : "",
        contexto?.categoryName ? `Categoría: ${contexto.categoryName}` : "",
        contexto?.search ? `Búsqueda: "${contexto.search}"` : "",
    ].filter(Boolean).join(" · ");

    const filasHtml = filas.length ? filas.map((p, i) => `
        <tr>
            <td class="td-num">${i + 1}</td>
            <td class="item-name">${esc(p.name || "—")}</td>
            <td class="td-unidad">${esc((p.unit || "unidad").toUpperCase())}</td>
            <td class="casilla col-contado"></td>
            <td class="casilla col-obs"></td>
        </tr>`).join("")
        : `<tr><td colspan="5" class="empty">No hay productos que coincidan con los filtros</td></tr>`;

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <!-- El navegador propone el título como nombre del archivo al "Guardar como PDF". -->
    <title>Planilla de conteo ${esc(contexto?.warehouseName || "")} - ${esc(storeName)}</title>
    <style>${REPORT_CSS}
        /* Compacto: en una planilla lo que importa es que entren la mayor cantidad de
           renglones por hoja sin que deje de haber sitio para el lápiz. */
        td { padding: 4px 10px; }
        th { padding: 6px 10px; }
        .td-unidad, th.td-unidad { width: 80px; color: #777; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; }
        .col-contado { width: 100px; }
        .col-obs { width: 140px; }
        /* El recuadro va SOLO en las celdas del cuerpo: aplicado a la clase suelta se dibujaba
           también bajo el título "Contado", como una casilla de encabezado que no significaba
           nada. */
        td.casilla { border-bottom: 1px solid #ededed; }
        td.casilla::after {
            content: "";
            display: block;
            height: 15px;
            border: 1px solid #c8c8c8;
            border-radius: 3px;
            background: #fcfcfc;
        }

        .instruc { margin: 10px 0 12px; padding: 7px 11px; border: 1px dashed #d5d5d5; border-radius: 6px; font-size: 9.5px; color: #777; }
        .firmas { display: flex; gap: 60px; margin-top: 34px; page-break-inside: avoid; }
        .firma { flex: 1; border-top: 1px solid #bbb; padding-top: 5px; text-align: center; font-size: 9px; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    </style>
</head>
<body>

    ${reportHeader({
        title: "Planilla de conteo físico",
        subtitle: `Documento interno · Impresa el ${fmtDate(new Date())}`,
        companyInfo,
    })}

    ${filtros ? `<div class="block-label" style="margin-top:14px">${esc(filtros)} · ${filas.length} productos</div>`
              : `<div class="block-label" style="margin-top:14px">${filas.length} productos</div>`}

    <div class="instruc">
        Anote la cantidad contada de cada producto. La planilla no trae las existencias del
        sistema a propósito: la diferencia se calcula al cargar el conteo en Inventario →
        Ajustes, con el motivo <b>Ajuste de Conteo Físico</b>.
    </div>

    <table>
        <thead>
            <tr>
                <th class="td-num">#</th>
                <th>Producto</th>
                <th class="td-unidad">Unidad</th>
                <th class="col-contado">Contado</th>
                <th class="col-obs">Observaciones</th>
            </tr>
        </thead>
        <tbody>${filasHtml}</tbody>
    </table>

    <div class="firmas">
        <div class="firma">Contó</div>
        <div class="firma">Revisó</div>
    </div>

    <div class="footer">${esc(storeName)} · Planilla de conteo físico</div>

</body>
</html>`;

    openPrintFrame(html);
}
