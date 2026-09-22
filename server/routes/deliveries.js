const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const db = require('../db');
const { generateOtp } = require('../lib/auth');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `handover-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => ( /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Hanya gambar')) ),
});

router.use(authenticate, requireActive);

function getMatch(id) {
  return db
    .prepare(
      `SELECT m.*, l.donor_id, l.name AS listing_name, n.recipient_id, n.title AS need_title
       FROM matches m
       JOIN food_listings l ON l.id = m.listing_id
       JOIN food_needs n ON n.id = m.need_id
       WHERE m.id = ?`
    )
    .get(id);
}

function assertCourier(req, match) {
  if (req.user.role !== 'admin' && match.courier_id !== req.user.id) {
    const err = new Error('Hanya kurir yang ditugaskan');
    err.status = 403;
    throw err;
  }
}

router.post('/:id/pickup', upload.single('photo'), requireRole('courier', 'admin'), (req, res) => {
  try {
    const match = getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    assertCourier(req, match);
    if (!['proposed', 'accepted'].includes(match.status)) {
      return res.status(400).json({ error: `Status ${match.status} tidak bisa di-pickup` });
    }
    if (!req.file) return res.status(400).json({ error: 'Foto kondisi makanan wajib diupload (FR-07)' });

    db.prepare(
      `UPDATE matches SET status = 'picked_up', photo_path = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(`/uploads/${req.file.filename}`, match.id);
    db.prepare(`UPDATE food_listings SET status = 'picked_up' WHERE id = ?`).run(match.listing_id);

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    db.prepare(`INSERT INTO otp_codes (match_id, code, expires_at) VALUES (?, ?, ?)`).run(match.id, code, expiresAt);

    notify(
      match.recipient_id,
      'Kurir Menuju Lokasi Anda',
      `Kurir telah menjemput "${match.listing_name}". OTP konfirmasi: ${code} (berlaku 30 menit).`,
      match.id
    );
    notify(match.donor_id, 'Surplus Dijemput Kurir', `"${match.listing_name}" sedang dalam perjalanan.`, match.id);
    audit(req.user.id, 'PICKUP', 'matches', match.id, { photo: req.file.filename });

    res.json({ message: 'Pickup tercatat, OTP dikirim ke penerima', otp_hint: 'OTP tampil di notifikasi penerima (demo)' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/:id/deliver', requireRole('courier', 'admin'), (req, res) => {
  try {
    const match = getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    assertCourier(req, match);
    if (match.status !== 'picked_up') {
      return res.status(400).json({ error: 'Match harus berstatus picked_up' });
    }
    db.prepare(`UPDATE matches SET status = 'delivered', updated_at = datetime('now') WHERE id = ?`).run(match.id);
    db.prepare(`UPDATE food_listings SET status = 'delivered' WHERE id = ?`).run(match.listing_id);
    audit(req.user.id, 'DELIVER', 'matches', match.id);
    res.json({ message: 'Status diperbarui: sampai di lokasi, menunggu konfirmasi OTP penerima' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/:id/verify-otp', requireRole('recipient', 'admin'), (req, res) => {
  try {
    const match = getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    if (req.user.role !== 'admin' && match.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Hanya penerima yang bisa konfirmasi' });
    }
    if (!['picked_up', 'delivered'].includes(match.status)) {
      return res.status(400).json({ error: 'Match belum siap dikonfirmasi' });
    }

    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP wajib diisi' });

    const row = db
      .prepare(
        `SELECT * FROM otp_codes
         WHERE match_id = ? AND used_at IS NULL
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(match.id);
    if (!row) return res.status(400).json({ error: 'OTP tidak ditemukan' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP kedaluwarsa' });
    }
    if (row.code !== String(otp).trim()) {
      audit(req.user.id, 'OTP_FAIL', 'matches', match.id);
      return res.status(400).json({ error: 'OTP salah' });
    }

    db.prepare(`UPDATE otp_codes SET used_at = datetime('now') WHERE id = ?`).run(row.id);
    db.prepare(
      `UPDATE matches SET status = 'verified', updated_at = datetime('now') WHERE id = ?`
    ).run(match.id);
    db.prepare(`UPDATE food_listings SET status = 'verified' WHERE id = ?`).run(match.listing_id);
    db.prepare(`UPDATE food_needs SET status = 'fulfilled', updated_at = datetime('now') WHERE id = ?`).run(match.need_id);

    notify(match.courier_id, 'Serah Terima Terverifikasi', `Match #${match.id} selesai via OTP.`, match.id);
    notify(match.donor_id, 'Redistribusi Selesai', `"${match.listing_name}" telah diterima penerima.`, match.id);
    audit(req.user.id, 'VERIFY_OTP', 'matches', match.id, { need_id: match.need_id });

    res.json({ message: 'Serah terima terverifikasi. Terima kasih!' });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/:id/otp-status', requireRole('recipient', 'admin'), (req, res) => {
  const match = getMatch(req.params.id);
  if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
  if (req.user.role !== 'admin' && match.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Bukan penerima match ini' });
  }
  const row = db
    .prepare(`SELECT code, expires_at, used_at FROM otp_codes WHERE match_id = ? ORDER BY created_at DESC LIMIT 1`)
    .get(match.id);
  res.json(row || { code: null });
});

module.exports = router;
