const { Promotion, Product, Sequelize } = require("../../models");
const { Op } = Sequelize;

// Las promociones que rigen una venta: las de la sucursal donde se factura, más las que corren
// en todas. El filtro tiene que estar en el servidor y no solo en la caja — el descuento se
// recalcula al facturar, así que sin esto una promoción de otra tienda, o ya vencida, se
// seguiría aplicando aunque el carrito no la haya mostrado nunca.
async function cargarPromosActivas(warehouse_id, transaction) {
  const now = new Date();
  return Promotion.findAll({
    where: {
      active: true,
      starts_at: { [Op.lte]: now },
      [Op.and]: [
        { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
        { [Op.or]: [{ warehouse_id: null }, { warehouse_id }] },
      ],
    },
    include: [{ model: Product, through: { attributes: [] }, attributes: ["id"] }],
    // Manda la más reciente cuando dos promociones cubren el mismo producto, igual que en
    // promotions/getActive: la caja aplica la primera que encuentra, así que sin un orden fijo
    // el catálogo podría anunciar un descuento y la factura cobrar otro.
    order: [["starts_at", "DESC"], ["id", "DESC"]],
    transaction,
  });
}

// Descuento TOTAL de la línea (no por unidad). Misma cuenta que hace la caja en
// CartContext.promoLineDiscountUsd, para que el total que se ve sea el que se cobra.
function calcLineDiscount(productId, unitPrice, qty, promos) {
  for (const promo of promos) {
    if (!promo.Products.some((p) => p.id === productId)) continue;
    if (promo.type === "percentage")
      return parseFloat((unitPrice * qty * parseFloat(promo.discount_pct) / 100).toFixed(5));
    if (promo.type === "buy_x_get_y") {
      const freeUnits = Math.floor(qty / (promo.buy_qty + promo.get_qty)) * promo.get_qty;
      return parseFloat((freeUnits * unitPrice).toFixed(5));
    }
  }
  return 0;
}

module.exports = { cargarPromosActivas, calcLineDiscount };
