const API = '';
let token = localStorage.getItem('frai_token') || '';
let me = JSON.parse(localStorage.getItem('frai_user') || 'null');
let currentTab = '';
let gisMap = null;
let gisLayer = null;

const MADIUN_CENTER = [-7.63, 111.52];
const MADIUN_BOUNDS = [[-7.95, 111.2], [-7.3, 111.8]];

const LOCATIONS = [
  { label: 'Kota Madiun', lat: -7.6245, lng: 111.525 },
  { label: 'Caruban (Madiun Kab.)', lat: -7.5494, lng: 111.6403 },
  { label: 'Mejayan', lat: -7.5519, lng: 111.4536 },
  { label: 'Balerejo', lat: -7.5483, lng: 111.5597 },
  { label: 'Dagangan', lat: -7.6061, lng: 111.6244 },
  { label: 'Dolopo', lat: -7.7503, lng: 111.55 },
  { label: 'Geger', lat: -7.7225, lng: 111.4683 },
  { label: 'Saradan', lat: -7.5317, lng: 111.335 },
  { label: 'Kartoharjo', lat: -7.6014, lng: 111.4844 },
  { label: 'Taman', lat: -7.6503, lng: 111.5172 },
  { label: 'Wungu', lat: -7.6833, lng: 111.5167 },
  { label: 'Sawahan', lat: -7.5267, lng: 111.4697 },
  { label: 'Ngawi', lat: -7.4025, lng: 111.4414 },
  { label: 'Magetan', lat: -7.6569, lng: 111.3303 },
  { label: 'Ponorogo', lat: -7.8664, lng: 111.4667 },
];

function locationSelectHtml(opts = {}) {
  const {
    label = 'Lokasi',
    required = false,
    hint = 'Pilih kecamatan/kota di sekitar Madiun, atau gunakan GPS di perangkat Anda',
  } = opts;
  return `
  <div class="loc-field">
    <label>${label}${required ? '' : ' <span class="muted">(opsional)</span>'}</label>
    <select name="location" data-loc-select ${required ? 'required' : ''}>
      <option value="">Pilih lokasi…</option>
      ${LOCATIONS.map((l) => `<option value="${l.lat},${l.lng}">${l.label}</option>`).join('')}
      <option value="gps">Gunakan lokasi saya (GPS)</option>
    </select>
    <input type="hidden" name="lat" data-loc-lat value="" />
    <input type="hidden" name="lng" data-loc-lng value="" />
    <div class="field-hint">${hint}</div>
  </div>`;
}

function bindLocationSelects(root = document) {
  root.querySelectorAll('[data-loc-select]').forEach((sel) => {
    if (sel._bound) return;
    sel._bound = true;
    sel.addEventListener('change', () => {
      const form = sel.closest('form');
      if (!form) return;
      const latIn = form.querySelector('[data-loc-lat]');
      const lngIn = form.querySelector('[data-loc-lng]');
      if (!latIn || !lngIn) return;
      if (sel.value === 'gps') {
        if (!navigator.geolocation) {
          toast('GPS tidak didukung di peramban ini', 'error');
          sel.value = '';
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            latIn.value = pos.coords.latitude.toFixed(6);
            lngIn.value = pos.coords.longitude.toFixed(6);
            toast('Lokasi perangkat terisi');
          },
          () => {
            toast('Izin lokasi ditolak — pilih kota manual', 'error');
            sel.value = '';
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      } else if (sel.value) {
        const [lat, lng] = sel.value.split(',');
        latIn.value = lat;
        lngIn.value = lng;
      } else {
        latIn.value = '';
        lngIn.value = '';
      }
    });
  });
}

function flowStepsHtml(status) {
  const order = ['proposed', 'picked_up', 'delivered', 'verified'];
  const labels = {
    proposed: 'Ditugaskan',
    accepted: 'Ditugaskan',
    picked_up: 'Dijemput',
    delivered: 'Sampai',
    verified: 'Selesai',
    cancelled: 'Dibatalkan',
  };
  const key = status === 'accepted' ? 'proposed' : status;
  const idx = order.indexOf(key);
  if (status === 'cancelled') {
    return `<div class="flow-steps"><span class="flow-step cancelled">Dibatalkan</span></div>`;
  }
  return `
  <div class="flow-steps">
    ${order
      .map((s, i) => {
        const state = idx < 0 ? '' : i < idx ? 'done' : i === idx ? 'current' : '';
        return `<span class="flow-step ${state}">${labels[s]}</span>`;
      })
      .join('<span class="flow-arrow">→</span>')}
  </div>`;
}

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
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
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
};

