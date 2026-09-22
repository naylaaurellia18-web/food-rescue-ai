const express = require('express');
const path = require('node:path');
const fs = require('node:fs');

const authRoutes = require('./routes/auth');
const foodRoutes = require('./routes/food');
const needRoutes = require('./routes/needs');
const { router: matchingRoutes } = require('./routes/matching');
const deliveryRoutes = require('./routes/deliveries');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');

try {
  const db = require('./db');
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    require('./seed');
    console.log('Database kosong — seed data demo dijalankan otomatis.');
  }
} catch (e) {
  console.error('Gagal seed awal:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

app.use('/api/auth', authRoutes);
app.use('/api/food', foodRoutes);
app.use('/api/needs', needRoutes);
app.use('/api/matches', matchingRoutes);
app.use('/api/deliveries', deliveryRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'Food Rescue AI' }));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.get(/^\/(?!api|uploads).*/, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Terjadi kesalahan server' });
});

app.listen(PORT, () => {
  console.log(`Food Rescue AI berjalan di http://localhost:${PORT}`);
});
