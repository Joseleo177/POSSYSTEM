import { useState, useEffect } from "react";
import Modal from "./ui/Modal";
import { api } from "../services/api";
import { useApp } from "../context/AppContext";
import { fmtMoney, fmtDate, resolveImageUrl, printInvoiceLetter, printHtml, toNameCase } from "../helpers";
import Money from "./ui/Money";

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
        // Recargo de cabecera (propina, servicio, delivery). Va discriminado en el papel:
        // el cliente tiene que poder ver qué parte del total no es mercancía.
        charge: parseFloat(sale.service_charge || 0),
        chargeLabel: (sale.service_charge_label || "Servicio").toUpperCase(),
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
        // Cuánto se abonó y cuánto queda. Sin esto el ticket de una venta a crédito no se
        // distinguía de uno pagado: ambos terminaban en el total y el "gracias por su compra".
        amount_paid: parseFloat(sale.amount_paid ?? sale.paid ?? 0),
        balance: parseFloat(sale.balance ?? 0),
        // Saldo a favor del cliente consumido por esta venta. No es un cobro —no entra dinero
        // a ninguna caja, así que no hay Payment que listar— pero sí es con lo que se pagó, y
        // sin nombrarlo el ticket decía PAGADO con la forma de pago en blanco.
        credit_applied: parseFloat(sale.credit_applied || 0),
        // Cobros de la venta. getOneSale los devuelve en `Payments`; el flujo de caja los va
        // acumulando en `payments` a medida que se registran. Una venta puede cobrarse por
        // varios canales —parte en divisas, parte en punto de venta— y el ticket tiene que
        // decir cuánto entró por cada uno, no solo por el último.
        payments: (sale.Payments || sale.payments || []).map(p => ({
            journal_name: p.journal_name || null,
            amount: parseFloat(p.amount || 0),
            exchange_rate: parseFloat(p.exchange_rate || 1),
            // El vuelto entregado en ese cobro. `amount` es el dinero que ENTRÓ —incluye lo
            // que se devolvió—, así que sin esto el papel no puede decir cuánto entregó el
            // cliente ni cuánto se le regresó: las dos cifras que mira al recibir el ticket.
            change_given: parseFloat(p.change_given || 0),
            created_at: p.created_at || null,
        })),
    };
}

// Tasas distintas con que entraron bolívares a esta venta. Con más de una, ninguna tasa sola
// convierte la factura en lo que el cliente pagó: abonó una parte a la tasa de un día y el
// resto a la de otro.
const tasasEnBs = (payments) => new Set(
    (payments || [])
        .filter(p => parseFloat(p.amount) > 0 && parseFloat(p.exchange_rate) > 1)
        .map(p => parseFloat(p.exchange_rate).toFixed(4))
);

const fechaCorta = (d) => d
    ? new Date(d).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" })
    : "";
const fmtTasa = (r) => parseFloat(r).toFixed(4).replace(/\.?0+$/, "");

