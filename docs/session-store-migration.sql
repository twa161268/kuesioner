-- MIGRASI OPSIONAL — hanya untuk penyimpanan session login aplikasi.
-- Tinjau terlebih dahulu dan jalankan secara manual di Supabase SQL Editor.
-- Tidak mengubah tabel kuesioner yang sudah ada.
CREATE TABLE IF NOT EXISTS public.kuesioner_app_sessions (
  sid varchar NOT NULL PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kuesioner_app_sessions_expire
  ON public.kuesioner_app_sessions (expire);

-- Setelah tabel ini dibuat dan diuji, atur SESSION_TABLE_READY=true di environment.
