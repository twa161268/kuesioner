const { query } = require('../config/database');
async function safeCount(table, where = '') {
  const exists = await query('SELECT to_regclass($1) AS relation', [`public.${table}`]);
  if (!exists.rows[0]?.relation) return 0;
  try { const r = await query(`SELECT count(*)::int AS total FROM public."${table}" ${where}`); return r.rows[0].total; } catch { return 0; }
}
async function summary() {
  const [pemohon, sesiAktif, menunggu, hasilTerbit, kuesioner] = await Promise.all([
    safeCount('kuesioner_pemohon'), safeCount('kuesioner_sesi', `WHERE status_sesi='aktif' AND status_pengelolaan='aktif'`),
    safeCount('kuesioner_sesi', `WHERE status_sesi='menunggu_admin' AND status_pengelolaan='aktif'`),
    safeCount('kuesioner_hasil', `WHERE status_hasil='diterbitkan'`), safeCount('kuesioner_master', `WHERE status='aktif'`)
  ]);
  return { pemohon, sesiAktif, menunggu, hasilTerbit, kuesioner };
}
module.exports = { summary };
