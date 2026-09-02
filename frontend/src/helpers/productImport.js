import * as XLSX from "xlsx";
import { PKG_UNITS } from "../constants/pkg";

// Plantilla de importación de productos.
//
// Las columnas se nombran como las ve el dueño de la tienda, no como se llaman en la base.
// El archivo que se descarga es el mismo que se vuelve a subir, así que exportar el catálogo,
// corregir precios en Excel y reimportarlo es un ciclo cerrado.
// Van agrupadas como se piensa un producto: qué es, a cómo se vende, cómo se compró y
// cuánto hay. El precio se puede dejar vacío si vienen el costo y el % de ganancia.
export const COLUMNAS = [
  // Qué es
  { key: "name",         label: "Producto",        obligatoria: true,  ejemplos: ["Harina de Maíz 1kg", "Queso Blanco"] },
  { key: "category",     label: "Categoría",       obligatoria: false, ejemplos: ["Víveres", "Charcutería"] },
  { key: "unit",         label: "Unidad",          obligatoria: false, ejemplos: ["UNIDAD", "KG"] },
  { key: "barcode",      label: "Código de Barras",obligatoria: false, ejemplos: ["7591234567890", ""] },
  // A cómo se vende
  { key: "price",        label: "Precio",          obligatoria: false, ejemplos: [1.85, ""] },
  { key: "profit_margin",label: "% Ganancia",      obligatoria: false, ejemplos: ["", 30] },
  // Cómo se compró. Mismos términos que la ficha del producto y la orden de compra: quien
  // llena esto ya los conoce de esas pantallas y no tiene por qué aprender otros.
  { key: "cost_price",   label: "Costo",             obligatoria: false, ejemplos: [1.20, ""] },
  // Sin el "×": en el Excel cada fila puede traer una presentación distinta, así que el rótulo no
  // puede nombrarlo como hace la pantalla de compras, pero sí evitar el símbolo que se lee
  // como multiplicación cuando lo que dice es "por cada uno".
  { key: "package_unit", label: "Presentación",          obligatoria: false, ejemplos: ["", "SACO"] },
  { key: "package_size", label: "Unidades por Presentación",obligatoria: false, ejemplos: ["", 20] },
  { key: "bulk_price",   label: "Costo por Presentación",obligatoria: false, ejemplos: ["", 30] },
  // Cuánto hay
  { key: "min_stock",    label: "Stock Mínimo",      obligatoria: false, ejemplos: [12, 5] },
  { key: "package_qty",  label: "Cant. de Presentaciones",obligatoria: false, ejemplos: ["", 3] },
  { key: "stock",        label: "Existencia",        obligatoria: false, ejemplos: [48, ""] },
];

// Cómo se vende: por pieza, por peso, por volumen o por longitud.
export const UNIDADES = ["UNIDAD", "KG", "LITRO", "METRO"];
// Cómo se compra: el envase en que llega del proveedor. Se toma de constants/pkg.js, que es
// la lista única del sistema; duplicarla aquí haría que agregar un empaque nuevo lo dejara
// aceptado en el modal de producto y rechazado en la importación.
export const PRESENTACIONES = PKG_UNITS;

// Encabezados tolerantes: da igual mayúsculas, acentos o espacios de más. Alguien va a
// escribir "categoria" sin tilde y el archivo no debería rebotar por eso.
const normalizar = (s) =>
  String(s || "").trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");

