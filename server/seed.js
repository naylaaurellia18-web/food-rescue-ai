const db = require('./db');
const { hashPassword, isProduction, generateSecret } = require('./lib/auth');
const { audit } = require('./lib/audit');

const AUDIT_TRIGGERS = `
  CREATE TRIGGER IF NOT EXISTS audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  BEGIN
    SELECT RAISE(ABORT, 'audit_logs is immutable');
  END;
  CREATE TRIGGER IF NOT EXISTS audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  BEGIN
    SELECT RAISE(ABORT, 'audit_logs is immutable');
  END;
`;

const REAL_PHONE = '083847721511';

// Hanya untuk lokal / demo — TIDAK pernah dibuat di produksi
const DEMO_USERS = [
  ['Hotel Merdeka Madiun', 'donor@foodrescue.id', 'donor123', 'donor', 'active', REAL_PHONE, 'Kota Madiun', -7.6245, 111.525, 'Hotel Merdeka Madiun', null],
  ['Rumah Makan Padang Madiun', 'donor2@foodrescue.id', 'donor123', 'donor', 'active', REAL_PHONE, 'Kartoharjo', -7.6014, 111.4844, 'RM Padang Madiun', null],
  ['Panti Asuhan Yatim Madiun', 'penerima@foodrescue.id', 'penerima123', 'recipient', 'active', REAL_PHONE, 'Taman', -7.6503, 111.5172, 'Panti Asuhan Yatim Madiun', null],
  ['Dapur Umum Caruban', 'penerima2@foodrescue.id', 'penerima123', 'recipient', 'active', REAL_PHONE, 'Caruban', -7.5494, 111.6403, 'Dapur Umum Caruban', null],
  ['Kurir Budi', 'kurir@foodrescue.id', 'kurir123', 'courier', 'active', REAL_PHONE, 'Balerejo', -7.5483, 111.5597, null, 60],
  ['Kurir Siti', 'kurir2@foodrescue.id', 'kurir123', 'courier', 'active', REAL_PHONE, 'Mejayan', -7.5519, 111.4536, null, 40],
  ['Menunggu Verifikasi', 'pending@foodrescue.id', 'pending123', 'donor', 'pending', REAL_PHONE, 'Kota Madiun', null, null, 'Cafe Uji Coba Madiun', null],
];

function productionAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Admin Food Rescue';
  if (!email || !password) {
    throw new Error(
      'Database kosong di produksi. Set ADMIN_EMAIL dan ADMIN_PASSWORD di Environment Variables ' +
        '(wajib, password minimal 12 karakter) lalu deploy ulang.'
    );
  }
  if (password.length < 12) {
    throw new Error('ADMIN_PASSWORD di produksi minimal 12 karakter.');
  }
  return { name, email, password };
}

async function wipeTransactional({ keepUsers = false } = {}) {
  await db.exec(`
    DROP TRIGGER IF EXISTS audit_logs_no_update;
    DROP TRIGGER IF NOT EXISTS audit_logs_no_delete;
    DELETE FROM otp_codes;
    DELETE FROM password_resets;
    DELETE FROM notifications;
    DELETE FROM message_outbox;
    DELETE FROM audit_logs;
    DELETE FROM matches;
    DELETE FROM food_listings;
    DELETE FROM food_needs;
    ${keepUsers ? '' : 'DELETE FROM users;'}
    ${AUDIT_TRIGGERS}
  `);
  try {
    await db.exec(
      keepUsers
        ? `DELETE FROM sqlite_sequence WHERE name IN ('food_listings','food_needs','matches','otp_codes','notifications','message_outbox','audit_logs')`
        : `DELETE FROM sqlite_sequence WHERE name IN ('users','food_listings','food_needs','matches','otp_codes','notifications','message_outbox','audit_logs')`
    );
  } catch {
    /* cloud tanpa sqlite_sequence */
  }
}

/**
 * Seed default: HANYA admin (web fresh).
 *
 * Produksi: admin dari ADMIN_EMAIL/ADMIN_PASSWORD — akun demo TIDAK dibuat.
 * Lokal: admin demo + opsional akun demo (--accounts / --full).
 *
 * --force --full      : reset total + akun demo + listing/kebutuhan (lokal)
 * --force --accounts  : reset total + akun login (lokal)
 * --clean             : hapus data transaksi, akun tetap
 */
