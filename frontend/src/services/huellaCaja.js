import { api } from "./api";
import { isOffline } from "./offline/network";

// Un solo reloj para lo que la app vuelve a pedir "por si acaso": la grilla de la caja, las
// cuentas en espera, las promociones vigentes y las monedas.
//
// Antes cada una tenía su propio setInterval y se pedía ENTERA: cuatro consultas por vuelta y
// por equipo, que casi siempre volvían iguales. En Vercel eso era la mitad de las invocaciones
// del backend, y en Supabase, consultas pesadas haciendo fila delante de los cobros. Ahora,
// cada 25 s, el equipo pregunta UNA vez "¿cambió algo?" (GET /huellas) y solo avisa a quien
// cambió; ese recién pide sus datos por la ruta de siempre.
//
// Lo que no cambia: cada pantalla sigue recargando al volver a la pestaña, y en Docker sigue
// llegando el aviso en vivo (SSE).

const CADA_MS = 25_000;
// Red de seguridad: cada 5 min se avisa a todos aunque la huella no se haya movido. Cubre un
// cambio que la huella no viera y el que cae entre una carga y la primera huella.
const RED_MS = 5 * 60_000;
// Tras una suscripción nueva o al volver a la pestaña, se toma la huella de base enseguida,
// para que lo que cambie a partir de ahí no espere a la red de seguridad.
const BASE_MS = 1500;

const ORDEN = ["productos", "cuentas", "promos", "monedas"];

const subs = new Map();      // id → { que, wid, cb }
const ultimas = new Map();   // "wid:que" → md5 visto la última vez
let seq = 0;
let reloj = null;
let pronto = null;
let enCurso = false;
let ultimaRed = Date.now();

const clave = (wid, que) => `${que === "monedas" ? "*" : wid}:${que}`;

function avisar(filtro) {
  for (const s of [...subs.values()]) {
    if (!filtro(s)) continue;
    try { s.cb(); } catch (e) { console.error(e); }
  }
}

// Una petición por sucursal. Las monedas no dependen de la tienda: viajan en la primera, así
// que en el caso normal —una sucursal— es UNA petición por vuelta con las cuatro huellas.
function agrupar() {
  const grupos = new Map();   // wid → Set(que)
  let monedas = false;
  for (const s of subs.values()) {
    if (s.que === "monedas") { monedas = true; continue; }
    if (!s.wid) continue;     // sin sucursal no hay huella: esa pantalla recarga por su cuenta
    if (!grupos.has(s.wid)) grupos.set(s.wid, new Set());
    grupos.get(s.wid).add(s.que);
  }
  if (monedas) {
    const primero = grupos.keys().next();
    if (primero.done) grupos.set(null, new Set(["monedas"]));
    else grupos.get(primero.value).add("monedas");
  }
  return grupos;
}

async function vuelta({ soloBase = false } = {}) {
  if (enCurso || !subs.size) return;
  if (document.visibilityState !== "visible" || isOffline()) return;
  enCurso = true;
  try {
    const red = !soloBase && Date.now() - ultimaRed >= RED_MS;
    if (red) { ultimaRed = Date.now(); avisar(() => true); }
    // Sin sucursal (p. ej. un administrador antes de elegirla) se recarga a la antigua.
    if (!soloBase && !red) avisar(s => !s.wid && s.que !== "monedas");

    for (const [wid, ques] of agrupar()) {
      const lista = ORDEN.filter(q => ques.has(q));
      // Siempre en el mismo orden: la URL queda fija y el navegador reutiliza el permiso CORS
      // (preflight) en vez de pedirlo cada vez.
      const params = { ...(wid ? { warehouse_id: wid } : {}), que: lista.join(",") };
      let data;
      try {
        data = (await api.huellas.get(params))?.data || {};
      } catch {
        // Un backend sin esta ruta (despliegue a medias) o un tropiezo: se recarga todo, como
        // antes. Mejor una consulta de más que una caja con datos viejos.
        if (!soloBase && !red) avisar(s => lista.includes(s.que) && (s.que === "monedas" || s.wid === wid));
        continue;
      }
      for (const q of lista) {
        const k = clave(wid, q);
        const nuevo = data[q];
        const antes = ultimas.get(k);
        if (nuevo === undefined) {
          if (!soloBase && !red) avisar(s => s.que === q && (q === "monedas" || s.wid === wid));
          continue;
        }
        ultimas.set(k, nuevo);
        if (!soloBase && !red && antes !== undefined && antes !== nuevo) {
          avisar(s => s.que === q && (q === "monedas" || s.wid === wid));
        }
      }
    }
  } finally {
    enCurso = false;
  }
}

function tomarBasePronto() {
  clearTimeout(pronto);
  pronto = setTimeout(() => vuelta({ soloBase: true }), BASE_MS);
}

// Al volver a la pestaña cada pantalla ya recarga entera: aquí solo se toma una base nueva,
// para comparar desde lo que acaban de traer y no avisar dos veces por lo mismo.
function onVisible() {
  if (document.visibilityState !== "visible") return;
  ultimas.clear();
  tomarBasePronto();
}

function arrancar() {
  if (reloj) return;
  ultimaRed = Date.now();
  reloj = setInterval(() => vuelta(), CADA_MS);
  document.addEventListener("visibilitychange", onVisible);
}

function parar() {
  clearInterval(reloj);
  clearTimeout(pronto);
  reloj = null;
  ultimas.clear();
  document.removeEventListener("visibilitychange", onVisible);
}

/**
 * Llama a `cb` cuando cambie `que` ("productos" | "cuentas" | "promos" | "monedas") en la
 * sucursal `warehouseId` (las monedas no la usan). Devuelve la función para dejar de escuchar.
 * Quien se suscribe ya debe haber cargado sus datos: aquí solo se avisa de los cambios.
 */
export function alCambiar(que, warehouseId, cb) {
  const id = ++seq;
  subs.set(id, { que, wid: warehouseId || null, cb });
  arrancar();
  if (!ultimas.has(clave(warehouseId || null, que))) tomarBasePronto();
  return () => {
    subs.delete(id);
    if (!subs.size) parar();
  };
}
