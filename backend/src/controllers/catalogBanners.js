const { CatalogBanner, sequelize } = require("../models");
const { imageUrl, saveImage, deleteImage } = require("../utils/imageStorage");

// Máximo de banners por tienda. No es una restricción técnica: cada uno es una imagen grande
// que el cliente descarga al abrir la vitrina, y una tienda con quince banners tiene una
// portada que nadie termina de ver y un teléfono que tarda en cargarla.
const MAX_BANNERS = 8;

// El aislamiento por empresa va explícito en TODAS las consultas de este módulo, y no
// delegado en los hooks de models/index.js.
//
// El motivo es multer: el filtro por empresa viaja en un AsyncLocalStorage que arranca el
// middleware `auth`, y el parseo de multipart rompe esa cadena. En una ruta con archivos el
// hook ya no ve el contexto, así que un create nace sin company_id y —lo grave— un findByPk
// alcanzaría el banner de cualquier otra tienda. Es la misma razón por la que products pasa
// company_id a mano en todo su servicio.
//
// Regla: si la ruta sube archivos, el company_id se pasa a mano.
const tenant = (req) => req.employee?.company_id ?? null;

const toJSON = (b) => {
  const j = b.toJSON();
  return {
    ...j,
    image_url: imageUrl(j.image_filename),
    image_mobile_url: imageUrl(j.image_mobile_filename),
  };
};

const getAll = async (req, res) => {
  try {
    const rows = await CatalogBanner.findAll({
      where: { company_id: tenant(req) },
      order: [["sort_order", "ASC"], ["id", "ASC"]],
    });
    res.json({ ok: true, data: rows.map(toJSON) });
  } catch (err) {
    console.error("[catalog-banners]", err);
    res.status(500).json({ ok: false, message: "Error al obtener los banners" });
  }
};

// Los campos de texto llegan por multipart junto a los archivos, así que todo viene como
// string: "false" es un valor verdadero en JavaScript y hay que compararlo, no evaluarlo.
const parseBool = (v, fallback) => {
  if (v === undefined || v === null || v === "") return fallback;
  return v === true || v === "true" || v === "1";
};

const trim = (v, max) => {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
};

// El enlace del banner termina en un href de la página pública, así que solo se aceptan
// direcciones http(s) o rutas internas. Sin esto, un `javascript:` guardado desde el panel
// se ejecutaría en el navegador de cada cliente que tocara el banner.
const cleanLink = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s) || s.startsWith("/")) return s.slice(0, 500);
  return null;
};

const create = async (req, res) => {
  try {
    const image = req.files?.image?.[0];
    if (!image) return res.status(400).json({ ok: false, message: "Falta la imagen del banner" });

    const company_id = tenant(req);
    const count = await CatalogBanner.count({ where: { company_id } });
    if (count >= MAX_BANNERS) {
      return res.status(400).json({ ok: false, message: `El carrusel admite hasta ${MAX_BANNERS} banners.` });
    }

    // Al final de la lista: el orden lo ajusta después quien lo suba, pero un banner nuevo
    // no debería empujar hacia abajo a la campaña que está corriendo hoy.
    const last = await CatalogBanner.max("sort_order", { where: { company_id } });
    const banner = await CatalogBanner.create({
      company_id,
      title:     trim(req.body.title, 120),
      alt_text:  trim(req.body.alt_text, 200),
      link_url:  cleanLink(req.body.link_url),
      active:    parseBool(req.body.active, true),
      sort_order: Number.isFinite(last) ? last + 1 : 0,
      image_filename:        await saveImage(image, "banner"),
      image_mobile_filename: await saveImage(req.files?.image_mobile?.[0], "banner"),
    });

    res.status(201).json({ ok: true, data: toJSON(banner) });
  } catch (err) {
    console.error("[catalog-banners]", err);
    res.status(500).json({ ok: false, message: "Error al crear el banner" });
  }
};

const update = async (req, res) => {
  try {
    // Por id Y empresa: sin el segundo filtro, un id adivinado alcanzaría el banner de otra
    // tienda (ver la nota sobre multer arriba).
    const banner = await CatalogBanner.findOne({ where: { id: req.params.id, company_id: tenant(req) } });
    if (!banner) return res.status(404).json({ ok: false, message: "Banner no encontrado" });

    const patch = {
      title:    trim(req.body.title, 120),
      alt_text: trim(req.body.alt_text, 200),
      link_url: cleanLink(req.body.link_url),
      active:   parseBool(req.body.active, banner.active),
    };

    // Las imágenes solo se tocan si vinieron: guardar el título de un banner no puede
    // dejarlo sin arte. Primero se guarda la nueva y después se borra la vieja — al revés,
    // un fallo de subida deja el banner sin imagen y sin forma de recuperarla.
    const image = req.files?.image?.[0];
    if (image) {
      const old = banner.image_filename;
      patch.image_filename = await saveImage(image, "banner");
      await deleteImage(old);
    }

    const mobile = req.files?.image_mobile?.[0];
    if (mobile) {
      const old = banner.image_mobile_filename;
      patch.image_mobile_filename = await saveImage(mobile, "banner");
      await deleteImage(old);
    } else if (parseBool(req.body.clear_mobile, false)) {
      // Quitar el arte de móvil y volver a usar el de escritorio es una acción explícita:
      // no basta con no mandar el archivo, porque eso es lo que pasa en cada guardado.
      await deleteImage(banner.image_mobile_filename);
      patch.image_mobile_filename = null;
    }

    await banner.update(patch);
    res.json({ ok: true, data: toJSON(banner) });
  } catch (err) {
    console.error("[catalog-banners]", err);
    res.status(500).json({ ok: false, message: "Error al actualizar el banner" });
  }
};

const remove = async (req, res) => {
  try {
    const banner = await CatalogBanner.findOne({ where: { id: req.params.id, company_id: tenant(req) } });
    if (!banner) return res.status(404).json({ ok: false, message: "Banner no encontrado" });

    const files = [banner.image_filename, banner.image_mobile_filename];
    await banner.destroy();
    // Después de borrar el registro: si la fila no se va, los archivos tienen que seguir ahí.
    for (const f of files) await deleteImage(f);

    res.json({ ok: true, message: "Banner eliminado" });
  } catch (err) {
    console.error("[catalog-banners]", err);
    res.status(500).json({ ok: false, message: "Error al eliminar el banner" });
  }
};

// Reordenar llega con la lista completa de ids en el orden nuevo, no con posiciones sueltas:
// arrastrar un banner cambia la posición de todos los que estaban debajo, y mandarlo campo a
// campo deja el carrusel a medio ordenar si una de las peticiones falla.
const reorder = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (!ids.length) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "Falta el orden de los banners" });
    }

    // Se cotejan contra los banners de la empresa: así una lista con un id ajeno no puede
    // tocar el banner de otra tienda.
    const company_id = tenant(req);
    const propios = await CatalogBanner.findAll({ where: { company_id }, attributes: ["id"], transaction: t });
    const permitidos = new Set(propios.map((b) => b.id));

    let pos = 0;
    for (const id of ids) {
      if (!permitidos.has(id)) continue;
      await CatalogBanner.update({ sort_order: pos++ }, { where: { id, company_id }, transaction: t });
    }

    await t.commit();
    res.json({ ok: true, message: "Orden guardado" });
  } catch (err) {
    await t.rollback();
    console.error("[catalog-banners]", err);
    res.status(500).json({ ok: false, message: "Error al reordenar" });
  }
};

module.exports = { getAll, create, update, remove, reorder, MAX_BANNERS };
