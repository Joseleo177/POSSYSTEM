'use strict';

// Manual de NXUS para el asistente. BORRADOR del 20-11-2026, armado a partir de las pantallas,
// los guiones de los videos tutoriales y las reglas del sistema: hay que revisarlo con el uso.
//
// Es un módulo JS (y no un .md) para que Vercel lo empaquete sin configurar includeFiles.
// Cada cambio aquí invalida la caché de DeepSeek durante unos minutos: no pasa nada, solo cuesta
// un poco más hasta que se vuelve a llenar.
//
// Regla para editarlo: describir solo lo que existe. Lo que el manual no dice, el asistente
// responde que no lo sabe; eso es mejor que un paso inventado.

// La parte común va primero y es igual para todas las tiendas (se cachea una sola vez). Los
// módulos extra van aparte, en MODULOS, y solo se le mandan a la tienda que los tiene encendidos:
// ahorra tokens y evita explicar pantallas que la tienda no ve.
const BASE = `
# Cómo está organizado NXUS

El menú tiene estas secciones (cada usuario ve solo las que su rol le permite):
- Dashboard (en el teléfono: Inicio): resumen del negocio. Requiere el permiso de reportes.
- Venta (POS): la caja.
- Catálogo: productos, categorías, promociones y adicionales.
- Contactos: clientes y proveedores.
- Inventario / Sucursales: existencias (Stock), movimientos manuales (ajustes), transferencias y movimientos.
- Compras: órdenes de compra a proveedores.
- Contabilidad: pestañas Movimientos (Estado de Cuenta, Ingresos, Egresos), Ventas (Facturas, Notas de Crédito, Cotizaciones), Cuentas (por cobrar y por pagar), Pagos, Conciliación y Configuración.
- Reportes: Ventas, Márgenes, Inventario, Cuentas por cobrar, Ingresos y egresos, Diarios de pago (cajas), Compras, Clientes, Mermas, Vencimientos, Auditoría, y los libros fiscales (Libro de ventas, Libro de compras, Declaración de IVA) si la tienda factura con IVA.
- Empleados (en el teléfono: Usuarios): usuarios, roles y permisos.
- Monedas: monedas y tasas de cambio.
- Configuración: datos de la empresa, punto de venta, impresión y demás ajustes.

Módulos extra que solo aparecen si la tienda los tiene contratados: Agenda (citas), Pedidos (pedidos del catálogo web), Fábrica, Cocina, Recetas, Mesas, Comisiones, Propinas y Cobranza por sectores. Si alguien pregunta por uno de estos y no lo ve en su menú, es porque la tienda no lo tiene activo o su usuario no tiene el permiso: debe hablar con el administrador de la tienda o con NXUS.

Al entrar, si el usuario trabaja en varias sucursales, el sistema le pide elegir la sucursal de trabajo. Las ventas, la caja y los reportes se hacen sobre esa sucursal.

Montos: el sistema trabaja con una moneda base (se muestra como "Ref.") y la moneda local (Bs.). Las cantidades por unidad son enteras; por kilo, litro o metro admiten hasta 3 decimales.

# Permisos: "no veo un botón" o "no me deja"

Cada usuario tiene un rol (Administrador, Cajero, etc.) con permisos concretos, como "Anular venta", "Dar descuentos", "Ajustar stock" o "Ver reportes". Además, el administrador puede dar o quitar permisos a una persona en particular: en Empleados, el icono de la llave junto al usuario.
Si un usuario no ve un botón o le sale "Sin permiso para esta acción", el administrador de la tienda debe darle ese permiso en Empleados (por el rol o con la llave del usuario). Después de cambiar permisos, el usuario debe recargar la página (o cerrar y abrir la app) para verlos.
Los usuarios que no son administradores solo ven las sucursales que tienen asignadas.

# Abrir el turno (caja)

1. Entra a Venta (POS). Si no hay turno abierto, aparece la ventana "Abrir turno".
2. Revisa la sucursal y el cajero.
3. Escribe el fondo inicial de cada caja (el efectivo con que arrancas). Apaga las cajas que no vas a usar en este turno ("No se usa").
4. Presiona Abrir turno.
También existe "Continuar sin abrir caja", pero sin turno abierto no se pueden registrar cobros en efectivo de la gaveta ni avances.

# Hacer una venta en la caja

Atajos de teclado de la caja: F1 Buscar producto, F2 Cliente, F3 Cuentas en espera, F4 Pausar, F5 Pendientes, F6 Devolución, F7 Vendedor (si la tienda usa comisiones), F10 Cobrar.
1. Busca el producto (F1) por nombre o código, o escanéalo con el lector. Tócalo para agregarlo. Puedes cambiar la cantidad tocando la línea.
2. Si hace falta, elige el cliente (F2). Para pausar la cuenta (F4) no hace falta cliente; para cobrar sí se pide.
3. Presiona Finalizar venta (o F10). Se abre la revisión del pedido: ahí puedes revisar las líneas y, si tienes permiso, dar descuento (hay un tope para quien no es administrador, que se fija en Configuración, Punto de venta).
4. Presiona Facturar.
5. En la confirmación, presiona Cobrar ahora. Elige cómo paga (efectivo, punto de venta, pago móvil, transferencia, etc.), luego el banco o la moneda, y la caja. Si paga con varias formas, usa "Combinar con otra forma de pago". Confirma el pago.
6. Si el cliente no paga en ese momento y tienes el permiso "Entregar a crédito", la factura queda pendiente por cobrar a su nombre.

Cuentas en espera y pendientes:
- Pausar (F4) guarda la cuenta para seguirla después; F3 muestra las cuentas en espera.
- Pendientes (F5) muestra las facturas que quedaron sin cobrar o con abono, para cobrarlas desde la caja.

# Cobrar en divisas a otra tasa

Sirve cuando recibes el dólar a una tasa más alta que la del sistema.
1. Agrega los productos y presiona Finalizar venta.
2. En la revisión del pedido, activa Cobro en divisas y escribe la tasa a la que recibes el dólar (tiene que ser mayor que la del sistema; debajo te recuerda cuál es).
3. El total muestra cuánto paga el cliente en divisas a esa tasa. Presiona Facturar.
4. Cobrar ahora, elige Efectivo y la caja en dólares. Si paga una parte en bolívares, usa Combinar con otra forma de pago; al menos una parte debe ser en dólares.
Es solo de contado: si la factura queda a crédito, queda a precio normal. Si no ves la opción, el administrador debe activarla en Configuración y darte el permiso "Cobrar a tasa de divisas".

# Avance de efectivo

Un avance es cuando el cliente se lleva billetes de tu caja y los paga por punto de venta o pago móvil con una comisión encima. Ejemplo: quiere 1000 Bs. en efectivo con 10 % de comisión: pasa 1100 por el punto y le entregas 1000.
Con una compra:
1. Agrega los productos y presiona Finalizar venta.
2. En la revisión del pedido, activa Avance de efectivo, escribe cuánto efectivo quiere y revisa la comisión sugerida.
3. Abajo ves lo que debe pasar por el punto (factura más avance con comisión). Presiona Facturar: la factura queda solo con lo que compró; el avance va aparte, sin factura.
4. Cobrar ahora, elige Punto de venta y el banco. El monto ya viene completo. Confirma y entrega los billetes que indica el sistema.
Sin compra: presiona el botón Avance en la caja, escribe el monto, revisa la comisión, elige de qué caja salen los billetes y cómo paga el cliente, y confirma.
Queda en Contabilidad, Pagos, marcado "Con avance de efectivo". En el cierre de turno los billetes entregados se descuentan solos de la gaveta. Se paga por punto o pago móvil, nunca en efectivo, y requiere turno abierto y el permiso "Dar avances de efectivo".

# Devoluciones y cambios

Devolución (el cliente regresa el producto):
1. En la caja presiona Devolución (F6).
2. Busca la factura por número, nombre del cliente o cédula (o escanea el ticket) y presiona Devolver.
3. Indica cuánto devuelve de cada producto y, si quieres, el motivo.
4. Decide qué hacer con el dinero: dejarlo como saldo a favor para su próxima compra, reembolsarlo (eliges de qué caja sale) o no devolverlo.
5. Presiona Devolver y confirma. Queda una nota de crédito (se puede imprimir) y la mercancía vuelve sola al inventario.
Cambio de producto: igual, pero en la ventana elige la pestaña Cambio de producto, indica lo que devuelve y en Producto de reemplazo busca lo que se lleva. Presiona Confirmar cambio. Si lo nuevo cuesta más, queda una diferencia por cobrar: presiona Cobrar y elige cómo paga.
Requiere el permiso "Devoluciones y canjes".

# Anular una venta

Las facturas, notas de crédito y series fiscales nunca se borran: se anulan, para que quede el registro. Para anular una venta se necesita el permiso "Anular venta": ve a Contabilidad, pestaña Ventas, Facturas; busca la factura y presiona el icono Anular (la papelera) de su fila, y confirma. Una factura ya devuelta no se puede anular. Las notas de crédito y las cotizaciones están en la misma pestaña Ventas.

# Cerrar el turno (arqueo)

1. En la caja, presiona Cerrar turno.
2. La ventana "Cierre de turno" muestra por cada caja lo que debería haber: fondo inicial + cobros en efectivo + ingresos manuales − egresos y vueltos − avances de efectivo.
3. Cuenta lo que hay en cada gaveta y anótalo en Conteo real. El sistema muestra la diferencia (cuadre de efectivo).
4. Si quieres, deja una nota para quien revise el cierre, y presiona Cerrar.
Cada cobro cuenta en el turno de quien lo registró. Si hay ventas guardadas sin conexión esperando subir, el cierre se bloquea hasta que se sincronicen.

# Cobrar a un cliente que debe

- Desde la caja: Pendientes (F5), elige la factura y cobra.
- Desde Contactos: abre el cliente; en su ficha ves el Estado de cuenta con sus facturas abiertas. Presiona Cobrar en una factura, o "Cobrar juntas" para cobrar varias facturas con un solo pago (se reparte de la más antigua a la más reciente). Indica cómo paga, el monto recibido y la fecha del cobro.
- Si el cliente entrega más de lo que debe, el sistema lo indica y puedes dejarlo como saldo a favor o dar el vuelto.
- Las cuentas por cobrar y por pagar de todo el negocio están en Contabilidad, pestaña Cuentas, y en Reportes, Cobrar.

Exonerar un saldo: si decides no cobrar lo que queda de una factura, en la ficha del cliente usa "Exonerar saldo". Cierra la factura sin cobrarla, sin mover dinero ni inventario. Requiere el permiso "Exonerar saldo por cobrar".

Deuda anterior: para cargar lo que un cliente debía antes de usar el sistema, en su ficha usa "Cargar deuda" (Deuda anterior). No cuenta como venta. Requiere el permiso "Cargar deudas anteriores".

# Productos (Catálogo)

- Crear: Catálogo, Productos, Nuevo producto. Nombre, categoría, unidad (unidad, kilo, litro, metro), precio, costo, código de barras y existencia mínima. Tipos: Normal, Servicio (no lleva inventario) y Combo (descuenta los productos que lo forman).
- Editar precio: abre el producto y cambia el precio. Cada sucursal puede tener su propio precio; si no lo tiene, usa el del producto.
- Cargar muchos productos: botón Importar, que usa una plantilla de Excel.
- Categorías y Promociones tienen sus propias pestañas dentro de Catálogo.
- Variantes (tallas, colores): el producto modelo agrupa a sus variantes; lo que se vende y lleva existencia son las variantes.
Crear y editar requieren los permisos "Crear productos" y "Editar productos y precios".

# Inventario

- Ver existencias: Inventario / Sucursales, elige la sucursal o almacén y entra a Stock.
- Ajustar existencias (conteos, pérdidas, mermas): todo ajuste se hace dentro de una sesión de ajustes. En el movimiento manual de la sucursal presiona Abrir sesión, registra las entradas o salidas de cada producto con su motivo y, al terminar, cierra la sesión. Requiere el permiso "Ajustar stock".
- Transferir entre sucursales: en Transferencias presiona Despachar transferencia, elige origen, destino y productos. La sucursal destino la recibe (permiso "Recibir transferencias") y ahí entra la mercancía. Una transferencia se puede anular.
- Movimientos: historial de entradas y salidas. Cada producto tiene su kardex, armado con los documentos que movieron su existencia (ventas, compras, ajustes, transferencias, devoluciones).
- Los depósitos (almacenes que no venden) solo aparecen en Inventario, Transferencias y Compras.

# Compras a proveedores

1. Compras, Nueva orden. Elige el proveedor, el almacén destino, la moneda de la factura y su tasa, y agrega los productos con cantidad y costo. Puedes indicar empaque (caja, bulto) y unidades por empaque; también el precio de venta o el margen sugerido. El costo debe ser mayor que cero.
2. Cuando llega la mercancía, abre la orden y presiona Recibir mercancía (puedes anotar lote y vencimiento). Ahí entra al inventario.
3. Para pagar al proveedor, abre la orden y registra el pago: monto, de qué caja sale, fecha y referencia. Puedes pagar varias facturas del mismo proveedor de una vez (se reparte primero a la que vence antes).
Si el proveedor entrega factura fiscal, se carga con su número de factura, número de control y RIF para el Libro de compras.

Cargar la compra desde una foto (lo hace Asta): Compras, Nueva orden, botón "Desde foto" (o "cárgala desde la foto de la factura"). Se toma la foto de la factura, nota de entrega o ticket del proveedor; si es largo, varias fotos de arriba a abajo (hasta 4). La foto tiene que ir derecha: si salió acostada, usa "Girar" antes de leer. Asta lee los productos, los busca en el catálogo y muestra una revisión: si las líneas cuadran con el total del papel, qué producto es cada línea (si no lo encuentra, ofrece parecidos, "Buscar otro" o "Crear producto"), la presentación (caja, bulto) con las unidades que trae y el costo. "Pasar a la orden" llena la orden; después se guarda el borrador como siempre y la mercancía entra al presionar Recibir mercancía. Lo que se empareja una vez, Asta lo recuerda para la próxima factura de ese proveedor. Leer un documento gasta 5 consultas del cupo de Asta y requiere el permiso de crear compras.

# Ingresos y egresos (gastos)

En Contabilidad, pestaña Movimientos (que tiene Estado de Cuenta, Ingresos y Egresos): en Egresos, Registrar egreso para un gasto (alquiler, servicios, sueldos, etc.); en Ingresos, Registrar ingreso para dinero que entra sin ser una venta. Indica categoría, monto, de qué caja sale o a cuál entra, y la fecha. Requieren los permisos "Registrar egresos" o "Registrar ingresos". Anular uno requiere "Anular movimientos".

# Tasas de cambio

En Monedas se ven las monedas y su tasa. "Sincronizar tasas" trae la tasa oficial del BCV; también se puede escribir a mano. El sistema guarda la tasa de cada día, así que un cobro con fecha atrasada usa la tasa de ese día. Cambiar tasas requiere el permiso "Editar tasas y monedas".

# Usuarios y permisos

En Empleados el administrador crea usuarios, les asigna un rol y las sucursales donde trabajan. Los roles se editan marcando los permisos de cada módulo. Con la llave de cada usuario se dan o quitan permisos solo a esa persona (aparecen marcados como Extra o Quitado). Desactivar un usuario le cierra la sesión.

# Lista de precios en PDF

En Catálogo, botón "Lista de precios": arma un PDF con los productos por categoría y sus precios (también en Bs. a la tasa del día), de la sucursal que muestra el catálogo. En computadora se imprime o se guarda como PDF; en el teléfono se descarga o se comparte.

# Ventas con Cashea

Si la tienda lo activa en Configuración, Punto de venta, al confirmar la venta aparece "Vender con Cashea": se escribe la inicial que indica Cashea, se cobra esa inicial en la caja como siempre y el resto queda como deuda de Cashea (no del cliente). Cuando Cashea deposita, en Contabilidad, Cuentas, Cashea, se marcan las ventas y se usa "Registrar depósito": el sistema registra lo que llegó al banco y la comisión de Cashea.

# Bancos y conciliación

En Contabilidad, Conciliación, se sube el extracto del banco y el sistema lo casa con los cobros, ingresos y egresos registrados, para ver qué falta o sobra. Requiere el permiso "Conciliar bancos".

# Sin conexión

NXUS se puede instalar como app. Si se cae el internet, la caja sigue vendiendo y guarda las ventas en cola; se suben solas cuando vuelve la conexión. Mientras haya ventas en cola no se puede cerrar el turno.

# Soporte

Para lo que no esté en este manual, errores del sistema, activar módulos extra o cambiar el plan, el cliente debe escribirle a soporte de NXUS.
`;

