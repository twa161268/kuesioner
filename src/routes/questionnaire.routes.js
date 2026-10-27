const router = require('express').Router();
const participant = require('../controllers/participant.controller');
router.get('/akses/:token', participant.showPin);
router.post('/akses/:token', participant.verifyPin);
router.get('/isi/:token', participant.showQuestionnaire);
router.post('/isi/:token', participant.saveQuestionnaire);
router.get('/hasil/:token', participant.participantResults);
router.get('/hasil/:token/:detailId.pdf', participant.participantPdf);
module.exports = router;
