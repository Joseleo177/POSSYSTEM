import { fmtDate, fmtDateShort, toNameCase } from ".";
import { REPORT_CSS, esc, fmtQty, reportHeader, openPrintFrame } from "./printReportBase";

// Listas de regalos de la cobranza, en tamaño carta: papel que el cobrador se lleva a la ruta y
// que la dueña usa para contar lo que queda. En el teléfono, el diálogo de impresión permite
// guardarlas en PDF o compartirlas.

const CSS = `
    ${REPORT_CSS}
    .grupo { margin-top: 18px; }
    .sub { font-size: 9.5px; color: #888; }
    .fuerte { font-weight: 600; color: #1a1a1a; }
    .td-rec { width: 92px; }
    .caja { display: inline-block; width: 12px; height: 12px; border: 1px solid #777; border-radius: 2px; vertical-align: middle; }
    .falta { color: #a33; font-weight: 700; }
    /* Mismas columnas en todas las tablas de sectores: el ojo baja derecho por la hoja. */
    .ruta { table-layout: fixed; }
    .ruta th:nth-child(1) { width: 48%; }
    .ruta td { overflow-wrap: anywhere; }
`;

const documento = (titulo, cuerpo, companyInfo) => `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>${esc(titulo)} - ${esc(companyInfo?.name || "")}</title>
    <style>${CSS}</style>
</head>
<body>${cuerpo}<div class="footer">Generado el ${esc(fmtDate(new Date()))}</div></body>
</html>`;

