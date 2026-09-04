'use strict';

// Métodos de pago y caja con los que nace una empresa, por el mismo motivo que las categorías
// (ver defaultCategories.js): sin ellos la empresa no arranca.
//
// Aquí el motivo es más estricto todavía. El `type` de un diario no es una lista cerrada: se
// rellena con el `code` de un método de pago que alguien escribe a mano, y media aplicación
// compara ese texto contra la cadena literal 'efectivo' — la apertura de caja solo ofrece
// diarios de ese tipo, `isCash` decide con él si pedir número de referencia, y el arqueo
// cuadra por él. Un método creado como "EFECT" queda en `efect` y deja la empresa sin poder
// abrir caja, sin ningún aviso que explique por qué.
//
// Peor aún: `updateMethod` no permite cambiar el `code`, así que un método mal escrito no se
// corrige desde la pantalla. Sembrarlos bien de entrada es la única forma de que ese error no
// dependa de que quien da de alta la empresa escriba la palabra exacta.
//
// CASH_CODE es esa palabra. Si algún día se deja de comparar por cadena, este es el hilo del
// que tirar.
const CASH_CODE = 'efectivo';

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Efectivo',      code: CASH_CODE,     color: '#22c55e', sort_order: 1 },
  { name: 'Pago Móvil',    code: 'pago_movil',  color: '#6366f1', sort_order: 2 },
  { name: 'Transferencia', code: 'transferencia', color: '#0ea5e9', sort_order: 3 },
  { name: 'Punto de Venta', code: 'punto_venta', color: '#f59e0b', sort_order: 4, allows_outflow: false },
  { name: 'Zelle',         code: 'zelle',       color: '#a855f7', sort_order: 5 },
];

// La caja con la que se abre el turno el primer día. Va sin `warehouse_id` (NULL = compartida
// entre sucursales) porque el alta todavía no crea almacenes: en cuanto la empresa tenga los
// suyos, se reasigna desde Contabilidad.
const DEFAULT_CASH_JOURNAL = { name: 'Caja Principal', type: CASH_CODE, color: '#22c55e', sort_order: 1 };

module.exports = { CASH_CODE, DEFAULT_PAYMENT_METHODS, DEFAULT_CASH_JOURNAL };
