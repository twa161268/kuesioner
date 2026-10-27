const { query, getTableColumns } = require('../config/database');
const EXPECTED = ['user_id', 'email', 'password_hash', 'role', 'status'];
async function assertUserSchema() {
  const columns = await getTableColumns('kuesioner_user');
  if (!columns.length) throw new Error('Tabel public.kuesioner_user tidak ditemukan.');
  const names = new Set(columns.map(c => c.column_name));
  const missing = EXPECTED.filter(c => !names.has(c));
  if (missing.length) throw new Error(`Kolom login belum lengkap pada kuesioner_user: ${missing.join(', ')}. Periksa schema sebelum menjalankan aplikasi.`);
}
async function findByEmail(email) {
  await assertUserSchema();
  const result = await query(`SELECT user_id, email, password_hash, role, status FROM public.kuesioner_user WHERE lower(email)=lower($1) LIMIT 1`, [email]);
  return result.rows[0] || null;
}
async function findSafeById(id) {
  const result = await query(`SELECT user_id, email, role, status FROM public.kuesioner_user WHERE user_id=$1 LIMIT 1`, [id]);
  return result.rows[0] || null;
}
module.exports = { assertUserSchema, findByEmail, findSafeById };
