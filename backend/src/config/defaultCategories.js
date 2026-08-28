'use strict';

// Juegos de categorías con los que nace una empresa. Son el punto de partida: cada empresa
// las edita, desactiva o amplía desde Contabilidad, y no se comparten entre empresas.
//
// Nacieron como el seed de las migraciones que crearon `expense_categories` (20260414000000)
// e `income_categories` (20260525000001), cuando la instalación era de una sola empresa. Al
// pasar a multi-empresa ese seed dejó de alcanzar: solo cubría a la primera. Aquí quedan en
// un solo sitio para que el alta de empresa las siembre siempre.
//
// Las migraciones NO importan este archivo a propósito: llevan su propia copia literal, para
// que una migración ya aplicada no cambie de comportamiento si mañana se edita esta lista.

const DEFAULT_EXPENSE_CATEGORIES = [
  'Servicios Básicos',
  'Alquiler',
  'Nómina / Personal',
  'Impuestos',
  'Mantenimiento',
  'Transporte',
  'Suministros',
  'Otros',
];

const DEFAULT_INCOME_CATEGORIES = [
  'Ventas Externas',
  'Transferencia de Cuentas',
  'Préstamo / Capital',
  'Devolución de Proveedor',
  'Comisiones',
  'Otros',
];

module.exports = { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES };