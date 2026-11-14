const { Serie, SerieRange, Sale, Sequelize } = require("../../models");

// Asigna el correlativo fiscal a una venta que todavía no lo tiene y consume el número
// del rango activo de su serie.
//
// Vivía dentro de createPayment, lo que ataba el número de factura al primer pago. Eso
// funciona para el contado, pero deja sin correlativo a una venta entregada a crédito:
// mercancía que salió, factura que el cliente necesita, y que no puede esperar al pago.
// Al extraerlo, tanto el cobro como la confirmación a crédito usan la misma lógica.
//
// Debe llamarse SIEMPRE dentro de una transacción: bloquea el rango para que dos cajas
// no tomen el mismo número.
module.exports = async function assignInvoiceNumber(sale, transaction) {
  if (sale.invoice_number) return sale.invoice_number;

  // Antes esto devolvía null en silencio y la venta seguía su curso hasta 'pagado' sin
  // número de factura — un documento fiscal sin correlativo, y sin ningún aviso de que
  // algo había fallado. Toda venta creada desde el POS lleva serie obligatoria, así que
  // llegar aquí sin ella significa que algo la creó saltándose esa regla: es un error, no
  // un caso válido, y tiene que verse.
  if (!sale.serie_id) {
    throw Object.assign(
      new Error(`La venta #${sale.id} no tiene serie asignada y no puede facturarse. Asígnale una serie antes de cobrarla.`),
      { status: 400 }
    );
  }

  const serie = await Serie.findByPk(sale.serie_id, { transaction });
  if (!serie || !serie.active) return null;

  const activeRange = await SerieRange.findOne({
    where: {
      serie_id: sale.serie_id,
      active: true,
      current_number: { [Sequelize.Op.lte]: Sequelize.col('end_number') },
    },
    order: [['start_number', 'ASC']],
    lock: true,
    transaction,
  });
  if (!activeRange) throw new Error(`Serie "${serie.name}" agotada. Añade un nuevo rango en Contabilidad.`);

  const correlativeNumber = activeRange.current_number;
  const invoiceNumber = `${serie.prefix}-${String(correlativeNumber).padStart(serie.padding, '0')}`;
  const nextNumber = correlativeNumber + 1;

  // El índice único (company_id, invoice_number) rechaza un número repetido, pero Sequelize lo
  // reporta como un "Validation error" que no le dice nada al cajero. Pasa cuando el rango
  // apunta a números ya emitidos: otra serie de la empresa con el mismo prefijo, o un rango
  // consumido que se borró y se volvió a crear. Se avisa con el número y la factura que lo tiene.
  const usada = await Sale.findOne({
    where: { company_id: sale.company_id, invoice_number: invoiceNumber, id: { [Sequelize.Op.ne]: sale.id } },
    attributes: ['id', 'serie_id'],
    transaction,
  });
  if (usada) {
    const otra = usada.serie_id && usada.serie_id !== serie.id
      ? await Serie.findByPk(usada.serie_id, { attributes: ['name'], transaction })
      : null;
    throw Object.assign(
      new Error(
        `El correlativo ${invoiceNumber} de la serie "${serie.name}" ya lo tiene la venta #${usada.id}` +
        `${otra ? ` (serie "${otra.name}", mismo prefijo)` : ''}. ` +
        `Revisa los rangos y el prefijo de la serie en Contabilidad antes de cobrar.`
      ),
      { status: 409, isOperational: true }
    );
  }

  await activeRange.update(
    nextNumber > activeRange.end_number ? { current_number: nextNumber, active: false } : { current_number: nextNumber },
    { transaction }
  );
  await sale.update(
    { invoice_number: invoiceNumber, correlative_number: correlativeNumber, serie_range_id: activeRange.id },
    { transaction }
  );
  sale.invoice_number = invoiceNumber;

  return invoiceNumber;
};
