/**
 * Registro de accesos (tabla login_events) y estado de sesión de cada empleado.
 *
 * Nació de una clienta que inactivó a una cajera sospechosa y quería saber cuándo había
 * entrado por última vez y si seguía intentándolo. Se anotan:
 *   · kind 'login'   — cada intento en /auth/login, bueno o no.
 *   · kind 'refresh' — cada renovación del token (cada 12 h la app la pide sola): es la prueba
 *                      de que una sesión abierta sigue en uso aunque no haya login nuevo.
 *   · kind 'session' — un token todavía vigente que llega de un empleado ya inactivo.
 *
 * Todo va en SQL crudo: no hay hooks de tenant que respetar y el intento con un usuario
 * inexistente no tiene empresa.
 */
// Perezoso: middleware/auth carga este archivo y los modelos no deben entrar en ese ciclo.
const db = () => require("../models").sequelize;

// Resultados posibles. El frontend los traduce (EmployeeAccessModal).
const RESULT = {
  OK:           "ok",
  BAD_PASSWORD: "bad_password",
  INACTIVE:     "inactive",
  UNKNOWN:      "unknown",
  BLOCKED:      "blocked",      // la empresa está suspendida o vencida
};

const ipOf = (req) => String(req.ip || req.headers["x-forwarded-for"] || "").slice(0, 60) || null;
const uaOf = (req) => String(req.headers["user-agent"] || "").slice(0, 300) || null;

// Se espera a que termine: en Vercel lo que queda pendiente tras responder puede no
// ejecutarse nunca. Un fallo aquí no debe tumbar el login, solo queda en el log.
async function recordLoginEvent(req, { employee, username, kind, result }) {
  try {
    const sequelize = db();
    await sequelize.query(
      `INSERT INTO login_events (company_id, employee_id, username, kind, result, ip, user_agent)
       VALUES (:company_id, :employee_id, :username, :kind, :result, :ip, :ua)`,
      {
        replacements: {
          company_id:  employee?.company_id ?? null,
          employee_id: employee?.id ?? null,
          username:    String(employee?.username ?? username ?? "").slice(0, 100) || null,
          kind, result,
          ip: ipOf(req),
          ua: uaOf(req),
        },
      }
    );
    if (result === RESULT.OK) {
      await sequelize.query(
        kind === "login"
          ? `UPDATE employees SET last_login_at = NOW(), last_seen_at = NOW() WHERE id = :id`
          : `UPDATE employees SET last_seen_at = NOW() WHERE id = :id`,
        { replacements: { id: employee.id } }
      );
      touched.set(employee.id, Date.now());
    }
  } catch (e) {
    console.error("[loginEvents] no se pudo registrar el acceso:", e.message);
  }
}

// ── Estado del empleado en cada request ─────────────────────────────────────────────────
//
// Inactivar a alguien no le cerraba la sesión: el token dura 12 h y el middleware solo miraba
// la firma. Ahora se comprueba que el empleado siga activo, con una caché de 30 s igual que la
// del estado de la empresa (companyStatusCache): sin ella sería una consulta por request.
// Al editar un empleado se invalida su entrada, así que en esta instancia el corte es inmediato.
const TTL_MS = 30 * 1000;
// La última actividad se escribe como mucho cada 5 min por empleado: "hace 3 min" basta, y
// una escritura por request a la base del pooler sería justo lo que la tumbó en septiembre.
const SEEN_EVERY_MS = 5 * 60 * 1000;

const cache   = new Map(); // employee_id -> { active, expires }
const touched = new Map(); // employee_id -> ms de la última escritura de last_seen_at

// Devuelve { active, fresh }: `fresh` dice que se acaba de consultar la base, para que quien
// llama anote el rechazo una sola vez y no en cada request de la ráfaga.
async function isEmployeeActive(employeeId) {
  const hit = cache.get(employeeId);
  if (hit && hit.expires > Date.now()) return { active: hit.active, fresh: false };

  const sequelize = db();
  const [row] = await sequelize.query(
    `SELECT active, last_seen_at FROM employees WHERE id = :id`,
    { replacements: { id: employeeId }, type: sequelize.QueryTypes.SELECT }
  );
  // Borrado cuenta como inactivo: su token no debe seguir sirviendo.
  const active = !!row?.active;
  cache.set(employeeId, { active, expires: Date.now() + TTL_MS });

  if (active) {
    const last = Math.max(touched.get(employeeId) || 0, row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0);
    if (Date.now() - last > SEEN_EVERY_MS) {
      touched.set(employeeId, Date.now());
      await sequelize.query(`UPDATE employees SET last_seen_at = NOW() WHERE id = :id`, { replacements: { id: employeeId } });
    }
  }
  return { active, fresh: true };
}

function invalidateEmployee(employeeId) {
  cache.delete(Number(employeeId));
}

module.exports = { RESULT, recordLoginEvent, isEmployeeActive, invalidateEmployee };
