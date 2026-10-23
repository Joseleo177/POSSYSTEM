'use strict';

// Lo que Fábrica le presta al resto del sistema: numerar piezas al recibir una compra y
// validar el "control por piezas" de un producto desde la ficha del catálogo. Vive aparte de
// pieces.js para que Compras y Productos no carguen el módulo entero.

const {
  MaterialPiece, Op,
  fail, r3, r4, isMode, unitOfMode, sizeOf, mm, lockNumbering,
} = require("./shared");

const ACTIVE = ["disponible", "en_taller"];

/**
 * Crea `count` piezas numeradas con el siguiente número de la empresa (51, 52, ...).
 * `transaction` es obligatoria: el número se reserva con un candado de la transacción.
 *
 * `firstNumber` numera desde ahí en vez del siguiente: la carga inicial de quien ya traía sus
 * láminas numeradas a mano (la #51 del Excel sigue siendo la #51). Ningún número del rango
 * puede existir, en ningún estado: un número no se reutiliza. Lo que se numere después sigue
 * tras el más alto, así que los huecos quedan libres para cargarlos más tarde.
 */
async function createNumberedPieces({
  product, warehouseId, count, widthMm, lengthMm, unitCost,
  origin, reference = null, purchaseItemId = null, notes = null, employeeId = null, firstNumber = null,
}, transaction) {
  if (!transaction) throw new Error("createNumberedPieces requiere transacción");
  if (!isMode(product.piece_mode)) throw fail(`"${product.name}" no se controla por piezas`);
  const companyId = product.company_id;
  const size = sizeOf(product.piece_mode, widthMm, lengthMm);

  await lockNumbering("piezas", companyId, transaction);
  let first;
  if (firstNumber != null) {
    first = firstNumber;
    const last = first + count - 1;
    const taken = await MaterialPiece.findOne({
      where: { company_id: companyId, root_number: { [Op.between]: [first, last] } },
      attributes: ["root_number"], order: [["root_number", "ASC"]], transaction,
    });
    if (taken) {
      throw fail(count === 1
        ? `El #${first} ya existe`
        : `El #${taken.root_number} ya existe: del #${first} al #${last} tienen que estar libres`);
    }
  } else {
    const max = await MaterialPiece.max("root_number", { where: { company_id: companyId }, transaction });
    first = (parseInt(max) || 0) + 1;
  }

  const pieces = [];
  for (let i = 0; i < count; i++) {
    const n = first + i;
    pieces.push(await MaterialPiece.create({
      company_id: companyId,
      product_id: product.id,
      warehouse_id: warehouseId,
      code: String(n),
      root_number: n,
      width_mm: product.piece_mode === "length" ? null : widthMm,
      length_mm: lengthMm,
      size,
      unit_cost: r4(unitCost),
      status: "disponible",
      origin,
      reference,
      purchase_item_id: purchaseItemId,
      notes,
      employee_id: employeeId,
    }, { transaction }));
  }
  return { pieces, first, last: first + count - 1, size };
}

/**
 * Cuántas piezas son `qty` unidades de producto (m² o m) de `pieceSize` cada una. Tiene que
 * dar entero: media lámina no se numera.
 */
function wholePieces(qty, pieceSize, productName) {
  const exact = parseFloat(qty) / parseFloat(pieceSize);
  const count = Math.round(exact);
  if (count < 1 || Math.abs(exact - count) > 0.001) {
    throw fail(`"${productName}": ${r3(qty)} no son piezas completas de ${r3(pieceSize)}. Recibe la cantidad de piezas, no una fracción.`);
  }
  return count;
}

/**
 * Valida el control por piezas que llega de la ficha del producto (o de Materiales) y
 * devuelve los cambios a guardar. `input` = { piece_mode, piece_width_mm, piece_length_mm };
 * piece_mode vacío lo apaga.
 *
 * La unidad del producto pasa a ser la del modo (M2 o METRO). Con existencia en otra unidad
 * se rechaza: las cifras viejas quedarían leyéndose en metros. Cambiar de modo, o apagarlo,
 * con piezas vivas también: quedarían piezas que ya nadie sabe medir.
 */
