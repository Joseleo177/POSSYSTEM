'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction();
    try {
      // 1. Crear tabla de compañías
      await queryInterface.createTable('companies', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        name: { type: Sequelize.STRING(200), allowNull: false },
        tax_id: { type: Sequelize.STRING(50), allowNull: true },
        address: { type: Sequelize.TEXT, allowNull: true },
        phone: { type: Sequelize.STRING(20), allowNull: true },
        email: { type: Sequelize.STRING(150), allowNull: true },
        active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        logo_url: { type: Sequelize.STRING(255), allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') }
      }, { transaction });

      // 2. Insertar Empresa Principal
      await queryInterface.sequelize.query(
        "INSERT INTO companies (id, name, active, created_at, updated_at) VALUES (1, 'Empresa Principal', true, NOW(), NOW()) ON CONFLICT (id) DO NOTHING",
        { transaction }
      );

      // 3. Añadir is_superuser a employees
      await queryInterface.addColumn('employees', 'is_superuser', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      }, { transaction });

      // Marcar al admin inicial como superuser (opcional, pero ayuda)
      await queryInterface.sequelize.query(
        "UPDATE employees SET is_superuser = true WHERE username = 'admin'",
        { transaction }
      );

      // 4. Listado de tablas que necesitan company_id
      const tablesToUpdate = [
        'employees', 'categories', 'products', 'banks', 'payment_methods', 
        'warehouses', 'customers', 'payment_journals', 'series', 'sales', 
        'payments', 'purchases', 'returns', 'settings', 'audit_logs',
        'stock_transfers', 'cash_sessions', 'product_lots', 'purchase_payments'
      ];

      for (const table of tablesToUpdate) {
        // Añadir columna company_id
        await queryInterface.addColumn(table, 'company_id', {
          type: Sequelize.INTEGER,
          allowNull: true, // Temporalmente null para poder migrar datos
          references: { model: 'companies', key: 'id' },
          onDelete: 'CASCADE'
        }, { transaction });

        // Asignar datos actuales a la Empresa 1
        await queryInterface.sequelize.query(
          `UPDATE "${table}" SET company_id = 1 WHERE company_id IS NULL`,
          { transaction }
        );

        // Hacer la columna obligatoria (opcional, depende de si queremos entidades globales)
        // Por ahora la dejamos opcional para roles/monedas si decidimos no moverlos, 
        // pero para estas tablas sí debería ser obligatorio.
        await queryInterface.changeColumn(table, 'company_id', {
          type: Sequelize.INTEGER,
          allowNull: false
        }, { transaction });
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Reversión simplificada (eliminar tabla companies encadenado)
    await queryInterface.removeColumn('employees', 'is_superuser');
    const tablesToRemove = [
        'employees', 'categories', 'products', 'banks', 'payment_methods', 
        'warehouses', 'customers', 'payment_journals', 'series', 'sales', 
        'payments', 'purchases', 'returns', 'settings', 'audit_logs',
        'stock_transfers', 'cash_sessions', 'product_lots', 'purchase_payments'
    ];
    for (const table of tablesToRemove) {
        await queryInterface.removeColumn(table, 'company_id');
    }
    await queryInterface.dropTable('companies');
  }
};
