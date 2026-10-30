// Caché de la vitrina en el navegador ("stale-while-revalidate").
//
// Quien vuelve a la tienda no debería mirar esqueletos grises mientras llegan datos que ya
// vio ayer. swr() devuelve dos cosas:
//   - cached: lo último que se recibió para esa misma petición (o null), para dibujar YA;
//   - fresh:  la promesa de lo nuevo, que reemplaza a lo guardado en cuanto llega.
// La vitrina pinta `cached` al instante y actualiza con `fresh`. Lo viejo dura en pantalla lo
// que tarda la red (medio segundo, uno), y precio, stock y pedido se validan igual en el
// servidor al enviar: esto es solo lo que se MUESTRA mientras tanto.
//
// También une peticiones iguales: si dos partes de la página piden lo mismo a la vez (la
// tienda al montar y otra vez al saber la sucursal, o el mismo carril), sale UNA petición.
// Dentro de FRESCO_MS se reusa la respuesta sin volver a pedirla.
//
// Va en localStorage con tope de entradas y de tamaño: es un catálogo, no puede comerse el
// almacenamiento del teléfono. Si no cabe (o es modo privado), simplemente no se guarda.

const PREFIJO = "vc1:";
const INDICE = `${PREFIJO}_idx`;
const FRESCO_MS = 20_000;
const VIEJO_MS = 24 * 3600_000;
const MAX_ENTRADAS = 30;
const MAX_BYTES = 150_000;

const MEM = new Map(); // clave -> { t, data, p }

function leerDisco(clave) {
    try {
        const v = JSON.parse(localStorage.getItem(PREFIJO + clave));
        if (v && Date.now() - v.t < VIEJO_MS) return v.data;
    } catch { /* sin almacenamiento o dato roto */ }
    return null;
}

function guardarDisco(clave, data) {
    try {
        const texto = JSON.stringify({ t: Date.now(), data });
        if (texto.length > MAX_BYTES) return;
        localStorage.setItem(PREFIJO + clave, texto);
        // Índice de uso: la más reciente al final; las que sobran, fuera.
        let idx = [];
        try { idx = JSON.parse(localStorage.getItem(INDICE)) || []; } catch { idx = []; }
        idx = idx.filter((k) => k !== clave);
        idx.push(clave);
        while (idx.length > MAX_ENTRADAS) localStorage.removeItem(PREFIJO + idx.shift());
        localStorage.setItem(INDICE, JSON.stringify(idx));
    } catch { /* lleno o modo privado: sin caché, la vitrina funciona igual */ }
}

/**
 * @param {string} clave    Identifica la petición (tienda + parámetros).
 * @param {() => Promise<any>} pedir  La petición real.
 * @param {{ persist?: boolean }} opts  persist=false: solo une y reusa en memoria (búsquedas).
 */
export function swr(clave, pedir, { persist = true } = {}) {
    const ahora = Date.now();
    const m = MEM.get(clave);
    let cached = m && m.data !== undefined ? m.data : null;
    if (cached == null && persist) cached = leerDisco(clave);

    let fresh;
    if (m && m.data !== undefined && !m.p && ahora - m.t < FRESCO_MS) {
        fresh = Promise.resolve(m.data);
    } else if (m?.p) {
        fresh = m.p;
    } else {
        const anterior = m && m.data !== undefined ? { t: m.t, data: m.data } : null;
        const p = pedir().then(
            (data) => {
                MEM.set(clave, { t: Date.now(), data });
                if (persist) guardarDisco(clave, data);
                return data;
            },
            (err) => {
                if (anterior) MEM.set(clave, anterior); else MEM.delete(clave);
                throw err;
            },
        );
        MEM.set(clave, { ...(anterior || {}), p });
        fresh = p;
    }
    return { cached, fresh };
}

// Clave estable para una petición de productos (el orden de los parámetros no importa).
export const claveProductos = (token, params) =>
    `p:${token}:${Object.keys(params).sort().map((k) => `${k}=${params[k] ?? ""}`).join("&")}`;

// Lo que hay guardado para esa clave, sin pedir nada: para arrancar un componente ya con datos
// (sin un cuadro de esqueleto entre el primer dibujo y el efecto que lee la caché).
export function peek(clave) {
    const m = MEM.get(clave);
    if (m && m.data !== undefined) return m.data;
    return leerDisco(clave);
}
