// Un diario (caja, banco) atiende a una o varias sucursales, o a todas —`warehouse_ids`
// vacío = compartido, la cuenta de toda la empresa—. Un cajero de la sucursal A no debe
// poder elegir al cobrar un diario que solo atiende a la B: cerraría la venta contra una
// caja que no es la suya.
function sirveEnSucursal(journal, wid) {
  const ids = journal.warehouse_ids;
  if (!Array.isArray(ids) || ids.length === 0) return true;   // compartido: todas
  return ids.includes(wid);
}

export function journalsForWarehouse(journals, warehouseId) {
  if (!warehouseId) return journals;
  const wid = parseInt(warehouseId);
  return (journals || []).filter(j => sirveEnSucursal(j, wid));
}

// Cobro conjunto: las facturas elegidas pueden ser de sucursales distintas (un cliente que
// trae cuentas viejas de dos tiendas). Ahí solo caben los diarios que atienden a TODAS las
// sucursales implicadas (los compartidos siempre cuentan).
export function journalsForSales(journals, sales) {
  const ids = [...new Set((sales || []).map(s => s.warehouse_id).filter(Boolean))].map(Number);
  if (ids.length <= 1) return journalsForWarehouse(journals, ids[0] ?? null);
  return (journals || []).filter(j => ids.every(id => sirveEnSucursal(j, id)));
}
