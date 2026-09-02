'use strict';

const { Product, Category, ProductStock, sequelize, Sequelize } = require("../../models");
const Op = Sequelize.Op;

// Unidades que maneja el sistema. Las contables no admiten decimales, así que el paso de
// cantidad nace en 1; las de peso, volumen y longitud trabajan con tres decimales.
const UNIDADES = ["UNIDAD", "KG", "LITRO", "METRO"];
const PASO_POR_UNIDAD = { UNIDAD: 1, KG: 0.001, LITRO: 0.001, METRO: 0.001 };

const texto = (v) => (v == null ? "" : String(v).trim());
const numero = (v) => {
  if (v == null || String(v).trim() === "") return null;
  // El Excel de un cajero venezolano trae comas: "1.234,56" y "12,5" son lo habitual.
  const limpio = String(v).trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = parseFloat(limpio);
  return isNaN(n) ? null : n;
};

// Margen que se desprende del precio y el costo, mismo criterio que el alta manual.
function derivarMargen(price, cost) {
  const p = parseFloat(price), c = parseFloat(cost);
  if (isNaN(p) || isNaN(c) || c <= 0 || p <= 0) return null;
  return parseFloat((((p / c) - 1) * 100).toFixed(2));
}

/**
 * Importación de productos desde la plantilla de Excel.
 *
 * El archivo se lee y se valida en el navegador —ahí está la vista previa—, así que aquí
 * llegan filas ya normalizadas. Aun así se revalida todo: la vista previa es una cortesía
 * para el usuario, no un control de integridad, y este endpoint se puede llamar directo.
 *
 * Reglas, decididas con el dueño:
 *   · Una fila que coincide con un producto existente lo ACTUALIZA. Coincide por código de
 *     barras, y si la fila no trae código, por nombre exacto. Así se puede exportar el
 *     catálogo, corregir precios en Excel y volver a subirlo.
 *   · Una categoría que no existe SE CREA.
 *   · La columna Existencia, cuando trae valor, fija el stock en el almacén elegido. Vacía
 *     no toca el inventario: subir una lista de precios no debería mover el conteo físico.
 *
 * Todo ocurre en una sola transacción: si una fila revienta no queda medio catálogo cargado.
 */
