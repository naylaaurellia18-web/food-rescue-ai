const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../lib/auth');
const { audit } = require('../lib/audit');

const router = express.Router();

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, role, phone, address, lat, lng, org_name, capacity } = req.body || {};
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Nama, email, kata sandi, dan peran wajib diisi' });
    }
    if (!['donor', 'recipient', 'courier'].includes(role)) {
      return res.status(400).json({ error: 'Peran harus donor, recipient, atau courier' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Kata sandi minimal 6 karakter' });
    }

    const exists = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (exists) return res.status(409).json({ error: 'Email sudah terdaftar' });

    const result = await db.run(
      `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.toLowerCase(),
        hashPassword(password),
        role,
        phone || null,
        address || null,
        lat != null && lat !== '' && !Number.isNaN(Number(lat)) ? Number(lat) : null,
        lng != null && lng !== '' && !Number.isNaN(Number(lng)) ? Number(lng) : null,
        org_name || null,
        capacity != null ? Number(capacity) : null,
      ]
    );

    await audit(result.lastInsertRowid, 'USER_REGISTER', 'users', result.lastInsertRowid, { role });
    res.status(201).json({
      message: 'Registrasi berhasil. Menunggu verifikasi admin.',
      status: 'pending',
    });
  } catch (e) {
    next(e);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email dan kata sandi wajib diisi' });

    const user = await db.get('SELECT * FROM users WHERE email = ?', [String(email).toLowerCase()]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email atau kata sandi salah' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Akun ditolak oleh admin' });
    }

    await audit(user.id, 'USER_LOGIN', 'users', user.id);
    res.json({
      token: signToken(user),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        org_name: user.org_name,
        capacity: user.capacity,
      },
    });
  } catch (e) {
    next(e);
  }
});

const { authenticate } = require('../middleware');

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await db.get(
      'SELECT id, name, email, role, status, phone, address, lat, lng, org_name, capacity, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
    res.json(user);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
