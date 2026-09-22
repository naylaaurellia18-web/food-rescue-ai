const express = require('express');
const db = require('../db');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

router.use(authenticate, requireRole('admin'), requireActive);

router.get('/stats', (req, res) => {
  const count = (sql, ...params) => db.prepare(sql).get(...params)?.c ?? 0;

  const totalPortionsDelivered = db
    .prepare(
      `SELECT COALESCE(SUM(l.portions), 0) AS c FROM matches m
       JOIN food_listings l ON l.id = m.listing_id
       WHERE m.status IN ('picked_up','delivered','verified')`
    )
    .get().c;

  const avgScore = db.prepare(`SELECT COALESCE(AVG(score), 0) AS c FROM matches`).get().c;
  const avgDistance = db.prepare(`SELECT COALESCE(AVG(distance_km), 0) AS c FROM matches`).get().c;

  const matchingPerf = db
    .prepare(
      `SELECT detail FROM audit_logs WHERE action = 'RUN_MATCHING' ORDER BY id DESC LIMIT 10`
    )
    .all()
    .map((r) => JSON.parse(r.detail || '{}'));

  res.json({
    users: {
      total: count('SELECT COUNT(*) AS c FROM users'),
      pending: count(`SELECT COUNT(*) AS c FROM users WHERE status = 'pending'`),
      active: count(`SELECT COUNT(*) AS c FROM users WHERE status = 'active'`),
      donors: count(`SELECT COUNT(*) AS c FROM users WHERE role = 'donor'`),
      recipients: count(`SELECT COUNT(*) AS c FROM users WHERE role = 'recipient'`),
      couriers: count(`SELECT COUNT(*) AS c FROM users WHERE role = 'courier'`),
    },
    listings: {
      total: count('SELECT COUNT(*) AS c FROM food_listings'),
      available: count(`SELECT COUNT(*) AS c FROM food_listings WHERE status = 'available'`),
      verified: count(`SELECT COUNT(*) AS c FROM food_listings WHERE status = 'verified'`),
    },
    needs: {
      total: count('SELECT COUNT(*) AS c FROM food_needs'),
      open: count(`SELECT COUNT(*) AS c FROM food_needs WHERE status = 'open'`),
      fulfilled: count(`SELECT COUNT(*) AS c FROM food_needs WHERE status = 'fulfilled'`),
    },
    matches: {
      total: count('SELECT COUNT(*) AS c FROM matches'),
      proposed: count(`SELECT COUNT(*) AS c FROM matches WHERE status = 'proposed'`),
      in_progress: count(`SELECT COUNT(*) AS c FROM matches WHERE status IN ('accepted','picked_up','delivered')`),
      verified: count(`SELECT COUNT(*) AS c FROM matches WHERE status = 'verified'`),
      cancelled: count(`SELECT COUNT(*) AS c FROM matches WHERE status = 'cancelled'`),
    },
    impact: {
      portions_delivered: totalPortionsDelivered,
      avg_score: Number((avgScore * 100).toFixed(1)),
      avg_distance_km: Number(avgDistance.toFixed(2)),
      audit_logs: count('SELECT COUNT(*) AS c FROM audit_logs'),
    },
    performance: {
      last_matching_runs: matchingPerf,
      target_matching_ms: 3000,
      all_under_target: matchingPerf.every((r) => !r.duration_ms || r.duration_ms < 3000),
    },
  });
});

router.get('/users', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, email, role, status, phone, address, lat, lng, org_name, capacity, created_at
       FROM users ORDER BY created_at DESC`
    )
    .all();
  res.json(rows);
});

router.patch('/users/:id/status', (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status tidak valid' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (user.role === 'admin' && status !== 'active') {
    return res.status(400).json({ error: 'Admin tidak bisa diubah statusnya' });
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, user.id);
  audit(req.user.id, 'UPDATE_USER_STATUS', 'users', user.id, { from: user.status, to: status });
  notify(
    user.id,
    status === 'active' ? 'Akun Diverifikasi' : 'Status Akun Diperbarui',
    status === 'active'
      ? 'Akun Anda telah diverifikasi. Anda bisa login dan menggunakan aplikasi.'
      : `Status akun Anda: ${status}. Hubungi admin untuk info lebih lanjut.`
  );
  res.json({ message: `Status user menjadi ${status}` });
});

router.delete('/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Admin tidak bisa dihapus' });

  const activeMatch = db
    .prepare(
      `SELECT COUNT(*) AS c FROM matches
       WHERE (courier_id = ? OR listing_id IN (SELECT id FROM food_listings WHERE donor_id = ?)
              OR need_id IN (SELECT id FROM food_needs WHERE recipient_id = ?))
         AND status IN ('proposed','accepted','picked_up')`
    )
    .get(user.id, user.id, user.id).c;
  if (activeMatch > 0) {
    return res.status(400).json({ error: 'User masih memiliki match aktif' });
  }

  audit(req.user.id, 'DELETE_USER', 'users', user.id, { email: user.email, role: user.role });
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  res.json({ message: 'User dihapus' });
});

router.get('/logs', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS user_name, u.role AS user_role
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 200`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, detail_obj: r.detail ? JSON.parse(r.detail) : null })));
});

router.get('/matches', (req, res) => {
  const rows = db
    .prepare(
      `SELECT m.*, l.name AS listing_name, l.portions, n.title AS need_title, n.urgency,
         dn.name AS donor_name, rn.name AS recipient_name, c.name AS courier_name
       FROM matches m
       JOIN food_listings l ON l.id = m.listing_id
       JOIN food_needs n ON n.id = m.need_id
       JOIN users dn ON dn.id = l.donor_id
       JOIN users rn ON rn.id = n.recipient_id
       JOIN users c ON c.id = m.courier_id
       ORDER BY m.created_at DESC`
    )
    .all();
  res.json(rows.map((r) => ({ ...r, score_percent: Number((r.score * 100).toFixed(1)) })));
});

module.exports = router;
