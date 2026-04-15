const bcrypt = require("bcryptjs");
const { Company, Employee, Role } = require("../models");

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
    
    const { name, tax_id, address, phone, email, plan_name, subscription_status, expires_at, max_users } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: "Nombre es requerido" });

    // New trial default if not specified
    const expDate = expires_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days trial

    const company = await Company.create({ 
      name, tax_id, address, phone, email, 
      plan_name: plan_name || 'Básico',
      subscription_status: subscription_status || 'Demo',
      expires_at: expDate,
      max_users: max_users || 5
    });

    // Create default user for the new company
    let adminRole = await Role.findOne({ where: { name: 'admin' } });
    let roleId = adminRole ? adminRole.id : 1; 

    const rawPassword = "admin" + company.id;
    const password_hash = await bcrypt.hash(rawPassword, 10);
    const username = `admin_${company.id}`;
    
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
    });

    const responseCompany = company.toJSON();
    responseCompany.default_credentials = { username, password: rawPassword };

    res.status(201).json({ ok: true, company: responseCompany });
  } catch (err) {
    console.error(err);
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
      plan_name, subscription_status, expires_at, max_users 
    });
    res.json({ ok: true, company });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, message: "Error al actualizar empresa" });
  }
};

module.exports = { getAll, create, update };
