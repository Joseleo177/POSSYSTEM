import { fmtDate } from "./dates";
import { fmtMoney } from "./currency";
import { toNameCase } from "./text";
import { printHtml } from "./printDocument";

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const fmtQty = q => {
    const n = parseFloat(q || 0);
    return n % 1 === 0 ? String(Math.round(n)) : n.toLocaleString("es-VE", { maximumFractionDigits: 3 });
};

const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

/**
 * Precuenta térmica para restaurante.
 * Se imprime a petición del cliente antes de cobrar:
 * - Platos agrupados por puesto con subtotales
 * - Total de la mesa
 * - Servicio sugerido opcional (ej. 10%)
 * - Totales en Ref. y en moneda local (Bs.) a la tasa del día
 * - Indicación clara de "NO ES FACTURA"
 */
export function printPrecuenta({
    cuenta,
    mesa,
    companyInfo,
    printerWidth = 80,
    sym = "Ref.",
    local = null,
}) {
    if (!cuenta) return;
    const w58 = printerWidth === 58;

    const items = cuenta.items || [];
    const customer = cuenta.customer?.name || cuenta.customer_name || "Cliente General";
    const customerRif = cuenta.customer?.rif || cuenta.customer_rif || "";
    const waiter = cuenta.waiter_name || cuenta.employee_name || "";
    const mesaNombre = mesa?.name || (cuenta.table_name ? `Mesa ${cuenta.table_name}` : "Mesa");

    // Agrupar platos y sus adicionales
    const platos = [];
    for (const it of items) {
        const monto = parseFloat(it.subtotal ?? (parseFloat(it.price) * parseFloat(it.quantity))) || 0;
        if (it.is_addon && platos.length) {
            const p = platos[platos.length - 1];
            p.monto += monto;
            if (parseFloat(it.price) > 0) p.extras.push(it);
            continue;
        }
        platos.push({ ...it, monto, extras: [] });
    }

    const porPuesto = new Map();
    for (const p of platos) {
        const k = p.seat || null;
        if (!porPuesto.has(k)) porPuesto.set(k, { seat: k, platos: [], total: 0 });
        const g = porPuesto.get(k);
        g.platos.push(p);
        g.total += p.monto;
    }
    const grupos = [...porPuesto.values()].sort((a, b) => (a.seat ?? 0) - (b.seat ?? 0));
    const tieneVariosPuestos = grupos.length > 1 || grupos.some(g => g.seat !== null);

    const totalMesa = parseFloat(cuenta.total) || platos.reduce((s, p) => s + p.monto, 0);
    const tasa = local?.rate ? parseFloat(local.rate) : 0;
    const localSym = local?.symbol || "Bs.";

    // Renderizar grupos de puestos
    const gruposHtml = grupos.map(g => {
        const headerPuesto = tieneVariosPuestos ? `
            <tr class="seat-header">
                <td colspan="3">
                    <span class="seat-badge">${g.seat ? `Puesto ${esc(g.seat)}` : "Mesa (compartido)"}</span>
                </td>
            </tr>` : "";

        const lineas = g.platos.map(p => `
            <tr>
                <td class="qty">${fmtQty(p.quantity)}</td>
                <td class="name">
                    ${esc(p.name)}
                    ${p.extras.length > 0 ? `<div class="sub-mod">${p.extras.map(x => `+ ${esc(x.name)}`).join(" · ")}</div>` : ""}
                    ${p.note ? `<div class="sub-note">${esc(p.note)}</div>` : ""}
                </td>
                <td class="price">${fmtMoney(p.monto, sym)}</td>
            </tr>
        `).join("");

        const subtotalPuesto = tieneVariosPuestos ? `
            <tr class="seat-subtotal">
                <td colspan="2" class="subtotal-label">Subtotal ${g.seat ? `P${esc(g.seat)}` : "Mesa"}:</td>
                <td class="subtotal-val">${fmtMoney(g.total, sym)}</td>
            </tr>` : "";

        return headerPuesto + lineas + subtotalPuesto;
    }).join("");

    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <title>Precuenta ${esc(mesaNombre)}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');
        @page { size: ${w58 ? "58mm" : "80mm"} auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Outfit', -apple-system, sans-serif;
            line-height: 1.25;
            color: #000;
            background: #fff;
            width: ${w58 ? "44mm" : "72mm"};
            margin: ${w58 ? "0" : "0 auto"};
            padding: ${w58 ? "2mm" : "3mm"};
        }
        .head { text-align: center; border-bottom: 2px solid #000; padding-bottom: 2mm; margin-bottom: 2mm; }
        .store { font-size: ${w58 ? "9px" : "11px"}; font-weight: 700; text-transform: uppercase; }
        .title { font-size: ${w58 ? "15px" : "18px"}; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-top: 0.5mm; }
        .tag-nofactura {
            display: inline-block;
            margin-top: 1mm;
            border: 1.5px solid #000;
            padding: 0.5mm 2mm;
            font-size: ${w58 ? "8px" : "10px"};
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .meta { font-size: ${w58 ? "8.5px" : "10.5px"}; margin-bottom: 2mm; padding-bottom: 1.5mm; border-bottom: 1px dashed #000; }
        .meta-row { display: flex; justify-content: space-between; gap: 2mm; }
        .meta-row span:last-child { font-weight: 700; text-align: right; }
        .customer { font-size: ${w58 ? "10px" : "12px"}; font-weight: 800; text-transform: uppercase; margin-top: 0.5mm; }

        table { width: 100%; border-collapse: collapse; }
        td { padding: 1mm 0; font-size: ${w58 ? "9.5px" : "11.5px"}; vertical-align: top; color: #000; }
        td.qty { font-size: ${w58 ? "10px" : "12px"}; font-weight: 800; width: ${w58 ? "7mm" : "9mm"}; white-space: nowrap; }
        td.name { font-weight: 700; overflow-wrap: break-word; }
        td.price { font-weight: 700; text-align: right; white-space: nowrap; width: ${w58 ? "14mm" : "18mm"}; }

        .seat-header td { padding-top: 2mm; padding-bottom: 0.5mm; }
        .seat-badge {
            display: inline-block;
            font-size: ${w58 ? "8.5px" : "10px"};
            font-weight: 800;
            text-transform: uppercase;
            border-bottom: 1.5px solid #000;
            padding-bottom: 0.3mm;
        }
        .seat-subtotal td {
            padding-top: 0.5mm;
            padding-bottom: 1.5mm;
            border-bottom: 1px dotted #000;
        }
        .subtotal-label { font-size: ${w58 ? "8px" : "9.5px"}; text-align: right; font-weight: 700; text-transform: uppercase; }
        .subtotal-val { font-size: ${w58 ? "9px" : "11px"}; font-weight: 800; text-align: right; }

        .sub-note { font-weight: 500; font-style: italic; font-size: ${w58 ? "8px" : "9.5px"}; margin-top: 0.3mm; }
        .sub-mod { font-weight: 600; font-size: ${w58 ? "8px" : "9.5px"}; margin-top: 0.3mm; }

        .totals {
            margin-top: 2.5mm;
            padding-top: 1.5mm;
            border-top: 2px solid #000;
            font-size: ${w58 ? "9.5px" : "11.5px"};
        }
        .totals-row { display: flex; justify-content: space-between; gap: 2mm; margin-bottom: 0.5mm; }
        .totals-row.main { font-size: ${w58 ? "12px" : "14px"}; font-weight: 800; border-top: 1px solid #000; padding-top: 1mm; margin-top: 1mm; }
        .totals-row.bs { font-size: ${w58 ? "11px" : "13px"}; font-weight: 700; }
        .totals-row.service { font-style: italic; }

        .footer {
            margin-top: 3mm;
            padding-top: 1.5mm;
            border-top: 1px dashed #000;
            text-align: center;
            font-size: ${w58 ? "8px" : "9.5px"};
            font-weight: 700;
            text-transform: uppercase;
            line-height: 1.3;
        }
    </style>
</head>
<body>
    <div class="head">
        ${companyInfo?.name ? `<div class="store">${esc(companyInfo.name)}</div>` : ""}
        <div class="title">Precuenta</div>
        <div class="tag-nofactura">No es factura</div>
    </div>

    <div class="meta">
        <div class="meta-row"><span>Mesa:</span><span>${esc(mesaNombre)}</span></div>
        <div class="meta-row"><span>Fecha:</span><span>${esc(fmtDate(cuenta.created_at || new Date()))}</span></div>
        ${waiter ? `<div class="meta-row"><span>Atiende:</span><span>${esc(toNameCase(waiter))}</span></div>` : ""}
        <div class="meta-row" style="margin-top:1mm">
            <span>Cliente:</span>
            <span>${esc(toNameCase(customer))}</span>
        </div>
        ${customerRif ? `<div class="meta-row"><span>Cédula/RIF:</span><span>${esc(customerRif)}</span></div>` : ""}
    </div>

    <table>
        <tbody>${gruposHtml}</tbody>
    </table>

    <div class="totals">
        <div class="totals-row main">
            <span>Total a pagar:</span>
            <span>${fmtMoney(totalMesa, sym)}</span>
        </div>

        ${tasa > 0 ? `
            <div style="margin-top: 1.5mm; padding-top: 1mm; border-top: 1px dotted #000;">
                <div class="totals-row" style="font-size:${w58 ? "8px" : "9.5px"}">
                    <span>Tasa del día:</span>
                    <span>1 ${esc(sym)} = ${fmtMoney(tasa, localSym)}</span>
                </div>
                <div class="totals-row bs">
                    <span>Total en ${esc(localSym)}:</span>
                    <span>${fmtMoney(totalMesa * tasa, localSym)}</span>
                </div>
            </div>
        ` : ""}
    </div>

    <div class="footer">
        <div>Documento no válido como factura fiscal</div>
        <div style="margin-top:0.5mm">¡Gracias por su preferencia!</div>
    </div>
</body>
</html>`;

    printHtml(html, { width: 300, height: 1200 });
}
