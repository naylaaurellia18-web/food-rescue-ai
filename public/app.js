const API = '';
let token = localStorage.getItem('frai_token') || '';
let me = JSON.parse(localStorage.getItem('frai_user') || 'null');
let currentTab = '';
let gisMap = null;
let gisLayer = null;

const MADURA_CENTER = [-7.05, 113.25];
const MADURA_BOUNDS = [[-7.45, 112.5], [-6.7, 114.0]];

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), 3500);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.endsWith('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z');
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function statusTag(s) {
  const map = {
    available: ['tag-green', 'Tersedia'], matched: ['tag-blue', 'Di-match'],
    picked_up: ['tag-yellow', 'Dijemput'], delivered: ['tag-yellow', 'Sampai'],
    verified: ['tag-green', 'Terverifikasi'], cancelled: ['tag-gray', 'Dibatalkan'],
    expired: ['tag-gray', 'Kedaluwarsa'], proposed: ['tag-blue', 'Usulan'],
    accepted: ['tag-blue', 'Diterima'], open: ['tag-green', 'Terbuka'],
    fulfilled: ['tag-green', 'Terpenuhi'], pending: ['tag-yellow', 'Pending'],
    active: ['tag-green', 'Aktif'], rejected: ['tag-red', 'Ditolak'],
    critical: ['tag-red', 'Kritis'], high: ['tag-yellow', 'Tinggi'],
    medium: ['tag-blue', 'Sedang'], low: ['tag-gray', 'Rendah'],
  };
  const [cls, label] = map[s] || ['tag-gray', s];
  return `<span class="tag ${cls}">${label}</span>`;
}

function logout() {
  localStorage.removeItem('frai_token');
  localStorage.removeItem('frai_user');
  token = '';
  me = null;
  destroyMap();
  render();
}

const NAV = {
  admin: [
    ['dashboard', '📊', 'Dashboard'],
    ['gis', '🗺️', 'Peta GIS'],
    ['users', '👥', 'Pengguna'],
    ['matches', '🤖', 'AI Matching'],
    ['logs', '📜', 'Audit Log'],
    ['notif', '🔔', 'Notifikasi'],
  ],
  donor: [
    ['donor', '📦', 'Input Surplus'],
    ['donor-listings', '📋', 'Listing Saya'],
    ['donor-matches', '🔗', 'Match Saya'],
    ['gis', '🗺️', 'Peta GIS'],
    ['notif', '🔔', 'Notifikasi'],
  ],
  recipient: [
    ['recipient', '🙏', 'Kebutuhan Pangan'],
    ['recipient-matches', '🔐', 'Konfirmasi OTP'],
    ['gis', '🗺️', 'Peta GIS'],
    ['notif', '🔔', 'Notifikasi'],
  ],
  courier: [
    ['courier', '🚚', 'Tugas Kurir'],
    ['gis', '🗺️', 'Peta GIS'],
    ['notif', '🔔', 'Notifikasi'],
  ],
};

function renderNav() {
  const tabs = NAV[me?.role] || [];
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML = tabs
    .map(
      ([id, icon, label]) =>
        `<button type="button" class="${currentTab === id ? 'active' : ''}" data-tab="${id}"><span>${icon}</span> ${label}</button>`
    )
    .join('');
  nav.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
}

function setTab(t) {
  if (currentTab === t) {
    closeSidebar();
    return;
  }
  currentTab = t;
  closeSidebar();
  renderNav();
  destroyMap();
  renderView();
}

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}
function destroyMap() {
  if (gisMap) {
    gisMap.remove();
    gisMap = null;
    gisLayer = null;
  }
}

function render() {
  const authRoot = document.getElementById('authRoot');
  const layout = document.getElementById('appLayout');

  if (!token || !me) {
    layout.hidden = true;
    authRoot.hidden = false;
    authRoot.innerHTML = renderAuth();
    bindAuth();
    return;
  }

  destroyMap();
  authRoot.hidden = true;
  authRoot.innerHTML = '';
  layout.hidden = false;

  document.getElementById('userName').textContent = me.name;
  document.getElementById('userRole').textContent = me.role;
  document.getElementById('userStatus').textContent = me.status === 'active' ? '✓ Terverifikasi' : `Status: ${me.status}`;

  const tabs = NAV[me.role] || [];
  if (!currentTab || !tabs.find((t) => t[0] === currentTab)) currentTab = tabs[0][0];
  renderNav();

  renderView();
}