// Cómo quedó la venta al emitir el ticket. Se imprime siempre —incluso pagada— porque el
// papel es el comprobante que se llevan cliente y tienda: si no dice cómo se pagó, una venta
// a crédito y una cobrada en efectivo son indistinguibles después.
function paymentSummary(s) {
    const status = (s.status || "").toLowerCase();
    const pendiente = ["pendiente", "parcial", "borrador", "espera"].includes(status);

    // Un cobro por canal. Se agrupan por diario: pagar dos veces por la misma caja es una
    // sola forma de pago con el monto sumado, no dos líneas repetidas en el papel.
    //
    // Un cobro al que no le llegó el nombre de su caja NO se descarta: se imprime como
    // "Cobro". Saltárselo era peor que un nombre genérico — dejaba el renglón de forma de
    // pago vacío sobre una venta marcada PAGADO, y el dinero de ese canal desaparecía del
    // comprobante que se lleva el cliente.
    const porDiario = [];
    for (const p of s.payments || []) {
        if (!(p.amount > 0)) continue;
        const nombre = p.journal_name || "Cobro";
        const found = porDiario.find(x => x.journal_name === nombre);
        if (found) found.amount += p.amount;
        else porDiario.push({ journal_name: nombre, amount: p.amount });
    }
    // El saldo a favor no es un cobro pero sí una forma de pago: es lo que saldó la factura.
    if (s.credit_applied > 0) porDiario.push({ journal_name: "Saldo a favor", amount: s.credit_applied });
    // Respaldo para el ticket que se imprime justo tras cobrar, cuando aún no hay lista de
    // pagos pero sí se sabe por dónde entró.
    if (!porDiario.length && s.journal_name) porDiario.push({ journal_name: s.journal_name, amount: s.amount_paid });

    // Lo que el cliente puso sobre el mostrador y lo que se le devolvió. `amount` de cada
    // cobro es el dinero recibido —el vuelto todavía está dentro—, así que el papel puede
    // decir las dos cifras y que el cliente las verifique contra lo que tiene en la mano.
    const recibido = (s.payments || []).reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);
    const vuelto   = (s.payments || []).reduce((acc, p) => acc + parseFloat(p.change_given || 0), 0);

    // Abonos a tasas distintas: cada cobro se detalla por separado y en SU moneda, con su tasa
    // y su fecha. Agruparlos por caja sumaría bolívares de días distintos como si valieran lo
    // mismo; es la única forma de que el papel diga exactamente lo que el cliente entregó.
    const multiTasa = tasasEnBs(s.payments).size > 1;
    const cobros = multiTasa
        ? (s.payments || []).filter(p => p.amount > 0).map(p => ({
            journal_name: p.journal_name || "Cobro",
            fecha: fechaCorta(p.created_at),
            enBs: p.exchange_rate > 1,
            monto: Math.round(p.amount * (p.exchange_rate > 1 ? p.exchange_rate : 1) * 100) / 100,
            tasa: p.exchange_rate,
        }))
        : [];

    return {
        pendiente,
        multiTasa,
        cobros,
        canales: porDiario,
        recibido,
        vuelto,
        // Con un solo canal basta el nombre; con varios se listan aparte con su monto.
        metodo: porDiario.length === 1 ? porDiario[0].journal_name
            : porDiario.length > 1 ? "Combinado"
            : (pendiente ? "Crédito" : "—"),
        etiqueta: status === "parcial" ? "Abono parcial"
            : status === "pagado" ? "Pagado"
            : status === "exonerado" ? "Saldo exonerado"
            : pendiente ? "Pendiente de pago"
            : null,
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
            // Mismo redondeo por línea que en bolívares y que el backend al calcular
            // sales.total: se redondea el precio unitario y ESE es el que se multiplica.
            //
            // Antes el subtotal salía del precio sin redondear (1,01955 × 20 = 20,39) mientras
            // el papel imprimía el unitario ya redondeado (1,02), así que la propia línea del
            // ticket no cuadraba —1,02 × 20 son 20,40— y el total discrepaba en un céntimo con
            // el que el cliente acababa de ver en pantalla.
            const p = round2(parseFloat(i.price || 0));
            const d = round2(parseFloat(i.discount || 0));
            const sub = round2((p - d) * qty);
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
    // El recargo se convierte una sola vez, al final, igual que el descuento: no es una línea
    // que se multiplique por cantidad. Mismo criterio que saleTotalAtRate y que el backend.
    const chargeBs = isBs ? round2(s.charge * rate) : s.charge;
    let totalBs = 0;

    if (isBs) {
        subtotalBs = items.reduce((acc, i) => acc + i.subtotalBs, 0);
        totalBs = Math.max(0, subtotalBs - discountBs + chargeBs);
    } else {
        // En divisas el subtotal sale de las mismas líneas que la pista en Bs —ya redondeadas
        // arriba—. Antes se derivaba de total_precise, que es la suma bruta de líneas sin el
        // descuento aplicado, así que un ticket en $ con descuento global lo mostraba en el
        // renglón pero no lo restaba del total.
        subtotalBs = items.length
            ? items.reduce((acc, i) => acc + i.subtotalBs, 0)
            : Math.max(0, s.total + s.discount - s.charge);
        totalBs = Math.max(0, subtotalBs - discountBs + chargeBs);
    }

    // Lo abonado y lo que queda debiendo salen de la MISMA pista que el TOTAL.
    //
    // Antes el saldo se convertía por su cuenta (balance en base × tasa) mientras el total se
    // arma redondeando cada línea y multiplicando por la cantidad. Con 20 unidades a Bs 775,34
    // el papel totalizaba Bs 15.506,80 y en la línea de abajo decía que el cliente debía
    // Bs 15.506,71: dos cifras distintas para la misma deuda, en el comprobante que se lleva.
    //
    // amount_paid ya viene neto de vuelto y con el crédito de cliente aplicado (getSaleBalance),
    // así que restarlo del total reproduce el saldo real sin recalcular nada.
    const paidBs    = isBs ? round2(s.amount_paid * rate) : s.amount_paid;
    const balanceBs = Math.max(0, round2(totalBs - paidBs));

    return {
        items,
        subtotalBs,
        fmtSubtotal: fmt(subtotalBs, sym),
        fmtDiscount: fmt(discountBs, sym),
        chargeBs,
        fmtCharge: fmt(chargeBs, sym),
        fmtTotal: fmt(totalBs, sym),
        totalBs,
        paidBs,
        balanceBs,
        fmtPaid:    fmt(paidBs, sym),
        fmtBalance: fmt(balanceBs, sym),
    };
}

