const express = require('express');
const multer = require('multer');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan'));
  },
});

function fileToDataUri(file) {
  if (!file) return null;
  return `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
}

router.use(authenticate, requireRole('donor', 'admin'), requireActive);

router.post('/', upload.single('photo'), async (req, res, next) => {
  try {
    const { name, description, portions, expiry_at, lat, lng } = req.body || {};
    if (!name || !portions || !expiry_at) {
      return res.status(400).json({ error: 'name, portions, expiry_at wajib diisi' });
    }
    if (Number(portions) <= 0) return res.status(400).json({ error: 'Portions harus > 0' });
    if (new Date(expiry_at).getTime() <= Date.now()) {
      return res.status(400).json({ error: 'Expiry time harus di masa depan' });
    }

    const donor = await db.get('SELECT lat, lng FROM users WHERE id = ?', [req.user.id]);
    const result = await db.run(
      `INSERT INTO food_listings (donor_id, name, description, portions, expiry_at, photo_path, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        name.trim(),
        description || null,
        Number(portions),
        expiry_at,
        fileToDataUri(req.file),
        lat != null ? Number(lat) : donor?.lat ?? null,
        lng != null ? Number(lng) : donor?.lng ?? null,
      ]
    );

    await audit(req.user.id, 'CREATE_LISTING', 'food_listings', result.lastInsertRowid, { name, portions });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Surplus makanan dicatat' });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows =
      req.user.role === 'admin'
        ? await db.all('SELECT * FROM food_listings ORDER BY created_at DESC')
        : await db.all('SELECT * FROM food_listings WHERE donor_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id/cancel', async (req, res, next) => {
  try {
    const listing = await db.get('SELECT * FROM food_listings WHERE id = ?', [req.params.id]);
    if (!listing) return res.status(404).json({ error: 'Listing tidak ditemukan' });
    if (req.user.role !== 'admin' && listing.donor_id !== req.user.id) {
      return res.status(403).json({ error: 'Bukan milik Anda' });
    }
    if (!['available', 'matched'].includes(listing.status)) {
      return res.status(400).json({ error: `Tidak bisa membatalkan status ${listing.status}` });
    }
    await db.run(`UPDATE food_listings SET status = 'cancelled' WHERE id = ?`, [listing.id]);
    const m = await db.get(
      `SELECT * FROM matches WHERE listing_id = ? AND status NOT IN ('cancelled','verified','delivered')`,
      [listing.id]
    );
    if (m) await db.run(`UPDATE matches SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`, [m.id]);
    await audit(req.user.id, 'CANCEL_LISTING', 'food_listings', listing.id);
    res.json({ message: 'Listing dibatalkan' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
