const router = require('express').Router();
const { requireRole } = require('../middlewares/requireRole');
router.use(requireRole('admin', 'super_admin'));
router.get('/', (req, res) => res.redirect('/admin/sesi'));
module.exports = router;
