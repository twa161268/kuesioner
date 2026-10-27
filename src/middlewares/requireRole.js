function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session?.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.role)) return res.status(403).render('errors/error', { title: 'Akses ditolak', message: 'Akun Anda tidak memiliki izin untuk membuka halaman ini.' });
    res.locals.currentUser = req.session.user;
    next();
  };
}
module.exports = { requireRole };
