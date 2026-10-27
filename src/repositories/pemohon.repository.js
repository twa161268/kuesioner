const { query, getTableColumns, withTransaction } = require('../config/database');
const TABLE = 'kuesioner_pemohon';
const ID = 'pemohon_id';
const EDITABLE = ['nama_pemohon', 'no_hp', 'email', 'alamat', 'catatan', 'status'];
const quote = (s) => `"${String(s).replaceAll('"', '""')}"`;
async function schema() {
  const columns = await getTableColumns(TABLE);
  if (!columns.length) throw new Error('Tabel public.kuesioner_pemohon tidak ditemukan.');
  const map = new Map(columns.map(c => [c.column_name, c]));
  if (!map.has(ID) || !map.has('nama_pemohon')) throw new Error('Kolom pemohon_id atau nama_pemohon tidak ditemukan.');
  return map;
}
async function list({ q = '', page = 1, limit = 20 }) {
  const cols = await schema();
  const fields = [ID, ...EDITABLE.filter(c => cols.has(c)), ...(cols.has('created_at') ? ['created_at'] : [])];
  const params = [];
  let where = '';
  if (q) {
    const searchable = ['nama_pemohon', 'no_hp', 'email'].filter(c => cols.has(c));
    if (searchable.length) {
      params.push(`%${q}%`);
      where = `WHERE ${searchable.map(c => `CAST(${quote(c)} AS text) ILIKE $1`).join(' OR ')}`;
    }
  }
  const count = await query(`SELECT count(*)::int AS total FROM public.${TABLE} ${where}`, params);
  const offset = (page - 1) * limit;
  const result = await query(`SELECT ${fields.map(quote).join(', ')} FROM public.${TABLE} ${where} ORDER BY ${quote(ID)} DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
  return { rows: result.rows, total: count.rows[0].total, page, limit, fields };
}
async function getById(id) {
  const cols = await schema();
  const fields = [...cols.keys()];
  const result = await query(`SELECT ${fields.map(quote).join(', ')} FROM public.${TABLE} WHERE ${quote(ID)}=$1`, [id]);
  return result.rows[0] || null;
}
function cleanInput(body, cols, actorId, isNew) {
  const data = {};
  for (const field of EDITABLE) {
    if (!cols.has(field) || body[field] === undefined) continue;
    const value = String(body[field] ?? '').trim();
    data[field] = value || null;
  }
  if (!data.nama_pemohon || !String(data.nama_pemohon).trim()) throw new Error('Nama pemohon wajib diisi.');
  if (cols.has('status')) data.status = ['aktif', 'nonaktif'].includes(data.status) ? data.status : 'aktif';
  if (isNew && cols.has('created_by') && actorId) data.created_by = actorId;
  return data;
}
async function save({ id, body, actorId }) {
  const cols = await schema();
  const isNew = !id;
  const data = cleanInput(body, cols, actorId, isNew);
  const entries = Object.entries(data).filter(([key]) => cols.has(key));
  if (isNew) {
    const insertCols = [...entries];
    for (const [name, meta] of cols) {
      if (name === ID || name === 'created_at' || name === 'updated_at' || name === 'created_by' || insertCols.some(([k]) => k === name)) continue;
      if (meta.is_nullable === 'NO' && !meta.column_default) throw new Error(`Kolom wajib ${name} belum mempunyai nilai/form. Periksa schema tabel pemohon.`);
    }
    const names = insertCols.map(([k]) => quote(k)).join(', ');
    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
    const result = await query(`INSERT INTO public.${TABLE} (${names}) VALUES (${placeholders}) RETURNING ${quote(ID)}`, insertCols.map(([, v]) => v));
    return result.rows[0][ID];
  }
  if (!entries.length) throw new Error('Tidak ada data yang dapat disimpan.');
  const sets = entries.map(([k], i) => `${quote(k)}=$${i + 1}`);
  if (cols.has('updated_at')) sets.push('"updated_at"=now()');
  const values = entries.map(([, v]) => v);
  values.push(id);
  const result = await query(`UPDATE public.${TABLE} SET ${sets.join(', ')} WHERE ${quote(ID)}=$${values.length} RETURNING ${quote(ID)}`, values);
  if (!result.rowCount) throw new Error('Data pemohon tidak ditemukan.');
  return id;
}
async function setStatus(id, status) {
  const cols = await schema();
  if (!cols.has('status')) throw new Error('Tabel pemohon tidak memiliki kolom status.');
  const result = await query(`UPDATE public.${TABLE} SET status=$1${cols.has('updated_at') ? ', updated_at=now()' : ''} WHERE ${quote(ID)}=$2 RETURNING ${quote(ID)}`, [status, id]);
  if (!result.rowCount) throw new Error('Data pemohon tidak ditemukan.');
}
module.exports = { list, getById, save, setStatus };
