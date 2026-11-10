const { Purchase, PurchaseItem, PurchaseCharge, ExpenseCategory, Customer, Product, Sequelize, sequelize } = require("../../models");
const { Op } = Sequelize;
const { assertWarehouseAccess } = require("../../middleware/auth");
const { facturaProveedor, ivaActivo, tasaDeTipo } = require("../fiscal/iva");
const { recalcPurchaseStatus } = require("../purchasePayments/purchasePaymentService");

// La factura del proveedor de una compra (IVA, etapa 1 del Libro de compras, 10-11-2026).
//
// Se carga aparte de las líneas, en el detalle de la compra y en cualquier estado —también ya
// recibida—, porque el papel del proveedor muchas veces llega después que la mercancía. No toca
// costos ni inventario: el costo de cada línea ya va SIN IVA. Lo que agrega:
//  - si trae factura fiscal, con su RIF, número, control y fecha;
//  - la alícuota de cada línea (la del producto, cambiable: el proveedor puede facturar distinto);
//  - "otros cargos" (flete, servicio) que no son inventario, con su categoría de gasto;
//  - una corrección a mano del IVA, de céntimos, cuando el proveedor redondeó distinto.
// El total de la compra —lo que se le debe al proveedor— pasa a ser líneas + cargos + IVA, y el
// estado de pago se recalcula contra ese total.

const fail = (message, status = 400) => Object.assign(new Error(message), { status, isOperational: true });

// Las líneas con las que se calcula la factura: productos y cargos, en moneda base y sin IVA.
function lineasDeCompra(purchase, items, charges) {
  const tasa = (r) => (purchase.fiscal ? (r == null ? null : parseFloat(r)) : 0);
  return [
    ...items.map(i => ({ base: parseFloat(i.subtotal) || 0, tasa: tasa(i.iva_rate) })),
    ...charges.map(c => ({ base: parseFloat(c.amount) || 0, tasa: tasa(c.iva_rate) })),
  ];
}

// IVA y total de la compra según lo guardado. Lo llaman el guardado de la factura y la edición de
// la orden (una línea nueva cambia el IVA). Devuelve la factura calculada.
async function recalcularCompra(purchaseId, transaction) {
  const purchase = await Purchase.findByPk(purchaseId, { transaction, lock: true });
  if (!purchase) return null;
  const [items, charges] = await Promise.all([
    PurchaseItem.findAll({ where: { purchase_id: purchase.id }, transaction }),
    PurchaseCharge.findAll({ where: { purchase_id: purchase.id }, transaction }),
  ]);
  const factura = facturaProveedor(lineasDeCompra(purchase, items, charges), purchase.exchange_rate,
    purchase.fiscal ? purchase.iva_adjust : 0);
  const iva = purchase.fiscal ? factura.ivaBase : 0;
  const sinIva = [...items.map(i => i.subtotal), ...charges.map(c => c.amount)]
    .reduce((a, v) => a + (parseFloat(v) || 0), 0);
  await purchase.update({ iva_amount: iva, total: parseFloat((sinIva + iva).toFixed(6)) }, { transaction });
  await recalcPurchaseStatus(purchase.id, transaction);
  return factura;
}

// Cargos de la compra para el detalle, con el nombre de su categoría.
async function cargosDe(purchaseId) {
  const rows = await PurchaseCharge.findAll({
    where: { purchase_id: purchaseId },
    include: [{ model: ExpenseCategory, as: "category", attributes: ["name"], required: false }],
    order: [["id", "ASC"]],
  });
  return rows.map(r => {
    const c = r.toJSON();
    c.category_name = c.category?.name ?? null;
    delete c.category;
    return c;
  });
}

// Factura calculada de una compra ya leída (para el detalle): en la moneda de la factura.
function facturaDe(data, charges) {
  return facturaProveedor(lineasDeCompra(data, data.items || [], charges), data.exchange_rate,
    data.fiscal ? data.iva_adjust : 0);
}

const texto = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

