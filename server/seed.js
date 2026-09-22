const db = require('./db');
const { hashPassword } = require('./lib/auth');
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

const DEMO_USERS = [
  ['Hotel Merdeka Madiun', 'donor@foodrescue.id', 'donor123', 'donor', 'active', REAL_PHONE, 'Jl. Pahlawan No. 53, Kota Madiun', -7.6245, 111.525, 'Hotel Merdeka Madiun', null],
  ['Rumah Makan Padang Madiun', 'donor2@foodrescue.id', 'donor123', 'donor', 'active', REAL_PHONE, 'Jl. Mayjen Bambang Soebianto, Kota Madiun', -7.638, 111.535, 'RM Padang Madiun', null],
  ['Panti Asuhan Yatim Madiun', 'penerima@foodrescue.id', 'penerima123', 'recipient', 'active', REAL_PHONE, 'Jl. Diponegoro, Kota Madiun', -7.615, 111.515, 'Panti Asuhan Yatim Madiun', null],
  ['Dapur Umum Caruban', 'penerima2@foodrescue.id', 'penerima123', 'recipient', 'active', REAL_PHONE, 'Jl. Raya Caruban, Madiun', -7.5494, 111.6403, 'Dapur Umum Caruban', null],
  ['Kurir Budi', 'kurir@foodrescue.id', 'kurir123', 'courier', 'active', REAL_PHONE, 'Beroperasi Kota Madiun', -7.63, 111.52, null, 60],
  ['Kurir Siti', 'kurir2@foodrescue.id', 'kurir123', 'courier', 'active', REAL_PHONE, 'Beroperasi Madiun sekitarnya', -7.58, 111.55, null, 40],
  ['Menunggu Verifikasi', 'pending@foodrescue.id', 'pending123', 'donor', 'pending', REAL_PHONE, 'Belum lengkap', null, null, 'Cafe Uji Coba Madiun', null],
];

async function wipeTransactional({ keepUsers = false } = {}) {
  await db.exec(`
    DROP TRIGGER IF EXISTS audit_logs_no_update;
    DROP TRIGGER IF EXISTS audit_logs_no_delete;
    DELETE FROM otp_codes;
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
 * Lokasi: Kota Madiun, Jawa Timur.
 *
 * --force --full      : reset total + akun demo + listing/kebutuhan
 * --force --accounts  : reset total + HANYA akun login (tanpa listing/match) — data bersih
 * --clean             : hapus data transaksi (listing, need, match, notif, audit) — akun tetap
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

  if (existing > 0) {
    if (!force) {
      console.log('Database sudah berisi data. Pakai --force --accounts (akun saja) atau --clean (hapus data, akun tetap).');
      return { skipped: true };
    }
    await wipeTransactional({ keepUsers: false });
  }

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
      'Jl. Pahlawan, Kota Madiun, Jawa Timur',
      -7.6245,
      111.525,
      'Food Rescue AI',
      null,
    ]
  );

  const seedAccounts = full || wantAccountsOnly;
  if (seedAccounts) {
    for (const u of DEMO_USERS) {
      await db.run(
        `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u[0], u[1], hashPassword(u[2]), u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10]]
      );
    }
  }

  if (full) {
    const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();
    const listings = [
      [2, 'Buffet Sarapan Sisa', 'Nasi, lauk pauk — masih layak konsumsi', 'wet', 40, inHours(3), -7.6245, 111.525, 'available'],
      [2, 'Roti & Pastry', 'Roti sobek, croissant', 'dry', 25, inHours(8), -7.6245, 111.525, 'available'],
      [3, 'Nasi Box Acara', 'Sisa katering — 30 box', 'wet', 30, inHours(5), -7.638, 111.535, 'available'],
      [3, 'Sayur & Buah Segar', 'Sayur mayur dan buah potong', 'wet', 20, inHours(12), -7.638, 111.535, 'available'],
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
      [4, 'Santapan Malam Anak Yatim', 35, 'critical', 'Kota Madiun — 35 anak'],
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

  await audit(1, 'SEED_DATABASE', 'system', null, {
    mode: full ? 'full-demo' : wantAccountsOnly ? 'accounts-only' : 'fresh-admin-only',
  });

  if (full) {
    console.log('Seed demo lengkap selesai (akun + listing + kebutuhan).');
  } else if (wantAccountsOnly) {
    console.log('Seed akun login saja — listing/match kosong (siap diisi dari nol).');
  } else {
    console.log('Seed fresh: hanya admin, data transaksi kosong.');
  }
  console.log('  admin@foodrescue.id / admin123');
  if (seedAccounts) {
    console.log('  donor@foodrescue.id / donor123');
    console.log('  penerima@foodrescue.id / penerima123');
    console.log('  kurir@foodrescue.id / kurir123');
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
      console.error(e);
      process.exit(1);
    });
}
