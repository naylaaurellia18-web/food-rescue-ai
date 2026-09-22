const express = require('express');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

router.use(authenticate, requireRole('recipient', 'admin'), requireActive);

router.post('/', (req, res) => {
  const { title, portions_needed, urgency, note, lat, lng } = req.body || {};
  if (!title || !portions_needed) {
    return res.status(400).json({ error: 'title dan portions_needed wajib diisi' });
  }
  if (!['low', 'medium', 'high', 'critical'].includes(urgency || 'medium')) {
    return res.status(400).json({ error: 'urgency tidak valid' });
  }

  const recipient = db.prepare('SELECT lat, lng FROM users WHERE id = ?').get(req.user.id);
  const result = db
    .prepare(
      `INSERT INTO food_needs (recipient_id, title, portions_needed, urgency, note, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    )
    .run(req.user.id, title.trim(), Number(portions_needed), urgency || 'medium', note || null);

  if (lat != null && lng != null) {
    db.prepare('UPDATE users SET lat = ?, lng = ? WHERE id = ?').run(Number(lat), Number(lng), req.user.id);
  }

  audit(req.user.id, 'CREATE_NEED', 'food_needs', result.lastInsertRowid, { urgency, portions_needed });
  res.status(201).json({ id: result.lastInsertRowid, message: 'Kebutuhan pangan dicatat', user_lat: recipient?.lat });
});

router.get('/', (req, res) => {
  const rows =
    req.user.role === 'admin'
      ? db.prepare('SELECT * FROM food_needs ORDER BY created_at DESC').all()
      : db
          .prepare('SELECT * FROM food_needs WHERE recipient_id = ? ORDER BY created_at DESC')
          .all(req.user.id);
  res.json(rows);
});

router.patch('/:id', (req, res) => {
  const need = db.prepare('SELECT * FROM food_needs WHERE id = ?').get(req.params.id);
  if (!need) return res.status(404).json({ error: 'Kebutuhan tidak ditemukan' });
  if (req.user.role !== 'admin' && need.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Bukan milik Anda' });
  }

  const { title, portions_needed, urgency, note, status } = req.body || {};
  const next = {
    title: title ?? need.title,
    portions_needed: portions_needed != null ? Number(portions_needed) : need.portions_needed,
    urgency: urgency ?? need.urgency,
    note: note ?? need.note,
    status: status ?? need.status,
  };

  db.prepare(
    `UPDATE food_needs SET title = ?, portions_needed = ?, urgency = ?, note = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(next.title, next.portions_needed, next.urgency, next.note, next.status, need.id);

  audit(req.user.id, 'UPDATE_NEED', 'food_needs', need.id, next);
  res.json({ message: 'Kebutuhan diperbarui' });
});

module.exports = router;
