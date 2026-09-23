const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, signToken, generateOtp } = require('../lib/auth');
const { audit } = require('../lib/audit');
const { sendEmail } = require('../lib/messenger');
const { record } = require('../lib/channels');
const { hit, reset, clientIp } = require('../lib/ratelimit');

const router = express.Router();
const { authenticate } = require('../middleware');

const LOGIN_LIMIT = { limit: 5, windowMs: 15 * 60000 };
const FORGOT_LIMIT = { limit: 5, windowMs: 60 * 60000 };

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

    const ip = clientIp(req);
    const emailKey = String(email).toLowerCase();
    const key = `login:${ip}:${emailKey}`;
    if (!hit(key, LOGIN_LIMIT)) {
      return res.status(429).json({
        error: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.',
      });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [emailKey]);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email atau kata sandi salah' });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Akun ditolak oleh admin' });
    }

    reset(key);
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

router.post('/forgot-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'Email wajib diisi' });

    const ip = clientIp(req);
    if (!hit(`forgot:${ip}:${email}`, FORGOT_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    }

    const user = await db.get('SELECT id, name, email FROM users WHERE email = ?', [email]);
    const generic = {
      message: 'Jika email terdaftar, kode reset sudah dikirim (berlaku 15 menit).',
    };
    if (!user) {
      return res.json(generic);
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60000).toISOString();
    await db.run(
      `UPDATE password_resets SET used_at = datetime('now') WHERE user_id = ? AND used_at IS NULL`,
      [user.id]
    );
    await db.run(`INSERT INTO password_resets (user_id, code, expires_at) VALUES (?, ?, ?)`, [
      user.id,
      code,
      expiresAt,
    ]);

    const subject = 'Reset kata sandi Food Rescue AI';
    const body = `Halo ${user.name},\n\nKode reset kata sandi Anda: ${code}\nBerlaku 15 menit. Abaikan bila tidak meminta.`;
    const mail = await sendEmail(user.email, subject, body);
    if (!mail.skipped) {
      await record({
        channel: 'email',
        userId: user.id,
        to: mail.to || user.email,
        subject,
        body,
        status: mail.ok ? (mail.simulated ? 'simulated' : 'sent') : 'failed',
        error: mail.error || null,
        providerRef: mail.response || null,
      });
    }
    await audit(user.id, 'PASSWORD_RESET_REQUEST', 'users', user.id);
    res.json(generic);
  } catch (e) {
    next(e);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const { code, password } = req.body || {};
    if (!email || !code || !password) {
      return res.status(400).json({ error: 'Email, kode, dan sandi baru wajib diisi' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter' });
    }

    const ip = clientIp(req);
    if (!hit(`reset:${ip}:${email}`, FORGOT_LIMIT)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }

    const user = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (!user) return res.status(400).json({ error: 'Kode tidak valid atau kedaluwarsa' });

    const row = await db.get(
      `SELECT * FROM password_resets
       WHERE user_id = ? AND used_at IS NULL
       ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    if (!row || row.code !== String(code).trim()) {
      return res.status(400).json({ error: 'Kode tidak valid atau kedaluwarsa' });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Kode kedaluwarsa' });
    }

    await db.run(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`, [row.id]);
    await db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(password), user.id]);
    await audit(user.id, 'PASSWORD_RESET', 'users', user.id);
    res.json({ message: 'Kata sandi berhasil diubah. Silakan masuk.' });
  } catch (e) {
    next(e);
  }
});

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
