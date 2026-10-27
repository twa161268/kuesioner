const router = require('express').Router();
const { requireRole } = require('../middlewares/requireRole');
router.use(requireRole('super_admin'));
router.get('/', (req, res) => res.redirect('/admin/kuesioner'));
module.exports = router;
