const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const pool = new Pool({
  host: 'db',
  port: 5432,
  database: 'posdb',
  user: 'posuser',
  password: 'pospassword',
});
bcrypt.hash('admin1234', 10).then(hash => {
  console.log('Hash generado:', hash);
  return pool.query('UPDATE employees SET password_hash = $1 WHERE username = $2', [hash, 'admin']);
}).then(r => {
  console.log('Filas actualizadas:', r.rowCount);
  process.exit(0);
}).catch(e => { console.error('Error:', e.message); process.exit(1); });
