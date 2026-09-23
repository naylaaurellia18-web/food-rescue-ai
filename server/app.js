const express = require('express');
const path = require('node:path');

const db = require('./db');
const { seed } = require('./seed');
const { storageMode } = require('./lib/storage');

const authRoutes = require('./routes/auth');
const foodRoutes = require('./routes/food');
const needRoutes = require('./routes/needs');
const { router: matchingRoutes } = require('./routes/matching');
const deliveryRoutes = require('./routes/deliveries');
const notificationRoutes = require('./routes/notifications');
const geoRoutes = require('./routes/geo');
const adminRoutes = require('./routes/admin');

const app = express();
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  if (_req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.json({ limit: '3mb' }));

let bootPromise = null;
function boot() {
  if (!bootPromise) {
    bootPromise = (async () => {
      await db.init();
      const userCount = (await db.get('SELECT COUNT(*) AS c FROM users'))?.c ?? 0;
      if (userCount === 0) {
        await seed();
        console.log('Database kosong — seed dijalankan otomatis.');
      }
      await db.run(
        `UPDATE password_resets SET used_at = datetime('now')
         WHERE used_at IS NULL AND expires_at < datetime('now')`
      );
      await db.run(
        `UPDATE food_listings SET status = 'expired'
         WHERE status = 'available' AND expiry_at < datetime('now')`
      );
      console.log(`Foto storage: ${storageMode()}`);
    })().catch((e) => {
      bootPromise = null;
      throw e;
    });
  }
  return bootPromise;
}

app.use(async (_req, _res, next) => {
  try {
    await boot();
    next();
  } catch (e) {
    next(e);
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/needs', needRoutes);
app.use('/api/matches', matchingRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', service: 'Food Rescue AI', db: process.env.TURSO_DATABASE_URL ? 'turso' : 'local' })
);

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api|uploads).*/, (_req, res) => {
  const page = path.join(__dirname, '..', 'public', 'index.html');
  res.sendFile(page);
});

app.use((err, req, res, _next) => {
  const payload = {
    ts: new Date().toISOString(),
    level: 'error',
    method: req.method,
    path: req.originalUrl,
    status: err.status || 500,
    message: err.message || 'Terjadi kesalahan server',
  };
  console.error(JSON.stringify(payload));
  res.status(err.status || 500).json({ error: err.message || 'Terjadi kesalahan server' });
});

module.exports = { app, boot };