const ALIAS = COLUMNAS.reduce((acc, c) => {
  acc[normalizar(c.label)] = c.key;
  return acc;
}, {
  // Sinónimos frecuentes de quien arma la lista a mano o la saca de otro sistema.
  "nombre": "name", "descripcion": "name", "producto/servicio": "name",
  "precio venta": "price", "precio de venta": "price", "pvp": "price",
  "categoria": "category", "rubro": "category",
  "medida": "unit", "unidad de medida": "unit",
  "codigo": "barcode", "codigo de barra": "barcode", "cod barras": "barcode", "ean": "barcode",
  "costo unitario": "cost_price", "precio costo": "cost_price",
  "minimo": "min_stock", "stock minimo": "min_stock", "existencia minima": "min_stock",
  "cantidad": "stock", "stock": "stock", "existencias": "stock", "stock actual": "stock",
  "ganancia": "profit_margin", "margen": "profit_margin", "% de ganancia": "profit_margin",
  "utilidad": "profit_margin", "porcentaje de ganancia": "profit_margin",
  "empaque": "package_unit", "presentacion": "package_unit", "bulto": "package_unit",
  "unidades por presentacion": "package_size", "contenido": "package_size",
  "unidades por bulto": "package_size", "cantidad por bulto": "package_size",
  "unidades por embalaje": "package_size", "unidades en caja": "package_size",
  "unidad x embalaje": "package_size",
  "precio bulto": "bulk_price", "costo bulto": "bulk_price", "precio del bulto": "bulk_price",
  "precio de compra": "bulk_price", "costo x embalaje": "bulk_price",
  "costo por embalaje": "bulk_price", "costo de la caja": "bulk_price",
  "cantidad de embalajes": "package_qty", "cant. de cajas": "package_qty",
  "cantidad de cajas": "package_qty", "cajas": "package_qty", "bultos": "package_qty",
  "cant a pedir": "package_qty", "cantidad de presentaciones": "package_qty",
  "presentaciones": "package_qty",
  // "Embalaje" fue el término anterior. Se conserva como sinónimo para que un archivo llenado
  // con la plantilla vieja siga entrando sin que nadie tenga que renombrar encabezados.
  "embalaje": "package_unit",
});