async function pieceConfigChanges(product, input, transaction) {
  const raw = input.piece_mode;
  const mode = raw === "" || raw === "null" || raw == null ? null : String(raw);
  if (mode !== null && !isMode(mode)) throw fail("Control por piezas: elige por área o por longitud");
  if (product && (product.is_combo || product.is_service || product.is_variant_parent) && mode) {
    throw fail("Un combo, un servicio o un modelo con variantes no se controla por piezas");
  }

  const current = product?.piece_mode || null;
  if (product?.id && current && current !== mode) {
    const vivas = await MaterialPiece.count({
      where: { product_id: product.id, status: { [Op.in]: ACTIVE } }, transaction,
    });
    if (vivas) throw fail(`"${product.name}" tiene ${vivas} pieza(s) en existencia: no se puede cambiar su control por piezas`);
  }

  if (!mode) return current ? { piece_mode: null, piece_width_mm: null, piece_length_mm: null } : {};

  const changes = {
    piece_mode: mode,
    piece_length_mm: mm(input.piece_length_mm, "Formato, largo"),
    piece_width_mm: mode === "area" ? mm(input.piece_width_mm, "Formato, ancho") : null,
  };
  const unit = unitOfMode(mode);
  if (String(product?.unit || "").toUpperCase() !== unit) {
    if (product?.id && parseFloat(product.stock || 0) !== 0) {
      throw fail(`"${product.name}" tiene existencia en ${product.unit}. Llévala a cero antes de controlarlo por piezas en ${unit}.`);
    }
    changes.unit = unit;
    changes.qty_step = 0.001;
  }
  return changes;
}

// ── Compras ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza una línea de compra de un material por piezas: las medidas de cada pieza (las
 * que vengan, o el formato del material) y el empaque que resulta. El tamaño lo calcula el
 * servidor: "unidades por empaque" deja de ser un número que alguien teclea y pasa a ser el
 * área (o largo) de la pieza. La cantidad de empaques es la cantidad de piezas: entera.
 * Para un producto normal devuelve null y la línea sigue como siempre.
 */
function purchaseLineSpec(product, item) {
  if (!product?.piece_mode) return null;
  const w = item.piece_width_mm ?? product.piece_width_mm;
  const l = item.piece_length_mm ?? product.piece_length_mm;
  const length = mm(l, `"${product.name}", largo de la pieza`);
  const width = product.piece_mode === "area" ? mm(w, `"${product.name}", ancho de la pieza`) : null;
  const qty = parseFloat(item.package_qty);
  if (!Number.isInteger(qty) || qty < 1) throw fail(`"${product.name}": la cantidad de piezas va sin decimales`);
  return {
    piece_width_mm: width,
    piece_length_mm: length,
    package_unit: "PIEZA",
    package_size: sizeOf(product.piece_mode, width, length),
  };
}

/**
 * Numera las piezas que entran al recibir una línea de compra. `qtyIn` en la unidad del
 * producto; tiene que dar piezas completas.
 */
async function numberPurchaseReceipt({ product, item, warehouseId, qtyIn, reference, employeeId }, transaction) {
  if (!product?.piece_mode || !(qtyIn > 0)) return null;
  const w = item.piece_width_mm ?? product.piece_width_mm;
  const l = item.piece_length_mm ?? product.piece_length_mm;
  const size = sizeOf(product.piece_mode, w, l);
  const count = wholePieces(qtyIn, size, product.name);
  return createNumberedPieces({
    product, warehouseId, count, widthMm: w, lengthMm: l,
    unitCost: item.unit_cost, origin: "compra", reference, purchaseItemId: item.id, employeeId,
  }, transaction);
}

/**
 * Al anular una compra, sus piezas salen con ella. Si alguna ya se entregó, se cortó o se dio
 * de baja, la anulación no procede: devolvería material que ya no está.
 */
async function releasePurchasePieces(purchaseItemIds, reference, transaction) {
  if (!purchaseItemIds.length) return;
  const pieces = await MaterialPiece.findAll({
    where: { purchase_item_id: { [Op.in]: purchaseItemIds } }, transaction, lock: true,
  });
  const usada = pieces.find(p => p.status !== "disponible");
  if (usada) {
    throw fail(`No se puede anular la compra: la pieza #${usada.code} ya se usó en Fábrica`);
  }
  if (pieces.length) {
    await MaterialPiece.update(
      { status: "baja", closed_at: new Date(), notes: reference },
      { where: { id: { [Op.in]: pieces.map(p => p.id) } }, transaction }
    );
  }
}

module.exports = {
  ACTIVE, createNumberedPieces, wholePieces, pieceConfigChanges,
  purchaseLineSpec, numberPurchaseReceipt, releasePurchasePieces,
};
