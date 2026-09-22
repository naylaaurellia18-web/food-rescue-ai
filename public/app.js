const API = '';
let token = localStorage.getItem('frai_token') || '';
let me = JSON.parse(localStorage.getItem('frai_user') || 'null');
let currentTab = '';

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
  render();
}

const NAV = {
  admin: [
    ['dashboard', 'Dashboard'], ['users', 'Pengguna'], ['matches', 'Matching'],
    ['logs', 'Audit Log'], ['notif', 'Notifikasi'],
  ],
  donor: [['donor', 'Input Surplus'], ['donor-listings', 'Listing Saya'], ['donor-matches', 'Match Saya'], ['notif', 'Notifikasi']],
  recipient: [['recipient', 'Kebutuhan'], ['recipient-matches', 'Konfirmasi OTP'], ['notif', 'Notifikasi']],
  courier: [['courier', 'Tugas Kurir'], ['notif', 'Notifikasi']],
};

function setTab(t) {
  currentTab = t;
  renderView();
}

function render() {
  const topbar = document.getElementById('topbar');
  const view = document.getElementById('view');

  if (!token || !me) {
    topbar.hidden = true;
    view.innerHTML = renderAuth();
    bindAuth();
    return;
  }

  topbar.hidden = false;
  document.getElementById('userName').textContent = me.name;
  document.getElementById('userRole').textContent = me.role;

  const tabs = NAV[me.role] || [];
  if (!currentTab || !tabs.find((t) => t[0] === currentTab)) currentTab = tabs[0][0];
  document.getElementById('nav').innerHTML = tabs
    .map(([id, label]) => `<button class="${currentTab === id ? 'active' : ''}" onclick="setTab('${id}')">${label}</button>`)
    .join('');

  renderView();
}

