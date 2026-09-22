-- ============================================
-- RESET TOTAL Food Rescue AI di Turso
-- Jalankan di: app.turso.tech → database → SQL / Console
-- Setelah dijalankan, deploy ulang Vercel (atau akses /api/health)
-- untuk auto-seed ulang (hanya admin, data kosong).
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

-- Verifikasi harus 0
SELECT
  (SELECT COUNT(*) FROM users) AS users,
  (SELECT COUNT(*) FROM food_listings) AS listings,
  (SELECT COUNT(*) FROM food_needs) AS needs,
  (SELECT COUNT(*) FROM matches) AS matches,
  (SELECT COUNT(*) FROM message_outbox) AS outbox,
  (SELECT COUNT(*) FROM audit_logs) AS logs;
