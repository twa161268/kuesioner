function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  res.locals.currentUser = req.session.user;
  next();
}
module.exports = { requireAuth };