// Genera y descarga la plantilla vacía, con una fila de ejemplo.
export function descargarPlantilla() {
  const encabezados = COLUMNAS.map(c => c.obligatoria ? `${c.label} *` : c.label);
  // Dos ejemplos a propósito: uno que se vende por pieza con el precio puesto a mano, y otro
  // que se vende por kilo y sale del costo más un margen. Entre los dos se ve todo.
  const ejemploA = COLUMNAS.map(c => c.ejemplos[0]);
  const ejemploB = COLUMNAS.map(c => c.ejemplos[1]);

  const ws = XLSX.utils.aoa_to_sheet([encabezados, ejemploA, ejemploB]);
  ws["!cols"] = COLUMNAS.map(c => ({ wch: Math.max(c.label.length + 4, 16) }));

  // Segunda hoja con las instrucciones: quien abre la plantilla por primera vez no tiene
  // por qué adivinar qué acepta cada columna.
  const ayuda = XLSX.utils.aoa_to_sheet([
    ["Cómo llenar esta plantilla"],
    [],
    ["1.", "Borra las dos filas de ejemplo y escribe tus productos desde la fila 2."],
    ["2.", "Producto es obligatorio. Del precio hay dos formas, mira el punto 4."],
    [],
    ["A cómo se vende"],
    ["3.", `Unidad es la medida en que lo vendes: ${UNIDADES.join(", ")}. Vacía se toma UNIDAD.`],
    ["", "Si vendes por KG, LITRO o METRO, el Precio es POR ESA MEDIDA: el precio del kilo, del litro o del metro."],
    ["", "Solo los productos en UNIDAD no admiten decimales; los demás llevan hasta 3."],
    ["4.", "Pon el Precio, o bien el Costo y el % de Ganancia y el precio se calcula solo."],
    ["", "Ejemplo: costo 1,50 con 30 de ganancia da un precio de 1,95."],
    ["", "Si pones los dos, manda el Precio y el % se recalcula para que la ficha no se contradiga."],
    [],
    ["Cómo lo compras"],
    ["5.", `Presentación es el envase en que te llega: ${PRESENTACIONES.join(", ")}.`],
    ["6.", "Unidades por Presentación es cuánto trae ese envase. Una caja de 24 refrescos lleva 24."],
    ["7.", "Costo por Presentación es lo que pagas por el envase COMPLETO, no por unidad."],
    ["", "Con esos dos el costo sale solo: un saco de 20 kg en 30 deja el kilo en 1,50."],
    ["", "Si prefieres, escribe el Costo directo y deja las tres columnas de presentación vacías."],
    [],
    ["Cuánto tienes"],
    ["8.", "Existencia es cuántas unidades hay: kilos si vendes por KG, piezas si vendes por UNIDAD."],
    ["9.", "Cant. de Presentaciones es lo mismo pero contado en cajas: 3 cajas de 24 son 72 unidades."],
    ["", "Usa la que te resulte más cómoda. Si llenas las dos, manda Existencia."],
    ["", "Las dos vacías no tocan el inventario; el producto entra en cero."],
    [],
    ["Lo demás"],
    ["10.", "Si la Categoría no existe, se crea sola al importar."],
    ["11.", "Si el Código de Barras ya existe, ese producto se ACTUALIZA con estos datos."],
    ["12.", "Sin Código de Barras, se busca por nombre exacto para decidir si crea o actualiza."],
    ["13.", "El stock se carga en la sucursal que tengas elegida al importar."],
    [],
    ["Puedes escribir los decimales con coma (1,85) o con punto (1.85)."],
  ]);
  ayuda["!cols"] = [{ wch: 5 }, { wch: 104 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.utils.book_append_sheet(wb, ayuda, "Instrucciones");
  XLSX.writeFile(wb, "Plantilla_Productos.xlsx");
}

// Mismo criterio de números que el backend: se acepta la coma decimal y el punto de miles.
function aNumero(v) {
  if (v == null || String(v).trim() === "") return null;
  if (typeof v === "number") return v;
  const limpio = String(v).trim().replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(limpio);
  return isNaN(n) ? null : n;
}

/**
 * Lee el archivo y devuelve { filas, errores, columnasIgnoradas }.
 *
 * La validación se hace acá para que el usuario vea lo que está mal ANTES de tocar la base;
 * el servidor la repite igual, porque esta es una cortesía y no un control.
 */
export async function leerArchivo(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Se usa la primera hoja, salvo que exista una llamada "Productos" (la de la plantilla).
  const nombreHoja = wb.SheetNames.find(n => normalizar(n) === "productos") || wb.SheetNames[0];
  const hoja = wb.Sheets[nombreHoja];
  if (!hoja) return { filas: [], errores: [{ fila: 0, motivo: "El archivo no tiene hojas" }], columnasIgnoradas: [] };

  const matriz = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false, defval: "" });
  if (matriz.length < 2) {
    return { filas: [], errores: [{ fila: 0, motivo: "El archivo no tiene filas de datos" }], columnasIgnoradas: [] };
  }

  // Encabezados: se les quita el asterisco de obligatorio que lleva la plantilla.
  const cabecera = matriz[0].map(h => normalizar(String(h).replace(/\*/g, "")));
  const mapa = cabecera.map(h => ALIAS[h] || null);
  const columnasIgnoradas = cabecera.filter((h, i) => h && !mapa[i]).map(h => h);

  if (!mapa.includes("name") || !mapa.includes("price")) {
    return {
      filas: [],
      errores: [{ fila: 1, motivo: 'No encuentro las columnas "Producto" y "Precio". Usa la plantilla o renombra los encabezados.' }],
      columnasIgnoradas: [],
    };
  }

  const filas = [];
  const errores = [];

  for (let i = 1; i < matriz.length; i++) {
    const cruda = matriz[i];
    const fila = i + 1;   // número de fila tal como se ve en Excel
    const row = {};
    mapa.forEach((key, col) => { if (key) row[key] = cruda[col]; });

    const name = String(row.name ?? "").trim();
    // Una fila entera vacía es el final del archivo, no un error: Excel arrastra filas.
    if (!name && Object.values(row).every(v => String(v ?? "").trim() === "")) continue;
    if (!name) { errores.push({ fila, motivo: "Falta el nombre del producto" }); continue; }

    const unit = (String(row.unit ?? "").trim() || "UNIDAD").toUpperCase();
    if (!UNIDADES.includes(unit)) {
      errores.push({ fila, motivo: `"${name}": unidad "${row.unit}" no válida (${UNIDADES.join(", ")})` });
      continue;
    }

    // ── Cómo lo compra ────────────────────────────────────────────────────────
    const pkgUnit = String(row.package_unit ?? "").trim().toUpperCase() || null;
    if (pkgUnit && !PRESENTACIONES.includes(pkgUnit)) {
      errores.push({ fila, motivo: `"${name}": presentación "${row.package_unit}" no válida (${PRESENTACIONES.join(", ")})` });
      continue;
    }
    const pkgSize = aNumero(row.package_size);
    if (pkgSize != null && pkgSize <= 0) { errores.push({ fila, motivo: `"${name}": la cantidad por presentación debe ser mayor que cero` }); continue; }
    const bulk = aNumero(row.bulk_price);
    if (bulk != null && bulk < 0) { errores.push({ fila, motivo: `"${name}": el precio de compra no puede ser negativo` }); continue; }

    // El costo sale del bulto cuando no viene escrito: un saco de 20 kg en 30 deja el kilo
    // en 1,50. Es como se compra de verdad, y ahorra hacer la división a mano en el Excel.
    let cost = aNumero(row.cost_price);
    if (cost == null && bulk != null && pkgSize != null) {
      cost = parseFloat((bulk / pkgSize).toFixed(4));
    }
    if (cost != null && cost < 0) { errores.push({ fila, motivo: `"${name}": el costo no puede ser negativo` }); continue; }
    if (bulk != null && pkgSize == null && aNumero(row.cost_price) == null) {
      errores.push({ fila, motivo: `"${name}": pusiste precio de compra pero falta la cantidad por presentación` });
      continue;
    }

    // ── A cómo se vende ───────────────────────────────────────────────────────
    const margen = aNumero(row.profit_margin);
    if (margen != null && margen < 0) { errores.push({ fila, motivo: `"${name}": el % de ganancia no puede ser negativo` }); continue; }

    // El precio se puede escribir, o salir del costo más el margen. Una de las dos.
    let price = aNumero(row.price);
    if (price == null && cost != null && margen != null) {
      price = parseFloat((cost * (1 + margen / 100)).toFixed(2));
    }
    if (price == null) {
      errores.push({ fila, motivo: `"${name}": falta el precio (o el costo y el % de ganancia para calcularlo)` });
      continue;
    }
    if (price < 0) { errores.push({ fila, motivo: `"${name}": el precio no puede ser negativo` }); continue; }

    const min = aNumero(row.min_stock);
    if (min != null && min < 0) { errores.push({ fila, motivo: `"${name}": el mínimo no puede ser negativo` }); continue; }

    // La existencia se puede contar en presentaciones: tres cajas de 24 son 72. Es como se cuenta
    // de verdad un depósito, y evita sacar la multiplicación a mano en el Excel.
    const pkgQty = aNumero(row.package_qty);
    if (pkgQty != null && pkgQty < 0) { errores.push({ fila, motivo: `"${name}": la cantidad de presentaciones no puede ser negativa` }); continue; }
    if (pkgQty != null && pkgSize == null) {
      errores.push({ fila, motivo: `"${name}": pusiste cantidad de presentaciones pero falta cuántas unidades trae cada uno` });
      continue;
    }

    // Si están las dos, manda la existencia escrita: es el número más específico.
    let stock = aNumero(row.stock);
    const stockDePresentaciones = stock == null && pkgQty != null;
    if (stockDePresentaciones) stock = parseFloat((pkgQty * pkgSize).toFixed(3));
    if (stock != null) {
      if (stock < 0) { errores.push({ fila, motivo: `"${name}": la existencia no puede ser negativa` }); continue; }
      if (unit === "UNIDAD") stock = Math.floor(stock);
    }

    filas.push({
      fila,
      name,
      price,
      // Se marca cuando el precio no venía escrito, para que la vista previa lo muestre como
      // calculado y el dueño confirme que la cuenta es la que esperaba.
      precio_calculado: aNumero(row.price) == null,
      unit,
      barcode: String(row.barcode ?? "").trim() || null,
      category: String(row.category ?? "").trim() || null,
      profit_margin: margen,
      package_unit: pkgUnit,
      package_size: pkgSize,
      bulk_price: bulk,
      // Solo para que la vista previa pueda decir "3 CAJA = 72"; no se guarda en el producto.
      package_qty: pkgQty,
      stock_de_presentaciones: stockDePresentaciones,
      cost_price: cost,
      min_stock: min,
      stock,
    });
  }

  // Códigos repetidos dentro del mismo archivo: la segunda fila actualizaría lo que acaba de
  // crear la primera, y el resultado dependería del orden.
  const vistos = new Map();
  for (const f of filas) {
    if (!f.barcode) continue;
    if (vistos.has(f.barcode)) {
      errores.push({ fila: f.fila, motivo: `Código "${f.barcode}" repetido (ya está en la fila ${vistos.get(f.barcode)})` });
    } else {
      vistos.set(f.barcode, f.fila);
    }
  }

  return { filas, errores, columnasIgnoradas };
}
