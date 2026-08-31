const {
  Sale,
  SaleItem,
  Customer,
  Employee,
  Currency,
  Warehouse,
  Product,
  ProductStock,
  Serie,
  SerieRange,
  ProductComboItem,
  Sequelize,
  sequelize,
  Op,
  PAYMENT_METHODS,
} = require("./shared");
const { Quotation } = require("../../models");
const { Promotion } = require("../../models");

// Devuelve la venta con todas sus relaciones, en el formato plano que
// espera el frontend. Reutilizado por la respuesta normal y la idempotente.
async function formatSale(saleId) {
  const fullSale = await Sale.findByPk(saleId, {
    include: [
      { model: Customer, attributes: ["name", "rif"] },
      { model: Employee, attributes: ["full_name"] },
      { model: Currency, attributes: ["symbol", "code"] },
      { model: Warehouse, attributes: ["name"] },
      { model: Serie, attributes: ["name", "prefix", "padding"] },
      { model: SaleItem },
    ],
  });

  const data = fullSale.toJSON();
  data.customer_name = data.Customer?.name ?? null;
  data.customer_rif  = data.Customer?.rif ?? null;
  data.employee_name = data.Employee?.full_name ?? null;
  data.currency_symbol = data.Currency?.symbol ?? null;
  data.currency_code = data.Currency?.code ?? null;
  data.warehouse_name = data.Warehouse?.name ?? null;
  data.serie_name = data.Serie?.name ?? null;
  data.items = data.SaleItems ?? [];
  // Suma precisa de líneas (precio completo sin truncar a 2 dec) — igual que getOneSale.js.
  // Sin esto, "Registrar pago inmediato" (que usa esta respuesta) mostraba un Bs distinto al que
  // se ve al reabrir la misma factura desde Contabilidad/Pendientes (que sí la calculan).
  data.total_precise = parseFloat(
    data.items.reduce((s, si) => s + parseFloat(si.subtotal || 0), 0).toFixed(5)
  );
  ["Customer", "Employee", "Currency", "Warehouse", "Serie", "SaleItems"].forEach((k) => delete data[k]);
  return data;
}