function icon(name, size = 16) {
  const body = ICONS[name] || ICONS.dashboard;
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function getTheme() {
  return localStorage.getItem('frai_theme') === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('frai_theme', theme);
  const isDark = theme === 'dark';
  const trackHtml = `
    <span class="switch-track" aria-hidden="true">
      <span class="switch-thumb">${icon(isDark ? 'moon' : 'sun', 12)}</span>
    </span>
    <span class="switch-label">${isDark ? 'Gelap' : 'Terang'}</span>`;
  const label = isDark ? 'Mode gelap aktif' : 'Mode terang aktif';
  const nextLabel = isDark ? 'Mode terang' : 'Mode gelap';
  document.querySelectorAll('#themeToggle, [data-theme-toggle]').forEach((btn) => {
    btn.innerHTML = trackHtml;
    btn.title = nextLabel;
    btn.setAttribute('aria-label', `Aktifkan ${nextLabel.toLowerCase()}`);
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', isDark ? 'true' : 'false');
    btn.dataset.themeState = theme;
    void label;
  });
}

function toggleTheme() {
  applyTheme(getTheme() === 'dark' ? 'light' : 'dark');
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
    available: ['tag-green', 'Tersedia'], matched: ['tag-blue', 'Sudah Dipasangkan'],
    picked_up: ['tag-yellow', 'Dijemput'], delivered: ['tag-yellow', 'Sampai'],
    verified: ['tag-green', 'Terverifikasi'], cancelled: ['tag-gray', 'Dibatalkan'],
    expired: ['tag-gray', 'Kedaluwarsa'], proposed: ['tag-blue', 'Usulan'],
    accepted: ['tag-blue', 'Diterima'], open: ['tag-green', 'Terbuka'],
    fulfilled: ['tag-green', 'Terpenuhi'], pending: ['tag-yellow', 'Menunggu'],
    active: ['tag-green', 'Aktif'], rejected: ['tag-red', 'Ditolak'],
    critical: ['tag-red', 'Kritis'], high: ['tag-yellow', 'Tinggi'],
    medium: ['tag-blue', 'Sedang'], low: ['tag-gray', 'Rendah'],
    wet: ['tag-blue', 'Makanan Basah'], dry: ['tag-yellow', 'Makanan Kering'],
    donor: ['tag-blue', 'Donor'], recipient: ['tag-green', 'Penerima'],
    courier: ['tag-yellow', 'Kurir'], admin: ['tag-gray', 'Admin'],
  };
  const [cls, label] = map[s] || ['tag-gray', s];
  return `<span class="tag ${cls}">${label}</span>`;
}

const ROLE_LABEL = {
  donor: 'Donor',
  recipient: 'Penerima',
  courier: 'Kurir',
  admin: 'Admin',
};

const FOOD_TYPE_LABEL = { wet: 'Makanan Basah', dry: 'Makanan Kering' };

const SOP = {
  wet: {
    title: 'SOP Makanan Basah',
    warn: 'Makanan basah mudah basi & tumbuh bakteri — utamakan rantai dingin dan waktu singkat.',
    sections: [
      {
        title: 'Packing',
        items: [
          'Gunakan wadah food-grade tertutup rapat (container/box mika bersegel)',
          'Pisahkan makanan matang dan mentah — jangan dicampur',
          'Label wadah: nama makanan, jam masak/sisa, masa simpan, porsi',
          'Bungkus dengan ice gel/cold pack bila suhu harus tetap dingin',
          'Hindari kertas koran / wadah terbuka saat pengantaran',
        ],
      },
      {
        title: 'Penyimpanan',
        items: [
          'Suhu penyimpanan ≤ 5°C (chiller) atau ≤ -18°C (freezer) bila bisa',
          'Bila tidak ada chiller: simpan di tempat paling dingin, maksimal 2 jam sebelum penjemputan',
          'Jangan simpan di bawah matahari / ruang panas dapur',
          'Simpan berdasarkan FEFO (First Expired, First Out)',
        ],
      },
      {
        title: 'Suhu & Rentang Aman',
        items: [
          'Zona berbahaya 5°C–60°C — makanan basah jangan lama di rentang ini',
          'Target: dari dapur → kurir → penerima dalam ≤ 4 jam (ideal ≤ 2 jam)',
          'Saat tiba, penerima cek bau, tekstur, dan suhu — bila ragu, jangan dikonsumsi',
        ],
      },
      {
        title: 'Hygiene & Transport',
        items: [
          'Cuci tangan / pakai sarung tangan saat mengemas',
          'Dasar kendaraan bersih; makanan tidak bersentuhan langsung dengan lantai bagasi',
          'Antar langsung — tidak boleh ditinggal di dashboard panas',
          'Foto kondisi makanan saat penjemputan sebagai bukti rantai penanganan',
        ],
      },
    ],
  },
  dry: {
    title: 'SOP Makanan Kering',
    warn: 'Makanan kering lebih tahan lama, tapi tetap jaga kelembapan & kemasan utuh.',
    sections: [
      {
        title: 'Packing',
        items: [
          'Pakai kemasan asli yang masih utuh, atau ziplock/foil food-grade',
          'Pastikan kemasan tidak sobek, bocor, atau lembap',
          'Gabungkan item serupa dalam kardus/kotak bertumpuk rapi',
          'Label: nama produk, tanggal kedaluwarsa, jumlah, kondisi kemasan',
        ],
      },
      {
        title: 'Penyimpanan',
        items: [
          'Simpan kering, sejuk, teduh — hindari kelembapan tinggi',
          'Jauhkan dari bau menyengat (mis. deterjen, bensin) agar tidak menyerap aroma',
          'Angin-anginkan gudang; jangan menumpuk menempel lantai lembap',
          'Rotasi stok FEFO — yang kedaluwarsa paling dekat didahulukan',
        ],
      },
      {
        title: 'Rentang Aman',
        items: [
          'Umumnya aman di suhu ruang selama kemasan tersegel',
          'Hindari suhu ekstrem & sinar matahari langsung (bisa mencairkan/rusak)',
          'Cek masa simpan sebelum dicatat; yang kedaluwarsa tidak boleh dibagikan',
        ],
      },
      {
        title: 'Hygiene & Transport',
        items: [
          'Kemas lapis luar bersih; jangan taruh di bagasi basah',
          'Pisahkan dari makanan basah saat dijadikan satu rute',
          'Foto kemasan utuh saat penjemputan',
        ],
      },
    ],
  },
};

