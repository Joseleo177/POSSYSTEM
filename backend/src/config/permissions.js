'use strict';

// Catálogo único de permisos del sistema. Es la fuente de verdad: las rutas piden claves de
// aquí, la migración expande los permisos viejos según este mapa y la pantalla de Roles se
// dibuja a partir de él. Agregar una acción es agregarla acá y usarla en su ruta.
//
// Formato de la clave: "modulo.accion". En el rol se guardan como { "sales.create": true }.
//
// Sobre los módulos sueltos (series, journals, currencies): antes vivían todos dentro de
// `config`, que terminó siendo un segundo administrador —quien lo tenía tocaba la
// numeración fiscal, las cajas, las tasas y los respaldos, además de anular ventas—. Cada
// uno pasa a ser su propio permiso.
//
// Los respaldos no están acá y no es un olvido: el archivo es un pg_dump de la base entera,
// con los datos de todas las empresas dentro. Eso no es concedible desde una empresa, así
// que la pantalla la protege el guard `superuser` (ver middleware/auth.js) y no un permiso.
const MODULES = [
  {
    key: 'sales',
    label: 'Ventas (POS)',
    actions: [
      { key: 'view',     label: 'Ver ventas' },
      { key: 'create',   label: 'Cobrar / facturar' },
      { key: 'edit',     label: 'Editar cuenta abierta' },
      { key: 'void',     label: 'Anular venta' },
      { key: 'credit',   label: 'Entregar a crédito' },
      { key: 'forgive',  label: 'Exonerar saldo por cobrar' },
      { key: 'return',   label: 'Devoluciones y canjes' },
      { key: 'cash',     label: 'Abrir y cerrar caja' },
    ],
  },
  {
    key: 'products',
    label: 'Catálogo / Productos',
    actions: [
      { key: 'view',   label: 'Ver catálogo' },
      { key: 'create', label: 'Crear productos' },
      { key: 'edit',   label: 'Editar productos y precios' },
      { key: 'delete', label: 'Eliminar productos' },
    ],
  },
  {
    key: 'customers',
    label: 'Clientes y proveedores',
    actions: [
      { key: 'view',   label: 'Ver contactos' },
      { key: 'create', label: 'Crear contactos' },
      { key: 'edit',   label: 'Editar contactos' },
      { key: 'delete', label: 'Eliminar contactos' },
      { key: 'credit', label: 'Ajustar y devolver crédito' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventario',
    actions: [
      { key: 'view',     label: 'Ver existencias' },
      { key: 'adjust',   label: 'Ajustar stock' },
      { key: 'transfer', label: 'Despachar transferencias' },
      { key: 'receive',  label: 'Recibir transferencias' },
      // Crear, editar y borrar almacenes, y asignar usuarios a ellos, NO figuran aquí a
      // propósito: son de `admin` y nada más. La razón está en la ruta de asignación —quien
      // reparte los almacenes se los puede repartir a sí mismo—, así que ofrecerlo como
      // permiso marcable sería tender la trampa en la propia pantalla de Roles.
    ],
  },
  {
    key: 'purchases',
    label: 'Compras',
    actions: [
      { key: 'view',    label: 'Ver órdenes' },
      { key: 'create',  label: 'Crear órdenes' },
      { key: 'edit',    label: 'Editar y confirmar' },
      { key: 'receive', label: 'Recibir mercancía' },
      { key: 'pay',     label: 'Pagar a proveedor' },
      { key: 'delete',  label: 'Eliminar órdenes' },
    ],
  },
  {
    key: 'accounting',
    label: 'Contabilidad',
    actions: [
      { key: 'view',    label: 'Ver movimientos' },
      { key: 'income',  label: 'Registrar ingresos' },
      { key: 'expense', label: 'Registrar egresos' },
      { key: 'void',    label: 'Anular movimientos' },
      { key: 'delete',  label: 'Eliminar movimientos' },
    ],
  },
  {
    key: 'reports',
    label: 'Reportes',
    actions: [
      { key: 'view',  label: 'Ver reportes y tablero' },
      { key: 'audit', label: 'Ver auditoría' },
    ],
  },
  {
    key: 'employees',
    label: 'Usuarios de su sucursal',
    actions: [
      { key: 'view',   label: 'Ver usuarios' },
      { key: 'create', label: 'Crear usuarios' },
      { key: 'edit',   label: 'Editar usuarios' },
      { key: 'delete', label: 'Eliminar usuarios' },
    ],
  },
  {
    key: 'series',
    label: 'Series fiscales',
    actions: [
      { key: 'view',   label: 'Ver series' },
      { key: 'manage', label: 'Crear, editar y asignar rangos' },
    ],
  },
  {
    key: 'journals',
    label: 'Cajas, bancos y métodos de pago',
    actions: [
      { key: 'view',   label: 'Ver cajas y bancos' },
      { key: 'manage', label: 'Crear y editar' },
    ],
  },
  {
    key: 'currencies',
    label: 'Monedas y tasas',
    actions: [
      { key: 'view',   label: 'Ver monedas' },
      { key: 'manage', label: 'Editar tasas y monedas' },
    ],
  },
  {
    key: 'config',
    label: 'Configuración general',
    actions: [
      { key: 'view', label: 'Ver configuración' },
      { key: 'edit', label: 'Editar configuración' },
    ],
  },
];

// Todas las claves válidas, para validar lo que llega desde la pantalla de Roles.
const ALL_KEYS = MODULES.flatMap(m => m.actions.map(a => `${m.key}.${a.key}`));

// Cómo se traduce cada permiso viejo (booleano por módulo) al conjunto nuevo. Se usa en la
// migración y como red de compatibilidad en `permit`, para que un rol sin migrar —o creado
// por una versión anterior— siga funcionando igual que antes.
//
// `config` era un comodín: se expande a todo lo que de hecho abría, para que nadie pierda
// acceso de un día para el otro. Recortarlo es una decisión que se toma desde la pantalla,
// no algo que deba pasar solo.
//
// 'sales.forgive' a propósito NO aparece en ningún LEGACY_MAP: cerrar una factura sin cobrarla
// es una facultad nueva y nadie debe heredarla en silencio por tener el viejo `sales` o
// `config`. De entrada solo la tiene el administrador (permissions.all); al resto se le da
// desde la pantalla de Roles, con el tope de `forgive_limit` como barandilla.
const LEGACY_MAP = {
  // permit("sales", ...) aparecía en: cobrar, anular, crédito, devoluciones, caja, y además
  // en crear/editar clientes, ajustar su crédito y registrar cobros.
  sales: [
    'sales.view', 'sales.create', 'sales.edit', 'sales.void', 'sales.credit', 'sales.return', 'sales.cash',
    'customers.view', 'customers.create', 'customers.edit', 'customers.credit',
  ],

  // permit("products", ...) cubría catálogo, promociones y categorías, y también toda la
  // gestión de compras —incluido eliminarlas, que iba con permit("admin","products")—.
  products: [
    'products.view', 'products.create', 'products.edit',
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive', 'purchases.pay', 'purchases.delete',
  ],

  customers: [
    'customers.view', 'customers.create', 'customers.edit',
    // permit("sales", "customers", "config") en el registro de cobros.
    'sales.create',
  ],

  // permit("products", "inventory") en compras; permit("inventory", "admin", "config") en
  // stock, transferencias y sesiones de ajuste.
  inventory: [
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.receive',
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive', 'purchases.pay',
    'reports.view',
  ],
  inventory_view: ['inventory.view'],

  purchases: [
    'purchases.view', 'purchases.create', 'purchases.edit', 'purchases.receive', 'purchases.pay',
  ],

  accounting: ['accounting.view', 'accounting.income', 'accounting.expense', 'accounting.void'],

  // permit("sales", "reports", "config") en pagos y estadísticas de venta.
  reports: ['reports.view', 'sales.view', 'accounting.view'],

  employees: ['employees.view', 'employees.create', 'employees.edit', 'employees.delete'],

  // `config` era un segundo administrador: 37 rutas lo aceptaban. Se expande a todo lo que
  // de hecho abría. Que deje de abrir tanto es una decisión para tomar desde la pantalla de
  // Roles, no algo que la migración deba imponer de un día para el otro.
  config: [
    'config.view', 'config.edit',
    'series.view', 'series.manage',
    'journals.view', 'journals.manage',
    'currencies.view', 'currencies.manage',
    'reports.view', 'reports.audit',
    'accounting.view', 'accounting.income', 'accounting.expense', 'accounting.void', 'accounting.delete',
    'sales.view', 'sales.create', 'sales.edit', 'sales.void', 'sales.credit', 'sales.cash',
    'products.view', 'products.create', 'products.edit',
    'customers.view', 'customers.create', 'customers.edit', 'customers.credit',
    'inventory.view', 'inventory.adjust', 'inventory.transfer', 'inventory.receive',
  ],
};

// Expande un objeto de permisos viejo al formato nuevo. Los que ya vienen en formato
// "modulo.accion" se conservan tal cual.
function expandLegacy(permissions = {}) {
  if (permissions.all) return { all: true };

  const out = {};
  for (const [key, value] of Object.entries(permissions)) {
    if (!value) continue;
    if (key.includes('.')) { out[key] = true; continue; }   // ya es del formato nuevo
    for (const nueva of (LEGACY_MAP[key] || [])) out[nueva] = true;
  }
  return out;
}

module.exports = { MODULES, ALL_KEYS, LEGACY_MAP, expandLegacy };