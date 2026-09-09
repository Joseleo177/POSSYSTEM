const {
  Sale, SaleItem, Product, ProductStock, Employee,
  Return, ReturnItem, Payment, ProductComboItem, Serie, SerieRange,
  Expense, ExpenseCategory, PaymentJournal, Currency, sequelize, Sequelize,
} = require("../../models");
const { assertWarehouseAccess } = require("../../middleware/auth");
const { excludeAnnulledReturns } = require("./shared");
const { addCreditMovement } = require("../customers/creditLedger");
const { toLocalDate } = require("../../utils/localDate");

async function createReturn({ saleId, items, reason, employee_id, refund }, req) {
  if (!items?.length) { const e = new Error("Debes indicar al menos un producto a devolver"); e.status = 400; throw e; }

  const transaction = await sequelize.transaction();
  try {
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });
    if (!sale) { const e = new Error("Venta no encontrada"); e.status = 404; throw e; }
    // La devolución reingresa mercancía al almacén de la venta.
    await assertWarehouseAccess(req, sale.warehouse_id, { optional: true });

    const saleItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });
    const itemsMap  = Object.fromEntries(saleItems.map(i => [i.id, i]));
    // Lo devuelto en una NC anulada vuelve a estar disponible para devolver.
    const soloVivas = await excludeAnnulledReturns(saleId, transaction);

    let returnTotal = 0;
    const returnLines = [];

    for (const { sale_item_id, qty } of items) {
      const si = itemsMap[sale_item_id];
      if (!si) { const e = new Error(`Ítem ${sale_item_id} no pertenece a esta venta`); e.status = 400; throw e; }

      const parsedQty = parseFloat(qty);
      if (isNaN(parsedQty) || parsedQty <= 0) {
        const e = new Error(`Cantidad inválida para ${si.name}`); e.status = 400; throw e;
      }

      const alreadyReturned = await ReturnItem.sum('qty', { where: { sale_item_id, ...soloVivas }, transaction }) || 0;
      const availableToReturn = parseFloat(si.quantity) - parseFloat(alreadyReturned);

      if (parsedQty > availableToReturn) {
        const e = new Error(
          `Solo quedan ${availableToReturn} uds disponibles para devolver de "${si.name}" (ya se devolvieron ${alreadyReturned})`
        );
        e.status = 400; throw e;
      }

      // 6 decimales y no 2: el precio de la línea puede tener cinco (sale_items.price), y
      // redondear aquí devolvía menos dinero del que se cobró. Lo que se muestra al cajero sí
      // se redondea a dos, pero eso es presentación, no lo que se guarda.
      const subtotal = parseFloat(((si.price - si.discount) * parsedQty).toFixed(6));
      returnTotal += subtotal;
      returnLines.push({ sale_item_id, product_id: si.product_id, name: si.name, price: si.price, qty: parsedQty, subtotal });
    }

    // Consume NC series if configured for this company
    let nc_number = null;
    try {
      let ncSerie = null;
      if (sale.serie_id) {
        const facturaSerie = await Serie.findByPk(sale.serie_id, { transaction });
        if (facturaSerie && facturaSerie.nc_serie_id) {
          ncSerie = await Serie.findOne({ where: { id: facturaSerie.nc_serie_id, active: true }, transaction });
        }
      }

      if (!ncSerie) {
        // Fallback: la NC se numera con la primera serie NC de la sucursal
        ncSerie = await Serie.findOne({
          where: {
            type: 'nc',
            active: true,
            company_id: sale.company_id || null,
            ...(sale.warehouse_id ? { warehouse_id: sale.warehouse_id } : {}),
          },
          transaction,
        });
      }
      if (ncSerie) {
        const ncRange = await SerieRange.findOne({
          where: {
            serie_id: ncSerie.id,
            active: true,
            current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') },
          },
          order: [['start_number', 'ASC']],
          lock: true,
          transaction,
        });
        if (ncRange) {
          const num = ncRange.current_number;
          nc_number = `${ncSerie.prefix}-${String(num).padStart(ncSerie.padding, '0')}`;
          const next = num + 1;
          await ncRange.update(
            next > ncRange.end_number
              ? { current_number: next, active: false }
              : { current_number: next },
            { transaction }
          );
        }
      }
    } catch (e) {
      // Propagar errores si ocurren durante la consulta
      throw e;
    }
    
    if (!nc_number) {
      const e = new Error("No hay serie de Notas de Crédito vinculada o con correlativos disponibles para procesar esta devolución.");
      e.status = 400; throw e;
    }

    const returnRecord = await Return.create({
      sale_id:     saleId,
      employee_id: employee_id || null,
      reason:      reason || null,
      nc_number:   nc_number,
      total:       parseFloat(returnTotal.toFixed(6)),
      company_id:  sale.company_id || null,
    }, { transaction });

    for (const line of returnLines) {
      await ReturnItem.create({
        return_id:    returnRecord.id,
        sale_item_id: line.sale_item_id,
        product_id:   line.product_id,
        name:         line.name,
        price:        line.price,
        qty:          line.qty,
        subtotal:     line.subtotal,
      }, { transaction });

      if (line.product_id) {
        const product = await Product.findByPk(line.product_id, { transaction });

        if (product && !product.is_service && product.is_combo) {
          const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
          for (const cItem of comboItems) {
            const qtyToRestore = line.qty * parseFloat(cItem.quantity);
            const [stockEntry] = await ProductStock.findOrCreate({
              where:    { warehouse_id: sale.warehouse_id, product_id: cItem.product_id },
              defaults: { qty: 0 },
              transaction, lock: true,
            });
            await stockEntry.increment("qty", { by: qtyToRestore, transaction });
            const totalStock = await ProductStock.sum("qty", { where: { product_id: cItem.product_id }, transaction });
            await Product.update({ stock: totalStock || 0 }, { where: { id: cItem.product_id }, transaction });
          }
        } else if (product && !product.is_service) {
          const [stockEntry] = await ProductStock.findOrCreate({
            where:    { warehouse_id: sale.warehouse_id, product_id: line.product_id },
            defaults: { qty: 0 },
            transaction, lock: true,
          });
          await stockEntry.increment("qty", { by: line.qty, transaction });
          const totalStock = await ProductStock.sum("qty", { where: { product_id: line.product_id }, transaction });
          await Product.update({ stock: totalStock || 0 }, { where: { id: line.product_id }, transaction });
        }
      }
    }

    // Check if all items are fully returned → mark sale as 'devuelto'
    const allSaleItems = await SaleItem.findAll({ where: { sale_id: saleId }, transaction });
    let fullyReturned  = true;
    for (const si of allSaleItems) {
      const totalRet = await ReturnItem.sum('qty', { where: { sale_item_id: si.id, ...soloVivas }, transaction }) || 0;
      if (parseFloat(totalRet) < parseFloat(si.quantity)) { fullyReturned = false; break; }
    }
    if (fullyReturned) await sale.update({ status: 'devuelto' }, { transaction });

    // Acreditar al cliente: el crédito queda atado a la sucursal que vendió lo que se
    // devuelve, la misma que reingresó la mercancía arriba. Solo se puede aplicar en otra
    // venta de esa misma sucursal (ver creditLedger.js).
    if (sale.customer_id) {
      await addCreditMovement({
        customer_id:  sale.customer_id,
        warehouse_id: sale.warehouse_id,
        amount:       returnTotal,
        reason:       'devolucion',
        sale_id:      saleId,
        return_id:    returnRecord.id,
        employee_id:  employee_id || null,
        company_id:   sale.company_id || null,
      }, transaction);
    }

    // Reembolso en efectivo/transferencia al cliente. Se registra como egreso DENTRO de esta
    // misma transacción: si falla, la devolución tampoco se emite (antes se creaba aparte y
    // podía quedar la NC sin el egreso, o el egreso en una categoría cualquiera).
    // El reembolso puede salir de VARIAS cajas (parte en efectivo, resto por transferencia),
    // igual que el vuelto de un cobro. Cada tramo es un egreso propio, con su diario, su
    // moneda y su referencia. `refund.parts` es la forma nueva; `refund.journal_id` suelto se
    // acepta como un solo tramo por compatibilidad.
    const refundExpenseIds = [];
    if (refund && refund.enabled !== false) {
      const parts = (Array.isArray(refund.parts) && refund.parts.length)
        ? refund.parts
        : (refund.journal_id ? [{ journal_id: refund.journal_id, amount: refund.amount, reference: refund.reference }] : []);

      // Categoría propia y estable, la misma que usa el reembolso desde la ficha del cliente.
      const [cat] = parts.length
        ? await ExpenseCategory.findOrCreate({
            where:    { name: "Devolución de Crédito" },
            defaults: { name: "Devolución de Crédito", active: true },
            transaction,
          })
        : [null];

      for (const part of parts) {
        if (!part.journal_id) continue;
        const rawAmount = parseFloat(String(part.amount ?? "").replace(",", "."));
        if (isNaN(rawAmount) || rawAmount <= 0) {
          const e = new Error("El monto de cada tramo del reembolso debe ser mayor a 0"); e.status = 400; throw e;
        }

        const journal = await PaymentJournal.findByPk(part.journal_id, {
          include: [{ model: Currency, attributes: ["id", "exchange_rate"], required: false }],
          transaction,
        });
        if (!journal) { const e = new Error("Método de reembolso no encontrado"); e.status = 400; throw e; }
        if (journal.type !== "efectivo" && !String(part.reference || "").trim()) {
          const e = new Error("El número de referencia es obligatorio para este método de reembolso"); e.status = 400; throw e;
        }

        // El monto se teclea en la moneda del diario; se guarda en la base con 6 decimales,
        // igual que los cobros y el reembolso desde la ficha del cliente. Redondear a 4 (o a 2)
        // hacía que al reconstruir el bolívar diera 1.200,02 en vez de 1.200,00.
        const rate       = parseFloat(journal.Currency?.exchange_rate || 1) || 1;
        const baseAmount = parseFloat((rawAmount / rate).toFixed(6));

        const refundExpense = await Expense.create({
          description:        `Reembolso ${nc_number} / ${sale.invoice_number || "#" + sale.id}`,
          amount:             baseAmount,
          rate,
          category_id:        cat.id,
          payment_journal_id: parseInt(part.journal_id),
          currency_id:        journal.currency_id || null,
          reference:          String(part.reference || "").trim() || null,
          notes:              String(refund.notes || "").trim() || null,
          employee_id:        employee_id || null,
          warehouse_id:       sale.warehouse_id,
          company_id:         sale.company_id || null,
          status:             "activo",
          date:               refund.date ? toLocalDate(refund.date) : new Date(),
        }, { transaction });
        refundExpenseIds.push(refundExpense.id);
      }
    }
    const refundExpenseId = refundExpenseIds[0] || null;

    await transaction.commit();
    return {
      message: `Devolución registrada exitosamente. Total: ${returnTotal.toFixed(2)}`,
      data:    { return_id: returnRecord.id, nc_number, total: returnTotal, items: returnLines, refund_expense_id: refundExpenseId, refund_expense_ids: refundExpenseIds },
    };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function getSaleReturns(saleId) {
  const returns = await Return.findAll({
    where:   { sale_id: saleId },
    include: [
      { model: Employee,   attributes: ['full_name'] },
      { model: ReturnItem },
    ],
    order: [['created_at', 'DESC']],
  });

  const data = returns.map(r => {
    const item = r.toJSON();
    item.employee_name = item.Employee?.full_name || 'Desconocido';
    item.items         = item.ReturnItems;
    delete item.Employee;
    delete item.ReturnItems;
    return item;
  });

  return { data };
}

module.exports = { createReturn, getSaleReturns };
