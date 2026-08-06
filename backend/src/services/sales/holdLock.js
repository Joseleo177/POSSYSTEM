const { Sale, Employee, sequelize } = require("./shared");
const { Setting } = require("../../models");

// Una cuenta en espera recuperada queda "tomada" por la caja que la abrió. Sin esto, ocultarla
// era un gesto puramente local: en el servidor seguía disponible y otra caja podía cobrarla o
// eliminarla mientras el primer cajero la atendía.
//
// El bloqueo caduca solo. Es imprescindible: si el cajero cierra el navegador, se corta la luz
// o simplemente se va, nadie ejecutaría la liberación y la cuenta quedaría trabada para
// siempre. Un administrador puede además soltarla al instante, para no tener que esperar el
// plazo con el cliente delante.
const DEFAULT_TIMEOUT_MIN = 20;
const TIMEOUT_SETTING_KEY = "hold_lock_timeout_min";

async function timeoutMinutes() {
  try {
    const row = await Setting.findOne({ where: { key: TIMEOUT_SETTING_KEY } });
    const n = parseInt(row?.value, 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MIN;
  } catch {
    return DEFAULT_TIMEOUT_MIN;
  }
}

// Un bloqueo sin fecha se considera vencido: es una fila anterior a esta función, o quedó a
// medias. Mejor liberarla que dejarla inaccesible sin forma de recuperarla.
function isExpired(sale, minutes) {
  if (!sale.held_by_employee_id) return true;
  if (!sale.held_at) return true;
  return Date.now() - new Date(sale.held_at).getTime() > minutes * 60 * 1000;
}

// Marca la cuenta como atendida por este empleado. Devuelve la venta o lanza 409 si otra caja
// la tiene tomada y su bloqueo sigue vigente.
async function claimSale(saleId, employeeId) {
  const minutes = await timeoutMinutes();
  const transaction = await sequelize.transaction();
  try {
    // El bloqueo de fila es lo que evita que dos cajas que pulsan "recuperar" en el mismo
    // instante se lleven las dos la cuenta.
    const sale = await Sale.findByPk(saleId, { transaction, lock: true });
    if (!sale) {
      throw Object.assign(new Error("Esta cuenta ya no existe: otra caja la eliminó."), { status: 404, code: "SALE_GONE" });
    }
    if (!["espera", "pedido"].includes(sale.status)) {
      throw Object.assign(new Error("Esta cuenta ya fue cobrada desde otra caja."), { status: 400, code: "SALE_NOT_EDITABLE" });
    }

    const mine = sale.held_by_employee_id === employeeId;
    if (!mine && !isExpired(sale, minutes)) {
      const holder = await Employee.findByPk(sale.held_by_employee_id, { attributes: ["full_name"], transaction });
      throw Object.assign(
        new Error(`Esta cuenta la está atendiendo ${holder?.full_name || "otra caja"}.`),
        { status: 409, code: "SALE_HELD_BY_OTHER" }
      );
    }

    await sale.update({ held_by_employee_id: employeeId, held_at: new Date() }, { transaction });
    await transaction.commit();
    return sale;
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
}

// Suelta el bloqueo. `force` lo usa un administrador para destrabar una caja que quedó colgada
// sin esperar a que venza el plazo.
async function releaseSale(saleId, employeeId, { force = false } = {}) {
  const sale = await Sale.findByPk(saleId);
  // Si la venta ya no existe no hay nada que soltar: se responde bien para que la caja que
  // está limpiando su estado no tenga que distinguir ese caso.
  if (!sale) return { released: false };

  if (!force && sale.held_by_employee_id && sale.held_by_employee_id !== employeeId) {
    throw Object.assign(
      new Error("Esta cuenta la tiene otra caja. Solo un administrador puede liberarla."),
      { status: 403, code: "SALE_HELD_BY_OTHER" }
    );
  }

  await sale.update({ held_by_employee_id: null, held_at: null });
  return { released: true };
}

// Añade a cada venta de la lista quién la tiene y si el bloqueo sigue vigente, para que el POS
// pueda mostrarla marcada en vez de ocultarla. Un bloqueo vencido se reporta como libre: la
// cuenta vuelve a estar disponible aunque la columna todavía tenga el id anterior.
async function annotateHolders(sales, currentEmployeeId) {
  const minutes = await timeoutMinutes();
  const ids = [...new Set(sales.map((s) => s.held_by_employee_id).filter(Boolean))];
  if (!ids.length) return sales.map((s) => ({ ...s, held_by: null }));

  const holders = await Employee.findAll({ where: { id: ids }, attributes: ["id", "full_name"] });
  const byId = Object.fromEntries(holders.map((h) => [h.id, h.full_name]));

  return sales.map((s) => {
    if (isExpired(s, minutes)) return { ...s, held_by: null };
    return {
      ...s,
      held_by: {
        employee_id: s.held_by_employee_id,
        name: byId[s.held_by_employee_id] || "Otra caja",
        is_mine: s.held_by_employee_id === currentEmployeeId,
      },
    };
  });
}

module.exports = { claimSale, releaseSale, annotateHolders, DEFAULT_TIMEOUT_MIN, TIMEOUT_SETTING_KEY };