/**
 * Guarda la factura del proveedor de una compra.
 * body: { fiscal, supplier_rif, supplier_invoice_number, supplier_control_number,
 *         supplier_invoice_date, iva_adjust, lines: [{ id, iva_rate }],
 *         charges: [{ description, amount, iva_rate, expense_category_id }] }
 * Los montos de los cargos van en moneda base y sin IVA, como los costos de las líneas.
 */
async function guardarFactura(id, body, req) {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(id, { transaction, lock: true });
    if (!purchase) throw fail("Compra no encontrada", 404);
    await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });
    await aplicarFactura(purchase, body, transaction);
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// El trabajo de guardarFactura, dentro de una transacción ajena: lo usa también el alta de una
// factura de servicios, que crea la compra y su factura juntas (o ninguna de las dos).
async function aplicarFactura(purchase, body, transaction) {
    const fiscal = body.fiscal === true || body.fiscal === "true";
    if (fiscal && !(await ivaActivo(purchase.company_id, transaction))) {
      throw fail("La factura con IVA no está activa en esta empresa");
    }

    const items = await PurchaseItem.findAll({ where: { purchase_id: purchase.id }, transaction });
    const numero = texto(body.supplier_invoice_number, 40);
    const control = texto(body.supplier_control_number, 40);
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(body.supplier_invoice_date || "")) ? body.supplier_invoice_date : null;
    let rif = texto(body.supplier_rif, 20);
    if (!rif && purchase.supplier_id) {
      const sup = await Customer.findByPk(purchase.supplier_id, { attributes: ["rif"], transaction });
      rif = texto(sup?.rif, 20);
    }

    if (fiscal) {
      if (!numero) throw fail("Escribe el número de la factura del proveedor");
      if (!control) throw fail("Escribe el número de control de la factura");
      if (!fecha) throw fail("Indica la fecha de la factura del proveedor");
      if (!rif) throw fail("Falta el RIF del proveedor");
      // Una factura cargada en dos compras saldría dos veces en el Libro de compras.
      const repetida = await Purchase.findOne({
        where: {
          id: { [Op.ne]: purchase.id },
          fiscal: true,
          supplier_invoice_number: numero,
          [Op.or]: [
            ...(purchase.supplier_id ? [{ supplier_id: purchase.supplier_id }] : []),
            { supplier_rif: rif },
          ],
        },
        attributes: ["id"],
        transaction,
      });
      if (repetida) throw fail(`La factura ${numero} de este proveedor ya está cargada en la compra #${repetida.id}`);
    }

    // Alícuota de cada línea: la que mandó el formulario o, si no, la del producto.
    const tasas = new Map((body.lines || []).map(l => [parseInt(l.id), l.iva_rate]));
    const tasaValida = (v) => [0, 8, 16, 31].includes(parseFloat(v)) ? parseFloat(v) : null;
    for (const item of items) {
      let rate = null;
      if (fiscal) {
        rate = tasaValida(tasas.get(item.id));
        if (rate === null) {
          const p = item.product_id ? await Product.findByPk(item.product_id, { attributes: ["iva_tipo"], transaction }) : null;
          rate = tasaDeTipo(p?.iva_tipo);
        }
      }
      if (String(item.iva_rate ?? "") !== String(rate ?? "")) await item.update({ iva_rate: rate }, { transaction });
    }

    // Otros cargos: se reemplazan enteros (no tocan inventario, no hay nada que conservar).
    const cargos = [];
    for (const c of body.charges || []) {
      const descripcion = texto(c.description, 200);
      const monto = parseFloat(c.amount);
      if (!descripcion && !(monto > 0)) continue;
      if (!descripcion) throw fail("Cada cargo necesita una descripción (flete, transporte…)");
      if (!(monto > 0)) throw fail(`"${descripcion}": el monto tiene que ser mayor que cero`);
      const categoria = c.expense_category_id ? parseInt(c.expense_category_id) : null;
      if (categoria && !(await ExpenseCategory.findByPk(categoria, { attributes: ["id"], transaction }))) {
        throw fail(`"${descripcion}": la categoría de gasto no existe`);
      }
      cargos.push({
        company_id: purchase.company_id,
        purchase_id: purchase.id,
        description: descripcion,
        amount: parseFloat(monto.toFixed(6)),
        iva_rate: fiscal ? (tasaValida(c.iva_rate) ?? 16) : null,
        expense_category_id: categoria,
      });
    }
    // Una factura de servicios no tiene mercancía: sus líneas son estas, y sin ninguna no hay factura.
    if (purchase.kind === "servicios" && !cargos.length) {
      throw fail("Agrega al menos una línea a la factura de servicios");
    }
    await PurchaseCharge.destroy({ where: { purchase_id: purchase.id }, transaction });
    if (cargos.length) await PurchaseCharge.bulkCreate(cargos, { transaction });

    // Corrección del IVA: céntimos, no un IVA distinto. Tope: uno por línea más cinco.
    let ajuste = fiscal ? parseFloat(body.iva_adjust) || 0 : 0;
    const tope = 0.01 * (items.length + cargos.length) + 0.05;
    if (Math.abs(ajuste) > tope + 1e-9) {
      throw fail(`La corrección del IVA es de céntimos (hasta ${tope.toFixed(2)}): revisa la alícuota de cada línea`);
    }
    ajuste = parseFloat(ajuste.toFixed(2));

    await purchase.update({
      fiscal,
      supplier_rif: rif,
      supplier_invoice_number: numero,
      supplier_control_number: control,
      supplier_invoice_date: fecha,
      iva_adjust: ajuste,
    }, { transaction });

    await recalcularCompra(purchase.id, transaction);
}