async function seed({ force = false, full = false, clean = false, accounts = false } = {}) {
  await db.init();

  if (clean) {
    await wipeTransactional({ keepUsers: true });
    const users = (await db.get('SELECT COUNT(*) AS c FROM users'))?.c ?? 0;
    console.log(`Bersih: listing/kebutuhan/match/notifikasi/audit dihapus. Akun login tersisa: ${users}.`);
    return { ok: true, cleaned: true, users };
  }

  const existing = (await db.get('SELECT COUNT(*) AS c FROM users'))?.c ?? 0;
  const wantAccountsOnly = accounts || (!full && force);
  const prod = isProduction();

  if (existing > 0) {
    if (!force) {
      console.log('Database sudah berisi data. Pakai --force --accounts (akun saja) atau --clean (hapus data, akun tetap).');
      return { skipped: true };
    }
    if (prod && !process.env.ALLOW_FORCE_SEED_PRODUCTION) {
      throw new Error(
        'Seed --force di produksi diblokir. Set ALLOW_FORCE_SEED_PRODUCTION=1 hanya bila yakin (akan hapus semua user).'
      );
    }
    await wipeTransactional({ keepUsers: false });
  }

  const allowDemo = !prod || process.env.ALLOW_DEMO_ACCOUNTS === '1';

  if (prod) {
    const admin = productionAdmin();
    await db.run(
      `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        admin.name,
        admin.email,
        hashPassword(admin.password),
        'admin',
        'active',
        null,
        null,
        null,
        null,
        'Food Rescue AI',
        null,
      ]
    );
    console.log(`Seed produksi: admin ${admin.email} (dari env ADMIN_EMAIL).`);
    console.log('Akun demo TIDAK dibuat di produksi.');
  } else {
    await db.run(
      `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'Admin Sistem',
        'admin@foodrescue.id',
        hashPassword('admin123'),
        'admin',
        'active',
        REAL_PHONE,
        'Kota Madiun',
        -7.6245,
        111.525,
        'Food Rescue AI',
        null,
      ]
    );
    console.log('Seed lokal: admin@foodrescue.id / admin123');
  }

  const seedAccounts = allowDemo && (full || wantAccountsOnly);
  if (seedAccounts) {
    for (const u of DEMO_USERS) {
      await db.run(
        `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u[0], u[1], hashPassword(u[2]), u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10]]
      );
    }
  }

  if (full && allowDemo) {
    const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();
    const listings = [
      [2, 'Buffet Sarapan Sisa', 'Nasi, lauk pauk — masih layak konsumsi', 'wet', 40, inHours(3), -7.6245, 111.525, 'available'],
      [2, 'Roti & Pastry', 'Roti sobek, croissant', 'dry', 25, inHours(8), -7.6245, 111.525, 'available'],
      [3, 'Nasi Box Acara', 'Sisa katering — 30 box', 'wet', 30, inHours(5), -7.6014, 111.4844, 'available'],
      [3, 'Sayur & Buah Segar', 'Sayur mayur dan buah potong', 'wet', 20, inHours(12), -7.6014, 111.4844, 'available'],
      [2, 'Biskuit & Keripik Cadangan', 'Kemasan foil utuh, simpan kering', 'dry', 50, inHours(48), -7.6245, 111.525, 'available'],
    ];
    for (const l of listings) {
      await db.run(
        `INSERT INTO food_listings (donor_id, name, description, food_type, portions, expiry_at, lat, lng, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        l
      );
    }

    const needs = [
      [4, 'Santapan Malam Anak Yatim', 35, 'critical', 'Taman — 35 anak'],
      [4, 'Camilan Sore', 15, 'low', 'Tambahan camilan sore'],
      [5, 'Makan Siang Warga', 45, 'high', 'Caruban — 45 porsi/hari'],
      [5, 'Distribusi Mingguan', 20, 'medium', 'Cadangan stok mingguan'],
    ];
    for (const n of needs) {
      await db.run(
        `INSERT INTO food_needs (recipient_id, title, portions_needed, urgency, note, status)
         VALUES (?, ?, ?, ?, ?, 'open')`,
        n
      );
    }
  }

  await audit(null, 'SEED_DATABASE', 'system', null, {
    mode: prod ? 'production-admin' : full ? 'full-demo' : wantAccountsOnly ? 'accounts-only' : 'fresh-admin-only',
  });

  if (prod) {
    console.log('Seed produksi selesai.');
  } else if (full) {
    console.log('Seed demo lengkap selesai (akun + listing + kebutuhan).');
  } else if (wantAccountsOnly) {
    console.log('Seed akun login saja — listing/match kosong (siap diisi dari nol).');
    console.log('  donor@foodrescue.id / donor123');
    console.log('  penerima@foodrescue.id / penerima123');
    console.log('  kurir@foodrescue.id / kurir123');
  } else {
    console.log('Seed fresh: hanya admin, data transaksi kosong.');
  }
  return { ok: true };
}

module.exports = { seed, wipeTransactional };

if (require.main === module) {
  const force = process.argv.includes('--force');
  const full = process.argv.includes('--full');
  const clean = process.argv.includes('--clean');
  const accounts = process.argv.includes('--accounts');
  seed({ force, full, clean, accounts })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message || e);
      process.exit(1);
    });
}
