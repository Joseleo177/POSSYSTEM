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
  PAYMENT_METHODS,
} = require("./shared");
const { Quotation, QuotationItem } = require("../../models");
const { cargarPromosActivas, calcLineDiscount } = require("./promoDiscounts");
const { leerDescuentoLinea, calcDescuentoLinea, assertDescuentosPermitidos } = require("./lineDiscount");

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

// Ficha de existencias en cero para un producto que la sucursal nunca recibió. Solo sin
// conexión: la venta ya ocurrió y la existencia tiene que quedar en negativo para que se vea.
async function fichaEnCero(warehouse_id, product_id, transaction) {
  await ProductStock.findOrCreate({
    where: { warehouse_id, product_id },
    defaults: { warehouse_id, product_id, qty: 0 },
    transaction,
  });
  return ProductStock.findOne({ where: { warehouse_id, product_id }, transaction, lock: true });
}

// La promoción que la caja aplicó sin conexión, en la forma que espera calcLineDiscount. Viaja
// con la línea porque al sincronizar puede haber vencido o cambiado: se factura la que vio el
// cliente. Solo se aceptan los dos tipos que existen y con valores con sentido.
function promoDeLinea(productId, promo) {
  if (!promo) return [];
  const pct = parseFloat(promo.discount_pct);
  const buy = parseInt(promo.buy_qty);
  const get = parseInt(promo.get_qty);
  if (promo.type === "percentage" && pct > 0 && pct <= 100) {
    return [{ type: "percentage", discount_pct: pct, Products: [{ id: productId }] }];
  }
  if (promo.type === "buy_x_get_y" && buy > 0 && get > 0) {
    return [{ type: "buy_x_get_y", buy_qty: buy, get_qty: get, Products: [{ id: productId }] }];
  }
  return [];
}