async function renderView() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty">Memuat…</div>';
  try {
    const renderers = {
      dashboard: renderAdminDashboard,
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
    if (fn) bindView();
  } catch (e) {
    view.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

function bindView() {
  const forms = document.querySelectorAll('form[data-action]');
  forms.forEach((f) => {
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const action = f.dataset.action;
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
        const isForm = btn.dataset.form;
        let body, multipart = btn.dataset.multipart === '1';
        if (isForm) {
          const fd = new FormData(document.getElementById(isForm));
          body = fd;
        } else {
          body = btn.dataset.body ? JSON.parse(btn.dataset.body) : {};
        }
        const res = await api(btn.dataset.post, {
          method: btn.dataset.method || 'POST',
          body: multipart ? body : body,
          headers: multipart ? {} : undefined,
        });
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

function renderAuth() {
  return `
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>🥗 Food Rescue AI</h1>
      <p class="sub">Platform redistribusi surplus makanan berbasis AI Matching &amp; GIS</p>
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
        <input name="name" required placeholder="Contoh: Hotel Melati" />
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
        <input name="address" placeholder="Jl. ..." />
        <div class="grid grid-2">
          <div><label>Latitude</label><input name="lat" type="number" step="any" placeholder="-6.2" /></div>
          <div><label>Longitude</label><input name="lng" type="number" step="any" placeholder="106.8" /></div>
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
      <p class="muted" style="margin-top:16px">Demo: admin@foodrescue.id / admin123</p>
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

async function renderAdminDashboard() {
  const s = await api('/api/admin/stats');
  const runs = s.performance.last_matching_runs || [];
  return `
  <div class="card">
    <div class="spread">
      <h2>📊 Dashboard Monitoring (FR-09)</h2>
      <button class="btn" data-post="/api/matches/run">▶ Jalankan AI Matching (FR-04)</button>
    </div>
    <p class="muted">Target: matching &lt; 3.000 ms — last run: ${runs[0]?.duration_ms ?? '-'} ms ${s.performance.all_under_target ? '✅' : ''}</p>
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
        <tr><td>Admin</td><td>${s.users.total - s.users.donors - s.users.recipients - s.users.couriers}</td></tr>
      </table>
    </div>
    <div class="card">
      <h2>Status Listing &amp; Kebutuhan</h2>
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
      <tr><th>Waktu</th><th>Kandidat (L/N/C)</th><th>Dibuat</th><th>Durasi (ms)</th></tr>
      ${runs.map(r => `<tr><td>-</td><td>${r.candidates_listings ?? '-'}/${r.candidates_needs ?? '-'}/${r.candidates_couriers ?? '-'}</td><td>${r.created ?? '-'}</td><td>${r.duration_ms ?? '-'}</td></tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderAdminUsers() {
  const users = await api('/api/admin/users');
  return `
  <div class="card">
    <h2>👥 Kelola Pengguna (FR-10)</h2>
    <table>
      <tr><th>Nama</th><th>Email</th><th>Role</th><th>Status</th><th>Lokasi</th><th>Aksi</th></tr>
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
    </table>
  </div>`;
}

async function renderAdminMatches() {
  const rows = await api('/api/admin/matches');
  return `
  <div class="card">
    <div class="spread">
      <h2>🤖 Hasil AI Matching (FR-04)</h2>
      <button class="btn" data-post="/api/matches/run">▶ Jalankan Matching</button>
    </div>
    ${rows.length === 0 ? '<div class="empty">Belum ada match. Jalankan AI Matching.</div>' : `
    <table>
      <tr><th>#</th><th>Surplus → Kebutuhan</th><th>Kurir</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      ${rows.map(m => `
      <tr>
        <td>${m.id}</td>
        <td><b>${esc(m.listing_name)}</b> (${m.portions} porsi)<br>→ ${esc(m.need_title)} ${statusTag(m.urgency)}<br><span class="muted">Donor: ${esc(m.donor_name)} | Penerima: ${esc(m.recipient_name)}</span></td>
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
  <div class="card">
    <h2>📜 Audit Log Immutable (tidak bisa di-update/dihapus)</h2>
    <table>
      <tr><th>ID</th><th>Waktu</th><th>User</th><th>Aksi</th><th>Entity</th><th>Detail</th></tr>
      ${logs.map(l => `
      <tr>
        <td>${l.id}</td>
        <td class="muted">${fmtDate(l.created_at)}</td>
        <td>${esc(l.user_name || 'system')}<br><span class="muted">${esc(l.user_role || '')}</span></td>
        <td><code>${esc(l.action)}</code></td>
        <td>${esc(l.entity)}${l.entity_id ? '#' + esc(l.entity_id) : ''}</td>
        <td class="muted" style="max-width:280px;word-break:break-all">${l.detail ? esc(l.detail) : '-'}</td>
      </tr>`).join('')}
    </table>
  </div>`;
}

function renderDonorForm() {
  return `
  <div class="card">
    <h2>📦 Input Surplus Makanan (FR-02)</h2>
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
        <div><label>Latitude (opsional)</label><input name="lat" type="number" step="any" placeholder="-6.2247" /></div>
        <div><label>Longitude (opsional)</label><input name="lng" type="number" step="any" placeholder="106.8296" /></div>
      </div>
      <label>Foto Kondisi Makanan</label>
      <input name="photo" type="file" accept="image/*" />
      <button class="btn" type="submit">Simpan Surplus</button>
    </form>
  </div>`;
}

async function renderDonorListings() {
  const rows = await api('/api/food');
  return `
  <div class="card">
    <h2>Daftar Listing Saya</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada listing</div>' : `
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
  <div class="card">
    <h2>Match Surplus Saya</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada match — tunggu admin menjalankan AI Matching</div>' : `
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
  <div class="card">
    <h2>🙏 Update Kebutuhan Pangan (FR-03)</h2>
    <form data-action="1" data-endpoint="/api/needs">
      <label>Judul Kebutuhan</label>
      <input name="title" required placeholder="Makan malam anak yatim" />
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
        <div><label>Latitude lokasi (opsional)</label><input name="lat" type="number" step="any" /></div>
        <div><label>Longitude lokasi (opsional)</label><input name="lng" type="number" step="any" /></div>
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
    ${rows.length === 0 ? '<div class="empty">Belum ada kebutuhan</div>' : `
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
  <div class="card">
    <h2>🔐 Konfirmasi Penerimaan via OTP (FR-08)</h2>
    ${ready.length === 0 ? '<div class="empty">Belum ada kiriman menunggu konfirmasi OTP</div>' : ready.map((m) => `
      <div class="notif">
        <div class="spread">
          <div>
            <b>${esc(m.listing_name)}</b> — ${m.portions} porsi<br>
            <span class="muted">Dari: ${esc(m.donor_name)} · Kurir: ${esc(m.courier_name)} · ${statusTag(m.status)}</span>
          </div>
        </div>
        <div class="row" style="margin-top:10px">
          <input style="max-width:180px;margin:0" id="otp-${m.id}" placeholder="Masukkan 6 digit OTP" maxlength="6" />
          <button class="btn btn-sm" id="verify-${m.id}" data-match="${m.id}">Konfirmasi Terima</button>
        </div>
        <p class="muted" style="margin-top:6px">OTP dikirim via notifikasi (demo simulasi WhatsApp Gateway)</p>
      </div>`).join('')}
  </div>
  <div class="card">
    <h2>Riwayat Kiriman</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada kiriman</div>' : `
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
  <div class="card">
    <h2>🚚 Tugas Aktif (FR-05 GIS · FR-07 Foto · FR-08 OTP)</h2>
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
              <label>📷 Foto kondisi makanan (FR-07, wajib)</label>
              <input type="file" name="photo" accept="image/*" required style="margin:0" />
              <button class="btn btn-sm" type="submit" style="margin-top:8px">Upload &amp; Pickup</button>
            </form>
          ` : ''}
          ${m.status === 'picked_up' ? `
            <button class="btn btn-sm" data-post="/api/deliveries/${m.id}/deliver">Tandai Sampai di Lokasi</button>
          ` : ''}
          ${m.status === 'delivered' ? `<span class="muted">Menunggu penerima memasukkan OTP…</span>` : ''}
          ${m.photo_path ? `<img class="thumb" src="${m.photo_path}" alt="Foto serah terima" />` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>
  <div class="card">
    <h2>Riwayat Tugas</h2>
    ${rows.length === 0 ? '<div class="empty">Belum ada riwayat</div>' : `
    <table>
      <tr><th>#</th><th>Surplus</th><th>Penerima</th><th>Skor</th><th>Jarak</th><th>Status</th></tr>
      ${rows.map(m => `<tr><td>${m.id}</td><td>${esc(m.listing_name)}</td><td>${esc(m.recipient_name)}</td><td>${m.score_percent ?? ''}%</td><td>${m.distance_km} km</td><td>${statusTag(m.status)}</td></tr>`).join('')}
    </table>`}
  </div>`;
}

async function renderNotif() {
  const rows = await api('/api/notifications');
  return `
  <div class="card">
    <div class="spread">
      <h2>🔔 Notifikasi Real-time (FR-06)</h2>
      <button class="btn btn-outline btn-sm" data-post="/api/notifications/read-all">Tandai semua dibaca</button>
    </div>
    ${rows.length === 0 ? '<div class="empty">Belum ada notifikasi</div>' : rows.map((n) => `
      <div class="notif ${n.read_at ? '' : 'unread'}">
        <b>${esc(n.title)}</b>
        <p>${esc(n.message)}</p>
        <span class="muted">${fmtDate(n.created_at)}</span>
        ${n.read_at ? '' : ` <button class="btn btn-sm btn-outline" data-post="/api/notifications/${n.id}/read">Tandai dibaca</button>`}
      </div>`).join('')}
  </div>`;
}

setInterval(async () => {
  if (!token || !me) return;
  if (currentTab === 'notif') renderView();
}, 10000);

render();
