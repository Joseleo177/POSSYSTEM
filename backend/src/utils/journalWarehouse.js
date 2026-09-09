const { PaymentJournal, PaymentJournalWarehouse } = require("../models");

// Un diario atiende a una o varias sucursales, o a todas (sin filas en
// payment_journal_warehouses = compartido). Un cobro, pago o reembolso solo puede usar un
// diario que atienda a SU sucursal: si no, el dinero entra o sale de una caja que no es la
// de esa tienda y el arqueo de esa sucursal deja de cuadrar. El filtro de la interfaz ya lo
// evita, pero esto lo hace cumplir aunque la petición venga de un frontend viejo.
//
// `journalIds` acepta un id suelto o una lista (con nulls/repetidos: vuelto sin caja, varios
// tramos); se ignoran los vacíos. `transaction` opcional.
async function assertJournalsInWarehouse(journalIds, warehouseId, transaction = null) {
  const ids = [...new Set(
    (Array.isArray(journalIds) ? journalIds : [journalIds])
      .map(v => parseInt(v, 10))
      .filter(Number.isInteger),
  )];
  if (!ids.length) return;

  // Sin sucursal conocida (venta legada sin almacén, empleado sin almacenes) no hay contra
  // qué validar: se deja pasar, como hacía antes de existir esta comprobación.
  const wid = parseInt(warehouseId, 10);
  if (!Number.isInteger(wid)) return;

  const opts = transaction ? { transaction } : {};

  // Sucursales asignadas a cada diario elegido.
  const rows = await PaymentJournalWarehouse.findAll({
    where: { journal_id: ids },
    attributes: ["journal_id", "warehouse_id"],
    ...opts,
  });
  const asignadas = new Map();               // journal_id -> Set(warehouse_id)
  for (const r of rows) {
    if (!asignadas.has(r.journal_id)) asignadas.set(r.journal_id, new Set());
    asignadas.get(r.journal_id).add(r.warehouse_id);
  }

  // Solo los que tienen sucursales asignadas Y no incluyen la nuestra son un problema.
  const malos = ids.filter(id => asignadas.has(id) && !asignadas.get(id).has(wid));
  if (!malos.length) return;

  const journals = await PaymentJournal.findAll({
    where: { id: malos },
    attributes: ["id", "name"],
    ...opts,
  });
  const nombre = journals[0]?.name || "seleccionado";
  const e = new Error(`El diario "${nombre}" no atiende a esa sucursal`);
  e.status = 400;
  e.isOperational = true;
  throw e;
}

module.exports = { assertJournalsInWarehouse };
