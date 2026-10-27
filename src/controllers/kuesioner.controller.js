const { query, getTableColumns } = require('../config/database');
const audit = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const quote = s => `"${String(s).replaceAll('"', '""')}"`;
const editable = ['kode_kuesioner', 'nama_kuesioner', 'deskripsi', 'status'];
async function schema() {
  const cols = await getTableColumns('kuesioner_master');
  if (!cols.length) throw new Error('Tabel kuesioner_master tidak ditemukan.');
  const map = new Map(cols.map(c => [c.column_name, c]));
  if (!map.has('kuesioner_id') || !map.has('kode_kuesioner') || !map.has('nama_kuesioner')) throw new Error('Kolom utama master kuesioner belum sesuai.');
  return map;
}
const index = asyncHandler(async (req, res) => {
  const cols = await schema();
  const fields = ['kuesioner_id', ...editable.filter(c => cols.has(c)), ...(cols.has('created_at') ? ['created_at'] : [])];
  const q = String(req.query.q || '').trim().slice(0, 100);
  const where = q ? `WHERE kode_kuesioner ILIKE $1 OR nama_kuesioner ILIKE $1` : '';
  const result = await query(`SELECT ${fields.map(quote).join(', ')} FROM public.kuesioner_master ${where} ORDER BY kuesioner_id DESC LIMIT 200`, q ? [`%${q}%`] : []);
  res.render('kuesioner/index', { title: 'Master Kuesioner', rows: result.rows, fields, q, notice: req.query.notice || null });
});
const createForm = asyncHandler(async (req, res) => res.render('kuesioner/form', { title: 'Tambah Kuesioner', mode: 'create', item: {}, error: null, fields: await formFields() }));
const editForm = asyncHandler(async (req, res) => {
  const cols = await schema();
  const result = await query(`SELECT ${[...cols.keys()].map(quote).join(', ')} FROM public.kuesioner_master WHERE kuesioner_id=$1`, [req.params.id]);
  if (!result.rowCount) return res.status(404).render('errors/error', { title: 'Kuesioner tidak ditemukan', message: 'Master kuesioner yang diminta tidak ditemukan.' });
  res.render('kuesioner/form', { title: 'Ubah Kuesioner', mode: 'edit', item: result.rows[0], error: null, fields: await formFields() });
});
async function formFields() {
  const cols = new Set((await getTableColumns('kuesioner_master')).map(c => c.column_name));
  return [
    { name: 'kode_kuesioner', label: 'Kode Kuesioner', type: 'text', required: true },
    { name: 'nama_kuesioner', label: 'Nama Kuesioner', type: 'text', required: true },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'status', label: 'Status', type: 'select', options: ['draft', 'aktif', 'nonaktif', 'arsip'] }
  ].filter(f => cols.has(f.name));
}
async function save(req, id = null) {
  const cols = await schema();
  const isNew = !id;
  const data = {};
  for (const f of editable) if (cols.has(f) && req.body[f] !== undefined) data[f] = String(req.body[f] || '').trim() || null;
  if (!data.kode_kuesioner || !data.nama_kuesioner) throw new Error('Kode dan nama kuesioner wajib diisi.');
  if (cols.has('status')) {
    const allowed = ['draft', 'aktif', 'nonaktif', 'arsip'];
    if (data.status && !allowed.includes(data.status)) throw new Error('Status kuesioner tidak valid.');
    if (!data.status) data.status = 'draft';
  }
  if (isNew && cols.has('created_by')) data.created_by = req.session.user.id;
  const entries = Object.entries(data).filter(([k]) => cols.has(k));
  if (isNew) {
    for (const [name, meta] of cols) if (name !== 'kuesioner_id' && name !== 'created_at' && name !== 'updated_at' && name !== 'created_by' && !entries.some(([k]) => k === name) && meta.is_nullable === 'NO' && !meta.column_default) throw new Error(`Kolom wajib ${name} belum terisi.`);
    const result = await query(`INSERT INTO public.kuesioner_master (${entries.map(([k]) => quote(k)).join(', ')}) VALUES (${entries.map((_, i) => `$${i+1}`).join(', ')}) RETURNING kuesioner_id`, entries.map(([,v]) => v));
    return result.rows[0].kuesioner_id;
  }
  const values = entries.map(([,v]) => v); const sets = entries.map(([k], i) => `${quote(k)}=$${i+1}`);
  if (cols.has('updated_at')) sets.push('updated_at=now()'); values.push(id);
  const result = await query(`UPDATE public.kuesioner_master SET ${sets.join(', ')} WHERE kuesioner_id=$${values.length} RETURNING kuesioner_id`, values);
  if (!result.rowCount) throw new Error('Master kuesioner tidak ditemukan.');
  return id;
}
const create = asyncHandler(async (req, res) => {
  try { const id = await save(req); await audit.log({ actorUserId: req.session.user.id, action: 'kuesioner_master_dibuat', entityType: 'kuesioner_master', entityId: id }).catch(() => {}); res.redirect('/admin/kuesioner?notice=created'); }
  catch (err) { res.status(400).render('kuesioner/form', { title: 'Tambah Kuesioner', mode: 'create', item: req.body, error: err.message, fields: await formFields() }); }
});
const update = asyncHandler(async (req, res) => {
  try { await save(req, req.params.id); await audit.log({ actorUserId: req.session.user.id, action: 'kuesioner_master_diubah', entityType: 'kuesioner_master', entityId: req.params.id }).catch(() => {}); res.redirect('/admin/kuesioner?notice=updated'); }
  catch (err) { res.status(400).render('kuesioner/form', { title: 'Ubah Kuesioner', mode: 'edit', item: { ...req.body, kuesioner_id: req.params.id }, error: err.message, fields: await formFields() }); }
});
module.exports = { index, createForm, editForm, create, update };
