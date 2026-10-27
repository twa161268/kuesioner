// Vercel serverless entry point. The app exports Express without opening a persistent listener.
const { loadEnvironment } = require('../src/config/environment');
const env = loadEnvironment();
if (env.isProduction && !env.sessionTableReady) {
  throw new Error('Session store belum disiapkan. Tinjau docs/session-store-migration.sql lalu set SESSION_TABLE_READY=true.');
}
module.exports = require('../src/app');