// Tasa única con la que el papel de una factura abonada a varias tasas suma exactamente los
// bolívares que entraron.
//
// El promedio a secas (Bs cobrados ÷ Ref cubiertos) no basta: el total en bolívares se arma
// línea por línea —precio convertido y redondeado, por cantidad—, y con cantidades como 10,51
// kg ese redondeo cae distinto a cada tasa. En la A-0001794 el promedio daba un total 1,72 Bs
// por encima de lo cobrado. Se parte del promedio y se busca por bisección la tasa con la que
// ese mismo cálculo da lo cobrado; el total es creciente con la tasa, así que converge.
//
// Si además entró algo en divisas, esa parte se lleva a bolívares con la misma tasa buscada.
function tasaPromedio(s, enBs) {
    const round2 = n => Math.round(n * 100) / 100;
    const baseBs = enBs.reduce((a, p) => a + parseFloat(p.amount), 0);
    const cobradoBs = enBs.reduce((a, p) => a + round2(parseFloat(p.amount) * parseFloat(p.exchange_rate)), 0);
    const enRef = (s.payments || [])
        .filter(p => parseFloat(p.amount) > 0 && !(parseFloat(p.exchange_rate) > 1))
        .reduce((a, p) => a + parseFloat(p.amount), 0);
    const promedio = cobradoBs / baseBs;
    const conObjetivo = (rate) => ({ rate, objetivoBs: round2(cobradoBs + round2(enRef * rate)) });
    if (!s.items?.length) return conObjetivo(promedio);

    const exceso = (r) => calcReceiptTotals(s, r, "").totalBs - round2(enRef * r) - cobradoBs;
    // La búsqueda no sale del rango de las tasas cobradas: en una factura de céntimos el
    // redondeo pesa tanto que la tasa "exacta" podía quedar en 866 cuando se cobró a 849 y 853,
    // y los precios del papel saldrían inflados. Lo que no cuadre lo cubre ajusteRedondeo.
    // La tasa no se imprime: el usuario no la quiere en el comprobante (01-10-2026).
    const tasas = enBs.map(p => parseFloat(p.exchange_rate));
    let lo = Math.min(...tasas), hi = Math.max(...tasas);
    const masCercana = (a, b) => (Math.abs(exceso(a)) <= Math.abs(exceso(b)) ? a : b);
    if (exceso(lo) >= 0 || exceso(hi) <= 0) return conObjetivo(masCercana(lo, masCercana(promedio, hi)));
    for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
        const mid = (lo + hi) / 2;
        if (exceso(mid) < 0) lo = mid; else hi = mid;
    }
    // hi es la menor tasa que ya alcanza lo cobrado; si por el redondeo ninguna lo da exacto,
    // se queda con la más cercana de las dos.
    return conObjetivo(masCercana(hi, lo));
}

// Céntimos entre el total armado línea por línea y los bolívares que de verdad entraron, en
// una factura abonada a varias tasas. Ninguna tasa única cuadra siempre al céntimo (el total
// avanza a saltos con cantidades como 10,51 kg), y el papel tiene que terminar en lo pagado.
// Más del 1 % del total no es redondeo —son cobros que no corresponden a la factura, como un
// sobrepago— y no se toca.
function ajusteRedondeo(totals, cur) {
    if (!cur?.promedio) return 0;
    const ajuste = Math.round((cur.objetivoBs - totals.totalBs) * 100) / 100;
    return Math.abs(ajuste) >= 0.01 && Math.abs(ajuste) <= totals.totalBs * 0.01 ? ajuste : 0;
}

