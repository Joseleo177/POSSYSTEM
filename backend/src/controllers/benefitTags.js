const { BenefitTag, Product } = require("../models");

// CRUD de etiquetas de beneficio para la ficha pública. Es texto simple sin archivos, así
// que estas rutas nunca pasan por multer y el filtro por empresa lo aplican los hooks de
// tenant sin necesidad de pasar company_id a mano (a diferencia de categorías y banners).

const getAll = async (req, res) => {
  try {
    const tags = await BenefitTag.findAll({
      order: [["name", "ASC"]],
      attributes: {
        include: [
          [
            BenefitTag.sequelize.literal(
              `(SELECT COUNT(*) FROM product_benefit_tags WHERE product_benefit_tags.benefit_tag_id = "BenefitTag".id)`
            ),
            "product_count",
          ],
        ],
      },
    });
    res.json({ ok: true, data: tags });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener los beneficios" });
  }
};

const create = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const [tag, created] = await BenefitTag.findOrCreate({
      where: { name },
      defaults: { name },
    });
    if (!created) return res.status(409).json({ ok: false, message: "Ese beneficio ya existe" });

    res.status(201).json({ ok: true, data: tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al crear el beneficio" });
  }
};

const update = async (req, res) => {
  try {
    const name = String(req.body.name || "").trim().slice(0, 60);
    if (!name) return res.status(400).json({ ok: false, message: "El nombre es requerido" });

    const tag = await BenefitTag.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ ok: false, message: "Beneficio no encontrado" });

    await tag.update({ name });
    res.json({ ok: true, data: tag });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar el beneficio" });
  }
};

const remove = async (req, res) => {
  try {
    const tag = await BenefitTag.findByPk(req.params.id);
    if (!tag) return res.status(404).json({ ok: false, message: "Beneficio no encontrado" });
    // Sin bloqueo por uso, a diferencia de las categorías: borrar un beneficio solo quita el
    // sello de las fichas que lo tenían (CASCADE en product_benefit_tags), no les borra el
    // producto ni les deja un hueco — es exactamente lo que se espera de "ya no lo quiero".
    await tag.destroy();
    res.json({ ok: true, message: "Beneficio eliminado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al eliminar el beneficio" });
  }
};

module.exports = { getAll, create, update, remove };