async function renderView() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty">Memuat…</div>';
  try {
    const renderers = {
      dashboard: renderAdminDashboard,
      gis: renderGisMap,
      users: renderAdminUsers,
      matches: renderAdminMatches,
      logs: renderAdminLogs,
      notif: renderNotif,
      donor: renderDonorForm,
      'donor-listings': renderDonorListings,
      'donor-matches': renderDonorMatches,
      recipient: renderRecipientForm,
      'recipient-matches': renderRecipientMatches,
      courier: renderCourier,
    };
    const fn = renderers[currentTab];
    view.innerHTML = fn ? await fn() : '<div class="empty">Halaman tidak ditemukan</div>';
    if (fn) {
      bindView();
      if (currentTab === 'gis') initGisMap();
    }
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function bindView() {
  document.querySelectorAll('form[data-action]').forEach((f) => {
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f);
      try {
        let res;
        if (f.dataset.multipart === '1') {
          res = await api(f.dataset.endpoint, { method: 'POST', body: fd });
        } else {
          const body = {};
          fd.forEach((v, k) => (body[k] = v));
          res = await api(f.dataset.endpoint, { method: f.dataset.method || 'POST', body });
        }
        toast(res.message || 'Berhasil');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-post]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        const body = btn.dataset.body ? JSON.parse(btn.dataset.body) : {};
        const res = await api(btn.dataset.post, { method: btn.dataset.method || 'POST', body });
        toast(res.message || 'Berhasil');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('[data-patch]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const body = JSON.parse(btn.dataset.body || '{}');
        const res = await api(btn.dataset.patch, { method: 'PATCH', body });
        toast(res.message || 'Berhasil');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });

  document.querySelectorAll('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Hapus item ini?')) return;
      try {
        const res = await api(btn.dataset.delete, { method: 'DELETE' });
        toast(res.message || 'Dihapus');
        renderView();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
  });
}

/* ========== GIS MAP ========== */

async function renderGisMap() {
  const [users, listings, needs, matches] = await Promise.all([
    api('/api/admin/users').catch(() => []),
    api('/api/food').catch(() => []),
    api('/api/needs').catch(() => []),
    api('/api/matches').catch(() => []),
  ]);

  const openNeeds = needs.filter((n) => n.status === 'open');
  const activeMatches = matches.filter((m) => !['cancelled'].includes(m.status));

  return `
  <div class="page-title"><span class="title-icon">🗺️</span> Peta GIS — Madura, Jawa Timur</div>
  <div class="card">
    <div class="spread">
      <h2 style="margin:0">Sebaran Donor · Penerima · Kurir · Rute</h2>
      <span class="muted">Leaflet + OpenStreetMap · fokus Madura</span>
    </div>
    <div class="map-legend" style="margin-top:12px">
      <span><i class="dot dot-donor"></i> Donor</span>
      <span><i class="dot dot-recipient"></i> Penerima</span>
      <span><i class="dot dot-courier"></i> Kurir</span>
      <span><i class="dot dot-listing"></i> Surplus tersedia</span>
      <span style="color:#2563eb">━ Rute pengantaran</span>
    </div>
    <div class="map-wrap"><div id="gisMap"></div></div>
    <div class="grid grid-4">
      <div class="card stat"><div class="value">${users.filter((u) => u.role === 'donor' && u.lat).length}</div><div class="label">Donor di peta</div></div>
      <div class="card stat"><div class="value">${users.filter((u) => u.role === 'recipient' && u.lat).length}</div><div class="label">Penerima di peta</div></div>
      <div class="card stat"><div class="value">${users.filter((u) => u.role === 'courier' && u.lat).length}</div><div class="label">Kurir di peta</div></div>
      <div class="card stat"><div class="value">${activeMatches.length}</div><div class="label">Rute aktif</div></div>
    </div>
    <p class="muted">Koordinat mengikuti data pengguna & listing. Saat register/submit, isi lat/lng di area Madura (contoh: Bangkalan <code>-7.03, 112.74</code>, Sampang <code>-7.15, 113.25</code>, Pamekasan <code>-7.16, 113.48</code>, Sumenep <code>-6.99, 113.83</code>).</p>
  </div>`;
}

function initGisMap() {
  const el = document.getElementById('gisMap');
  if (!el || typeof L === 'undefined') return;

  destroyMap();
  gisMap = L.map('gisMap', { zoomControl: true }).setView(MADURA_CENTER, 9);
  gisLayer = L.layerGroup().addTo(gisMap);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(gisMap);

  gisMap.fitBounds(MADURA_BOUNDS);

  loadMapData().catch((e) => toast(e.message, 'error'));

  setTimeout(() => gisMap && gisMap.invalidateSize(), 200);
}

