'use strict';

/**
 * Módulo Fábrica: materiales controlados por piezas y órdenes de fabricación.
 *
 * Nació con un taller de acero inoxidable que compra láminas sin código ni lote, las numera y
 * quiere saber qué se fabricó con cada una hasta que no queda nada. Se diseñó genérico para
 * cualquier negocio que corta material y aprovecha lo que sobra:
 *
 *   por área      láminas de acero, vidrio, MDF, cuero (ancho × largo, existencia en M2)
 *   por longitud  tubos, perfiles, cabillas, rollos (largo, existencia en METRO)
 *
 * El material es un PRODUCTO del catálogo con `piece_mode`: se compra por Compras como
 * cualquier otro (la línea guarda las medidas de cada pieza) y al recibirse cada pieza queda
 * numerada. Su existencia sigue en product_stock; las piezas dicen QUÉ hay.
 *
 *   material_pieces            cada pieza numerada y cada retazo que salió de ella
 *   fabrication_orders         la orden: estándar o a medida, para stock o para un cliente
 *   fabrication_order_pieces   qué pieza se entregó al taller y cuánto se consumió al volver
 *   fabrication_order_items    los accesorios (tornillos, bisagras) que se gastaron
 *
 * Cada consumo y cada producto terminado deja su línea de sesión (motivo 'fabricacion'), así
 * que el kardex lo muestra sin una fuente nueva.
 *
 * Las restricciones CHECK repiten las validaciones del servicio a propósito: si algún camino
 * nuevo se las salta, la base no acepta una pieza de área negativa ni una orden en un estado
 * que nadie sabe leer.
 *
 * El módulo se le da a una empresa desde Empresas (companies.fabrica_enabled), igual que la
 * vitrina. Los permisos `factory.*` son nuevos y nadie los hereda.
 */
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });

      await q(`ALTER TABLE companies ADD COLUMN IF NOT EXISTS fabrica_enabled BOOLEAN NOT NULL DEFAULT false`);

      // Formato habitual del material. Cada pieza guarda el suyo: según el proveedor llegan
      // de otros tamaños.
      await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS piece_mode VARCHAR(10)`);
      await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS piece_width_mm INTEGER`);
      await q(`ALTER TABLE products ADD COLUMN IF NOT EXISTS piece_length_mm INTEGER`);
      await q(`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_piece_mode_check`);
      await q(`ALTER TABLE products ADD CONSTRAINT products_piece_mode_check
               CHECK (piece_mode IS NULL OR piece_mode IN ('area', 'length'))`);

      // Medidas de cada pieza que trae una línea de compra de un material por piezas.
      await q(`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS piece_width_mm INTEGER`);
      await q(`ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS piece_length_mm INTEGER`);

      await q(`
        CREATE TABLE IF NOT EXISTS material_pieces (
          id               SERIAL PRIMARY KEY,
          company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          product_id       INTEGER NOT NULL REFERENCES products(id),
          warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id),
          -- "51" para la pieza original; "51-1", "51-1-2" para sus retazos.
          code             VARCHAR(40) NOT NULL,
          root_number      INTEGER NOT NULL,
          parent_id        INTEGER REFERENCES material_pieces(id),
          -- Por longitud solo hay largo. Irregular: ninguna medida, solo el tamaño.
          width_mm         INTEGER CHECK (width_mm IS NULL OR width_mm > 0),
          length_mm        INTEGER CHECK (length_mm IS NULL OR length_mm > 0),
          is_irregular     BOOLEAN NOT NULL DEFAULT false,
          -- En la unidad del producto (m² o m), con los tres decimales de product_stock: así la
          -- suma de las piezas cuadra exacta con la existencia y el consumo no deja residuos.
          size             DECIMAL(12,3) NOT NULL CHECK (size > 0),
          -- Costo por unidad del producto, con los cuatro decimales de cost_price.
          unit_cost        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
          status           VARCHAR(20) NOT NULL DEFAULT 'disponible'
                           -- anulada: retazo de una devolución que se deshizo. Conserva su número.
                           CHECK (status IN ('disponible', 'en_taller', 'consumida', 'baja', 'anulada')),
          origin           VARCHAR(20) NOT NULL DEFAULT 'compra'
                           CHECK (origin IN ('compra', 'carga_inicial', 'existencia', 'retazo')),
          source_order_id  INTEGER,
          -- Sin FK: al anular, la compra se borra con sus líneas y la pieza queda de baja con
          -- la constancia en sus notas.
          purchase_item_id INTEGER,
          reference        VARCHAR(80),
          notes            TEXT,
          employee_id      INTEGER REFERENCES employees(id),
          closed_at        TIMESTAMPTZ,
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS material_pieces_code_key ON material_pieces (company_id, code)`);
      await q(`CREATE INDEX IF NOT EXISTS material_pieces_stock_idx ON material_pieces (company_id, product_id, warehouse_id, status)`);
      await q(`CREATE INDEX IF NOT EXISTS material_pieces_root_idx ON material_pieces (company_id, root_number)`);
      await q(`CREATE INDEX IF NOT EXISTS material_pieces_purchase_idx ON material_pieces (purchase_item_id) WHERE purchase_item_id IS NOT NULL`);
      await q(`CREATE INDEX IF NOT EXISTS material_pieces_parent_idx ON material_pieces (parent_id) WHERE parent_id IS NOT NULL`);

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_orders (
          id               SERIAL PRIMARY KEY,
          company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          number           INTEGER NOT NULL,
          warehouse_id     INTEGER NOT NULL REFERENCES warehouses(id),
          type             VARCHAR(20) NOT NULL DEFAULT 'medida' CHECK (type IN ('estandar', 'medida')),
          -- stock: lo terminado entra al inventario.  cliente: se factura desde la orden.
          destination      VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (destination IN ('stock', 'cliente')),
          product_id       INTEGER REFERENCES products(id),
          description      VARCHAR(300) NOT NULL,
          quantity         DECIMAL(10,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
          customer_id      INTEGER REFERENCES customers(id),
          status           VARCHAR(20) NOT NULL DEFAULT 'abierta' CHECK (status IN ('abierta', 'terminada', 'anulada')),
          material_cost    DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (material_cost >= 0),
          accessories_cost DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (accessories_cost >= 0),
          -- Precio pactado por todo el lote, en moneda base, con los decimales de los precios.
          sale_price       DECIMAL(14,5) CHECK (sale_price IS NULL OR sale_price >= 0),
          sale_id          INTEGER REFERENCES sales(id),
          notes            TEXT,
          employee_id      INTEGER REFERENCES employees(id),
          finished_at      TIMESTAMPTZ,
          invoiced_at      TIMESTAMPTZ,
          cancelled_at     TIMESTAMPTZ,
          cancel_reason    VARCHAR(300),
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE UNIQUE INDEX IF NOT EXISTS fabrication_orders_number_key ON fabrication_orders (company_id, number)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_orders_status_idx ON fabrication_orders (company_id, status, created_at)`);

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_order_pieces (
          id               SERIAL PRIMARY KEY,
          company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          order_id         INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
          piece_id         INTEGER NOT NULL REFERENCES material_pieces(id),
          delivered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          delivered_by     INTEGER REFERENCES employees(id),
          returned_at      TIMESTAMPTZ,
          returned_by      INTEGER REFERENCES employees(id),
          consumed         DECIMAL(12,3) CHECK (consumed IS NULL OR consumed > 0),
          cost             DECIMAL(14,4) CHECK (cost IS NULL OR cost >= 0),
          -- Lo que el taller cuenta al devolver: qué se cortó y por qué quedó así.
          note             TEXT
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_pieces_order_idx ON fabrication_order_pieces (order_id)`);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_pieces_piece_idx ON fabrication_order_pieces (piece_id)`);

      await q(`
        CREATE TABLE IF NOT EXISTS fabrication_order_items (
          id               SERIAL PRIMARY KEY,
          company_id       INTEGER REFERENCES companies(id) ON DELETE CASCADE,
          order_id         INTEGER NOT NULL REFERENCES fabrication_orders(id) ON DELETE CASCADE,
          product_id       INTEGER NOT NULL REFERENCES products(id),
          product_name     VARCHAR(200) NOT NULL,
          quantity         DECIMAL(10,3) NOT NULL CHECK (quantity > 0),
          unit_cost        DECIMAL(14,4) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
          employee_id      INTEGER REFERENCES employees(id),
          created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await q(`CREATE INDEX IF NOT EXISTS fabrication_order_items_order_idx ON fabrication_order_items (order_id)`);
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const q = (sql) => queryInterface.sequelize.query(sql, { transaction });
      await q(`DROP TABLE IF EXISTS fabrication_order_items`);
      await q(`DROP TABLE IF EXISTS fabrication_order_pieces`);
      await q(`DROP TABLE IF EXISTS fabrication_orders`);
      await q(`DROP TABLE IF EXISTS material_pieces`);
      await q(`ALTER TABLE purchase_items DROP COLUMN IF EXISTS piece_length_mm`);
      await q(`ALTER TABLE purchase_items DROP COLUMN IF EXISTS piece_width_mm`);
      await q(`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_piece_mode_check`);
      await q(`ALTER TABLE products DROP COLUMN IF EXISTS piece_length_mm`);
      await q(`ALTER TABLE products DROP COLUMN IF EXISTS piece_width_mm`);
      await q(`ALTER TABLE products DROP COLUMN IF EXISTS piece_mode`);
      await q(`ALTER TABLE companies DROP COLUMN IF EXISTS fabrica_enabled`);
      await q(`UPDATE roles SET permissions = permissions - 'factory.view' - 'factory.manage' - 'factory.invoice' WHERE permissions ?| array['factory.view','factory.manage','factory.invoice']`);
    });
  },
};
