-- ============================================
-- RESET DATA Food Rescue AI di Turso
-- Jalankan di: app.turso.tech → database → SQL / Console
--
-- OPSI A — Bersihkan data, AKUN LOGIN TETAP (disarankan):
--   Hapus baris DELETE FROM users; di bawah
--
-- OPSI B — Reset total (akun ikut hilang, auto-seed ulang admin):
--   Biarkan semua baris seperti adanya
-- ============================================

DROP TRIGGER IF EXISTS audit_logs_no_update;
DROP TRIGGER IF EXISTS audit_logs_no_delete;

DELETE FROM otp_codes;
DELETE FROM notifications;
DELETE FROM message_outbox;
DELETE FROM audit_logs;
DELETE FROM matches;
DELETE FROM food_listings;
DELETE FROM food_needs;
-- OPSI A: komentar baris berikut agar akun login dipertahankan
DELETE FROM users;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is immutable');
END;

CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit_logs is immutable');
END;

-- Verifikasi: listings/needs/matches/logs harus 0; users = akun tersisa
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM food_listings) AS listings,
  (SELECT COUNT(*) FROM food_needs) AS needs,
  (SELECT COUNT(*) FROM matches) AS matches,
  (SELECT COUNT(*) FROM message_outbox) AS outbox,
  (SELECT COUNT(*) FROM audit_logs) AS logs;
