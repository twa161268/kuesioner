# Aplikasi Kuesioner — Node.js + Supabase + Vercel

Fondasi aplikasi berbahasa Indonesia menggunakan Node.js, Express, EJS, PostgreSQL Supabase, login mandiri tanpa Supabase Auth, dan struktur modular routes/controllers/repositories/services/middlewares.

## Status paket

Paket ini masih dalam tahap implementasi. Sudah tersedia CRUD pemohon, pengelolaan sesi dengan pembuatan QR/PIN, CRUD master kuesioner untuk super admin, login/role, dashboard, dan verifikasi PIN dasar. Modul versi/dimensi/pertanyaan/pilihan/aturan skor, pengisian jawaban, mesin skor, publikasi hasil, dan PDF belum selesai. Lihat `docs/STATUS-IMPLEMENTASI.md` untuk batasan lengkap.

## Kebutuhan

- Node.js 20 atau lebih baru
- Database PostgreSQL Supabase
- Akun admin yang sudah memiliki `email`, `password_hash`, `role`, dan `status` pada `public.kuesioner_user`

## Menjalankan lokal

1. Ekstrak ZIP ke folder kerja.
2. Buka terminal di folder `kuesioner-app`.
3. Jalankan `npm install`.
4. Salin `.env.example` menjadi `.env`.
5. Isi `DATABASE_URL` dari pengaturan koneksi PostgreSQL Supabase. Jangan memasukkan connection string ke source code atau browser.
6. Isi `SESSION_SECRET` dengan secret acak minimal 32 karakter.
7. Tinjau `docs/session-store-migration.sql`. Untuk development, session store PostgreSQL dipakai jika `SESSION_TABLE_READY=true`; bila tabel belum dibuat, jangan set nilai tersebut.
8. Jalankan `npm run check:schema` untuk memeriksa kolom inti secara read-only.
9. Jalankan `npm run dev`.
10. Buka `http://localhost:3000` dan `http://localhost:3000/login`.

### Membuat password hash

Jalankan dari terminal di folder proyek:

```bash
node -e "const b=require('bcryptjs'); b.hash(process.argv[1],12).then(console.log)" "PASSWORD_BARU"
```

Salin hash hasilnya ke kolom `password_hash` akun administrator yang sudah ada, menggunakan SQL Editor Supabase secara hati-hati. Jangan simpan password asli di database. Pastikan nama kolom dan tipe `user_id` sesuai schema aktual. Jangan membuat akun publik dari aplikasi.

## Session store production

Vercel menjalankan aplikasi secara serverless sehingga session tidak boleh disimpan hanya dalam memori proses. Tinjau `docs/session-store-migration.sql`, jalankan secara manual di Supabase SQL Editor jika disetujui, lalu set:

- `SESSION_TABLE_NAME=kuesioner_app_sessions`
- `SESSION_TABLE_READY=true`
- `NODE_ENV=production`
- `DATABASE_URL=...`
- `SESSION_SECRET=...`
- `APP_BASE_URL=https://domain-aplikasi-anda`

Jangan set `SESSION_TABLE_READY=true` sebelum tabel session tersedia. Gunakan koneksi PostgreSQL/pooler Supabase yang direkomendasikan untuk server-side dan serverless.

## Deploy ke Vercel

1. Push folder proyek ke repository Git.
2. Import repository ke Vercel.
3. Isi Environment Variables pada Vercel sesuai `.env.example` dan catatan session store di atas.
4. Deploy.
5. Uji `/health`, halaman login, akses role, dashboard, dan koneksi database.

## Struktur

- `api/index.js`: entry point Vercel, mengekspor Express app.
- `src/app.js`: konfigurasi Express, EJS, middleware, routes.
- `src/config`: database, session, environment.
- `src/routes`: definisi endpoint.
- `src/controllers`: alur request/response.
- `src/repositories`: query database.
- `src/services`: logika bisnis.
- `src/middlewares`: autentikasi, role, CSRF, rate limit, error handler.
- `src/views`: template EJS.
- `public/css`, `public/js`: aset frontend.
- `scripts/check-schema.js`: audit kolom inti secara read-only.
- `docs/session-store-migration.sql`: migrasi opsional session store, terpisah dari schema kuesioner.

