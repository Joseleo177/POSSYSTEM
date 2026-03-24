const { CashSession, CashSessionJournal, Employee, Warehouse, PaymentJournal, Currency, sequelize, Sequelize } = require("../../models");

const SESSION_INCLUDE = [
  { model: Employee, as: "employee", attributes: ["id", "full_name"] },
  { model: Warehouse, as: "warehouse", attributes: ["id", "name"] },
  {
    model: CashSessionJournal,
    as: "journals",
    include: [
      {
        model: PaymentJournal,
        as: "journal",
        attributes: ["id", "name", "type", "color", "currency_id"],
        include: [{ model: Currency, attributes: ["id", "symbol"] }]
      }
    ],
  },
];

module.exports = {
  CashSession,
  CashSessionJournal,
  sequelize,
  Sequelize,
  SESSION_INCLUDE,
};
