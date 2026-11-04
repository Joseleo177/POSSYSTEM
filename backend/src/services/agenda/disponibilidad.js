'use strict';

const { fail, int, q, dia, instante, partes, hoy, OCUPAN_SQL } = require("./shared");

// Huecos libres de la agenda. Lo usa el modal de nueva cita y, más adelante, la vitrina.
//
// Todo se calcula en minutos del día de la sucursal (9:30 = 570) a partir de tres cosas:
//  - el horario semanal del recurso (agenda_hours) para ese día de la semana,
//  - sus ausencias (agenda_blocks) que tocan el día,
//  - sus citas vivas del día.
// Una cita cabe si cae entera dentro de una franja del horario, no toca ninguna ausencia y, en
// todo su tramo, hay menos citas a la vez que la capacidad del recurso (1 el barbero; 2 las
// bahías del autolavado).
//
// RENDIMIENTO: tres consultas por día y sucursal, sin importar cuántos recursos haya.

const STEP_KEY = "agenda_step_min";
const PASOS = [5, 10, 15, 20, 30, 60];

async function pasoDe(cid) {
  const [s] = await q(`SELECT value FROM settings WHERE company_id = :cid AND key = :k`, { cid, k: STEP_KEY });
  const n = int(s?.value);
  return PASOS.includes(n) ? n : 15;
}

/**
 * Lo que ocupa el día de cada recurso, en minutos. `excluir` es la cita que se está moviendo:
 * no se estorba a sí misma.
 * → Map(resource_id → { franjas: [[ini, fin]], bloqueos: [[ini, fin]], citas: [[ini, fin]] })
 */
async function cargarDia(cid, resourceIds, fecha, { excluir = null, transaction } = {}) {
  const { weekday } = dia(fecha);
  const ini = instante(fecha, 0);
  const fin = new Date(ini.getTime() + 86400000);
  const rep = { cid, ids: resourceIds, wd: weekday, ini, fin, ex: excluir || 0 };
  const opts = { transaction };
  const [franjas, bloqueos, citas] = await Promise.all([
    q(`SELECT resource_id, start_min AS a, end_min AS b FROM agenda_hours
        WHERE company_id = :cid AND resource_id IN (:ids) AND weekday = :wd ORDER BY start_min`, rep, opts),
    q(`SELECT resource_id, starts_at, ends_at FROM agenda_blocks
        WHERE company_id = :cid AND resource_id IN (:ids) AND starts_at < :fin AND ends_at > :ini`, rep, opts),
    q(`SELECT resource_id, starts_at, ends_at FROM appointments
        WHERE company_id = :cid AND resource_id IN (:ids) AND status IN (${OCUPAN_SQL})
          AND starts_at < :fin AND ends_at > :ini AND id <> :ex`, rep, opts),
  ]);
  // Instante → minuto del día, recortado al día (una ausencia de una semana cubre el día entero).
  const aMin = (t) => Math.min(1440, Math.max(0, Math.round((new Date(t).getTime() - ini.getTime()) / 60000)));
  const mapa = new Map(resourceIds.map(id => [id, { franjas: [], bloqueos: [], citas: [] }]));
  for (const f of franjas) mapa.get(f.resource_id)?.franjas.push([f.a, f.b]);
  for (const b of bloqueos) mapa.get(b.resource_id)?.bloqueos.push([aMin(b.starts_at), aMin(b.ends_at)]);
  for (const c of citas) mapa.get(c.resource_id)?.citas.push([aMin(c.starts_at), aMin(c.ends_at)]);
  return mapa;
}

// Por qué no cabe una cita, para el mensaje.
const MOTIVOS = { horario: "fuera de su horario", ausente: "ausente", ocupado: "ocupado" };

/**
 * ¿Cabe [s, e) en el día del recurso? Devuelve null si cabe, o el motivo ('horario', 'ausente',
 * 'ocupado').
 * `horario: false` no exige el horario (la recepción da una cita fuera de hora a sabiendas),
 * pero la capacidad y las ausencias se respetan siempre.
 */
