'use strict';

// Referencia de un egreso tal como se le muestra al usuario.
//
// Los pagos a proveedor guardan en `expenses.reference` una clave interna con la que el
// sistema los vuelve a encontrar (`purchase_payment:<id del pago>`, o
// `purchase_batch:<lote>` en un pago conjunto). Sirve para enlazar, no para leer: en Egresos
// aparecía tal cual, rompiendo la numeración de la columna (#93, #92, purchase_batch:91bd…).
// Se oculta y el egreso cae en su número como cualquier otro —`#id` en Egresos, `EGR-id` en
// los movimientos del diario—; a qué compras corresponde ya lo dice la descripción.
// Las referencias tecleadas a mano pasan igual.
const expenseRefSql = (alias = 'e') => `(CASE
  WHEN ${alias}.reference LIKE 'purchase_payment:%' OR ${alias}.reference LIKE 'purchase_batch:%' THEN NULL
  ELSE ${alias}.reference
END)`;

module.exports = { expenseRefSql };
