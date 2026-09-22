const express = require('express');
const db = require('../db');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

router.use(authenticate, requireRole('recipient', 'admin'), requireActive);

router.post('/', async (req, res, next) => {
  try {
    const { title, portions_needed, urgency, note, lat, lng } = req.body || {};
    if (!title || !portions_needed) {
      return res.status(400).json({ error: 'title dan portions_needed wajib diisi' });
    }
    if (!['low', 'medium', 'high', 'critical'].includes(urgency || 'medium')) {
      return res.status(400).json({ error: 'urgency tidak valid' });
    }

    const recipient = await db.get('SELECT lat, lng FROM users WHERE id = ?', [req.user.id]);
    const result = await db.run(
      `INSERT INTO food_needs (recipient_id, title, portions_needed, urgency, note, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [req.user.id, title.trim(), Number(portions_needed), urgency || 'medium', note || null]
    );

    if (lat != null && lng != null) {
      await db.run('UPDATE users SET lat = ?, lng = ? WHERE id = ?', [Number(lat), Number(lng), req.user.id]);
    }

    await audit(req.user.id, 'CREATE_NEED', 'food_needs', result.lastInsertRowid, { urgency, portions_needed });
    res.status(201).json({ id: result.lastInsertRowid, message: 'Kebutuhan pangan dicatat', user_lat: recipient?.lat });
  } catch (e) {
    next(e);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const rows =
      req.user.role === 'admin'
        ? await db.all('SELECT * FROM food_needs ORDER BY created_at DESC')
        : await db.all('SELECT * FROM food_needs WHERE recipient_id = ? ORDER BY created_at DESC', [req.user.id]);
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const need = await db.get('SELECT * FROM food_needs WHERE id = ?', [req.params.id]);
    if (!need) return res.status(404).json({ error: 'Kebutuhan tidak ditemukan' });
    if (req.user.role !== 'admin' && need.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Bukan milik Anda' });
    }

    const { title, portions_needed, urgency, note, status } = req.body || {};
    const nextVals = {
      title: title ?? need.title,
      portions_needed: portions_needed != null ? Number(portions_needed) : need.portions_needed,
      urgency: urgency ?? need.urgency,
      note: note ?? need.note,
      status: status ?? need.status,
    };

    await db.run(
      `UPDATE food_needs SET title = ?, portions_needed = ?, urgency = ?, note = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [nextVals.title, nextVals.portions_needed, nextVals.urgency, nextVals.note, nextVals.status, need.id]
    );

    await audit(req.user.id, 'UPDATE_NEED', 'food_needs', need.id, nextVals);
    res.json({ message: 'Kebutuhan diperbarui' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
