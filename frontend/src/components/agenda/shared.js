// Piezas comunes de la Agenda de citas (ver services/agenda en el backend).
//
// Las horas viajan en minutos desde la medianoche de la sucursal (9:30 = 570) y las fechas como
// 'YYYY-MM-DD'. El servidor hace la cuenta con la zona de la sucursal; aquí solo se dibuja.

/** 570 → "09:30" */
export const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "9:30", "0930", "9" → 570; null si no es una hora. */
export function parseHora(texto) {
    const t = String(texto || "").trim().replace(/[.h]/gi, ":");
    const m = t.match(/^(\d{1,2})(?::?(\d{2}))?$/);
    if (!m) return null;
    const h = +m[1], mi = +(m[2] || 0);
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
    return h * 60 + mi;
}

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const hoy = () => iso(new Date());
export const minutoAhora = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function masDias(fecha, n) {
    const [y, m, d] = fecha.split("-").map(Number);
    return iso(new Date(y, m - 1, d + n));
}

/** "martes 3 de noviembre" */
export function fechaLarga(fecha) {
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
}

/** "Hoy", "Mañana", "Ayer" o "mar 3 nov" */
export function fechaCorta(fecha) {
    if (fecha === hoy()) return "Hoy";
    if (fecha === masDias(hoy(), 1)) return "Mañana";
    if (fecha === masDias(hoy(), -1)) return "Ayer";
    const [y, m, d] = fecha.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" });
}

export const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/** "30 min", "1 h", "1 h 15 min" */
export function duracion(min) {
    const h = Math.floor(min / 60), m = min % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
}

// Estado de la cita, para StatusMark. El gris es lo normal (confirmada, terminada); solo pide
// atención lo que hay que resolver: por confirmar, en curso, por cobrar.
export const CITA_STATUS = {
    pendiente:  { label: "Por confirmar", tone: "warning" },
    confirmada: { label: "Confirmada",    tone: "neutral" },
    en_curso:   { label: "En curso",      tone: "info" },
    terminada:  { label: "Terminada",     tone: "neutral", quiet: "check" },
    no_asistio: { label: "No llegó",      tone: "neutral", quiet: "void" },
    cancelada:  { label: "Cancelada",     tone: "neutral", quiet: "void" },
    por_cobrar: { label: "Por cobrar",    tone: "warning", flag: true },
    cobrada:    { label: "Cobrada",       tone: "success", quiet: "check" },
    debe:       { label: "Debe",          tone: "danger",  flag: true },
    anulada:    { label: "Venta anulada", tone: "neutral", quiet: "void" },
};

/** Estado que se muestra: una cita terminada se ve por su cobro. */
export const estadoVista = (a) => (a.status === "terminada" && a.payment_state ? a.payment_state : a.status);

// Colores para distinguir profesionales y puestos. Identidad, no señal: van en el filete de la
// tarjeta y en el punto junto al nombre.
export const COLORES = ["#0f766e", "#b45309", "#7c3aed", "#be123c", "#1d4ed8", "#4d7c0f", "#a21caf", "#475569"];

/** Moneda en que la caja muestra los precios: la misma preferencia que el POS. */
export function monedaPantalla(activeCurrencies, baseCurrency) {
    let id = null;
    try { id = parseInt(localStorage.getItem("pos_display_currency"), 10) || null; } catch { /* modo privado */ }
    return (id && (activeCurrencies || []).find(c => c.id === id)) || baseCurrency || null;
}

/** Enlace de WhatsApp a un teléfono venezolano ("0414…" → 58414…). */
export function enlaceWhatsapp(telefono, texto) {
    let n = String(telefono || "").replace(/\D/g, "");
    if (!n) return null;
    if (n.startsWith("0")) n = "58" + n.slice(1);
    else if (n.length === 10) n = "58" + n;
    return `https://wa.me/${n}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}

export const LABEL = "text-[12px] font-medium text-content-subtle";
