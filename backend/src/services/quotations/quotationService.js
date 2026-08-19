const {
  Quotation, QuotationItem,
  Sale, SaleItem,
  Product, ProductStock, ProductComboItem,
  Customer, Employee, Currency, Warehouse, Serie, SerieRange,
  sequelize, Sequelize,
} = require("../../models");
const { assertWarehouseAccess, visibleWarehouseIds } = require("../../middleware/auth");
const { Op } = Sequelize;

// El vendedor sí se guarda al crear la cotización (create recibe employee_id), pero las
// consultas solo traían las líneas: la pantalla y el impreso mostraban "Empleado —" en
// cotizaciones que en la tabla tenían su employee_id. El cliente no hace falta unirlo —el
// nombre y el RIF quedan copiados en la propia cotización, que es lo que se cotizó.
const QUOT_INCLUDE = [
  { model: QuotationItem, as: 'items' },
  { model: Employee, attributes: ['full_name'], required: false },
];

// Sequelize devuelve el empleado anidado; la caja espera `employee_name` plano, igual que en
// ventas (ver getAllSales).
function withEmployeeName(row) {
  const q = row.toJSON();
  q.employee_name = q.Employee?.full_name ?? null;
  delete q.Employee;
  return q;
}

async function getAll({ search, status, date_from, date_to, page = 1, limit = 30, warehouse_id } = {}, req) {
  const where = {};

  // Cada quien ve las cotizaciones de sus sucursales; el admin, todas.
  if (warehouse_id) {
    await assertWarehouseAccess(req, warehouse_id);
    where.warehouse_id = parseInt(warehouse_id);
  } else {
    const allowedWarehouses = await visibleWarehouseIds(req);
    if (allowedWarehouses) where.warehouse_id = { [Op.in]: allowedWarehouses };
  }

  if (status) where.status = status;
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = new Date(date_from + "T00:00:00");
    if (date_to)   where.created_at[Op.lte] = new Date(date_to   + "T23:59:59");
  }
  if (search) {
    const num = parseInt(search);
    const orClauses = [
      { customer_name: { [Op.iLike]: `%${search}%` } },
      { customer_rif:  { [Op.iLike]: `%${search}%` } },
    ];
    if (!isNaN(num)) orClauses.push({ id: num });
    where[Op.or] = orClauses;
  }

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const { count, rows } = await Quotation.findAndCountAll({
    where,
    include: QUOT_INCLUDE,
    order: [["created_at", "DESC"]],
    limit: parseInt(limit),
    offset,
  });

  return { data: rows.map(withEmployeeName), total: count, page: parseInt(page), limit: parseInt(limit) };
}