// Agrupa conservando el orden en que llegan.
const agrupar = (lista, clave) => {
    const m = new Map();
    for (const x of lista) { const k = clave(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    return [...m.entries()];
};

const tituloDelFiltro = (sector) => sector || "Todos los sectores";

/**
 * Lo que se lleva: arriba, cuánto de cada regalo hay que cargar; abajo, a quién le toca cada uno,
 * por sector, con su dirección y una casilla para marcar al entregarlo.
 */
export function printRegalosParaLlevar(lista, { sector, companyInfo } = {}) {
    const totales = agrupar(lista, r => r.product_name)
        .map(([nombre, filas]) => ({ nombre, n: filas.reduce((s, r) => s + Number(r.qty || 0), 0) }))
        .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
    const unidades = totales.reduce((s, t) => s + t.n, 0);

    const carga = totales.map(t => `
        <tr><td class="item-name fuerte">${esc(t.nombre)}</td><td class="td-center td-total">${esc(fmtQty(t.n))}</td><td class="td-rec"><span class="caja"></span></td></tr>`).join("");

    // Por sector y por cliente, en orden alfabético: así se busca en la calle. El listado llega
    // por fecha de asignación, que aquí no le dice nada a nadie.
    const ordenada = [...lista].sort((a, b) =>
        (a.sector_name || "Sin sector").localeCompare(b.sector_name || "Sin sector", "es")
        || String(a.customer_name || "").localeCompare(String(b.customer_name || ""), "es"));
    const porSector = agrupar(ordenada, r => r.sector_name || "Sin sector").map(([nombre, filas]) => `
        <div class="grupo">
            <div class="block-label">${esc(nombre)} <span class="muted">· ${filas.length} ${filas.length === 1 ? "regalo" : "regalos"}</span></div>
            <table class="ruta">
                <thead><tr><th>Cliente</th><th>Regalo</th><th class="td-center">Cant.</th><th class="td-rec">Entregado</th></tr></thead>
                <tbody>${filas.map(r => `
                    <tr>
                        <td class="item-name">
                            <div class="fuerte">${esc(toNameCase(r.customer_name))}</div>
                            <div class="sub">${esc([r.customer_address, r.customer_phone].filter(Boolean).join(" · "))}</div>
                        </td>
                        <td class="item-name">
                            <div>${esc(r.product_name)}</div>
                            <div class="sub">${esc(r.code)}${r.invoice_number ? ` · por ${esc(r.invoice_number)}` : ""}${r.notes ? ` · ${esc(r.notes)}` : ""}</div>
                        </td>
                        <td class="td-center td-total">${esc(fmtQty(r.qty))}</td>
                        <td class="td-rec"><span class="caja"></span></td>
                    </tr>`).join("")}
                </tbody>
            </table>
        </div>`).join("");

    const titulo = "Regalos para llevar en la ruta";
    openPrintFrame(documento(titulo, `
        ${reportHeader({ title: titulo, subtitle: `${tituloDelFiltro(sector)} · ${fmtDateShort(new Date())}`, companyInfo })}
        <div class="grupo">
            <div class="block-label">Para cargar <span class="muted">· ${esc(fmtQty(unidades))} ${unidades === 1 ? "unidad" : "unidades"}</span></div>
            <table>
                <thead><tr><th>Regalo</th><th class="td-center">Cant.</th><th class="td-rec">Cargado</th></tr></thead>
                <tbody>${carga}</tbody>
            </table>
        </div>
        ${porSector}`, companyInfo));
}

/** Lo que queda: de cada regalo, cuánto hay, cuánto está apartado y cuánto está libre. */
export function printRegalosQuedan(filas, { sector, companyInfo } = {}) {
    const variasSucursales = new Set(filas.map(f => f.warehouse_id)).size > 1;
    const tablas = agrupar(filas, f => f.warehouse_name).map(([sucursal, lista]) => {
        const suma = (k) => lista.reduce((s, f) => s + Number(f[k] || 0), 0);
        const cuerpo = agrupar(lista, f => f.category_name).map(([categoria, items]) => `
            <tr><td colspan="4" class="fuerte" style="background:#fafafa">${esc(categoria)}</td></tr>
            ${items.map(f => `
                <tr>
                    <td class="item-name">${esc(f.name)}</td>
                    <td class="td-center">${esc(fmtQty(f.stock))}</td>
                    <td class="td-center">${f.apartado > 0 ? esc(fmtQty(f.apartado)) : "—"}</td>
                    <td class="td-center td-total ${f.libre <= 0 ? "falta" : ""}">${f.libre <= 0 ? (f.libre < 0 ? `Faltan ${esc(fmtQty(-f.libre))}` : "Agotado") : esc(fmtQty(f.libre))}</td>
                </tr>`).join("")}`).join("");
        return `
        <div class="grupo">
            ${variasSucursales ? `<div class="block-label">${esc(sucursal)}</div>` : ""}
            <table>
                <thead><tr><th>Regalo</th><th class="td-center">Existencia</th><th class="td-center">Apartado</th><th class="td-center">Libre</th></tr></thead>
                <tbody>${cuerpo}</tbody>
                <tfoot><tr><td>Total</td><td class="td-center">${esc(fmtQty(suma("stock")))}</td><td class="td-center">${esc(fmtQty(suma("apartado")))}</td><td class="td-center">${esc(fmtQty(suma("libre")))}</td></tr></tfoot>
            </table>
        </div>`;
    }).join("");

    const titulo = "Regalos que quedan";
    const lugar = sector || (variasSucursales ? "Todas las sucursales" : filas[0]?.warehouse_name) || "";
    openPrintFrame(documento(titulo, `
        ${reportHeader({ title: titulo, subtitle: `${lugar} · ${fmtDateShort(new Date())}`, companyInfo })}
        ${tablas}`, companyInfo));
}

/** Lo entregado: a quién, cuándo y quién lo entregó. Los más recientes primero. */
export function printRegalosEntregados(lista, { sector, companyInfo } = {}) {
    const titulo = "Regalos entregados";
    const filas = lista.map(r => `
        <tr>
            <td class="td-center">${esc(fmtDateShort(r.delivered_at))}</td>
            <td class="item-name"><div class="fuerte">${esc(toNameCase(r.customer_name))}</div><div class="sub">${esc(r.sector_name || "Sin sector")}</div></td>
            <td class="item-name"><div>${esc(r.product_name)}</div><div class="sub">${esc(r.code)}${r.invoice_number ? ` · por ${esc(r.invoice_number)}` : ""}</div></td>
            <td class="td-center td-total">${esc(fmtQty(r.qty))}</td>
            <td class="item-name">${esc(toNameCase(r.delivered_by_name || ""))}</td>
        </tr>`).join("");
    openPrintFrame(documento(titulo, `
        ${reportHeader({ title: titulo, subtitle: `${tituloDelFiltro(sector)} · ${lista.length} ${lista.length === 1 ? "regalo" : "regalos"}`, companyInfo })}
        <div class="grupo">
            <table>
                <thead><tr><th class="td-center">Fecha</th><th>Cliente</th><th>Regalo</th><th class="td-center">Cant.</th><th>Entregó</th></tr></thead>
                <tbody>${filas}</tbody>
            </table>
        </div>`, companyInfo));
}
