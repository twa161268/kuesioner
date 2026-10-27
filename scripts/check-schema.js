require('dotenv').config();
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL belum diisi di .env'); process.exit(1); }
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const expected = {
  kuesioner_user: ['user_id','email','password_hash','role','status'],
  kuesioner_master: ['kuesioner_id','kode_kuesioner','status'],
  kuesioner_versi: ['versi_id','kuesioner_id','status','usia_min','usia_max','jumlah_pertanyaan'],
  kuesioner_pemohon: ['pemohon_id','nama_pemohon'],
  kuesioner_sesi: ['sesi_id','kode_sesi','pemohon_id','nama_peserta','tanggal_lahir','tanggal_tes','usia_saat_tes','qr_token_hash','pin_hash','status_sesi','status_pengelolaan','status_akses_hasil'],
  kuesioner_sesi_detail: ['sesi_detail_id','sesi_id','versi_id','status_pengerjaan'],
  kuesioner_pertanyaan: ['pertanyaan_id','versi_id','nomor_urut','status'],
  kuesioner_pilihan: ['pilihan_id','pertanyaan_id','kode_pilihan','urutan','status'],
  kuesioner_jawaban: ['jawaban_id','sesi_detail_id','pertanyaan_id','pilihan_id'],
  kuesioner_hasil: ['hasil_id','sesi_detail_id','status_hasil'],
  kuesioner_laporan: ['laporan_id','hasil_id','nomor_revisi','status','storage_bucket','storage_path'],
  kuesioner_audit_log: ['audit_id','actor_user_id','created_at']
};
(async () => {
  try {
    const result = await pool.query(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name LIKE 'kuesioner_%' ORDER BY table_name, ordinal_position`);
    const actual = new Map();
    for (const row of result.rows) { if (!actual.has(row.table_name)) actual.set(row.table_name, new Map()); actual.get(row.table_name).set(row.column_name, row); }
    console.log('\nAUDIT SCHEMA KUESIONER — READ ONLY\n');
    let fail = false;
    for (const [table, columns] of Object.entries(expected)) {
      const actualCols = actual.get(table);
      if (!actualCols) { console.log(`✗ public.${table}: TABEL TIDAK DITEMUKAN`); fail = true; continue; }
      const missing = columns.filter(c => !actualCols.has(c));
      if (missing.length) { console.log(`✗ public.${table}: kolom belum ditemukan: ${missing.join(', ')}`); fail = true; }
      else console.log(`✓ public.${table}: kolom inti tersedia`);
    }
    console.log(`\nTotal kolom kuesioner ditemukan: ${result.rows.length}`);
    console.log(fail ? '\nSTATUS: Ada perbedaan schema. Jangan aktifkan modul tulis sebelum ditinjau.' : '\nSTATUS: Kolom inti yang diperiksa tersedia. Ini bukan pengganti pengujian fitur end-to-end.');
    process.exitCode = fail ? 2 : 0;
  } catch (e) { console.error('Gagal memeriksa schema:', e.message); process.exitCode = 1; }
  finally { await pool.end(); }
})();
