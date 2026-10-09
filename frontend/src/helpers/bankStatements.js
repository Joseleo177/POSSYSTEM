import * as XLSX from "xlsx";

/**
 * Lectura de extractos bancarios venezolanos.
 *
 * Es el port de los parsers de ExtractFlow (BankApp), que ya leían estos bancos en
 * producción. Igual que la importación de productos, el archivo se lee en el navegador —ahí
 * está la vista previa— y al servidor llegan filas normalizadas, que él vuelve a validar.
 *
 * Cada lector devuelve filas { date, description, tagged, reference, debit, credit, balance }:
 *   description  el texto del banco, que es lo que se muestra
 *   tagged       el mismo texto con las marcas de ExtractFlow ("COM.", "COM DOM.",
 *                "INT. BANCARIOS"): de ahí sale si la línea es comisión, impuesto o interés
 *
 * Donde ExtractFlow leía por posición fija (fila 6, columna 13) se busca primero la fila de
 * encabezados: un banco que agrega una fila de título no debe romper la lectura.
 *
 * PDF: por ahora el estado de cuenta del Banco de Venezuela (ver PDF_PARSERS). Se lee con
 * pdf.js por posición de las palabras y se comprueba contra el resumen que trae su cabecera.
 */

export const BANK_FORMATS = [
    { key: "venezuela",          label: "Banco de Venezuela",          codes: ["0102"], words: ["venezuela", "bdv"] },
    { key: "banesco",            label: "Banesco",                     codes: ["0134"], words: ["banesco"] },
    { key: "mercantil",          label: "Mercantil",                   codes: ["0105"], words: ["mercantil"] },
    { key: "provincial",         label: "BBVA Provincial",             codes: ["0108"], words: ["provincial", "bbva"] },
    { key: "bnc",                label: "BNC",                         codes: ["0191"], words: ["bnc", "nacional de credito"] },
    { key: "plaza",              label: "Banco Plaza",                 codes: ["0138"], words: ["plaza"] },
    { key: "bancaribe",          label: "Bancaribe",                   codes: ["0114"], words: ["bancaribe", "caribe"] },
    { key: "bdt",                label: "Banco Digital de los Trabajadores", codes: ["0175"], words: ["trabajadores", "bdt"] },
    { key: "venezolano_credito", label: "Venezolano de Crédito",       codes: ["0104"], words: ["venezolano de credito", "venecredit"] },
    { key: "generico",           label: "Otro banco (columnas estándar)", codes: [], words: [] },
];

const norm = (v) => String(v ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Formato sugerido para un banco del sistema: por su código (0102, 0134…) o por el nombre.
export function suggestFormat(bank) {
    if (!bank) return "generico";
    const code = String(bank.bank_code || bank.code || "").padStart(4, "0");
    const byCode = BANK_FORMATS.find(f => f.codes.includes(code));
    if (byCode) return byCode.key;
    const name = norm(bank.bank_name || bank.name);
    const byName = BANK_FORMATS.find(f => f.words.some(w => name.includes(w)));
    return byName ? byName.key : "generico";
}

// ── Celdas ────────────────────────────────────────────────────────────────────

const txt = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v).trim();
    return s.toLowerCase() === "nan" ? "" : s;
};

/**
 * Número de una celda. Una celda numérica de Excel se usa tal cual: ExtractFlow la pasaba
 * por str() y quitaba los puntos, y un 1234.56 nativo se volvía 123456.
 *   've'    1.234,56  (punto de miles, coma decimal)
 *   'en'    1,234.56
 *   'smart' el separador más a la derecha es el decimal (Provincial trae los dos formatos)
 */
