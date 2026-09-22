# Food Rescue AI — Panduan Deploy (Render)

## ▶️ Jalankan Lokal

```powershell
cd C:\Users\nuy07\food-rescue-ai
npm install
npm start
```

Buka **http://localhost:3000**

**Akun demo:**

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@foodrescue.id | admin123 |
| Donor | donor@foodrescue.id | donor123 |
| Penerima | penerima@foodrescue.id | penerima123 |
| Kurir | kurir@foodrescue.id | kurir123 |

Database SQLite otomatis dibuat + di-seed saat pertama jalan (jika `data/food_rescue.db` kosong).

---

## 🚀 Deploy ke Render (Gratis)

### Prasyarat
- Akun [GitHub](https://github.com)
- Akun [Render](https://render.com) (bisa daftar pakai GitHub)

### Langkah 1 — Push ke GitHub

Dari folder proyek:

```powershell
cd C:\Users\nuy07\food-rescue-ai
git add -A
git commit -m "Food Rescue AI: AI Matching + GIS"
```

Buat repo baru di GitHub (https://github.com/new), lalu:

```powershell
git remote add origin https://github.com/USERNAME/food-rescue-ai.git
git branch -M main
git push -u origin main
```

> Ganti `USERNAME` dengan username GitHub-mu.  
> Jika diminta login, gunakan **Personal Access Token** (bukan password) — buat di GitHub → Settings → Developer settings → Personal access tokens.

### Langkah 2 — Buasi Service di Render

1. Buka https://dashboard.render.com → **New +** → **Web Service**
2. Connect repo `food-rescue-ai`
3. Isi:
   - **Name**: `food-rescue-ai` (atau bebas)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free
4. Di bagian **Environment**, tambahkan:
   - `JWT_SECRET` → klik **Generate** (atau isi string acak panjang)
   - `NODE_ENV` → `production`
5. Klik **Create Web Service**
6. Tunggu build 1–2 menit → dapat URL seperti  
   `https://food-rescue-ai-xxxx.onrender.com`

> `render.yaml` di root repo sudah memuat konfigurasi di atas — Render bisa deteksi otomatis via **New + → Blueprint**.

### Langkah 3 — Verifikasi

Buka URL Render → login admin → jalankan AI Matching.

---

## ⚠️ Catatan Penting (Render Free + SQLite)

| Isu | Penjelasan | Solusi |
|-----|------------|--------|
| DB ephemeral | Filesystem Render free **hilang saat redeploy/restart** | Data demo di-seed ulang otomatis. Untuk tugas kuliah biasanya cukup. |
| Upload foto hilang | `uploads/` juga ephemeral | Sama — untuk demo OK. |
| Ingin data permanen | Butuh persistent disk (paid) atau pindah PostgreSQL | Opsional di luar scope tugas |

Untuk **demo tugas kuliah**, seed otomatis saat server start sudah cukup — setiap deploy selalu ada data segar.

---

## 🗄️ Lokasi Database (Lokal)

```
C:\Users\nuy07\food-rescue-ai\data\food_rescue.db
```

Bisa dibuka dengan [DB Browser for SQLite](https://sqlitebrowser.org/):

Tabel: `users`, `food_listings`, `food_needs`, `matches`, `otp_codes`, `notifications`, `audit_logs`

Reset data demo:

```powershell
npm run seed -- --force
```
