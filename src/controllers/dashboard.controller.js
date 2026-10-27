const repo = require('../repositories/dashboard.repository');
const asyncHandler = require('../utils/asyncHandler');
const index = asyncHandler(async (req, res) => { const stats = await repo.summary(); res.render('admin/dashboard', { title: 'Dashboard', stats }); });
module.exports = { index };
