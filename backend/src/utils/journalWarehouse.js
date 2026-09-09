const { PaymentJournal } = require("../models");

// Un diario pertenece a una sucursal concreta o es compartido (warehouse_id NULL = cuenta de
// toda la empresa). Un cobro, pago o reembolso solo puede usar un diario compartido o el de
// SU sucursal: si no, el dinero entra o sale de una caja que no es la de esa tienda y el
// arqueo de esa sucursal deja de cuadrar. El filtro de la interfaz ya lo evita, pero esto lo
// hace cumplir aunque la petición venga de un frontend viejo o armada a mano.
//
// `journalIds` acepta un id suelto o una lista (con nulls/repetidos: vuelto sin caja, varios
// tramos); se ignoran los vacíos y se consulta una sola vez. `transaction` opcional.
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

  const journals = await PaymentJournal.findAll({
    where: { id: ids },
    attributes: ["id", "name", "warehouse_id"],
    ...(transaction ? { transaction } : {}),
  });

  for (const j of journals) {
    if (j.warehouse_id != null && j.warehouse_id !== wid) {
      const e = new Error(`El diario "${j.name}" es de otra sucursal`);
      e.status = 400;
      e.isOperational = true;
      throw e;
    }
  }
}

module.exports = { assertJournalsInWarehouse };
