function notFound(req, res) { res.status(404).render('errors/error', { title: 'Halaman tidak ditemukan', message: 'Halaman yang diminta tidak tersedia.' }); }
function errorHandler(err, req, res, next) {
  console.error('[APP ERROR]', { path: req.originalUrl, method: req.method, message: err.message });
  if (res.headersSent) return next(err);
  const status = Number(err.status || 500);
  res.status(status).render('errors/error', { title: status >= 500 ? 'Terjadi kesalahan' : 'Permintaan tidak dapat diproses', message: status >= 500 ? 'Terjadi kesalahan pada server. Silakan coba kembali.' : err.message });
}
module.exports = { notFound, errorHandler };
