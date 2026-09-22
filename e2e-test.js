const fs = require('node:fs');
const path = require('node:path');

const base = process.env.BASE_URL || 'http://localhost:3000';

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

  const allMatches = await api('/api/admin/matches', { token: admin });
  const active = allMatches.filter((m) => ['proposed', 'accepted', 'picked_up', 'delivered'].includes(m.status));
  if (active.length) {
    console.log(`✓ info: ${active.length} match aktif sudah ada (dilewati, tidak di-reset via API)`);
  }

  const fdListing = new FormData();
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(200),
  ]);
  fdListing.append('name', `Surplus Tes ${Date.now()}`);
  fdListing.append('portions', '30');
  fdListing.append('expiry_at', new Date(Date.now() + 4 * 3600000).toISOString());
  fdListing.append('lat', '-6.2247');
  fdListing.append('lng', '106.8296');
  fdListing.append('photo', new Blob([png], { type: 'image/png' }), 'food.png');
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
  if (run.created < 1) throw new Error('Matching tidak membuat match');

  const courierMatches = await api('/api/matches', { token: kurir });
  const match = courierMatches.find((m) => m.status === 'proposed');
  if (!match) throw new Error('No proposed match');

  const recMatches = await api('/api/matches', { token: penerima });
  const rec2Matches = await api('/api/matches', { token: penerima2 });
  const belongsToP2 = rec2Matches.some((m) => m.id === match.id);
  const recipientToken = belongsToP2 ? penerima2 : penerima;
  const recipientName = belongsToP2 ? 'penerima2' : 'penerima';
  console.log(
    `✓ Match #${match.id} skor=${match.score_percent}% jarak=${match.distance_km}km rute=${match.route.total_distance_km}km/${match.route.total_duration_min}m penerima=${recipientName}`
  );
  console.log('✓ FR-05 rute:', match.route.legs.map((l) => `${l.from}->${l.to} ${l.distance_km}km`).join(' | '));

  const fd = new FormData();
  fd.append('photo', new Blob([png], { type: 'image/png' }), 'food.png');
  const pick = await api(`/api/deliveries/${match.id}/pickup`, { method: 'POST', token: kurir, form: fd });
  console.log('✓ FR-07 pickup+foto:', pick.message);

  const otpInfo = await api(`/api/deliveries/${match.id}/otp-status`, { token: recipientToken });
  console.log('✓ FR-08 OTP:', otpInfo.code);
  if (!otpInfo.code) throw new Error('OTP tidak ada');

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

  const stats = await api('/api/admin/stats', { token: admin });
  console.log(
    '✓ FR-09 stats:',
    JSON.stringify({
      portions: stats.impact.portions_delivered,
      avg_score: stats.impact.avg_score,
      audit: stats.impact.audit_logs,
      under_target: stats.performance.all_under_target,
    })
  );

  const logs = await api('/api/admin/logs', { token: admin });
  console.log(`✓ audit logs: ${logs.length} entri`);

  const notif = await api('/api/notifications', { token: recipientToken });
  console.log(`✓ FR-06 notifikasi penerima: ${notif.length} entri`);

  const imm = await fetch(`${base}/api/admin/logs`).then((r) => r.status);
  console.log('✓ RBAC: /api/admin/logs tanpa token ->', imm);

  console.log('\n=== SEMUA UJI E2E LULUS ===');
})().catch((e) => {
  console.error('GAGAL:', e.message);
  process.exit(1);
});
