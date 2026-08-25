const { Sale, SaleItem, Customer, Employee, Currency, Warehouse, Serie, Sequelize, Op, PAYMENT_METHODS } = require("./shared");

module.exports = async function getAllSales(query, tenant = {}) {
  const { limit = 50, offset = 0, date_from, date_to, payment_method, status, serie_id, search, warehouse_id, employee_id } = query;
  const { company_id, isSuperuser, allowedWarehouses } = tenant;

  const andClauses = [];

  if (company_id) {
    andClauses.push({ company_id });
  }

  // allowedWarehouses = null → sin restricción (admin). Un array limita la vista a las
  // sucursales del empleado.
  if (warehouse_id) {
    andClauses.push({ warehouse_id: parseInt(warehouse_id, 10) });
  } else if (Array.isArray(allowedWarehouses)) {
    andClauses.push({
      [Op.or]: [
        { warehouse_id: { [Op.in]: allowedWarehouses } },
        // Un pedido del catálogo público nace sin sucursal —la define quien lo acepta—,
        // así que tiene que verse desde cualquier caja. Sin esta excepción el recorte por
        // almacén los dejaba fuera para todos salvo el admin: ninguna caja los recibía.
        { warehouse_id: null, status: 'pedido' },
      ],
    });
  }

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);
  if (safeFrom) andClauses.push(Sequelize.literal(`("Sale"."created_at" AT TIME ZONE 'America/Caracas')::date >= '${safeFrom}'`));
  if (safeTo)   andClauses.push(Sequelize.literal(`("Sale"."created_at" AT TIME ZONE 'America/Caracas')::date <= '${safeTo}'`));
  if (payment_method && PAYMENT_METHODS.includes(payment_method)) andClauses.push({ payment_method });
  if (status) {
    const statuses = Array.isArray(status) ? status : [status];
    andClauses.push(statuses.length === 1 ? { status: statuses[0] } : { status: { [Op.in]: statuses } });
  }
  if (serie_id) andClauses.push({ serie_id: parseInt(serie_id, 10) });
  // Quién hizo la venta. Entra en andClauses como los demás filtros, así que los totales
  // del pie —que se calculan sobre este mismo where— hablan del empleado filtrado y no de
  // toda la caja.
  if (employee_id && !isNaN(parseInt(employee_id, 10))) {
    andClauses.push({ employee_id: parseInt(employee_id, 10) });
  }

  if (search) {
    const safe = search.slice(0, 100).replace(/[\x00-\x1f\\]/g, '');
    const esc  = safe.replace(/'/g, "''");
    andClauses.push({
      [Op.or]: [
        { invoice_number: { [Op.iLike]: `%${safe}%` } },
        Sequelize.literal(`"Sale"."customer_id" IN (SELECT id FROM customers WHERE name ILIKE '%${esc}%' OR rif ILIKE '%${esc}%')`),
      ],
    });
  }

  const where = andClauses.length ? { [Op.and]: andClauses } : {};

  const { count, rows: sales } = await Sale.findAndCountAll({
    where,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10),
    order: [["created_at", "DESC"]],
    attributes: {
      include: [
        [Sequelize.literal('(SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")'), "amount_paid"],
        [Sequelize.literal(`(SELECT COALESCE(SUM(total),0) FROM returns WHERE sale_id = "Sale"."id" AND status <> 'anulado')`), "total_returned"],
        [Sequelize.literal('(SELECT exchange_rate FROM payments WHERE sale_id = "Sale"."id" ORDER BY created_at DESC LIMIT 1)'), "final_payment_rate"],
        // Suma precisa de líneas (sin truncar a 2 dec). El frontend la usa para convertir a Bs.
        [Sequelize.literal('(SELECT COALESCE(SUM(subtotal),0) FROM sale_items WHERE sale_id = "Sale"."id")'), "total_precise"],
      ],
    },
    include: [
      { model: Customer, attributes: ["name", "rif"], required: false },
      { model: Employee, attributes: ["full_name"], required: false },
      { model: Currency, attributes: ["symbol", "code"], required: false },
      { model: Warehouse, attributes: ["name"], required: false },
      { model: Serie, attributes: ["name", "prefix"], required: false },
      { model: SaleItem, required: true },
    ],
    distinct: true,
  });

  const data = sales.map((s) => {
    const item = s.toJSON();
    item.customer_name = item.Customer?.name ?? null;
    item.customer_rif  = item.Customer?.rif ?? null;
    item.employee_name = item.Employee?.full_name ?? null;
    item.currency_symbol = item.Currency?.symbol ?? null;
    item.currency_code = item.Currency?.code ?? null;
    item.warehouse_name = item.Warehouse?.name ?? null;
    item.serie_name = item.Serie?.name ?? null;
    item.items = item.SaleItems ?? [];
    item.amount_paid = parseFloat(item.amount_paid || 0);
    item.total_precise = parseFloat(item.total_precise || item.total || 0);
    const totalRet = parseFloat(item.total_returned || 0);
    item.forgiven_amount = parseFloat(item.forgiven_amount || 0);
    // Lo exonerado salda igual que un cobro, pero se resta aparte: en `amount_paid` iría
    // como dinero recibido y no lo es.
    item.balance = parseFloat(
      (parseFloat(item.total) - totalRet - item.amount_paid - item.forgiven_amount).toFixed(6)
    );
    // Igual que en getOneSale: una venta 'pagado' o 'exonerado' no arrastra saldo. Con divisas
    // recibidas a tasa de efectivo la resta deja centavos que el cliente no debe.
    if (item.status === 'pagado' || item.status === 'exonerado' || item.balance < 0) item.balance = 0;
    ["Customer", "Employee", "Currency", "Warehouse", "Serie", "SaleItems"].forEach((k) => delete item[k]);
    return item;
  });

  // Totales del filtro COMPLETO, no de la página. Se calculan en SQL sobre el mismo where:
  // sumar solo las filas visibles daría una cifra que no corresponde a lo filtrado. Van en
  // moneda base, que es la única común. El pendiente resta devoluciones y cobros, igual que
  // el balance por fila, y se piso a 0 por venta para no restar los saldos negativos que
  // dejan los cobros en divisas a tasa de efectivo.
  // Sin JOIN a sale_items: ese join devuelve una fila por ítem y multiplicaría cada total por
  // la cantidad de líneas de su venta. El EXISTS replica el `required: true` del listado
  // —descartar ventas sin ítems— sin duplicar ninguna fila.
  const [totals] = await Sale.findAll({
    where: {
      [Op.and]: [
        ...andClauses,
        Sequelize.literal('EXISTS (SELECT 1 FROM sale_items WHERE sale_id = "Sale"."id")'),
      ],
    },
    attributes: [
      // Las anuladas no suman: no son facturación. Siguen listándose —hay que poder verlas y
      // auditarlas— pero quedan fuera de los tres totales, para que el pie hable solo de
      // facturas válidas y las cifras cierren entre sí.
      [Sequelize.literal(`COALESCE(SUM(CASE WHEN "Sale"."status" IN ('anulado','devuelto') THEN 0 ELSE "Sale"."total" END), 0)`), "sum_total"],
      // "Cobrado" es lo aplicado a estas facturas, no el efectivo que entró:
      //  - una factura 'pagado' cuenta por su total, porque el sistema ya la dio por saldada
      //    aunque los cobros sumen unos céntimos menos (tolerancia de redondeo por línea);
      //  - en las demás se topa al total, para que el sobrante de un cobro en divisas a tasa
      //    de efectivo no infle la cifra.
      // Lo que sobró sí entró a caja y se ve en el módulo de Pagos. Con este criterio,
      // Total − Cobrado − Exonerado da exactamente el Pendiente.
      [Sequelize.literal(`COALESCE(SUM(
        CASE WHEN "Sale"."status" IN ('anulado','devuelto') THEN 0
             WHEN "Sale"."status" = 'pagado' THEN "Sale"."total"
             ELSE LEAST(
               (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")
                 + (SELECT COALESCE(SUM(total),0) FROM returns WHERE sale_id = "Sale"."id" AND status <> 'anulado'),
               "Sale"."total")
        END), 0)`), "sum_paid"],
      // El pendiente NO es total - cobrado: así, una factura anulada aportaría su monto
      // completo a la deuda pese a no deber nada. Se calcula por venta con el mismo criterio
      // que item.balance de arriba —anulada, devuelta y pagada no arrastran saldo, y el piso
      // es 0 para no restar los negativos que dejan los cobros en divisas a tasa de efectivo—
      // y recién entonces se suma.
      [Sequelize.literal(`COALESCE(SUM(
        CASE WHEN "Sale"."status" IN ('anulado', 'devuelto', 'pagado', 'exonerado') THEN 0
             ELSE GREATEST(
               "Sale"."total"
                 - (SELECT COALESCE(SUM(total),0)  FROM returns  WHERE sale_id = "Sale"."id" AND status <> 'anulado')
                 - (SELECT COALESCE(SUM(amount),0) FROM payments WHERE sale_id = "Sale"."id")
                 - "Sale"."forgiven_amount",
               0)
        END), 0)`), "sum_pending"],
      // Saldo perdonado del filtro. Va aparte de "cobrado" a propósito: es plata que se dejó
      // de cobrar, y sumarla ahí diría que entró a caja. Es el único lugar donde el monto
      // exonerado se ve totalizado, ya que no genera egreso.
      [Sequelize.literal(`COALESCE(SUM(
        CASE WHEN "Sale"."status" IN ('anulado','devuelto') THEN 0
             ELSE "Sale"."forgiven_amount" END), 0)`), "sum_forgiven"],
    ],
    raw: true,
  });

  return {
    data,
    total: count,
    sum_total:    parseFloat(totals?.sum_total    || 0),
    sum_paid:     parseFloat(totals?.sum_paid     || 0),
    sum_pending:  parseFloat(totals?.sum_pending  || 0),
    sum_forgiven: parseFloat(totals?.sum_forgiven || 0),
  };
};