function num(v, style = "smart") {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    let s = String(v).trim();
    const neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
    s = s.replace(/[^\d.,]/g, "");
    if (!s) return 0;
    if (style === "ve") s = s.replace(/\./g, "").replace(",", ".");
    else if (style === "en") s = s.replace(/,/g, "");
    else {
        const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
        s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n)) return 0;
    return neg ? -n : n;
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => {
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/**
 * Fecha 'YYYY-MM-DD' de una celda. Los bancos venezolanos escriben día/mes/año; Bancaribe es
 * la excepción (mes/día/año), y si el "mes" pasa de 12 se lee al revés, como hacía ExtractFlow.
 */
function toISO(v, order = "dmy") {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") {
        if (v < 20000 || v > 80000) return null;           // no es un serial de fecha
        // Serial de Excel (sistema 1900): días desde el 30/12/1899. Se calcula en UTC para
        // que la zona del navegador no corra el día.
        const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
        return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    if (v instanceof Date) return iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (m) {
        let [a, b] = [+m[1], +m[2]];
        if (order === "mdy") [a, b] = [b, a];
        if (b > 12 && a <= 12) [a, b] = [b, a];
        return iso(+m[3], b, a);
    }
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    return null;
}

// Fila de encabezados: la primera (de las 40 primeras) que tiene todas las columnas pedidas.
function findHeader(rows, required, limit = 40) {
    for (let i = 0; i < Math.min(rows.length, limit); i++) {
        const cells = (rows[i] || []).map(norm);
        if (required.every(r => cells.some(c => (Array.isArray(r) ? r : [r]).some(x => c === x || c.startsWith(x))))) {
            return { index: i, cells };
        }
    }
    return null;
}
const col = (cells, ...names) => {
    for (const n of names) { const i = cells.findIndex(c => c === n); if (i >= 0) return i; }
    for (const n of names) { const i = cells.findIndex(c => c.includes(n)); if (i >= 0) return i; }
    return -1;
};
const at = (row, i) => (i >= 0 ? row?.[i] : null);

// ── Reglas de comisión (de ExtractFlow) ─────────────────────────────────────────

const RULES = {
    bancaribe: (d) => {
        if (d.includes("COMISION") && d.includes("COBRO") && (d.includes("INMEDIATO") || d.includes("DOMICILIADO"))) return d.replace("COMISION", "COM DOM.");
        if (d.includes("N/C INTERESES/RENDIMIENTOS CC")) return `INT. BANCARIOS ${d}`;
        if (d.includes("EMISION DE ESTADO DE CUENTA") || d.includes("RET IMP PAGO INT/REND CC")) return `COM. ${d}`;
        return d;
    },
    banesco: (d) => {
        d = d.replace("Com.", "COM.").replace("COM.SERV", "COM. SERV");
        if (["SERV MTTO. POS/NATIVA", "ARRENDAMIENTO/NATIVA", "EMISION DE ESTADO DE CUENTA", "CONTRAPRESTACION PAGO NOMINA"].some(k => d.includes(k))) return `COM. ${d}`;
        return d;
    },
    bdt: (d) => {
        d = d.replace(/\bCOM\b(?!\.)/g, "COM.");
        if (!d.includes("COM.") && ["SERVICIO MENSAJERIA", "MANT AFIL CANAL VIRT", "CARGO POR SERVICIO"].some(k => d.includes(k))) return `COM. ${d}`;
        return d;
    },
    mercantil: (d) => {
        if (["OP.CRED.DIRT. CLTE-CLTE(PJ)-VIA ELECTRONICA", "EMISION EDO. DE CTA. MONEDA NAC. / EXT.", "TARIFA MANTENIMIENTO DE CUENTA"].some(k => d.includes(k))) d = `COM. ${d}`;
        if (d.includes("COBRO DE COMISIONES")) d = `COM DOM. ${d}`;
        return d;
    },
    plaza: (d) => {
        if (d.includes("TDY COM.P2C")) return d.replace("TDY COM.P2C", "COM. P2C");
        if (["DOM POS DGL", "POS BPL", "Mantenimiento cta", "CARGO POR MANTENIMIENTO CTA", "CARGO EMISION EDO DE CUENTA", "REEMB SERV CUST FONDOS DIVISAS", "PAG RENDI"].some(k => d.includes(k))) return `COM. ${d}`;
        return d;
    },
    provincial: (d) => {
        d = d.replace(/^'/, "");
        if (d.includes("PNCASH-COBRANZAS")) d = `COM DOM. ${d}`;
        if (d.startsWith("COMIS.")) d = `COM.${d.slice(6)}`;
        return d;
    },
    venezuela: (d) => {
        const map = [
            ["COMISION DOMICILIACION", "COM DOM. COMISION DOMICILIACION"],
            ["COM MANTENIMIENTO DE CUENTA", "COM. MANTENIMIENTO DE CUENTA"],
            ["COM PAGO OTRAS CTAS JUR NAT", "COM. PAGO OTRAS CTAS JUR NAT"],
            ["COM PAGO OTRAS CTAS JUR GUB", "COM. PAGO OTRAS CTAS JUR GUB"],
            ["PAG MOVIL BDV", "COM. PAG MOVIL BDV A"],
            ["COM TRANSF LINEA OT BCOS CTA P", "COM. TRANSF LINEA OT BCOS CTA P"],
            ["COM PAGO OTR BCOS JUR NAT", "COM. PAGO OTR BCOS JUR NAT"],
            ["COM PAGO OTR BCOS JUR JUR", "COM. PAGO OTR BCOS JUR JUR"],
            ["COM PAGO OTRAS CTAS JUR JUR", "COM. PAGO OTRAS CTAS JUR JUR"],
        ];
        const hit = map.find(([k]) => d.includes(k));
        return hit ? hit[1] : d;
    },
    venezolano_credito: (d) => {
        if ((d.includes("COMISION") || d.includes("COMISIÓN")) && d.includes("PAGO DE SERVICIOS")) return `COM DOM. ${d}`;
        if (d.includes("CUOTA DE MANTENIM.MENSUAL") || d.includes("GENER.PROC.DE EDO.CTA.CTE")) return `COM. ${d}`;
        if (d.includes("INTERESES CUENTA OPTIMA")) return `INT. BANCARIOS ${d}`;
        return d;
    },
};

// Regla general de ExtractFlow (_normalize): "comisión" y "domiciliación" sueltas también
// marcan la línea, en cualquier banco.
function generalRules(d) {
    if (d.includes("COM.") || d.includes("COM DOM.")) return d;
    // "COM BANCA MOVIL BDV", "COM MANTENIMIENTO DE CUEN": el BDV abrevia sin punto, y en el
    // PDF corta la descripción, así que la regla exacta de "COM MANTENIMIENTO DE CUENTA" no
    // alcanza. Solo al inicio: "COMPRA" no debe leerse como comisión.
    return d.replace(/^COM\b(?!\.)/i, "COM.")
        .replace(/\bdomiciliaci[oó]n\b/gi, "DOM. ").replace(/\bcomis(?:i[oó]n(?:es)?)?\b/gi, "COM.").replace(/\s{2,}/g, " ");
}

// Qué es la línea según el banco. El impuesto (IGTF, retenciones) va aparte de la comisión
// porque se registra en otra categoría.
function classify(tagged, debit, credit) {
    const t = String(tagged || "").toUpperCase();
    if (debit > 0) {
        if (/\bI\.?\s?G\.?\s?T\.?\s?F\b|\bITF\b|IMPUESTO|RET(ENCION)?\.? IMP/.test(t)) return "impuesto";
        if (/(^|\s)COM( DOM)?\./.test(t)) return "comision";
        // Interés cobrado por el banco (sobregiro, mora): es un cargo suyo, como una comisión.
        if (/(^|\s)INT\.|\bINTERES(ES)?\b/.test(t)) return "comision";
    }
    if (credit > 0 && (/^INT\. BANCARIOS/.test(t) || /\bINTERES(ES)?\b/.test(t))) return "interes";
    return "movimiento";
}

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

// Cuántas veces el saldo no es el anterior más el abono menos el cargo.
const balanceBreaks = (ls) => {
    let n = 0;
    for (let i = 1; i < ls.length; i++) {
        const a = ls[i - 1].balance, b = ls[i];
        if (a === null || a === undefined || b.balance === null || b.balance === undefined) continue;
        if (Math.abs(Math.round((a + b.credit - b.debit) * 100) / 100 - b.balance) > 0.011) n++;
    }
    return n;
};

// Orden cronológico de un extracto que puede venir del más nuevo al más viejo. Manda el saldo:
// el orden correcto es el que lo encadena. Sin saldos, se mira la fecha de la primera y la última.
function chronological(ls) {
    if (ls.length < 2) return ls;
    const rev = [...ls].reverse();
    if (ls.some(l => l.balance)) {
        const a = balanceBreaks(ls), b = balanceBreaks(rev);
        if (a !== b) return b < a ? rev : ls;
    }
    return ls[0].date > ls[ls.length - 1].date ? rev : ls;
}
const row = (o) => ({ ...o, description: clean(o.description), tagged: clean(o.tagged ?? o.description) });
const signed = (monto) => ({ debit: monto < 0 ? Math.abs(monto) : 0, credit: monto > 0 ? monto : 0 });

// ── Lectores por banco ─────────────────────────────────────────────────────────

const PARSERS = {
    // CSV con ";": fecha (M/D/AA), referencia, descripción, tipo D/C, monto, —, saldo.
    // Viene del más nuevo al más viejo.
    bancaribe(rows) {
        const out = [];
        for (const r of rows) {
            const date = toISO(r[0], "mdy");
            const tipo = txt(r[3]).toUpperCase();
            if (!date || !["D", "C"].includes(tipo)) continue;
            const monto = Math.abs(num(r[4], "ve"));
            const d = txt(r[2]);
            out.push(row({ date, description: d, tagged: RULES.bancaribe(d), reference: txt(r[1]),
                debit: tipo === "D" ? monto : 0, credit: tipo === "C" ? monto : 0, balance: num(r[6], "ve") }));
        }
        return out.reverse();
    },

    // Fecha, Descripción, Referencia, Monto (con signo), Balance.
    banesco(rows) {
        const h = findHeader(rows, ["fecha", "monto"]);
        if (!h) throw new Error("No se encontró el encabezado del extracto de Banesco (Fecha, Descripción, Referencia, Monto, Balance)");
        const c = h.cells;
        const iF = col(c, "fecha"), iD = col(c, "descripcion"), iR = col(c, "referencia"), iM = col(c, "monto"), iS = col(c, "balance", "saldo");
        const out = [];
        for (const r of rows.slice(h.index + 1)) {
            const date = toISO(at(r, iF));
            if (!date) continue;
            const monto = num(at(r, iM), "en");
            const d = txt(at(r, iD));
            out.push(row({ date, description: d, tagged: RULES.banesco(d), reference: txt(at(r, iR)), ...signed(monto), balance: num(at(r, iS), "en") }));
        }
        // La comisión del pago móvil llega como una segunda línea con la misma referencia: si
        // hay dos o más cargos "Pago Movil" con la misma referencia, el menor es la comisión.
        const groups = new Map();
        out.forEach((l, i) => {
            if (l.debit > 0 && l.description.includes("Pago Movil")) {
                if (!groups.has(l.reference)) groups.set(l.reference, []);
                groups.get(l.reference).push(i);
            }
        });
        for (const idx of groups.values()) {
            if (idx.length < 2) continue;
            const min = idx.reduce((a, b) => (out[b].debit < out[a].debit ? b : a));
            if (!out[min].tagged.startsWith("COM. ")) out[min].tagged = `COM. ${out[min].tagged}`;
        }
        return out;
    },

    // Fecha, Concepto, Referencia, Débito, Crédito, Saldo.
    bdt(rows) {
        const h = findHeader(rows, ["fecha", "concepto"]);
        if (!h) throw new Error("No se encontró el encabezado del extracto (Fecha, Concepto, Referencia, Débito, Crédito, Saldo)");
        const c = h.cells;
        const iF = col(c, "fecha"), iC = col(c, "concepto"), iR = col(c, "referencia"), iDb = col(c, "debito"), iCr = col(c, "credito"), iS = col(c, "saldo");
        const out = [];
        for (const r of rows.slice(h.index + 1)) {
            const date = toISO(at(r, iF));
            if (!date) continue;
            const debit = Math.abs(num(at(r, iDb), "en")), credit = Math.abs(num(at(r, iCr), "en"));
            if (!debit && !credit) continue;
            const d = txt(at(r, iC));
            out.push(row({ date, description: d, tagged: RULES.bdt(d), reference: txt(at(r, iR)), debit, credit, balance: num(at(r, iS), "en") }));
        }
        return out;
    },

    // Fecha, Tipo Operación, Descripción, Referencia, Debe, Haber, Saldo.
    bnc(rows) {
        const h = findHeader(rows, ["fecha", "debe", "haber"]);
        const c = h?.cells || [];
        const iF = h ? col(c, "fecha") : 1, iT = h ? col(c, "tipo") : 6, iD = h ? col(c, "descripcion") : 7;
        const iR = h ? col(c, "referencia") : 12, iDb = h ? col(c, "debe") : 13, iCr = h ? col(c, "haber") : 15, iS = h ? col(c, "saldo") : 16;
        const out = [];
        for (const r of rows.slice(h ? h.index + 1 : 0)) {
            const date = toISO(at(r, iF));
            if (!date) continue;
            const tipo = txt(at(r, iT)), desc = txt(at(r, iD));
            const d = tipo.includes("Abono Pago Movil BNC") ? `ABONO PAGO MOVIL BNC - ${desc}` : (desc ? `${tipo.toUpperCase()} - ${desc}` : tipo.toUpperCase());
            const ref = at(r, iR);
            out.push(row({ date, description: d, reference: typeof ref === "number" ? String(Math.trunc(ref)) : txt(ref),
                debit: Math.abs(num(at(r, iDb), "en")), credit: Math.abs(num(at(r, iCr), "en")), balance: num(at(r, iS), "en") }));
        }
        return out;
    },

    // Fecha, Referencia, Descripción, Egreso, Ingreso, Saldo. Se salta el saldo inicial/final.
    mercantil(rows) {
        const out = [];
        for (const r of rows) {
            const date = toISO(r[0]);
            const d = txt(r[2]);
            if (!date || !d) continue;
            const u = d.toUpperCase();
            if (u.includes("SALDO") && (u.includes("INICIAL") || u.includes("FINAL"))) continue;
            out.push(row({ date, description: d, tagged: RULES.mercantil(d), reference: txt(r[1]),
                debit: Math.abs(num(r[3], "ve")), credit: Math.abs(num(r[4], "ve")), balance: num(r[5], "ve") }));
        }
        return out;
    },

    // Dos formatos: el mensual (Fecha, Referencia, Concepto, Cargo, Abono, Saldo) y el de
    // ARAURE (Fecha, Hora, Referencia, Descripción, Tipo, Monto, Saldo). Ambos descendentes.
    plaza(rows) {
        const araure = findHeader(rows, ["fecha", "tipo", "monto"]);
        const out = [];
        if (araure) {
            const c = araure.cells;
            const iF = col(c, "fecha"), iR = col(c, "referencia"), iD = col(c, "descripcion"), iT = col(c, "tipo"), iM = col(c, "monto"), iS = col(c, "saldo");
            for (const r of rows.slice(araure.index + 1)) {
                const date = toISO(at(r, iF));
                if (!date) continue;
                const tipo = norm(at(r, iT));
                const monto = Math.abs(num(at(r, iM), "ve"));
                const d = txt(at(r, iD));
                out.push(row({ date, description: d, tagged: RULES.plaza(d), reference: txt(at(r, iR)),
                    debit: tipo.startsWith("debito") ? monto : 0, credit: tipo.startsWith("credito") ? monto : 0, balance: Math.abs(num(at(r, iS), "ve")) }));
            }
        } else {
            const h = findHeader(rows, ["fecha", ["cargo", "concepto"]]);
            if (!h) throw new Error("No se encontró el encabezado del extracto del Banco Plaza");
            const c = h.cells;
            const iF = col(c, "fecha"), iR = col(c, "referencia"), iC = col(c, "concepto"), iCa = col(c, "cargo"), iA = col(c, "abono"), iS = col(c, "saldo");
            for (const r of rows.slice(h.index + 1)) {
                const date = toISO(at(r, iF));
                if (!date) continue;
                const d = txt(at(r, iC));
                out.push(row({ date, description: d, tagged: RULES.plaza(d), reference: txt(at(r, iR)),
                    debit: Math.abs(num(at(r, iCa), "en")), credit: Math.abs(num(at(r, iA), "en")), balance: Math.abs(num(at(r, iS), "en")) }));
            }
        }
        return out.filter(l => l.debit > 0 || l.credit > 0).reverse();
    },

    // Mensual (7 columnas: fecha, —, —, referencia, concepto, importe) con "Saldo Inicial" en
    // el concepto; diario (5 columnas: fecha, saldo, concepto, documento, monto), descendente y
    // con el saldo inicial en la última fila. El saldo se reconstruye desde el inicial.
    provincial(rows, width) {
        // Banca en línea ("Movimientos_cuentas.xls", que en realidad es una tabla HTML): Fecha,
        // Descripción, Monto con signo y Saldo después del movimiento. Sin referencia y del más
        // nuevo al más viejo.
        const online = findHeader(rows, ["fecha", "descripcion", "monto", "saldo"]);
        if (online) {
            const c = online.cells;
            const iF = col(c, "fecha"), iD = col(c, "descripcion"), iM = col(c, "monto"), iS = col(c, "saldo");
            const ls = [];
            for (const r of rows.slice(online.index + 1)) {
                const date = toISO(at(r, iF));
                const monto = num(at(r, iM));
                if (!date || !monto) continue;
                const d = txt(at(r, iD));
                ls.push(row({ date, description: d, tagged: RULES.provincial(d), reference: "", ...signed(monto), balance: num(at(r, iS)) }));
            }
            if (!ls.length) throw new Error("No se encontraron movimientos en el archivo del Provincial");
            return chronological(ls);
        }
        const out = [];
        let saldo = null;
        if (width >= 7) {
            for (const r of rows) {
                const concepto = txt(r[4]);
                if (concepto.includes("Saldo Inicial")) { if (saldo === null) saldo = num(r[5]); continue; }
                if (concepto.includes("Saldo Final")) continue;
                const date = toISO(r[0]);
                if (!date) continue;
                const monto = num(r[5]);
                if (!monto) continue;
                out.push(row({ date, description: concepto.replace(/^'/, ""), tagged: RULES.provincial(concepto), reference: txt(r[3]).replace(/'/g, ""), ...signed(monto), _m: monto }));
            }
        } else {
            const last = rows[rows.length - 1] || [];
            saldo = num(last[1]);
            for (const r of rows.slice(0, -1).reverse()) {
                const date = toISO(r[0]);
                if (!date) continue;
                const monto = num(r[4]);
                if (!monto) continue;
                const concepto = txt(r[2]);
                out.push(row({ date, description: concepto.replace(/^'/, ""), tagged: RULES.provincial(concepto), reference: typeof r[3] === "number" ? String(Math.trunc(r[3])) : txt(r[3]), ...signed(monto), _m: monto }));
            }
        }
        if (!out.length) throw new Error("No se encontraron movimientos en el archivo del Provincial");
        let acc = saldo || 0;
        for (const l of out) { acc = Math.round((acc + l._m) * 100) / 100; l.balance = saldo === null ? null : acc; delete l._m; }
        return out;
    },

    // Mensual (fecha, referencia, concepto, saldo, monto) o diario (fecha, referencia,
    // descripcion, indicadorcargoabono, importe, saldo, fechahora, nummovimiento).
    venezuela(rows) {
        const mensual = findHeader(rows, ["fecha", "concepto", "monto"]);
        const vnum = (v) => (typeof v === "string" && v.includes(",") ? num(v, "ve") : num(v, "en"));
        if (mensual) {
            const c = mensual.cells;
            const iF = col(c, "fecha"), iR = col(c, "referencia"), iC = col(c, "concepto"), iM = col(c, "monto"), iS = col(c, "saldo");
            const out = [];
            for (const r of rows.slice(mensual.index + 1)) {
                const date = toISO(at(r, iF));
                const d = txt(at(r, iC));
                if (!date || d.toUpperCase().includes("SALDO INICIAL")) continue;
                out.push(row({ date, description: d, tagged: RULES.venezuela(d.replace(/\s+/g, " ")), reference: txt(at(r, iR)), ...signed(vnum(at(r, iM))), balance: vnum(at(r, iS)) }));
            }
            return out;
        }
        const diario = findHeader(rows, ["fecha", "descripcion", "indicadorcargoabono"]);
        if (!diario) throw new Error("Formato del Banco de Venezuela no reconocido: se esperaba el extracto mensual o el del día");
        const c = diario.cells;
        const iF = col(c, "fecha"), iR = col(c, "referencia"), iD = col(c, "descripcion"), iI = col(c, "indicadorcargoabono"),
            iM = col(c, "importe"), iS = col(c, "saldo"), iH = col(c, "fechahora"), iN = col(c, "nummovimiento");
        const data = rows.slice(diario.index + 1).filter(r => toISO(at(r, iF)));
        data.sort((a, b) => String(at(a, iH) ?? "").replace(/\s/g, "").localeCompare(String(at(b, iH) ?? "").replace(/\s/g, "")) || (num(at(a, iN)) - num(at(b, iN))));
        return data.map(r => {
            const ind = norm(at(r, iI));
            const imp = Math.abs(vnum(at(r, iM)));
            const d = txt(at(r, iD));
            return row({ date: toISO(at(r, iF)), description: d, tagged: RULES.venezuela(d.replace(/\s+/g, " ")), reference: txt(at(r, iR)),
                debit: ind.includes("debito") ? imp : 0, credit: ind.includes("credito") ? imp : 0, balance: vnum(at(r, iS)) });
        });
    },

    // Venecredit Office Banking: Fecha, Concepto, Referencia, Cargos, Abonos. Descendente.
    venezolano_credito(rows) {
        const h = findHeader(rows, ["fecha", "concepto"]);
        if (!h) throw new Error("No se encontró el encabezado del Venezolano de Crédito. Si tu extracto es PDF, descárgalo en Excel.");
        const c = h.cells;
        const iF = col(c, "fecha"), iC = col(c, "concepto"), iR = col(c, "referencia"), iCa = col(c, "cargo"), iA = col(c, "abono");
        const out = [];
        for (const r of rows.slice(h.index + 1)) {
            const date = toISO(at(r, iF));
            if (!date) continue;
            const debit = Math.abs(num(at(r, iCa), "ve")), credit = Math.abs(num(at(r, iA), "ve"));
            if (!debit && !credit) continue;
            const d = txt(at(r, iC));
            out.push(row({ date, description: d, tagged: RULES.venezolano_credito(d), reference: txt(at(r, iR)), debit, credit, balance: null }));
        }
        return out.reverse();
    },

    // Cualquier banco con encabezados reconocibles: fecha, descripción o concepto, referencia,
    // y débito/crédito (o cargo/abono, debe/haber, egreso/ingreso) o un monto con signo.
    generico(rows) {
        const DESC = ["descripcion", "concepto", "detalle", "transaccion", "operacion"];
        const DEB = ["debito", "cargo", "debe", "egreso", "retiro"];
        const CRE = ["credito", "abono", "haber", "ingreso", "deposito"];
        const h = findHeader(rows, ["fecha", [...DESC, ...DEB, ...CRE, "monto", "importe"]]);
        if (!h) throw new Error("No se encontró una fila de encabezados con Fecha y Débito/Crédito o Monto");
        const c = h.cells;
        const iF = col(c, "fecha"), iD = col(c, ...DESC), iR = col(c, "referencia", "ref", "documento", "nro", "numero");
        const iDb = col(c, ...DEB), iCr = col(c, ...CRE), iM = col(c, "monto", "importe"), iT = col(c, "tipo"), iS = col(c, "saldo", "balance");
        const out = [];
        for (const r of rows.slice(h.index + 1)) {
            const date = toISO(at(r, iF));
            if (!date) continue;
            let debit = 0, credit = 0;
            if (iDb >= 0 || iCr >= 0) {
                debit = Math.abs(num(at(r, iDb))); credit = Math.abs(num(at(r, iCr)));
            } else if (iM >= 0) {
                const m = num(at(r, iM));
                const t = norm(at(r, iT));
                if (t.startsWith("d") || t === "cargo") debit = Math.abs(m);
                else if (t.startsWith("c") || t === "abono") credit = Math.abs(m);
                else ({ debit, credit } = signed(m));
            }
            if (!debit && !credit) continue;
            out.push(row({ date, description: txt(at(r, iD)), reference: txt(at(r, iR)), debit, credit, balance: iS >= 0 ? num(at(r, iS)) : null }));
        }
        // Del más nuevo al más viejo: se invierte para que el saldo corra hacia adelante.
        return chronological(out);
    },
};

// ── PDF ───────────────────────────────────────────────────────────────────────

/**
 * Lectores de extractos en PDF. Reciben las páginas ya convertidas en filas: cada fila es
 * { text, cells: [{ x, s }] }, con las palabras que comparten altura ordenadas de izquierda a
 * derecha (ver pdfRows). Es lo mismo que hacía ExtractFlow con pdfplumber.
 *
 * Pueden devolver `summary` con el resumen que imprime el banco en la cabecera (saldo inicial
 * y final, total de débitos y créditos, cantidad de movimientos): con eso se comprueba que no
 * se perdió ni se duplicó ninguna fila al leer.
 */
const PDF_PARSERS = {
    // BDV "Estado de cuenta moneda nacional": Referencia, Descripción, Fecha, Mov (ND/NC/SI),
    // Débito (con signo), Crédito, Saldo. La cabecera de cada página repite el resumen.
    venezuela(pages) {
        const RE = /^(?:(\d{4,})\s+)?(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+(ND|NC|SI)\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})\s+(-?[\d.]+,\d{2})$/;
        const out = [];
        let summary = null;
        for (const rows of pages) {
            rows.forEach((r, i) => {
                // Resumen: la fila de rótulos "Saldo inicial … Total transacciones" y debajo sus cifras.
                if (!summary && /Total d[eé]bitos/i.test(r.text) && /Total transacciones/i.test(r.text)) {
                    const v = (rows[i + 1]?.cells || []).map(c => c.s);
                    if (v.length >= 6) {
                        summary = {
                            opening: num(v[0], "ve"), closing: num(v[2], "ve"),
                            debit: Math.abs(num(v[3], "ve")), credit: Math.abs(num(v[4], "ve")),
                            count: parseInt(String(v[5]).replace(/\D/g, ""), 10) || null,
                        };
                    }
                    return;
                }
                const m = RE.exec(r.text);
                if (!m || m[4] === "SI") return;      // SI = saldo inicial, no es un movimiento
                const d = m[2].trim();
                out.push(row({
                    date: toISO(m[3]), description: d, tagged: RULES.venezuela(d), reference: m[1] || "",
                    debit: Math.abs(num(m[5], "ve")), credit: Math.abs(num(m[6], "ve")), balance: num(m[7], "ve"),
                }));
            });
        }
        if (!out.length) throw new Error("No se encontraron movimientos en el PDF. ¿Es el estado de cuenta del Banco de Venezuela?");
        return { lines: out, summary };
    },
};

// Formatos que tienen lector de PDF. Los demás piden el Excel.
export const PDF_FORMATS = Object.keys(PDF_PARSERS);

/**
 * Páginas del PDF convertidas en filas de texto. pdf.js se carga solo cuando hace falta (pesa
 * casi 1 MB con su worker) y queda fuera del paquete principal.
 */
async function pdfRows(bytes) {
    const pdfjs = await import("pdfjs-dist/build/pdf");
    const { default: workerSrc } = await import("pdfjs-dist/build/pdf.worker.min.js?url");
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    // pdf.js se queda con el buffer que recibe: se le pasa una copia.
    const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const { items } = await page.getTextContent();
        pages.push(groupRows(items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5] }))));
    }
    await doc.destroy();
    return pages;
}

