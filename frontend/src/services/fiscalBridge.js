/**
 * Servicio de conexión con NXUS Fiscal Bridge (agente local en Windows en http://localhost:5050)
 */

export const LOCAL_AGENT_URL = 'http://localhost:5050';

/**
 * Envía una venta al agente local para imprimir en la máquina fiscal The Factory HKA.
 * Si la máquina no confirma, lanza error: nunca devuelve una factura simulada como buena. Solo
 * con el agente en modo prueba (encendido a propósito) responde modo 'PRUEBA', sin número fiscal.
 * IMPORTANTE: Las máquinas fiscales SENIAT en Venezuela SOLO facturan en Bolívares (Bs).
 */
export async function emitirFacturaFiscal(sale, options = {}) {
  const rateBs = parseFloat(options.rateBs) > 1
    ? parseFloat(options.rateBs)
    : (parseFloat(sale.exchange_rate) > 1 ? parseFloat(sale.exchange_rate) : 1);
  const cliente = options.cliente || {};

  const items = (sale.items || []).map(item => {
    // Tasa de IVA: 16% general, 8% reducida, 0% exento, 31% lujo
    let tasa = 16;
    if (item.iva_rate !== undefined && item.iva_rate !== null && item.iva_rate !== "") {
      tasa = parseFloat(item.iva_rate);
    } else if (item.tax_rate !== undefined && item.tax_rate !== null && item.tax_rate !== "") {
      tasa = parseFloat(item.tax_rate);
    } else if (item.iva_tipo === 'E' || item.is_exempt) {
      tasa = 0;
    } else if (item.iva_tipo === 'R') {
      tasa = 8;
    } else if (item.iva_tipo === 'A') {
      tasa = 31;
    }

    const precioUnitarioPvp = parseFloat(item.price || item.unit_price || 0);
    // Convertir de divisas base ($) a Bolívares según la tasa de la venta
    const precioUnitarioBsPvp = Math.round(precioUnitarioPvp * rateBs * 100) / 100;

    // En NXUS el precio en catálogo es PVP (con IVA incluido).
    // El protocolo The Factory HKA (comandos !, ", #) exige que el precio del ítem
    // sea la BASE IMPONIBLE (precio neto sin IVA), ya que la máquina fiscal física
    // calcula y suma el IVA automáticamente en base a su memoria interna.
    const precioFiscalBase = tasa > 0
      ? Math.round((precioUnitarioBsPvp / (1 + tasa / 100)) * 100) / 100
      : precioUnitarioBsPvp;

    return {
      descripcion: (item.product_name || item.name || 'Producto').substring(0, 30),
      precio: precioFiscalBase,
      cantidad: parseFloat(item.quantity || 1),
      tasa: tasa
    };
  });

  const totalBs = options.totalBs
    ? parseFloat(options.totalBs)
    : Math.round(parseFloat(sale.total || 0) * rateBs * 100) / 100;

  // Determinar medio de pago (efectivo, débito, crédito, transferencia)
  const metodoPago = options.metodoPago || sale.payment_method || (sale.payments && sale.payments[0]?.method) || 'efectivo';

  const body = {
    cliente: {
      nombre: cliente.name || sale.customer_name || 'CLIENTE CONTADO',
      rif: cliente.tax_id || cliente.rif || sale.customer_rif || 'V000000000',
      direccion: cliente.address || 'VENEZUELA'
    },
    items,
    total: totalBs,
    rateBs: rateBs,
    sale_id: sale.id || null,
    metodo_pago: metodoPago
  };

  return llamarAgente('/imprimir-fiscal', body);
}

/**
 * Solo una factura impresa y confirmada por la máquina puede quedar en una venta. Las del modo
 * prueba del agente no traen numeroFacturaFiscal, pero se mira también el modo por si acaso.
 */
export const esFiscalReal = (res) => res?.ok === true && res?.modo === 'REAL_FISCAL';

const SIN_AGENTE = 'El Agente Fiscal (nxus-bridge.exe) no está en ejecución en esta computadora. Ábrelo y vuelve a intentar.';

/**
 * POST al agente. Si el agente responde con error, se lanza SU mensaje (máquina sin papel, no
 * confirmó, origen no autorizado…): el cajero necesita saber qué pasó, no solo que algo falló.
 */
async function llamarAgente(ruta, body = {}) {
  let response;
  try {
    response = await fetch(`${LOCAL_AGENT_URL}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch {
    throw new Error(SIN_AGENTE);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const err = new Error(data?.error || `El agente fiscal respondió con error (${response.status}).`);
    err.sinConfirmar = !!data?.sinConfirmar;
    err.diagnostico = data?.diagnostico || null;
    throw err;
  }
  return data;
}

/**
 * Consulta el estado detallado del agente fiscal local
 */
export async function verificarAgenteFiscal() {
  try {
    const res = await fetch(`${LOCAL_AGENT_URL}/estado`, { method: 'GET', signal: AbortSignal.timeout(1500) });
    if (!res.ok) return { online: false };
    const data = await res.json();
    return { online: true, ...data };
  } catch {
    return { online: false };
  }
}

/**
 * Dispara el Reporte X (Lectura de ventas del día sin cierre de memoria)
 */
export function emitirReporteX() {
  return llamarAgente('/reporte-x');
}

/**
 * Dispara el Reporte Z (Cierre diario obligatorio del SENIAT)
 */
export function emitirReporteZ() {
  return llamarAgente('/reporte-z');
}

/**
 * Le pregunta a la máquina fiscal su estado (ReadFpStatus). Sin máquina tarda ~30 s en fallar.
 */
export function probarImpresoraFiscal() {
  return llamarAgente('/probar-impresora');
}

/**
 * Configura dinámicamente el puerto serial en el agente (COM1, COM2, COM3, COM4, etc.)
 */
export function configurarPuertoFiscal(puerto) {
  return llamarAgente('/configurar-puerto', { puerto });
}