// Totales del papel con el redondeo ya aplicado. Lo usan la impresión, la vista previa y el
// PDF, que tienen que decir exactamente lo mismo.
//
// Los céntimos van dentro del SUBTOTAL y del TOTAL, sin una línea propia: el usuario no quiere
// un renglón "Redondeo" en el comprobante (01-10-2026). Así el total sigue siendo lo pagado y
// subtotal − descuento + recargo sigue dando el total.
function totalesDelPapel(s, cur) {
    const calc = calcReceiptTotals(s, cur.rate, cur.sym);
    const ajuste = ajusteRedondeo(calc, cur);
    if (!ajuste) return calc;
    const r2 = n => Math.round(n * 100) / 100;
    const subtotalBs = r2(calc.subtotalBs + ajuste);
    const totalBs    = r2(calc.totalBs + ajuste);
    return {
        ...calc,
        subtotalBs,
        fmtSubtotal: fmt(subtotalBs, cur.sym),
        totalBs,
        fmtTotal: fmt(totalBs, cur.sym),
    };
}

/**
 * En qué moneda se imprime el papel.
 *
 * El bolívar solo aparece cuando el papel describe bolívares que ya entraron: una factura
 * saldada con dinero recibido en esa moneda. Ahí manda la moneda de pantalla, porque es la
 * que permite cuadrar el comprobante contra lo que hay en la gaveta.
 *
 * En los demás casos va en divisas:
 *   · cobrada íntegramente en divisas — el cliente pagó 17 cervezas a 1$ y eso es lo que
 *     debe decir el papel, no su equivalente en bolívares a la tasa de hoy;
 *   · con saldo pendiente (crédito, abono parcial, cuenta en espera) — una deuda impresa en
 *     bolívares queda desactualizada apenas se mueve la tasa, y el cliente vuelve con un
 *     papel que ya no dice lo que debe. En divisas el saldo sigue siendo el mismo mañana.
 */
export function receiptCurrency(s, displayCurrency, baseCurrency) {
    const enDivisas = { rate: 1, sym: baseCurrency?.symbol || "Ref." };
    const pagos = (s.payments || []).filter(p => parseFloat(p.amount) > 0);
    // Basta con que ALGO haya entrado en bolívares: en un cobro mixto el papel se imprime en
    // la moneda de la gaveta que hay que cuadrar. Sin bolívares de por medio —cobrada en
    // divisas, exonerada, o todavía sin cobrar— no hay nada que expresar en esa moneda.
    const huboBolivares = pagos.some(p => parseFloat(p.exchange_rate) > 1);
    const saldada = ["pagado", "exonerado"].includes(String(s.status || "").toLowerCase());

    if (!huboBolivares || !saldada) return enDivisas;

    // Abonada a tasas distintas (una parte hoy, el resto otra semana): el papel va igual en
    // bolívares, a la tasa PROMEDIO de lo cobrado en bolívares —los Bs que entraron entre los
    // Ref. que cubrieron—. Es la única tasa con la que el total impreso da lo que el cliente
    // pagó en total; cada abono se detalla además con su propia tasa (paymentSummary → cobros).
    const enBs = pagos.filter(p => parseFloat(p.exchange_rate) > 1);
    if (tasasEnBs(pagos).size > 1) {
        return { ...tasaPromedio(s, enBs), sym: displayCurrency?.symbol || "Ref.", promedio: true };
    }

    // Saldada con bolívares: se imprime a la tasa del pago que cerró la deuda, que es la que
    // convierte el papel en los bolívares que de verdad se contaron.
    //
    // Esa tasa sale de los propios cobros (llegan en orden de registro), del último que entró
    // en bolívares. Antes se leía final_payment_rate, que solo trae el listado de facturas:
    // desde la caja y desde getOneSale se caía a la tasa con que se emitió la factura, y una
    // factura de hace días cobrada hoy salía impresa con los bolívares de entonces (A-0008:
    // Bs 29.000,40 a 845 cuando entraron 29.483,02 a 859,06), un monto que nadie pagó.
    // huboBolivares garantiza que ese cobro existe.
    const rate = parseFloat(enBs[enBs.length - 1].exchange_rate);
    return { rate, sym: displayCurrency?.symbol || "Ref." };
}

