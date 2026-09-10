const {
  Purchase, PurchaseItem, ProductLot, Employee, Warehouse, Customer,
  Product, ProductStock, ProductComboItem, PurchasePayment, StockSessionLine, Sequelize, sequelize
} = require("../../models");
const { assertWarehouseAccess, visibleWarehouseIds } = require("../../middleware/auth");
const { toLocalDate, endOfLocalDay } = require("../../utils/localDate");
const { ensureOpenSession } = require("../warehouses/sessionService");
const { Op } = Sequelize;

async function getAll({ limit = 50, offset = 0, search, status, order_status, date_from, date_to, warehouse_id }, req) {
  const company_id  = req.employee?.company_id ?? null;
  const isSuperuser = !!req.is_superuser;
  const where = (!isSuperuser && company_id) ? { company_id } : {};

  // Cada quien ve las órdenes dirigidas a sus almacenes. Los borradores sin destino elegido
  // quedan visibles: todavía no pertenecen a ninguna sucursal.
  if (warehouse_id) {
    await assertWarehouseAccess(req, warehouse_id);
    where.warehouse_id = parseInt(warehouse_id);
  } else {
    const allowedWarehouses = await visibleWarehouseIds(req);
    if (allowedWarehouses) {
      // Va en Op.and porque el filtro de búsqueda de abajo ocupa Op.or: si se escribiera
      // ahí, uno pisaría al otro y el listado dejaría de estar acotado.
      where[Op.and] = [{
        [Op.or]: [
          { warehouse_id: { [Op.in]: allowedWarehouses } },
          { warehouse_id: null },
        ],
      }];
    }
  }

  if (status)       where.payment_status = status;
  if (order_status) where.status = order_status;
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) where.created_at[Op.gte] = toLocalDate(date_from);
    if (date_to)   where.created_at[Op.lte] = endOfLocalDay(date_to);
  }

  const supplierWhere = {};
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    const orConds = [
      { '$Supplier.name$': { [Op.iLike]: term } },
      { '$Supplier.rif$':  { [Op.iLike]: term } },
      { notes:              { [Op.iLike]: term } },
    ];
    const asInt = parseInt(search);
    if (!isNaN(asInt)) orConds.push({ id: asInt });
    where[Op.or] = orConds;
  }

  const { count, rows: purchases } = await Purchase.findAndCountAll({
    where,
    include: [
      { model: Employee,     attributes: ['full_name'], required: false },
      { model: Customer, as: 'Supplier', attributes: ['name', 'rif'], required: false, where: Object.keys(supplierWhere).length ? supplierWhere : undefined },
      { model: Warehouse,    attributes: ['name'],      required: false },
      { model: PurchaseItem, attributes: [],            required: false }
    ],
    attributes: {
      include: [[Sequelize.fn('COUNT', Sequelize.col('PurchaseItems.id')), 'item_count']]
    },
    group: ['Purchase.id', 'Employee.id', 'Supplier.id', 'Warehouse.id'],
    order: [['created_at', 'DESC']],
    limit:    parseInt(limit),
    offset:   parseInt(offset),
    subQuery: false,
    distinct: true
  });

  const purchaseIds = purchases.map(p => p.id);
  const paidSums = purchaseIds.length
    ? await sequelize.query(
        `SELECT pp.purchase_id, COALESCE(SUM(pp.amount), 0) AS paid
           FROM purchase_payments pp
           LEFT JOIN expenses e ON e.reference = 'purchase_payment:' || pp.id::text
          WHERE pp.purchase_id IN (:ids)
            AND (e.status IS NULL OR e.status = 'activo')
          GROUP BY pp.purchase_id`,
        { replacements: { ids: purchaseIds }, type: sequelize.QueryTypes.SELECT }
      )
    : [];
  const paidMap = {};
  paidSums.forEach(r => { paidMap[r.purchase_id] = parseFloat(r.paid || 0); });

  const data = purchases.map(p => {
    const pp = p.toJSON();
    pp.employee_name          = pp.Employee?.full_name ?? null;
    pp.supplier_customer_name = pp.Supplier?.name      ?? null;
    pp.supplier_rif           = pp.Supplier?.rif       ?? null;
    pp.warehouse_name         = pp.Warehouse?.name     ?? null;
    pp.item_count             = parseInt(pp.item_count || 0);
    const amountPaid = paidMap[pp.id] || 0;
    pp.amount_paid = parseFloat(amountPaid.toFixed(6));
    pp.balance     = parseFloat(Math.max(0, parseFloat(pp.total) - amountPaid).toFixed(6));
    ['Employee','Supplier','Warehouse','PurchaseItems'].forEach(k => delete pp[k]);
    return pp;
  });

  // Con GROUP BY, findAndCountAll devuelve un array de conteos. `count.length || count`
  // funcionaba salvo con cero resultados: devolvía el array vacío como total, y ahora que
  // el listado se filtra por almacén ese caso es corriente.
  return { data, total: Array.isArray(count) ? count.length : count };
}