async function importProducts({ rows, warehouse_id, company_id }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const e = new Error("No hay filas para importar"); e.status = 400; e.isOperational = true; throw e;
  }
  if (rows.length > 2000) {
    const e = new Error("Máximo 2000 filas por archivo. Divide la carga en varios."); e.status = 400; e.isOperational = true; throw e;
  }

  // ── Normalización y validación fila por fila ────────────────────────────────
  const limpias = [];
  const errores = [];

  rows.forEach((row, i) => {
    // La fila 1 del Excel son los encabezados, así que la primera de datos es la 2.
    const fila = i + 2;
    const name = texto(row.name);
    if (!name) { errores.push({ fila, motivo: "Falta el nombre del producto" }); return; }

    const unidad = (texto(row.unit) || "UNIDAD").toUpperCase();
    if (!UNIDADES.includes(unidad)) {
      errores.push({ fila, motivo: `"${name}": unidad "${row.unit}" no válida (${UNIDADES.join(", ")})` }); return;
    }

    // Cómo se compró: presentación, cuánto trae y qué se pagó por el envase completo.
    //
    // La presentación no se contrasta contra una lista cerrada a propósito. `package_unit` es
    // texto libre en el modelo —hay productos con empaques que nunca estuvieron en el
    // desplegable— y quien valida contra la lista es la pantalla, que la tiene en un solo
    // sitio (constants/pkg.js). Repetirla aquí significaría que agregar un empaque nuevo lo
    // dejaría aceptado en el modal y rechazado en la importación, hasta que alguien se
    // acordara de tocar los dos archivos. Solo se normaliza a mayúsculas y se acota el largo.
    const pkgUnit = texto(row.package_unit).toUpperCase().slice(0, 50) || null;
    const pkgSize = numero(row.package_size);
    if (pkgSize != null && pkgSize <= 0) { errores.push({ fila, motivo: `"${name}": la cantidad por presentación debe ser mayor que cero` }); return; }
    const bulk = numero(row.bulk_price);
    if (bulk != null && bulk < 0) { errores.push({ fila, motivo: `"${name}": el precio de compra no puede ser negativo` }); return; }

    // El costo sale del bulto cuando no viene escrito: un saco de 20 kg en 30 deja el kilo
    // en 1,50. Mismo criterio que aplica la vista previa en el navegador.
    const costEscrito = numero(row.cost_price);
    let cost = costEscrito;
    if (cost == null && bulk != null && pkgSize != null) {
      cost = parseFloat((bulk / pkgSize).toFixed(4));
    }
    if (cost != null && cost < 0) { errores.push({ fila, motivo: `"${name}": el costo no puede ser negativo` }); return; }
    if (bulk != null && pkgSize == null && costEscrito == null) {
      errores.push({ fila, motivo: `"${name}": pusiste precio de compra pero falta la cantidad por presentación` }); return;
    }

    const margen = numero(row.profit_margin);
    if (margen != null && margen < 0) { errores.push({ fila, motivo: `"${name}": el % de ganancia no puede ser negativo` }); return; }

    // El precio se escribe, o sale del costo más el margen. Una de las dos.
    let price = numero(row.price);
    if (price == null && cost != null && margen != null) {
      price = parseFloat((cost * (1 + margen / 100)).toFixed(2));
    }
    if (price == null) {
      errores.push({ fila, motivo: `"${name}": falta el precio (o el costo y el % de ganancia para calcularlo)` }); return;
    }
    if (price < 0) { errores.push({ fila, motivo: `"${name}": el precio no puede ser negativo` }); return; }

    const min = numero(row.min_stock);
    if (min != null && min < 0) { errores.push({ fila, motivo: `"${name}": el mínimo no puede ser negativo` }); return; }

    // La existencia se puede contar en presentaciones: tres cajas de 24 son 72. Si vienen las dos,
    // manda la existencia escrita, que es el número más específico.
    const pkgQty = numero(row.package_qty);
    if (pkgQty != null && pkgQty < 0) { errores.push({ fila, motivo: `"${name}": la cantidad de presentaciones no puede ser negativa` }); return; }
    if (pkgQty != null && pkgSize == null) {
      errores.push({ fila, motivo: `"${name}": pusiste cantidad de presentaciones pero falta cuántas unidades trae cada uno` }); return;
    }

    let existencia = numero(row.stock);
    if (existencia == null && pkgQty != null) {
      existencia = parseFloat((pkgQty * pkgSize).toFixed(3));
    }
    if (existencia != null) {
      if (existencia < 0) { errores.push({ fila, motivo: `"${name}": la existencia no puede ser negativa` }); return; }
      // Un producto contable no puede tener media unidad.
      if (unidad === "UNIDAD") existencia = Math.floor(existencia);
    }

    limpias.push({
      fila,
      name,
      price,
      unit: unidad,
      barcode: texto(row.barcode) || null,
      category: texto(row.category) || null,
      profit_margin: margen,
      package_unit: pkgUnit,
      package_size: pkgSize,
      bulk_price: bulk,
      cost_price: cost,
      min_stock: min,
      stock: existencia,
    });
  });

  // Códigos de barras repetidos DENTRO del archivo: si se dejan pasar, la segunda fila
  // actualiza lo que acaba de crear la primera y el resultado depende del orden.
  const vistos = new Map();
  for (const r of limpias) {
    if (!r.barcode) continue;
    if (vistos.has(r.barcode)) {
      errores.push({ fila: r.fila, motivo: `Código de barras "${r.barcode}" repetido en el archivo (fila ${vistos.get(r.barcode)})` });
    } else {
      vistos.set(r.barcode, r.fila);
    }
  }

  if (errores.length) {
    const e = new Error(`El archivo tiene ${errores.length} ${errores.length === 1 ? "fila con problemas" : "filas con problemas"}`);
    e.status = 400; e.isOperational = true; e.detalles = errores.slice(0, 50);
    throw e;
  }

  // ── Escritura ───────────────────────────────────────────────────────────────
  const t = await sequelize.transaction();
  try {
    // Categorías existentes, indexadas sin distinguir mayúsculas ni acentos de más.
    const cats = await Category.findAll({ where: company_id ? { company_id } : {}, transaction: t });
    const catPorNombre = new Map(cats.map(c => [c.name.trim().toLowerCase(), c.id]));
    const categoriasCreadas = [];

    for (const r of limpias) {
      if (!r.category) continue;
      const clave = r.category.toLowerCase();
      if (catPorNombre.has(clave)) continue;
      const nueva = await Category.create({ name: r.category, company_id }, { transaction: t });
      catPorNombre.set(clave, nueva.id);
      categoriasCreadas.push(r.category);
    }

    // Se traen de una vez los productos que podrían coincidir, en lugar de una consulta por
    // fila: con 500 productos eso son 500 viajes a la base dentro de una transacción abierta.
    const barcodes = limpias.map(r => r.barcode).filter(Boolean);
    const nombres  = limpias.filter(r => !r.barcode).map(r => r.name);
    const posibles = await Product.findAll({
      where: {
        ...(company_id ? { company_id } : {}),
        [Op.or]: [
          ...(barcodes.length ? [{ barcode: { [Op.in]: barcodes } }] : []),
          ...(nombres.length  ? [{ name: { [Op.in]: nombres } }] : []),
          ...(!barcodes.length && !nombres.length ? [{ id: -1 }] : []),
        ],
      },
      transaction: t,
      lock: true,
    });
    const porBarcode = new Map(posibles.filter(p => p.barcode).map(p => [p.barcode, p]));
    const porNombre  = new Map(posibles.map(p => [p.name.trim().toLowerCase(), p]));

    let creados = 0, actualizados = 0, conStock = 0;

    for (const r of limpias) {
      const categoryId = r.category ? catPorNombre.get(r.category.toLowerCase()) : null;
      const existente = r.barcode ? porBarcode.get(r.barcode) : porNombre.get(r.name.toLowerCase());

      // Lo que es del producto y vale igual en toda la empresa. El empaque va aquí: cómo se
      // compra el producto no cambia porque lo venda otra tienda.
      const camposGlobales = {
        name: r.name,
        unit: r.unit,
        qty_step: PASO_POR_UNIDAD[r.unit],
        ...(categoryId ? { category_id: categoryId } : {}),
        ...(r.barcode ? { barcode: r.barcode } : {}),
        ...(r.package_unit ? { package_unit: r.package_unit } : {}),
        ...(r.package_size != null ? { package_size: r.package_size } : {}),
        ...(r.bulk_price != null ? { bulk_price: r.bulk_price } : {}),
      };
      // Lo que puede diferir por sucursal.
      const camposPrecio = {
        price: r.price,
        ...(r.cost_price != null ? { cost_price: r.cost_price } : {}),
        ...(r.min_stock != null ? { min_stock: r.min_stock } : {}),
      };
      // Habiendo costo, el margen se deduce del precio final: es la única cifra que no puede
      // contradecir a las otras dos. El escrito solo se guarda cuando no hay costo con qué
      // hacer la cuenta —y en ese caso el precio ya salió de él, así que cuadra igual—.
      const costoVigente = r.cost_price ?? existente?.cost_price;
      const margen = derivarMargen(r.price, costoVigente) ?? r.profit_margin;

      let producto;
      if (existente) {
        // Un combo o un servicio no se tocan desde aquí: su precio sale de otra parte y no
        // llevan existencias, así que una plantilla de productos no tiene por qué pisarlos.
        if (existente.is_combo || existente.is_service) continue;
        // Misma regla que editar desde el catálogo: parado en una sucursal, el precio, el
        // costo y el mínimo son DE ESA SUCURSAL. Lo global —nombre, categoría, unidad,
        // código— sí se actualiza, porque es del producto y no tendría sentido por tienda.
        // Sin sucursal elegida no hay ficha donde escribir, así que rige el del catálogo.
        await existente.update(
          warehouse_id
            ? camposGlobales
            : { ...camposGlobales, ...camposPrecio, ...(margen != null ? { profit_margin: margen } : {}) },
          { transaction: t }
        );
        producto = existente;
        actualizados++;
      } else {
        const campos = { ...camposGlobales, ...camposPrecio, ...(margen != null ? { profit_margin: margen } : {}) };
        producto = await Product.create({
          ...campos,
          stock: 0,
          company_id,
          category_id: categoryId || null,
          barcode: r.barcode || null,
          cost_price: r.cost_price ?? null,
          min_stock: r.min_stock ?? 0,
          sellable: true,
          visible_in_catalog: false,
        }, { transaction: t });
        creados++;
      }

      // La ficha en el almacén: se crea siempre que haya almacén elegido, porque tener ficha
      // es lo que hace que la sucursal "maneje" ese producto. La cantidad solo se fija si la
      // columna Existencia venía con valor.
      if (warehouse_id) {
        const [ficha] = await ProductStock.findOrCreate({
          where: { warehouse_id, product_id: producto.id },
          defaults: { qty: 0, company_id },
          transaction: t,
          lock: true,
        });

        const cambios = {};
        if (r.stock != null) { cambios.qty = r.stock; conStock++; }

        // Precio, costo y mínimo de la sucursal, solo para los que ya existían: en uno recién
        // creado ya quedaron en el producto y repetirlos aquí sería anclar la sucursal a un
        // número que de todos modos hereda. Un valor igual al general se guarda como NULL,
        // por lo mismo: es el general escrito a mano, no un precio propio.
        if (existente) {
          const propio = (nuevo, general) =>
            nuevo == null ? undefined
              : (Math.abs(nuevo - parseFloat(general ?? NaN)) < 1e-9 ? null : nuevo);
          const p = propio(r.price, producto.price);
          const c = propio(r.cost_price, producto.cost_price);
          const m = propio(r.min_stock, producto.min_stock);
          if (p !== undefined) cambios.price = p;
          if (c !== undefined) cambios.cost_price = c;
          if (m !== undefined) cambios.min_stock = m;
        }

        if (Object.keys(cambios).length) await ficha.update(cambios, { transaction: t });
      }

      // `products.stock` es el consolidado de todas las sucursales; se recalcula igual que
      // en el resto del sistema para que el catálogo global no quede desfasado.
      const total = await ProductStock.sum("qty", { where: { product_id: producto.id }, transaction: t });
      await producto.update({ stock: total || 0 }, { transaction: t });
    }

    await t.commit();
    return {
      data: {
        creados,
        actualizados,
        con_existencia: conStock,
        categorias_creadas: categoriasCreadas,
        total: limpias.length,
      },
      message: `${creados} ${creados === 1 ? "producto creado" : "productos creados"}, ${actualizados} ${actualizados === 1 ? "actualizado" : "actualizados"}`,
    };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = { importProducts, UNIDADES };
