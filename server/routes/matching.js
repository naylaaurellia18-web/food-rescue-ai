const express = require('express');
const db = require('../db');
const { computeMatches } = require('../lib/matching');
const { audit, notify } = require('../lib/audit');
const { authenticate, requireRole, requireActive } = require('../middleware');

const router = express.Router();

async function runMatching(actorId) {
  const startedAt = process.hrtime.bigint();

  const listings = await db.all(
    `SELECT l.*, u.name AS donor_name, u.lat AS donor_lat, u.lng AS donor_lng
     FROM food_listings l JOIN users u ON u.id = l.donor_id
     WHERE l.status = 'available' AND l.expiry_at > datetime('now')`
  );

  const needs = await db.all(
    `SELECT n.*, u.name AS recipient_name, u.lat AS recipient_lat, u.lng AS recipient_lng
     FROM food_needs n JOIN users u ON u.id = n.recipient_id
     WHERE n.status = 'open'`
  );

  const couriers = await db.all(
    `SELECT u.* FROM users u
     WHERE u.role = 'courier' AND u.status = 'active'
       AND u.id NOT IN (
         SELECT courier_id FROM matches
         WHERE status IN ('proposed','accepted','picked_up')
       )`
  );

  const matchedRows = await db.all(`SELECT listing_id, need_id FROM matches WHERE status NOT IN ('cancelled')`);
  const alreadyMatched = new Set(matchedRows.map((r) => r.listing_id));
  const openNeeds = new Set(matchedRows.map((r) => r.need_id));

  const filteredListings = listings.filter((l) => !alreadyMatched.has(l.id));
  const filteredNeeds = needs.filter((n) => !openNeeds.has(n.id));

  const selected = computeMatches({ listings: filteredListings, needs: filteredNeeds, couriers });

  const created = [];
  for (const m of selected) {
    const ins = await db.run(
      `INSERT INTO matches
        (listing_id, need_id, courier_id, score, score_expiry, score_distance, score_urgency, score_capacity,
         distance_km, route_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposed')`,
      [
        m.listing_id,
        m.need_id,
        m.courier_id,
        m.score,
        m.score_expiry,
        m.score_distance,
        m.score_urgency,
        m.score_capacity,
        m.distance_km,
        m.route_json,
      ]
    );
    const matchId = ins.lastInsertRowid;

    await db.run(`UPDATE food_listings SET status = 'matched' WHERE id = ?`, [m.listing_id]);

    const listing = await db.get('SELECT * FROM food_listings WHERE id = ?', [m.listing_id]);
    const need = await db.get('SELECT * FROM food_needs WHERE id = ?', [m.need_id]);

    await notify(
      m.courier_id,
      'Tugas Baru: Penjemputan Surplus',
      `Surplus "${listing.name}" (${listing.portions} porsi) untuk "${need.title}". Skor match ${(m.score * 100).toFixed(0)}%, jarak ${m.distance_km} km.`,
      matchId
    );
    await notify(
      listing.donor_id,
      'Surplus Anda Dimatch',
      `"${listing.name}" dialokasikan untuk ${need.title}. Skor match ${(m.score * 100).toFixed(0)}%.`,
      matchId
    );
    await notify(
      need.recipient_id,
      'Bantuan Dialokasikan',
      `Kebutuhan "${need.title}" dipenuhi dari donor. Menunggu pengantaran kurir.`,
      matchId
    );

    await audit(actorId, 'AUTO_MATCH', 'matches', matchId, {
      score: m.score,
      distance_km: m.distance_km,
      listing_id: m.listing_id,
      need_id: m.need_id,
      courier_id: m.courier_id,
    });
    created.push(matchId);
  }

  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  await audit(actorId, 'RUN_MATCHING', 'system', null, {
    candidates_listings: filteredListings.length,
    candidates_needs: filteredNeeds.length,
    candidates_couriers: couriers.length,
    created: created.length,
    duration_ms: Number(durationMs.toFixed(2)),
  });

  return { created: created.length, duration_ms: Number(durationMs.toFixed(2)), match_ids: created };
}

router.use(authenticate);

