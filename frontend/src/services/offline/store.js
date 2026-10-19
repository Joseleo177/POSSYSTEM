// Lo que la caja guarda en el propio equipo para seguir trabajando sin internet: las últimas
// respuestas del servidor, la copia del catálogo, las credenciales para entrar sin conexión y,
// más adelante, la cola de ventas por enviar.
//
// Va en IndexedDB y no en localStorage porque sobrevive igual a un apagón (está en disco), pero
// admite bastante más que los 5 MB de localStorage —un catálogo de miles de productos con sus
// precios no cabe— y no bloquea la pantalla al leer o escribir.
//
// Si el navegador no lo permite (modo privado en algunos, almacenamiento lleno), cada función
// falla en silencio: la caja sigue funcionando en línea como siempre, solo que sin respaldo.

const DB_NAME = "nexus-offline";
const DB_VERSION = 2;
const KV = "kv";
// Ventas hechas sin conexión, una fila por venta (ver outbox.js). Aparte del resto porque se
// recorre entera para enviarlas y para contarlas, y cada una se escribe sola.
const OUTBOX = "outbox";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB no disponible"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Otra pestaña con una versión nueva necesita actualizar la base: esta la suelta y la
      // vuelve a abrir en la próxima operación, en vez de dejarla bloqueada.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

function tx(mode, fn, store = KV) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

export async function kvGet(key) {
  try { return (await tx("readonly", (s) => s.get(key))) ?? null; }
  catch { return null; }
}

export async function kvSet(key, value) {
  try { await tx("readwrite", (s) => s.put(value, key)); return true; }
  catch { return false; }
}

export async function kvDel(key) {
  try { await tx("readwrite", (s) => s.delete(key)); return true; }
  catch { return false; }
}

// La bandeja de ventas. A diferencia de kv, aquí un fallo NO se calla: perder en silencio una
// venta ya cobrada es justo lo que esto existe para evitar, así que quien llama se entera.
export const outboxPut = (entry) => tx("readwrite", (s) => s.put(entry), OUTBOX);
export const outboxGet = (key) => tx("readonly", (s) => s.get(key), OUTBOX).then((r) => r ?? null);
export const outboxAll = () => tx("readonly", (s) => s.getAll(), OUTBOX).then((r) => r || []);
export const outboxDel = (key) => tx("readwrite", (s) => s.delete(key), OUTBOX);

// Pide al navegador que no borre estos datos cuando falte espacio. Chrome y Edge lo conceden
// sin preguntar a una app instalada o muy usada; Safari solo protege lo de una app añadida a
// la pantalla de inicio. Se llama al entrar: no cuesta nada y no muestra ningún aviso.
export async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch { /* sin soporte: se sigue igual */ }
}
