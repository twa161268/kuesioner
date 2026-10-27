const crypto = require('node:crypto');
function csrfToken(req, res, next) {
  if (!req.session) return next(new Error('Session belum tersedia.'));
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.locals.csrfToken = req.session.csrfToken;
  next();
}
function verifyCsrf(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (safe) return next();
  const token = req.body?._csrf || req.get('x-csrf-token');
  const expected = req.session?.csrfToken;
  const tokenBuf = Buffer.from(String(token || ''));
  const expectedBuf = Buffer.from(String(expected || ''));
  if (!token || !expected || tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(403).render('errors/error', { title: 'Permintaan ditolak', message: 'Token keamanan tidak valid. Muat ulang halaman dan coba lagi.' });
  }
  next();
}
module.exports = { csrfToken, verifyCsrf };
