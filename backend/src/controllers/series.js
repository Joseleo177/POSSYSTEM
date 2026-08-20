const { Serie, SerieRange, Employee, UserSerie, Warehouse, Sale, Return, sequelize } = require("../models");
const { Op } = require("sequelize");

// Valida con qué serie se van a numerar las notas de crédito de una serie de facturas.
//
// El vínculo es fiscal, no una preferencia: la NC tiene que salir de un talonario de notas
// de crédito de la MISMA sucursal, porque es lo que sostiene que cada local lleve su propia
// numeración correlativa y auditable. Sin estas comprobaciones se podía vincular una serie
// de facturas —incluso la propia— y las devoluciones habrían consumido el correlativo de
// facturación, mezclando dos numeraciones que ante el SENIAT son documentos distintos.
//
// Devuelve el id ya normalizado, o null si no hay vínculo.
const resolveNcSerie = async (ncSerieId, { serieId = null, type, warehouseId }) => {
  if (ncSerieId === null || ncSerieId === undefined || ncSerieId === "") return null;

  if (type === "nc") {
    throw new Error("Una serie de notas de crédito no puede tener otra serie de NC vinculada");
  }
  const id = parseInt(ncSerieId, 10);
  if (Number.isNaN(id)) throw new Error("La serie de notas de crédito indicada no es válida");
  if (serieId && id === serieId) {
    throw new Error("Una serie no puede vincularse a sí misma como serie de notas de crédito");
  }

  const nc = await Serie.findByPk(id);
  if (!nc) throw new Error("La serie de notas de crédito indicada no existe");
  if (nc.type !== "nc") {
    throw new Error(`"${nc.name}" es una serie de facturas, no de notas de crédito`);
  }
  if (!nc.active) {
    throw new Error(`La serie de notas de crédito "${nc.name}" está inactiva`);
  }
  if (warehouseId && nc.warehouse_id !== warehouseId) {
    const suya = await Warehouse.findByPk(nc.warehouse_id, { attributes: ["name"] });
    throw new Error(
      `"${nc.name}" pertenece al almacén ${suya?.name || nc.warehouse_id}. ` +
      `La serie de notas de crédito debe ser del mismo almacén que la serie de facturas.`
    );
  }
  return id;
};

