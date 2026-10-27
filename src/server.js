const { loadEnvironment } = require('./config/environment');
const env = loadEnvironment();
if (env.isProduction && !env.sessionTableReady) {
  throw new Error('Production memerlukan session store PostgreSQL. Tinjau dan jalankan docs/session-store-migration.sql, lalu set SESSION_TABLE_READY=true.');
}
const app = require('./app');
const server = app.listen(env.port, () => console.log(`Kuesioner berjalan di http://localhost:${env.port}`));
async function shutdown() {
  server.close(async () => {
    try { await require('./config/database').pool.end(); } finally { process.exit(0); }
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
