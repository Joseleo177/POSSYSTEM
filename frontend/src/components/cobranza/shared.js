import { fmtDateShort } from "../../helpers";
import { monedaLocal } from "../../helpers/currency";

// Piezas comunes de la app Cobranza (ruta del cobrador y sectores).

export const r2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// "Ref. 90.00": símbolo de la moneda base, dos decimales, sin miles (guía del frontend).
export const fmtBaseCon = (baseCurrency) => (n) => `${baseCurrency?.symbol || "Ref."} ${r2(n).toFixed(2)}`;

// Bolívares a la tasa de HOY: lo pendiente se muestra a la tasa vigente.
export const fmtLocalCon = (activeCurrencies) => {
    const local = monedaLocal(activeCurrencies);
    const rate = parseFloat(local?.exchange_rate) || 0;
    return rate > 1 ? (n) => `${local.symbol} ${r2(r2(n) * rate).toFixed(2)}` : null;
};

const DIA = 86400000;
// Días de calendario, en la hora local: contar horas desde el mediodía decía "Abonó hoy" en la
// mañana a quien abonó ayer. De mediodía a mediodía y redondeando, un cambio de horario no lo mueve.
const diasDesde = (iso) => {
    if (!iso) return null;
    const texto = String(iso);
    const d = /^\d{4}-\d{2}-\d{2}$/.test(texto) ? new Date(`${texto}T12:00:00`) : new Date(texto);
    if (isNaN(d.getTime())) return null;
    d.setHours(12, 0, 0, 0);
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    return Math.round((hoy.getTime() - d.getTime()) / DIA);
};

// Cuándo abonó por última vez, en lenguaje de calle.
export const ultimoAbonoTexto = (iso) => {
    const d = diasDesde(iso);
    if (d === null) return "Sin abonos";
    if (d <= 0) return "Abonó hoy";
    if (d === 1) return "Abonó ayer";
    if (d < 30) return `Abonó hace ${d} días`;
    return `Último abono ${fmtDateShort(iso)}`;
};

// Pide atención: debe y no abona hace más de un mes (o nunca, con la deuda de más de un mes).
export const pideAtencion = (c) => {
    if (!(c.deuda > 0)) return false;
    const ultimo = diasDesde(c.ultimo_abono);
    if (ultimo !== null) return ultimo > 30;
    const desde = diasDesde(c.desde);
    return desde !== null && desde > 30;
};

export const nuevaClave = (p = "c") => crypto?.randomUUID?.() ?? `${p}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
