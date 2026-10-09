import { fmtMoney } from "../../../helpers";

// Estado de una línea del extracto. Lo normal, al terminar, es "Conciliada": en gris con su
// visto. Lo que falta casar es lo único con color.
export const LINE_STATUS = {
    pendiente:  { label: "Por conciliar", tone: "warning" },
    conciliado: { label: "Conciliada",    tone: "success", quiet: "check" },
    ignorado:   { label: "Ignorada",      tone: "neutral", quiet: "void" },
};

// Lo que el banco dice que es la línea. "Movimiento" no se rotula: es casi todo.
export const KIND_LABEL = {
    comision: "Comisión",
    impuesto: "Impuesto",
    interes:  "Interés",
};

export const MODE_LABEL = {
    auto:       "Casada sola",
    manual:     "Casada a mano",
    registrado: "Registrada desde el extracto",
};

export const SOURCE_LABEL = { payment: "Cobro", income: "Ingreso", expense: "Egreso" };

export const lineAmount = (l) => (l.credit > 0 ? l.credit : l.debit);
export const isCredit = (l) => l.credit > 0;

// "Bs. 1234.56" para abonos y "-Bs. 1234.56" para cargos, listo para <Money>.
export const fmtLine = (l, symbol) => `${isCredit(l) ? "" : "-"}${fmtMoney(lineAmount(l), symbol)}`;

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// El egreso o ingreso que crea la conciliación necesita sucursal. Sale del extracto, o del
// diario si atiende a una sola; si no, hay que preguntarla.
export const needsWarehouse = (st, journalId) => {
    if (st.warehouse_id) return false;
    const j = st.journals.find(x => x.id === Number(journalId));
    return !j || j.warehouse_ids.length !== 1;
};

// Diarios activos de la cuenta, para elegir dónde registrar. Un egreso (`dir` 'out') solo va a
// los que permiten salidas: en una cuenta donde se cobra por biopago y se paga por pago móvil,
// el biopago no se ofrece para la comisión.
export const journalOptions = (st, dir = "out") => st.journals
    .filter(j => (dir !== "out" || j.allows_outflow) && (j.active || j.id === st.default_journal_id || j.id === st.default_in_journal_id))
    .map(j => ({ value: String(j.id), label: j.name }));

// Nombre de una cuenta (diario) para listas y selectores. Con número de cuenta se agregan sus
// últimos cuatro dígitos: dos cuentas del mismo banco no se distinguen solo por el nombre.
export const accountLabel = (a) => {
    const nombre = a.journal_name || a.bank_name || "Cuenta";
    const num = a.account_number ? ` ·· ${String(a.account_number).replace(/\D/g, "").slice(-4)}` : "";
    return `${nombre}${num} · ${a.currency_symbol || "Ref."}`;
};
