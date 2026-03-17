const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'posdb',
  user: process.env.DB_USER || 'posuser',
  password: process.env.DB_PASSWORD || 'pospassword',
});

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Iniciando verificación de base de datos...');
    
    // 1. Crear tabla de migraciones si no existe
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. Obtener migraciones ya aplicadas
    const { rows: appliedRows } = await client.query('SELECT filename FROM migrations');
    const appliedFiles = new Set(appliedRows.map(r => r.filename));

    // 3. Obtener todos los archivos .sql en la carpeta db (excluyendo init.sql y en orden)
    const dbDir = __dirname;
    const files = fs.readdirSync(dbDir)
      .filter(f => f.endsWith('.sql') && f !== 'init.sql')
      .sort();

    // 4. Fallback: Si no hay registro en "migrations", pero ya existe la tabla "warehouses" 
    // significa que corrimos las migraciones manualmente. Marcamos todas como aplicadas para no re-ejecutarlas y fallar.
    if (appliedFiles.size === 0) {
      const { rows: testTable } = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'warehouses'
        );
      `);
      
      if (testTable[0].exists) {
        console.log('📌 Se detectó una base de datos con migraciones manuales. Sincronizando tabla migrations...');
        for (const file of files) {
          await client.query('INSERT INTO migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
          appliedFiles.add(file);
        }
      }
    }

    // 5. Aplicar migraciones faltantes
    for (const file of files) {
      if (!appliedFiles.has(file)) {
        console.log(`⏩ Aplicando migración: ${file}...`);
        const filePath = path.join(dbDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`✅ Migración ${file} aplicada con éxito.`);
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`❌ Error en migración ${file}:`, error.message);
          throw error;
        }
      }
    }

    // 6. Forzar USD como moneda principal (o crearla)
    console.log('💵 Configurando USD como moneda base...');
    await client.query(`
      INSERT INTO currencies (code, name, symbol, exchange_rate, is_base, active)
      VALUES ('USD', 'Dólar Americano', '$', 1.000000, TRUE, TRUE)
      ON CONFLICT (code) DO UPDATE SET 
        symbol = '$', 
        is_base = TRUE, 
        exchange_rate = 1.0,
        active = TRUE;
    `);
    
    // Remueve is_base de cualquier otra
    await client.query(`UPDATE currencies SET is_base = FALSE WHERE code != 'USD'`);

    await client.query(`
      INSERT INTO settings (key, value) VALUES ('base_currency', 'USD')
      ON CONFLICT (key) DO UPDATE SET value = 'USD';
    `);

    // 7. Forzar contraseña del Admin
    console.log('🔑 Verificando contraseña de Administrador...');
    const hash = await bcrypt.hash('admin1234', 10);
    await client.query('UPDATE employees SET password_hash = $1 WHERE username = $2', [hash, 'admin']);

    console.log('✅ Base de datos lista.');

  } catch (err) {
    console.error('❌ Error general durante las migraciones:', err);
    process.exit(1); 
  } finally {
    client.release();
    pool.end();
  }
}

runMigrations();
