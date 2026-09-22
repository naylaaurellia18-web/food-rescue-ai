const express = require('express');
const db = require('../db');
const { authenticate } = require('../middleware');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    await db.run(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND user_id = ?`, [
      req.params.id,
      req.user.id,
    ]);
    res.json({ message: 'OK' });
  } catch (e) {
    next(e);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    await db.run(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`, [
      req.user.id,
    ]);
    res.json({ message: 'OK' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