async function loadMapData() {
  if (!gisMap || !gisLayer) return;

  const [users, listings, matches] = await Promise.all([
    api('/api/admin/users').catch(() => []),
    api('/api/food').catch(() => []),
    api('/api/matches').catch(() => []),
  ]);

  gisLayer.clearLayers();

  const icon = (color, label) =>
    L.divIcon({
      className: '',
      html: `<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 2px ${color}88"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -8],
    });

  for (const u of users) {
    if (u.lat == null || u.lng == null) continue;
    if (!['donor', 'recipient', 'courier'].includes(u.role)) continue;
    const colors = { donor: '#2563eb', recipient: '#dc2626', courier: '#f59e0b' };
    const roleLabel = { donor: 'Donor', recipient: 'Penerima', courier: 'Kurir' };
    L.marker([u.lat, u.lng], { icon: icon(colors[u.role]) })
      .bindPopup(
        `<b>${esc(u.name)}</b><br>${roleLabel[u.role]} · ${statusTag(u.status)}<br>` +
          `<span class="muted">${esc(u.address || '')}</span>` +
          (u.capacity ? `<br><span class="muted">Kapasitas: ${u.capacity} porsi</span>` : '')
      )
      .addTo(gisLayer);
  }

  for (const l of listings) {
    if (l.lat == null || l.lng == null) continue;
    if (!['available', 'matched'].includes(l.status)) continue;
    L.circleMarker([l.lat, l.lng], {
      radius: 7,
      color: '#fff',
      weight: 2,
      fillColor: '#16a34a',
      fillOpacity: 0.95,
    })
      .bindPopup(
        `<b>📦 ${esc(l.name)}</b><br>${l.portions} porsi · ${statusTag(l.status)}<br>` +
          `<span class="muted">Exp: ${fmtDate(l.expiry_at)}</span>`
      )
      .addTo(gisLayer);
  }

  for (const m of matches) {
    if (!m.route || m.status === 'cancelled') continue;
    const pts = (m.route.waypoints || [])
      .filter((w) => w.lat != null && w.lng != null)
      .map((w) => [w.lat, w.lng]);
    if (pts.length < 2) continue;

    L.polyline(pts, { color: '#2563eb', weight: 4, opacity: 0.75, dashArray: '8 6' }).addTo(gisLayer);

    const mid = pts[Math.floor(pts.length / 2)];
    L.circleMarker(mid, {
      radius: 5,
      color: '#fff',
      weight: 2,
      fillColor: '#7c3aed',
      fillOpacity: 1,
    })
      .bindPopup(
        `<b>🚛 Match #${m.id}</b><br>${esc(m.listing_name || '')} → ${esc(m.need_title || '')}<br>` +
          `${m.distance_km} km · ${statusTag(m.status)}` +
          (m.score_percent != null ? `<br>Skor: ${m.score_percent}%` : '')
      )
      .addTo(gisLayer);
  }
}

/* ========== AUTH ========== */

