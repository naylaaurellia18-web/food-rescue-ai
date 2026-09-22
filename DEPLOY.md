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
> Mode **full demo** (lokal): `npm run seed -- --force --full` — isi akun donor/penerima/kurir + contoh data di **Madura**.

---

## 🗑️ Reset Total di Turso (web jadi baru / belum pernah diisi)

1. Buka **https://app.turso.tech** → pilih database `food-rescue-ai`
2. Buka tab **SQL** / **Console**
3. Salin **seluruh isi** file [`server/reset-turso.sql`](./server/reset-turso.sql) → **Run**
4. Hasil query terakhir harus `0` di semua kolom
5. Buka URL Vercel sekali (`/api/health`) atau **Redeploy** → app auto-seed **hanya admin**
6. Selesai — web fresh, siap diisi dari nol (fokus **Madura, Jawa Timur**)

---

## 🗺️ Peta GIS

Menu sidebar **Peta GIS** memakai **Leaflet + OpenStreetMap** (gratis, tanpa API key):
- Fokus peta: **Madura** (Bangkalan · Sampang · Pamekasan · Sumenep)
- Marker: Donor (biru), Penerima (merah), Kurir (oranye), Surplus (hijau)
- Polyline putus-putus: rute pengantaran hasil AI Matching

Saat registrasi/input, isi **lat/lng** contoh Madura:

| Wilayah | Latitude | Longitude |
|---------|----------|-----------|
| Bangkalan | -7.03 | 112.74 |
| Sampang | -7.15 | 113.25 |
| Pamekasan | -7.16 | 113.48 |
| Sumenep | -6.99 | 113.83 |

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
