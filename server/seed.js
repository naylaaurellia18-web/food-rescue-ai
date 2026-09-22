const db = require('./db');
const { hashPassword } = require('./lib/auth');
const { audit } = require('./lib/audit');

/**
 * Seed default: HANYA admin (web fresh / belum pernah diisi).
 * Lokasi admin: Bangkalan, Madura, Jawa Timur.
 * Setelah seed, web kosong — belum ada donor/penerima/kurir/listing/kebutuhan/match.
 */
async function seed({ force = false, full = false } = {}) {
  await db.init();
  const existing = (await db.get('SELECT COUNT(*) AS c FROM users'))?.c ?? 0;

  if (existing > 0) {
    if (!force) {
      console.log('Database sudah berisi data. Gunakan force=true untuk reset.');
      return { skipped: true };
    }
    await db.exec(`
      DROP TRIGGER IF EXISTS audit_logs_no_update;
      DROP TRIGGER IF EXISTS audit_logs_no_delete;
      DELETE FROM otp_codes;
      DELETE FROM notifications;
      DELETE FROM audit_logs;
      DELETE FROM matches;
      DELETE FROM food_listings;
      DELETE FROM food_needs;
      DELETE FROM users;
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
    `);
    try {
      await db.exec(
        `DELETE FROM sqlite_sequence WHERE name IN ('users','food_listings','food_needs','matches','otp_codes','notifications','audit_logs')`
      );
    } catch {
      /* cloud tanpa sqlite_sequence */
    }
  }

  // Selalu minimal: 1 admin (Madura)
  await db.run(
    `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'Admin Sistem',
      'admin@foodrescue.id',
      hashPassword('admin123'),
      'admin',
      'active',
      '08110000000',
      'Bangkalan, Madura, Jawa Timur',
      -7.0288,
      112.7403,
      'Food Rescue AI',
      null,
    ]
  );

  if (full) {
    const users = [
      ['Hotel Madura', 'donor@foodrescue.id', 'donor123', 'donor', 'active', '08120000001', 'Jl. Raya Bangkalan, Madura', -7.0288, 112.7403, 'Hotel Madura', null],
      ['Resto Sampang', 'donor2@foodrescue.id', 'donor123', 'donor', 'active', '08120000002', 'Jl. P. Diponegoro, Sampang', -7.1471, 113.2471, 'Resto Sampang', null],
      ['Panti Asuhan Pamekasan', 'penerima@foodrescue.id', 'penerima123', 'recipient', 'active', '08130000001', 'Jl. Dr. Sutomo, Pamekasan', -7.1567, 113.4833, 'Panti Asuhan Pamekasan', null],
      ['Dapur Umum Sumenep', 'penerima2@foodrescue.id', 'penerima123', 'recipient', 'active', '08130000002', 'Jl. Trunojoyo, Sumenep', -6.9898, 113.8333, 'Dapur Umum Sumenep', null],
      ['Kurir Budi', 'kurir@foodrescue.id', 'kurir123', 'courier', 'active', '08140000001', 'Beroperasi Madura', -7.05, 113.25, null, 60],
      ['Kurir Siti', 'kurir2@foodrescue.id', 'kurir123', 'courier', 'active', '08140000002', 'Beroperasi Madura', -7.15, 113.5, null, 40],
      ['Menunggu Verifikasi', 'pending@foodrescue.id', 'pending123', 'donor', 'pending', '08150000001', 'Belum lengkap', null, null, 'Cafe Uji Coba', null],
    ];
    for (const u of users) {
      await db.run(
        `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [u[0], u[1], hashPassword(u[2]), u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10]]
      );
    }

    const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();
    const listings = [
      [2, 'Buffet Sarapan Sisa', 'Nasi, lauk pauk — masih layak konsumsi', 'wet', 40, inHours(3), -7.0288, 112.7403, 'available'],
      [2, 'Roti & Pastry', 'Roti sobek, croissant', 'dry', 25, inHours(8), -7.0288, 112.7403, 'available'],
      [3, 'Nasi Box Acara', 'Sisa katering — 30 box', 'wet', 30, inHours(5), -7.1471, 113.2471, 'available'],
      [3, 'Sayur & Buah Segar', 'Sayur mayur dan buah potong', 'wet', 20, inHours(12), -7.1471, 113.2471, 'available'],
      [2, 'Biskuit & Keripik Cadangan', 'Kemasan foil utuh, simpan kering', 'dry', 50, inHours(48), -7.0288, 112.7403, 'available'],
    ];
    for (const l of listings) {
      await db.run(
        `INSERT INTO food_listings (donor_id, name, description, food_type, portions, expiry_at, lat, lng, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        l
      );
    }

    const needs = [
      [4, 'Santapan Malam Anak Yatim', 35, 'critical', 'Pamekasan — 35 anak'],
      [4, 'Camilan Sore', 15, 'low', 'Tambahan camilan sore'],
      [5, 'Makan Siang Warga', 45, 'high', 'Sumenep — 45 porsi/hari'],
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

  await audit(1, 'SEED_DATABASE', 'system', null, { mode: full ? 'full-demo' : 'fresh-admin-only' });

  console.log(full ? 'Seed full demo (Madura) selesai.' : 'Seed fresh: hanya admin, data transaksi kosong.');
  console.log('  admin@foodrescue.id / admin123');
  if (full) {
    console.log('  donor@foodrescue.id / donor123');
    console.log('  penerima@foodrescue.id / penerima123');
    console.log('  kurir@foodrescue.id / kurir123');
  }
  return { ok: true };
}

module.exports = { seed };

if (require.main === module) {
  const force = process.argv.includes('--force');
  const full = process.argv.includes('--full');
  seed({ force, full })
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