async function getOne(id, req) {
  const purchase = await Purchase.findByPk(id, {
    include: [
      { model: Employee,     attributes: ['full_name'], required: false },
      { model: Warehouse,    attributes: ['name'],      required: false },
      { model: PurchaseItem, include: [{ model: Product, attributes: ['image_filename', 'unit', 'stock', 'sellable'], required: false }] }
    ]
  });
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  // Igual que en ventas: el listado filtra, pero pedir la orden por su id no lo hacía.
  await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });

  const data = purchase.toJSON();
  data.employee_name  = data.Employee?.full_name ?? null;
  data.warehouse_name = data.Warehouse?.name     ?? null;
  data.items = (data.PurchaseItems ?? []).map(pi => {
    const item = { ...pi };
    item.image_filename = item.Product?.image_filename ?? null;
    item.unit  = item.Product?.unit  ?? null;
    item.stock = item.Product?.stock ?? null;
    // Al reabrir la línea, el modal necesita saber si el producto es insumo para no
    // ofrecer margen ni precio de venta.
    item.sellable = item.Product?.sellable ?? true;
    delete item.Product;
    return item;
  });
  ['Employee','Warehouse','PurchaseItems'].forEach(k => delete data[k]);

  const amountPaid = await PurchasePayment.sum('amount', { where: { purchase_id: data.id } }) || 0;
  data.amount_paid = parseFloat(parseFloat(amountPaid).toFixed(6));
  data.balance     = parseFloat(Math.max(0, parseFloat(data.total) - amountPaid).toFixed(6));

  return { data };
}

