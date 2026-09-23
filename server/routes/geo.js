const express = require('express');
const db = require('../db');
const { authenticate, requireActive } = require('../middleware');

const router = express.Router();

router.use(authenticate, requireActive);

router.get('/', async (_req, res, next) => {
  try {
    const users = await db.all(
      `SELECT id, name, role, status, address, lat, lng, capacity
       FROM users
       WHERE role IN ('donor', 'recipient', 'courier')
         AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY id`
    );
    const listings = await db.all(
      `SELECT id, name, portions, food_type, status, expiry_at, lat, lng, donor_id
       FROM food_listings
       WHERE lat IS NOT NULL AND lng IS NOT NULL
         AND status IN ('available', 'matched')
       ORDER BY id`
    );
    res.json({ users, listings });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
