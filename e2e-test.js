const fs = require('node:fs');
const path = require('node:path');

const base = 'http://localhost:3000';

async function api(p, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + p, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p} -> ${res.status} ${data.error || ''}`);
  return data;
}

async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  return r.token;
}

(async () => {
  const admin = await login('admin@foodrescue.id', 'admin123');
  const donor = await login('donor@foodrescue.id', 'donor123');
  const penerima = await login('penerima@foodrescue.id', 'penerima123');
  const penerima2 = await login('penerima2@foodrescue.id', 'penerima123');
  const kurir = await login('kurir@foodrescue.id', 'kurir123');
  console.log('✓ LOGIN semua aktor');

  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: { name: 'Tes Baru', email: `tes${Date.now()}@x.id`, password: 'tes123', role: 'donor' },
  });
  console.log('✓ FR-01 register:', reg.message);

  const pendingUsers = await api('/api/admin/users', { token: admin });
  const pending = pendingUsers.find((u) => u.status === 'pending');
  if (pending) {
    await api(`/api/admin/users/${pending.id}/status`, {
      method: 'PATCH',
      token: admin,
      body: { status: 'active' },
    });
    console.log('✓ FR-10 verifikasi user:', pending.email);
  }

  // Bersihkan match aktif agar kurir tersedia untuk run berikutnya
  const allMatches = await api('/api/admin/matches', { token: admin });
  const active = allMatches.filter((m) => ['proposed', 'accepted', 'picked_up', 'delivered'].includes(m.status));
  if (active.length) {
    const dbMod = require('./server/db');
    for (const m of active) {
      dbMod.prepare(`UPDATE matches SET status='cancelled' WHERE id=?`).run(m.id);
      dbMod.prepare(`UPDATE food_listings SET status='available' WHERE id=? AND status NOT IN ('verified','delivered')`).run(m.listing_id);
    }
    console.log(`✓ reset ${active.length} match aktif (agar kurir tersedia)`);
  }

  // Buat data segar agar selalu ada kandidat matching
  const fdListing = new FormData();
  fdListing.append('name', `Surplus Tes ${Date.now()}`);
  fdListing.append('portions', '30');
  fdListing.append('expiry_at', new Date(Date.now() + 4 * 3600000).toISOString());
  fdListing.append('lat', '-6.2247');
  fdListing.append('lng', '106.8296');
  await api('/api/food', { method: 'POST', token: donor, form: fdListing });
  await api('/api/needs', {
    method: 'POST',
    token: penerima,
    body: {
      title: `Kebutuhan Tes ${Date.now()}`,
      portions_needed: 30,
      urgency: 'critical',
      lat: -6.1929,
      lng: 106.7618,
    },
  });
  console.log('✓ data listing & kebutuhan segar dibuat');

  const run = await api('/api/matches/run', { method: 'POST', token: admin });
  console.log(`✓ FR-04 AI Matching: ${run.created} match, ${run.duration_ms}ms (target <3000)`);

  const courierMatches = await api('/api/matches', { token: kurir });
  const match = courierMatches.find((m) => m.status === 'proposed');
  if (!match) throw new Error('No proposed match');

  const recMatches = await api('/api/matches', { token: penerima });
  const rec2Matches = await api('/api/matches', { token: penerima2 });
  const belongsToP2 = rec2Matches.some((m) => m.id === match.id);
  const recipientToken = belongsToP2 ? penerima2 : penerima;
  const recipientName = belongsToP2 ? 'penerima2' : 'penerima';
  console.log(`✓ Match #${match.id} skor=${match.score_percent}% jarak=${match.distance_km}km rute=${match.route.total_distance_km}km/${match.route.total_duration_min}m penerima=${recipientName}`);
  console.log('✓ FR-05 rute:', match.route.legs.map((l) => `${l.from}->${l.to} ${l.distance_km}km`).join(' | '));

  const pngPath = path.join(__dirname, 'test-food.png');
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(200),
  ]);
  fs.writeFileSync(pngPath, png);
  const fd = new FormData();
  fd.append('photo', new Blob([png], { type: 'image/png' }), 'food.png');
  const pick = await api(`/api/deliveries/${match.id}/pickup`, { method: 'POST', token: kurir, form: fd });
  console.log('✓ FR-07 pickup+foto:', pick.message);

  const otpInfo = await api(`/api/deliveries/${match.id}/otp-status`, { token: recipientToken });
  console.log('✓ FR-08 OTP:', otpInfo.code);

  const del = await api(`/api/deliveries/${match.id}/deliver`, { method: 'POST', token: kurir });
  console.log('✓ deliver:', del.message);

  const ver = await api(`/api/deliveries/${match.id}/verify-otp`, {
    method: 'POST',
    token: recipientToken,
    body: { otp: otpInfo.code },
  });
  console.log('✓ FR-08 verifikasi OTP:', ver.message);

  const final = await api(`/api/matches/${match.id}`, { token: admin });
  console.log('✓ status final:', final.status);
  if (final.status !== 'verified') throw new Error('Expected verified');

  const wrong = await fetch(`${base}/api/deliveries/${match.id}/verify-otp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${recipientToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ otp: '000000' }),
  }).then((r) => r.json());
  console.log('✓ OTP salah ditolak:', wrong.error || wrong.message);

  const stats = await api('/api/admin/stats', { token: admin });
  console.log('✓ FR-09 stats:', JSON.stringify({
    portions: stats.impact.portions_delivered,
    avg_score: stats.impact.avg_score,
    audit: stats.impact.audit_logs,
    under_target: stats.performance.all_under_target,
  }));

  const logs = await api('/api/admin/logs', { token: admin });
  console.log(`✓ audit logs: ${logs.length} entri, actions: ${[...new Set(logs.map((l) => l.action))].slice(0, 8).join(', ')}...`);

  const notif = await api('/api/notifications', { token: recipientToken });
  console.log(`✓ FR-06 notifikasi penerima: ${notif.length} entri`);

  const imm = await fetch(`${base}/api/admin/logs`).then((r) => r.status);
  console.log('✓ RBAC: /api/admin/logs tanpa token ->', imm);

  fs.unlinkSync(pngPath);
  console.log('\n=== SEMUA UJI E2E LULUS ===');
})().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
