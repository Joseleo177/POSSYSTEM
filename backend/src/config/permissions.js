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
      // Solo gobierna el botón (y el F5) del POS. El listado sale de GET /sales, que sigue
      // bajo sales.view porque es el mismo que usa la pantalla de Ventas.
      { key: 'pending',  label: 'Ver facturas pendientes en el POS' },
      { key: 'create',   label: 'Cobrar / facturar' },
      // Descuento global y por línea. El tope para quien no es administrador sale de
      // Configuración → Punto de venta (discount_max_pct).
      { key: 'discount', label: 'Dar descuentos' },
      // Cobrar las divisas por encima de la tasa oficial (ver services/sales/fxRate.js). No
      // pasa por el tope de descuentos: la diferencia la fija la tasa que se teclea.
      { key: 'fx',       label: 'Cobrar a tasa de divisas' },
      // Entregar efectivo de la caja contra un pago por punto o pago móvil con comisión (ver
      // services/cashAdvances). Saca billetes de la gaveta: facultad nueva, solo el admin de
      // entrada.
      { key: 'advance',  label: 'Dar avances de efectivo' },
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
      // Subir extractos y casarlos con cobros, ingresos y egresos. Registra comisiones y
      // movimientos desde el extracto, así que se concedió a quien ya registraba egresos. No
      // va en ningún LEGACY_MAP: es una facultad nueva y nadie la hereda en silencio.
      { key: 'reconcile', label: 'Conciliar bancos' },
      // Decir que el pago que reportó un cliente desde el catálogo está (o no) en el banco. Lo
      // que casa con un extracto se confirma solo; esto es para revisarlo a mano. Se concedió a
      // quien ya conciliaba (migración 20261101150000-pedidos-web-entrega-pago).
      { key: 'confirm',   label: 'Confirmar pagos reportados por clientes' },
    ],
  },
  {
    // Módulo Fábrica: solo aparece en empresas con companies.fabrica_enabled (ver
    // routes/factory.js). No va en ningún LEGACY_MAP: es nuevo y nadie lo hereda.
    key: 'factory',
    label: 'Fábrica',
    actions: [
      { key: 'view',    label: 'Ver órdenes y láminas' },
      { key: 'manage',  label: 'Registrar láminas, órdenes y devoluciones' },
      // Aparte porque consume un correlativo de la serie fiscal.
      { key: 'invoice', label: 'Facturar órdenes' },
    ],
  },
  {
    // Pantalla de cocina: solo aparece en empresas con companies.cocina_enabled (ver
    // routes/kitchen.js). Es nuevo, así que tampoco va en ningún LEGACY_MAP.
    key: 'kitchen',
    label: 'Cocina',
    actions: [
      { key: 'view',   label: 'Ver comandas' },
      { key: 'manage', label: 'Marcar comandas (en preparación, lista, entregada)' },
    ],
  },
  {
    // Producción de cocina (app Recetas): registrar las tandas de las preparaciones (la olla de
    // sopa, la salsa). Mismo interruptor de restaurante. Se concedió por migración a quien ya
    // marcaba comandas o ajustaba inventario: producir es mover inventario.
    key: 'production',
    label: 'Producción de cocina',
    actions: [
      { key: 'view',   label: 'Ver la producción' },
      { key: 'manage', label: 'Registrar y anular producción (ollas, salsas)' },
    ],
  },
  {
    // Mapa de mesas: va con el mismo interruptor de restaurante (companies.cocina_enabled).
    // Ver el mapa se concedió por migración a quien ya cobraba; el plano solo lo edita quien
    // lo reciba aparte.
    key: 'tables',
    label: 'Mesas',
    actions: [
      { key: 'view',   label: 'Ver el mapa de mesas' },
      // Lo del mesonero: abrir mesas, sumar rondas y mandarlas a cocina. No cobra: eso sigue
      // siendo sales.create, que el rol Mesonero no tiene.
      { key: 'serve',  label: 'Tomar pedidos en las mesas' },
      { key: 'layout', label: 'Editar el plano (áreas y mesas)' },
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
    'sales.view', 'sales.pending', 'sales.create', 'sales.discount', 'sales.edit', 'sales.void', 'sales.credit', 'sales.return', 'sales.cash',
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
  reports: ['reports.view', 'sales.view', 'sales.pending', 'accounting.view'],

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
    'sales.view', 'sales.pending', 'sales.create', 'sales.discount', 'sales.edit', 'sales.void', 'sales.credit', 'sales.cash',
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