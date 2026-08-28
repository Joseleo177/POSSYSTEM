const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { Company, Employee, Role, Currency, ExpenseCategory, IncomeCategory, sequelize } = require("../models");
const models = require("../models");
const { runWithoutTenant } = require("../utils/tenantStorage");
const { invalidateCompanyStatus } = require("../utils/companyStatusCache");
const { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } = require("../config/defaultCategories");

// Longitud mínima de la contraseña que el superusuario fija a mano. Las generadas al azar
// son de 12 caracteres hex, así que el mínimo solo afecta a las escritas.
const MIN_PASSWORD = 8;

/**
 * La suscripción vence al FINAL del día elegido.
 *
 * El formulario manda "YYYY-MM-DD" y `expires_at` es timestamptz: guardado tal cual, el
 * navegador/Node lo interpreta como medianoche UTC, que en Caracas (-4) es las 20:00 del
 * día ANTERIOR. Una empresa con "Vence: 17/9" dejaba de trabajar la tarde del 16.
 */
function normalizeExpiry(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (!m) return value; // ya viene con hora (ISO completo): se respeta
  return new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999);
}

// GET /api/companies
const getAll = async (req, res) => {
  try {
    if (!req.is_superuser) {
      return res.status(403).json({ ok: false, message: "Acceso denegado" });
    }
    const companies = await Company.findAll({
      order: [['id', 'ASC']]
    });
    res.json({ ok: true, companies });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al obtener empresas" });
  }
};