// Applies stock increments, lot tracking, price/cost updates and combo creation.
// Called only when a purchase reaches status='recibido'.
// `ctx` = { employeeId } de quien recibe: la entrada de mercancía queda además como líneas
// de la sesión de ajustes abierta del almacén (se abre una si no hay), para que el arqueo
// vea en un solo lugar todo lo que movió el inventario.
async function _applyStockAndPrices(purchase, items, transaction, ctx = {}) {
  if (!purchase.warehouse_id) {
    const e = new Error("Debe seleccionar un almacén de destino antes de recibir la mercancía");
    e.status = 400;
    throw e;
  }

  let _session = null;
  const sessionForLine = async () => {
    if (!_session) {
      _session = await ensureOpenSession({
        warehouseId: purchase.warehouse_id,
        employeeId:  ctx.employeeId ?? purchase.employee_id ?? null,
        companyId:   purchase.company_id ?? null,
      }, transaction);
    }
    return _session;
  };
  const purchaseRef = purchase.invoice_number ? `Compra ${purchase.invoice_number}` : `Compra #${purchase.id}`;

  for (const item of items) {
    const {
      product_id, total_units, unit_cost, profit_margin, sale_price,
      package_size, package_unit, package_price, lot_number, expiration_date,
      update_price
    } = item;

    if (!product_id) continue;

    // Cuántas unidades entran AHORA. En una recepción normal es la línea completa; con el
    // modo recepción prendido es solo lo que falta contra lo ya recibido, para que cargar la
    // factura en varias tandas no duplique el inventario.
    const entran = parseFloat(parseFloat(item.qty_in ?? total_units ?? 0).toFixed(4));

    const product = await Product.findByPk(product_id, { transaction, lock: true });
    if (!product) continue;

    if (!product.is_service) {
      const [stockEntry] = await ProductStock.findOrCreate({
        where: { warehouse_id: purchase.warehouse_id, product_id },
        defaults: { qty: 0 },
        transaction,
        lock: true
      });
      const qtyBefore = parseFloat(stockEntry.qty || 0);
      const qtyIn     = entran;
      if (qtyIn !== 0) await stockEntry.increment('qty', { by: qtyIn, transaction });

      if (qtyIn > 0) {
        const s = await sessionForLine();
        await StockSessionLine.create({
          session_id:   s.id,
          warehouse_id: purchase.warehouse_id,
          product_id,
          product_name: product.name,
          qty_before:   qtyBefore,
          qty_adjusted: qtyIn,
          qty_after:    parseFloat((qtyBefore + qtyIn).toFixed(4)),
          type:         'in',
          reason:       'compra',
          notes:        purchaseRef,
        }, { transaction });
      }
      // El costo es de quien recibió la mercancía. Antes solo existía el del producto, así
      // que la compra de una sucursal reescribía el margen de todas las demás. Mismo criterio
      // que abajo: último costo, no promedio.
      if (unit_cost != null) {
        await stockEntry.update({ cost_price: unit_cost }, { transaction });
      }

      // El precio de venta también. Solo se escribía en el producto, y una sucursal con
      // precio PROPIO nunca lo mira —el suyo le gana—, así que recibir la compra le
      // actualizaba el costo y la dejaba vendiendo al precio viejo. Se veía como si el PVP
      // de la compra se hubiera guardado recortado, cuando en realidad ni había llegado.
      //
      // Si la sucursal HEREDA (price null) no se le pone uno propio: el del producto se
      // actualiza abajo y le llega solo. Anclarla acá la desengancharía de los cambios
      // generales sin que nadie lo haya pedido.
      const aplicaPrecio = update_price !== false && product.sellable !== false;
      if (aplicaPrecio && stockEntry.price != null) {
        await stockEntry.update({
          price: sale_price,
          profit_margin: profit_margin ?? null,
        }, { transaction });
      }

      if (lot_number && expiration_date && entran !== 0) {
        const [lotEntry] = await ProductLot.findOrCreate({
          where: { warehouse_id: purchase.warehouse_id, product_id, lot_number: String(lot_number), expiration_date },
          defaults: { qty: 0 },
          transaction,
          lock: true
        });
        await lotEntry.increment('qty', { by: entran, transaction });
      }
    }

    // El costo siempre se actualiza (es lo que realmente se pagó);
    // el precio de venta solo si la línea tiene update_price activo
    const productChanges = {
      cost_price: unit_cost,
      package_size,
      package_unit: package_unit || 'unidad',
      bulk_price: package_price || null,
    };
    // Un insumo no tiene precio de venta: comprarlo actualiza su costo, pero ponerle precio
    // y margen le devolvería lo que la ficha le quita a propósito, y volvería a aparecer
    // valorizado como si se vendiera.
    if (update_price !== false && product.sellable !== false) {
      productChanges.price = sale_price;
      productChanges.profit_margin = profit_margin;
    }

    await product.update(productChanges, { transaction });


    if (!product.is_service) {
      const totalStock = await ProductStock.sum('qty', { where: { product_id }, transaction });
      await Product.update({ stock: totalStock || 0 }, { where: { id: product_id }, transaction });
    }
  }
}

// Tasa de compra saneada. Una tasa inválida o ≤ 0 no puede llegar a la base: se guardaría un
// registro que después divide mal los costos al mostrarlos. Sin moneda no hay conversión, y
// entonces la tasa es 1 por definición.
function normalizeInvoiceRate(currency_id, exchange_rate) {
  const curId = currency_id ? parseInt(currency_id) : null;
  const rate  = parseFloat(exchange_rate);
  if (!curId || isNaN(rate) || rate <= 0) return { currency_id: null, exchange_rate: 1 };
  return { currency_id: curId, exchange_rate: rate };
}

