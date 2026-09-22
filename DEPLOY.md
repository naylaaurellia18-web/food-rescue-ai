# Food Rescue AI — Deploy ke Vercel (Gratis, tanpa kartu)

## Arsitektur

| Layer | Lokal | Online (Vercel) |
|-------|-------|-----------------|
| Runtime | Node.js | Vercel Serverless (Node) |
| Database | SQLite `data/food_rescue.db` | **Turso** (SQLite cloud, gratis) |
| Static | `public/` | `public/` via Vercel |
| Foto | Base64 di database | Base64 di database (persist) |

App otomatis pindah ke Turso jika env `TURSO_DATABASE_URL` terisi.

---

## 1. Buat Database Turso (gratis, ~2 menit)

1. Buka **https://app.turso.tech** → **Sign in with GitHub**
2. Klik **Create Database**
   - Name: `food-rescue-ai`
   - Region: `ap-southeast-1` (Singapore) atau terdekat
3. Buka database → tab **Connect** / **Tokens**
4. Catat dua nilai ini:
   - **URL** → `libsql://food-rescue-ai-xxx.turso.io`
   - **Auth token** → string panjang `eyJ...` (kalau belum ada, klik **Create token** dulu)

Atau pakai CLI (opsional):
```bash
turso db create food-rescue-ai
turso db show food-rescue-ai --url
turso db tokens create food-rescue-ai
```

---

## 2. Deploy ke Vercel (tanpa kartu)

1. Buka **https://vercel.com** → **Sign up with GitHub**
2. Klik **Add New… → Project**
3. Import repo **`naylaaurellia18-web/food-rescue-ai`** → **Import**
4. Di **Environment Variables** isi:

   | Key | Value |
   |-----|-------|
   | `TURSO_DATABASE_URL` | URL Turso dari langkah 1 |
   | `TURSO_AUTH_TOKEN` | Auth token Turso |
   | `JWT_SECRET` | string acak panjang (bebas, mis. `rahasia-kuliah-2026-xxxx`) |

   **Notifikasi nyata (tanpa env tetap jalan mode simulasi):**

   | Key | Fungsi |
   |-----|--------|
   | `CALLMEBOT_APIKEY` | **WhatsApp (CallMeBot, gratis)** — lihat langkah di bawah |
   | `SMTP_HOST` | `smtp.gmail.com` (Gmail) |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | Email Gmail pengirim (mis. `naylaaurellia910@gmail.com`) |
   | `SMTP_PASS` | **App Password** Gmail (16 digit, bukan password login) |
   | `MAIL_FROM` | `Food Rescue AI <naylaaurellia910@gmail.com>` |
   | `NOTIFY_EMAIL` | Semua email notifikasi dikirim ke kotak masuk ini |
   | `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` | Alternatif gateway WA lain (jika tidak pakai CallMeBot) |

5. **Build & Deploy** → tunggu 1–2 menit
6. Dapat URL: `https://food-rescue-ai-xxx.vercel.app` 🎉

> **Pertama kali jalan:** app otomatis bikin tabel + isi data demo di Turso.

---

## 3. Verifikasi

Buka URL Vercel → login `admin@foodrescue.id` / `admin123` → jalankan AI Matching.

Cek health: `https://-URL-KAMU-/api/health`  
Harus: `{"status":"ok","db":"turso"}`

---

## 4. Jalankan Lokal (tetap bisa)

```powershell
cd C:\Users\nuy07\food-rescue-ai
npm install
npm start
```

http://localhost:3000 — pakai SQLite lokal (tanpa Turso).

Uji end-to-end:

```powershell
npm run test:e2e
```

---

## Akun Demo

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@foodrescue.id | admin123 |

> Mode **fresh** (default): hanya admin — web kosong, belum ada donor/listing/match.  
> Mode **full demo** (lokal): `npm run seed -- --force --full` — akun + listing/kebutuhan contoh di **Madiun**.  
> Mode **akun saja** (data bersih): `npm run seed:accounts` — hanya akun login, tanpa listing/match.  
> **Bersihkan data, akun tetap**: `npm run clean` — hapus listing, kebutuhan, match, notifikasi, audit; akun login tidak dihapus.

---

## 🗑️ Reset di Turso

Dua opsi di file [`server/reset-turso.sql`](./server/reset-turso.sql):

- **OPSI A — bersihkan data, akun login tetap**: hapus listing/kebutuhan/match/OTP/notifikasi/outbox, tapi `DELETE FROM users` dikomentari → akun login tetap ada.
- **OPSI B — reset total (web jadi baru)**: hapus semua termasuk users → web fresh, hanya admin saat auto-seed.

Langkah:

