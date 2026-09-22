const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const multer = require('multer');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `food-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Hanya file gambar yang diizinkan'));
  },
});

router.use(authenticate, requireRole('donor', 'admin'), requireActive);

router.post('/', upload.single('photo'), (req, res) => {
  const { name, description, portions, expiry_at, lat, lng } = req.body || {};
  if (!name || !portions || !expiry_at) {
    return res.status(400).json({ error: 'name, portions, expiry_at wajib diisi' });
  }
  if (Number(portions) <= 0) return res.status(400).json({ error: 'Portions harus > 0' });
  if (new Date(expiry_at).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Expiry time harus di masa depan' });
  }

  const donor = db.prepare('SELECT lat, lng FROM users WHERE id = ?').get(req.user.id);
  const result = db
    .prepare(
      `INSERT INTO food_listings (donor_id, name, description, portions, expiry_at, photo_path, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.id,
      name.trim(),
      description || null,
      Number(portions),
      expiry_at,
      req.file ? `/uploads/${req.file.filename}` : null,
      lat != null ? Number(lat) : donor?.lat ?? null,
      lng != null ? Number(lng) : donor?.lng ?? null
    );

  audit(req.user.id, 'CREATE_LISTING', 'food_listings', result.lastInsertRowid, { name, portions });
  res.status(201).json({ id: result.lastInsertRowid, message: 'Surplus makanan dicatat' });
});

router.get('/', (req, res) => {
  const rows =
    req.user.role === 'admin'
      ? db.prepare('SELECT * FROM food_listings ORDER BY created_at DESC').all()
      : db
          .prepare('SELECT * FROM food_listings WHERE donor_id = ? ORDER BY created_at DESC')
          .all(req.user.id);
  res.json(rows);
});

router.patch('/:id/cancel', (req, res) => {
  const listing = db.prepare('SELECT * FROM food_listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing tidak ditemukan' });
  if (req.user.role !== 'admin' && listing.donor_id !== req.user.id) {
    return res.status(403).json({ error: 'Bukan milik Anda' });
  }
  if (!['available', 'matched'].includes(listing.status)) {
    return res.status(400).json({ error: `Tidak bisa membatalkan status ${listing.status}` });
  }
  db.prepare(`UPDATE food_listings SET status = 'cancelled' WHERE id = ?`).run(listing.id);
  const m = db.prepare(`SELECT * FROM matches WHERE listing_id = ? AND status NOT IN ('cancelled','verified','delivered')`).get(listing.id);
  if (m) db.prepare(`UPDATE matches SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(m.id);
  audit(req.user.id, 'CANCEL_LISTING', 'food_listings', listing.id);
  res.json({ message: 'Listing dibatalkan' });
});

module.exports = router;
