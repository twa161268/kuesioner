const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../config/database');
const asyncHandler = require('../utils/asyncHandler');
function hashToken(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }

async function findSession(token) {
  const result = await query(`SELECT sesi_id, kode_sesi, nama_peserta, status_sesi, status_pengelolaan,
      status_akses_hasil, terkunci_sampai
    FROM public.kuesioner_sesi WHERE qr_token_hash=$1 LIMIT 1`, [hashToken(token)]);
  return result.rows[0];
}
function accessAllowed(sesi) {
  return !!sesi && sesi.status_pengelolaan === 'aktif' && sesi.status_sesi !== 'dibatalkan';
}
const showPin = asyncHandler(async (req, res) => {
  const sesi = await findSession(req.params.token);
  if (!accessAllowed(sesi)) return res.status(404).render('errors/error', { title: 'Akses tidak tersedia', message: 'Tautan akses tidak valid, sudah dicabut, atau sesi tidak tersedia.' });
  if (sesi.terkunci_sampai && new Date(sesi.terkunci_sampai) > new Date()) return res.status(429).render('participant/pin', { title: 'Akses terkunci', sesi, token: req.params.token, error: 'Percobaan PIN terlalu banyak. Silakan hubungi administrator setelah masa penguncian berakhir.' });
  res.render('participant/pin', { title: 'Akses Sesi Kuesioner', sesi, token: req.params.token, error: null });
});
const verifyPin = asyncHandler(async (req, res) => {
  const token = req.params.token;
  const result = await query(`SELECT sesi_id, kode_sesi, nama_peserta, pin_hash, percobaan_pin_gagal,
    terkunci_sampai, status_sesi, status_pengelolaan, qr_token_hash
    FROM public.kuesioner_sesi WHERE qr_token_hash=$1 LIMIT 1`, [hashToken(token)]);
  const sesi = result.rows[0];
  if (!accessAllowed(sesi)) return res.status(404).render('errors/error', { title: 'Akses tidak tersedia', message: 'Tautan akses tidak valid, sudah dicabut, atau sesi tidak tersedia.' });
  if (sesi.terkunci_sampai && new Date(sesi.terkunci_sampai) > new Date()) return res.status(429).render('participant/pin', { title: 'Akses terkunci', sesi, token, error: 'Percobaan PIN terlalu banyak. Silakan hubungi administrator setelah masa penguncian berakhir.' });
  const match = await bcrypt.compare(String(req.body.pin || '').trim(), sesi.pin_hash || '');
  if (!match) {
    const attempts = Number(sesi.percobaan_pin_gagal || 0) + 1;
    const locked = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
    await query('UPDATE public.kuesioner_sesi SET percobaan_pin_gagal=$1, terkunci_sampai=$2, updated_at=now() WHERE sesi_id=$3', [locked ? 0 : attempts, locked, sesi.sesi_id]);
    return res.status(401).render('participant/pin', { title: 'Akses Sesi Kuesioner', sesi, token, error: locked ? 'Terlalu banyak percobaan. Akses dikunci selama 15 menit.' : `PIN tidak sesuai. Sisa percobaan sebelum terkunci: ${5 - attempts}.` });
  }
  await query('UPDATE public.kuesioner_sesi SET percobaan_pin_gagal=0, terkunci_sampai=NULL, updated_at=now() WHERE sesi_id=$1', [sesi.sesi_id]);
  if (sesi.status_sesi !== 'aktif') return res.status(200).render('participant/pin', { title: 'Sesi Belum Aktif', sesi, token, error: 'PIN benar, tetapi sesi belum diaktifkan oleh administrator. Silakan hubungi administrator.' });
  req.session.participantAccess = { sesiId: sesi.sesi_id, tokenHash: sesi.qr_token_hash };
  return res.redirect(303, `/kuesioner/hasil/${encodeURIComponent(token)}`);
});