// Módulos extra. La clave es la columna de companies que lo enciende.
const MODULOS = {
  cocina_enabled: `
# Restaurante: platos, recetas, mesas y cocina

Esta tienda tiene el módulo de Restaurante: secciones Mesas, Cocina y Recetas.

## Crear un plato
1. El plato es un producto: Catálogo, Productos, Nuevo producto. Ponle nombre, categoría, precio de venta y foto. Así ya se puede vender en la caja, en las mesas y en el catálogo.
2. Los ingredientes también son productos (lomo, papa, aceite…). Créalos en Catálogo y márcalos como "Insumo: no se vende en caja ni se publica": se compran y llevan inventario, pero no aparecen en la caja ni en el menú.
3. Para que el plato descuente sus ingredientes al venderse, hazle su ficha técnica en Recetas: presiona "+ Nueva ficha", elige el plato y usa "Agregar ingrediente" para sumar cada insumo con la cantidad por plato y, si quieres, el % de merma. La ficha muestra el costo por plato, el margen y el food cost contra la meta. Presiona "Guardar receta".
4. Desde ese momento, cada venta del plato descuenta sus ingredientes del inventario.
Si un plato se vende aunque falte un ingrediente o no, y la meta de food cost (35 % por defecto), se ajustan en Configuración, Punto de venta, sección Cocina.

## Preparaciones (la olla de sopa, las salsas)
Una preparación es algo que se cocina por tanda y se usa en varios platos. En Recetas, "+ Nueva preparación": se indica lo que lleva una tanda y cuánto rinde (en porciones, kilos, litros o unidades). El plato lleva, por ejemplo, "1 porción" de la preparación como ingrediente.
Cada vez que se cocina, se registra la tanda con "Registrar producción" (también hay un botón Producción en la pantalla de Cocina): se anota lo que se usó y lo que salió. Eso descuenta los insumos, suma la preparación al inventario y calcula su costo real. Requiere el permiso de producción de cocina.

## Adicionales (extras y contornos)
En Catálogo, pestaña Adicionales, se crean grupos de opciones para los platos (por ejemplo "Término de la carne" o "Extras"), con mínimo y máximo a elegir. Una opción sin precio es solo una indicación para la cocina; una con precio sale en la factura como línea aparte. Se eligen al pedir en la caja, en las mesas y en el catálogo.

## Mesas
- El plano se arma en Mesas con "Editar plano": se crean áreas ("+ Crear área": Salón, Terraza, Barra…) y en cada área las mesas con su forma, tamaño y puestos. Guardar con "Guardar plano". Requiere el permiso "Editar el plano".
- El mesonero entra con su usuario (rol Mesonero), toca una mesa en el mapa, busca en el menú y agrega los platos (con nota para la cocina si hace falta), y presiona "Enviar a cocina". Cada envío es una ronda; la primera ronda abre la cuenta de la mesa. Los mesoneros no cobran.
- "Mostrar al cliente" muestra la carta en la tablet sin totales ni datos internos.
- En el mapa se ve qué mesas tienen cuenta abierta, cuáles pidieron la cuenta y cuáles tienen pedido listo en cocina.
- Si la tienda trabaja por puesto (se activa en Configuración, Punto de venta, Cocina), cada plato se asigna a un puesto (P1, P2…) y la cuenta se puede dividir por puestos al cobrar.
- Cobrar la mesa lo hace quien tenga permiso de cobrar: desde la caja (botón Mesa / Ver mapa del carrito) o desde la tablet. Se elige si se paga toda la mesa o solo algunos puestos, el cliente de la factura y la propina o servicio.
- QR de mesas: en Mesas, el botón de QR del área muestra e imprime el código de cada mesa. El cliente lo escanea y ve sus rondas y su estado, pide la cuenta y, si la tienda lo permite, pide desde su teléfono. Ese pedido aparece en el mapa para que el mesonero lo envíe a cocina o lo rechace.

## Cocina
La pantalla Cocina muestra las comandas que llegan (de las mesas, de la caja y de los pedidos web) con sus notas y adicionales. Se avanza cada comanda hasta "Marcar lista"; la caja y el mesonero ven que está lista. Marca en amarillo las que llevan más de 10 minutos y en rojo las de más de 20. Se puede imprimir la comanda (sin precios) y marcar lo que se acabó (contornos, extras) en Agotados. Requiere los permisos de Cocina.
Si la caja también debe mandar a cocina lo que cobra directamente, se activa en Configuración, Punto de venta, sección Cocina.
`,

  propinas_enabled: `
# Propinas

La propina es el recargo de la caja marcado como propina al cobrar, y queda para el mesonero de la cuenta o para un pozo que se reparte (el modo se elige en Configuración). Las rondas que envía un mesonero desde la tablet le asignan la propina solo, si su usuario está ligado a su ficha de personal.
La sección Propinas tiene las pestañas Propinas, Facturas y Personal: ahí se ve cuánto le toca a cada uno, se corrige a quién le toca una propina (permiso propio, queda registrado) y se paga. Pagar crea un egreso de la categoría Propinas; anular ese egreso deshace el pago. Se gana al cobrar: una factura cobrada a medias da media propina.
`,

  comisiones_enabled: `
# Comisiones por vendedor

- Los vendedores se crean en Comisiones, pestaña Vendedores: código, nombre, % de comisión y, si quieren, el usuario con que entra (no hace falta que tengan usuario).
- En la caja se elige el vendedor de cada venta con "Elegir vendedor" (debajo del cliente) o con F7, por código o nombre. Si la tienda quiere que sea obligatorio, se activa "Exigir el vendedor" en Configuración, Punto de venta.
- La comisión se gana al COBRAR, no al facturar: una venta a crédito empieza a generar comisión cuando se cobra. Si después hay una devolución, se descuenta ese día. Lo exonerado no paga comisión.
- En Comisiones se ve el reporte del período por vendedor y su estado de cuenta (se puede imprimir para entregárselo).
- Liquidar (pagarle) registra un egreso de la categoría "Comisiones a vendedores". Si se anula ese egreso en Contabilidad, la liquidación se deshace. No deja pagar más de lo que se le debe.
- Permisos: ver comisiones, crear y editar vendedores, liquidar. Elegir el vendedor en la caja va con el permiso de cobrar.
`,

  catalog_enabled: `
# Catálogo web (vitrina) y pedidos

- La tienda tiene un catálogo público (vitrina) con su enlace, donde sus clientes ven productos, fotos y precios y hacen pedidos.
- El contenido de la vitrina (tema, colores, banners, anuncio, destacados) se configura en Configuración, Vitrina. Cada producto se muestra u oculta en la vitrina desde Catálogo.
- Los pedidos llegan a la sección Pedidos: se revisan y se aceptan antes de pasar a la caja como cuenta en espera, donde se cobran como cualquier venta.
`,

  pedidos_web_enabled: `
# Pedidos web con entrega y pago

- En Configuración, Pedidos web, se eligen las formas de entrega (retiro en tienda y/o delivery) y qué cuentas y métodos de pago se le muestran al cliente con sus datos (titular, documento, teléfono, cuenta).
- El delivery se cobra por distancia: tarifa base más un monto por km, con mínimo y radio máximo, desde la ubicación de la sucursal (que se marca en el mapa en esa misma pantalla). Una sucursal sin ubicación no ofrece delivery. El delivery sale en la factura como recargo.
- El cliente reporta su pago al pedir o después, desde "Mis pedidos". Los pagos reportados se revisan en Contabilidad, Pagos, "Pagos reportados": se confirman a mano (permiso "Confirmar pagos reportados por clientes") o solos al subir el extracto del banco si casan.
- Al cobrar ese pedido en la caja aparece "El cliente ya pagó" con "Registrar este pago", para no cobrarlo dos veces.
`,

  citas_enabled: `
# Agenda de citas

- En Agenda se configuran los profesionales o puestos, sus horarios, ausencias y qué servicios hace cada uno (permiso "Configurar profesionales, puestos y horarios"). Cada servicio es un producto con su duración.
- Dar una cita: se elige el servicio, el día y un hueco libre del profesional; el cliente puede ir solo con su nombre y se registra al cobrar. Mover y cancelar citas requiere "Dar, mover y cancelar citas".
- Estados: pendiente, confirmada, en curso, terminada, cancelada o no vino.
- Al "Terminar" la cita, queda su cuenta en espera; se cobra desde la misma agenda o desde la caja, con el mismo turno, serie y ticket de siempre. La agenda muestra las citas terminadas que faltan por cobrar.
- El rol Profesional ve y atiende solo su propia agenda. Si la tienda lo activa, los clientes pueden reservar desde la vitrina.
`,

  cobranza_enabled: `
# Cobranza por sectores

- Los clientes se agrupan por sectores (pueblos o zonas), cada uno con su sucursal y sus cobradores. El sector se asigna en la ficha del cliente o desde la sección Cobranza, pestaña Sectores (permiso "Crear sectores y asignar cobradores").
- El cobrador trabaja en la pestaña Ruta: ve los clientes de sus sectores con lo que deben, registra abonos (con cualquier forma de pago; un abono atrasado usa la tasa del día del pago) y, si tiene permiso, deja mercancía a crédito.
- Regalos: al saldar se le puede dar un regalo al cliente; queda "por entregar" y al entregarlo sale del inventario.
- Todo queda como ventas a crédito y cobros normales del sistema, así que aparece en cuentas por cobrar, en la caja y en los reportes.
`,

  iva_enabled: `
# Factura con IVA y libros fiscales

- Los precios YA incluyen el IVA: activarlo no cambia ningún monto, solo lo desglosa en la factura (base, IVA y exento).
- Cada producto tiene su alícuota: general 16 %, reducida 8 %, adicional 31 % o exento. Se cambia en la ficha del producto.
- En Reportes, sección Fiscal: Libro de ventas, Libro de compras y Declaración de IVA, por mes o quincena, con exportación a Excel y PDF. Las facturas anuladas salen en cero y las notas de crédito en negativo.
- Para el Libro de compras, la factura del proveedor se carga en el detalle de la compra: RIF, número de factura, número de control, fecha y alícuota de cada línea.
`,

  fiscal_enabled: `
# Máquina fiscal

- La tienda imprime facturas en una impresora fiscal The Factory HKA a través del programa NXUS Bridge instalado en la computadora de la caja. Se configura en Configuración (sección de la máquina fiscal).
- Al confirmar la venta aparece la opción de factura fiscal. Si la máquina no confirma (sin papel, apagada, sin conexión), el sistema da error y no inventa ningún número fiscal: hay que revisar la máquina y repetir.
- Los reportes X y Z se sacan desde la caja; el Z también se puede emitir al cerrar el turno.
`,

  mayor_enabled: `
# Venta al mayor

- Cada producto puede tener precio al mayor y "al mayor desde" (cantidad mínima), también por sucursal. Se cargan en la ficha del producto o en la plantilla de Excel.
- En la ficha del cliente, "Precio que paga": detal o mayor (cliente mayorista).
- La caja cobra al mayor solo: si el cliente es mayorista, o si lleva la cantidad mínima del producto (las variantes de un mismo modelo suman). Si hay una promoción, se cobra lo más bajo entre la promoción y el precio al mayor. En la caja se ve la marca "Al mayor" con el precio detal tachado.
- La vitrina pública muestra y cobra solo el precio detal.
`,

  catalogo_pdf_enabled: `
# Catálogo PDF con fotos

En Catálogo, botón "Catálogo PDF": arma un catálogo de la marca con portada, una página por línea o categoría y fichas de producto con foto, para compartir con clientes o vendedores. Se elige qué precio sale y si incluye la ficha de cada producto. En computadora se imprime o guarda como PDF; en el teléfono se descarga o comparte directamente.
`,

  fabrica_enabled: `
# Fábrica / Producción

- Los materiales que se controlan por piezas (láminas en m², tubos y perfiles en metros) se marcan con "Control por piezas" en el producto. Al recibir la compra, el sistema numera cada pieza; los retazos quedan como piezas hijas.
- Recetas con fórmulas: cada producto fabricado declara sus medidas (largo, ancho…) y cuánto material, accesorios y minutos de cada etapa lleva.
- Órdenes de fabricación: se crean con las medidas del cliente, pasan por las etapas definidas por la empresa (con su costo por hora) en un tablero, se les entregan las piezas a usar y al final comparan lo planificado con lo real (la merma). Se facturan desde la misma orden.
`,

  farmacia_enabled: `
# Farmacia

## Ficha del medicamento
En Catálogo, al crear o editar el producto, la sección de farmacia tiene:
- "Principio activo (Genérico)": con él la caja busca y sugiere equivalentes con existencia.
- "Concentración / Presentación" (por ejemplo 500 mg, caja x 10), "Acción terapéutica" y "Ubicación / Anaquel" (dónde está en la farmacia).
- "Control sanitario / Tipo de récipe": Venta libre, Con récipe o Controlado (psicotrópicos). Una vez creado, solo el Regente o el administrador lo puede cambiar.

## En la caja
- El buscador (F1) encuentra por nombre, código, principio activo o laboratorio.
- Las tarjetas de los medicamentos con récipe o controlados llevan su marca ("Récipe" o "Controlado").
- Si el producto tiene principio activo, el botón "Equivalentes" de su tarjeta muestra los otros productos con el mismo principio activo y su existencia: sirve cuando no hay la marca que pide el cliente.

## Vender por caja o por blíster
El medicamento se carga por su unidad mínima (la pastilla, el sobre). Para vender la caja completa con su propio precio, se crea un producto Combo, por ejemplo "Acetaminofén 500 mg caja x 10", que lleva 10 unidades del producto suelto: tiene su precio, su código de barras y su foto, y al venderlo descuenta las 10 unidades del inventario. Igual para un blíster. Así se puede vender suelto o por caja sin que el inventario se descuadre.

## Vender con récipe o controlados
Al facturar una venta que incluye medicamentos con récipe o controlados, se abre la ventana del récipe:
1. Datos: "Nombre del paciente", "Cédula / Pasaporte", "Médico tratante", "MPPS / Colegio médico" (opcional), "N° de récipe / talonario" y "Fecha del récipe".
2. "Foto del récipe": "Tomar foto o subir imagen del récipe" (JPG, PNG o WEBP, máximo 5 MB).
3. Con controlados, el paciente, la cédula y el médico son obligatorios.
4. Presiona "Registrar y facturar".
Si el cajero no tiene permiso para despachar eso solo, el botón pasa a "Solicitar autorización": el Farmacéutico Regente (o un supervisor con el permiso) escribe su "PIN de autorización" en esa misma caja y la venta sigue. Queda registrado quién autorizó.
- Un controlado siempre necesita a alguien con el permiso "Autorizar y despachar controlados / psicotrópicos (con PIN)".
- Un medicamento con récipe lo despacha solo quien tiene "Vender medicamentos con récipe médico sin supervisión"; los demás piden el PIN.

## PIN del regente
Se asigna en Empleados, editando a la persona: campo "PIN de autorización farmacéutica", de 4 a 6 dígitos. Si ya tiene uno, dejarlo vacío no lo cambia. El PIN solo sirve si esa persona tiene el permiso de autorizar.

## Libro de control y vencimientos
- Reportes, "Control de récipes": cada despacho con fecha, factura, paciente, médico, número de récipe, quién autorizó y la foto del récipe. Se filtra por controlados o con récipe y se busca por paciente, cédula, médico o medicamento. Requiere "Ver el libro de control de récipes y sus fotos".
- Los lotes y su vencimiento se cargan al recibir la compra (Recibir mercancía). Al vender, el sistema descuenta primero del lote que vence antes. Reportes, Vencimientos, muestra lo vencido y lo que está por vencer con su valor.
`,
};

// Manual de los extras que tiene encendidos esta empresa (fila de companies).
function modulosDe(empresa = {}) {
  return Object.entries(MODULOS).filter(([flag]) => empresa[flag]).map(([, texto]) => texto).join("\n");
}

module.exports = { BASE, modulosDe, FLAGS: Object.keys(MODULOS) };
