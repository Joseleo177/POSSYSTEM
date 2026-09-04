const { Payment, Sale, SaleItem, Customer, Employee, Currency, PaymentJournal, Warehouse, Sequelize, Op } = require("./shared");

module.exports = async function getAllPayments(query, tenant = {}) {
  const { date_from, date_to, limit = 100, offset = 0, search, warehouse_id } = query;
  const { company_id, isSuperuser, allowedWarehouses } = tenant;

  // Un cobro no guarda sucursal propia: la hereda de la venta, así que el filtro va sobre
  // el join con sales (que ya es required).
  const saleWhere = {};
  if (warehouse_id) {
    saleWhere.warehouse_id = parseInt(warehouse_id, 10);
  } else if (Array.isArray(allowedWarehouses)) {
    saleWhere.warehouse_id = { [Op.in]: allowedWarehouses };
  }
  const andClauses = [
    // Excluir egresos de cambio (amount < 0) del historial visible
    { amount: { [Op.gt]: 0 } },
  ];

  if (company_id) {
    andClauses.push({ company_id });
  }

  // Filtro por diario de pago (caja / banco) del cobro
  const pj = parseInt(query.payment_journal_id, 10);
  if (Number.isInteger(pj)) andClauses.push({ payment_journal_id: pj });

  // Quién cobró. El cobro guarda su propio empleado —no lo hereda de la venta—, que es lo
  // correcto aquí: una factura la puede emitir un cajero y cobrarla otro al día siguiente.
  // Va en andClauses, así que el pie totaliza lo de ese empleado y no lo de toda la caja.
  const emp = parseInt(query.employee_id, 10);
  if (Number.isInteger(emp)) andClauses.push({ employee_id: emp });

  const sd = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;
  const safeFrom = sd(date_from);
  const safeTo   = sd(date_to);
  if (safeFrom) andClauses.push(Sequelize.literal(`("Payment"."created_at" AT TIME ZONE 'America/Caracas')::date >= '${safeFrom}'`));
  if (safeTo)   andClauses.push(Sequelize.literal(`("Payment"."created_at" AT TIME ZONE 'America/Caracas')::date <= '${safeTo}'`));

  if (search) {
    const safe = search.slice(0, 100).replace(/[\x00-\x1f\\]/g, '');
    const esc  = safe.replace(/'/g, "''");
    andClauses.push({
      [Op.or]: [
        Sequelize.literal(`"Payment"."sale_id" IN (SELECT id FROM sales WHERE invoice_number ILIKE '%${esc}%')`),
        Sequelize.literal(`"Payment"."sale_id" IN (SELECT id FROM sales WHERE customer_id IN (SELECT id FROM customers WHERE name ILIKE '%${esc}%' OR rif ILIKE '%${esc}%'))`),
        { reference_number: { [Op.iLike]: `%${safe}%` } },
      ],
    });
  }

  const where = { [Op.and]: andClauses };

  // Un cobro conjunto son varios Payment —uno por factura, que es lo que exige el documento
  // fiscal— pero un solo movimiento de dinero. Este listado habla de COBROS, así que la
  // unidad es el acto de cobrar: las filas del mismo lote se muestran juntas, con su total.
  // El desglose por factura sigue disponible al abrir el detalle.
  //
  // Se resuelve en dos pasos porque la agrupación tiene que ocurrir ANTES de paginar: primero
  // se listan las unidades del filtro completo (consulta liviana, solo id/lote/fecha), se
  // recortan a la página pedida, y recién entonces se cargan los cobros de esa página con
  // todos sus datos. Agrupar después de paginar partiría lotes entre dos páginas.
  const unidadesRaw = await Payment.findAll({
    where,
    attributes: ["id", "batch_id", "created_at"],
    order: [["created_at", "DESC"]],
    include: [{ model: Sale, attributes: [], required: true, ...(Object.keys(saleWhere).length ? { where: saleWhere } : {}) }],
    raw: true,
    subQuery: false,
  });

  const unidades = [];
  const porLote = new Map();
  for (const p of unidadesRaw) {
    if (!p.batch_id) { unidades.push({ ids: [p.id] }); continue; }
    const yaVista = porLote.get(p.batch_id);
    if (yaVista) { yaVista.ids.push(p.id); continue; }
    const nueva = { ids: [p.id], batch_id: p.batch_id };
    porLote.set(p.batch_id, nueva);
    unidades.push(nueva);
  }

  const count = unidades.length;
  const pagina = unidades.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));
  const idsPagina = pagina.flatMap(u => u.ids);

  const rows = idsPagina.length ? await Payment.findAll({
    where: { id: { [Op.in]: idsPagina } },
    order: [["created_at", "DESC"]],
    subQuery: false,
    include: [
      { model: Customer, attributes: ["name", "rif"], required: false },
      { model: Employee, attributes: ["full_name"], required: false },
      { model: Currency, attributes: ["symbol", "code"], required: false },
      { model: PaymentJournal, attributes: ["name", "color"], required: false },
      {
        model: Sale,
        attributes: ["id", "total", "status", "exchange_rate", "currency_id", "created_at", "invoice_number"],
        required: true,
        ...(Object.keys(saleWhere).length ? { where: saleWhere } : {}),
        include: [
          { model: SaleItem, attributes: ["name", "quantity", "price", "subtotal"] },
          { model: Warehouse, attributes: ["name"], required: false },
        ],
      },
    ],
  }) : [];

  const aItem = (p) => {
    const item = p.toJSON();
    item.customer_name = item.Customer?.name ?? null;
    item.customer_rif = item.Customer?.rif ?? null;
    item.employee_name = item.Employee?.full_name ?? null;
    item.currency_symbol = item.Currency?.symbol ?? null;
    item.currency_code = item.Currency?.code ?? null;
    item.journal_name = item.PaymentJournal?.name ?? null;
    item.journal_color = item.PaymentJournal?.color ?? null;
    item.sale_total = item.Sale?.total ?? null;
    item.sale_status = item.Sale?.status ?? null;
    item.sale_items = item.Sale?.SaleItems ?? [];
    item.invoice_number = item.Sale?.invoice_number ?? null;
    item.warehouse_name = item.Sale?.Warehouse?.name ?? null;
    ["Customer", "Employee", "Currency", "PaymentJournal"].forEach((k) => delete item[k]);
    if (item.Sale) { delete item.Sale.SaleItems; delete item.Sale.Warehouse; }
    return item;
  };

  const porId = new Map(rows.map(p => [p.id, aItem(p)]));

  const data = pagina.map(unidad => {
    const partes = unidad.ids.map(id => porId.get(id)).filter(Boolean);
    if (!partes.length) return null;
    // Cobro corriente: una factura, un pago. Se devuelve tal cual.
    if (partes.length === 1 && !unidad.batch_id) return partes[0];

    // Cobro conjunto: los datos del acto (diario, cliente, fecha, referencia, tasa) son
    // comunes a todas sus partes, así que se toman de la primera; lo único que se suma es
    // el dinero. `items` lleva el desglose para el detalle.
    const primera = partes[0];
    return {
      ...primera,
      amount: partes.reduce((acc, p) => acc + parseFloat(p.amount || 0), 0),
      change_given: partes.reduce((acc, p) => acc + parseFloat(p.change_given || 0), 0) || null,
      group_count: partes.length,
      // Lo que se ve en la columna Referencia: las facturas que cubrió este único cobro.
      invoice_number: partes.map(p => p.invoice_number || `#${p.sale_id}`).join(" · "),
      items: partes.map(p => ({
        payment_id: p.id,
        sale_id: p.sale_id,
        invoice_number: p.invoice_number,
        amount: parseFloat(p.amount || 0),
        sale_status: p.sale_status,
      })),
      // Los ítems de UNA de las facturas no representan al cobro conjunto: se omiten para
      // que el detalle no muestre productos de una sola venta como si fueran de todas.
      sale_items: [],
    };
  }).filter(Boolean);

  // Suma del filtro COMPLETO, no de la página: con 50 registros por página, totalizar solo
  // lo visible daría una cifra que no corresponde a lo que el usuario filtró. Va en moneda
  // base porque es la única común — sumar bolívares con divisas no significaría nada.
  // Mismo where y mismo join required que el listado, o el total no cuadraría con las filas.
  const [totals] = await Payment.findAll({
    where,
    include: [{ model: Sale, attributes: [], required: true, ...(Object.keys(saleWhere).length ? { where: saleWhere } : {}) }],
    attributes: [
      [Sequelize.fn("COALESCE", Sequelize.fn("SUM", Sequelize.col("Payment.amount")), 0), "sum_base"],
      // Bolívares (o la moneda que sea) REALMENTE recibidos: cada cobro a la tasa del día en
      // que se hizo. Es distinto de convertir el total base a la tasa de hoy, que es lo que
      // hacía el pie del listado y por eso no cuadraba con el estado de cuenta del diario.
      [Sequelize.literal(`COALESCE(SUM("Payment"."amount" * COALESCE("Payment"."exchange_rate", 1)), 0)`), "sum_local"],
      // Solo tiene sentido mostrar sum_local si todo el filtro es de una misma moneda: si no,
      // estaría sumando bolívares con divisas.
      [Sequelize.literal(`COUNT(DISTINCT "Payment"."currency_id")`), "currency_count"],
      [Sequelize.literal(`MIN("Payment"."currency_id")`), "currency_id"],
    ],
    raw: true,
    subQuery: false,
  });

  return {
    data,
    total: count,
    sum_base:       parseFloat(totals?.sum_base  || 0),
    sum_local:      parseFloat(totals?.sum_local || 0),
    currency_count: parseInt(totals?.currency_count || 0, 10),
    currency_id:    totals?.currency_id ?? null,
  };
};
