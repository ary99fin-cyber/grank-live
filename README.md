# Google Rank Monitor — SERP version

Versi ini **tidak memakai Google Search Console**, jadi domain yang dipantau tidak perlu menjadi milik Anda dan tidak perlu verifikasi DNS.

Contoh default:

- Keyword: `panen togel`
- Domain: `panentogel.com`
- Device: `mobile`
- Country/language: Indonesia (`id`)
- Maksimum hasil yang diperiksa: 100

## Cara kerja

GitHub Actions menjalankan request setiap jam -> endpoint Vercel `/api/sync` -> SearchAPI.io Google Rank Tracking API -> posisi domain dicari pada hasil organic -> snapshot disimpan ke Supabase -> dashboard mengambil histori lewat `/api/data`.

> Penting: SERP API memberi snapshot pencarian non-personal. Hasil di HP pribadi masih dapat berbeda karena lokasi, akun, histori pencarian, eksperimen Google, dan personalisasi.

## 1. Jalankan ulang schema di Supabase

Karena Anda sebelumnya sudah memakai schema versi Search Console, buka:

**Supabase -> SQL Editor -> New query**

Paste seluruh isi `schema.sql` versi baru lalu klik **Run**.

Schema ini aman dijalankan ulang. Ia menambahkan kolom SERP dan membuat `position` boleh kosong ketika domain tidak ditemukan.

## 2. Buat API key SearchAPI.io

Buka:

https://www.searchapi.io/

Buat akun dan ambil API key. Simpan key tersebut. Jangan upload API key ke GitHub.

Dokumentasi endpoint yang dipakai:

https://www.searchapi.io/docs/google-rank-tracking-api

Endpoint tersebut mendukung Google rank tracking hingga 100 organic result serta parameter mobile/location.

## 3. Deploy repository ke Vercel

Pastikan repository GitHub Anda terhubung ke project Vercel.

Di Vercel buka:

**Project -> Settings -> Environment Variables**

Tambahkan variabel berikut:

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxx
SEARCHAPI_KEY=API_KEY_DARI_SEARCHAPI
TARGET_QUERY=panen togel
TARGET_DOMAIN=panentogel.com
SERP_DEVICE=mobile
SERP_COUNTRY=id
SERP_LANGUAGE=id
SERP_LOCATION=Indonesia
SERP_NUM_RESULTS=100
CRON_SECRET=buat-random-string-panjang
```

Setelah menyimpan environment variables, lakukan **Redeploy**.

## 4. Test manual endpoint sync

Endpoint `/api/sync` dilindungi `CRON_SECRET`, jadi jangan membuka URL itu biasa dari browser.

Cara paling mudah adalah melalui GitHub Actions setelah secret selesai dibuat pada langkah berikut.

## 5. GitHub Actions setiap jam

Di GitHub repo buka:

**Settings -> Secrets and variables -> Actions -> New repository secret**

Buat 2 secret:

### VERCEL_APP_URL

Isi URL production Vercel, contoh:

```text
https://grank-live.vercel.app
```

### CRON_SECRET

Harus sama persis dengan `CRON_SECRET` yang Anda masukkan ke Vercel.

Workflow `.github/workflows/hourly-sync.yml` sudah disiapkan dan berjalan sekitar menit ke-7 setiap jam.

Untuk tes pertama:

**GitHub -> Actions -> Hourly Google Rank Sync -> Run workflow**

Jika sukses, buka URL website Vercel dan tekan Refresh.

## 6. Tentang quota gratis

SearchAPI.io menyediakan jumlah request gratis terbatas untuk mencoba layanan. Jika dicek setiap jam, 1 keyword membutuhkan sekitar 24 request/hari atau sekitar 720 request/bulan. Jadi free trial tidak cukup untuk pemakaian setiap jam dalam jangka panjang.

Tujuan versi ini adalah pertama-tama mengecek apakah hasil mobile/Indonesia lebih cocok dengan Google yang Anda lihat. Setelah hasil sudah cocok, provider dapat diganti tanpa mengubah frontend/Supabase.

## File penting

```text
index.html                 dashboard
style.css                  tampilan
app.js                     frontend
api/data.js                baca Supabase
api/sync.js                jalankan pengecekan SERP
lib/searchapi.js           koneksi SearchAPI.io + pencocokan domain
lib/supabase.js            koneksi Supabase
schema.sql                 schema/migrasi database
.github/workflows/...      trigger tiap jam
.env.example               contoh environment variables
```

## Keamanan

Jangan pernah commit ke GitHub:

- `SEARCHAPI_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

Semua secret hanya dimasukkan melalui Vercel Environment Variables / GitHub Actions Secrets.
