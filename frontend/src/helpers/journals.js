// Un diario (caja, banco) puede pertenecer a una sucursal concreta o ser compartido
// (warehouse_id null, la cuenta de toda la empresa). Casi nunca el mismo banco es la misma
// cuenta en dos tiendas, así que un cajero de la sucursal A no debe poder elegir el diario de
// la B al cobrar: cerraría la venta contra una cuenta que no es la suya.
export function journalsForWarehouse(journals, warehouseId) {
  if (!warehouseId) return journals;
  const wid = parseInt(warehouseId);
  return journals.filter(j => !j.warehouse_id || j.warehouse_id === wid);
}

// Cobro conjunto: las facturas elegidas pueden ser de sucursales distintas (un cliente que
// trae cuentas viejas de dos tiendas y paga todo junto). Ahí no hay una sola sucursal contra
// la que filtrar, así que solo quedan los diarios compartidos —los que sirven a cualquiera—.
export function journalsForSales(journals, sales) {
  const ids = [...new Set((sales || []).map(s => s.warehouse_id).filter(Boolean))];
  if (ids.length <= 1) return journalsForWarehouse(journals, ids[0] ?? null);
  return journals.filter(j => !j.warehouse_id);
}