function foodTypeTag(t) {
  if (t !== 'wet' && t !== 'dry') return '—';
  return statusTag(t);
}

function sopHtml(type, { compact = false } = {}) {
  const s = SOP[type];
  if (!s) return '';
  if (compact) {
    return `
    <div class="sop sop-compact sop-${type}">
      <div class="sop-head">${icon('shield', 14)} <strong>${s.title}</strong> ${foodTypeTag(type)}</div>
      <ul class="sop-list">
        ${s.sections.flatMap((sec) => sec.items.slice(0, 2)).slice(0, 6).map((i) => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>`;
  }
  return `
  <div class="sop sop-${type}" data-sop="${type}">
    <div class="sop-head">
      ${icon('shield', 16)}
      <div>
        <strong>${s.title}</strong>
        <div class="sop-warn">${esc(s.warn)}</div>
      </div>
      <span class="sop-badge">${type === 'wet' ? icon('refresh', 14) + ' Rantai dingin' : icon('package', 14) + ' Jaga kering'}</span>
    </div>
    <div class="sop-grid">
      ${s.sections.map((sec) => `
        <div class="sop-sec">
          <div class="sop-sec-title">${esc(sec.title)}</div>
          <ul class="sop-list">
            ${sec.items.map((i) => `<li>${icon('check', 12)}<span>${esc(i)}</span></li>`).join('')}
          </ul>
        </div>`).join('')}
    </div>
  </div>`;
}

function bindSopToggle(root = document) {
  const sel = root.querySelector('[name="food_type"]');
  const box = root.querySelector('#sopBox');
  if (!sel || !box) return;
  const paint = () => {
    const t = sel.value === 'dry' ? 'dry' : 'wet';
    box.innerHTML = sopHtml(t);
  };
  sel.addEventListener('change', paint);
  paint();
}

function logout() {
  try {
    localStorage.removeItem('frai_token');
    localStorage.removeItem('frai_user');
  } catch (_) {}
  token = '';
  me = null;
  currentTab = '';
  destroyMap();
  closeSidebar();
  render();
}
window.logout = logout;

const NAV = {
  admin: [
    ['dashboard', 'dashboard', 'Beranda'],
    ['gis', 'map', 'Peta GIS'],
    ['users', 'users', 'Pengguna'],
    ['matches', 'cpu', 'Pencocokan AI'],
    ['outbox', 'message', 'Pesan Terkirim'],
    ['logs', 'file', 'Catatan Audit'],
    ['notif', 'bell', 'Notifikasi'],
  ],
  donor: [
    ['donor', 'package', 'Catat Surplus'],
    ['donor-listings', 'list', 'Stok Surplus'],
    ['donor-matches', 'link', 'Pencocokan Saya'],
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
  dashboard: 'Beranda',
  gis: 'Peta GIS',
  users: 'Pengguna',
  matches: 'Pencocokan AI',
  outbox: 'Pesan Terkirim',
  logs: 'Catatan Audit',
  notif: 'Notifikasi',
  donor: 'Catat Surplus',
  'donor-listings': 'Stok Surplus',
  'donor-matches': 'Pencocokan Saya',
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
  const top = document.getElementById('topbarTitle');
  if (top) top.textContent = TAB_TITLES[currentTab] || 'Beranda';
}

function setTab(t) {
  if (!t) return;
  const same = currentTab === t;
  currentTab = t;
  closeSidebar();
  renderNav();
  if (!same) destroyMap();
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
    applyTheme(getTheme());
    return;
  }

  destroyMap();
  authRoot.hidden = true;
  authRoot.innerHTML = '';
  layout.hidden = false;

  document.getElementById('userName').textContent = me.name;
  document.getElementById('userRole').textContent = ROLE_LABEL[me.role] || me.role;
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
      outbox: renderAdminOutbox,
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
      bindSopToggle(view);
      if (currentTab === 'gis') initGisMap();
    }
  } catch (e) {
    view.innerHTML = `<div class="empty"><div class="empty-title">Terjadi kesalahan</div>${esc(e.message)}</div>`;
  }
}

