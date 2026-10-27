const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false, message: 'Terlalu banyak percobaan. Silakan coba lagi beberapa saat.' });
const pinLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: 'Terlalu banyak percobaan PIN. Silakan coba lagi beberapa saat.' });
module.exports = { loginLimiter, pinLimiter };