// GET /api/series  — todas con rangos y usuarios (admin)
const getAll = async (req, res) => {
  try {
    const series = await Serie.findAll({
      include: [
        { model: SerieRange, order: [['start_number', 'ASC']] },
        { model: Employee, attributes: ['id', 'full_name'], through: { attributes: [] } },
        { model: Warehouse, attributes: ['id', 'name'], required: false },
      ],
      order: [['name', 'ASC']],
    });
    res.json({ ok: true, data: series });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

// GET /api/series/my?warehouse_id=  — series activas del usuario en un almacén
//
// La serie es de la sucursal, así que la caja solo puede facturar con las series del
// almacén desde el que está vendiendo. Sin warehouse_id devuelve las del usuario en todos
// sus almacenes (la pantalla de cobro siempre lo manda).
const getMy = async (req, res) => {
  try {
    const employeeId = req.employee.id;
    const warehouseId = parseInt(req.query.warehouse_id);

    const series = await Serie.findAll({
      where: { active: true, ...(warehouseId ? { warehouse_id: warehouseId } : {}) },
      include: [
        { model: SerieRange },
        {
          model: Employee,
          where: { id: employeeId },
          through: { attributes: [] },
          attributes: [],
          required: true,
        },
      ],
      order: [['name', 'ASC']],
    });
    res.json({ ok: true, data: series });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
};

// POST /api/series
const create = async (req, res) => {
  try {
    const { name, prefix, padding, type, warehouse_id, nc_serie_id } = req.body;
    if (!name || !prefix) throw new Error("name y prefix son requeridos");
    if (!warehouse_id) throw new Error("Debes indicar el almacén al que pertenece la serie");
    const warehouse = await Warehouse.findByPk(warehouse_id);
    if (!warehouse) throw new Error("Almacén no encontrado");
    const validTypes = ['factura', 'nc'];
    const serieType = validTypes.includes(type) ? type : 'factura';
    const ncSerieId = await resolveNcSerie(nc_serie_id, {
      type: serieType,
      warehouseId: parseInt(warehouse_id),
    });
    const serie = await Serie.create({
      name,
      prefix: prefix.toUpperCase(),
      padding: parseInt(padding) || 4,
      type: serieType,
      warehouse_id: parseInt(warehouse_id),
      nc_serie_id: ncSerieId,
    });
    res.json({ ok: true, data: serie });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// PUT /api/series/:id
const update = async (req, res) => {
  try {
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");
    const { name, prefix, padding, active, type, warehouse_id, nc_serie_id } = req.body;
    const validTypes = ['factura', 'nc'];

    // Mover una serie de sucursal solo se permite mientras no haya facturado nada: si ya
    // emitió, sus correlativos quedaron atados a ese almacén y cambiarlo falsea el histórico.
    let nextWarehouseId = serie.warehouse_id;
    if (warehouse_id && parseInt(warehouse_id) !== serie.warehouse_id) {
      const emitidas = await Sale.count({ where: { serie_id: serie.id } });
      if (emitidas > 0) {
        throw new Error(`No se puede cambiar el almacén: la serie ya tiene ${emitidas} documento(s) emitido(s)`);
      }
      const warehouse = await Warehouse.findByPk(warehouse_id);
      if (!warehouse) throw new Error("Almacén no encontrado");
      nextWarehouseId = parseInt(warehouse_id);
    }

    const nextType = validTypes.includes(type) ? type : serie.type;

    // El vínculo con la serie de NC solo se toca si viene en la petición: antes, cualquier
    // actualización parcial —cambiar el nombre, activarla— lo borraba en silencio y las
    // devoluciones se iban a numerar con otro talonario sin que nadie se enterara.
    let nextNcSerieId = serie.nc_serie_id;
    if (nc_serie_id !== undefined) {
      nextNcSerieId = await resolveNcSerie(nc_serie_id, {
        serieId: serie.id, type: nextType, warehouseId: nextWarehouseId,
      });
    } else if (nextType === "nc") {
      // Pasó a ser serie de notas de crédito: ya no puede apuntar a otra.
      nextNcSerieId = null;
    } else if (nextNcSerieId) {
      // Mudarla de sucursal no puede dejarla numerando sus NC en el almacén anterior.
      nextNcSerieId = await resolveNcSerie(nextNcSerieId, {
        serieId: serie.id, type: nextType, warehouseId: nextWarehouseId,
      });
    }

    await serie.update({
      name:    name    ?? serie.name,
      prefix:  prefix  ? prefix.toUpperCase() : serie.prefix,
      padding: padding ? parseInt(padding) : serie.padding,
      active:  active  !== undefined ? active : serie.active,
      type:    nextType,
      warehouse_id: nextWarehouseId,
      nc_serie_id: nextNcSerieId,
    });
    res.json({ ok: true, data: serie });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// DELETE /api/series/:id
const remove = async (req, res) => {
  try {
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");

    // Una serie que ya emitió no se borra nunca: sus correlativos son documentos fiscales y
    // deben poder rastrearse. Borrarla dejaba las ventas con serie_id en NULL —sin forma de
    // reconstruir con qué talonario se facturó— y se llevaba los rangos por cascada, que es
    // justo el registro de qué números se usaron. Para sacarla de circulación se desactiva.
    const emitidas = await Sale.count({ where: { serie_id: serie.id } });
    if (emitidas > 0) {
      throw new Error(
        `No se puede eliminar: la serie ya tiene ${emitidas} documento(s) emitido(s). ` +
        `Desactívala si no querés que se siga usando.`
      );
    }

    // Las notas de crédito no guardan el id de su serie, solo el número impreso, así que el
    // rastro de una serie NC ya usada es su prefijo.
    if (serie.type === "nc") {
      const ncEmitidas = await Return.count({ where: { nc_number: { [Op.like]: `${serie.prefix}-%` } } });
      if (ncEmitidas > 0) {
        throw new Error(
          `No se puede eliminar: la serie ya emitió ${ncEmitidas} nota(s) de crédito. ` +
          `Desactívala si no querés que se siga usando.`
        );
      }
    }

    // Un rango empezado significa que salió al menos un número, aunque el documento se haya
    // borrado después.
    const rangos = await SerieRange.findAll({ where: { serie_id: serie.id } });
    const consumidos = rangos.reduce((acc, r) => acc + Math.max(0, r.current_number - r.start_number), 0);
    if (consumidos > 0) {
      throw new Error(
        `No se puede eliminar: la serie ya consumió ${consumidos} correlativo(s). ` +
        `Desactívala si no querés que se siga usando.`
      );
    }

    // Desvincularla en silencio dejaría facturas numerando sus NC con otro talonario.
    const vinculadas = await Serie.findAll({ where: { nc_serie_id: serie.id }, attributes: ["name"] });
    if (vinculadas.length) {
      throw new Error(
        `No se puede eliminar: ${vinculadas.map(s => `"${s.name}"`).join(", ")} la usa(n) como serie de ` +
        `notas de crédito. Desvinculala primero.`
      );
    }

    await serie.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// POST /api/series/:id/ranges
const addRange = async (req, res) => {
  try {
    const { start_number, end_number } = req.body;
    if (!start_number || !end_number) throw new Error("start_number y end_number son requeridos");
    const start = parseInt(start_number);
    const end   = parseInt(end_number);
    if (end <= start) throw new Error("end_number debe ser mayor que start_number");
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");

    // Validar solapamiento con rangos existentes de la misma serie
    const overlap = await SerieRange.findOne({
      where: {
        serie_id: serie.id,
        start_number: { [Op.lte]: end },
        end_number:   { [Op.gte]: start },
      },
    });
    if (overlap) {
      const pad = serie.padding || 4;
      const fmt = (n) => `${serie.prefix}-${String(n).padStart(pad, "0")}`;
      throw new Error(`El rango se solapa con uno existente (${fmt(overlap.start_number)} → ${fmt(overlap.end_number)})`);
    }

    const range = await SerieRange.create({ serie_id: serie.id, start_number: start, end_number: end, current_number: start });
    res.json({ ok: true, data: range });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// DELETE /api/series/ranges/:rangeId
const removeRange = async (req, res) => {
  try {
    const range = await SerieRange.findByPk(req.params.rangeId);
    if (!range) throw new Error("Rango no encontrado");
    await range.destroy();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

// PUT /api/series/:id/users  — asignar empleados a la serie
const assignUsers = async (req, res) => {
  try {
    const { user_ids } = req.body;
    const serie = await Serie.findByPk(req.params.id);
    if (!serie) throw new Error("Serie no encontrada");
    await serie.setEmployees(user_ids || []);
    // Recarga con usuarios asignados
    const updated = await Serie.findByPk(serie.id, {
      include: [{ model: Employee, attributes: ['id', 'full_name'], through: { attributes: [] } }],
    });
    res.json({ ok: true, data: updated });
  } catch (err) {
    res.status(400).json({ ok: false, message: err.message });
  }
};

module.exports = { getAll, getMy, create, update, remove, addRange, removeRange, assignUsers };
