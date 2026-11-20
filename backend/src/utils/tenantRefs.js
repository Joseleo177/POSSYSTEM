const { Op } = require("sequelize");
const { tenantStorage } = require("./tenantStorage");

/**
 * Referencias entre empresas.
 *
 * El filtro multi-empresa (models/index.js) cuida las LECTURAS y lo que se busca por id, pero
 * no mira los ids que se GUARDAN. Una venta propia podía llevar el customer_id de un cliente de
 * otra empresa, un egreso el diario de caja de otra, una transferencia su almacén... y como los
 * `include` de Sequelize no pasan por el filtro, al consultar la venta salían el nombre y el RIF
 * del cliente ajeno (auditoría 20-11-2026: se podía recorrer la cartera de cualquier empresa).
 *
 * Aquí se valida en un solo lugar, para todo camino de escritura presente y futuro: al crear o
 * modificar un registro, cada llave (belongsTo) que apunte a una tabla de empresa tiene que ser
 * de la empresa de la sesión, o global (company_id NULL, como los roles de sistema).
 *
 * - Solo con sesión de empresa (sin `bypass_tenant`): tareas de plataforma y procesos sin
 *   request no se tocan.
 * - Solo las llaves que cambian; lo ya guardado no se revisa en cada update.
 * - Lo verificado queda en el contexto del request: una venta de 20 líneas del mismo producto
 *   consulta el producto una vez.
 */
function installRefHooks(db, tenantModels) {
  const deEmpresa = new Set(tenantModels);
  const cache = new Map();

  // Las asociaciones se declaran a lo largo de models/index.js: se leen al primer uso.
  // Además de las belongsTo del propio modelo, cuentan las tablas intermedias de las
  // belongsToMany (employee_warehouses, …): `setWarehouses()` escribe ahí los dos ids.
  const referencias = (model) => {
    if (cache.has(model.name)) return cache.get(model.name);
    const candidatas = Object.values(model.associations || {})
      .filter((a) => a.associationType === "BelongsTo")
      .map((a) => ({ fk: a.foreignKey, target: a.target, pk: a.targetKey || "id" }));
    for (const otro of Object.values(db)) {
      for (const a of Object.values(otro?.associations || {})) {
        if (a.associationType !== "BelongsToMany" || a.through?.model?.name !== model.name) continue;
        candidatas.push({ fk: a.foreignKey, target: a.source, pk: a.sourceKey || "id" });
        candidatas.push({ fk: a.otherKey, target: a.target, pk: a.targetKey || "id" });
      }
    }
    const vistas = new Set();
    const refs = candidatas
      .filter((r) => deEmpresa.has(r.target.name) && r.fk !== "company_id")
      .filter((r) => (vistas.has(r.fk) ? false : vistas.add(r.fk)));
    cache.set(model.name, refs);
    return refs;
  };

  const error = (fk) => Object.assign(
    new Error(`Referencia inválida: ${fk} no pertenece a esta empresa`),
    { status: 400, isOperational: true },
  );

  const verificar = async (model, valores, cambiado, transaction) => {
    const store = tenantStorage.getStore();
    if (!store || !store.company_id || store.bypass_tenant) return;
    for (const { fk, target, pk } of referencias(model)) {
      const val = valores[fk];
      if (val === undefined || val === null || val === "") continue;
      if (cambiado && !cambiado(fk)) continue;
      if (!store.refsVerificadas) store.refsVerificadas = new Set();
      const clave = `${target.name}:${val}`;
      if (store.refsVerificadas.has(clave)) continue;
      // Sin el filtro automático (que dejaría fuera los globales), y dentro de la misma
      // transacción: el registro referido puede haberse creado en ella.
      const n = await tenantStorage.run({ ...store, bypass_tenant: true }, () =>
        target.count({
          where: { [pk]: val, company_id: { [Op.or]: [store.company_id, null] } },
          transaction,
        }),
      );
      if (!n) throw error(fk);
      store.refsVerificadas.add(clave);
    }
  };

  for (const model of Object.values(db)) {
    if (!model || typeof model.addHook !== "function" || !model.associations) continue;
    model.addHook("beforeSave", (instance, options) =>
      verificar(model, instance.dataValues, instance.isNewRecord ? null : (fk) => instance.changed(fk), options.transaction));
    model.addHook("beforeBulkCreate", async (instances, options) => {
      for (const instance of instances) await verificar(model, instance.dataValues, null, options.transaction);
    });
    model.addHook("beforeBulkUpdate", (options) =>
      verificar(model, options.attributes || {}, null, options.transaction));
  }
}

module.exports = { installRefHooks };