module.exports = async function createSale(body) {
  const { items, paid, customer_id, employee_id, currency_id, exchange_rate, payment_method, serie_id, discount_amount, service_charge, service_charge_label, warehouse_id, idempotency_key, quotation_id, hold } =
    body;

  // Idempotencia: si ya existe una venta con esta clave, devolverla sin
  // crear una nueva. Cubre reintentos de red y doble envío del cliente.
  if (idempotency_key) {
    const existing = await Sale.findOne({ where: { idempotency_key } });
    if (existing) return formatSale(existing.id);
  }

  const transaction = await sequelize.transaction();
  try {
    if (!items?.length) throw new Error("items es requerido");
    if (paid == null) throw new Error("paid es requerido");
    if (!warehouse_id) throw new Error("warehouse_id es requerido");

    // Desde un depósito no se factura: guarda mercancía, no atiende público. Sin esta
    // comprobación se podía vender contra el stock de la trastienda por elegir mal en el
    // selector, y el error que aparecía era "la serie es requerida", que no dice nada.
    const almacenVenta = await Warehouse.findByPk(warehouse_id, { transaction });
    if (almacenVenta && almacenVenta.sells === false) {
      throw new Error(`${almacenVenta.name} es un depósito: no se puede facturar desde ahí`);
    }
    if (!serie_id) throw new Error("La serie es requerida");

    const serie = await Serie.findByPk(serie_id, { transaction });
    if (!serie || !serie.active) throw new Error("Serie no encontrada o inactiva");
    // La serie pertenece a una sucursal: facturar con la serie de otro almacén mezclaría
    // los correlativos de dos sucursales.
    if (serie.warehouse_id && parseInt(serie.warehouse_id) !== parseInt(warehouse_id)) {
      throw new Error("La serie seleccionada no pertenece al almacén de la venta");
    }

    const method = PAYMENT_METHODS.includes(payment_method) ? payment_method : "efectivo";
    const discAmt = parseFloat(discount_amount) || 0;
    // Recargo de cabecera (propina/servicio). Llega en moneda base, igual que el descuento, y
    // suma al total en vez de restar. Negativo no: para bajar el total está el descuento.
    const chargeAmt = Math.max(0, parseFloat(service_charge) || 0);
    const chargeLabel = chargeAmt > 0 ? (service_charge_label?.trim().slice(0, 40) || "Servicio") : null;
    const rate = parseFloat(exchange_rate) || 1;

    // Cargar promociones activas para esta venta: las de la sucursal donde se factura, más
    // las que corren en todas. El filtro tiene que estar acá y no solo en la caja — el
    // descuento se recalcula en el servidor, así que sin esto una promoción de otra tienda se
    // seguiría aplicando aunque el carrito no la haya mostrado nunca.
    const now = new Date();
    const activePromos = await Promotion.findAll({
      where: {
        active: true,
        starts_at: { [Op.lte]: now },
        [Op.and]: [
          { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
          { [Op.or]: [{ warehouse_id: null }, { warehouse_id }] },
        ],
      },
      include: [{ model: Product, through: { attributes: [] }, attributes: ['id'] }],
      transaction,
    });

    // Dos pistas de cálculo en paralelo:
    // - $ (sale.total): round2 POR LÍNEA → sum(round2(price) × qty) → 3 × 4.07 = 12.21
    //   (igual que el carrito en USD: el usuario ve 4.07 × 3 = 12.21 exacto).
    // - Bs (sale_items.subtotal): precio PRECISO con 5 decimales, redondeo en el frontend
    //   (CartContext.subtotalBs: round2(price × vesRate) × qty = 3 × 3000 = 9000).
    // La diferencia de 0.01 entre ambas pistas (12.21 vs 9000/tasa=12.20) es inherente al
    // redondeo dual y se gestiona en PaymentFormModal con la tolerancia de 0.02 USD.
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

    const calcLineDiscount = (productId, unitPrice, qty, promos) => {
      for (const promo of promos) {
        if (!promo.Products.some(p => p.id === productId)) continue;
        if (promo.type === 'percentage')
          return parseFloat((unitPrice * qty * parseFloat(promo.discount_pct) / 100).toFixed(5));
        if (promo.type === 'buy_x_get_y') {
          const freeUnits = Math.floor(qty / (promo.buy_qty + promo.get_qty)) * promo.get_qty;
          return parseFloat((freeUnits * unitPrice).toFixed(5));
        }
      }
      return 0;
    };

    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);
      // Un insumo se consume dentro de un plato, no se cobra suelto. La comprobación va sobre
      // la línea vendida: los ingredientes de un combo se descuentan más abajo y ahí no se
      // valida, que es justamente lo que permite que el combo lleve harina o aceite.
      if (product.sellable === false) {
        throw new Error(`"${product.name}" es un insumo y no está disponible para la venta`);
      }

      // El precio que rige es el de la sucursal, si lo fijó. Sale de la misma fila que más
      // abajo descuenta las existencias —con lock—, así que no cuesta una consulta extra.
      // Servicios y combos no tienen ficha de almacén: siguen con el precio del producto.
      const fichaSucursal = (product.is_service || product.is_combo)
        ? null
        : await ProductStock.findOne({
            where: { warehouse_id, product_id: product.id },
            transaction,
            lock: true,
          });

      const rawPrice     = parseFloat(fichaSucursal?.price ?? product.price);
      const roundedPrice = round2(rawPrice);
      // lineDiscountUsd: usa roundedPrice (pista $, para sale.total)
      // lineDiscountBs:  usa rawPrice    (pista Bs, para SaleItem.discount y subtotal generado)
      const lineDiscountUsd = calcLineDiscount(product.id, roundedPrice, item.quantity, activePromos);
      const lineDiscountBs  = calcLineDiscount(product.id, rawPrice,     item.quantity, activePromos);

      if (product.is_service) {
        total += roundedPrice * item.quantity - lineDiscountUsd;
        enrichedItems.push({ product, qty: item.quantity, isCombo: false, isService: true, lineDiscountBs, unitPrice: rawPrice });
      } else if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        if (!comboItems || comboItems.length === 0) {
          throw new Error(`El combo "${product.name}" no tiene ingredientes configurados`);
        }

        const ingredientsData = [];
        for (const cItem of comboItems) {
          const ingredient = await Product.findByPk(cItem.product_id, { transaction, lock: true });
          const qtyNeeded = item.quantity * parseFloat(cItem.quantity);

          const stockEntry = await ProductStock.findOne({
            where: { warehouse_id, product_id: ingredient.id },
            transaction,
            lock: true,
          });
          const currentQty = parseFloat(stockEntry?.qty || 0);
          if (currentQty < qtyNeeded) {
            throw new Error(
              `Stock insuficiente del ingrediente "${ingredient.name}" para el combo "${product.name}". Disponible: ${currentQty}, Requerido: ${qtyNeeded}`
            );
          }
          ingredientsData.push({ ingredient, qtyNeeded, stockEntry });
        }

        total += roundedPrice * item.quantity - lineDiscountUsd;
        enrichedItems.push({ product, qty: item.quantity, isCombo: true, ingredientsData, lineDiscountBs, unitPrice: rawPrice });
      } else {
        // La ficha ya se cargó arriba con lock para leer el precio de la sucursal.
        const stockEntry = fichaSucursal;

        const currentQty = parseFloat(stockEntry?.qty || 0);
        if (currentQty < item.quantity) {
          throw new Error(`Stock insuficiente para "${product.name}" en este almacén. Disponible: ${currentQty}`);
        }

        total += roundedPrice * item.quantity - lineDiscountUsd;
        enrichedItems.push({ product, qty: item.quantity, isCombo: false, stockEntry, lineDiscountBs, unitPrice: rawPrice });
      }
    }

    // 2 decimales: sale.total es el monto "oficial" de la factura en $.
    total = parseFloat((total - discAmt + chargeAmt).toFixed(2));
    if (total < 0) total = 0;

    const paidBase = parseFloat(paid) || 0;
    const change = 0;

    const sale = await Sale.create(
      {
        total,
        paid: paidBase,
        change,
        customer_id: customer_id || null,
        employee_id: employee_id || null,
        currency_id: currency_id || null,
        exchange_rate: rate,
        discount_amount: discAmt,
        service_charge: chargeAmt,
        service_charge_label: chargeLabel,
        payment_method: method,
        warehouse_id,
        serie_id: serie.id,
        // 'espera' = cuenta abierta (mesa/pedido sin cobrar todavía). Se distingue de
        // 'borrador' para que NO aparezca en Facturas Pendientes: se gestiona desde
        // "Cuentas en espera" y es visible para cualquier caja de la empresa.
        status: hold ? 'espera' : 'borrador',
        idempotency_key: idempotency_key || null,
      },
      { transaction }
    );

    for (const entry of enrichedItems) {
      // `discount` se guarda POR UNIDAD: la BD calcula subtotal = (price - discount) * quantity
      // (columna generada). entry.lineDiscountBs es el descuento TOTAL de la línea (p.ej. valor de
      // las unidades gratis en una promo "compre X lleve Y"), hay que prorratearlo entre qty.
      const unitDiscount = entry.qty > 0 ? parseFloat(((entry.lineDiscountBs || 0) / entry.qty).toFixed(5)) : 0;

      // Costo congelado: sin esto, el reporte de márgenes recalcula la utilidad de esta venta
      // con el costo de reposición del día en que se consulte, no con el que tenía hoy.
      // En un combo el producto no lleva costo propio: es la suma del costo de sus ingredientes.
      //
      // El costo también es de la sucursal: el de la ficha si esta tienda ya recibió
      // mercancía, y si no el del catálogo. Sin esto, el margen de una sucursal se calculaba
      // con lo que le costó a la otra.
      let unitCost = null;
      if (entry.isCombo) {
        const comboCost = entry.ingredientsData.reduce(
          (acc, ing) => acc + parseFloat(ing.stockEntry?.cost_price ?? ing.ingredient.cost_price ?? 0) * ing.qtyNeeded,
          0
        );
        unitCost = entry.qty > 0 ? parseFloat((comboCost / entry.qty).toFixed(5)) : null;
      } else {
        const costo = entry.stockEntry?.cost_price ?? entry.product.cost_price;
        if (costo != null) unitCost = parseFloat(costo);
      }

      await SaleItem.create(
        {
          sale_id: sale.id,
          product_id: entry.product.id,
          name: entry.product.name,
          // El precio cobrado, que puede ser el de la sucursal y no el del catálogo. Guardar
          // aquí `product.price` dejaría la línea sin cuadrar contra el total de la venta.
          price: entry.unitPrice,
          quantity: entry.qty,
          discount: unitDiscount,
          cost_price: unitCost,
        },
        { transaction }
      );

      if (entry.isService) {
        // no-op
      } else if (entry.isCombo) {
        for (const ing of entry.ingredientsData) {
          await ing.stockEntry.decrement("qty", { by: ing.qtyNeeded, transaction });
          const totalStock = await ProductStock.sum("qty", { where: { product_id: ing.ingredient.id }, transaction });
          await ing.ingredient.update({ stock: totalStock || 0 }, { transaction });
        }
      } else {
        await entry.stockEntry.decrement("qty", { by: entry.qty, transaction });
        const totalStock = await ProductStock.sum("qty", { where: { product_id: entry.product.id }, transaction });
        await entry.product.update({ stock: totalStock || 0 }, { transaction });
      }
    }

    await transaction.commit();

    // Si la venta viene de una cotización, marcarla como convertida
    // (debe ir después del commit para que sale.id exista en la BD)
    if (quotation_id) {
      await Quotation.update(
        { status: 'convertida', converted_sale_id: sale.id },
        { where: { id: quotation_id, status: 'pendiente' } }
      ).catch(e => console.error('[quotation convert]', e.message));
    }

    return formatSale(sale.id);
  } catch (err) {
    await transaction.rollback();

    // Carrera: dos peticiones simultáneas con la misma clave de idempotencia.
    // La segunda viola el índice único; devolvemos la venta ya creada.
    if (idempotency_key && err?.name === "SequelizeUniqueConstraintError") {
      const existing = await Sale.findOne({ where: { idempotency_key } });
      if (existing) return formatSale(existing.id);
    }
    throw err;
  }
};
