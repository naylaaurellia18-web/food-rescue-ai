const express = require('express');
const db = require('../db');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

router.use(authenticate, requireRole('admin'), requireActive);

router.get('/stats', async (req, res, next) => {
  try {
    const count = async (sql, params = []) => (await db.get(sql, params))?.c ?? 0;

    const totalPortionsDelivered = await count(
      `SELECT COALESCE(SUM(l.portions), 0) AS c FROM matches m
       JOIN food_listings l ON l.id = m.listing_id
       WHERE m.status IN ('picked_up','delivered','verified')`
    );

    const avgScore = await count(`SELECT COALESCE(AVG(score), 0) AS c FROM matches`);
    const avgDistance = await count(`SELECT COALESCE(AVG(distance_km), 0) AS c FROM matches`);

    const perfRows = await db.all(
      `SELECT detail FROM audit_logs WHERE action = 'RUN_MATCHING' ORDER BY id DESC LIMIT 10`
    );
    const matchingPerf = perfRows.map((r) => JSON.parse(r.detail || '{}'));

    res.json({
      users: {
        total: await count('SELECT COUNT(*) AS c FROM users'),
        pending: await count(`SELECT COUNT(*) AS c FROM users WHERE status = 'pending'`),
        active: await count(`SELECT COUNT(*) AS c FROM users WHERE status = 'active'`),
        donors: await count(`SELECT COUNT(*) AS c FROM users WHERE role = 'donor'`),
        recipients: await count(`SELECT COUNT(*) AS c FROM users WHERE role = 'recipient'`),
        couriers: await count(`SELECT COUNT(*) AS c FROM users WHERE role = 'courier'`),
      },
      listings: {
        total: await count('SELECT COUNT(*) AS c FROM food_listings'),
        available: await count(`SELECT COUNT(*) AS c FROM food_listings WHERE status = 'available'`),
        verified: await count(`SELECT COUNT(*) AS c FROM food_listings WHERE status = 'verified'`),
      },
      needs: {
        total: await count('SELECT COUNT(*) AS c FROM food_needs'),
        open: await count(`SELECT COUNT(*) AS c FROM food_needs WHERE status = 'open'`),
        fulfilled: await count(`SELECT COUNT(*) AS c FROM food_needs WHERE status = 'fulfilled'`),
      },
      matches: {
        total: await count('SELECT COUNT(*) AS c FROM matches'),
        proposed: await count(`SELECT COUNT(*) AS c FROM matches WHERE status = 'proposed'`),
        in_progress: await count(`SELECT COUNT(*) AS c FROM matches WHERE status IN ('accepted','picked_up','delivered')`),
        verified: await count(`SELECT COUNT(*) AS c FROM matches WHERE status = 'verified'`),
        cancelled: await count(`SELECT COUNT(*) AS c FROM matches WHERE status = 'cancelled'`),
      },
      impact: {
        portions_delivered: totalPortionsDelivered,
        avg_score: Number((avgScore * 100).toFixed(1)),
        avg_distance_km: Number(avgDistance.toFixed(2)),
        audit_logs: await count('SELECT COUNT(*) AS c FROM audit_logs'),
      },
      performance: {
        last_matching_runs: matchingPerf,
        target_matching_ms: 3000,
        all_under_target: matchingPerf.every((r) => !r.duration_ms || r.duration_ms < 3000),
      },
    });
  } catch (e) {
    next(e);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT id, name, email, role, status, phone, address, lat, lng, org_name, capacity, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!['active', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Status tidak valid' });
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (user.role === 'admin' && status !== 'active') {
      return res.status(400).json({ error: 'Admin tidak bisa diubah statusnya' });
    }

    await db.run('UPDATE users SET status = ? WHERE id = ?', [status, user.id]);
    await audit(req.user.id, 'UPDATE_USER_STATUS', 'users', user.id, { from: user.status, to: status });
    await notify(
      user.id,
      status === 'active' ? 'Akun Diverifikasi' : 'Status Akun Diperbarui',
      status === 'active'
        ? 'Akun Anda telah diverifikasi. Anda bisa login dan menggunakan aplikasi.'
        : `Status akun Anda: ${status}. Hubungi admin untuk info lebih lanjut.`
    );
    res.json({ message: `Status user menjadi ${status}` });
  } catch (e) {
    next(e);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Admin tidak bisa dihapus' });

    const activeMatch = await db.get(
      `SELECT COUNT(*) AS c FROM matches
       WHERE (courier_id = ? OR listing_id IN (SELECT id FROM food_listings WHERE donor_id = ?)
              OR need_id IN (SELECT id FROM food_needs WHERE recipient_id = ?))
         AND status IN ('proposed','accepted','picked_up')`,
      [user.id, user.id, user.id]
    );
    if (activeMatch.c > 0) {
      return res.status(400).json({ error: 'User masih memiliki match aktif' });
    }

    await audit(req.user.id, 'DELETE_USER', 'users', user.id, { email: user.email, role: user.role });
    await db.run('DELETE FROM users WHERE id = ?', [user.id]);
    res.json({ message: 'User dihapus' });
  } catch (e) {
    next(e);
  }
});

router.get('/logs', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT a.*, u.name AS user_name, u.role AS user_role
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.id DESC LIMIT 200`
    );
    res.json(rows.map((r) => ({ ...r, detail_obj: r.detail ? JSON.parse(r.detail) : null })));
  } catch (e) {
    next(e);
  }
});

router.get('/matches', async (_req, res, next) => {
  try {
    const rows = await db.all(
      `SELECT m.*, l.name AS listing_name, l.food_type, l.portions, n.title AS need_title, n.urgency,
         dn.name AS donor_name, rn.name AS recipient_name, c.name AS courier_name
       FROM matches m
       JOIN food_listings l ON l.id = m.listing_id
       JOIN food_needs n ON n.id = m.need_id
       JOIN users dn ON dn.id = l.donor_id
       JOIN users rn ON rn.id = n.recipient_id
       JOIN users c ON c.id = m.courier_id
       ORDER BY m.created_at DESC`
    );
    res.json(rows.map((r) => ({ ...r, score_percent: Number((r.score * 100).toFixed(1)) })));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
