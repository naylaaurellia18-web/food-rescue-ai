const API = '';
let token = localStorage.getItem('frai_token') || '';
let me = JSON.parse(localStorage.getItem('frai_user') || 'null');
let currentTab = '';
let gisMap = null;
let gisLayer = null;

const MADURA_CENTER = [-7.05, 113.25];
const MADURA_BOUNDS = [[-7.45, 112.5], [-6.7, 114.0]];

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  map: '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  package: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  key: '<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
};

function icon(name, size = 16) {
  const body = ICONS[name] || ICONS.dashboard;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function pageHead(title, desc = '', actions = '') {
  return `<div class="page-head">
    <div>
      <h1>${title}</h1>
      ${desc ? `<div class="desc">${desc}</div>` : ''}
    </div>
    ${actions ? `<div class="actions">${actions}</div>` : ''}
  </div>`;
}

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
    ['dashboard', 'dashboard', 'Dashboard'],
    ['gis', 'map', 'Peta GIS'],
    ['users', 'users', 'Pengguna'],
    ['matches', 'cpu', 'AI Matching'],
    ['logs', 'file', 'Audit Log'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  donor: [
    ['donor', 'package', 'Input Surplus'],
    ['donor-listings', 'list', 'Listing Saya'],
    ['donor-matches', 'link', 'Match Saya'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  recipient: [
    ['recipient', 'heart', 'Kebutuhan Pangan'],
    ['recipient-matches', 'key', 'Konfirmasi OTP'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  courier: [
    ['courier', 'truck', 'Tugas Kurir'],
    ['gis', 'map', 'Peta GIS'],
    ['notif', 'bell', 'Notifikasi'],
  ],
};

const TAB_TITLES = {
  dashboard: 'Dashboard',
  gis: 'Peta GIS',
  users: 'Pengguna',
  matches: 'AI Matching',
  logs: 'Audit Log',
  notif: 'Notifikasi',
  donor: 'Input Surplus',
  'donor-listings': 'Listing Surplus',
  'donor-matches': 'Match Saya',
  recipient: 'Kebutuhan Pangan',
  'recipient-matches': 'Konfirmasi OTP',
  courier: 'Tugas Kurir',
};

function renderNav() {
  const tabs = NAV[me?.role] || [];
  const nav = document.getElementById('nav');
  if (!nav) return;
  nav.innerHTML =
    `<div class="nav-label">Navigasi</div>` +
    tabs
      .map(
        ([id, ic, label]) =>
          `<button type="button" class="${currentTab === id ? 'active' : ''}" data-tab="${id}">${icon(ic, 17)}<span>${label}</span></button>`
      )
      .join('');
  nav.querySelectorAll('button[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });
  const top = document.getElementById('topbarTitle');
  if (top) top.textContent = TAB_TITLES[currentTab] || 'Dashboard';
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
  const avatar = document.getElementById('userAvatar');
  if (avatar) {
    const initials = String(me.name || me.email || '?')
      .split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    avatar.textContent = initials;
  }
  const topUser = document.getElementById('topbarUser');
  if (topUser) topUser.textContent = me.name || me.email || '';
  const statusEl = document.getElementById('userStatus');
  if (statusEl) statusEl.textContent = me.status === 'active' ? 'Terverifikasi' : me.status;

  const tabs = NAV[me.role] || [];
  if (!currentTab || !tabs.find((t) => t[0] === currentTab)) currentTab = tabs[0][0];
  renderNav();

  renderView();
}

async function renderView() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty"><div class="empty-title">Memuat data…</div></div>';
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
    view.innerHTML = `<div class="empty"><div class="empty-title">Terjadi kesalahan</div>${esc(e.message)}</div>`;
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
  ${pageHead('Peta GIS', 'Sebaran donor, penerima, kurir &amp; rute pengantaran — fokus Madura, Jawa Timur')}
  <div class="card map-card">
    <div class="map-toolbar">
      <div class="map-legend">
        <span><i class="dot dot-donor"></i> Donor</span>
        <span><i class="dot dot-recipient"></i> Penerima</span>
        <span><i class="dot dot-courier"></i> Kurir</span>
        <span><i class="dot dot-listing"></i> Surplus tersedia</span>
        <span><i class="dot" style="background:#2563eb;border-radius:2px;height:3px;width:16px"></i> Rute pengantaran</span>
      </div>
    </div>
    <div class="map-wrap"><div id="gisMap"></div></div>
    <div class="map-stats">
      <div class="stat"><div class="label">Donor</div><div class="value">${users.filter((u) => u.role === 'donor' && u.lat).length}</div></div>
      <div class="stat"><div class="label">Penerima</div><div class="value">${users.filter((u) => u.role === 'recipient' && u.lat).length}</div></div>
      <div class="stat"><div class="label">Kurir</div><div class="value">${users.filter((u) => u.role === 'courier' && u.lat).length}</div></div>
      <div class="stat accent"><div class="label">Rute aktif</div><div class="value">${activeMatches.length}</div></div>
    </div>
  </div>
  <p class="muted">Isi lat/lng saat registrasi/submit di area Madura — contoh: Bangkalan <code>-7.03, 112.74</code>, Sampang <code>-7.15, 113.25</code>, Pamekasan <code>-7.16, 113.48</code>, Sumenep <code>-6.99, 113.83</code>.</p>`;
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
        `<b>${esc(l.name)}</b><br>${l.portions} porsi · ${statusTag(l.status)}<br>` +
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
        `<b>Match #${m.id}</b><br>${esc(m.listing_name || '')} → ${esc(m.need_title || '')}<br>` +
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
    <aside class="auth-aside">
      <div class="auth-brand">
        <span class="mark">${icon('leaf', 20)}</span>
        <span>Food Rescue AI</span>
      </div>
      <div class="auth-hero">
        <h2>Redistribusi surplus makanan dengan AI Matching &amp; GIS</h2>
        <p>Hubungkan donor, penerima manfaat, dan kurir di Madura — pantau rute pengantaran secara real-time.</p>
        <ul class="auth-points">
          <li><span class="tick">${icon('check', 12)}</span> Matching multi-kriteria dalam hitungan milidetik</li>
          <li><span class="tick">${icon('check', 12)}</span> Peta sebaran donor, penerima &amp; rute kurir</li>
          <li><span class="tick">${icon('check', 12)}</span> Konfirmasi serah terima via OTP</li>
          <li><span class="tick">${icon('check', 12)}</span> Audit log immutable untuk akuntabilitas</li>
        </ul>
      </div>
      <div class="auth-foot">Fokus layanan · Bangkalan · Sampang · Pamekasan · Sumenep</div>
    </aside>
    <div class="auth-panel">
      <div class="auth-card">
        <div class="eyebrow">Platform redistribusi pangan</div>
        <h1>Masuk ke akun Anda</h1>
        <p class="sub">Gunakan email terdaftar, atau daftar sebagai donor, penerima, atau kurir.</p>
        <div class="auth-tabs">
          <button id="tabLogin" class="active" type="button">Login</button>
          <button id="tabReg" type="button">Registrasi</button>
        </div>
        <form id="formLogin" data-action="1" data-endpoint="/api/auth/login">
          <label>Email</label>
          <input name="email" type="email" required placeholder="nama@contoh.id" autocomplete="email" />
          <label>Password</label>
          <input name="password" type="password" required placeholder="••••••••" autocomplete="current-password" />
          <button class="btn btn-block" type="submit">${icon('arrowRight', 15)} Masuk</button>
        </form>
        <form id="formReg" hidden data-action="1" data-endpoint="/api/auth/register">
          <label>Nama / Nama Organisasi</label>
          <input name="name" required placeholder="Masjid Jami' Bangkalan" />
          <label>Email</label>
          <input name="email" type="email" required autocomplete="email" />
          <label>Password</label>
          <input name="password" type="password" minlength="6" required autocomplete="new-password" />
          <label>Role</label>
          <select name="role" required>
            <option value="donor">Donor (Hotel / Restoran / Ritel)</option>
            <option value="recipient">Penerima Manfaat</option>
            <option value="courier">Kurir / Relawan</option>
          </select>
          <label>Telepon</label>
          <input name="phone" placeholder="08xxx" />
          <label>Alamat</label>
          <input name="address" placeholder="Jl. …, Bangkalan / Sampang / Pamekasan / Sumenep" />
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
          <button class="btn btn-block" type="submit">Daftar — menunggu verifikasi admin</button>
        </form>
        <div class="demo-note">
          Akun demo: <code>admin@foodrescue.id</code> / <code>admin123</code>
        </div>
      </div>
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
  ${pageHead(
    'Dashboard',
    'Ringkasan operasional redistribusi surplus makanan di Madura',
    `<button class="btn" data-post="/api/matches/run">${icon('sparkles', 15)} Jalankan AI Matching</button>`
  )}
  ${isEmpty ? `
  <div class="card">
    <div class="empty" style="border:none;background:transparent;padding:12px 8px">
      <div class="empty-title">Web masih kosong — siap diisi dari nol</div>
      Alur peluncuran: daftarkan donor &amp; penerima, verifikasi pengguna, lalu jalankan AI Matching.
    </div>
    <div class="flow-list">
      <div class="flow-item"><span class="flow-num">1</span><div><strong>Donor input surplus</strong><span>Foto, porsi, expiry, koordinat Madura</span></div></div>
      <div class="flow-item"><span class="flow-num">2</span><div><strong>Penerima ajukan kebutuhan</strong><span>Jumlah porsi &amp; tingkat urgensi</span></div></div>
      <div class="flow-item"><span class="flow-num">3</span><div><strong>Admin verifikasi pengguna</strong><span>Aktifkan akun donor, penerima, kurir</span></div></div>
      <div class="flow-item"><span class="flow-num">4</span><div><strong>Jalankan AI Matching</strong><span>Skor multi-kriteria &lt; 3 detik + rute GIS</span></div></div>
    </div>
  </div>` : ''}
  <div class="stat-grid">
    <div class="stat"><div class="label">Total pengguna</div><div class="value">${s.users.total}</div><div class="hint">${s.users.pending} menunggu verifikasi</div></div>
    <div class="stat"><div class="label">Total matching</div><div class="value">${s.matches.total}</div><div class="hint">${s.matches.verified} terverifikasi</div></div>
    <div class="stat accent"><div class="label">Porsi terdistribusi</div><div class="value">${s.impact.portions_delivered}</div></div>
    <div class="stat"><div class="label">Rata-rata skor</div><div class="value">${s.impact.avg_score}%</div></div>
    <div class="stat"><div class="label">Rata-rata jarak</div><div class="value">${s.impact.avg_distance_km}</div><div class="hint">km</div></div>
    <div class="stat"><div class="label">Audit log</div><div class="value">${s.impact.audit_logs}</div><div class="hint">immutable</div></div>
    <div class="stat"><div class="label">Menunggu verifikasi</div><div class="value">${s.users.pending}</div></div>
    <div class="stat"><div class="label">Durasi matching</div><div class="value">${runs[0]?.duration_ms ?? '—'}</div><div class="hint">ms · target &lt; 3000</div></div>
  </div>
  <div class="grid grid-2">
    <div class="card">
      <h2>Distribusi peran</h2>
      <div class="table-wrap">
      <table>
        <tbody>
          <tr><td>Donor</td><td style="text-align:right"><b>${s.users.donors}</b></td></tr>
          <tr><td>Penerima</td><td style="text-align:right"><b>${s.users.recipients}</b></td></tr>
          <tr><td>Kurir</td><td style="text-align:right"><b>${s.users.couriers}</b></td></tr>
          <tr><td>Admin</td><td style="text-align:right"><b>${Math.max(0, s.users.total - s.users.donors - s.users.recipients - s.users.couriers)}</b></td></tr>
        </tbody>
      </table>
      </div>
    </div>
    <div class="card">
      <h2>Listing &amp; kebutuhan</h2>
      <div class="table-wrap">
      <table>
        <tbody>
          <tr><td>Listing tersedia</td><td style="text-align:right"><b>${s.listings.available} / ${s.listings.total}</b></td></tr>
          <tr><td>Listing terverifikasi</td><td style="text-align:right"><b>${s.listings.verified}</b></td></tr>
          <tr><td>Kebutuhan terbuka</td><td style="text-align:right"><b>${s.needs.open} / ${s.needs.total}</b></td></tr>
          <tr><td>Kebutuhan terpenuhi</td><td style="text-align:right"><b>${s.needs.fulfilled}</b></td></tr>
        </tbody>
      </table>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Riwayat performa AI Matching</h2>
        <div class="sub">Durasi proses per kali run</div>
      </div>
    </div>
    ${runs.length === 0 ? '<div class="empty">Belum ada run — klik “Jalankan AI Matching”.</div>' : `
    <div class="table-wrap">
    <table>
      <thead><tr><th>Kandidat (L/N/C)</th><th>Dibuat</th><th>Durasi (ms)</th></tr></thead>
      <tbody>
      ${runs.map(r => `<tr><td>${r.candidates_listings ?? '—'}/${r.candidates_needs ?? '—'}/${r.candidates_couriers ?? '—'}</td><td class="muted">${r.created ?? '—'}</td><td><b>${r.duration_ms ?? '—'}</b></td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminUsers() {
  const users = await api('/api/admin/users');
  return `
  ${pageHead('Pengguna', 'Verifikasi, tolak, atau hapus akun donor, penerima, dan kurir')}
  <div class="card">
    ${users.length <= 1 ? '<div class="empty">Belum ada pengguna selain admin. Ajukan registrasi dari halaman login.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Lokasi (Madura/Jatim)</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${users.map(u => `
      <tr>
        <td><b>${esc(u.name)}</b>${u.org_name ? `<br><span class="muted">${esc(u.org_name)}</span>` : ''}</td>
        <td>${esc(u.email)}</td>
        <td><span class="tag tag-gray">${esc(u.role)}</span></td>
        <td>${statusTag(u.status)}</td>
        <td class="muted">${u.lat ?? '—'}, ${u.lng ?? '—'}${u.capacity ? `<br>kap. ${u.capacity} porsi` : ''}</td>
        <td>
          <div class="row">
          ${u.status !== 'active' && u.role !== 'admin' ? `<button class="btn btn-sm" data-patch="/api/admin/users/${u.id}/status" data-body='{"status":"active"}'>Verifikasi</button>` : ''}
          ${u.status !== 'rejected' && u.role !== 'admin' ? `<button class="btn btn-sm btn-danger" data-patch="/api/admin/users/${u.id}/status" data-body='{"status":"rejected"}'>Tolak</button>` : ''}
          ${u.role !== 'admin' ? `<button class="btn btn-sm btn-outline" data-delete="/api/admin/users/${u.id}">Hapus</button>` : ''}
          </div>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminMatches() {
  const rows = await api('/api/admin/matches');
  return `
  ${pageHead(
    'AI Matching',
    'Skor multi-kriteria: expiry, jarak, urgensi, kapasitas kurir — target &lt; 3 detik',
    `<button class="btn" data-post="/api/matches/run">${icon('sparkles', 15)} Jalankan Matching</button>`
  )}
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Hasil matching</h2>
        <div class="sub">${rows.length} entri</div>
      </div>
    </div>
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada match</div>Isi surplus &amp; kebutuhan dulu, lalu jalankan AI Matching.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Surplus → Kebutuhan</th><th>Kurir</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `
      <tr>
        <td class="muted">${m.id}</td>
        <td><b>${esc(m.listing_name)}</b> (${m.portions} porsi)<br>→ ${esc(m.need_title)} ${statusTag(m.urgency)}<br><span class="muted">${esc(m.donor_name)} → ${esc(m.recipient_name)}</span></td>
        <td>${esc(m.courier_name)}</td>
        <td>
          <b>${m.score_percent}%</b>
          <div class="score-bar"><div style="width:${m.score_percent}%"></div></div>
          <span class="muted">exp ${Number(m.score_expiry*100).toFixed(0)} · jarak ${Number(m.score_distance*100).toFixed(0)} · urgensi ${Number(m.score_urgency*100).toFixed(0)} · kap. ${Number(m.score_capacity*100).toFixed(0)}</span>
        </td>
        <td>${m.distance_km} km</td>
        <td>${statusTag(m.status)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderAdminLogs() {
  const logs = await api('/api/admin/logs');
  return `
  ${pageHead('Audit Log', 'Riwayat aktivitas sistem — immutable, tidak dapat diubah atau dihapus')}
  <div class="card">
    ${logs.length === 0 ? '<div class="empty">Belum ada aktivitas tercatat.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>ID</th><th>Waktu</th><th>User</th><th>Aksi</th><th>Entity</th><th>Detail</th></tr>
      </thead>
      <tbody>
      ${logs.map(l => `
      <tr>
        <td class="muted">${l.id}</td>
        <td class="muted">${fmtDate(l.created_at)}</td>
        <td>${esc(l.user_name || 'system')}</td>
        <td><code>${esc(l.action)}</code></td>
        <td>${esc(l.entity)}${l.entity_id ? '#' + esc(l.entity_id) : ''}</td>
        <td class="muted" style="max-width:260px;word-break:break-all">${l.detail ? esc(l.detail) : '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

function renderDonorForm() {
  return `
  ${pageHead('Input Surplus Makanan', 'Catat surplus dari hotel, restoran, atau ritel untuk didistribusikan')}
  <div class="card">
    <form data-action="1" data-endpoint="/api/food" data-multipart="1">
      <label>Nama surplus</label>
      <input name="name" required placeholder="Buffet sarapan sisa" />
      <label>Deskripsi</label>
      <textarea name="description" rows="2" placeholder="Kondisi, jenis makanan…"></textarea>
      <div class="grid grid-2">
        <div><label>Jumlah porsi</label><input name="portions" type="number" min="1" required /></div>
        <div><label>Expiry time</label><input name="expiry_at" type="datetime-local" required /></div>
      </div>
      <div class="grid grid-2">
        <div><label>Latitude (Madura)</label><input name="lat" type="number" step="any" placeholder="-7.03" /></div>
        <div><label>Longitude (Madura)</label><input name="lng" type="number" step="any" placeholder="112.74" /></div>
      </div>
      <label>Foto kondisi makanan (opsional, maks 1MB)</label>
      <input name="photo" type="file" accept="image/*" />
      <div class="form-actions">
        <button class="btn" type="submit">${icon('upload', 15)} Simpan surplus</button>
      </div>
    </form>
  </div>`;
}

async function renderDonorListings() {
  const rows = await api('/api/food');
  return `
  ${pageHead('Listing Surplus Saya', 'Pantau status surplus yang telah Anda input')}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada listing</div>Input surplus terlebih dahulu.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Foto</th><th>Nama</th><th>Porsi</th><th>Expiry</th><th>Status</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${rows.map(l => `
      <tr>
        <td>${l.photo_path ? `<img class="thumb" src="${l.photo_path}" alt="" />` : '—'}</td>
        <td><b>${esc(l.name)}</b><br><span class="muted">${esc(l.description || '')}</span></td>
        <td>${l.portions}</td>
        <td class="muted">${fmtDate(l.expiry_at)}</td>
        <td>${statusTag(l.status)}</td>
        <td>${['available','matched'].includes(l.status) ? `<button class="btn btn-sm btn-danger" data-patch="/api/food/${l.id}/cancel">Batalkan</button>` : '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderDonorMatches() {
  const rows = await api('/api/matches');
  return `
  ${pageHead('Match Surplus Saya', 'Hasil AI Matching untuk surplus yang Anda inputkan')}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada match</div>Tunggu admin menjalankan AI Matching.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Surplus</th><th>Penerima</th><th>Kurir</th><th>Skor</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `
      <tr>
        <td><b>${esc(m.listing_name)}</b><br><span class="muted">${m.portions} porsi</span></td>
        <td>${esc(m.need_title)}<br><span class="muted">${esc(m.recipient_name)}</span></td>
        <td>${esc(m.courier_name)}</td>
        <td><b>${m.score_percent ?? Number((m.score*100).toFixed(1))}%</b></td>
        <td>${statusTag(m.status)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderRecipientForm() {
  const needsList = await renderRecipientNeedsList();
  return `
  ${pageHead('Kebutuhan Pangan', 'Ajukan kebutuhan porsi makanan untuk komunitas atau lembaga Anda')}
  <div class="card">
    <form data-action="1" data-endpoint="/api/needs">
      <label>Judul kebutuhan</label>
      <input name="title" required placeholder="Makan malam warga prasejahtera" />
      <div class="grid grid-2">
        <div><label>Porsi dibutuhkan</label><input name="portions_needed" type="number" min="1" required /></div>
        <div>
          <label>Tingkat urgensi</label>
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
      <div class="form-actions">
        <button class="btn" type="submit">${icon('upload', 15)} Simpan kebutuhan</button>
      </div>
    </form>
  </div>
  ${needsList}`;
}

async function renderRecipientNeedsList() {
  const rows = await api('/api/needs');
  return `
  <div class="card">
    <div class="card-head"><h2>Kebutuhan saya</h2></div>
    ${rows.length === 0 ? '<div class="empty">Belum ada kebutuhan tercatat.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Judul</th><th>Porsi</th><th>Urgensi</th><th>Status</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${rows.map(n => `
      <tr>
        <td><b>${esc(n.title)}</b><br><span class="muted">${esc(n.note || '')}</span></td>
        <td>${n.portions_needed}</td>
        <td>${statusTag(n.urgency)}</td>
        <td>${statusTag(n.status)}</td>
        <td>${n.status === 'open' ? `<button class="btn btn-sm btn-outline" data-patch="/api/needs/${n.id}" data-body='{"status":"expired"}'>Tutup</button>` : '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderRecipientMatches() {
  const rows = await api('/api/matches');
  const ready = rows.filter((m) => ['picked_up', 'delivered'].includes(m.status));
  return `
  ${pageHead('Konfirmasi OTP', 'Masukkan kode 6 digit untuk konfirmasi serah terima kiriman')}
  <div class="card">
    <div class="card-head"><h2>Menunggu konfirmasi</h2></div>
    ${ready.length === 0 ? '<div class="empty">Belum ada kiriman menunggu konfirmasi OTP.</div>' : ready.map((m) => `
      <div class="notif unread">
        <div class="spread">
          <div>
            <div class="notif-title">${esc(m.listing_name)} — ${m.portions} porsi</div>
            <span class="muted">Dari ${esc(m.donor_name)} · Kurir ${esc(m.courier_name)} · ${statusTag(m.status)}</span>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <input style="max-width:200px;margin:0" id="otp-${m.id}" placeholder="6 digit OTP" maxlength="6" inputmode="numeric" />
          <button class="btn btn-sm" type="button" id="verifyBtn-${m.id}" data-verify="${m.id}">${icon('check', 14)} Konfirmasi terima</button>
        </div>
      </div>`).join('')}
  </div>
  <div class="card">
    <div class="card-head"><h2>Riwayat kiriman</h2></div>
    ${rows.length === 0 ? '<div class="empty">Belum ada kiriman.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Surplus</th><th>Donor</th><th>Kurir</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `<tr><td>${esc(m.listing_name)}</td><td>${esc(m.donor_name)}</td><td>${esc(m.courier_name)}</td><td>${statusTag(m.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderCourier() {
  const rows = await api('/api/matches');
  const active = rows.filter((m) => ['proposed', 'accepted', 'picked_up', 'delivered'].includes(m.status));
  return `
  ${pageHead('Tugas Kurir', 'Ambil foto kondisi makanan, antar, dan tandai status pengiriman')}
  <div class="card">
    <div class="card-head"><h2>Tugas aktif</h2></div>
    ${active.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada tugas</div>Minta admin menjalankan AI Matching.</div>' : active.map((m) => {
      const route = m.route;
      return `
      <div class="notif unread">
        <div class="spread">
          <div>
            <div class="notif-title">Match #${m.id}: ${esc(m.listing_name)} — ${m.portions} porsi</div>
            <span class="muted">Untuk ${esc(m.need_title)} (${esc(m.recipient_name)}) · Urgensi ${m.urgency} · Skor ${m.score_percent ?? ''}%</span>
          </div>
          ${statusTag(m.status)}
        </div>
        ${route ? `
        <div style="margin-top:12px">
          <div class="spread" style="margin-bottom:6px">
            <strong style="font-size:13px">${icon('route', 14)} Rute pengantaran</strong>
            <span class="muted">${route.total_distance_km} km · ± ${route.total_duration_min} menit</span>
          </div>
          ${route.waypoints.map((w) => `<div class="route-step">${esc(w.label)} <span class="muted">(${w.lat}, ${w.lng})</span></div>`).join('')}
          <p class="muted" style="margin-top:6px">Leg: ${route.legs.map((l) => `${l.from}→${l.to}: ${l.distance_km} km / ${l.duration_min} mnt`).join(' · ')}</p>
        </div>
        ` : ''}
        <p class="muted" style="margin-top:8px">Donor: ${esc(m.donor_phone || '—')} — ${esc(m.donor_address || '')}<br>
        Penerima: ${esc(m.recipient_phone || '—')} — ${esc(m.recipient_address || '')}</p>
        <div class="row" style="margin-top:10px">
          ${['proposed', 'accepted'].includes(m.status) ? `
            <form id="pickup-${m.id}" data-action="1" data-endpoint="/api/deliveries/${m.id}/pickup" data-multipart="1">
              <label>Foto kondisi makanan (wajib, maks 1MB)</label>
              <input type="file" name="photo" accept="image/*" required style="margin:0" />
              <div class="form-actions">
                <button class="btn btn-sm" type="submit">${icon('upload', 14)} Upload &amp; pickup</button>
              </div>
            </form>
          ` : ''}
          ${m.status === 'picked_up' ? `<button class="btn btn-sm" data-post="/api/deliveries/${m.id}/deliver">${icon('check', 14)} Tandai sampai di lokasi</button>` : ''}
          ${m.status === 'delivered' ? `<span class="muted">Menunggu penerima memasukkan OTP…</span>` : ''}
          ${m.photo_path ? `<img class="thumb" src="${m.photo_path}" alt="Foto serah terima" />` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <div class="card-head"><h2>Riwayat tugas</h2></div>
    ${rows.length === 0 ? '<div class="empty">Belum ada riwayat.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Surplus</th><th>Penerima</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `<tr><td class="muted">${m.id}</td><td>${esc(m.listing_name)}</td><td>${esc(m.recipient_name)}</td><td><b>${m.score_percent ?? ''}%</b></td><td>${m.distance_km} km</td><td>${statusTag(m.status)}</td></tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderNotif() {
  const rows = await api('/api/notifications');
  return `
  ${pageHead(
    'Notifikasi',
    'Pembaruan match, pickup, dan status serah terima',
    `<button class="btn btn-outline btn-sm" data-post="/api/notifications/read-all">${icon('check', 14)} Tandai semua dibaca</button>`
  )}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty">Belum ada notifikasi.</div>' : rows.map((n) => `
      <div class="notif ${n.read_at ? '' : 'unread'}">
        <div class="notif-title">${esc(n.title)}</div>
        <p class="muted" style="margin-bottom:6px">${esc(n.message)}</p>
        <div class="spread">
          <span class="muted">${fmtDate(n.created_at)}</span>
          ${n.read_at ? '' : `<button class="btn btn-sm btn-ghost" data-post="/api/notifications/${n.id}/read">Tandai dibaca</button>`}
        </div>
      </div>`).join('')}
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
