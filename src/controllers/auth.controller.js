const authService = require('../services/auth.service');
const audit = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { loadEnvironment } = require('../config/environment');
const env = loadEnvironment();
const showLogin = (req, res) => { if (req.session.user) return res.redirect('/admin'); res.render('auth/login', { title: 'Masuk Administrator', error: null }); };
const login = asyncHandler(async (req, res) => {
  const user = await authService.authenticate(req.body.email, req.body.password);
  if (!user) { await audit.log({ action: 'login_gagal', entityType: 'auth', details: { email: String(req.body.email || '').trim().toLowerCase() } }).catch(() => {}); return res.status(401).render('auth/login', { title: 'Masuk Administrator', error: 'Email atau kata sandi tidak valid, atau akun tidak aktif.' }); }
  req.session.regenerate(async (err) => {
    if (err) return res.status(500).render('errors/error', { title: 'Gagal masuk', message: 'Sesi login tidak dapat dibuat.' });
    req.session.user = user;
    req.session.csrfToken = require('node:crypto').randomBytes(32).toString('hex');
    req.session.save(async (saveErr) => {
      if (saveErr) return res.status(500).render('errors/error', { title: 'Gagal masuk', message: 'Sesi login tidak dapat disimpan. Periksa session store.' });
      await audit.log({ actorUserId: user.id, action: 'login_berhasil', entityType: 'auth' }).catch(() => {});
      res.redirect('/admin');
    });
  });
});
const logout = (req, res, next) => req.session.destroy(err => { if (err) return next(err); res.clearCookie('kuesioner.sid'); res.redirect('/login'); });
module.exports = { showLogin, login, logout };