async function getById(id, req) {
  const q = await Quotation.findByPk(id, {
    include: QUOT_INCLUDE,
  });
  if (!q) { const e = new Error("Cotización no encontrada"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, q.warehouse_id, { optional: true });
  return withEmployeeName(q);
}

async function create(body, employeeId) {
  const { items, customer_id, customer_name, customer_rif, warehouse_id,
          currency_id, exchange_rate, discount_amount, notes } = body;

  if (!items?.length) { const e = new Error("items es requerido"); e.status = 400; throw e; }
  // La caja ya lo valida, pero la regla vive aquí: una cotización sin cliente es un papel sin
  // destinatario y después no hay forma de encontrarla más que por su número —el buscador
  // filtra por nombre y RIF del cliente.
  if (!customer_id) { const e = new Error("El cliente es requerido"); e.status = 400; throw e; }

  const discAmt = parseFloat(discount_amount) || 0;
  let subtotal = 0;
  const enriched = items.map(i => {
    const qty   = parseFloat(i.quantity);
    const price = parseFloat(i.price);
    const sub   = parseFloat((qty * price).toFixed(2));
    subtotal += sub;
    return { product_id: i.product_id, product_name: i.product_name, quantity: qty, price, subtotal: sub };
  });

  const total = parseFloat((subtotal - discAmt).toFixed(2));

  const t = await sequelize.transaction();
  try {
    const quotation = await Quotation.create({
      customer_id:     customer_id || null,
      customer_name:   customer_name || null,
      customer_rif:    customer_rif || null,
      employee_id:     employeeId || null,
      warehouse_id:    warehouse_id || null,
      currency_id:     currency_id || null,
      exchange_rate:   parseFloat(exchange_rate) || 1,
      discount_amount: discAmt,
      subtotal:        parseFloat(subtotal.toFixed(2)),
      total:           total < 0 ? 0 : total,
      status:          'pendiente',
      notes:           notes?.trim() || null,
    }, { transaction: t });

    await QuotationItem.bulkCreate(
      enriched.map(i => ({ ...i, quotation_id: quotation.id })),
      { transaction: t }
    );

    await t.commit();
    return quotation;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function cancel(id, req) {
  const q = await Quotation.findByPk(id);
  if (!q) { const e = new Error("Cotización no encontrada"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, q.warehouse_id, { optional: true });
  if (q.status !== 'pendiente') { const e = new Error("Solo se pueden anular cotizaciones pendientes"); e.status = 400; throw e; }
  await q.update({ status: 'anulada' });
  return q;
}

async function convert(quotationId, body, employeeId, req) {
  const { serie_id } = body;
  if (!serie_id) { const e = new Error("La serie es requerida"); e.status = 400; throw e; }

  const t = await sequelize.transaction();
  try {
    // Mismo motivo que en updateSale: Postgres rechaza FOR UPDATE sobre el lado nullable
    // de un outer join, y el include hasMany genera un LEFT JOIN. Se bloquea la cabecera
    // y las líneas se leen aparte, dentro de la misma transacción.
    const quotation = await Quotation.findByPk(quotationId, { transaction: t, lock: true });
    if (!quotation) { const e = new Error("Cotización no encontrada"); e.status = 404; throw e; }
    await assertWarehouseAccess(req, quotation.warehouse_id, { optional: true });
    const quotationItems = await QuotationItem.findAll({ where: { quotation_id: quotationId }, transaction: t });
    if (quotation.status !== 'pendiente') {
      const e = new Error("Solo se pueden convertir cotizaciones pendientes"); e.status = 400; throw e;
    }

    const serie = await Serie.findByPk(serie_id, { transaction: t });
    if (!serie || !serie.active) { const e = new Error("Serie no encontrada o inactiva"); e.status = 400; throw e; }
    // La serie es de una sucursal: debe coincidir con el almacén de la cotización.
    if (serie.warehouse_id && quotation.warehouse_id && parseInt(serie.warehouse_id) !== parseInt(quotation.warehouse_id)) {
      const e = new Error("La serie seleccionada no pertenece al almacén de la cotización"); e.status = 400; throw e;
    }

    const activeRange = await SerieRange.findOne({
      where: {
        serie_id,
        active: true,
        current_number: { [Op.lte]: Sequelize.col("end_number") },
      },
      order: [["start_number", "ASC"]],
      lock: true,
      transaction: t,
    });
    if (!activeRange) {
      const e = new Error(`Serie "${serie.name}" agotada. Añade un nuevo rango en Contabilidad.`);
      e.status = 400; throw e;
    }

    const correlativeNumber = activeRange.current_number;
    const paddedNumber = String(correlativeNumber).padStart(serie.padding, "0");
    const invoiceNumber = `${serie.prefix}-${paddedNumber}`;
    const nextNumber = correlativeNumber + 1;
    if (nextNumber > activeRange.end_number) {
      await activeRange.update({ current_number: nextNumber, active: false }, { transaction: t });
    } else {
      await activeRange.update({ current_number: nextNumber }, { transaction: t });
    }

    const warehouseId = quotation.warehouse_id;
    const enrichedItems = [];

    for (const qi of quotationItems) {
      if (!qi.product_id) {
        enrichedItems.push({ product_id: null, name: qi.product_name, price: parseFloat(qi.price), qty: parseFloat(qi.quantity), isService: true });
        continue;
      }
      const product = await Product.findByPk(qi.product_id, { transaction: t, lock: true });
      if (!product) { const e = new Error(`Producto "${qi.product_name}" ya no existe`); e.status = 400; throw e; }

      if (product.is_service) {
        enrichedItems.push({ product, name: product.name, price: parseFloat(qi.price), qty: parseFloat(qi.quantity), isService: true });
      } else if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction: t });
        const ingredientsData = [];
        for (const ci of comboItems) {
          const ingredient = await Product.findByPk(ci.product_id, { transaction: t, lock: true });
          const qtyNeeded = parseFloat(qi.quantity) * parseFloat(ci.quantity);
          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id: warehouseId, product_id: ingredient.id },
            transaction: t, lock: true,
          });
          const currentQty = parseFloat(stockEntry?.qty || 0);
          if (currentQty < qtyNeeded) {
            const e = new Error(`Stock insuficiente de "${ingredient.name}" para el combo "${product.name}". Disponible: ${currentQty}`);
            e.status = 400; throw e;
          }
          ingredientsData.push({ ingredient, qtyNeeded, stockEntry });
        }
        enrichedItems.push({ product, name: product.name, price: parseFloat(qi.price), qty: parseFloat(qi.quantity), isCombo: true, ingredientsData });
      } else {
        const stockEntry = await ProductStock.findOne({
          where: { warehouse_id: warehouseId, product_id: product.id },
          transaction: t, lock: true,
        });
        const currentQty = parseFloat(stockEntry?.qty || 0);
        if (currentQty < parseFloat(qi.quantity)) {
          const e = new Error(`Stock insuficiente para "${product.name}". Disponible: ${currentQty}`);
          e.status = 400; throw e;
        }
        enrichedItems.push({ product, name: product.name, price: parseFloat(qi.price), qty: parseFloat(qi.quantity), stockEntry });
      }
    }

    const sale = await Sale.create({
      total:              parseFloat(quotation.total),
      paid:               0,
      change:             0,
      customer_id:        quotation.customer_id || null,
      employee_id:        employeeId || quotation.employee_id || null,
      currency_id:        quotation.currency_id || null,
      exchange_rate:      parseFloat(quotation.exchange_rate) || 1,
      discount_amount:    parseFloat(quotation.discount_amount) || 0,
      payment_method:     "efectivo",
      warehouse_id:       warehouseId,
      serie_id:           serie.id,
      serie_range_id:     activeRange.id,
      correlative_number: correlativeNumber,
      invoice_number:     invoiceNumber,
    }, { transaction: t });

    for (const entry of enrichedItems) {
      await SaleItem.create({
        sale_id:    sale.id,
        product_id: entry.product?.id || entry.product_id || null,
        name:       entry.name,
        price:      entry.price,
        quantity:   entry.qty,
        discount:   0,
      }, { transaction: t });

      if (entry.isService) {
        // no-op
      } else if (entry.isCombo) {
        for (const ing of entry.ingredientsData) {
          await ing.stockEntry.decrement("qty", { by: ing.qtyNeeded, transaction: t });
          const totalStock = await ProductStock.sum("qty", { where: { product_id: ing.ingredient.id }, transaction: t });
          await ing.ingredient.update({ stock: totalStock || 0 }, { transaction: t });
        }
      } else if (entry.stockEntry) {
        await entry.stockEntry.decrement("qty", { by: entry.qty, transaction: t });
        const totalStock = await ProductStock.sum("qty", { where: { product_id: entry.product.id }, transaction: t });
        await entry.product.update({ stock: totalStock || 0 }, { transaction: t });
      }
    }

    await quotation.update({ status: 'convertida', converted_sale_id: sale.id }, { transaction: t });
    await t.commit();

    return { quotation_id: quotation.id, sale_id: sale.id, invoice_number: invoiceNumber };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

async function remove(id, req) {
  const q = await Quotation.findByPk(id, { include: [{ model: QuotationItem, as: 'items' }] });
  if (!q) { const e = new Error("Cotización no encontrada"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, q.warehouse_id, { optional: true });
  if (q.status !== 'anulada') { const e = new Error("Solo se pueden eliminar cotizaciones anuladas"); e.status = 400; throw e; }
  
  const t = await sequelize.transaction();
  try {
    await QuotationItem.destroy({ where: { quotation_id: id }, transaction: t });
    await q.destroy({ transaction: t });
    await t.commit();
    return { message: "Cotización eliminada exitosamente" };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

module.exports = { getAll, getById, create, cancel, convert, remove };
