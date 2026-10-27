const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const { query, getTableColumns, withTransaction } = require('../config/database');
const audit = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { calculateAge } = require('../utils/age');
const resultService = require('../services/result.service');
const quote = s => `"${String(s).replaceAll('"', '""')}"`;

async function getFormData() {
  const pemohonCols = new Set((await getTableColumns('kuesioner_pemohon')).map(c => c.column_name));
  if (!pemohonCols.has('pemohon_id') || !pemohonCols.has('nama_pemohon')) throw new Error('Kolom utama pemohon belum tersedia.');
  const pemohon = await query(`SELECT pemohon_id, nama_pemohon${pemohonCols.has('no_hp') ? ', no_hp' : ''} FROM public.kuesioner_pemohon WHERE ${pemohonCols.has('status') ? "status='aktif'" : 'true'} ORDER BY nama_pemohon`);
  const vcols = new Set((await getTableColumns('kuesioner_versi')).map(c => c.column_name));
  const mcols = new Set((await getTableColumns('kuesioner_master')).map(c => c.column_name));
  if (!vcols.has('versi_id') || !vcols.has('kuesioner_id') || !vcols.has('usia_min')) return { pemohon: pemohon.rows, versions: [] };
  const versionFields = ['versi_id', 'kuesioner_id', 'kode_versi', 'nama_versi', 'usia_min', 'usia_max', 'jumlah_pertanyaan', 'status'].filter(c => vcols.has(c));
  const masterName = mcols.has('nama_kuesioner') ? 'nama_kuesioner' : mcols.has('kode_kuesioner') ? 'kode_kuesioner' : null;
  const select = versionFields.map(c => `v.${quote(c)}`).join(', ');
  const join = masterName ? `, m.${quote(masterName)} AS nama_master` : '';
  const joinClause = masterName ? ' JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id' : '';
  const conditions = [];
  if (vcols.has('status')) conditions.push("v.status='diterbitkan'");
  if (masterName && mcols.has('status')) conditions.push("m.status='aktif'");
  const result = await query(`SELECT ${select}${join} FROM public.kuesioner_versi v${joinClause} ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''} ORDER BY v.kuesioner_id, v.versi_id`);
  return { pemohon: pemohon.rows, versions: result.rows };
}
const index = asyncHandler(async (req, res) => {
  const cols = new Set((await getTableColumns('kuesioner_sesi')).map(c => c.column_name));
  const fields = ['sesi_id','kode_sesi','nama_peserta','tanggal_tes','usia_saat_tes','status_sesi','status_pengelolaan','status_akses_hasil','created_at'].filter(c => cols.has(c));
  if (!fields.includes('sesi_id') || !fields.includes('kode_sesi')) throw new Error('Kolom utama kuesioner_sesi belum lengkap.');
  const q = String(req.query.q || '').trim().slice(0, 100);
  const searchable = ['nama_peserta', 'kode_sesi', 'no_hp_peserta'].filter(c => cols.has(c));
  const where = q && searchable.length ? `WHERE ${searchable.map(c => `CAST(${quote(c)} AS text) ILIKE $1`).join(' OR ')}` : '';
  const result = await query(`SELECT ${fields.map(quote).join(', ')} FROM public.kuesioner_sesi ${where} ORDER BY sesi_id DESC LIMIT 100`, where ? [`%${q}%`] : []);
  res.render('sesi/index', { title: 'Sesi Kuesioner', rows: result.rows, fields, q, notice: req.query.notice || null });
});
const createForm = asyncHandler(async (req, res) => {
  const data = await getFormData();
  res.render('sesi/form', { title: 'Buat Sesi Kuesioner', ...data, error: null, item: {} });
});
const create = asyncHandler(async (req, res) => {
  let formData;
  try {
    formData = await getFormData();
    const pemohonId = String(req.body.pemohon_id || '').trim();
    const nama = String(req.body.nama_peserta || '').trim();
    const noHp = String(req.body.no_hp_peserta || '').trim();
    const dob = String(req.body.tanggal_lahir || '').trim();
    const testDate = String(req.body.tanggal_tes || '').trim() || new Date().toISOString().slice(0, 10);
    const gender = String(req.body.jenis_kelamin || '').trim();
    const selectedVersions = [...new Set((Array.isArray(req.body.versi_ids) ? req.body.versi_ids : [req.body.versi_ids]).filter(Boolean).map(v => Number(v)).filter(Number.isSafeInteger))];
    if (!pemohonId || !nama || !dob) throw new Error('Pemohon, nama peserta, dan tanggal lahir wajib diisi.');
    if (!selectedVersions.length) throw new Error('Pilih minimal satu versi kuesioner yang sudah diterbitkan.');
    if (gender && !['perempuan','laki_laki','lainnya','tidak_diketahui'].includes(gender)) throw new Error('Pilihan jenis kelamin tidak valid.');
    const age = calculateAge(dob, testDate);
    const availableVersions = formData.versions.filter(v => selectedVersions.includes(Number(v.versi_id)));
    if (availableVersions.length !== selectedVersions.length) throw new Error('Salah satu versi kuesioner tidak tersedia atau belum diterbitkan.');
    const outside = availableVersions.filter(v => age < Number(v.usia_min) || (v.usia_max !== null && v.usia_max !== undefined && age > Number(v.usia_max)));
    if (outside.length) throw new Error(`Usia peserta ${age} tahun tidak sesuai dengan batas usia versi: ${outside.map(v => v.kode_versi || v.versi_id).join(', ')}.`);
    const token = crypto.randomBytes(32).toString('base64url');
    const qrHash = crypto.createHash('sha256').update(token).digest('hex');
    const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const pinHash = await bcrypt.hash(pin, 12);
    const kode = `KS-${new Date().toISOString().slice(2,10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const created = await withTransaction(async client => {
      const cols = new Map((await client.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='kuesioner_sesi'")).rows.map(c => [c.column_name, c]));
      const values = {
        kode_sesi: kode, pemohon_id: pemohonId, nama_peserta: nama, no_hp_peserta: noHp || null,
        tanggal_lahir: dob, jenis_kelamin: gender || null, tanggal_tes: testDate, usia_saat_tes: age,
        qr_token_hash: qrHash, pin_hash: pinHash, pin_diubah_pada: new Date(), percobaan_pin_gagal: 0,
        status_sesi: 'aktif', status_pengelolaan: 'aktif', status_akses_hasil: 'belum_tersedia',
        catatan_admin: String(req.body.catatan_admin || '').trim() || null, dibuat_oleh: req.session.user.id
      };
      const insert = Object.entries(values).filter(([key, value]) => cols.has(key) && value !== undefined);
      for (const [name, meta] of cols) {
        if (name === 'sesi_id' || name === 'created_at' || name === 'updated_at' || insert.some(([k]) => k === name)) continue;
        if (meta.is_nullable === 'NO' && !meta.column_default) throw new Error(`Kolom sesi wajib ${name} belum terisi dan tidak memiliki default. Pembuatan sesi dibatalkan.`);
      }
      const ins = await client.query(`INSERT INTO public.kuesioner_sesi (${insert.map(([k]) => quote(k)).join(', ')}) VALUES (${insert.map((_, i) => `$${i+1}`).join(', ')}) RETURNING sesi_id, kode_sesi`, insert.map(([,v]) => v));
      const sesi = ins.rows[0];
      const dcols = new Set((await client.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='kuesioner_sesi_detail'")).rows.map(c => c.column_name));
      for (let i = 0; i < selectedVersions.length; i++) {
        const dv = { sesi_id: sesi.sesi_id, versi_id: selectedVersions[i], urutan: i + 1, status_pengerjaan: 'belum_mulai' };
        const entries = Object.entries(dv).filter(([k]) => dcols.has(k));
        await client.query(`INSERT INTO public.kuesioner_sesi_detail (${entries.map(([k]) => quote(k)).join(', ')}) VALUES (${entries.map((_, j) => `$${j+1}`).join(', ')})`, entries.map(([,v]) => v));
      }
      return sesi;
    });
    await audit.log({ actorUserId: req.session.user.id, action: 'sesi_dibuat', entityType: 'sesi', entityId: created.sesi_id, details: { kode_sesi: created.kode_sesi, jumlah_kuesioner: selectedVersions.length } }).catch(() => {});
    const qrUrl = `${require('../config/environment').loadEnvironment().appBaseUrl}/kuesioner/akses/${token}`;
    const qrImage = await QRCode.toDataURL(qrUrl, { width: 280, margin: 2 });
    res.render('sesi/created', { title: 'Sesi Berhasil Dibuat', sesi: created, pin, token, qrUrl, qrImage });
  } catch (err) {
    const data = formData || await getFormData();
    res.status(400).render('sesi/form', { title: 'Buat Sesi Kuesioner', ...data, error: err.message, item: req.body });
  }
});
const editForm = asyncHandler(async (req, res) => {
  const result = await query('SELECT sesi_id, kode_sesi, status_pengelolaan, catatan_admin, status_sesi FROM public.kuesioner_sesi WHERE sesi_id=$1', [req.params.id]);
  if (!result.rowCount) return res.status(404).render('errors/error', { title: 'Sesi tidak ditemukan', message: 'Sesi yang diminta tidak ditemukan.' });
  res.render('sesi/edit', { title: 'Kelola Sesi', item: result.rows[0], error: null });
});
const update = asyncHandler(async (req, res) => {
  const status = String(req.body.status_pengelolaan || '');
  const statusSesi = String(req.body.status_sesi || '');
  const catatan = String(req.body.catatan_admin || '').trim() || null;
  if (!['aktif', 'diarsipkan'].includes(status) || !['draf', 'aktif', 'menunggu_admin', 'diproses', 'hasil_terbit', 'dibatalkan'].includes(statusSesi)) return res.status(400).render('errors/error', { title: 'Status tidak valid', message: 'Status pengelolaan atau status sesi tidak dikenali.' });
  const result = await query("UPDATE public.kuesioner_sesi SET status_pengelolaan=$1, status_sesi=$2, catatan_admin=$3, updated_at=now() WHERE sesi_id=$4 RETURNING sesi_id", [status, statusSesi, catatan, req.params.id]);
  if (!result.rowCount) return res.status(404).render('errors/error', { title: 'Sesi tidak ditemukan', message: 'Sesi yang diminta tidak ditemukan.' });
  await audit.log({ actorUserId: req.session.user.id, action: 'sesi_dikelola', entityType: 'sesi', entityId: req.params.id, details: { status_pengelolaan: status, status_sesi: statusSesi } }).catch(() => {});
  res.redirect('/admin/sesi?notice=updated');
});

const detail = asyncHandler(async (req, res) => {
  const sessionResult = await query(`SELECT sesi_id, kode_sesi, nama_peserta, tanggal_tes, status_sesi, status_pengelolaan, status_akses_hasil
    FROM public.kuesioner_sesi WHERE sesi_id=$1`, [req.params.id]);
  if (!sessionResult.rowCount) return res.status(404).render('errors/error', { title: 'Sesi tidak ditemukan', message: 'Sesi yang diminta tidak ditemukan.' });
  const details = await query(`SELECT sd.sesi_detail_id, sd.versi_id, sd.urutan, sd.status_pengerjaan, sd.dimulai_pada, sd.selesai_pada,
      v.nama_versi, v.kode_versi, m.nama_kuesioner,
      (SELECT COUNT(*)::int FROM public.kuesioner_jawaban j WHERE j.sesi_detail_id=sd.sesi_detail_id) AS jumlah_jawaban,
      (SELECT h.status_hasil FROM public.kuesioner_hasil h WHERE h.sesi_detail_id=sd.sesi_detail_id LIMIT 1) AS status_hasil
    FROM public.kuesioner_sesi_detail sd
    JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id
    JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id
    WHERE sd.sesi_id=$1 ORDER BY sd.urutan`, [req.params.id]);
  res.render('sesi/detail', { title: 'Detail Sesi Kuesioner', sesi: sessionResult.rows[0], details: details.rows, notice: req.query.notice || null });
});

const resetTest = asyncHandler(async (req, res) => {
  const detailId = Number(req.params.detailId);
  if (!Number.isSafeInteger(detailId)) return res.status(400).render('errors/error', { title: 'Permintaan tidak valid', message: 'ID tes tidak valid.' });
  await withTransaction(async client => {
    const found = await client.query(`SELECT sd.sesi_detail_id, sd.sesi_id FROM public.kuesioner_sesi_detail sd WHERE sd.sesi_detail_id=$1 AND sd.sesi_id=$2 FOR UPDATE`, [detailId, req.params.id]);
    if (!found.rowCount) throw new Error('Tes tidak ditemukan pada sesi ini.');
    // Hapus laporan dahulu agar foreign key hasil tidak menghalangi penghapusan.
    const h = await client.query('SELECT hasil_id FROM public.kuesioner_hasil WHERE sesi_detail_id=$1', [detailId]);
    for (const row of h.rows) {
      await client.query('DELETE FROM public.kuesioner_laporan WHERE hasil_id=$1', [row.hasil_id]);
      await client.query('DELETE FROM public.kuesioner_hasil_dimensi WHERE hasil_id=$1', [row.hasil_id]);
    }
    await client.query('DELETE FROM public.kuesioner_hasil WHERE sesi_detail_id=$1', [detailId]);
    await client.query('DELETE FROM public.kuesioner_jawaban WHERE sesi_detail_id=$1', [detailId]);
    await client.query(`UPDATE public.kuesioner_sesi_detail SET status_pengerjaan='belum_mulai', dimulai_pada=NULL, selesai_pada=NULL, updated_at=now() WHERE sesi_detail_id=$1`, [detailId]);
    await client.query(`UPDATE public.kuesioner_sesi SET status_sesi='aktif', status_akses_hasil='belum_tersedia', hasil_diterbitkan_pada=NULL, diproses_pada=NULL, final_dikirim_pada=NULL, updated_at=now() WHERE sesi_id=$1`, [req.params.id]);
  });
  await audit.log({ actorUserId: req.session.user.id, action: 'tes_dibatalkan_untuk_ulang', entityType: 'sesi_detail', entityId: detailId, details: { sesi_id: Number(req.params.id) } }).catch(() => {});
  res.redirect(`/admin/sesi/${req.params.id}/detail?notice=reset`);
});


const calculateResult = asyncHandler(async (req, res) => {
  try {
    const result = await resultService.calculate(Number(req.params.detailId), req.session.user.id);
    await audit.log({ actorUserId: req.session.user.id, action: 'hasil_dihitung', entityType: 'sesi_detail', entityId: req.params.detailId, details: { sesi_id: Number(req.params.id), kode_hasil: result.code } }).catch(() => {});
    res.redirect(`/admin/sesi/${req.params.id}/tes/${req.params.detailId}/hasil?notice=calculated`);
  } catch (err) {
    res.status(400).render('errors/error', { title: 'Hitung Nilai Gagal', message: err.message || 'Nilai tidak dapat dihitung.' });
  }
});
const viewResult = asyncHandler(async (req, res) => {
  const r = await query(`SELECT h.*, sd.sesi_id, s.kode_sesi, s.nama_peserta, s.tanggal_tes, v.nama_versi, m.nama_kuesioner
    FROM public.kuesioner_hasil h JOIN public.kuesioner_sesi_detail sd ON sd.sesi_detail_id=h.sesi_detail_id
    JOIN public.kuesioner_sesi s ON s.sesi_id=sd.sesi_id JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id
    JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id WHERE h.sesi_detail_id=$1 AND sd.sesi_id=$2`, [req.params.detailId, req.params.id]);
  if (!r.rowCount) return res.status(404).render('errors/error', { title: 'Hasil belum tersedia', message: 'Tekan Hitung Nilai terlebih dahulu setelah peserta menyelesaikan tes.' });
  const dims = await query(`SELECT hd.*, d.kode_dimensi, d.nama_dimensi FROM public.kuesioner_hasil_dimensi hd JOIN public.kuesioner_dimensi d ON d.dimensi_id=hd.dimensi_id WHERE hd.hasil_id=$1 ORDER BY d.urutan`, [r.rows[0].hasil_id]);
  res.render('sesi/result', { title: 'Rincian Skor', hasil: r.rows[0], dimensions: dims.rows, notice: req.query.notice || null });
});
const publishResult = asyncHandler(async (req, res) => {
  try {
    await resultService.publish(Number(req.params.detailId), req.session.user.id);
    await audit.log({ actorUserId: req.session.user.id, action: 'hasil_diterbitkan', entityType: 'sesi_detail', entityId: req.params.detailId, details: { sesi_id: Number(req.params.id) } }).catch(() => {});
    res.redirect(`/admin/sesi/${req.params.id}/detail?notice=published`);
  } catch (err) {
    res.status(400).render('errors/error', { title: 'Penerbitan Hasil Gagal', message: err.message || 'Hasil tidak dapat diterbitkan.' });
  }
});
const adminPdf = asyncHandler(async (req, res) => {
  const published = await query(`SELECT h.hasil_id FROM public.kuesioner_hasil h JOIN public.kuesioner_sesi_detail sd ON sd.sesi_detail_id=h.sesi_detail_id WHERE h.sesi_detail_id=$1 AND sd.sesi_id=$2 AND h.status_hasil='diterbitkan'`, [req.params.detailId, req.params.id]);
  if (!published.rowCount) return res.status(403).render('errors/error', { title: 'PDF belum diterbitkan', message: 'Terbitkan hasil terlebih dahulu sebelum melihat atau mengunduh PDF.' });
  const report = await resultService.getPublishedPdf(Number(req.params.detailId));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="hasil-${report.filename}.pdf"`);
  res.send(report.pdf);
});
const reissueAccess = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const token = crypto.randomBytes(32).toString('base64url');
  const qrHash = crypto.createHash('sha256').update(token).digest('hex');
  const pin = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const pinHash = await bcrypt.hash(pin, 12);
  const updated = await query(`UPDATE public.kuesioner_sesi SET qr_token_hash=$1, pin_hash=$2, pin_diubah_pada=now(), percobaan_pin_gagal=0, terkunci_sampai=NULL, updated_at=now() WHERE sesi_id=$3 RETURNING sesi_id,kode_sesi,nama_peserta`, [qrHash,pinHash,id]);
  if (!updated.rowCount) return res.status(404).render('errors/error', { title: 'Sesi tidak ditemukan', message: 'Sesi tidak ditemukan.' });
  const qrUrl = `${require('../config/environment').loadEnvironment().appBaseUrl}/kuesioner/akses/${token}`;
  const qrImage = await QRCode.toDataURL(qrUrl, { width: 280, margin: 2 });
  await audit.log({ actorUserId: req.session.user.id, action: 'akses_sesi_diganti', entityType: 'sesi', entityId: id, details: { kode_sesi: updated.rows[0].kode_sesi } }).catch(() => {});
  res.render('sesi/created', { title: 'QR & PIN Baru', sesi: updated.rows[0], pin, token, qrUrl, qrImage, regenerated: true });
});

module.exports = { index, createForm, create, editForm, update, detail, resetTest, calculateResult, viewResult, publishResult, adminPdf, reissueAccess };