// Agrupa palabras en filas por su altura (con 2 puntos de tolerancia), de arriba abajo.
export function groupRows(words) {
    const rows = [];
    for (const w of words.filter(w => String(w.s).trim()).sort((a, b) => b.y - a.y || a.x - b.x)) {
        const r = rows.find(x => Math.abs(x.y - w.y) <= 2);
        if (r) r.cells.push(w); else rows.push({ y: w.y, cells: [w] });
    }
    for (const r of rows) {
        r.cells.sort((a, b) => a.x - b.x);
        r.text = r.cells.map(c => String(c.s).trim()).join(" ").replace(/\s+/g, " ");
    }
    return rows;
}

// Lee un PDF ya convertido en filas. Si el formato elegido no tiene lector de PDF se prueban
// los que hay: el PDF del BDV se reconoce por sus columnas aunque se haya elegido otro banco.
export function parsePdfPages(pages, format) {
    const order = [format, ...PDF_FORMATS.filter(f => f !== format)].filter(f => PDF_PARSERS[f]);
    let firstError = null;
    for (const f of order) {
        try {
            const r = PDF_PARSERS[f](pages);
            if (r.lines.length) {
                const warnings = f !== format ? [`El PDF se leyó con el formato de ${BANK_FORMATS.find(b => b.key === f)?.label}.`] : [];
                return { ...r, warnings };
            }
        } catch (e) { firstError = firstError || e; }
    }
    if (!PDF_PARSERS[format]) {
        throw new Error("El PDF de este banco todavía no se lee aquí: descárgalo en Excel o CSV. El del Banco de Venezuela sí se lee.");
    }
    throw firstError || new Error("No se encontraron movimientos en el PDF");
}

