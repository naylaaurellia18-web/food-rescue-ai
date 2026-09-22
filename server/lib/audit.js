const db = require('../db');

async function audit(userId, action, entity, entityId, detail = null) {
  await db.run(
    `INSERT INTO audit_logs (user_id, action, entity, entity_id, detail)
     VALUES (?, ?, ?, ?, ?)`,
    [
      userId ?? null,
      action,
      entity,
      entityId != null ? String(entityId) : null,
      detail ? JSON.stringify(detail) : null,
    ]
  );
}

async function notify(userId, title, message, matchId = null) {
  await db.run(
    `INSERT INTO notifications (user_id, match_id, title, message)
     VALUES (?, ?, ?, ?)`,
    [userId, matchId, title, message]
  );
}

module.exports = { audit, notify };