// displayCurrency: la moneda no-base (VES). Los montos del recibo se convierten a ella salvo
// que el cobro haya entrado en divisas (ver receiptCurrency).
// sale.total y item.price están siempre en USD base.
//
// Se exporta porque la caja imprime sin abrir el ticket: el cajero que atiende una cola no
// necesita la vista previa, necesita el papel. Es la misma función que usa el botón de
// impresión del modal, para que ambos caminos den exactamente el mismo comprobante.
export function printReceipt(sale, companyInfo, displayCurrency, printerWidth = 80, baseCurrency = null) {
    const storeName = companyInfo?.name || "MI TIENDA POS";
    // Mientras no haya homologación esto no es una factura fiscal, y el papel no debe decir
    // que lo es. Sale de Configuración para que el día que se homologue baste cambiarlo ahí.
    const docName = companyInfo?.doc_name || "Documento de Venta";
    const s = normalizeSale(sale);
    const cur = receiptCurrency(s, displayCurrency, baseCurrency);
    const { rate, sym } = cur;
    const totals = totalesDelPapel(s, cur);
    const pago = paymentSummary(s);
    const bsSym = displayCurrency?.symbol || "Bs.";
    const refSym = baseCurrency?.symbol || "Ref.";
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
    <title>${docName} ${s.invoice_number || s.id}</title>
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
 .store-info { font-size: ${printerWidth === 58 ? "7px" : "8.5px"}; color: #000; margin-top: 0.5mm; }

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
        /* overflow-wrap y no word-break: word-break parte la palabra en cuanto se acaba el
           renglón, así que en la columna angosta del ticket "CAFE AMANECER" salía cortado en
           pedazos letra a letra ("CAFE / AMA / NECE / R"). Así solo se parte la palabra que de
           verdad no cabe entera. */
        .item-name { max-width: ${printerWidth === 58 ? "20mm" : "32mm"}; overflow-wrap: break-word; font-weight: 600; text-transform: uppercase; }
 /* Separación entre columnas: sin ella cantidad, P.U. y total se leen como un solo bloque. */
 .td-center { text-align: center; padding-left: 1.5mm; padding-right: 1.5mm; }
 .td-right { text-align: right; padding-left: 1.5mm; }
 /* TODO el texto va en negro puro: la térmica es de 1 bit, no imprime grises. Un #444
 lo simula con un patrón de puntos disperso y sale lavado, casi ilegible.
 La jerarquía entre columnas se logra con el grosor y la "x" de la cantidad. */
 .qty { color: #000; font-weight: 700; white-space: nowrap; }
 .unit-price { color: #000; font-weight: 700; white-space: nowrap; }
 .line-total { color: #000; font-weight: 800; white-space: nowrap; }

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
        ${s.customer_rif ? `<div class="meta-row"><span class="meta-label">C.I./RIF:</span><span class="meta-value">${s.customer_rif}</span></div>` : ""}
    </div>

    <table>
        <thead>
            <tr>
                <th>Producto</th>
                <th class="td-center">Cant</th>
                <th class="td-right">P.U.</th>
                <th class="td-right">Total</th>
            </tr>
        </thead>
        <tbody>
            ${totals.items.map(i => `
                <tr>
                    <td><div class="item-name">${i.name}</div></td>
                    <td class="td-center qty">x ${fmtQty(i.quantity)}</td>
                    <td class="td-right unit-price">${fmtPRow(i.fmtPrice)}</td>
                    <td class="td-right line-total">${fmtPRow(i.fmtSubtotal)}</td>
                </tr>
            `).join("")}
        </tbody>
    </table>

    <div class="totals">
        <div class="total-row"><span>SUBTOTAL</span><span>${totals.fmtSubtotal}</span></div>
        ${s.discount > 0 ? `<div class="total-row discount"><span>DESCUENTO</span><span>-${totals.fmtDiscount}</span></div>` : ""}
        ${s.charge > 0 ? `<div class="total-row"><span>${s.chargeLabel}</span><span>+${totals.fmtCharge}</span></div>` : ""}
        <div class="total-row big"><span>TOTAL</span><span>${totals.fmtTotal}</span></div>
    </div>

    <div class="totals">
        <div class="total-row"><span>FORMA DE PAGO</span><span>${pago.metodo}</span></div>
        ${pago.multiTasa
            ? pago.cobros.map(c => `
        <div class="total-row"><span>&nbsp;&nbsp;${c.journal_name}${c.fecha ? ` ${c.fecha}` : ""}</span><span>${fmt(c.monto, c.enBs ? bsSym : refSym)}</span></div>
        ${c.enBs ? `<div class="total-row"><span>&nbsp;&nbsp;&nbsp;&nbsp;Tasa ${fmtTasa(c.tasa)}</span><span></span></div>` : ""}`).join("")
            : pago.canales.length > 1
            ? pago.canales.map(c => `<div class="total-row"><span>&nbsp;&nbsp;${c.journal_name}</span><span>${fmt(c.amount * rate, sym)}</span></div>`).join("")
            : ""}
        ${pago.vuelto > 0 ? `
        <div class="total-row"><span>RECIBIDO</span><span>${fmt(pago.recibido * rate, sym)}</span></div>
        <div class="total-row"><span>CAMBIO</span><span>${fmt(pago.vuelto * rate, sym)}</span></div>` : ""}
        ${pago.etiqueta ? `<div class="total-row"><span>ESTADO</span><span>${pago.etiqueta.toUpperCase()}</span></div>` : ""}
        ${s.amount_paid > 0 && pago.pendiente ? `<div class="total-row"><span>ABONADO</span><span>${totals.fmtPaid}</span></div>` : ""}
        ${pago.pendiente && s.balance > 0 && totals.balanceBs > 0 ? `<div class="total-row big"><span>QUEDA DEBIENDO</span><span>${totals.fmtBalance}</span></div>` : ""}
    </div>

    <div class="footer">${companyInfo?.footer || "¡Gracias por su compra!<br>Vuelva pronto"}</div>
</body>
</html>`;

    printHtml(html, { width: 300, height: 1200 });
}

export default function ReceiptModal({ open, onClose, sale }) {
    const { storeName, companyInfo, baseCurrency, activeCurrencies, printerWidth } = useApp();

    // El ticket se abre desde tres sitios y cada uno entrega algo distinto:
    //   · caja        → la venta recién cobrada, con sus pagos ya compuestos
    //   · Facturas    → la fila de getAllSales: tiene ítems, pero no los cobros
    //   · Pagos       → un registro de PAGO, cuyo id es el del cobro y no trae ni total ni
    //                   ítems de la venta (ahí el comprobante salía en Bs.0,00 y sin productos)
    //
    // Por eso el id de la venta se toma de sale_id cuando existe, y se completa con getOneSale
    // —la única consulta que devuelve ítems y cobros juntos— salvo que ya venga todo.
    const saleId = sale?.sale_id ?? sale?.id ?? null;
    // Un cobro sin nombre de caja deja el comprobante sin forma de pago, así que la venta no
    // está "completa" mientras le falte: se consulta igual, que es de donde sale el nombre.
    const pagosRecibidos = sale?.Payments || sale?.payments || [];
    // Y si los cobros recibidos no suman lo abonado, faltan abonos de otro día (cada uno con su
    // tasa): la caja solo conoce los que se registraron en esa pantalla.
    const sumaCobros = pagosRecibidos.reduce((a, p) => a + (parseFloat(p?.amount) || 0), 0)
        + (parseFloat(sale?.credit_applied) || 0);
    const yaCompleto = pagosRecibidos.length > 0
        && sumaCobros + 0.01 >= (parseFloat(sale?.amount_paid) || 0)
        && pagosRecibidos.every(p => p?.journal_name)
        && Array.isArray(sale?.items) && sale.items.length > 0;

    const [fetched, setFetched] = useState(null);
    useEffect(() => {
        if (!open || !saleId || yaCompleto) { setFetched(null); return; }
        let alive = true;
        api.sales.getOne(saleId)
            .then(r => alive && setFetched(r.data))
            .catch(() => { /* se muestra lo que haya: mejor un ticket parcial que ninguno */ });
        return () => { alive = false; };
    }, [open, saleId, yaCompleto]);

    if (!open || !sale) return null;

    // Lo pedido manda porque es la venta completa; encima van los datos que solo existen en el
    // objeto del recibo (moneda y serie con que se cobró en caja).
    //
    // Esta variable es la fuente única del comprobante: la pantalla, el PDF y la impresión
    // térmica parten de aquí. Antes la impresión recibía la prop `sale` sin completar, así que
    // el papel salía con "FORMA DE PAGO —" mientras la pantalla mostraba el diario correcto.
    const effectiveSale = fetched
        ? { ...fetched, currency: sale.currency, exchangeRate: sale.exchangeRate, serie: sale.serie }
        : sale;
    const s = normalizeSale(effectiveSale);

    // La moneda de pantalla es la no-base (VES); si no hay, se cae a la base.
    const displayCurrency = activeCurrencies?.find(c => !c.is_base) || baseCurrency;
    const isBase = !displayCurrency || displayCurrency.is_base;
    // La vista previa tiene que mostrar EXACTAMENTE el papel que va a salir, así que decide la
    // moneda con la misma regla que la impresión.
    const cur = isBase
        ? { rate: 1, sym: baseCurrency?.symbol || "Ref." }
        : receiptCurrency(s, displayCurrency, baseCurrency);
    const { rate, sym } = cur;
    const totals = totalesDelPapel(s, cur);
    const pago = paymentSummary(s);

    const dateStr = fmtDate(s.created_at);
    const invoiceLabel = s.invoice_number || `#${s.id}`;
    // Cómo se llama el documento. Sale de Configuración porque hasta que el sistema no esté
    // homologado lo que se entrega no es una factura fiscal, y el papel no debe afirmarlo.
    const docLabel = companyInfo?.doc_name || "Documento de Venta";

    return (
        <Modal open={open} onClose={onClose} title={`${docLabel} ${invoiceLabel}`} width={400}>
            {/* Encabezado empresa */}
            <div className="text-center mb-4 pb-4 border-b border-border/60 dark:border-white/[0.06]">
                {companyInfo?.show_header !== false && (
                    <>
                        {companyInfo?.logo_url && (
                            <img src={resolveImageUrl(companyInfo.logo_url)} alt="logo" className="mx-auto mb-2 max-h-16 w-auto object-contain" />
                        )}
                        <div className="text-sm font-bold text-content dark:text-content-dark tracking-wide">{storeName}</div>
                        {companyInfo?.rif && <div className="text-[12px] text-content-muted dark:text-content-dark-muted mt-0.5">RIF: {companyInfo.rif}</div>}
                        {companyInfo?.slogan && <div className="text-[12px] italic text-content-subtle mt-0.5">{companyInfo.slogan}</div>}
                        {companyInfo?.address && <div className="text-[12px] text-content-muted dark:text-content-dark-muted mt-1">{companyInfo.address}</div>}
                        {(companyInfo?.city || companyInfo?.phone) && (
                            <div className="text-[12px] text-content-muted dark:text-content-dark-muted">
                                {[companyInfo.city, companyInfo.phone, companyInfo.phone2].filter(Boolean).join(" · ")}
                            </div>
                        )}
                        {companyInfo?.email && <div className="text-[12px] text-content-subtle">{companyInfo.email}</div>}
                    </>
                )}
                <div className={`text-[12px] text-content-subtle ${companyInfo?.show_header !== false ? "mt-2" : ""}`}>Comprobante de venta</div>
            </div>

            {/* Datos del documento y del cliente, en una sola lista */}
            <div className="mb-4">
                <Linea label="N°">{invoiceLabel}</Linea>
                <Linea label="Fecha">{dateStr}</Linea>
                {s.employee_name && <Linea label="Vendedor">{toNameCase(s.employee_name)}</Linea>}
                {(s.customer_name || s.customer_rif) && (
                    <Linea label="Cliente">
                        <span className="block truncate">{toNameCase(s.customer_name) || "—"}</span>
                        {s.customer_rif && <span className="block text-[12px] font-normal text-content-subtle">{s.customer_rif}</span>}
                    </Linea>
                )}
            </div>

            {/* Ítems: dos renglones por producto, que en el teléfono se leen sin tabla. */}
            <div className="border-y border-border/60 dark:border-white/[0.06] divide-y divide-dashed divide-border/70 dark:divide-white/[0.08] mb-3">
                {totals.items.map((item, idx) => (
                    <div key={idx} className="py-2">
                        <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="font-medium text-content dark:text-white min-w-0">{item.name}</span>
                            <Money value={item.fmtSubtotal} className="font-semibold text-content dark:text-white shrink-0" />
                        </div>
                        <div className="text-[12px] text-content-subtle tabular-nums mt-0.5">
                            {parseFloat(item.quantity) % 1 === 0 ? Math.round(parseFloat(item.quantity)) : item.quantity} × {item.fmtPrice}
                        </div>
                    </div>
                ))}
            </div>

            {/* Totales */}
            <div className="mb-3">
                {(s.discount > 0 || s.charge > 0) && (
                    <>
                        <Linea label="Subtotal"><Money value={totals.fmtSubtotal} /></Linea>
                        {s.discount > 0 && <Linea label="Descuento"><Money value={`-${totals.fmtDiscount}`} /></Linea>}
                        {s.charge > 0 && <Linea label={s.chargeLabel.charAt(0).toUpperCase() + s.chargeLabel.slice(1).toLowerCase()}><Money value={`+${totals.fmtCharge}`} /></Linea>}
                    </>
                )}
                <div className="flex items-baseline justify-between gap-3 pt-1.5">
                    <span className="text-[13px] font-semibold text-content dark:text-white">Total</span>
                    <Money value={totals.fmtTotal} className="text-[20px] font-bold tracking-tight text-content dark:text-white" />
                </div>
            </div>

            {/* Forma de pago y estado — mismo bloque que se imprime en el papel. */}
            <div className="border-t border-border/60 dark:border-white/[0.06] pt-2 mb-4">
                <Linea label="Forma de pago">{pago.metodo}</Linea>
                {/* Con más de un canal se detalla cuánto entró por cada uno: "Combinado" a secas
                    no permite cuadrar el ticket contra las cajas. */}
                {/* Abonos a tasas distintas: cada uno en su moneda, con fecha y tasa. */}
                {pago.multiTasa && pago.cobros.map((c, i) => (
                    <Linea
                        key={i}
                        label={
                            <span className="pl-3 block">
                                {toNameCase(c.journal_name)}{c.fecha ? ` · ${c.fecha}` : ""}
                                {c.enBs && <span className="block text-[12px]">Tasa {fmtTasa(c.tasa)}</span>}
                            </span>
                        }
                    >
                        <Money value={fmt(c.monto, c.enBs ? (displayCurrency?.symbol || "Bs.") : (baseCurrency?.symbol || "Ref."))} />
                    </Linea>
                ))}
                {!pago.multiTasa && pago.canales.length > 1 && pago.canales.map(c => (
                    <Linea key={c.journal_name} label={<span className="pl-3">{toNameCase(c.journal_name)}</span>}>
                        <Money value={fmt(c.amount * rate, sym)} />
                    </Linea>
                ))}
                {/* Lo que entregó el cliente y lo que se le devolvió: las dos cifras que
                    verifica contra el dinero que tiene en la mano al recibir el ticket. */}
                {pago.vuelto > 0 && (
                    <>
                        <Linea label="Recibido"><Money value={fmt(pago.recibido * rate, sym)} /></Linea>
                        <Linea label="Vuelto"><Money value={fmt(pago.vuelto * rate, sym)} /></Linea>
                    </>
                )}
                {pago.etiqueta && (
                    <Linea label="Estado">
                        {/* Color = señal: rojo si se debe, verde solo con el visto. */}
                        {pago.pendiente ? (
                            <span className="text-red-600 dark:text-red-400">{pago.etiqueta}</span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                {pago.etiqueta}
                            </span>
                        )}
                    </Linea>
                )}
                {/* Mismos importes que el papel: salen de calcReceiptTotals, no de una
                    conversión aparte. Pantalla e impresión no pueden discrepar. */}
                {s.amount_paid > 0 && pago.pendiente && (
                    <Linea label="Abonado"><Money value={totals.fmtPaid} /></Linea>
                )}
                {/* Si hay deuda lo decide el backend (s.balance); cuánto es, la pista del
                    papel. Al revés, el residuo de redondeo imprimiría un "queda debiendo"
                    de céntimos sobre una factura que el sistema ya da por saldada. */}
                {pago.pendiente && s.balance > 0 && totals.balanceBs > 0 && (
                    <div className="flex items-baseline justify-between gap-3 mt-1.5 pt-2 border-t border-border/60 dark:border-white/[0.06]">
                        <span className="text-[13px] font-semibold text-red-600 dark:text-red-400">Queda debiendo</span>
                        <Money value={totals.fmtBalance} className="text-[16px] font-bold text-red-600 dark:text-red-400" />
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="text-center text-[12px] text-content-subtle mb-5">¡Gracias por su compra!</div>

            {/* Botones. Imprimir saca el ticket térmico (rollo); PDF genera la misma factura
                en tamaño carta, que es la que se le envía al cliente por WhatsApp o correo:
                el ticket guardado como PDF sale como una tira angosta ilegible. */}
            <div className="flex gap-2 pt-4 border-t border-border/60 dark:border-white/[0.06]">
                <button onClick={onClose} className="btn-outline h-11 px-4 rounded-lg text-[13px] font-medium">
                    Cerrar
                </button>
                <button
                    onClick={() => printInvoiceLetter({ sale: s, totals, companyInfo })}
                    className="btn-outline h-11 px-4 rounded-lg text-[13px] font-medium inline-flex items-center justify-center gap-1.5"
                    title="Factura tamaño carta, para enviar al cliente por WhatsApp o correo"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    PDF
                </button>
                <button
                    onClick={() => printReceipt(effectiveSale, companyInfo, displayCurrency, printerWidth, baseCurrency)}
                    className="btn-accent flex-1 h-11 rounded-lg text-[14px] font-semibold inline-flex items-center justify-center gap-2"
                    title="Ticket para la impresora térmica"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Imprimir
                </button>
            </div>
        </Modal>
    );
}

// Fila de dato de la vista previa: rótulo gris a la izquierda, valor en tinta a la derecha.
function Linea({ label, children }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
            <span className="text-content-subtle shrink-0">{label}</span>
            <span className="font-medium text-content dark:text-white text-right tabular-nums min-w-0">{children}</span>
        </div>
    );
}
