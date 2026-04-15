'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const process = require('process');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.js')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(config.database, config.username, config.password, config);
}

fs
  .readdirSync(__dirname)
  .filter(file => {
    return (
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
    );
  })
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
    db[model.name] = model;
  });

const { tenantStorage } = require('../utils/tenantStorage');

const tenantModels = [
  'Employee', 'Category', 'Product', 'Bank', 'PaymentMethod', 'Warehouse', 
  'Customer', 'PaymentJournal', 'Serie', 'Sale', 'Purchase', 'Payment', 
  'CashSession', 'Expense', 'ProductLot', 'PurchasePayment', 'StockTransfer'
];

const applyTenantFilter = (modelName, options) => {
  const store = tenantStorage.getStore();
  if (store && store.company_id && tenantModels.includes(modelName)) {
    if (!options.where) options.where = {};
    options.where.company_id = store.company_id;
  }
};

// NOTE: sequelize global beforeFind does NOT populate options.model in Sequelize v6,
// so the filter must be registered per-model (see below after models are loaded).
sequelize.addHook('beforeUpdate',      (instance, options) => applyTenantFilter(instance.constructor.name, options));
sequelize.addHook('beforeDestroy',     (instance, options) => applyTenantFilter(instance.constructor.name, options));
sequelize.addHook('beforeBulkUpdate',  (options) => {
  // options.model is a class, not undefined, for bulk hooks
  applyTenantFilter(options.model?.name, options);
});
sequelize.addHook('beforeBulkDestroy', (options) => {
  applyTenantFilter(options.model?.name, options);
});


sequelize.addHook('beforeCreate', (instance, options) => {
  const store = tenantStorage.getStore();
  if (store && store.company_id && tenantModels.includes(instance.constructor.name)) {
    if (!instance.company_id) {
      instance.company_id = store.company_id;
    }
  }
});

