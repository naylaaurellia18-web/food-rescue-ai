const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

router.post('/register', (req, res) => {
  const { name, email, password, role, phone, address, lat, lng, org_name, capacity } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'name, email, password, role wajib diisi' });
  }
  if (!['donor', 'recipient', 'courier'].includes(role)) {
    return res.status(400).json({ error: 'Role harus donor, recipient, atau courier' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password minimal 6 karakter' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return res.status(409).json({ error: 'Email sudah terdaftar' });

  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name.trim(),
      email.toLowerCase(),
      hashPassword(password),
      role,
      phone || null,
      address || null,
      lat != null ? Number(lat) : null,
      lng != null ? Number(lng) : null,
      org_name || null,
      capacity != null ? Number(capacity) : null
    );

  audit(result.lastInsertRowid, 'USER_REGISTER', 'users', result.lastInsertRowid, { role });
  res.status(201).json({
    message: 'Registrasi berhasil. Menunggu verifikasi admin.',
    status: 'pending',
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email dan password wajib diisi' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Email atau password salah' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Akun ditolak oleh admin' });
  }

  audit(user.id, 'USER_LOGIN', 'users', user.id);
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
});

router.get('/me', authenticate, (req, res) => {
  const user = db
    .prepare(
      'SELECT id, name, email, role, status, phone, address, lat, lng, org_name, capacity, created_at FROM users WHERE id = ?'
    )
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  res.json(user);
});

module.exports = router;