function motivoNoCabe(diaRec, capacity, s, e, { horario = true } = {}) {
  if (horario && !diaRec.franjas.some(([a, b]) => a <= s && e <= b)) return "horario";
  if (diaRec.bloqueos.some(([a, b]) => a < e && s < b)) return "ausente";
  const cruzan = diaRec.citas.filter(([a, b]) => a < e && s < b);
  if (cruzan.length >= capacity) {
    // La cuenta exacta: cuántas hay a la vez en cada punto donde algo empieza dentro del tramo.
    const puntos = [s, ...cruzan.map(([a]) => a).filter(a => a > s && a < e)];
    const maxALaVez = Math.max(...puntos.map(p => cruzan.filter(([a, b]) => a <= p && p < b).length));
    if (maxALaVez >= capacity) return "ocupado";
  }
  return null;
}

/**
 * Recursos activos de la sucursal que hacen TODOS los servicios pedidos. La regla es por
 * servicio: uno sin filas en agenda_resource_services lo hacen todos.
 */
async function candidatos(cid, warehouseId, productIds, { soloIds = null, transaction } = {}) {
  const recursos = await q(`
    SELECT r.id, r.name, r.kind, r.capacity, r.color, r.employee_id, r.seller_id
      FROM agenda_resources r
     WHERE r.company_id = :cid AND r.warehouse_id = :wid AND r.active
       ${soloIds ? "AND r.id IN (:solo)" : ""}
       AND NOT EXISTS (
         SELECT 1 FROM unnest(ARRAY[:pids]::int[]) AS pid
          WHERE EXISTS (SELECT 1 FROM agenda_resource_services rs JOIN agenda_resources r2 ON r2.id = rs.resource_id
                         WHERE rs.product_id = pid AND r2.warehouse_id = :wid AND r2.active)
            AND NOT EXISTS (SELECT 1 FROM agenda_resource_services rs WHERE rs.product_id = pid AND rs.resource_id = r.id)
       )
     ORDER BY r.sort_order, r.id`, { cid, wid: warehouseId, pids: productIds.length ? productIds : [0], solo: soloIds }, { transaction });
  return recursos;
}

/**
 * Servicios pedidos con su duración. Lanza si alguno no se agenda.
 * → [{ id, name, duration_min }]
 */
async function servicios(cid, productIds, transaction) {
  const ids = [...new Set((productIds || []).map(int).filter(n => n > 0))];
  if (!ids.length) throw fail("Elige al menos un servicio");
  if (ids.length > 10) throw fail("Una cita admite hasta 10 servicios");
  const filas = await q(`SELECT id, name, duration_min FROM products
    WHERE company_id = :cid AND id IN (:ids) AND sellable AND duration_min IS NOT NULL`, { cid, ids }, { transaction });
  if (filas.length !== ids.length) throw fail("Uno de los servicios ya no se agenda: revisa su duración");
  // En el orden en que se eligieron.
  return ids.map(id => filas.find(f => f.id === id));
}

/**
 * Horas libres de un día. → { date, duration, step, resources: [{ id, name, slots: [min] }] }
 * Hoy no ofrece horas que ya pasaron.
 */
async function huecos(cid, { warehouseId, fecha, productIds, soloIds = null, excluir = null }) {
  dia(fecha);
  const servs = await servicios(cid, productIds);
  const duracion = servs.reduce((s, x) => s + x.duration_min, 0);
  const [paso, recursos] = await Promise.all([pasoDe(cid), candidatos(cid, warehouseId, servs.map(s => s.id), { soloIds })]);
  if (!recursos.length) return { date: fecha, duration: duracion, step: paso, resources: [] };

  const mapa = await cargarDia(cid, recursos.map(r => r.id), fecha, { excluir });
  const ahora = fecha === hoy() ? partes(new Date()).min : fecha < hoy() ? 1440 : -1;
  return {
    date: fecha,
    duration: duracion,
    step: paso,
    resources: recursos.map(r => {
      const d = mapa.get(r.id);
      const slots = [];
      for (const [a, b] of d.franjas) {
        // Las horas arrancan en múltiplos del paso desde el inicio de la franja (9:00, 9:15…).
        for (let s = a; s + duracion <= b; s += paso) {
          if (s <= ahora) continue;
          if (!motivoNoCabe(d, r.capacity, s, s + duracion)) slots.push(s);
        }
      }
      return { id: r.id, name: r.name, kind: r.kind, color: r.color, slots };
    }),
  };
}