async function loadCurrentQuestionnaire(token, req) {
  const sesi = await findSession(token);
  const expectedHash = hashToken(token);
  if (!req.session.participantAccess || String(req.session.participantAccess.sesiId) !== String(sesi?.sesi_id) || req.session.participantAccess.tokenHash !== expectedHash) return { unauthorized: true, sesi };
  if (!accessAllowed(sesi) || sesi.status_sesi !== 'aktif') return { unavailable: true, sesi };
  const details = await query(`SELECT sd.sesi_detail_id, sd.versi_id, sd.urutan, sd.status_pengerjaan,
      v.nama_versi, v.kode_versi, v.jumlah_pertanyaan, v.skala_min, v.skala_max,
      m.nama_kuesioner
    FROM public.kuesioner_sesi_detail sd
    JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id
    JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id
    WHERE sd.sesi_id=$1 ORDER BY sd.urutan`, [sesi.sesi_id]);
  const detail = details.rows.find(d => d.status_pengerjaan !== 'selesai');
  if (!detail) { const published = await query(`SELECT sd.sesi_detail_id, v.nama_versi, v.kode_versi, m.nama_kuesioner, h.status_hasil FROM public.kuesioner_sesi_detail sd JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id LEFT JOIN public.kuesioner_hasil h ON h.sesi_detail_id=sd.sesi_detail_id WHERE sd.sesi_id=$1 ORDER BY sd.urutan`, [sesi.sesi_id]); return { sesi, complete: true, details: published.rows, token }; }
  const questions = await query(`SELECT p.pertanyaan_id, p.nomor_urut, p.kode_pertanyaan, p.teks_pertanyaan,
      p.tipe_jawaban, p.wajib_dijawab
    FROM public.kuesioner_pertanyaan p
    WHERE p.versi_id=$1 AND p.status='aktif'
    ORDER BY p.nomor_urut, p.pertanyaan_id`, [detail.versi_id]);
  if (!questions.rowCount) return { sesi, detail, details: details.rows, noQuestions: true };
  const choices = await query(`SELECT c.pilihan_id, c.pertanyaan_id, c.nilai, c.kode_pilihan, c.label_pilihan, c.urutan
    FROM public.kuesioner_pilihan c
    JOIN public.kuesioner_pertanyaan p ON p.pertanyaan_id=c.pertanyaan_id
    WHERE p.versi_id=$1 AND p.status='aktif' AND c.status='aktif'
    ORDER BY c.pertanyaan_id, c.urutan`, [detail.versi_id]);
  const answers = await query(`SELECT j.pertanyaan_id, j.pilihan_id
    FROM public.kuesioner_jawaban j WHERE j.sesi_detail_id=$1`, [detail.sesi_detail_id]);
  const answerMap = Object.fromEntries(answers.rows.map(a => [String(a.pertanyaan_id), a.pilihan_id]));
  const choiceMap = {};
  for (const choice of choices.rows) (choiceMap[choice.pertanyaan_id] ||= []).push(choice);
  const items = questions.rows.map(q => ({ ...q, pilihan: choiceMap[q.pertanyaan_id] || [], pilihanTerpilih: answerMap[String(q.pertanyaan_id)] || '' }));
  return { sesi, detail, details: details.rows, items, skalaMin: Number(detail.skala_min || 1), skalaMax: Number(detail.skala_max || 5) };
}
const showQuestionnaire = asyncHandler(async (req, res) => {
  const data = await loadCurrentQuestionnaire(req.params.token, req);
  if (data.unauthorized) return res.redirect(303, `/kuesioner/akses/${encodeURIComponent(req.params.token)}`);
  if (data.unavailable) return res.status(403).render('errors/error', { title: 'Sesi tidak tersedia', message: 'Sesi belum aktif, sudah dicabut, atau tidak dapat diakses.' });
  if (data.complete) return res.render('participant/complete', { title: 'Kuesioner Selesai', ...data });
  if (data.noQuestions) return res.status(409).render('participant/pending', { title: 'Pertanyaan belum tersedia', sesi: data.sesi, message: `Versi tes ${data.detail.nama_versi || data.detail.kode_versi} belum memiliki pertanyaan aktif. Hubungi administrator.` });
  if (data.items.some(q => q.pilihan.length === 0)) return res.status(409).render('participant/pending', { title: 'Pilihan jawaban belum tersedia', sesi: data.sesi, message: 'Sebagian pertanyaan belum memiliki pilihan jawaban aktif. Hubungi administrator.' });
  await query(`UPDATE public.kuesioner_sesi_detail SET status_pengerjaan='sedang_dikerjakan', dimulai_pada=COALESCE(dimulai_pada, now()), updated_at=now() WHERE sesi_detail_id=$1`, [data.detail.sesi_detail_id]);
  res.render('participant/questionnaire', { title: data.detail.nama_kuesioner || 'Isi Kuesioner', token: req.params.token, ...data, error: null });
});
const saveQuestionnaire = asyncHandler(async (req, res) => {
  const token = req.params.token;
  const data = await loadCurrentQuestionnaire(token, req);
  if (data.unauthorized) return res.redirect(303, `/kuesioner/akses/${encodeURIComponent(token)}`);
  if (data.unavailable || data.complete || data.noQuestions || !data.items) return res.status(403).render('errors/error', { title: 'Sesi tidak tersedia', message: 'Sesi tidak dapat menerima jawaban saat ini.' });
  if (data.items.some(q => q.pilihan.length === 0)) return res.status(409).render('participant/pending', { title: 'Pilihan jawaban belum tersedia', sesi: data.sesi, message: 'Sebagian pertanyaan belum memiliki pilihan jawaban aktif. Hubungi administrator.' });
  const posted = req.body.jawaban && typeof req.body.jawaban === 'object' ? req.body.jawaban : {};
  const errors = [];
  const normalized = [];
  for (const q of data.items) {
    const selected = String(posted[q.pertanyaan_id] || '').trim();
    if (!selected) { if (q.wajib_dijawab) errors.push(`Pertanyaan nomor ${q.nomor_urut} belum dijawab.`); continue; }
    const choice = q.pilihan.find(c => String(c.pilihan_id) === selected);
    if (!choice) errors.push(`Pilihan jawaban pertanyaan nomor ${q.nomor_urut} tidak valid.`);
    else normalized.push({ pertanyaan_id: q.pertanyaan_id, pilihan_id: choice.pilihan_id, nilai: choice.nilai });
  }
  if (errors.length) return res.status(400).render('participant/questionnaire', { title: data.detail.nama_kuesioner || 'Isi Kuesioner', token, ...data, error: errors.slice(0, 8).join(' ') });
  await withTransaction(async client => {
    for (const a of normalized) {
      await client.query(`INSERT INTO public.kuesioner_jawaban (sesi_detail_id, pertanyaan_id, pilihan_id, nilai_jawaban, dijawab_pada, updated_at)
        VALUES ($1,$2,$3,$4,now(),now())
        ON CONFLICT (sesi_detail_id, pertanyaan_id) DO UPDATE SET pilihan_id=EXCLUDED.pilihan_id, nilai_jawaban=EXCLUDED.nilai_jawaban, dijawab_pada=now(), updated_at=now()`, [data.detail.sesi_detail_id, a.pertanyaan_id, a.pilihan_id, a.nilai]);
    }
    const requiredCount = data.items.filter(q => q.wajib_dijawab).length;
    const answeredRequired = await client.query(`SELECT COUNT(*)::int AS jumlah FROM public.kuesioner_jawaban j JOIN public.kuesioner_pertanyaan p ON p.pertanyaan_id=j.pertanyaan_id WHERE j.sesi_detail_id=$1 AND p.wajib_dijawab=true`, [data.detail.sesi_detail_id]);
    if (answeredRequired.rows[0].jumlah < requiredCount) throw new Error('Masih ada pertanyaan wajib yang belum dijawab.');
    await client.query(`UPDATE public.kuesioner_sesi_detail SET status_pengerjaan='selesai', selesai_pada=now(), updated_at=now() WHERE sesi_detail_id=$1`, [data.detail.sesi_detail_id]);
  });
  req.session.participantAccess = { sesiId: sesi.sesi_id, tokenHash: sesi.qr_token_hash };
  return res.redirect(303, `/kuesioner/isi/${encodeURIComponent(token)}`);
});