async function createPurchase({ body, employee_id }) {
  const { supplier_id, supplier_name, notes, items, warehouse_id, currency_id, exchange_rate, receiving_mode, status: requestedStatus = 'borrador' } = body;
  const modoRecepcion = receiving_mode === true || receiving_mode === 'true';
  const invoiceCur = normalizeInvoiceRate(currency_id, exchange_rate);

  if (!items?.length)  { const e = new Error("Debe incluir al menos un producto"); e.status = 400; throw e; }

  const initialStatus = ['borrador', 'pendiente', 'recibido'].includes(requestedStatus) ? requestedStatus : 'borrador';

  const transaction = await sequelize.transaction();
  try {
    if (warehouse_id) {
      const warehouse = await Warehouse.findByPk(warehouse_id, { transaction });
      if (!warehouse || !warehouse.active) throw new Error("Almacén no encontrado o inactivo");
    }

    let resolvedSupplierName = supplier_name || null;
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    if (resolvedSupplierId) {
      const sup = await Customer.findOne({ where: { id: resolvedSupplierId, type: 'proveedor' }, transaction });
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    const purchase = await Purchase.create({
      supplier_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      notes: notes || null,
      total: 0,
      status: initialStatus,
      employee_id: employee_id || null,
      warehouse_id: warehouse_id || null,
      currency_id: invoiceCur.currency_id,
      exchange_rate: invoiceCur.exchange_rate,
      receiving_mode: modoRecepcion,
    }, { transaction });

    let grandTotal = 0;
    const createdItems = [];

    for (const item of items) {
      const {
        product_id, package_unit, package_size, package_qty, package_price,
        profit_margin, lot_number, expiration_date, update_price
      } = item;

      if (!product_id || !package_size || !package_qty)
        throw new Error("Datos incompletos en línea de compra");

      const pkgSize  = parseFloat(package_size);
      const pkgQty   = parseFloat(package_qty);
      const pkgPrice = parseFloat(package_price);
      // Margen vacío = conservar el precio de venta actual. Hay productos con precio
      // puesto a mano, y tomarlo como 0 los dejaba vendiéndose al costo.
      const marginRaw = String(profit_margin ?? '').trim();
      const marginNum = marginRaw === '' ? NaN : parseFloat(marginRaw);
      const hasMargin = !isNaN(marginNum);
      const margin    = hasMargin ? marginNum : null;

      const unit_cost   = pkgPrice / pkgSize;
      const sale_price  = hasMargin ? unit_cost * (1 + margin / 100) : null;
      const total_units = pkgQty * pkgSize;
      const subtotal    = pkgQty * pkgPrice;
      grandTotal += subtotal;

      const product = await Product.findByPk(product_id, { transaction });
      if (!product) throw new Error(`Producto ID ${product_id} no encontrado`);

      const purchaseItem = await PurchaseItem.create({
        purchase_id: purchase.id,
        product_id,
        product_name: product.name,
        package_unit: package_unit || "unidad",
        package_qty: pkgQty,
        package_size: pkgSize,
        package_price: pkgPrice,
        unit_cost,
        // Columnas NOT NULL: sin margen se deja constancia del precio vigente y margen 0,
        // y es update_price el que dice que esta línea no cambia nada.
        profit_margin: hasMargin ? margin : 0,
        sale_price: hasMargin ? sale_price : (parseFloat(product.price) || 0),
        total_units,
        subtotal,
        lot_number: lot_number || null,
        expiration_date: expiration_date || null,
        // Un insumo no lleva precio de venta, así que la línea nace sin actualizarlo:
        // el detalle de la compra no debe prometer algo que después no se aplica.
        update_price: hasMargin && product.sellable !== false && update_price !== false && update_price !== 'false'
      }, { transaction });

      createdItems.push(purchaseItem);
    }

    await purchase.update({ total: grandTotal }, { transaction });

    if (initialStatus === 'recibido') {
      await _applyStockAndPrices(purchase, createdItems.map(i => i.toJSON()), transaction, { employeeId: employee_id || null });
      // Queda constancia de que estas unidades entraron: es lo que se devuelve si después
      // se anula la orden.
      for (const linea of createdItems) {
        await linea.update({ received_units: linea.total_units }, { transaction });
      }
    } else if (modoRecepcion) {
      // Orden nacida con el interruptor puesto: lo que ya se cargó entra al inventario de
      // una vez y queda abierta para seguir sumándole líneas.
      const movidas = await _receivePending(purchase, transaction, employee_id || null);
      if (movidas > 0) await purchase.update({ status: 'parcial' }, { transaction });
    }

    await transaction.commit();

    const fullPurchase = await Purchase.findByPk(purchase.id, {
      include: [
        { model: Employee,  attributes: ['full_name'], required: false },
        { model: Warehouse, attributes: ['name'],      required: false },
        { model: PurchaseItem }
      ]
    });
    const resultData = fullPurchase.toJSON();
    resultData.employee_name  = resultData.Employee?.full_name ?? null;
    resultData.warehouse_name = resultData.Warehouse?.name     ?? null;
    resultData.items = resultData.PurchaseItems ?? [];
    ['Employee','Warehouse','PurchaseItems'].forEach(k => delete resultData[k]);

    return { data: resultData };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function confirmOrder(id, req) {
  const purchase = await Purchase.findByPk(id);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  // El destino ya está guardado en la orden: se valida contra los almacenes del empleado.
  await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });
  if (purchase.status !== 'borrador') {
    const e = new Error("Solo se pueden confirmar órdenes en estado borrador"); e.status = 400; throw e;
  }
  // Una orden confirmada es un compromiso con alguien: de ahí sale la cuenta por pagar y a
  // quién se le reclama la mercancía. En borrador se admite sin proveedor a propósito —es el
  // papel de trabajo donde se arma la lista antes de decidir a quién comprarle—, igual que el
  // almacén de destino, que tampoco se exige hasta recibir.
  if (!purchase.supplier_id && !purchase.supplier_name) {
    const e = new Error("Elige el proveedor antes de confirmar la orden");
    e.status = 400; e.isOperational = true; throw e;
  }
  await purchase.update({ status: 'pendiente' });
  return getOne(id);
}

// Mete al inventario lo que a esta orden le falta por recibir y deja cada línea marcada con
// lo que ya entró. Es el motor común de las dos formas de recibir: el botón de siempre
// ("recibir mercancía", que además cierra la orden) y el modo recepción, que la llama en
// cada guardado y deja la orden abierta.
//
// Devuelve cuántas líneas movió: cero significa que no había nada pendiente, y entonces
// quien llama no debe anunciar una recepción que no ocurrió.
//
// Exige proveedor y almacén igual que la recepción completa: la mercancía entra con un costo
// que hay que poder atribuirle a alguien, y a una caja que hay que poder arquear.
async function _receivePending(purchase, transaction, employeeId) {
  if (!purchase.warehouse_id) {
    const e = new Error("Debe seleccionar un almacén de destino antes de recibir la mercancía");
    e.status = 400; e.isOperational = true; throw e;
  }
  if (!purchase.supplier_id && !purchase.supplier_name) {
    const e = new Error("Elige el proveedor antes de recibir la mercancía");
    e.status = 400; e.isOperational = true; throw e;
  }

  const items = await PurchaseItem.findAll({
    where: { purchase_id: purchase.id }, transaction, lock: true,
  });

  const pendientes = items
    .map(i => {
      const linea = i.toJSON();
      linea.qty_in = parseFloat(
        (parseFloat(linea.total_units || 0) - parseFloat(linea.received_units || 0)).toFixed(4)
      );
      return linea;
    })
    // Solo lo que falta. Una línea con qty_in negativo (le bajaron la cantidad por debajo de
    // lo ya recibido) no se toca acá: eso lo bloquea updateDraft antes de llegar.
    .filter(l => l.qty_in > 0);

  if (!pendientes.length) return 0;

  await _applyStockAndPrices(purchase, pendientes, transaction, { employeeId });

  for (const l of pendientes) {
    await PurchaseItem.update(
      { received_units: l.total_units },
      { where: { id: l.id }, transaction }
    );
  }
  return pendientes.length;
}

async function receivePurchase(id, req) {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(id, { transaction, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
    // Recibir mueve stock: el destino tiene que ser un almacén propio, sin excepción.
    await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });
    if (!purchase.warehouse_id) {
      const e = new Error("Debe seleccionar un almacén de destino antes de recibir la mercancía");
      e.status = 400;
      throw e;
    }
    // Se repite acá y no solo en confirmar: un borrador se puede recibir de una vez, sin pasar
    // por pendiente, y esa mercancía entra al inventario con un costo que hay que poder
    // atribuirle a alguien.
    if (!purchase.supplier_id && !purchase.supplier_name) {
      const e = new Error("Elige el proveedor antes de recibir la mercancía");
      e.status = 400; e.isOperational = true; throw e;
    }

    // Solo lo pendiente: si la orden venía en 'parcial' porque el modo recepción ya metió
    // parte de la mercancía, volver a aplicar las líneas completas duplicaría el inventario.
    await _receivePending(purchase, transaction, req.employee?.id ?? null);
    // Cerrar la orden apaga el modo: ya no hay nada que ir recibiendo.
    await purchase.update({ status: 'recibido', receiving_mode: false }, { transaction });

    await transaction.commit();
    return getOne(id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function deletePurchase(id, req) {
  const transaction = await sequelize.transaction();
  try {
    const purchase = await Purchase.findByPk(id, { transaction, lock: true });
    if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
    // Borrar una orden recibida devuelve stock: solo sobre almacenes propios.
    await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });

    // Se devuelve lo que REALMENTE entró, no la orden entera: una orden en 'parcial' tiene
    // líneas que nunca movieron inventario, y descontarlas dejaría el stock en negativo por
    // mercancía que jamás llegó. Por eso el disparador es `received_units`, no el estado.
    const items = await PurchaseItem.findAll({ where: { purchase_id: purchase.id }, transaction });
    const seRecibioAlgo = items.some(i => parseFloat(i.received_units || 0) > 0);

    if (seRecibioAlgo) {

      let _session = null;
      const sessionForLine = async () => {
        if (!_session) {
          _session = await ensureOpenSession({
            warehouseId: purchase.warehouse_id,
            employeeId:  req.employee?.id ?? purchase.employee_id ?? null,
            companyId:   purchase.company_id ?? null,
          }, transaction);
        }
        return _session;
      };
      const purchaseRef = purchase.invoice_number ? `Compra ${purchase.invoice_number} anulada` : `Compra #${purchase.id} anulada`;

      for (const item of items) {
        if (!item.product_id) continue;
        if (parseFloat(item.received_units || 0) <= 0) continue;   // nunca entró: nada que sacar
        const fullProd = await Product.findByPk(item.product_id, { transaction });
        if (fullProd && !fullProd.is_service) {
          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id: purchase.warehouse_id, product_id: item.product_id },
            transaction,
            lock: true
          });
          if (stockEntry) {
            const currentQty    = parseFloat(stockEntry.qty || 0);
            const qtyToSubtract = parseFloat(item.received_units || 0);
            if (currentQty < qtyToSubtract)
              throw new Error(`No se puede anular la compra: el producto "${item.product_name}" ya ha sido vendido o movido. Stock disponible: ${currentQty}, Requerido para anular: ${qtyToSubtract}`);
            await stockEntry.decrement('qty', { by: qtyToSubtract, transaction });

            if (qtyToSubtract > 0) {
              const s = await sessionForLine();
              await StockSessionLine.create({
                session_id:   s.id,
                warehouse_id: purchase.warehouse_id,
                product_id:   item.product_id,
                product_name: item.product_name || fullProd.name,
                qty_before:   currentQty,
                qty_adjusted: -parseFloat(qtyToSubtract.toFixed(4)),
                qty_after:    parseFloat((currentQty - qtyToSubtract).toFixed(4)),
                type:         'out',
                reason:       'compra_anulada',
                notes:        purchaseRef,
              }, { transaction });
            }
          }
          const totalStock = await ProductStock.sum('qty', { where: { product_id: item.product_id }, transaction });
          await Product.update({ stock: totalStock || 0 }, { where: { id: item.product_id }, transaction });
        }
      }
    }

    await purchase.destroy({ transaction });
    await transaction.commit();
    return { message: seRecibioAlgo ? "Compra anulada y stock revertido" : "Orden eliminada" };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function updateDraft(id, { warehouse_id, supplier_id, supplier_name, notes, items, currency_id, exchange_rate, receiving_mode }, req) {
  const purchase = await Purchase.findByPk(id);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  // El destino nuevo lo valida la ruta; acá se valida el que ya tenía, para que nadie edite
  // una orden dirigida a un almacén ajeno.
  await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });
  // 'parcial' también se edita: es justamente una orden abierta que se sigue cargando
  // mientras la mercancía entra.
  if (!['borrador', 'pendiente', 'parcial'].includes(purchase.status)) {
    const e = new Error("Solo se pueden editar órdenes en estado borrador, pendiente o parcial"); e.status = 400; throw e;
  }

  const transaction = await sequelize.transaction();
  try {
    let resolvedSupplierId   = supplier_id ? parseInt(supplier_id) : null;
    let resolvedSupplierName = supplier_name || null;
    if (resolvedSupplierId) {
      const sup = await Customer.findOne({ where: { id: resolvedSupplierId, type: 'proveedor' }, transaction });
      if (sup) resolvedSupplierName = sup.tax_name || sup.name;
    }

    // Las líneas ya NO se borran y se recrean en cada guardado: una que ya metió mercancía
    // al inventario tiene que conservar cuánto entró, o el modo recepción volvería a meter
    // todo desde cero en el siguiente guardado. Se emparejan por el id que el formulario
    // devuelve tal como lo recibió; las que no traen id son nuevas.
    const existentes = await PurchaseItem.findAll({ where: { purchase_id: id }, transaction, lock: true });
    const porId  = new Map(existentes.map(i => [i.id, i]));
    const vistos = new Set();

    let grandTotal = 0;
    if (items?.length) {
      for (const item of items) {
        const { product_id, package_unit, package_size, package_qty, package_price, profit_margin, lot_number, expiration_date, update_price } = item;
        if (!product_id || !package_size || !package_qty)
          throw new Error("Datos incompletos en línea de compra");

        const pkgSize  = parseFloat(package_size);
        const pkgQty   = parseFloat(package_qty);
        const pkgPrice = parseFloat(package_price) || 0;
        // Margen vacío = conservar el precio de venta actual. Hay productos con precio
        // puesto a mano, y tomarlo como 0 los dejaba vendiéndose al costo.
        const marginRaw = String(profit_margin ?? '').trim();
        const marginNum = marginRaw === '' ? NaN : parseFloat(marginRaw);
        const hasMargin = !isNaN(marginNum);
        const margin    = hasMargin ? marginNum : null;
        const unit_cost   = pkgPrice > 0 ? pkgPrice / pkgSize : 0;
        const sale_price  = hasMargin ? unit_cost * (1 + margin / 100) : null;
        const total_units = pkgQty * pkgSize;
        const subtotal    = pkgQty * pkgPrice;
        grandTotal += subtotal;

        const product = await Product.findByPk(product_id, { transaction });
        if (!product) throw new Error(`Producto ID ${product_id} no encontrado`);

        // Emparejar por id es lo preciso. Pero si la línea llega sin id —un bundle viejo en
        // caché, una integración— se busca una existente del mismo producto y lote que
        // todavía no se haya usado: sin esta red, esa línea se crearía duplicada y la
        // original se daría por quitada, que en una orden con mercancía adentro es un error
        // duro. Antes daba igual, porque las líneas se borraban y recreaban en cada guardado.
        const idLinea = item.id ? parseInt(item.id) : null;
        const previa  = idLinea
          ? porId.get(idLinea)
          : existentes.find(e =>
              !vistos.has(e.id)
              && e.product_id === parseInt(product_id)
              && (e.lot_number || null) === (lot_number || null)
              && String(e.expiration_date || "") === String(expiration_date || "")
            ) || null;
        const yaEntro = previa ? parseFloat(previa.received_units || 0) : 0;

        // Bajar la cantidad por debajo de lo que ya entró al inventario dejaría un stock que
        // ninguna línea explica y una anulación que descontaría de menos. Se corrige al revés:
        // se ajusta el inventario a mano, o se anula la orden completa y se rehace.
        if (total_units < yaEntro - 1e-6) {
          const e = new Error(`No puedes bajar "${product.name}" a ${total_units} unidades: ya entraron ${yaEntro} al inventario con esta orden`);
          e.status = 400; e.isOperational = true; throw e;
        }

        const datos = {
          product_id,
          product_name: product.name,
          package_unit: package_unit || "unidad",
          package_qty: pkgQty,
          package_size: pkgSize,
          package_price: pkgPrice,
          unit_cost,
          profit_margin: hasMargin ? margin : 0,
          sale_price: hasMargin ? sale_price : (parseFloat(product.price) || 0),
          total_units,
          subtotal,
          lot_number: lot_number || null,
          expiration_date: expiration_date || null,
          update_price: hasMargin && product.sellable !== false && update_price !== false && update_price !== 'false'
        };

        // Lote tecleado DESPUÉS de que la mercancía entró. Pasa con el modo recepción: se
        // recibe con el bulto en la mano y el lote se carga al rato. Esas unidades ya
        // sumaron al stock pero no quedaron atadas a ningún lote, así que se atan ahora — si
        // no, el vencimiento no existiría para mercancía que sí está en el estante.
        //
        // Solo cubre el caso de pasar de "sin lote" a "con lote": cambiar un lote por otro
        // sería mover existencias entre lotes, y eso es un ajuste de inventario, no una
        // edición de la orden.
        if (previa && yaEntro > 0 && lot_number && expiration_date
            && purchase.warehouse_id && (!previa.lot_number || !previa.expiration_date)) {
          const [lote] = await ProductLot.findOrCreate({
            where: {
              warehouse_id: purchase.warehouse_id,
              product_id,
              lot_number: String(lot_number),
              expiration_date,
            },
            defaults: { qty: 0 },
            transaction,
            lock: true,
          });
          await lote.increment('qty', { by: yaEntro, transaction });
        }

        if (previa) {
          // `received_units` no va en `datos`: es del inventario, no del formulario.
          await previa.update(datos, { transaction });
          vistos.add(previa.id);
        } else {
          const creada = await PurchaseItem.create(
            { purchase_id: id, received_units: 0, ...datos },
            { transaction }
          );
          vistos.add(creada.id);
        }
      }
    }

    // Lo que el formulario ya no trae, se borra. Salvo que haya metido mercancía: esa línea
    // es la única constancia de un movimiento de inventario que sí ocurrió.
    for (const previa of existentes) {
      if (vistos.has(previa.id)) continue;
      if (parseFloat(previa.received_units || 0) > 0) {
        const e = new Error(`No puedes quitar "${previa.product_name}": ya entraron ${parseFloat(previa.received_units)} unidades al inventario con esta orden`);
        e.status = 400; e.isOperational = true; throw e;
      }
      await previa.destroy({ transaction });
    }

    const updateData = {
      supplier_id: resolvedSupplierId,
      supplier_name: resolvedSupplierName,
      notes: notes || null,
      total: grandTotal,
    };
    // Solo se pisa si el cliente mandó el dato: un PUT que no toca la moneda no debe borrar
    // la tasa con que se cargó la orden.
    if (currency_id !== undefined || exchange_rate !== undefined) {
      const invoiceCur = normalizeInvoiceRate(currency_id, exchange_rate);
      updateData.currency_id   = invoiceCur.currency_id;
      updateData.exchange_rate = invoiceCur.exchange_rate;
    }
    // El destino no se puede mover una vez que entró mercancía: el stock quedó en el almacén
    // viejo y la orden pasaría a apuntar a otro, dejando ambos inventarios mintiendo.
    const destinoNuevo = warehouse_id ? parseInt(warehouse_id) : null;
    const yaRecibioAlgo = existentes.some(i => parseFloat(i.received_units || 0) > 0);
    if (yaRecibioAlgo && destinoNuevo !== purchase.warehouse_id) {
      const e = new Error("No puedes cambiar el almacén de destino: esta orden ya metió mercancía en el actual");
      e.status = 400; e.isOperational = true; throw e;
    }
    updateData.warehouse_id = destinoNuevo;

    // Campo ausente = el interruptor queda como estaba.
    const modoRecepcion = receiving_mode === undefined
      ? !!purchase.receiving_mode
      : (receiving_mode === true || receiving_mode === 'true');
    updateData.receiving_mode = modoRecepcion;

    await purchase.update(updateData, { transaction });

    // Con el modo prendido, guardar es recibir: entra al stock lo que falte de cada línea y
    // la orden queda abierta en 'parcial' para seguir cargándola. Se hace DENTRO de la misma
    // transacción que el guardado, así que si la recepción falla —sin proveedor, sin
    // almacén— no queda una orden guardada a medias con stock movido.
    if (modoRecepcion) {
      const movidas = await _receivePending(purchase, transaction, req.employee?.id ?? null);
      if (movidas > 0 && purchase.status !== 'recibido') {
        await purchase.update({ status: 'parcial' }, { transaction });
      }
    }

    await transaction.commit();
    return getOne(id);
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

async function updateItemLots(purchaseId, items, req) {
  const purchase = await Purchase.findByPk(purchaseId);
  if (!purchase) { const e = new Error("Compra no encontrada"); e.status = 404; throw e; }
  await assertWarehouseAccess(req, purchase.warehouse_id, { optional: true });
  if (purchase.status === 'recibido') { const e = new Error("Esta compra ya fue recibida"); e.status = 400; throw e; }

  for (const { id, lot_number, expiration_date } of items) {
    await PurchaseItem.update(
      { lot_number: lot_number || null, expiration_date: expiration_date || null },
      { where: { id, purchase_id: purchaseId } }
    );
  }
  return getOne(purchaseId);
}

module.exports = { getAll, getOne, createPurchase, updateDraft, confirmOrder, receivePurchase, updateItemLots, deletePurchase };
