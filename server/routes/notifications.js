const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`
    )
    .all(req.user.id);
  res.json(rows);
});

router.post('/:id/read', (req, res) => {
  db.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
    req.params.id,
    req.user.id
  );
  res.json({ message: 'OK' });
});

router.post('/read-all', (req, res) => {
  db.prepare(
    `UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`
  ).run(req.user.id);
  res.json({ message: 'OK' });
});

module.exports = router;