// POST /api/companies
const create = async (req, res) => {
  try {
    if (!req.is_superuser) return res.status(403).json({ ok: false, message: "Acceso denegado" });

    const { name, tax_id, address, phone, email, plan_name, subscription_status, expires_at, max_users, admin_username, admin_password } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "Nombre es requerido" });

    const wantedUser = admin_username?.trim() || null;
    const wantedPass = admin_password?.trim() || null;

    // Las credenciales se validan ANTES de tocar la base: si fallaran a mitad del alta, la
    // empresa quedaría creada y sin administrador con quien entrar.
    if (wantedPass && wantedPass.length < MIN_PASSWORD) {
      return res.status(400).json({ ok: false, message: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` });
    }
    if (wantedUser && !/^[a-zA-Z0-9._-]{3,100}$/.test(wantedUser)) {
      return res.status(400).json({ ok: false, message: "El usuario admite entre 3 y 100 caracteres: letras, números, punto, guion y guion bajo" });
    }
    // employees.username es único en TODA la instalación, no por empresa: sin esta
    // comprobación, repetir "admin" reventaba al final del alta.
    if (wantedUser) {
      const taken = await runWithoutTenant(() => Employee.findOne({ where: { username: wantedUser }, attributes: ['id'] }));
      if (taken) return res.status(409).json({ ok: false, message: `El usuario "${wantedUser}" ya está en uso` });
    }

    // New trial default if not specified
    const expDate = normalizeExpiry(expires_at) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days trial

    const rawPassword = wantedPass || crypto.randomBytes(6).toString('hex'); // 12-char random password
    const password_hash = await bcrypt.hash(rawPassword, 10);

    // Empresa, monedas y administrador nacen juntos o no nace ninguno: una empresa a medias
    // —creada pero sin usuario— solo se puede arreglar a mano en la base.
    const { company, username } = await sequelize.transaction(async (transaction) => {
      const company = await Company.create({
        name, tax_id, address, phone, email,
        plan_name: plan_name || 'Básico',
        subscription_status: subscription_status || 'Demo',
        expires_at: expDate,
        max_users: max_users || 5
      }, { transaction });

      const adminRole = await Role.findOne({ where: { name: 'admin' }, transaction });
      const roleId = adminRole ? adminRole.id : 1;

      // Seed default currencies for this specific company
      await Currency.bulkCreate([
        { code: 'USD', name: 'Dólar Americano', symbol: 'Ref.', exchange_rate: 1.0, is_base: true, active: true, company_id: company.id },
        { code: 'VES', name: 'Bolívar Venezolano', symbol: 'Bs.', exchange_rate: 36.0, is_base: false, active: true, company_id: company.id }
      ], { transaction });

      // Sin categorías, la empresa nace sin poder mover dinero: `expenses.category_id` e
      // `incomes.category_id` son NOT NULL, así que el desplegable salía vacío y no se podía
      // guardar ni un gasto hasta que alguien las escribiera a mano en la base.
      //
      // El `company_id` va explícito, igual que en las monedas: el hook de tenant solo
      // completa el que falta, y aquí quien crea es el superusuario —le pondría su propia
      // empresa, no la que se está dando de alta—.
      await ExpenseCategory.bulkCreate(
        DEFAULT_EXPENSE_CATEGORIES.map((name) => ({ name, active: true, company_id: company.id })),
        { transaction }
      );
      await IncomeCategory.bulkCreate(
        DEFAULT_INCOME_CATEGORIES.map((name) => ({ name, active: true, company_id: company.id })),
        { transaction }
      );

      const username = wantedUser || `admin_${company.id}`;

      await Employee.create({
        username,
        password_hash,
        full_name: `Administrador - ${company.name}`,
        email: email || `admin@empresa${company.id}.local`,
        phone: phone || null,
        role_id: roleId,
        company_id: company.id,
        is_superuser: false,
        active: true
      }, { transaction });

      return { company, username };
    });

    const responseCompany = company.toJSON();
    responseCompany.default_credentials = { username, password: rawPassword };

    res.status(201).json({ ok: true, company: responseCompany });
  } catch (err) {
    console.error(err);
    // Carrera con otro alta simultánea: el índice único es la última palabra.
    if (err.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ ok: false, message: "Ese usuario ya está en uso" });
    }
    res.status(500).json({ ok: false, message: "Error al crear empresa" });
  }
};

// PUT /api/companies/:id
const update = async (req, res) => {
  try {
    if (!req.is_superuser) return res.status(403).json({ ok: false, message: "Acceso denegado" });
    const { id } = req.params;
    const { name, tax_id, address, phone, email, active, plan_name, subscription_status, expires_at, max_users } = req.body;

    const company = await Company.findByPk(id);
    if (!company) return res.status(404).json({ ok: false, message: "Empresa no encontrada" });

    await company.update({
      name, tax_id, address, phone, email, active,
      plan_name, subscription_status, expires_at: normalizeExpiry(expires_at), max_users
    });
    // Suspender o reactivar tiene que notarse ya: sin esto, la caché del middleware seguiría
    // dejando pasar (o bloqueando) a esa empresa hasta que venciera el TTL.
    invalidateCompanyStatus(company.id);
    res.json({ ok: true, company });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar empresa" });
  }
};

// Orden de borrado: de hijas a padres.
//
// No basta con borrar la empresa y confiar en el ON DELETE CASCADE de company_id: hay 19
// claves foráneas con NO ACTION/RESTRICT entre tablas de la misma empresa (quotations →
// sales, expenses → employees, product_combo_items → products…) y la cascada aborta al
// chocar con cualquiera de ellas. Este orden las respeta; lo que cuelga de una fila
// borrada (sale_items, quotation_items, promotion_products…) cae solo por su propia
// cascada.
const DELETE_ORDER = [
  'Quotation',                                   // bloquea sales, customers, warehouses, employees
  'Expense', 'Income', 'PurchasePayment',        // bloquean employees, currencies, journals y categorías
  'ProductComboItem',                            // RESTRICT sobre products
  'Payment', 'ReturnItem', 'Return',
  'Sale', 'Purchase',
  'StockTransfer', 'ProductStock', 'ProductLot',
  'CashSessionJournal', 'CashSession', 'StockSession',
  'UserSerie', 'Serie',
  'EmployeeWarehouse', 'Warehouse',
  'Promotion',
  'Product', 'Category',
  'Customer',
  'PaymentJournal', 'PaymentMethod', 'Bank',
  'ExpenseCategory', 'IncomeCategory',
  'Currency', 'Setting',
  'Employee',
];

// DELETE /api/companies/:id
const remove = async (req, res) => {
  try {
    if (!req.is_superuser) return res.status(403).json({ ok: false, message: "Acceso denegado" });
    const companyId = parseInt(req.params.id, 10);
    if (!Number.isInteger(companyId)) {
      return res.status(400).json({ ok: false, message: "Identificador de empresa inválido" });
    }

    if (companyId === 1) {
      return res.status(400).json({ ok: false, message: "No se puede eliminar la Empresa Principal (#001)" });
    }
    // Nadie borra la empresa desde la que está trabajando: se quedaría sin sesión a mitad.
    if (req.company_id === companyId) {
      return res.status(400).json({ ok: false, message: "No puedes eliminar la empresa desde la que estás conectado" });
    }

    const company = await Company.findByPk(companyId);
    if (!company) return res.status(404).json({ ok: false, message: "Empresa no encontrada" });

    const nombre = company.name;

    // El bypass va aquí y solo aquí: sin él, el filtro de empresa reescribiría cada
    // `where: { company_id }` con la empresa del superusuario y el borrado apuntaría a los
    // datos equivocados.
    await runWithoutTenant(() => sequelize.transaction(async (transaction) => {
      for (const modelName of DELETE_ORDER) {
        if (models[modelName]) {
          await models[modelName].destroy({ where: { company_id: companyId }, transaction });
        }
      }
      await company.destroy({ transaction });
    }));

    invalidateCompanyStatus(companyId);
    res.json({ ok: true, message: `Empresa "${nombre}" y todos sus datos han sido eliminados por completo` });
  } catch (err) {
    // El detalle va al log del servidor, no al cliente: el mensaje de Postgres nombra
    // tablas y restricciones internas.
    console.error("DELETE COMPANY ERROR:", err);
    res.status(500).json({ ok: false, message: "No se pudo eliminar la empresa. Revisa el log del servidor." });
  }
};

module.exports = { getAll, create, update, remove };