const participantResults = asyncHandler(async (req, res) => {
  const token = req.params.token;
  const sesi = await findSession(token);
  const access = req.session.participantAccess;
  if (!sesi || !accessAllowed(sesi) || !access || String(access.sesiId) !== String(sesi.sesi_id) || access.tokenHash !== hashToken(token)) return res.redirect(303, `/kuesioner/akses/${encodeURIComponent(token)}`);
  const result = await query(`SELECT sd.sesi_detail_id, sd.status_pengerjaan, v.nama_versi, v.kode_versi, m.nama_kuesioner, h.status_hasil
    FROM public.kuesioner_sesi_detail sd JOIN public.kuesioner_versi v ON v.versi_id=sd.versi_id JOIN public.kuesioner_master m ON m.kuesioner_id=v.kuesioner_id
    LEFT JOIN public.kuesioner_hasil h ON h.sesi_detail_id=sd.sesi_detail_id WHERE sd.sesi_id=$1 ORDER BY sd.urutan`, [sesi.sesi_id]);
  res.render('participant/results', { title: 'Status Tes dan Hasil', sesi, details: result.rows, token });
});

const participantPdf = asyncHandler(async (req, res) => {
  const token = req.params.token;
  const sesi = await findSession(token);
  const access = req.session.participantAccess;
  if (!sesi || !accessAllowed(sesi) || !access || String(access.sesiId) !== String(sesi.sesi_id) || access.tokenHash !== hashToken(token)) return res.redirect(303, `/kuesioner/akses/${encodeURIComponent(token)}`);
  const detail = await query(`SELECT sd.sesi_detail_id FROM public.kuesioner_sesi_detail sd JOIN public.kuesioner_hasil h ON h.sesi_detail_id=sd.sesi_detail_id WHERE sd.sesi_id=$1 AND sd.sesi_detail_id=$2 AND h.status_hasil='diterbitkan'`, [sesi.sesi_id, req.params.detailId]);
  if (!detail.rowCount) return res.status(403).render('errors/error', { title: 'Hasil belum tersedia', message: 'PDF hanya bisa diakses setelah hasil tes diterbitkan.' });
  const resultService = require('../services/result.service');
  const report = await resultService.getPublishedPdf(Number(req.params.detailId));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="hasil-${report.filename}.pdf"`);
  res.send(report.pdf);
});

module.exports = { showPin, verifyPin, showQuestionnaire, saveQuestionnaire, participantPdf, participantResults };
