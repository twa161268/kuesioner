const router = require('express').Router();
router.get('/', (req, res) => res.render('public/home', { title: 'Kuesioner & Analisis Kepribadian' }));
router.get('/health', (req, res) => res.json({ ok: true, service: 'kuesioner-app' }));
module.exports = router;