/**
 * Factura de servicios: una compra sin mercancía, solo con líneas de gasto (mano de obra, una
 * reparación, la ferretería, la luz a crédito). No pasa por recibir: nace registrada ('recibido')
 * y por pagar, con su factura, y desde ahí se paga, se abona o entra al pago conjunto como cualquier
 * compra. Compra y factura se crean en la misma transacción.
 *
 * body: { supplier_id, supplier_name, warehouse_id, notes, currency_id, exchange_rate,
 *         ...lo de guardarFactura (fiscal, RIF, número, control, fecha, iva_adjust, charges) }
 */
async function crearCompraServicios(body, req) {
  const supplierId = body.supplier_id ? parseInt(body.supplier_id) : null;
  let supplierName = texto(body.supplier_name, 200);
  const warehouseId = body.warehouse_id ? parseInt(body.warehouse_id) : null;
  if (!warehouseId) throw fail("Elige la sucursal a la que corresponde la factura");
  await assertWarehouseAccess(req, warehouseId);
  const curId = body.currency_id ? parseInt(body.currency_id) : null;
  const tasa = parseFloat(body.exchange_rate);
  const moneda = curId && tasa > 0 ? { currency_id: curId, exchange_rate: tasa } : { currency_id: null, exchange_rate: 1 };

  const transaction = await sequelize.transaction();
  try {
    if (supplierId) {
      const sup = await Customer.findOne({ where: { id: supplierId, type: "proveedor" }, transaction });
      if (!sup) throw fail("Proveedor no encontrado");
      supplierName = sup.tax_name || sup.name;
    }
    if (!supplierId && !supplierName) throw fail("Elige el proveedor de la factura");

    const purchase = await Purchase.create({
      kind: "servicios",
      status: "recibido",
      supplier_id: supplierId,
      supplier_name: supplierName,
      notes: texto(body.notes, 2000),
      total: 0,
      employee_id: req.employee?.id ?? null,
      warehouse_id: warehouseId,
      ...moneda,
    }, { transaction });
    await aplicarFactura(purchase, body, transaction);
    await transaction.commit();
    return purchase.id;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

module.exports = { recalcularCompra, guardarFactura, crearCompraServicios, cargosDe, facturaDe, lineasDeCompra };