sequelize.addHook('beforeBulkCreate', (instances, options) => {
  const store = tenantStorage.getStore();
  if (store && store.company_id) {
    instances.forEach(instance => {
      if (tenantModels.includes(instance.constructor.name) && !instance.company_id) {
        instance.company_id = store.company_id;
      }
    });
  }
});

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Register per-model beforeFind hooks so `this.name` is available (global beforeFind
// in Sequelize v6 does NOT expose options.model, making tenant filtering impossible).
tenantModels.forEach(modelName => {
  const model = db[modelName];
  if (!model) return;

  const hookFn = function(options) {
    const store = tenantStorage.getStore();
    if (store && store.company_id) {
      if (!options.where) options.where = {};
      options.where.company_id = store.company_id;
    }
  };

  model.addHook('beforeFind', hookFn);
  model.addHook('beforeCount', hookFn);
});

// Centralized associations
const { Company, Role, Employee, Category, Product, Bank, PaymentMethod, Currency, PaymentJournal, Warehouse, Customer, Sale, SaleItem, Purchase, PurchaseItem, ProductStock, StockTransfer, EmployeeWarehouse, Payment, Serie, SerieRange, UserSerie, ProductComboItem, CashSession, CashSessionJournal, Return, ReturnItem, ProductLot, Expense, ExpenseCategory, PurchasePayment } = db;

// ── Company Associations ────────────────────────────────────────
if (Company) {
  const tenantModels = [
    Employee, Category, Product, Bank, PaymentMethod, Warehouse, 
    Customer, PaymentJournal, Serie, Sale, Purchase, Payment, 
    CashSession, Expense, ProductLot, PurchasePayment, StockTransfer
  ];
  tenantModels.forEach(model => {
    if (model) {
      model.belongsTo(Company, { foreignKey: 'company_id' });
      Company.hasMany(model, { foreignKey: 'company_id' });
    }
  });
}

if(Return && Sale && Employee && ReturnItem && Product) {
  Return.belongsTo(Sale, { foreignKey: 'sale_id' });
  Sale.hasMany(Return, { foreignKey: 'sale_id' });
  Return.belongsTo(Employee, { foreignKey: 'employee_id' });
  Return.hasMany(ReturnItem, { foreignKey: 'return_id' });
  ReturnItem.belongsTo(Return, { foreignKey: 'return_id' });
  ReturnItem.belongsTo(Product, { foreignKey: 'product_id' });
  ReturnItem.belongsTo(SaleItem, { foreignKey: 'sale_item_id' });
  SaleItem.hasMany(ReturnItem, { foreignKey: 'sale_item_id' });
}

if(Employee && Role) {
  Employee.belongsTo(Role, { foreignKey: 'role_id' });
  Role.hasMany(Employee, { foreignKey: 'role_id' });
}

if(Product && Category) {
  Product.belongsTo(Category, { foreignKey: 'category_id' });
  Category.hasMany(Product, { foreignKey: 'category_id' });
}

if(Product && ProductComboItem) {
  Product.hasMany(ProductComboItem, { as: 'comboItems', foreignKey: 'combo_id' });
  ProductComboItem.belongsTo(Product, { as: 'ingredient', foreignKey: 'product_id' });
}

if(PaymentJournal && Bank && Currency) {
  PaymentJournal.belongsTo(Bank, { foreignKey: 'bank_id' });
  Bank.hasMany(PaymentJournal, { foreignKey: 'bank_id' });
  PaymentJournal.belongsTo(Currency, { foreignKey: 'currency_id' });
  Currency.hasMany(PaymentJournal, { foreignKey: 'currency_id' });
}

if(Sale && Customer && Employee && Currency && PaymentJournal && Warehouse && PaymentMethod && SaleItem && Product) {
  Sale.belongsTo(Customer, { foreignKey: 'customer_id' });
  Customer.hasMany(Sale, { foreignKey: 'customer_id' });
  Sale.belongsTo(Employee, { foreignKey: 'employee_id' });
  Sale.belongsTo(Currency, { foreignKey: 'currency_id' });
  Sale.belongsTo(PaymentJournal, { foreignKey: 'payment_journal_id' });
  Sale.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
  Sale.belongsTo(PaymentMethod, { foreignKey: 'payment_method_id' });
  PaymentMethod.hasMany(Sale, { foreignKey: 'payment_method_id' });

  // Inversa necesaria para el summary de diarios de pago
  PaymentJournal.hasMany(Sale, { foreignKey: 'payment_journal_id' });

  Sale.hasMany(SaleItem, { foreignKey: 'sale_id' });
  SaleItem.belongsTo(Sale, { foreignKey: 'sale_id' });
  SaleItem.belongsTo(Product, { foreignKey: 'product_id' });
}

if(Purchase && Customer && Employee && Warehouse && PurchaseItem && Product) {
  Purchase.belongsTo(Customer, { foreignKey: 'supplier_id', as: 'Supplier' });
  Customer.hasMany(Purchase, { foreignKey: 'supplier_id', as: 'SupplierPurchases' });
  Purchase.belongsTo(Employee, { foreignKey: 'employee_id' });
  Purchase.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });

  Purchase.hasMany(PurchaseItem, { foreignKey: 'purchase_id' });
  PurchaseItem.belongsTo(Purchase, { foreignKey: 'purchase_id' });
  PurchaseItem.belongsTo(Product, { foreignKey: 'product_id' });
}

if (ProductLot && Product && Warehouse) {
  ProductLot.belongsTo(Product,   { foreignKey: 'product_id' });
  ProductLot.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
  Product.hasMany(ProductLot,   { foreignKey: 'product_id' });
  Warehouse.hasMany(ProductLot, { foreignKey: 'warehouse_id' });
}

if(Product && Warehouse && ProductStock) {
  Product.belongsToMany(Warehouse, { through: ProductStock, foreignKey: 'product_id' });
  Warehouse.belongsToMany(Product, { through: ProductStock, foreignKey: 'warehouse_id' });
  Product.hasMany(ProductStock, { as: 'stocks', foreignKey: 'product_id' });
  Warehouse.hasMany(ProductStock, { foreignKey: 'warehouse_id' });
  // Inversas necesarias para eager loading desde ProductStock
  ProductStock.belongsTo(Product, { foreignKey: 'product_id' });
  ProductStock.belongsTo(Warehouse, { foreignKey: 'warehouse_id' });
}

