const db = require('./db');
const { hashPassword } = require('./lib/auth');

const existing = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
if (existing > 0) {
  console.log('Database sudah berisi data. Jalankan: npm run seed -- --force');
  if (!process.argv.includes('--force')) process.exit(0);
  db.exec(`
    DELETE FROM otp_codes; DELETE FROM notifications; DELETE FROM audit_logs;
    DELETE FROM matches; DELETE FROM food_listings; DELETE FROM food_needs; DELETE FROM users;
    DELETE FROM sqlite_sequence WHERE name IN ('users','food_listings','food_needs','matches','otp_codes','notifications','audit_logs');
  `);
}

const insertUser = db.prepare(
  `INSERT INTO users (name, email, password_hash, role, status, phone, address, lat, lng, org_name, capacity)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

const users = [
  ['Admin Sistem', 'admin@foodrescue.id', 'admin123', 'admin', 'active', '08110000000', 'Kantor Pusat', -6.2088, 106.8456, 'Food Rescue AI', null],
  ['Hotel Melati', 'donor@foodrescue.id', 'donor123', 'donor', 'active', '08120000001', 'Jl. Sudirman No. 1, Jakarta Pusat', -6.2247, 106.8296, 'Hotel Melati', null],
  ['Resto Nusantara', 'donor2@foodrescue.id', 'donor123', 'donor', 'active', '08120000002', 'Jl. Gatot Subroto No. 20, Jakarta Selatan', -6.2431, 106.8144, 'Resto Nusantara', null],
  ['Panti Asuhan Kasih', 'penerima@foodrescue.id', 'penerima123', 'recipient', 'active', '08130000001', 'Jl. Kebon Jeruk No. 5, Jakarta Barat', -6.1929, 106.7618, 'Panti Asuhan Kasih', null],
  ['Dapur Umum Sejahtera', 'penerima2@foodrescue.id', 'penerima123', 'recipient', 'active', '08130000002', 'Jl. Matraman No. 12, Jakarta Timur', -6.2018, 106.8578, 'Dapur Umum Sejahtera', null],
  ['Kurir Budi', 'kurir@foodrescue.id', 'kurir123', 'courier', 'active', '08140000001', 'Beroperasi Jakarta', -6.2146, 106.8451, null, 60],
  ['Kurir Siti', 'kurir2@foodrescue.id', 'kurir123', 'courier', 'active', '08140000002', 'Beroperasi Jakarta', -6.1754, 106.8651, null, 40],
  ['Menunggu Verifikasi', 'pending@foodrescue.id', 'pending123', 'donor', 'pending', '08150000001', 'Belum lengkap', null, null, 'Cafe Uji Coba', null],
];

for (const u of users) {
  insertUser.run(u[0], u[1], hashPassword(u[2]), u[3], u[4], u[5], u[6], u[7], u[8], u[9], u[10]);
}

const insertListing = db.prepare(
  `INSERT INTO food_listings (donor_id, name, description, portions, expiry_at, lat, lng, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();

insertListing.run(2, 'Buffet Sarapan Sisa', 'Nasi, lauk pauk, sayur — masih hangat', 40, inHours(3), -6.2247, 106.8296, 'available');
insertListing.run(2, 'Roti & Pastry', 'Roti sobek, croissant, kue lapis', 25, inHours(8), -6.2247, 106.8296, 'available');
insertListing.run(3, 'Nasi Box Acara', 'Sisa katering rapat — 30 box lengkap', 30, inHours(5), -6.2431, 106.8144, 'available');
insertListing.run(3, 'Sayur & Buah Segar', 'Sayur mayur dan buah potong', 20, inHours(12), -6.2431, 106.8144, 'available');

const insertNeed = db.prepare(
  `INSERT INTO food_needs (recipient_id, title, portions_needed, urgency, note, status)
   VALUES (?, ?, ?, ?, ?, 'open')`
);

insertNeed.run(4, 'Santapan Malam Anak Yatim', 35, 'critical', 'Kekurangan makan malam untuk 35 anak');
insertNeed.run(4, 'Camilan Sore', 15, 'low', 'Tambahan camilan sore');
insertNeed.run(5, 'Makan Siang Warga Prasejahtera', 45, 'high', 'Dapur umum melayani 45 porsi/hari');
insertNeed.run(5, 'Distribusi Pangan Mingguan', 20, 'medium', 'Cadangan stok mingguan');

const { audit } = require('./lib/audit');
audit(1, 'SEED_DATABASE', 'system', null, { users: users.length, listings: 4, needs: 4 });

console.log('Seed selesai. Akun demo:');
console.log('  admin@foodrescue.id / admin123');
console.log('  donor@foodrescue.id / donor123');
console.log('  penerima@foodrescue.id / penerima123');
console.log('  kurir@foodrescue.id / kurir123');
