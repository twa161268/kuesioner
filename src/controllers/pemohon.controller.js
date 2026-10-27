const repo = require('../repositories/pemohon.repository');
const audit = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { query } = require('../config/database');
const index = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const q = String(req.query.q || '').trim().slice(0, 100);
  const data = await repo.list({ q, page, limit: 20 });
  res.render('pemohon/index', { title: 'Data Pemohon', ...data, q, notice: req.query.notice || null });
});
const createForm = asyncHandler(async (req, res) => res.render('pemohon/form', { title: 'Tambah Pemohon', mode: 'create', item: {}, error: null, editable: await editableFields() }));
const editForm = asyncHandler(async (req, res) => {
  const item = await repo.getById(req.params.id);
  if (!item) return res.status(404).render('errors/error', { title: 'Data tidak ditemukan', message: 'Pemohon yang diminta tidak ditemukan.' });
  res.render('pemohon/form', { title: 'Ubah Pemohon', mode: 'edit', item, error: null, editable: await editableFields() });
});
async function editableFields() {
  const { getTableColumns } = require('../config/database');
  const cols = await getTableColumns('kuesioner_pemohon');
  const names = new Set(cols.map(c => c.column_name));
  return [
    { name: 'nama_pemohon', label: 'Nama Pemohon', type: 'text', required: true },
    { name: 'no_hp', label: 'Nomor HP', type: 'tel' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'alamat', label: 'Alamat', type: 'text' },
    { name: 'catatan', label: 'Catatan', type: 'textarea' },
    { name: 'status', label: 'Status', type: 'select', options: ['aktif', 'nonaktif'] }
  ].filter(f => names.has(f.name));
}
const create = asyncHandler(async (req, res) => {
  try {
    const id = await repo.save({ body: req.body, actorId: req.session.user.id });
    await audit.log({ actorUserId: req.session.user.id, action: 'pemohon_dibuat', entityType: 'pemohon', entityId: id }).catch(() => {});
    res.redirect('/admin/pemohon?notice=created');
  } catch (err) { res.status(400).render('pemohon/form', { title: 'Tambah Pemohon', mode: 'create', item: req.body, error: err.message, editable: await editableFields() }); }
});
const update = asyncHandler(async (req, res) => {
  try {
    await repo.save({ id: req.params.id, body: req.body, actorId: req.session.user.id });
    await audit.log({ actorUserId: req.session.user.id, action: 'pemohon_diubah', entityType: 'pemohon', entityId: req.params.id }).catch(() => {});
    res.redirect('/admin/pemohon?notice=updated');
  } catch (err) { res.status(400).render('pemohon/form', { title: 'Ubah Pemohon', mode: 'edit', item: { ...req.body, pemohon_id: req.params.id }, error: err.message, editable: await editableFields() }); }
});
const toggleStatus = asyncHandler(async (req, res) => {
  const item = await repo.getById(req.params.id);
  if (!item) return res.status(404).render('errors/error', { title: 'Data tidak ditemukan', message: 'Pemohon yang diminta tidak ditemukan.' });
  const next = item.status === 'nonaktif' ? 'aktif' : 'nonaktif';
  await repo.setStatus(req.params.id, next);
  await audit.log({ actorUserId: req.session.user.id, action: 'status_pemohon_diubah', entityType: 'pemohon', entityId: req.params.id, details: { status: next } }).catch(() => {});
  res.redirect('/admin/pemohon?notice=status');
});
module.exports = { index, createForm, editForm, create, update, toggleStatus };