// `offline` solo lo pasa syncOfflineSale, nunca el cuerpo de la petición: { sold_at, ref }.
// Con él, la venta ya ocurrió en una caja sin internet —la mercancía salió y el dinero entró—,
// así que se registra tal como se cobró: precio y promoción de cada línea los trae la caja, y
// las existencias se descuentan aunque queden en negativo.
module.exports = async function createSale(body, req, { offline = null } = {}) {
  const { items, paid, customer_id, employee_id, currency_id, exchange_rate, payment_method, serie_id, discount_amount, service_charge, service_charge_label, warehouse_id, idempotency_key, hold } =
    body;
  // Una cotización no se recupera sin conexión: su precio pactado vive en el servidor.
  const quotation_id = offline ? null : body.quotation_id;

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

    // Promociones vigentes de esta sucursal (ver promoDiscounts.js: lo comparte updateSale,
    // que factura las cuentas en espera con el mismo criterio). Sin conexión, cada línea trae
    // la suya.
    const activePromos = offline ? [] : await cargarPromosActivas(warehouse_id, transaction);
    // Productos que la venta dejó en negativo: se devuelven para que la caja los señale.
    const stockNegativo = [];

    // Dos pistas de cálculo en paralelo:
    // - $ (sale.total): round2 POR LÍNEA → sum(round2(price) × qty) → 3 × 4.07 = 12.21
    //   (igual que el carrito en USD: el usuario ve 4.07 × 3 = 12.21 exacto).
    // - Bs (sale_items.subtotal): precio PRECISO con 5 decimales, redondeo en el frontend
    //   (CartContext.subtotalBs: round2(price × vesRate) × qty = 3 × 3000 = 9000).
    // La diferencia de 0.01 entre ambas pistas (12.21 vs 9000/tasa=12.20) es inherente al
    // redondeo dual y se gestiona en PaymentFormModal con la tolerancia de 0.02 USD.
    const round2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

    // Precio pactado en una cotización. Se cobra lo que se le ofreció al cliente, que es lo
    // que la caja tiene en pantalla al recuperarla: sin esto la línea se refacturaba al precio
    // del día y el ticket no coincidía con el presupuesto firmado. Los precios salen de la
    // cotización guardada, nunca del cuerpo de la petición: el cliente no elige cuánto paga.
    // Es el mismo criterio con que la convierte quotations/convertToSale.
    const precioPactado = new Map();
    if (quotation_id) {
      const cotizacion = await Quotation.findByPk(quotation_id, { transaction });
      if (cotizacion && cotizacion.status === 'pendiente') {
        const lineas = await QuotationItem.findAll({ where: { quotation_id }, transaction });
        for (const l of lineas) {
          if (l.product_id != null) precioPactado.set(parseInt(l.product_id), parseFloat(l.price));
        }
      }
    }

    let total = 0;
    const enrichedItems = [];
    // Para el control de descuentos: lo bruto de la venta y cada descuento manual por línea.
    let subtotalBruto = 0;
    const descuentosManuales = [];

    for (const item of items) {
      const product = await Product.findByPk(item.product_id, { transaction, lock: true });
      if (!product) throw new Error(`Producto ${item.product_id} no encontrado`);
      // Un insumo se consume dentro de un plato, no se cobra suelto. La comprobación va sobre
      // la línea vendida: los ingredientes de un combo se descuentan más abajo y ahí no se
      // valida, que es justamente lo que permite que el combo lleve harina o aceite.
      if (product.sellable === false) {
        throw new Error(`"${product.name}" es un insumo y no está disponible para la venta`);
      }
      // El modelo de unas variantes es una plantilla: lo que se vende es "Negro / L", no la
      // franela en abstracto. La caja abre el selector antes de llegar aquí.
      if (product.is_variant_parent) {
        throw new Error(`"${product.name}" tiene variantes: elige talla o color`);
      }

      // El precio que rige es el de la sucursal, si lo fijó. Sale de la misma fila que más
      // abajo descuenta las existencias —con lock—, así que no cuesta una consulta extra.
      //
      // Un servicio o un combo no descuenta existencias propias, pero sí puede tener ficha en
      // la sucursal con precio (y costo) propios: es lo que la caja lee al armar el carrito
      // —warehouses/:id/products devuelve COALESCE(ps.price, p.price) para cualquier tipo de
      // producto—, así que es lo que hay que facturar. Saltarse la ficha para ellos cobraba el
      // precio del catálogo: el cajero veía un monto en el carrito y el ticket salía con otro.
      // El lock es para poder descontar; leer un precio no necesita bloquear la fila.
      const descuentaStock = !product.is_service && !product.is_combo;
      const fichaSucursal = await ProductStock.findOne({
        where: { warehouse_id, product_id: product.id },
        transaction,
        ...(descuentaStock ? { lock: true } : {}),
      });

      // Orden: lo pactado en la cotización, si no el precio de esta sucursal, si no el general.
      // Sin conexión manda el precio con que se cobró.
      let rawPrice;
      if (offline) {
        rawPrice = parseFloat(item.price);
        if (!Number.isFinite(rawPrice) || rawPrice < 0) throw new Error(`Precio inválido para "${product.name}"`);
      } else {
        rawPrice = precioPactado.has(product.id)
          ? precioPactado.get(product.id)
          : parseFloat(fichaSucursal?.price ?? product.price);
      }
      const roundedPrice = round2(rawPrice);
      const promosLinea = offline ? promoDeLinea(product.id, item.promo) : activePromos;
      // lineDiscountUsd: usa roundedPrice (pista $, para sale.total)
      // lineDiscountBs:  usa rawPrice    (pista Bs, para SaleItem.discount y subtotal generado)
      // El descuento manual de la caja, si lo hay, reemplaza a la promoción (ver lineDiscount.js).
      const manual = leerDescuentoLinea(item.line_discount);
      const lineDiscountUsd = manual
        ? calcDescuentoLinea(manual, roundedPrice, item.quantity)
        : calcLineDiscount(product.id, roundedPrice, item.quantity, promosLinea);
      const lineDiscountBs = manual
        ? calcDescuentoLinea(manual, rawPrice, item.quantity)
        : calcLineDiscount(product.id, rawPrice, item.quantity, promosLinea);
      subtotalBruto += roundedPrice * item.quantity;
      if (manual) descuentosManuales.push({ nombre: product.name, bruto: roundedPrice * item.quantity, descuento: lineDiscountUsd });

      if (product.is_service) {
        total += roundedPrice * item.quantity - lineDiscountUsd;
        // stockEntry va solo para congelar el costo de esta sucursal (el servicio no mueve
        // existencias): mismo criterio que el precio, y que el COALESCE que ve la caja.
        enrichedItems.push({ product, qty: item.quantity, isCombo: false, isService: true, stockEntry: fichaSucursal, lineDiscountBs, unitPrice: rawPrice, manual });
      } else if (product.is_combo) {
        const comboItems = await ProductComboItem.findAll({ where: { combo_id: product.id }, transaction });
        if (!comboItems || comboItems.length === 0) {
          throw new Error(`El combo "${product.name}" no tiene ingredientes configurados`);
        }

        const ingredientsData = [];
        for (const cItem of comboItems) {
          const ingredient = await Product.findByPk(cItem.product_id, { transaction, lock: true });
          const qtyNeeded = item.quantity * parseFloat(cItem.quantity);

          let stockEntry = await ProductStock.findOne({
            where: { warehouse_id, product_id: ingredient.id },
            transaction,
            lock: true,
          });
          if (offline && !stockEntry) stockEntry = await fichaEnCero(warehouse_id, ingredient.id, transaction);
          const currentQty = parseFloat(stockEntry?.qty || 0);
          if (offline) {
            if (currentQty < qtyNeeded) stockNegativo.push(ingredient.name);
          } else if (currentQty < qtyNeeded) {
            throw new Error(
              `Stock insuficiente del ingrediente "${ingredient.name}" para el combo "${product.name}". Disponible: ${currentQty}, Requerido: ${qtyNeeded}`
            );
          }
          ingredientsData.push({ ingredient, qtyNeeded, stockEntry });
        }

        total += roundedPrice * item.quantity - lineDiscountUsd;
        enrichedItems.push({ product, qty: item.quantity, isCombo: true, ingredientsData, lineDiscountBs, unitPrice: rawPrice, manual });
      } else {
        // La ficha ya se cargó arriba con lock para leer el precio de la sucursal.
        const stockEntry = fichaSucursal || (offline ? await fichaEnCero(warehouse_id, product.id, transaction) : null);

        const currentQty = parseFloat(stockEntry?.qty || 0);
        if (offline) {
          if (currentQty < item.quantity) stockNegativo.push(product.name);
        } else if (currentQty < item.quantity) {
          throw new Error(`Stock insuficiente para "${product.name}" en este almacén. Disponible: ${currentQty}`);
        }

        total += roundedPrice * item.quantity - lineDiscountUsd;
        enrichedItems.push({ product, qty: item.quantity, isCombo: false, stockEntry, lineDiscountBs, unitPrice: rawPrice, manual });
      }
    }

    // Descuentos: permiso y tope de quien factura. Sin conexión no se controla: la venta ya
    // ocurrió en el mostrador y se registra tal como se cobró, igual que su precio.
    if (!offline) {
      await assertDescuentosPermitidos(req, { lineas: descuentosManuales, subtotal: subtotalBruto, global: discAmt }, transaction);
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
        // created_at queda en la hora en que llega: es cuando se factura y toma correlativo,
        // así los números siguen el orden de las fechas. La hora real de la venta va aparte.
        offline_at: offline ? offline.sold_at : null,
        offline_ref: offline ? offline.ref : null,
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
          line_discount_mode:  entry.manual ? entry.manual.mode : null,
          line_discount_value: entry.manual ? entry.manual.value : null,
          discount_by:         entry.manual ? (employee_id || req?.employee?.id || null) : null,
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

    const data = await formatSale(sale.id);
    if (stockNegativo.length) data.stock_negativo = [...new Set(stockNegativo)];
    return data;
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
