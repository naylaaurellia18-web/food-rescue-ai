const db = require('../db');

function audit(userId, action, entity, entityId, detail = null) {
  db.prepare(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    userId ?? null,
    action,
    entity,
    entityId != null ? String(entityId) : null,
    detail ? JSON.stringify(detail) : null
  );
}

function notify(userId, title, message, matchId = null) {
  db.prepare(
    `INSERT INTO notifications (user_id, match_id, title, message)
     VALUES (?, ?, ?, ?)`
  ).run(userId, matchId, title, message);
}

module.exports = { audit, notify };
