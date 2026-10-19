import { outboxPut, outboxGet, outboxAll, outboxDel } from "./store";

// Ventas hechas sin conexión, guardadas en el equipo hasta que se puedan enviar.
//
// Cada venta es una fila con todo lo que el servidor necesita para registrarla tal como se
// cobró (ver POST /sales/offline): líneas con su precio y su promoción, la tasa, el cajero, la
// hora real y los cobros. La clave es la misma de idempotencia que usa la venta en línea: si
// la caja intentó enviarla, se quedó sin respuesta y la pasó a esta cola, el servidor reconoce
// la que ya tenía en vez de crear otra.
//
// Estados:
//   abierta    recién creada; el cajero todavía puede cobrarla (uno o varios abonos).
//   lista      el cajero pasó a la siguiente venta: ya se puede enviar.
//   enviada    el servidor la registró; se guarda unos días para poder consultarla.
//   rechazada  el servidor no la acepta y reintentar no lo va a cambiar: necesita que alguien
//              la mire. Nunca se borra sola.
//
// Una abierta se envía igual pasados unos minutos: si se fue la luz con el modal de cobro en
// pantalla, nadie va a volver a pulsar "Siguiente venta" sobre ella.

export const ABIERTA_MAX_MS = 10 * 60 * 1000;
const ENVIADAS_DIAS = 3;

const oyentes = new Set();
export function onOutboxChange(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}
export const avisarCambio = () => oyentes.forEach((fn) => { try { fn(); } catch { /* sigue */ } });

// Número del ticket provisional: "P-3F2A-0007". El código identifica al equipo, para que dos
// cajas sin conexión no entreguen el mismo número; el contador es de ese equipo.
function codigoEquipo() {
  try {
    let c = localStorage.getItem("nexus_equipo_codigo");
    if (!c) {
      c = Array.from(crypto.getRandomValues(new Uint8Array(2)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      localStorage.setItem("nexus_equipo_codigo", c);
    }
    return c;
  } catch { return "0000"; }
}

export function siguienteNumeroProvisional() {
  let n = 1;
  try {
    n = (parseInt(localStorage.getItem("nexus_provisional_n"), 10) || 0) + 1;
    localStorage.setItem("nexus_provisional_n", String(n));
  } catch { n = Date.now() % 10000; }
  return `P-${codigoEquipo()}-${String(n).padStart(4, "0")}`;
}

export async function guardarVenta(entry) {
  await outboxPut({ ...entry, status: "abierta", payments: [], created_ms: Date.now() });
  avisarCambio();
}

// Un cobro más sobre una venta sin conexión. Con `cierra`, la venta quedó saldada y pasa
// directo a lista para enviarse.
export async function agregarCobro(key, cuerpo, { cierra = false } = {}) {
  const e = await outboxGet(key);
  if (!e) throw new Error("No se encontró la venta guardada en este equipo");
  if (e.status === "enviada") throw new Error("Esta venta ya se envió: cóbrala desde Pendientes");
  await outboxPut({
    ...e,
    payments: [...(e.payments || []), { ...cuerpo, paid_at: new Date().toISOString() }],
    status: cierra ? "lista" : e.status,
  });
  avisarCambio();
}

export async function marcarLista(key) {
  const e = await outboxGet(key);
  if (e && e.status === "abierta") { await outboxPut({ ...e, status: "lista" }); avisarCambio(); }
}

// Deshace una venta sin conexión que no llegó a cobrarse: el cliente se fue, o el cajero
// volvió al carrito a corregir. Con un cobro ya registrado no se puede: hay dinero en la caja.
export async function descartarSinCobro(key) {
  const e = await outboxGet(key);
  if (!e) return null;
  if (e.payments?.length) throw new Error("La venta ya tiene un cobro: no se puede deshacer");
  await outboxDel(key);
  avisarCambio();
  return e;
}

export async function reintentar(key) {
  const e = await outboxGet(key);
  if (e && e.status === "rechazada") {
    await outboxPut({ ...e, status: "lista", error: null, ultimo_fallo_ms: null });
    avisarCambio();
  }
}

export async function ventasDeEmpresa(companyId) {
  const todas = await outboxAll().catch(() => []);
  return todas
    .filter((e) => e.company_id === companyId)
    .sort((a, b) => a.created_ms - b.created_ms);
}

// Ventas de un cajero que el servidor todavía no tiene (por enviar o rechazadas). El cierre de
// caja las cuenta: el arqueo corta por la hora de los cobros, y cerrar antes de que lleguen
// dejaría ese dinero fuera del turno que lo recibió.
export async function sinEnviarDeEmpleado(employeeId) {
  const todas = await outboxAll().catch(() => []);
  return todas.filter((e) => e.employee_id === employeeId && e.status !== "enviada");
}

export const porEnviar = (e) => e.status === "abierta" || e.status === "lista";
export const listaParaEnviar = (e) =>
  e.status === "lista" || (e.status === "abierta" && Date.now() - e.created_ms > ABIERTA_MAX_MS);

// Las enviadas se guardan unos días como constancia (qué factura le tocó a cada provisional).
export async function limpiarEnviadas() {
  const limite = Date.now() - ENVIADAS_DIAS * 24 * 60 * 60 * 1000;
  const todas = await outboxAll().catch(() => []);
  await Promise.all(todas.filter((e) => e.status === "enviada" && (e.sent_ms || 0) < limite).map((e) => outboxDel(e.key)));
}

export { outboxPut };
