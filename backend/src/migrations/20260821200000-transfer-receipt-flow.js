'use strict';

// La transferencia deja de ser un movimiento instantáneo y pasa a ser un documento de dos
// tiempos: se despacha (sale del origen, queda EN TRÁNSITO) y se recibe (entra al destino
// solo lo que el receptor confirma). Antes una sola fila descontaba y acreditaba en la misma
// transacción: quien despachaba acreditaba stock en un almacén que no controla y nadie
// firmaba la llegada.
//
// `stock_transfers` pasa a ser la cabecera y nace `stock_transfer_items` con las líneas.
// Las columnas product_id / product_name / qty de la cabecera quedan solo por el histórico
// anterior a esta migración —se vuelven nulables y ninguna transferencia nueva las usa—.
module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      // ── Cabecera ────────────────────────────────────────────────
      await queryInterface.addColumn('stock_transfers', 'code',
        { type: Sequelize.STRING(30), allowNull: true }, { transaction: t });
      // 32 y no menos: 'received_with_differences' ocupa 25 caracteres.
      await queryInterface.addColumn('stock_transfers', 'status',
        { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'sent' }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'difference_status',
        { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'none' }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'dispatched_at',
        { type: Sequelize.DATE, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'received_by',
        { type: Sequelize.INTEGER, allowNull: true, references: { model: 'employees', key: 'id' }, onDelete: 'SET NULL' }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'received_at',
        { type: Sequelize.DATE, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'receipt_note',
        { type: Sequelize.TEXT, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'cancelled_by',
        { type: Sequelize.INTEGER, allowNull: true, references: { model: 'employees', key: 'id' }, onDelete: 'SET NULL' }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'cancelled_at',
        { type: Sequelize.DATE, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('stock_transfers', 'cancel_reason',
        { type: Sequelize.TEXT, allowNull: true }, { transaction: t });

      // El producto ya no vive en la cabecera: pasa a las líneas.
      await queryInterface.changeColumn('stock_transfers', 'product_name',
        { type: Sequelize.STRING(200), allowNull: true }, { transaction: t });
      await queryInterface.changeColumn('stock_transfers', 'qty',
        { type: Sequelize.DECIMAL(10, 3), allowNull: true }, { transaction: t });

      // ── Líneas ──────────────────────────────────────────────────
      await queryInterface.createTable('stock_transfer_items', {
        id:              { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        transfer_id:     { type: Sequelize.INTEGER, allowNull: false, references: { model: 'stock_transfers', key: 'id' }, onDelete: 'CASCADE' },
        product_id:      { type: Sequelize.INTEGER, allowNull: false },
        product_name:    { type: Sequelize.STRING(200), allowNull: false },
        unit:            { type: Sequelize.STRING(20), allowNull: true },
        qty_sent:        { type: Sequelize.DECIMAL(14, 4), allowNull: false },
        // NULL mientras la mercancía viaja: nadie ha contado todavía lo que llegó.
        qty_received:    { type: Sequelize.DECIMAL(14, 4), allowNull: true },
        diff_reason:     { type: Sequelize.STRING(120), allowNull: true },
        diff_resolution: { type: Sequelize.STRING(20), allowNull: true },
        resolved_at:     { type: Sequelize.DATE, allowNull: true },
        created_at:      { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
        updated_at:      { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      }, { transaction: t });

      // ── Histórico ───────────────────────────────────────────────
      // Todo lo transferido hasta hoy ya está físicamente en el destino: entra como recibido
      // sin diferencias, con una línea por fila vieja. Sin esto el listado mostraría años de
      // transferencias como pendientes de recibir.
      await queryInterface.sequelize.query(`
        INSERT INTO stock_transfer_items
          (transfer_id, product_id, product_name, qty_sent, qty_received, created_at, updated_at)
        SELECT id, product_id, product_name, qty, qty, created_at, NOW()
          FROM stock_transfers
         WHERE product_id IS NOT NULL
      `, { transaction: t });

      await queryInterface.sequelize.query(`
        UPDATE stock_transfers
           SET status        = 'received',
               dispatched_at = created_at,
               received_at   = created_at,
               received_by   = employee_id,
               code          = 'TR-' || LPAD(id::text, 6, '0')
      `, { transaction: t });

      await queryInterface.addIndex('stock_transfers', ['company_id', 'status'],
        { name: 'idx_stock_transfers_company_status', transaction: t });
      await queryInterface.addIndex('stock_transfers', ['to_warehouse_id', 'status'],
        { name: 'idx_stock_transfers_dest_status', transaction: t });
      await queryInterface.addIndex('stock_transfers', ['company_id', 'code'],
        { name: 'idx_stock_transfers_company_code', unique: true, transaction: t });
      await queryInterface.addIndex('stock_transfer_items', ['transfer_id'],
        { name: 'idx_stock_transfer_items_transfer', transaction: t });

      await t.commit();
    } catch (err) {
      await t.rollback();
      throw err;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('stock_transfer_items');
    for (const col of ['code', 'status', 'difference_status', 'dispatched_at', 'received_by',
                       'received_at', 'receipt_note', 'cancelled_by', 'cancelled_at', 'cancel_reason']) {
      await queryInterface.removeColumn('stock_transfers', col);
    }
    await queryInterface.changeColumn('stock_transfers', 'product_name', { type: Sequelize.STRING(200), allowNull: false });
    await queryInterface.changeColumn('stock_transfers', 'qty',          { type: Sequelize.DECIMAL(10, 3), allowNull: false });
  },
};
