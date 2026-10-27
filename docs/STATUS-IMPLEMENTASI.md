# Status Implementasi APLKUE

## Implementasi pada paket ini
- Login administrator berbasis bcryptjs, role `admin` dan `super_admin`, CSRF, rate limit, Helmet, dan session handling.
- Dashboard ringkasan dan daftar data.
- **CRUD pemohon:** tambah, daftar dengan pencarian/paginasi, ubah, aktif/nonaktif. Data pemohon tidak dihapus fisik.
- **Pengelolaan sesi:** buat sesi dari pemohon aktif, input peserta, hitung usia sesuai tanggal lahir/tanggal tes, pilih satu atau beberapa versi yang sudah diterbitkan dan sesuai usia, simpan detail sesi dalam transaksi database, buat kode sesi unik, QR token acak (yang disimpan sebagai hash SHA-256), dan PIN 6 digit (yang disimpan sebagai hash bcrypt). PIN dan token mentah hanya ditampilkan pada halaman hasil pembuatan sesi.
- Pengelolaan sesi: ubah status sesi/status pengelolaan dan catatan admin; arsip tidak menghapus riwayat.
- Akses QR/PIN dasar: token divalidasi lewat hash, PIN diverifikasi, percobaan dibatasi dan sesi dikunci 15 menit setelah 5 percobaan gagal.
- **CRUD master kuesioner** (khusus `super_admin`): tambah, daftar/cari, ubah status dan deskripsi. Tidak ada penghapusan fisik untuk menjaga FK.
- Pemeriksaan usia unit test.

## Belum selesai
- CRUD versi kuesioner, dimensi, pertanyaan, pilihan, interpretasi, dan aturan skor.
- Finalisasi/penguncian sesi penuh dan interpretasi hasil yang lengkap masih perlu penyesuaian lanjutan.
- Manajemen user super admin dan workflow permintaan penghapusan data.
- Pengujian integrasi langsung ke Supabase dan deploy Vercel.

## Catatan penting
- Alur peserta mencakup verifikasi PIN, pengisian jawaban, dan portal status hasil. Integrasi langsung terhadap database Supabase aktif tetap perlu diuji sebelum produksi.
- Kode memakai introspeksi kolom untuk menghindari asumsi berlebihan, tetapi perlu diuji dengan schema Supabase aktif. Jangan menonaktifkan RLS secara membabi buta. Jika operasi tulis ditolak, periksa kebijakan RLS dan role koneksi server.
- Tes otomatis yang dijalankan pada paket ini: pemeriksaan sintaks JavaScript dan `npm test` (3 tes usia lulus). Koneksi DB/Vercel belum diuji.

## Pembaruan CRUD instrumen (26 Oktober 2026)
- Ditambahkan CRUD super_admin untuk `kuesioner_versi`, `kuesioner_dimensi`, `kuesioner_pertanyaan`, `kuesioner_pilihan`, dan `kuesioner_aturan_skor`.
- Form dibangun berdasarkan kolom aktual yang dibaca dari `information_schema`, dengan dropdown FK untuk master, versi, pertanyaan, dan dimensi.
- Daftar versi menyediakan navigasi ke dimensi, pertanyaan, dan aturan skor; daftar pertanyaan menyediakan navigasi ke pilihan jawaban.
- Aturan skor memvalidasi agar pertanyaan dan dimensi berasal dari versi yang sama.
- Penghapusan dilakukan melalui POST dan dibatasi oleh foreign key database; data yang sudah direferensikan tidak dipaksa terhapus.
- Pengujian syntax dan unit test berhasil. Koneksi database Supabase belum tersedia untuk pengujian integrasi; pastikan nama kolom aktual dan kebijakan RLS di environment hon sesuai.

- Perbaikan navigasi: menu Pengelolaan Instrumen kini tersedia di navbar Super Admin dan navigasi antar-CRUD ditampilkan pada halaman instrumen. Pilihan Jawaban tetap diakses per pertanyaan karena FK-nya ke pertanyaan.

## Pembaruan alur sesi dan pengulangan tes (26 Oktober 2026)
- Ditambahkan halaman Detail Sesi untuk melihat tiap tes/versi, status pengerjaan, jumlah jawaban tersimpan, dan status hasil.
- Ditambahkan tindakan admin Batalkan / Izinkan Ulang pada tiap tes di dalam sesi.
- Tindakan ulang menghapus laporan, rincian hasil, hasil, dan jawaban untuk detail tes terpilih, lalu mengembalikan status pengerjaan ke `belum_mulai`. QR/PIN dan tes lain dalam sesi tetap sama.
- Tindakan ulang memakai transaksi PostgreSQL dan meminta konfirmasi di browser.
- Catatan batasan: tombol Hitung Nilai, penerbitan PDF per tes, dan portal unduh PDF peserta belum diimplementasikan pada paket ini; perlu pengerjaan berikutnya dan pengujian terhadap skema/akses database aktual.


## Pembaruan fitur hasil, PDF, dan akses QR/PIN
- Super Admin dapat melihat detail sesi, menghitung nilai, membuka rincian skor, menerbitkan hasil, serta melihat/mengunduh PDF per tes.
- Peserta yang telah memverifikasi PIN dapat membuka portal status tes dan mengunduh PDF yang sudah diterbitkan melalui QR/PIN sesi yang sama.
- QR token tetap disimpan sebagai hash SHA-256 dan PIN sebagai bcrypt hash. QR/PIN ditampilkan saat sesi dibuat atau saat akses baru diterbitkan. Pembuatan akses baru mengganti hash sehingga QR/PIN lama tidak berlaku, tanpa menghapus data tes. Tidak diperlukan kolom enkripsi tambahan.
- PDF dibuat saat diminta dari hasil yang sudah diterbitkan dan belum disimpan sebagai berkas di Supabase Storage.
- Pengulangan tes menghapus jawaban, rincian hasil, hasil, dan laporan tes yang dipilih tanpa menyimpan salinan hasil lama.
- Pemeriksaan sintaks JavaScript dan `npm test` dijalankan; pengujian koneksi database Supabase dan deploy Vercel belum dilakukan.
