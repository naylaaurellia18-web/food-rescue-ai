const db = require('../db');
const { sendWhatsApp, sendEmail } = require('./messenger');

async function record(row) {
  try {
    await db.run(
      `INSERT INTO message_outbox (channel, user_id, to_address, subject, body, status, error, provider_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.channel,
        row.userId ?? null,
        row.to ?? null,
        row.subject ?? null,
        row.body,
        row.status,
        row.error ?? null,
        row.providerRef ?? null,
      ]
    );
  } catch (e) {
    console.error('outbox insert:', e.message);
  }
}

function channelStatus() {
  return {
    whatsapp: process.env.CALLMEBOT_APIKEY || process.env.WHATSAPP_API_URL ? 'live' : 'simulated',
    email: process.env.SMTP_HOST ? 'live' : 'simulated',
  };
}

async function fanout({ userId, title, message }) {
  if (!userId) return;
  const user = await db.get('SELECT id, name, email, phone FROM users WHERE id = ?', [userId]);
  if (!user) return;

  const body = `${title}\n${message}`;

  if (user.phone) {
    const wa = await sendWhatsApp(user.phone, body);
    if (wa.skipped) return;
    await record({
      channel: 'whatsapp',
      userId: user.id,
      to: wa.to || user.phone,
      subject: title,
      body: message,
      status: wa.ok ? (wa.simulated ? 'simulated' : 'sent') : 'failed',
      error: wa.error || null,
      providerRef: wa.response || null,
    });
  }

  if (user.email) {
    const mailTo = process.env.NOTIFY_EMAIL || user.email;
    const mail = await sendEmail(mailTo, title, message);
    if (mail.skipped) return;
    await record({
      channel: 'email',
      userId: user.id,
      to: mail.to || mailTo,
      subject: title,
      body: message,
      status: mail.ok ? (mail.simulated ? 'simulated' : 'sent') : 'failed',
      error: mail.error || null,
      providerRef: mail.response || null,
    });
  }
}

module.exports = { fanout, channelStatus, record };