## Fitur dan batasan saat ini

- Pemohon: tambah, ubah, pencarian, pagination, aktif/nonaktif.
- Sesi: buat dari pemohon, pilih versi yang diterbitkan sesuai usia, QR/PIN, kelola status/arsip. PIN dan token hanya ditampilkan setelah sesi dibuat.
- Master kuesioner: CRUD dasar untuk `super_admin`.
- QR/PIN saat ini baru memverifikasi akses; halaman menjawab belum tersedia. Jangan gunakan untuk tes produksi sampai alur jawaban dan skor selesai.

## Catatan database

Dokumentasi yang dilampirkan memuat constraint, index, sequence, trigger, RLS, dan daftar kolom lengkap untuk `kuesioner_sesi` serta `kuesioner_sesi_detail`, tetapi tidak memuat daftar kolom lengkap semua tabel. Karena itu, kode memvalidasi sebagian kolom saat runtime dan beberapa modul menolak berjalan jika kolom wajib tidak ditemukan. Tidak ada migrasi otomatis untuk tabel kuesioner.

RLS dilaporkan aktif dan policy tidak terlihat pada hasil dokumentasi. Pastikan role PostgreSQL yang digunakan server memiliki hak yang tepat; jangan mematikan RLS secara membabi buta dan jangan pernah mengirim kredensial istimewa ke browser.

## Pengujian

- `npm run check:schema` — pemeriksaan kolom inti database.
- `npm test` — tes unit yang tersedia.

Paket ini belum boleh dianggap siap produksi penuh sebelum seluruh alur bisnis diuji end-to-end dan modul yang belum aktif diselesaikan.

## Pengisian kuesioner peserta
Setelah peserta memverifikasi PIN pada QR, aplikasi mengarahkan peserta ke `/kuesioner/isi/:token`. Halaman ini memuat pertanyaan dan pilihan jawaban aktif dari versi yang terhubung ke sesi. Jawaban disimpan ke `kuesioner_jawaban`; tiap versi ditandai selesai pada `kuesioner_sesi_detail` setelah pertanyaan wajib dijawab. Jika sesi berisi beberapa versi, peserta otomatis diarahkan ke versi berikutnya. Pengujian koneksi dan data produksi Supabase tetap perlu dilakukan pada lingkungan deployment Anda.


## Catatan pembaruan Super Admin
- QR token disimpan sebagai SHA-256 hash dan PIN sebagai bcrypt hash. QR/PIN hanya ditampilkan saat sesi dibuat atau saat Super Admin menekan **Buat QR & PIN Baru**. Nilai asli tidak disimpan sehingga tidak perlu migrasi kolom enkripsi. QR/PIN baru langsung mencabut akses lama tanpa menghapus jawaban atau hasil tes.
- Paket ini tetap perlu diuji integrasi dengan skema Supabase aktual sebelum dipakai untuk sesi produksi.


## Update fitur sesi, skor, dan PDF
- Detail Sesi menampilkan informasi sesi, status tiap tes, jumlah jawaban, dan status hasil.
- Super Admin dapat menghitung nilai dan melihat rincian skor per dimensi. Setelah pemeriksaan, Super Admin dapat menerbitkan hasil.
- Setiap tes mempunyai PDF tersendiri. Tombol Lihat PDF dan Unduh PDF tersedia setelah hasil diterbitkan. Peserta yang sudah memverifikasi QR/PIN dapat membuka portal status tes dan mengunduh PDF yang sudah diterbitkan.
- PDF dirender dari hasil yang tersimpan di database saat diminta (belum diunggah sebagai file ke Supabase Storage).
- Batalkan/Izinkan Ulang menghapus jawaban, hasil, rincian hasil, dan laporan untuk tes terpilih saja, tanpa menyimpan salinan hasil lama. Tes lain dan QR/PIN sesi tidak berubah.
- Uji QR & PIN tersedia dari halaman akses yang baru dibuat/diperbarui; scan QR menggunakan HP dan masukkan PIN yang ditampilkan.
- Pengujian yang tersedia: pemeriksaan sintaks JavaScript dan unit test usia. Koneksi Supabase dan deploy Vercel belum diuji dari paket ini.