function renderAuth() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>🥗 Food Rescue AI</h1>
      <p class="sub">Redistribusi surplus makanan · AI Matching &amp; GIS · Madura, Jawa Timur</p>
      <div class="auth-tabs">
        <button id="tabLogin" class="active" type="button">Login</button>
        <button id="tabReg" type="button">Registrasi</button>
      </div>
      <form id="formLogin" data-action="1" data-endpoint="/api/auth/login">
        <label>Email</label>
        <input name="email" type="email" required placeholder="email@contoh.id" />
        <label>Password</label>
        <input name="password" type="password" required placeholder="••••••••" />
        <button class="btn" style="width:100%" type="submit">Masuk</button>
      </form>
      <form id="formReg" hidden data-action="1" data-endpoint="/api/auth/register">
        <label>Nama / Nama Organisasi</label>
        <input name="name" required placeholder="Contoh: Masjid Jami' Bangkalan" />
        <label>Email</label>
        <input name="email" type="email" required />
        <label>Password</label>
        <input name="password" type="password" minlength="6" required />
        <label>Role</label>
        <select name="role" required>
          <option value="donor">Donor (Hotel/Restoran/Ritel)</option>
          <option value="recipient">Penerima Manfaat</option>
          <option value="courier">Kurir / Relawan</option>
        </select>
        <label>Telepon</label>
        <input name="phone" placeholder="08xxx" />
        <label>Alamat</label>
        <input name="address" placeholder="Jl. ... , Bangkalan / Sampang / Pamekasan / Sumenep" />
        <div class="grid grid-2">
          <div><label>Latitude (Madura)</label><input name="lat" type="number" step="any" placeholder="-7.03" /></div>
          <div><label>Longitude (Madura)</label><input name="lng" type="number" step="any" placeholder="112.74" /></div>
        </div>
        <div id="courierField" hidden>
          <label>Kapasitas Logistik (porsi)</label>
          <input name="capacity" type="number" min="1" placeholder="50" />
        </div>
        <div id="orgField">
          <label>Nama Organisasi (opsional)</label>
          <input name="org_name" placeholder="Hotel / Panti / Komunitas" />
        </div>
        <button class="btn" style="width:100%" type="submit">Daftar (menunggu verifikasi admin)</button>
      </form>
      <p class="muted" style="margin-top:16px">Demo awal: admin@foodrescue.id / admin123</p>
    </div>
  </div>`;
}

function bindAuth() {
  const tabLogin = document.getElementById('tabLogin');
  const tabReg = document.getElementById('tabReg');
  const formLogin = document.getElementById('formLogin');
  const formReg = document.getElementById('formReg');

  tabLogin.onclick = () => {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    formLogin.hidden = false;
    formReg.hidden = true;
  };
  tabReg.onclick = () => {
    tabReg.classList.add('active');
    tabLogin.classList.remove('active');
    formReg.hidden = false;
    formLogin.hidden = true;
  };

  formLogin.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formLogin);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: { email: fd.get('email'), password: fd.get('password') },
      });
      token = res.token;
      me = res.user;
      localStorage.setItem('frai_token', token);
      localStorage.setItem('frai_user', JSON.stringify(me));
      if (me.status === 'pending') toast('Akun belum diverifikasi admin', 'error');
      else toast(`Selamat datang, ${me.name}`);
      currentTab = '';
      render();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  formReg.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(formReg);
    const body = Object.fromEntries(fd.entries());
    try {
      const res = await api('/api/auth/register', { method: 'POST', body });
      toast(res.message);
      tabLogin.click();
      formLogin.email.value = body.email;
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  formReg.role.addEventListener('change', () => {
    const isCourier = formReg.role.value === 'courier';
    document.getElementById('courierField').hidden = !isCourier;
    document.getElementById('orgField').hidden = isCourier;
  });
}

/* ========== PAGES ========== */

async function renderAdminDashboard() {
  const s = await api('/api/admin/stats');
  const runs = s.performance.last_matching_runs || [];
  const isEmpty =
    s.listings.total === 0 && s.needs.total === 0 && s.matches.total === 0 && s.users.total <= 1;

  return `
  <div class="page-title"><span class="title-icon">📊</span> Dashboard</div>
  ${isEmpty ? `
  <div class="empty" style="margin-bottom:16px">
    <b>Web masih kosong — siap diisi dari nol.</b><br>
    Langkah: (1) Donor daftar &amp; input surplus · (2) Penerima daftar &amp; ajukan kebutuhan ·
    (3) Admin verifikasi pengguna · (4) Jalankan AI Matching
  </div>` : ''}
  <div class="card">
    <div class="spread">
      <h2 style="margin:0">Status Sistem</h2>
      <button class="btn" data-post="/api/matches/run">▶ Jalankan AI Matching</button>
    </div>
    <p class="muted" style="margin-top:8px">Target matching &lt; 3.000 ms — last run: ${runs[0]?.duration_ms ?? '-'} ms ${s.performance.all_under_target ? '✅' : ''}</p>
  </div>
  <div class="grid grid-4">
    <div class="card stat"><div class="value">${s.users.total}</div><div class="label">Total Pengguna</div></div>
    <div class="card stat"><div class="value">${s.users.pending}</div><div class="label">Menunggu Verifikasi</div></div>
    <div class="card stat"><div class="value">${s.matches.total}</div><div class="label">Total Matching</div></div>
    <div class="card stat"><div class="value">${s.matches.verified}</div><div class="label">Terverifikasi</div></div>
    <div class="card stat"><div class="value">${s.impact.portions_delivered}</div><div class="label">Porsi Terdistribusi</div></div>
    <div class="card stat"><div class="value">${s.impact.avg_score}%</div><div class="label">Rata-rata Skor Match</div></div>
    <div class="card stat"><div class="value">${s.impact.avg_distance_km}</div><div class="label">Rata-rata Jarak (km)</div></div>
    <div class="card stat"><div class="value">${s.impact.audit_logs}</div><div class="label">Entri Audit Log</div></div>
  </div>
  <div class="grid grid-2">
    <div class="card">
      <h2>Distribusi Peran</h2>
      <table>
        <tr><td>Donor</td><td>${s.users.donors}</td></tr>
        <tr><td>Penerima</td><td>${s.users.recipients}</td></tr>
        <tr><td>Kurir</td><td>${s.users.couriers}</td></tr>
        <tr><td>Admin</td><td>${Math.max(0, s.users.total - s.users.donors - s.users.recipients - s.users.couriers)}</td></tr>
      </table>
    </div>
    <div class="card">
      <h2>Listing &amp; Kebutuhan</h2>
      <table>
        <tr><td>Listing tersedia</td><td>${s.listings.available} / ${s.listings.total}</td></tr>
        <tr><td>Listing terverifikasi</td><td>${s.listings.verified}</td></tr>
        <tr><td>Kebutuhan terbuka</td><td>${s.needs.open} / ${s.needs.total}</td></tr>
        <tr><td>Kebutuhan terpenuhi</td><td>${s.needs.fulfilled}</td></tr>
      </table>
    </div>
  </div>
  <div class="card">
    <h2>Riwayat Performa AI Matching</h2>
    ${runs.length === 0 ? '<div class="empty">Belum ada run</div>' : `
    <table>
      <tr><th>Kandidat (L/N/C)</th><th>Dibuat</th><th>Durasi (ms)</th></tr>
      ${runs.map(r => `<tr><td>${r.candidates_listings ?? '-'}/${r.candidates_needs ?? '-'}/${r.candidates_couriers ?? '-'}</td><td>${r.created ?? '-'}</td><td>${r.duration_ms ?? '-'}</td></tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderAdminUsers() {
  const users = await api('/api/admin/users');
  return `
  <div class="page-title"><span class="title-icon">👥</span> Pengguna</div>
  <div class="card">
    ${users.length <= 1 ? '<div class="empty">Belum ada pengguna selain admin. Ajukan registrasi dari halaman login.</div>' : `
    <table>
      <tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Lokasi (Madura/Jatim)</th><th>Aksi</th></tr>
      ${users.map(u => `
      <tr>
        <td>${esc(u.name)}${u.org_name ? `<br><span class="muted">${esc(u.org_name)}</span>` : ''}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.role)}</td>
        <td>${statusTag(u.status)}</td>
        <td class="muted">${u.lat ?? '-'}, ${u.lng ?? '-'}${u.capacity ? `<br>kap. ${u.capacity} porsi` : ''}</td>
        <td class="row">
          ${u.status !== 'active' && u.role !== 'admin' ? `<button class="btn btn-sm" data-patch="/api/admin/users/${u.id}/status" data-body='{"status":"active"}'>Verifikasi</button>` : ''}
          ${u.status !== 'rejected' && u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" data-patch="/api/admin/users/${u.id}/status" data-body='{"status":"rejected"}'>Tolak</button>` : ''}
          ${u.role !== 'admin' ? `<button class="btn btn-sm btn-outline" data-delete="/api/admin/users/${u.id}">Hapus</button>` : ''}
        </td>
      </tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderAdminMatches() {
  const rows = await api('/api/admin/matches');
  return `
  <div class="page-title"><span class="title-icon">🤖</span> AI Matching</div>
  <div class="card">
    <div class="spread">
      <h2 style="margin:0">Hasil Matching</h2>
      <button class="btn" data-post="/api/matches/run">▶ Jalankan Matching</button>
    </div>
    ${rows.length === 0 ? '<div class="empty" style="margin-top:12px">Belum ada match — isi surplus &amp; kebutuhan dulu, lalu jalankan AI Matching.</div>' : `
    <table style="margin-top:12px">
      <tr><th>#</th><th>Surplus → Kebutuhan</th><th>Kurir</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      ${rows.map(m => `
      <tr>
        <td>${m.id}</td>
        <td><b>${esc(m.listing_name)}</b> (${m.portions} porsi)<br>→ ${esc(m.need_title)} ${statusTag(m.urgency)}<br><span class="muted">${esc(m.donor_name)} → ${esc(m.recipient_name)}</span></td>
        <td>${esc(m.courier_name)}</td>
        <td>
          <b>${m.score_percent}%</b>
          <div class="score-bar"><div style="width:${m.score_percent}%"></div></div>
          <span class="muted">exp ${Number(m.score_expiry*100).toFixed(0)} · jarak ${Number(m.score_distance*100).toFixed(0)} · urgensi ${Number(m.score_urgency*100).toFixed(0)} · kapasitas ${Number(m.score_capacity*100).toFixed(0)}</span>
        </td>
        <td>${m.distance_km} km</td>
        <td>${statusTag(m.status)}</td>
      </tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderAdminLogs() {
  const logs = await api('/api/admin/logs');
  return `
  <div class="page-title"><span class="title-icon">📜</span> Audit Log</div>
  <div class="card">
    ${logs.length === 0 ? '<div class="empty">Belum ada aktivitas tercatat.</div>' : `
    <table>
      <tr><th>ID</th><th>Waktu</th><th>User</th><th>Aksi</th><th>Entity</th><th>Detail</th></tr>
      ${logs.map(l => `
      <tr>
        <td>${l.id}</td>
        <td class="muted">${fmtDate(l.created_at)}</td>
        <td>${esc(l.user_name || 'system')}</td>
        <td><code>${esc(l.action)}</code></td>
        <td>${esc(l.entity)}${l.entity_id ? '#' + esc(l.entity_id) : ''}</td>
        <td class="muted" style="max-width:260px;word-break:break-all">${l.detail ? esc(l.detail) : '-'}</td>
      </tr>`).join('')}
    </table>`}
  </div>`;
}

function renderDonorForm() {
  return `
  <div class="page-title"><span class="title-icon">📦</span> Input Surplus Makanan</div>
  <div class="card">
    <form data-action="1" data-endpoint="/api/food" data-multipart="1">
      <label>Nama Surplus</label>
      <input name="name" required placeholder="Buffet sarapan sisa" />
      <label>Deskripsi</label>
      <textarea name="description" rows="2" placeholder="Kondisi, jenis makanan…"></textarea>
      <div class="grid grid-2">
        <div><label>Jumlah Porsi</label><input name="portions" type="number" min="1" required /></div>
        <div><label>Expiry Time</label><input name="expiry_at" type="datetime-local" required /></div>
      </div>
      <div class="grid grid-2">
        <div><label>Latitude (Madura)</label><input name="lat" type="number" step="any" placeholder="-7.03" /></div>
        <div><label>Longitude (Madura)</label><input name="lng" type="number" step="any" placeholder="112.74" /></div>
      </div>
      <label>Foto Kondisi Makanan (opsional, max 1MB)</label>
      <input name="photo" type="file" accept="image/*" />
      <button class="btn" type="submit">Simpan Surplus</button>
    </form>
  </div>`;
}

async function renderDonorListings() {
  const rows = await api('/api/food');
  return `
  <div class="page-title"><span class="title-icon">📋</span> Listing Surplus Saya</div>
  <div class="card">
    ${rows.length === 0 ? '<div class="empty">Belum ada listing. Input surplus terlebih dahulu.</div>' : `
    <table>
      <tr><th>Foto</th><th>Nama</th><th>Porsi</th><th>Expiry</th><th>Status</th><th>Aksi</th></tr>
      ${rows.map(l => `
      <tr>
        <td>${l.photo_path ? `<img class="thumb" src="${l.photo_path}" alt="" />` : '-'}</td>
        <td><b>${esc(l.name)}</b><br><span class="muted">${esc(l.description || '')}</span></td>
        <td>${l.portions}</td>
        <td>${fmtDate(l.expiry_at)}</td>
        <td>${statusTag(l.status)}</td>
        <td>${['available','matched'].includes(l.status) ? `<button class="btn btn-sm btn-danger" data-patch="/api/food/${l.id}/cancel">Batalkan</button>` : '-'}</td>
      </tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderDonorMatches() {
  const rows = await api('/api/matches');
  return `
  <div class="page-title"><span class="title-icon">🔗</span> Match Surplus Saya</div>
  <div class="card">
    ${rows.length === 0 ? '<div class="empty">Belum ada match — tunggu admin menjalankan AI Matching.</div>' : `
    <table>
      <tr><th>Surplus</th><th>Penerima</th><th>Kurir</th><th>Skor</th><th>Status</th></tr>
      ${rows.map(m => `
      <tr>
        <td>${esc(m.listing_name)} (${m.portions} porsi)</td>
        <td>${esc(m.need_title)}<br><span class="muted">${esc(m.recipient_name)}</span></td>
        <td>${esc(m.courier_name)}</td>
        <td>${m.score_percent ?? Number((m.score*100).toFixed(1))}%</td>
        <td>${statusTag(m.status)}</td>
      </tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderRecipientForm() {
  const needsList = await renderRecipientNeedsList();
  return `
  <div class="page-title"><span class="title-icon">🙏</span> Kebutuhan Pangan</div>
  <div class="card">
    <form data-action="1" data-endpoint="/api/needs">
      <label>Judul Kebutuhan</label>
      <input name="title" required placeholder="Makan malam warga prasejahtera" />
      <div class="grid grid-2">
        <div><label>Porsi Dibutuhkan</label><input name="portions_needed" type="number" min="1" required /></div>
        <div>
          <label>Tingkat Urgensi</label>
          <select name="urgency">
            <option value="low">Rendah</option>
            <option value="medium" selected>Sedang</option>
            <option value="high">Tinggi</option>
            <option value="critical">Kritis</option>
          </select>
        </div>
      </div>
      <label>Catatan</label>
      <textarea name="note" rows="2"></textarea>
      <div class="grid grid-2">
        <div><label>Latitude (Madura)</label><input name="lat" type="number" step="any" placeholder="-7.16" /></div>
        <div><label>Longitude (Madura)</label><input name="lng" type="number" step="any" placeholder="113.48" /></div>
      </div>
      <button class="btn" type="submit">Simpan Kebutuhan</button>
    </form>
  </div>
  ${needsList}`;
}

async function renderRecipientNeedsList() {
  const rows = await api('/api/needs');
  return `
  <div class="card">
    <h2>Kebutuhan Saya</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada kebutuhan tercatat.</div>' : `
    <table>
      <tr><th>Judul</th><th>Porsi</th><th>Urgensi</th><th>Status</th><th>Aksi</th></tr>
      ${rows.map(n => `
      <tr>
        <td>${esc(n.title)}<br><span class="muted">${esc(n.note || '')}</span></td>
        <td>${n.portions_needed}</td>
        <td>${statusTag(n.urgency)}</td>
        <td>${statusTag(n.status)}</td>
        <td>${n.status === 'open' ? `<button class="btn btn-sm btn-outline" data-patch="/api/needs/${n.id}" data-body='{"status":"expired"}'>Tutup</button>` : '-'}</td>
      </tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderRecipientMatches() {
  const rows = await api('/api/matches');
  const ready = rows.filter((m) => ['picked_up', 'delivered'].includes(m.status));
  return `
  <div class="page-title"><span class="title-icon">🔐</span> Konfirmasi OTP</div>
  <div class="card">
    <h2>Menunggu Konfirmasi</h2>
    ${ready.length === 0 ? '<div class="empty">Belum ada kiriman menunggu konfirmasi OTP.</div>' : ready.map((m) => `
      <div class="notif unread">
        <div class="spread">
          <div>
            <b>${esc(m.listing_name)}</b> — ${m.portions} porsi<br>
            <span class="muted">Dari: ${esc(m.donor_name)} · Kurir: ${esc(m.courier_name)} · ${statusTag(m.status)}</span>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <input style="max-width:180px;margin:0" id="otp-${m.id}" placeholder="Masukkan 6 digit OTP" maxlength="6" />
          <button class="btn btn-sm" type="button" id="verifyBtn-${m.id}" data-verify="${m.id}">Konfirmasi Terima</button>
        </div>
      </div>`).join('')}
  </div>
  <div class="card">
    <h2>Riwayat Kiriman</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada kiriman.</div>' : `
    <table>
      <tr><th>Surplus</th><th>Donor</th><th>Kurir</th><th>Status</th></tr>
      ${rows.map(m => `<tr><td>${esc(m.listing_name)}</td><td>${esc(m.donor_name)}</td><td>${esc(m.courier_name)}</td><td>${statusTag(m.status)}</td></tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderCourier() {
  const rows = await api('/api/matches');
  const active = rows.filter((m) => ['proposed', 'accepted', 'picked_up', 'delivered'].includes(m.status));
  return `
  <div class="page-title"><span class="title-icon">🚚</span> Tugas Kurir</div>
  <div class="card">
    <h2>Tugas Aktif</h2>
    ${active.length === 0 ? '<div class="empty">Belum ada tugas. Minta admin menjalankan AI Matching.</div>' : active.map((m) => {
      const route = m.route;
      return `
      <div class="notif unread">
        <div class="spread">
          <div>
            <b>Match #${m.id}: ${esc(m.listing_name)}</b> — ${m.portions} porsi<br>
            <span class="muted">Untuk: ${esc(m.need_title)} (${esc(m.recipient_name)}) · Urgensi: ${m.urgency} · Skor: ${m.score_percent ?? ''}%</span>
          </div>
          ${statusTag(m.status)}
        </div>
        ${route ? `
        <h3 style="margin-top:12px">📍 Rute GIS — total ${route.total_distance_km} km ± ${route.total_duration_min} menit</h3>
        ${route.waypoints.map((w) => `<div class="route-step">${esc(w.label)} <span class="muted">(${w.lat}, ${w.lng})</span></div>`).join('')}
        <p class="muted">Leg: ${route.legs.map((l) => `${l.from}→${l.to}: ${l.distance_km} km / ${l.duration_min} mnt`).join(' · ')}</p>
        ` : ''}
        <p class="muted">📞 Donor: ${esc(m.donor_phone || '-')} — ${esc(m.donor_address || '')}<br>
        📞 Penerima: ${esc(m.recipient_phone || '-')} — ${esc(m.recipient_address || '')}</p>
        <div class="row" style="margin-top:10px">
          ${['proposed', 'accepted'].includes(m.status) ? `
            <form id="pickup-${m.id}" data-action="1" data-endpoint="/api/deliveries/${m.id}/pickup" data-multipart="1">
              <label>📷 Foto kondisi makanan (wajib, max 1MB)</label>
              <input type="file" name="photo" accept="image/*" required style="margin:0" />
              <button class="btn btn-sm" type="submit" style="margin-top:8px">Upload &amp; Pickup</button>
            </form>
          ` : ''}
          ${m.status === 'picked_up' ? `<button class="btn btn-sm" data-post="/api/deliveries/${m.id}/deliver">Tandai Sampai di Lokasi</button>` : ''}
          ${m.status === 'delivered' ? `<span class="muted">Menunggu penerima memasukkan OTP…</span>` : ''}
          ${m.photo_path ? `<img class="thumb" src="${m.photo_path}" alt="Foto serah terima" />` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <h2>Riwayat Tugas</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada riwayat.</div>' : `
    <table>
      <tr><th>#</th><th>Surplus</th><th>Penerima</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      ${rows.map(m => `<tr><td>${m.id}</td><td>${esc(m.listing_name)}</td><td>${esc(m.recipient_name)}</td><td>${m.score_percent ?? ''}%</td><td>${m.distance_km} km</td><td>${statusTag(m.status)}</td></tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderNotif() {
  const rows = await api('/api/notifications');
  return `
  <div class="page-title"><span class="title-icon">🔔</span> Notifikasi</div>
  <div class="card">
    <div class="spread">
      <h2 style="margin:0">Inbox</h2>
      <button class="btn btn-outline btn-sm" data-post="/api/notifications/read-all">Tandai semua dibaca</button>
    </div>
    <div style="margin-top:12px">
    ${rows.length === 0 ? '<div class="empty">Belum ada notifikasi.</div>' : rows.map((n) => `
      <div class="notif ${n.read_at ? '' : 'unread'}">
        <b>${esc(n.title)}</b>
        <p>${esc(n.message)}</p>
        <span class="muted">${fmtDate(n.created_at)}</span>
        ${n.read_at ? '' : ` <button class="btn btn-sm btn-outline" data-post="/api/notifications/${n.id}/read">Tandai dibaca</button>`}
      </div>`).join('')}
    </div>
  </div>`;
}

/* OTP verify buttons (khusus halaman penerima) */
document.addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-verify]');
  if (!btn) return;
  const id = btn.dataset.verify;
  const input = document.getElementById(`otp-${id}`);
  if (!input || !input.value) {
    toast('Masukkan OTP dulu', 'error');
    return;
  }
  try {
    const res = await api(`/api/deliveries/${id}/verify-otp`, {
      method: 'POST',
      body: { otp: input.value },
    });
    toast(res.message || 'Berhasil');
    renderView();
  } catch (e) {
    toast(e.message, 'error');
  }
});

/* Sidebar toggle */
document.getElementById('menuToggle')?.addEventListener('click', openSidebar);
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

setInterval(async () => {
  if (!token || !me) return;
  if (currentTab === 'notif') renderView();
}, 10000);

render();