/**
 * Horas libres para un GRUPO: varias personas que vienen juntas (el papá y el hijo), cada una con
 * sus servicios. Con una sola persona es lo mismo que huecos().
 *
 *   modo 'juntos'    a la misma hora, cada persona con un profesional distinto (o el mismo
 *                    puesto, si tiene capacidad para las dos: dos carros en dos bahías).
 *   modo 'seguidos'  una después de la otra, con el mismo profesional.
 *
 * Cada hora libre trae su `plan`: quién atiende a cada persona y de qué minuto a qué minuto.
 * Reservar usa ese mismo plan (ver publico.js), así lo que se ofrece es lo que se agenda.
 * → { date, step, durations: [min por persona], slots: [{ start, plan: [{ resource_id, start, end }] }] }
 */
async function huecosGrupo(cid, { warehouseId, fecha, grupos, modo = "juntos", soloIds = null, desde = -1, transaction }) {
  dia(fecha);
  const personas = [];
  for (const g of grupos) personas.push(await servicios(cid, g, transaction));
  const durs = personas.map(ss => ss.reduce((t, s) => t + s.duration_min, 0));
  const total = durs.reduce((a, b) => a + b, 0);
  const paso = await pasoDe(cid);
  const cands = [];
  for (const ss of personas) cands.push(await candidatos(cid, warehouseId, ss.map(s => s.id), { soloIds, transaction }));
  const vacio = { date: fecha, step: paso, durations: durs, slots: [] };
  if (cands.some(c => !c.length)) return vacio;

  const todos = [...new Map(cands.flat().map(r => [r.id, r])).values()];
  const mapa = await cargarDia(cid, todos.map(r => r.id), fecha, { transaction });
  const carga = (r) => mapa.get(r.id).citas.length;
  const porCarga = (lista) => [...lista].sort((a, b) => carga(a) - carga(b));

  const inicios = new Set();
  for (const r of todos) {
    for (const [a, b] of mapa.get(r.id).franjas) for (let s = a; s < b; s += paso) inicios.add(s);
  }

  // Uno después del otro: alguien que haga lo de todos, libre de corrido.
  const comunes = porCarga(todos.filter(r => cands.every(c => c.some(x => x.id === r.id))));
  const planSeguidos = (s) => {
    for (const r of comunes) {
      if (motivoNoCabe(mapa.get(r.id), r.capacity, s, s + total)) continue;
      let t = s;
      return durs.map(d => { const p = { resource_id: r.id, start: t, end: t + d }; t += d; return p; });
    }
    return null;
  };

  // A la misma hora: se reparte persona por persona, probando primero a quien tiene menos
  // citas ese día; lo ya repartido ocupa su lugar para la siguiente persona.
  const planJuntos = (s) => {
    const extra = new Map();
    const asignar = (i) => {
      if (i === personas.length) return [];
      for (const r of porCarga(cands[i])) {
        const d = mapa.get(r.id);
        const ocupado = { ...d, citas: d.citas.concat(extra.get(r.id) || []) };
        if (motivoNoCabe(ocupado, r.capacity, s, s + durs[i])) continue;
        extra.set(r.id, [...(extra.get(r.id) || []), [s, s + durs[i]]]);
        const resto = asignar(i + 1);
        if (resto) return [{ resource_id: r.id, start: s, end: s + durs[i] }, ...resto];
        extra.set(r.id, extra.get(r.id).slice(0, -1));
      }
      return null;
    };
    return asignar(0);
  };

  const slots = [];
  for (const s of [...inicios].sort((a, b) => a - b)) {
    if (s < desde || s + (modo === "seguidos" ? total : Math.max(...durs)) > 1440) continue;
    const plan = modo === "seguidos" ? planSeguidos(s) : planJuntos(s);
    if (plan) slots.push({ start: s, plan });
  }
  return { ...vacio, slots };
}

module.exports = { huecosGrupo, MOTIVOS, pasoDe, cargarDia, motivoNoCabe, candidatos, servicios, huecos, STEP_KEY, PASOS };
