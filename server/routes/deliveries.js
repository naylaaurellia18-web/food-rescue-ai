const express = require('express');
const multer = require('multer');
const db = require('../db');
const { generateOtp } = require('../lib/auth');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => (/^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Hanya gambar'))),
});

router.use(authenticate, requireActive);

async function getMatch(id) {
  return db.get(
    `SELECT m.*, l.donor_id, l.name AS listing_name, l.food_type, n.recipient_id, n.title AS need_title
     FROM matches m
     JOIN food_listings l ON l.id = m.listing_id
     JOIN food_needs n ON n.id = m.need_id
     WHERE m.id = ?`,
    [id]
  );
}

function assertCourier(req, match) {
  if (req.user.role !== 'admin' && match.courier_id !== req.user.id) {
    const err = new Error('Hanya kurir yang ditugaskan');
    err.status = 403;
    throw err;
  }
}

router.post('/:id/pickup', upload.single('photo'), requireRole('courier', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    assertCourier(req, match);
    if (!['proposed', 'accepted'].includes(match.status)) {
      return res.status(400).json({ error: `Status ${match.status} tidak bisa di-pickup` });
    }
    if (!req.file) return res.status(400).json({ error: 'Foto kondisi makanan wajib diupload' });

    const photoUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    await db.run(
      `UPDATE matches SET status = 'picked_up', photo_path = ?, updated_at = datetime('now') WHERE id = ?`,
      [photoUri, match.id]
    );
    await db.run(`UPDATE food_listings SET status = 'picked_up' WHERE id = ?`, [match.listing_id]);

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
    await db.run(`INSERT INTO otp_codes (match_id, code, expires_at) VALUES (?, ?, ?)`, [match.id, code, expiresAt]);

    await notify(
      match.recipient_id,
      'Kurir Menuju Lokasi Anda',
      `Kurir telah menjemput "${match.listing_name}". OTP konfirmasi: ${code} (berlaku 30 menit).`,
      match.id
    );
    await notify(match.donor_id, 'Surplus Dijemput Kurir', `"${match.listing_name}" sedang dalam perjalanan.`, match.id);
    await audit(req.user.id, 'PICKUP', 'matches', match.id, { photo: 'base64' });

    res.json({ message: 'Pickup tercatat, OTP dikirim ke penerima', otp_hint: 'OTP tampil di notifikasi penerima (demo)' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/deliver', requireRole('courier', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    assertCourier(req, match);
    if (match.status !== 'picked_up') {
      return res.status(400).json({ error: 'Match harus berstatus picked_up' });
    }
    await db.run(`UPDATE matches SET status = 'delivered', updated_at = datetime('now') WHERE id = ?`, [match.id]);
    await db.run(`UPDATE food_listings SET status = 'delivered' WHERE id = ?`, [match.listing_id]);
    await audit(req.user.id, 'DELIVER', 'matches', match.id);
    res.json({ message: 'Status diperbarui: sampai di lokasi, menunggu konfirmasi OTP penerima' });
  } catch (e) {
    next(e);
  }
});

router.post('/:id/verify-otp', requireRole('recipient', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    if (req.user.role !== 'admin' && match.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Hanya penerima yang bisa konfirmasi' });
    }
    if (!['picked_up', 'delivered'].includes(match.status)) {
      return res.status(400).json({ error: 'Match belum siap dikonfirmasi' });
    }

    const { otp } = req.body || {};
    if (!otp) return res.status(400).json({ error: 'OTP wajib diisi' });

    const row = await db.get(
      `SELECT * FROM otp_codes
       WHERE match_id = ? AND used_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [match.id]
    );
    if (!row) return res.status(400).json({ error: 'OTP tidak ditemukan' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'OTP kedaluwarsa' });
    }
    if (row.code !== String(otp).trim()) {
      await audit(req.user.id, 'OTP_FAIL', 'matches', match.id);
      return res.status(400).json({ error: 'OTP salah' });
    }

    await db.run(`UPDATE otp_codes SET used_at = datetime('now') WHERE id = ?`, [row.id]);
    await db.run(`UPDATE matches SET status = 'verified', updated_at = datetime('now') WHERE id = ?`, [match.id]);
    await db.run(`UPDATE food_listings SET status = 'verified' WHERE id = ?`, [match.listing_id]);
    await db.run(`UPDATE food_needs SET status = 'fulfilled', updated_at = datetime('now') WHERE id = ?`, [match.need_id]);

    await notify(match.courier_id, 'Serah Terima Terverifikasi', `Match #${match.id} selesai via OTP.`, match.id);
    await notify(match.donor_id, 'Redistribusi Selesai', `"${match.listing_name}" telah diterima penerima.`, match.id);
    await audit(req.user.id, 'VERIFY_OTP', 'matches', match.id, { need_id: match.need_id });

    res.json({ message: 'Serah terima terverifikasi. Terima kasih!' });
  } catch (e) {
    next(e);
  }
});

router.get('/:id/otp-status', requireRole('recipient', 'admin'), async (req, res, next) => {
  try {
    const match = await getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: 'Match tidak ditemukan' });
    if (req.user.role !== 'admin' && match.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Bukan penerima match ini' });
    }
    const row = await db.get(
      `SELECT code, expires_at, used_at FROM otp_codes WHERE match_id = ? ORDER BY created_at DESC LIMIT 1`,
      [match.id]
    );
    res.json(row || { code: null });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