1. Buka **https://app.turso.tech** → pilih database `food-rescue-ai`
2. Buka tab **SQL** / **Console**
3. Pilih opsi di file SQL (aktifkan baris yang diinginkan, komentari yang lain) → salin → **Run**
4. Hasil query terakhir harus `0` di semua kolom
5. Buka URL Vercel sekali (`/api/health`) atau **Redeploy** → app auto-seed sesuai mode (OPSI B: hanya admin)
6. Selesai — fokus **Madiun, Jawa Timur**, marker peta hanya di area Madiun

Setelah reset, isi ulang nomor WA semua akun (sekali jalan) di SQL console Turso:

```sql
UPDATE users SET phone = '083847721511';
```

---

## 📲 Notifikasi Nyata (WhatsApp & Email)

### 1. WhatsApp — CallMeBot (gratis)

1. Buka **https://www.callmebot.com** → lihat nomor bot saat ini (contoh: `+34 611 01 16 37`)
2. **Simpan nomor itu** di kontak HP Anda
3. Dari WhatsApp HP Anda, kirim pesan: `I allow callmebot to send me messages`
4. Tunggu balasan: `API Activated... Your APIKEY is 123456` → catat APIKEY-nya
5. Isi env `CALLMEBOT_APIKEY=123456` (lokal: `.env` · online: Vercel → Environment Variables → Redeploy)

> Semua akun demo sudah bernomor `083847721511` — notifikasi WA masuk ke HP Anda.

### 2. Email — Gmail App Password

1. Buka **https://myaccount.google.com** → **Keamanan**
2. Aktifkan **Verifikasi 2 Langkah** (wajib sekali)
3. Cari **App passwords** → buat baru, nama bebas (mis. `Food Rescue`) → dapat password 16 digit
4. Isi env:

   | Key | Value |
   |-----|-------|
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | `naylaaurellia910@gmail.com` |
   | `SMTP_PASS` | app password 16 digit |
   | `MAIL_FROM` | `Food Rescue AI <naylaaurellia910@gmail.com>` |
   | `NOTIFY_EMAIL` | `naylaaurellia910@gmail.com` |

5. Redeploy (Vercel) atau restart `npm start` (lokal)

### 3. Cek status

Dashboard admin → kartu **Pesan outbox** menampilkan `WA aktif` / `Email aktif` bila env sudah terisi.
Menu **Pesan Terkirim** menampilkan status tiap pesan (`sent` = nyata, `simulated` = demo, `failed` = gagal + alasan).

---

## 🗺️ Peta GIS

Menu sidebar **Peta GIS** memakai **Leaflet + OpenStreetMap** (gratis, tanpa API key):
- Fokus peta: **Madiun saja** (Kota Madiun + kecamatan Kab. Madiun: Caruban · Mejayan · Balerejo · Dagangan · Dolopo · Geger · Saradan · Kartoharjo · Taman · Wungu · Sawahan)
- Lokasi dropdown = alamat akun demo = titik marker di peta (sama semua)
- Marker: Donor (biru), Penerima (merah), Kurir (oranye), Surplus (hijau)
- Polyline putus-putus: rute pengantaran hasil AI Matching

Saat registrasi/input, pilih lokasi dari dropdown (otomatis isi lat/lng):

| Wilayah | Latitude | Longitude |
|---------|----------|-----------|
| Kota Madiun | -7.62 | 111.53 |
| Caruban | -7.55 | 111.64 |
| Mejayan | -7.55 | 111.45 |
| Balerejo | -7.55 | 111.56 |
| Kartoharjo | -7.60 | 111.48 |
| Taman | -7.65 | 111.52 |

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| 500 di Vercel | Cek Environment Variables (terutama `TURSO_*`) di Vercel → Settings → Environment Variables → Redeploy |
| Tabel tidak ada | Hapus `TURSO_DATABASE_URL` → deploy ulang? Tidak — biarkan, app auto-create saat boot |
| Reset data demo | Turso dashboard → SQL: `DELETE FROM users;` dll, atau biarkan — cukup buat user baru |
| Foto terlalu besar | Limit upload 1 MB; foto disimpan base64 di kolom `photo_path` |
| Database lokal korup | Hapus `data/food_rescue.db*` lalu `npm start` (auto-seed) |

---

## Struktur Deploy

```
food-rescue-ai/
├── api/index.js        ← entry Vercel (export Express app)
├── vercel.json         ← config build + route
├── server/app.js       ← Express app (shared lokal & Vercel)
├── server/db.js        ← auto: Turso (cloud) / SQLite (lokal)
├── public/             ← SPA frontend
└── data/               ← SQLite lokal (tidak di-deploy)
```