if(Employee && Warehouse && EmployeeWarehouse) {
  Employee.belongsToMany(Warehouse, { through: EmployeeWarehouse, foreignKey: 'employee_id' });
  Warehouse.belongsToMany(Employee, { through: EmployeeWarehouse, foreignKey: 'warehouse_id' });
  Employee.hasMany(EmployeeWarehouse, { foreignKey: 'employee_id' });
  Warehouse.hasMany(EmployeeWarehouse, { foreignKey: 'warehouse_id' });
}

if(StockTransfer && Warehouse && Product && Employee) {
  StockTransfer.belongsTo(Warehouse, { as: 'FromWarehouse', foreignKey: 'from_warehouse_id' });
  StockTransfer.belongsTo(Warehouse, { as: 'ToWarehouse', foreignKey: 'to_warehouse_id' });
  StockTransfer.belongsTo(Product, { foreignKey: 'product_id' });
  StockTransfer.belongsTo(Employee, { foreignKey: 'employee_id' });
}

if(Payment && Sale && Customer && Employee && Currency && PaymentJournal) {
  Payment.belongsTo(Sale,           { foreignKey: 'sale_id' });
  Sale.hasMany(Payment,             { foreignKey: 'sale_id' });
  Payment.belongsTo(Customer,       { foreignKey: 'customer_id' });
  Payment.belongsTo(Employee,       { foreignKey: 'employee_id' });
  Payment.belongsTo(Currency,       { foreignKey: 'currency_id' });
  Payment.belongsTo(PaymentJournal, { foreignKey: 'payment_journal_id' });
  PaymentJournal.hasMany(Payment,   { foreignKey: 'payment_journal_id' });
}

if (Serie && SerieRange && Employee && UserSerie) {
  Serie.hasMany(SerieRange, { foreignKey: 'serie_id', onDelete: 'CASCADE' });
  SerieRange.belongsTo(Serie, { foreignKey: 'serie_id' });

  Serie.belongsToMany(Employee, { through: UserSerie, foreignKey: 'serie_id', otherKey: 'user_id' });
  Employee.belongsToMany(Serie, { through: UserSerie, foreignKey: 'user_id', otherKey: 'serie_id' });
}

if (Sale && Serie && SerieRange) {
  Sale.belongsTo(Serie,      { foreignKey: 'serie_id' });
  Sale.belongsTo(SerieRange, { foreignKey: 'serie_range_id' });
}

const { Setting } = db;

if (CashSession && Employee && Warehouse && CashSessionJournal && PaymentJournal) {
  CashSession.belongsTo(Employee,  { as: 'employee',  foreignKey: 'employee_id' });
  CashSession.belongsTo(Warehouse, { as: 'warehouse', foreignKey: 'warehouse_id' });
  CashSession.hasMany(CashSessionJournal, { as: 'journals', foreignKey: 'session_id' });
  CashSessionJournal.belongsTo(CashSession,   { foreignKey: 'session_id' });
  CashSessionJournal.belongsTo(PaymentJournal, { as: 'journal', foreignKey: 'journal_id' });
}

if (Expense && ExpenseCategory && PaymentJournal && Employee && Currency) {
  ExpenseCategory.hasMany(Expense, { foreignKey: 'category_id' });
  PaymentJournal.hasMany(Expense, { foreignKey: 'payment_journal_id' });
}

if (PurchasePayment && Purchase && PaymentJournal && Currency && Employee) {
  Purchase.hasMany(PurchasePayment, { foreignKey: 'purchase_id' });
  PurchasePayment.belongsTo(Purchase,        { foreignKey: 'purchase_id' });
  PurchasePayment.belongsTo(PaymentJournal,  { foreignKey: 'payment_journal_id' });
  PurchasePayment.belongsTo(Currency,        { foreignKey: 'currency_id' });
  PurchasePayment.belongsTo(Employee,        { foreignKey: 'employee_id' });
  PaymentJournal.hasMany(PurchasePayment,    { foreignKey: 'payment_journal_id' });
}

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
