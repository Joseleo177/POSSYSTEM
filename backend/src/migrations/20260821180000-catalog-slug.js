'use strict';

// El enlace del catálogo público pasa de un token aleatorio a un slug legible:
//
//   antes:  /catalogo/c980ad02d8f7417aa51050e2320d40e6
//   ahora:  /catalogo/el-gran-terminal
//
// El hash llegaba al cliente por WhatsApp con toda la pinta de ser phishing y no había forma
// de dictarlo por teléfono. A cambio, el catálogo deja de estar protegido por lo impredecible
// del enlace: pasa a ser público de verdad, y para dejar de publicarlo se apaga, que es una
// decisión explícita en vez de rotar un secreto.
//
// Esta migración le arma el slug a cada empresa que ya tenía enlace activo, derivándolo de su
// nombre de tienda. La fila del token viejo NO se borra: ya no la lee nadie, y conservarla
// permite volver atrás sin haber perdido el dato.
const SLUG_KEY = 'public_catalog_slug';
const TOKEN_KEY = 'public_catalog_token';

function slugify(raw) {
  const stripped = String(raw || '')
    .replace(/ñ/gi, 'n')
    .normalize('NFD')
    .split('')
    .filter((c) => {
      const cp = c.charCodeAt(0);
      return cp < 0x300 || cp > 0x36f;
    })
    .join('');
  return stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

module.exports = {
  async up(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
      SELECT t.company_id, n.value AS store_name
        FROM settings t
        LEFT JOIN settings n ON n.company_id = t.company_id AND n.key = 'store_name'
       WHERE t.key = '${TOKEN_KEY}'
    `);

    const used = new Set();
    for (const row of rows) {
      // Sin nombre utilizable no se inventa una dirección: el comercio arma el enlace desde
      // el modal cuando le ponga nombre a la tienda.
      const base = slugify(row.store_name);
      if (!base || base.length < 2) continue;

      let slug = base;
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
      used.add(slug);

      await queryInterface.sequelize.query(
        `INSERT INTO settings (key, value, company_id)
         VALUES (:key, :value, :company_id)
         ON CONFLICT (key, company_id) DO UPDATE SET value = EXCLUDED.value`,
        { replacements: { key: SLUG_KEY, value: slug, company_id: row.company_id } }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM settings WHERE key = '${SLUG_KEY}'`);
  },
};