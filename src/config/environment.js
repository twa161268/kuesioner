const path = require('node:path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

function loadEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur. Salin .env.example menjadi .env dan isi koneksi PostgreSQL Supabase.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error('SESSION_SECRET wajib diisi minimal 32 karakter.');
  }
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    isProduction,
    port: Number(process.env.PORT || 3000),
    appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
    databaseUrl: process.env.DATABASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    sessionTableName: process.env.SESSION_TABLE_NAME || 'kuesioner_app_sessions',
    sessionTableReady: process.env.SESSION_TABLE_READY === 'true',
    pgPoolMax: Math.min(Math.max(Number(process.env.PG_POOL_MAX || 5), 1), 10)
  };
}
module.exports = { loadEnvironment };
