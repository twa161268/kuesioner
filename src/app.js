const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const ejsMate = require('ejs-mate');
const { loadEnvironment } = require('./config/environment');
const { createSessionMiddleware } = require('./config/session');
const { csrfToken, verifyCsrf } = require('./middlewares/csrf');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const env = loadEnvironment();
const app = express();

app.engine('ejs', ejsMate);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));
app.use(express.json({ limit: '100kb' }));
app.use('/public', express.static(path.join(process.cwd(), 'public'), { maxAge: env.isProduction ? '1d' : 0, fallthrough: true }));
app.use(createSessionMiddleware());
app.use((req, res, next) => {
  res.locals.currentUser = req.session?.user || null;
  res.locals.appName = 'Kuesioner';
  res.locals.currentPath = req.path;
  next();
});
app.use(csrfToken);
app.use(verifyCsrf);

app.use('/', require('./routes/public.routes'));
app.use('/', require('./routes/auth.routes'));
app.use('/admin', require('./routes/admin.routes'));
app.use('/super-admin', require('./routes/superAdmin.routes'));
app.use('/kuesioner', require('./routes/questionnaire.routes'));
app.use('/laporan', require('./routes/report.routes'));
app.use(notFound);
app.use(errorHandler);
module.exports = app;
