const { query } = require('../config/database');
async function log({ actorUserId = null, action, entityType = 'system', entityId = null, details = {} }) {
  // Kolom target audit mengikuti skema umum yang sudah teridentifikasi; bila kolom detail aktual berbeda, sesuaikan setelah audit schema.
  const cols = await query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='kuesioner_audit_log'`);
  const available = new Set(cols.rows.map(r => r.column_name));
  const map = { actor_user_id: actorUserId, jenis_entitas: entityType, entitas_id: entityId, created_at: new Date() };
  const actionColumn = available.has('aksi') ? 'aksi' : available.has('jenis_aksi') ? 'jenis_aksi' : null;
  const detailColumn = available.has('detail') ? 'detail' : available.has('detail_json') ? 'detail_json' : available.has('metadata') ? 'metadata' : null;
  if (actionColumn) map[actionColumn] = action;
  if (detailColumn) map[detailColumn] = JSON.stringify(details);
  const entries = Object.entries(map).filter(([key, value]) => available.has(key) && value !== undefined);
  if (!entries.length) return;
  const names = entries.map(([key]) => `"${key}"`).join(', ');
  const placeholders = entries.map((_, i) => `$${i + 1}`).join(', ');
  await query(`INSERT INTO public.kuesioner_audit_log (${names}) VALUES (${placeholders})`, entries.map(([, value]) => value));
}
module.exports = { log };