router.post('/run', requireRole('admin'), requireActive, async (req, res, next) => {
  try {
    const result = await runMatching(req.user.id);
    res.json({ message: `Matching selesai: ${result.created} match dibuat`, ...result });
  } catch (e) {
    next(e);
  }
});

router.get('/', requireRole('admin', 'courier', 'donor', 'recipient'), async (req, res, next) => {
  try {
    let rows;
    if (req.user.role === 'admin') {
      rows = await db.all(
        `SELECT m.*,
           l.name AS listing_name, l.portions, l.expiry_at,
           dn.name AS donor_name, rn.name AS recipient_name, c.name AS courier_name,
           n.title AS need_title, n.urgency
         FROM matches m
         JOIN food_listings l ON l.id = m.listing_id
         JOIN food_needs n ON n.id = m.need_id
         JOIN users dn ON dn.id = l.donor_id
         JOIN users rn ON rn.id = n.recipient_id
         JOIN users c ON c.id = m.courier_id
         ORDER BY m.created_at DESC`
      );
    } else if (req.user.role === 'courier') {
      rows = await db.all(
        `SELECT m.*, l.name AS listing_name, l.portions, l.expiry_at, l.photo_path AS listing_photo,
           dn.name AS donor_name, dn.phone AS donor_phone, dn.address AS donor_address, dn.lat AS donor_lat, dn.lng AS donor_lng,
           rn.name AS recipient_name, rn.phone AS recipient_phone, rn.address AS recipient_address,
           rn.lat AS recipient_lat, rn.lng AS recipient_lng,
           n.title AS need_title, n.urgency
         FROM matches m
         JOIN food_listings l ON l.id = m.listing_id
         JOIN food_needs n ON n.id = m.need_id
         JOIN users dn ON dn.id = l.donor_id
         JOIN users rn ON rn.id = n.recipient_id
         WHERE m.courier_id = ?
         ORDER BY m.created_at DESC`,
        [req.user.id]
      );
    } else if (req.user.role === 'donor') {
      rows = await db.all(
        `SELECT m.*, l.name AS listing_name, l.portions, n.title AS need_title,
           rn.name AS recipient_name, c.name AS courier_name, n.urgency
         FROM matches m
         JOIN food_listings l ON l.id = m.listing_id
         JOIN food_needs n ON n.id = m.need_id
         JOIN users rn ON rn.id = n.recipient_id
         JOIN users c ON c.id = m.courier_id
         WHERE l.donor_id = ?
         ORDER BY m.created_at DESC`,
        [req.user.id]
      );
    } else {
      rows = await db.all(
        `SELECT m.*, l.name AS listing_name, l.portions, n.title AS need_title,
           dn.name AS donor_name, c.name AS courier_name, n.urgency
         FROM matches m
         JOIN food_listings l ON l.id = m.listing_id
         JOIN food_needs n ON n.id = m.need_id
         JOIN users dn ON dn.id = l.donor_id
         JOIN users c ON c.id = m.courier_id
         WHERE n.recipient_id = ?
         ORDER BY m.created_at DESC`,
        [req.user.id]
      );
    }

    res.json(
      rows.map((r) => ({
        ...r,
        route: r.route_json ? JSON.parse(r.route_json) : null,
        score_percent: Number((r.score * 100).toFixed(1)),
      }))
    );
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const m = await db.get(
      `SELECT m.*, l.name AS listing_name, l.portions, l.expiry_at, l.donor_id,
         n.title AS need_title, n.recipient_id, n.urgency
       FROM matches m
       JOIN food_listings l ON l.id = m.listing_id
       JOIN food_needs n ON n.id = m.need_id
       WHERE m.id = ?`,
      [req.params.id]
    );
    if (!m) return res.status(404).json({ error: 'Match tidak ditemukan' });

    const isParticipant =
      req.user.role === 'admin' ||
      m.courier_id === req.user.id ||
      m.donor_id === req.user.id ||
      m.recipient_id === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Bukan peserta match ini' });

    res.json({ ...m, route: m.route_json ? JSON.parse(m.route_json) : null });
  } catch (e) {
    next(e);
  }
});

module.exports = { router, runMatching };
