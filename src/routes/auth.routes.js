const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { verifyCsrf } = require('../middlewares/csrf');
router.get('/login', controller.showLogin);
router.post('/login', loginLimiter, verifyCsrf, controller.login);
router.post('/logout', verifyCsrf, controller.logout);
module.exports = router;
