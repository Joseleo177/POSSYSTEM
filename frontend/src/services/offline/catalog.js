import { api } from "../api";
import { kvGet, kvSet } from "./store";
import { isOffline } from "./network";

// Copia del catálogo y de los clientes de la sucursal, para vender sin conexión.
//
// Se baja entera mientras hay internet, cada cierto tiempo y solo con la caja a la vista. Los
// productos cambian de precio y de existencia durante el día; los clientes casi no cambian,
// así que se refrescan mucho menos. Sin conexión, la grilla y el buscador de clientes leen de
// aquí y filtran en el propio equipo.
//
// La copia de productos va sin agrupar variantes: sin servidor no se puede abrir el selector
// de tallas, así que cada variante sale como su propia tarjeta (y el escáner la encuentra igual).

const PRODUCTOS_CADA_MS = 15 * 60 * 1000;
const CLIENTES_CADA_MS = 6 * 60 * 60 * 1000;

const claveProductos = (wid) => `catalogo:${wid}`;
const claveClientes = (wid) => `clientes:${wid}`;

const sinAcentos = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

let bajando = new Set();

async function bajar(clave, cadaMs, pedir) {
  if (isOffline() || bajando.has(clave)) return;
  const previo = await kvGet(clave);
  if (previo && Date.now() - previo.at < cadaMs) return;
  bajando.add(clave);
  try {
    const r = await pedir();
    if (Array.isArray(r?.data)) await kvSet(clave, { at: Date.now(), items: r.data });
  } catch { /* se intenta en la próxima vuelta */ }
  finally { bajando.delete(clave); }
}

// Pone al día la copia de la sucursal si ya está vieja. Lo llama la caja al abrir y cada pocos
// minutos; si la copia es reciente no consulta nada.
export function refrescarDatosLocales(warehouseId) {
  if (!warehouseId) return;
  bajar(claveProductos(warehouseId), PRODUCTOS_CADA_MS,
    () => api.warehouses.getProducts(warehouseId, { limit: 10000, offset: 0, sellable_only: true }));
  bajar(claveClientes(warehouseId), CLIENTES_CADA_MS,
    () => api.customers.getAll({ limit: 10000, warehouse_id: warehouseId }));
}

export async function antiguedadCatalogo(warehouseId) {
  const c = await kvGet(claveProductos(warehouseId));
  return c ? Date.now() - c.at : null;
}

// Misma respuesta que /warehouses/:id/products ({ data, total }), filtrada en el equipo con
// los mismos criterios: nombre, categoría o código de barras, y la categoría por nombre. El
// código exacto va primero, como el escáner espera.
export async function buscarEnCatalogo(warehouseId, { search = "", category = "all", offset = 0, limit = 60 } = {}) {
  const c = await kvGet(claveProductos(warehouseId));
  if (!c) return { data: [], total: 0, sinCopia: true };
  const q = sinAcentos(search.trim());
  let lista = c.items.filter((p) => !p.is_variant_parent);
  if (category && category !== "all") lista = lista.filter((p) => p.category_name === category);
  if (q) {
    const exacto = lista.filter((p) => p.barcode && sinAcentos(p.barcode) === q);
    const resto = lista.filter((p) => !exacto.includes(p) && (
      sinAcentos(p.name).includes(q) || sinAcentos(p.category_name).includes(q) || sinAcentos(p.barcode).includes(q)
    ));
    lista = [...exacto, ...resto];
  }
  return { data: lista.slice(offset, offset + limit), total: lista.length };
}

// Lo vendido sin conexión se descuenta de la copia, para que la caja no ofrezca lo que ya no
// hay. El servidor hace la cuenta buena al recibir la venta; la copia se reemplaza en la
// siguiente bajada.
export async function descontarDeCatalogo(warehouseId, lineas) {
  const c = await kvGet(claveProductos(warehouseId));
  if (!c) return;
  const vendido = new Map(lineas.map((l) => [l.product_id, parseFloat(l.quantity) || 0]));
  const items = c.items.map((p) => (vendido.has(p.id) && p.stock != null && !p.is_service
    ? { ...p, stock: parseFloat(p.stock) - vendido.get(p.id) }
    : p));
  await kvSet(claveProductos(warehouseId), { ...c, items });
}

export async function buscarClientesLocal(warehouseId, search) {
  const c = await kvGet(claveClientes(warehouseId));
  if (!c) return [];
  const q = sinAcentos(search.trim());
  if (!q) return [];
  return c.items
    .filter((x) => x.type !== "proveedor")
    .filter((x) => [x.name, x.rif, x.phone, x.email, x.tax_name].some((v) => sinAcentos(v).includes(q)))
    .slice(0, 20);
}