function bindView() {
  bindLocationSelects(document.getElementById('view'));
  document.querySelectorAll('form[data-action]').forEach((f) => {
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const fd = new FormData(f);
      if (fd.has('location')) {
        if (!fd.get('lat')) fd.delete('lat');
        if (!fd.get('lng')) fd.delete('lng');
        fd.delete('location');
      }
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
  ${pageHead('Peta GIS', 'Sebaran donor, penerima, kurir &amp; rute pengantaran')}
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
  <p class="muted">Lokasi diambil dari pilihan kecamatan/kota di sekitar <b>Madiun, Jawa Timur</b> (atau GPS) saat daftar dan saat catat surplus/kebutuhan. Semakin akurat lokasi, semakin tepat jarak &amp; rute AI Matching.</p>`;
}

function initGisMap() {
  const el = document.getElementById('gisMap');
  if (!el || typeof L === 'undefined') return;

  destroyMap();
  gisMap = L.map('gisMap', { zoomControl: true }).setView(MADIUN_CENTER, 11);
  gisLayer = L.layerGroup().addTo(gisMap);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(gisMap);

  gisMap.fitBounds(MADIUN_BOUNDS);

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
        `<b>${esc(l.name)}</b><br>${l.portions} porsi · ${foodTypeTag(l.food_type)} · ${statusTag(l.status)}<br>` +
          `<span class="muted">Berlaku s/d: ${fmtDate(l.expiry_at)}</span>`
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
          `<b>Pencocokan #${m.id}</b><br>${esc(m.listing_name || '')} → ${esc(m.need_title || '')}<br>` +
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
        <h2>Redistribusi surplus makanan dengan pencocokan AI &amp; peta</h2>
        <p>Hubungkan donor, penerima manfaat, dan kurir — pantau rute pengantaran secara langsung.</p>
        <ul class="auth-points">
          <li><span class="tick">${icon('check', 12)}</span> Pencocokan multi-kriteria dalam hitungan milidetik</li>
          <li><span class="tick">${icon('check', 12)}</span> Peta sebaran donor, penerima &amp; rute kurir</li>
          <li><span class="tick">${icon('check', 12)}</span> Konfirmasi serah terima via OTP</li>
          <li><span class="tick">${icon('check', 12)}</span> Catatan audit tidak dapat diubah</li>
        </ul>
      </div>
      <div class="auth-foot">Melayani distribusi pangan yang merata dan aman</div>
    </aside>
    <div class="auth-panel">
      <button class="theme-switch auth-theme" type="button" data-theme-toggle title="Ganti tema" aria-label="Ganti tema terang/gelap"></button>
      <div class="auth-card">
        <div class="eyebrow">Platform redistribusi pangan</div>
        <h1>Masuk ke akun Anda</h1>
        <p class="sub">Gunakan email terdaftar, atau daftar sebagai donor, penerima, atau kurir.</p>
        <div class="auth-tabs">
          <button id="tabLogin" class="active" type="button">Masuk</button>
          <button id="tabReg" type="button">Daftar</button>
        </div>
        <form id="formLogin" data-action="1" data-endpoint="/api/auth/login">
          <label>Email</label>
          <input name="email" type="email" required placeholder="nama@contoh.id" autocomplete="email" />
          <label>Kata Sandi</label>
          <input name="password" type="password" required placeholder="••••••••" autocomplete="current-password" />
          <button class="btn btn-block" type="submit">${icon('arrowRight', 15)} Masuk</button>
        </form>
        <form id="formReg" hidden data-action="1" data-endpoint="/api/auth/register">
          <label>Nama / Nama Organisasi</label>
          <input name="name" required placeholder="Masjid Jami' Kota Madiun" />
          <label>Email</label>
          <input name="email" type="email" required autocomplete="email" />
          <label>Kata Sandi</label>
          <input name="password" type="password" minlength="6" required autocomplete="new-password" />
          <label>Peran</label>
          <select name="role" required>
            <option value="donor">Donor (Hotel / Restoran / Ritel)</option>
            <option value="recipient">Penerima Manfaat</option>
            <option value="courier">Kurir / Relawan</option>
          </select>
          <label>Telepon</label>
          <input name="phone" placeholder="08xxx" />
          <label>Alamat</label>
          <input name="address" placeholder="Jl. …, kota/kabupaten Anda" />
          ${locationSelectHtml({ label: 'Lokasi domisili', hint: 'Untuk peta & perhitungan rute — pilih kota atau GPS' })}
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
    if (!body.lat) delete body.lat;
    if (!body.lng) delete body.lng;
    delete body.location;
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

  bindLocationSelects(formReg);
}

/* ========== PAGES ========== */

async function renderAdminDashboard() {
  const s = await api('/api/admin/stats');
  const runs = s.performance.last_matching_runs || [];
  const isEmpty =
    s.listings.total === 0 && s.needs.total === 0 && s.matches.total === 0 && s.users.total <= 1;

  return `
  ${pageHead(
    'Beranda',
    'Ringkasan operasional redistribusi surplus makanan',
    `<button class="btn" data-post="/api/matches/run">${icon('sparkles', 15)} Jalankan Pencocokan AI</button>`
  )}
  ${isEmpty ? `
  <div class="card">
    <div class="empty" style="border:none;background:transparent;padding:12px 8px">
      <div class="empty-title">Web masih kosong — siap diisi dari nol</div>
      Alur peluncuran: daftarkan donor &amp; penerima, verifikasi pengguna, lalu jalankan pencocokan AI.
    </div>
    <div class="flow-list">
      <div class="flow-item"><span class="flow-num">1</span><div><strong>Donor catat surplus</strong><span>Foto, porsi, masa simpan, koordinat</span></div></div>
      <div class="flow-item"><span class="flow-num">2</span><div><strong>Penerima ajukan kebutuhan</strong><span>Jumlah porsi &amp; tingkat urgensi</span></div></div>
      <div class="flow-item"><span class="flow-num">3</span><div><strong>Admin verifikasi pengguna</strong><span>Aktifkan akun donor, penerima, kurir</span></div></div>
      <div class="flow-item"><span class="flow-num">4</span><div><strong>Jalankan pencocokan AI</strong><span>Skor multi-kriteria &lt; 3 detik + rute peta</span></div></div>
    </div>
  </div>` : ''}
  <div class="stat-grid">
    <div class="stat"><div class="label">Total pengguna</div><div class="value">${s.users.total}</div><div class="hint">${s.users.pending} menunggu verifikasi</div></div>
    <div class="stat"><div class="label">Total pencocokan</div><div class="value">${s.matches.total}</div><div class="hint">${s.matches.verified} terverifikasi</div></div>
    <div class="stat accent"><div class="label">Porsi terdistribusi</div><div class="value">${s.impact.portions_delivered}</div></div>
    <div class="stat"><div class="label">Rata-rata skor</div><div class="value">${s.impact.avg_score}%</div></div>
    <div class="stat"><div class="label">Rata-rata jarak</div><div class="value">${s.impact.avg_distance_km}</div><div class="hint">km</div></div>
    <div class="stat"><div class="label">Catatan audit</div><div class="value">${s.impact.audit_logs}</div><div class="hint">tidak dapat diubah</div></div>
    <div class="stat"><div class="label">Pesan outbox</div><div class="value">${s.impact.outbox_messages ?? 0}</div><div class="hint">WA ${s.channels?.whatsapp === 'live' ? 'aktif' : 'sim'} · Email ${s.channels?.email === 'live' ? 'aktif' : 'sim'}</div></div>
    <div class="stat"><div class="label">Menunggu verifikasi</div><div class="value">${s.users.pending}</div></div>
    <div class="stat"><div class="label">Durasi pencocokan</div><div class="value">${runs[0]?.duration_ms ?? '—'}</div><div class="hint">milidetik · target &lt; 3000</div></div>
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
      <h2>Stok surplus &amp; kebutuhan</h2>
      <div class="table-wrap">
      <table>
        <tbody>
          <tr><td>Surplus tersedia</td><td style="text-align:right"><b>${s.listings.available} / ${s.listings.total}</b></td></tr>
          <tr><td>Surplus terverifikasi</td><td style="text-align:right"><b>${s.listings.verified}</b></td></tr>
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
        <h2>Riwayat kinerja pencocokan AI</h2>
        <div class="sub">Durasi proses setiap kali dijalankan</div>
      </div>
    </div>
    ${runs.length === 0 ? '<div class="empty">Belum ada proses — klik “Jalankan Pencocokan AI”.</div>' : `
    <div class="table-wrap">
    <table>
      <thead><tr><th>Kandidat (stok/kebutuhan/kurir)</th><th>Dibuat</th><th>Durasi (milidetik)</th></tr></thead>
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
    ${users.length <= 1 ? '<div class="empty">Belum ada pengguna selain admin. Ajukan pendaftaran dari halaman masuk.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th>Koordinat</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${users.map(u => `
      <tr>
        <td><b>${esc(u.name)}</b>${u.org_name ? `<br><span class="muted">${esc(u.org_name)}</span>` : ''}</td>
        <td>${esc(u.email)}</td>
        <td>${statusTag(u.role)}</td>
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
    'Pencocokan AI',
    'Skor multi-kriteria: masa simpan, jarak, urgensi, kapasitas kurir — target &lt; 3 detik',
    `<button class="btn" data-post="/api/matches/run">${icon('sparkles', 15)} Jalankan Pencocokan</button>`
  )}
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Hasil pencocokan</h2>
        <div class="sub">${rows.length} entri</div>
      </div>
    </div>
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada pencocokan</div>Isi surplus &amp; kebutuhan dulu, lalu jalankan pencocokan AI.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Surplus → Kebutuhan</th><th>Kurir</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `
      <tr>
        <td class="muted">${m.id}</td>
        <td><b>${esc(m.listing_name)}</b> (${m.portions} porsi) ${foodTypeTag(m.food_type)}<br>→ ${esc(m.need_title)} ${statusTag(m.urgency)}<br><span class="muted">${esc(m.donor_name)} → ${esc(m.recipient_name)}</span></td>
        <td>${esc(m.courier_name)}</td>
        <td>
          <b>${m.score_percent}%</b>
          <div class="score-bar"><div style="width:${m.score_percent}%"></div></div>
          <span class="muted">simpan ${Number(m.score_expiry*100).toFixed(0)} · jarak ${Number(m.score_distance*100).toFixed(0)} · urgensi ${Number(m.score_urgency*100).toFixed(0)} · kap. ${Number(m.score_capacity*100).toFixed(0)}</span>
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
  ${pageHead('Catatan Audit', 'Riwayat aktivitas sistem — tidak dapat diubah atau dihapus')}
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

async function renderAdminOutbox() {
  const data = await api('/api/admin/outbox');
  const rows = data.messages || [];
  const ch = data.channels || {};
  const chChip = (state) =>
    state === 'live'
      ? '<span class="pill" style="background:var(--brand-soft);color:var(--brand);border:1px solid var(--brand-border)">Aktif</span>'
      : '<span class="pill" style="background:var(--code-bg);color:var(--code-color);border:1px solid var(--border)">Simulasi</span>';
  return `
  ${pageHead(
    'Pesan Terkirim',
    'Outbox WhatsApp Gateway &amp; Mail Server — setiap notifikasi juga dikirim ke kanal eksternal'
  )}
  <div class="stat-grid">
    <div class="stat"><div class="label">WhatsApp Gateway</div><div class="value" style="font-size:1.1rem">${ch.whatsapp === 'live' ? 'Terhubung' : 'Simulasi'}</div><div class="hint">${ch.whatsapp === 'live' ? 'WHATSAPP_API_URL aktif' : 'isi env untuk kirim nyata'}</div></div>
    <div class="stat"><div class="label">Mail Server</div><div class="value" style="font-size:1.1rem">${ch.email === 'live' ? 'Terhubung' : 'Simulasi'}</div><div class="hint">${ch.email === 'live' ? 'SMTP_HOST aktif' : 'isi env SMTP untuk kirim nyata'}</div></div>
    <div class="stat accent"><div class="label">Total pesan</div><div class="value">${rows.length}</div></div>
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Riwayat outbox</h2>
        <div class="sub">Status: sent = terkirim · simulated = mode demo · failed = gagal</div>
      </div>
      <div class="row">
        <span class="muted">${icon('phone', 14)} WhatsApp ${chChip(ch.whatsapp)}</span>
        <span class="muted">${icon('mail', 14)} Email ${chChip(ch.email)}</span>
      </div>
    </div>
    ${rows.length === 0 ? '<div class="empty">Belum ada pesan. Notifikasi muncul otomatis saat match, pickup, OTP, atau verifikasi akun.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>#</th><th>Kanal</th><th>Penerima</th><th>Subjek</th><th>Status</th><th>Waktu</th></tr>
      </thead>
      <tbody>
      ${rows.map((m) => `
      <tr>
        <td class="muted">${m.id}</td>
        <td>${m.channel === 'whatsapp' ? icon('phone', 13) : icon('mail', 13)} ${m.channel === 'whatsapp' ? 'WhatsApp' : 'Email'}</td>
        <td>${esc(m.to_address || '—')}<br><span class="muted">${esc(m.user_name || '')}</span></td>
        <td><b>${esc(m.subject || '—')}</b><br><span class="muted" style="max-width:280px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.body || '')}</span></td>
        <td>${statusTag(m.status)}${m.error ? `<br><span class="muted">${esc(m.error)}</span>` : ''}</td>
        <td class="muted">${fmtDate(m.created_at)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>`;
}

async function renderDonorForm() {
  return `
  ${pageHead('Catat Surplus Makanan', 'Catat surplus dari hotel, restoran, atau ritel untuk dibagikan')}
  <div class="card">
    <div class="card-head"><h2>Alur donor</h2></div>
    <div class="flow-explain">
      <div class="flow-explain-item"><span class="flow-num">1</span><div><strong>Isi form di bawah</strong><span>Nama, porsi, masa simpan, lokasi, foto</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">2</span><div><strong>Admin jalankan AI Matching</strong><span>Surplus dicocokkan ke penerima &amp; kurir terdekat</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">3</span><div><strong>Kurir jemput &amp; antar</strong><span>Pantau status di menu “Pencocokan Saya”</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">4</span><div><strong>Penerima konfirmasi OTP</strong><span>Transaksi selesai &amp; tercatat di audit</span></div></div>
    </div>
  </div>
  <div class="card">
    <form data-action="1" data-endpoint="/api/food" data-multipart="1">
      <label>Nama surplus</label>
      <input name="name" required placeholder="Buffet sarapan sisa" />
      <label>Jenis makanan</label>
      <select name="food_type" required>
        <option value="wet">Makanan Basah (nasi, lauk, sayur, buah potong, dairy…)</option>
        <option value="dry">Makanan Kering (roti kemasan, keripik, biskuit, bahan kering…)</option>
      </select>
      <div id="sopBox" class="section-gap"></div>
      <label class="section-gap">Deskripsi</label>
      <textarea name="description" rows="2" placeholder="Kondisi, jenis makanan…"></textarea>
      <div class="grid grid-2">
        <div><label>Jumlah porsi</label><input name="portions" type="number" min="1" required /></div>
        <div><label>Berlaku s/d</label><input name="expiry_at" type="datetime-local" required /></div>
      </div>
      ${locationSelectHtml({
        label: 'Lokasi penjemputan',
        hint: 'Kosongkan untuk pakai alamat akun — pilih kota atau GPS',
      })}
      <label class="section-gap">Foto kondisi makanan (opsional, maks 1MB)</label>
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
  ${pageHead('Stok Surplus Saya', 'Pantau status surplus yang telah Anda catat')}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada stok surplus</div>Catat surplus terlebih dahulu.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Foto</th><th>Nama</th><th>Jenis</th><th>Porsi</th><th>Masa simpan</th><th>Status</th><th>Aksi</th></tr>
      </thead>
      <tbody>
      ${rows.map(l => `
      <tr>
        <td>${l.photo_path ? `<img class="thumb" src="${l.photo_path}" alt="" />` : '—'}</td>
        <td><b>${esc(l.name)}</b><br><span class="muted">${esc(l.description || '')}</span></td>
        <td>${foodTypeTag(l.food_type)}</td>
        <td>${l.portions}</td>
        <td class="muted">${fmtDate(l.expiry_at)}</td>
        <td>${statusTag(l.status)}</td>
        <td>${['available','matched'].includes(l.status) ? `<button class="btn btn-sm btn-danger" data-patch="/api/food/${l.id}/cancel">Batalkan</button>` : '—'}</td>
      </tr>`).join('')}
      </tbody>
    </table>
    </div>`}
  </div>
  <div class="card">
    <div class="card-head">
      <div>
        <h2>Panduan SOP penanganan</h2>
        <div class="sub">Wajib dipatuhi donor &amp; kurir saat pengemasan dan pengantaran</div>
      </div>
    </div>
    <div class="grid grid-2">
      ${sopHtml('wet', { compact: true })}
      ${sopHtml('dry', { compact: true })}
    </div>
  </div>`;
}

async function renderDonorMatches() {
  const rows = await api('/api/matches');
  return `
  ${pageHead('Pencocokan Surplus Saya', 'Hasil pencocokan AI untuk surplus yang Anda catat')}
  <div class="card">
    ${rows.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada pencocokan</div>Tunggu admin menjalankan pencocokan AI.</div>' : `
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Surplus</th><th>Penerima</th><th>Kurir</th><th>Skor</th><th>Status</th></tr>
      </thead>
      <tbody>
      ${rows.map(m => `
      <tr>
        <td><b>${esc(m.listing_name)}</b> ${foodTypeTag(m.food_type)}<br><span class="muted">${m.portions} porsi</span></td>
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
    <div class="card-head"><h2>Alur penerima manfaat</h2></div>
    <div class="flow-explain">
      <div class="flow-explain-item"><span class="flow-num">1</span><div><strong>Ajukan kebutuhan</strong><span>Jumlah porsi + tingkat urgensi + lokasi</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">2</span><div><strong>Admin jalankan AI Matching</strong><span>Donor &amp; kurir ditugaskan otomatis</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">3</span><div><strong>Kurir mengantar</strong><span>Notifikasi masuk saat dijemput &amp; sampai</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">4</span><div><strong>Masukkan OTP</strong><span>Buka menu “Konfirmasi OTP” → klik konfirmasi terima</span></div></div>
    </div>
  </div>
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
      ${locationSelectHtml({
        label: 'Lokasi penyaluran',
        hint: 'Pilih kota/kabupaten atau GPS agar muncul di peta & rute',
      })}
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
  const withOtp = await Promise.all(
    ready.map(async (m) => {
      let otp = null;
      try {
        otp = await api(`/api/deliveries/${m.id}/otp-status`);
      } catch (_) {}
      return { ...m, otpInfo: otp };
    })
  );
  return `
  ${pageHead(
    'Konfirmasi OTP',
    'Masukkan kode 6 digit dari kurir/notifikasi untuk konfirmasi serah terima'
  )}
  <div class="card">
    <div class="card-head"><h2>Alur serah terima</h2></div>
    <div class="flow-explain">
      <div class="flow-explain-item"><span class="flow-num">1</span><div><strong>Kurir jemput surplus</strong><span>Foto kondisi makanan diunggah kurir</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">2</span><div><strong>Kurir antar ke Anda</strong><span>Status berubah jadi “sampai di lokasi”</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">3</span><div><strong>OTP muncul di sini</strong><span>Kode 6 digit tampil di kartu konfirmasi di bawah (juga dikirim ke notifikasi &amp; WhatsApp/email bila aktif)</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">4</span><div><strong>Konfirmasi terima</strong><span>Klik konfirmasi → transaksi selesai &amp; tercatat di audit</span></div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Menunggu konfirmasi</h2></div>
    ${withOtp.length === 0 ? '<div class="empty">Belum ada kiriman menunggu konfirmasi OTP.</div>' : withOtp.map((m) => {
      const code = m.otpInfo?.code && !m.otpInfo.used_at ? m.otpInfo.code : null;
      const expired = m.otpInfo?.expires_at && new Date(m.otpInfo.expires_at).getTime() < Date.now();
      return `
      <div class="notif unread">
        <div class="spread">
          <div>
            <div class="notif-title">${esc(m.listing_name)} — ${m.portions} porsi ${foodTypeTag(m.food_type)}</div>
            <span class="muted">Dari ${esc(m.donor_name)} · Kurir ${esc(m.courier_name)}</span>
          </div>
          ${statusTag(m.status)}
        </div>
        ${flowStepsHtml(m.status)}
        ${
          code && !expired
            ? `<div class="otp-box">
                <div class="otp-label">Kode OTP Anda</div>
                <div class="otp-code">${esc(code)}</div>
                <div class="muted">Berlaku s/d ${fmtDate(m.otpInfo.expires_at)}</div>
              </div>`
            : `<div class="otp-box otp-box-wait">
                <div class="otp-label">Kode OTP</div>
                <div class="muted">${m.otpInfo?.used_at ? 'Sudah dipakai' : expired ? 'Kedaluwarsa — minta kurir jemput ulang' : 'Belum dibuat — menunggu kurir mengunggah foto & menjemput'}</div>
              </div>`
        }
        <div class="row" style="margin-top:10px">
          <input style="max-width:200px;margin:0" id="otp-${m.id}" placeholder="6 digit OTP" maxlength="6" inputmode="numeric" value="${code && !expired ? esc(code) : ''}" />
          <button class="btn btn-sm" type="button" id="verifyBtn-${m.id}" data-verify="${m.id}">${icon('check', 14)} Konfirmasi terima</button>
        </div>
      </div>`;
    }).join('')}
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
    <div class="card-head"><h2>Alur kurir</h2></div>
    <div class="flow-explain">
      <div class="flow-explain-item"><span class="flow-num">1</span><div><strong>Terima tugas</strong><span>Muncul setelah admin jalankan AI Matching — lihat rute di Peta GIS</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">2</span><div><strong>Foto &amp; jemput</strong><span>Wajib unggah foto kondisi makanan → OTP dikirim ke penerima</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">3</span><div><strong>Antar &amp; tandai sampai</strong><span>Klik “Tandai sampai di lokasi” setelah tiba</span></div></div>
      <div class="flow-explain-item"><span class="flow-num">4</span><div><strong>Penerima masukkan OTP</strong><span>Status jadi selesai — Anda dapat tugas berikutnya</span></div></div>
    </div>
  </div>
  <div class="card">
    <div class="card-head"><h2>Tugas aktif</h2></div>
    ${active.length === 0 ? '<div class="empty"><div class="empty-title">Belum ada tugas</div>Minta admin menjalankan pencocokan AI.</div>' : active.map((m) => {
      const route = m.route;
      return `
      <div class="notif unread">
        <div class="spread">
          <div>
            <div class="notif-title">Pencocokan #${m.id}: ${esc(m.listing_name)} — ${m.portions} porsi ${foodTypeTag(m.food_type)}</div>
            <span class="muted">Untuk ${esc(m.need_title)} (${esc(m.recipient_name)}) · Urgensi ${m.urgency} · Skor ${m.score_percent ?? ''}%</span>
          </div>
          ${statusTag(m.status)}
        </div>
        ${flowStepsHtml(m.status)}
        ${m.food_type === 'wet' || m.food_type === 'dry' ? sopHtml(m.food_type, { compact: true }) : ''}
        ${route ? `
        <div style="margin-top:12px">
          <div class="spread" style="margin-bottom:6px">
            <strong style="font-size:13px">${icon('route', 14)} Rute pengantaran</strong>
            <span class="muted">${route.total_distance_km} km · ± ${route.total_duration_min} menit</span>
          </div>
          ${route.waypoints.map((w) => `<div class="route-step">${esc(w.label)} <span class="muted">(${w.lat}, ${w.lng})</span></div>`).join('')}
          <p class="muted" style="margin-top:6px">Tahap: ${route.legs.map((l) => `${l.from}→${l.to}: ${l.distance_km} km / ${l.duration_min} mnt`).join(' · ')}</p>
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
                <button class="btn btn-sm" type="submit">${icon('upload', 14)} Foto &amp; jemput</button>
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
    'Pembaruan pencocokan, penjemputan, dan status serah terima',
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

/* Nav tabs (delegasi — selalu aktif walau renderNav ulang) */
document.addEventListener('click', (ev) => {
  const tabBtn = ev.target.closest('[data-tab]');
  if (tabBtn && document.getElementById('nav')?.contains(tabBtn)) {
    setTab(tabBtn.dataset.tab);
  }
});

/* Logout */
document.getElementById('topbarLogout')?.addEventListener('click', () => logout());
document.getElementById('sidebar')?.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-logout]')) logout();
});

/* Theme toggle */
document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
document.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-theme-toggle]')) toggleTheme();
});
applyTheme(getTheme());

setInterval(async () => {
  if (!token || !me) return;
  if (currentTab === 'notif') renderView();
}, 10000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const urlTab = new URLSearchParams(location.search).get('tab');
if (urlTab && token && me) currentTab = urlTab;

render();
applyTheme(getTheme());