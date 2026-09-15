// Unidades de peso/volumen: admiten decimales. El resto son contables (enteras).
// Espejo de frontend/src/helpers/unitFormatter.js — si una lista cambia, la otra también.
const WEIGHTED_UNITS = ["KG", "KILOGRAMO", "L", "LITRO", "M", "METRO"];

const isIntegerUnit = (unit) => !WEIGHTED_UNITS.includes(String(unit || "").toUpperCase());

/**
 * Lo que de verdad se puede vender, según la unidad en que se vende.
 *
 * Nació por los combos: un paquete de 4 papeles con 3 papeles en existencia da 0,75 paquetes,
 * y 0,75 paquetes no se venden — ni se muestran. La caja anunciaba "1 unidad disponible" (el
 * formateo redondeaba el 0,75 hacia arriba) y al intentar agregarlo saltaba "stock
 * insuficiente"; la vitrina pública, por su parte, publicaba "0.75 UNIDAD".
 *
 * El piso lo pone la unidad del PRODUCTO QUE SE VENDE, no la del ingrediente: un combo por KG
 * que sale de un saco por KG sí rinde decimales (10,5 kg de caraota de un saco de 10,5 kg), y
 * por eso no se puede truncar siempre.
 */
const floorToUnit = (qty, unit) => {
  const n = parseFloat(qty);
  if (!isFinite(n)) return 0;
  return isIntegerUnit(unit) ? Math.floor(n) : Math.floor(n * 1000) / 1000;
};

module.exports = { WEIGHTED_UNITS, isIntegerUnit, floorToUnit };
