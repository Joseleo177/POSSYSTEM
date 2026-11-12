'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Product extends Model {
    static associate(models) {}
  }
  Product.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(200), allowNull: false },
    price: { type: DataTypes.DECIMAL(14, 5), allowNull: false },
    stock: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'unidad' },
    qty_step: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1.000 },
    category_id: { type: DataTypes.INTEGER },
    company_id: { type: DataTypes.INTEGER, allowNull: true },
    image_filename: { type: DataTypes.STRING(255) },
    cost_price: { type: DataTypes.DECIMAL(14, 4) },
    profit_margin: { type: DataTypes.DECIMAL(5, 2) },
    package_size: { type: DataTypes.DECIMAL(10, 3) },
    package_unit: { type: DataTypes.STRING(50) },
    bulk_price: { type: DataTypes.DECIMAL(14, 5) },
    // Precio de venta al mayor. El general del producto: cada sucursal puede tener el suyo en
    // product_stock.wholesale_price (NULL = hereda). Ver migraciones 20261118100000 y 20261119100000.
    wholesale_price: { type: DataTypes.DECIMAL(14, 5), allowNull: true },
    // "Al mayor desde" esta cantidad (venta al mayor, 12-11-2026). NULL = solo el cliente mayorista.
    wholesale_min_qty: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    // Contenido del envase como va impreso ("450 ml", "200 g"). Texto libre, solo para mostrar.
    net_content: { type: DataTypes.STRING(30), allowNull: true },
    is_combo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    is_service: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Minutos que dura el servicio en la agenda de citas. Nulo = no se agenda.
    duration_min: { type: DataTypes.SMALLINT, allowNull: true },
    min_stock: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    barcode: { type: DataTypes.STRING(50), allowNull: true },
    // Campos de vitrina: solo los lee el catálogo público (marca sobre el nombre y frase de
    // beneficio debajo). Opcionales; no intervienen en venta ni inventario.
    brand: { type: DataTypes.STRING(80), allowNull: true },
    short_description: { type: DataTypes.STRING(200), allowNull: true },
    // La ficha pública del producto: texto largo en párrafos. Los beneficios (los sellos
    // redondos "Repara y fortalece", "Reduce el frizz") NO son texto libre por producto:
    // son una lista de etiquetas reusable — ver BenefitTag y la tabla puente
    // ProductBenefitTag — para que la misma redacción y el mismo ícono sirvan en todos los
    // productos que comparten ese beneficio, en vez de que cada ficha lo reescriba a mano.
    description: { type: DataTypes.TEXT, allowNull: true },
    visible_in_catalog: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // false = insumo: entra por compras y se consume en combos, pero no se vende en caja ni
    // se publica. Sigue siendo un producto normal para inventario y transferencias.
    sellable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    // Adicional con precio de un plato ("Queso extra"): se vende solo como adicional, así que
    // no aparece en los menús. Ver migración 20261031130000-adicionales.
    is_addon: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Se prepara en cocina: al aceptar un pedido web sus líneas salen marcadas para la comanda.
    // Lo que solo se embolsa (empanadas del exhibidor, un refresco) no. Ver migración
    // 20261101160000-pedidos-etapas.
    kitchen_prep: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Alícuota de IVA: G general, R reducida, A con la adicional de lujo, E exento. Solo pesa
    // en empresas con iva_enabled (ver services/fiscal/iva.js).
    iva_tipo: { type: DataTypes.STRING(1), allowNull: false, defaultValue: 'G' },
    // Variantes (talla, color): la variante es un producto con parent_id hacia su modelo. El
    // modelo (is_variant_parent) es la plantilla: no se vende ni lleva existencias. variant_key
    // son los ids de sus valores ordenados, únicos por modelo. own_price = no sigue el precio
    // del modelo. Ver la migración 20261001120000-product-variants.
    parent_id: { type: DataTypes.INTEGER, allowNull: true },
    is_variant_parent: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    variant_key: { type: DataTypes.STRING(100), allowNull: true },
    own_price: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    // Control por piezas (módulo Fábrica): 'area' (láminas, en M2) o 'length' (tubos,
    // perfiles, en METRO); null = producto normal. Cada pieza se numera al entrar y sus
    // retazos se siguen hasta que no queda nada. Las medidas son el formato habitual, que
    // prellena la compra; cada pieza guarda el suyo propio.
    piece_mode: { type: DataTypes.STRING(10), allowNull: true },
    piece_width_mm: { type: DataTypes.INTEGER, allowNull: true },
    piece_length_mm: { type: DataTypes.INTEGER, allowNull: true },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
  }, {
    sequelize,
    tableName: 'products',
    modelName: 'Product',
    timestamps: false,
    indexes: [
      {
        unique: true,
        fields: ['barcode', 'company_id']
      }
    ]
  });
  return Product;
};