/**
 * Comprobación de la lectura:
 *   · contra el resumen del banco, si el archivo lo trae (cantidad, débitos, créditos), y
 *   · encadenando saldos: cada saldo debe ser el anterior más el abono menos el cargo.
 * Una fila perdida o leída dos veces rompe las dos cosas.
 */
export function checkLines(lines, summary) {
    const r2 = (n) => Math.round(n * 100) / 100;
    const debit = r2(lines.reduce((s, l) => s + l.debit, 0));
    const credit = r2(lines.reduce((s, l) => s + l.credit, 0));
    let breaks = 0, chained = 0;
    for (let i = 1; i < lines.length; i++) {
        const a = lines[i - 1], b = lines[i];
        if (a.balance === null || b.balance === null) continue;
        chained++;
        if (Math.abs(r2(a.balance + b.credit - b.debit) - b.balance) > 0.011) breaks++;
    }
    const out = { count: lines.length, debit, credit, breaks, chained };
    if (summary) {
        out.summary = summary;
        out.matches = (!summary.count || summary.count === lines.length)
            && Math.abs(summary.debit - debit) < 0.011
            && Math.abs(summary.credit - credit) < 0.011;
    }
    return out;
}

// ── Archivo ───────────────────────────────────────────────────────────────────

function decodeText(bytes) {
    const utf = new TextDecoder("utf-8").decode(bytes);
    return utf.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf;
}

