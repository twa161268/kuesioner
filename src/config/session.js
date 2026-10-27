const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('./database');
const { loadEnvironment } = require('./environment');
const env = loadEnvironment();

function createSessionMiddleware() {
  if (env.isProduction && !env.sessionTableReady) {
    throw new Error('Production memerlukan session store PostgreSQL. Tinjau docs/session-store-migration.sql lalu set SESSION_TABLE_READY=true.');
  }
  const store = env.sessionTableReady
    ? new PgSession({ pool, tableName: env.sessionTableName, createTableIfMissing: false, pruneSessionInterval: 15 * 60 })
    : undefined; // Express MemoryStore hanya untuk development lokal; tidak diizinkan pada production.
  return session({
    ...(store ? { store } : {}),
    secret: env.sessionSecret,
    name: 'kuesioner.sid',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { httpOnly: true, secure: env.isProduction, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 }
  });
}
module.exports = { createSessionMiddleware };
