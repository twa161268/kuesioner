const { Pool } = require('pg');
const { loadEnvironment } = require('./environment');
const env = loadEnvironment();

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: env.pgPoolMax,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 15000,
  ssl: env.isProduction ? { rejectUnauthorized: false } : (process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }),
  application_name: 'kuesioner-app'
});
pool.on('error', (err) => console.error('[DB] Pool idle client error:', err.message));

async function query(text, params = []) { return pool.query(text, params); }
async function withTransaction(fn) {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await fn(client); await client.query('COMMIT'); return result; }
  catch (err) { await client.query('ROLLBACK'); throw err; }
  finally { client.release(); }
}
async function getTableColumns(tableName) {
  const result = await query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [tableName]);
  return result.rows;
}
module.exports = { pool, query, withTransaction, getTableColumns };