function parseCsv(text) {
    const lines = text.split(/\r?\n/);
    const sample = lines.slice(0, 15).join("\n");
    const delim = [";", ",", "\t", "|"].sort((a, b) => sample.split(b).length - sample.split(a).length)[0];
    return lines.filter(l => l.trim()).map(l => {
        const out = []; let cur = ""; let q = false;
        for (let i = 0; i < l.length; i++) {
            const ch = l[i];
            if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
            else if (ch === delim && !q) { out.push(cur); cur = ""; }
            else cur += ch;
        }
        out.push(cur);
        return out.map(s => s.trim());
    });
}

// Filas de la primera hoja desde A1 (como pandas: una columna vacía a la izquierda cuenta) y
// sin filas en blanco.
function sheetRows(bytes, html = null) {
    // raw: en una tabla HTML no se interpreta nada. Sin esto SheetJS puede leer "05/09/2026"
    // como 9 de mayo y los montos con coma decimal como otra cosa.
    const wb = html !== null
        ? XLSX.read(html, { type: "string", raw: true, cellDates: false })
        : XLSX.read(bytes, { type: "array", cellDates: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws || !ws["!ref"]) return { rows: [], width: 0 };
    const range = XLSX.utils.decode_range(ws["!ref"]);
    range.s.r = 0; range.s.c = 0;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false, range });
    const width = rows.reduce((w, r) => {
        let last = r.length - 1;
        while (last >= 0 && (r[last] === null || r[last] === "")) last--;
        return Math.max(w, last + 1);
    }, 0);
    return { rows, width };
}

