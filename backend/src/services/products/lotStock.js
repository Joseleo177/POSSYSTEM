const { ProductLot, Sequelize } = require("../../models");
const { Op } = Sequelize;

const round3 = (n) => Math.round((parseFloat(n) || 0) * 1000) / 1000;

/**
 * Descuenta `qty` de los lotes de (warehouse_id, product_id) siguiendo orden FEFO:
 *  1. Primero lotes vigentes (expiration_date >= hoy) ordenados del que vence más pronto al más lejano.
 *  2. Si no alcanza con los vigentes, toma de los lotes vencidos con saldo restante.
 *
 * Si el producto no tiene ningún lote con saldo en esa sucursal, devuelve `null` (cero impacto
 * en productos que no llevan control de lote o en otros rubros).
 */
async function consumeLotsFEFO({ warehouse_id, product_id, qty, transaction }) {
  const needed = round3(qty);
  if (!warehouse_id || !product_id || needed <= 0) return null;

  const lots = await ProductLot.findAll({
    where: { warehouse_id, product_id, qty: { [Op.gt]: 0 } },
    attributes: ["id", "product_id", "warehouse_id", "lot_number", "expiration_date", "qty"],
    order: [["expiration_date", "ASC"], ["id", "ASC"]],
    transaction,
    lock: true,
  });
  if (!lots.length) return null;

  const today = new Date().toISOString().slice(0, 10);
  const vigentes = lots.filter(l => String(l.expiration_date) >= today);
  const vencidos = lots.filter(l => String(l.expiration_date) < today);
  const ordered = [...vigentes, ...vencidos];

  let remaining = needed;
  const allocations = [];
  for (const lot of ordered) {
    if (remaining <= 0) break;
    const avail = round3(lot.qty);
    if (avail <= 0) continue;
    const take = round3(Math.min(avail, remaining));
    await lot.decrement("qty", { by: take, silent: true, transaction });
    allocations.push({
      lot_id: lot.id,
      lot_number: lot.lot_number,
      expiration_date: lot.expiration_date,
      qty: take,
    });
    remaining = round3(remaining - take);
  }

  return allocations.length ? allocations : null;
}

/**
 * Repone lotes al anular una venta, devolver mercancía o anular una transferencia.
 * `ratio` permite devoluciones parciales (ej. si vendió 10 y devolvió 4 → ratio = 0.4).
 */
async function restoreLots({ allocations, warehouse_id, product_id, ratio = 1, company_id, transaction }) {
  if (!Array.isArray(allocations) || !allocations.length || ratio <= 0) return;
  for (const alloc of allocations) {
    const qtyBack = round3(parseFloat(alloc.qty || 0) * ratio);
    if (qtyBack <= 0) continue;

    let lot = alloc.lot_id
      ? await ProductLot.findByPk(alloc.lot_id, {
          attributes: ["id", "product_id", "warehouse_id", "lot_number", "expiration_date", "qty"],
          transaction,
          lock: true,
        })
      : null;

    if (!lot && warehouse_id && product_id && alloc.lot_number && alloc.expiration_date) {
      const [found] = await ProductLot.findOrCreate({
        where: {
          warehouse_id,
          product_id,
          lot_number: String(alloc.lot_number),
          expiration_date: alloc.expiration_date,
        },
        defaults: { qty: 0, ...(company_id ? { company_id } : {}) },
        transaction,
        lock: true,
      });
      lot = found;
    }

    if (lot) {
      await lot.increment("qty", { by: qtyBack, silent: true, transaction });
    }
  }
}

/**
 * Acredita en el almacén destino los lotes que viajaron en una transferencia.
 */
async function receiveLots({ allocations, warehouse_id, product_id, ratio = 1, company_id, transaction }) {
  if (!Array.isArray(allocations) || !allocations.length || !warehouse_id || !product_id || ratio <= 0) return;
  for (const alloc of allocations) {
    const qtyIn = round3(parseFloat(alloc.qty || 0) * ratio);
    if (qtyIn <= 0 || !alloc.lot_number || !alloc.expiration_date) continue;

    const [destLot] = await ProductLot.findOrCreate({
      where: {
        warehouse_id,
        product_id,
        lot_number: String(alloc.lot_number),
        expiration_date: alloc.expiration_date,
      },
      defaults: { qty: 0, ...(company_id ? { company_id } : {}) },
      transaction,
      lock: true,
    });
    await destLot.increment("qty", { by: qtyIn, silent: true, transaction });
  }
}

module.exports = { consumeLotsFEFO, restoreLots, receiveLots };