/**
 * Lee un extracto y devuelve { lines, warnings }. `format` es la clave del banco (ver
 * BANK_FORMATS). Si el lector del banco no encuentra nada, se prueba el genérico antes de
 * rendirse: muchos bancos exportan también un Excel "plano" con encabezados normales.
 */
export async function readStatementFile(file, format) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
        let pages;
        try { pages = await pdfRows(bytes); }
        catch { throw new Error("No se pudo abrir el PDF. Si está protegido con clave, descárgalo de nuevo sin ella."); }
        const { lines: parsed, summary, warnings } = parsePdfPages(pages, format);
        const lines = finalizeLines(parsed);
        return { lines, warnings, check: checkLines(lines, summary) };
    }
    const isExcel = (bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf);
    let rows, width;
    // Varios bancos (el Provincial, entre ellos) exportan una tabla HTML con extensión .xls:
    // Excel avisa que "el formato y la extensión no coinciden" y la abre igual.
    const text = isExcel ? "" : decodeText(bytes);
    const isHtml = !isExcel && /^\s*</.test(text.replace(/^﻿/, "")) && /<table/i.test(text);
    if (isExcel) ({ rows, width } = sheetRows(bytes));
    else if (isHtml) ({ rows, width } = sheetRows(null, text));
    else {
        rows = parseCsv(text);
        width = rows.reduce((w, r) => Math.max(w, r.length), 0);
    }
    if (!rows.length) throw new Error("El archivo está vacío");

    const parser = PARSERS[format] || PARSERS.generico;
    let parsed = [];
    let firstError = null;
    try { parsed = parser(rows, width); } catch (e) { firstError = e; }
    const warnings = [];
    if (!parsed.length && format !== "generico") {
        try {
            parsed = PARSERS.generico(rows, width);
            if (parsed.length) warnings.push("El archivo no tiene el formato habitual de este banco: se leyó por sus encabezados. Revisa la vista previa.");
        } catch { /* se informa el error del lector del banco */ }
    }
    if (!parsed.length) throw firstError || new Error("No se encontraron movimientos en el archivo");

    const lines = finalizeLines(parsed);
    return { lines, warnings, check: checkLines(lines, null) };
}

// Filas del lector → líneas que se mandan al servidor, con su tipo (comisión, interés…).
export function finalizeLines(parsed) {
    const allZeroBalance = parsed.every(l => !l.balance);
    const lines = parsed
        .filter(l => l.date && (l.debit > 0 || l.credit > 0))
        .map(l => {
            const debit = Math.round(l.debit * 100) / 100;
            const credit = Math.round(l.credit * 100) / 100;
            const tagged = generalRules(l.tagged || l.description);
            return {
                date: l.date,
                description: l.description || "/",
                reference: l.reference || "",
                debit, credit,
                balance: allZeroBalance || l.balance === null || l.balance === undefined ? null : Math.round(l.balance * 100) / 100,
                kind: classify(tagged, debit, credit),
            };
        });
    if (!lines.length) throw new Error("No se encontraron movimientos con fecha y monto");
    return lines;
}
