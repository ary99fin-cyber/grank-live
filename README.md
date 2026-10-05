# Google Rank Monitor — GitHub + Vercel + Supabase + Search Console

Starter project untuk memantau **average position** keyword dari **Google Search Console API**.
Default contoh project ini:

- Keyword: `panen togel`
- Domain: `panentogel.com`
- Device: `MOBILE`
- Country: `IDN`
- Sinkronisasi: tiap jam melalui GitHub Actions

> Penting: Search Console tidak memberi snapshot SERP real-time seperti membuka Google di satu HP. Nilai `position` adalah **average position** berdasarkan impression nyata dan data terbaru bisa terlambat beberapa jam.

## 1. Upload ke GitHub

Upload seluruh isi folder ini ke repository GitHub. Jangan upload file `.env` atau JSON private key Google.

## 2. Siapkan Supabase

1. Buka project Supabase.
2. Masuk **SQL Editor**.
3. Copy seluruh isi `schema.sql`, lalu **Run**.
4. Buka **Connect** / **Settings → API Keys**.
5. Ambil:
   - Project URL → untuk `SUPABASE_URL`
   - Secret key `sb_secret_...` → untuk `SUPABASE_SECRET_KEY`
6. Secret key hanya dipasang di Vercel, jangan pernah dimasukkan ke `index.html` atau `app.js`.

## 3. Pastikan domain ada di Google Search Console

Tambahkan/verifikasi `panentogel.com` di Google Search Console terlebih dahulu.

Jika memakai **Domain property**, nilai environment nanti:

```text
GSC_SITE_URL=sc-domain:panentogel.com
```

Jika memakai **URL-prefix property**, contohnya:

```text
GSC_SITE_URL=https://panentogel.com/
```

Nilainya harus sama persis dengan property yang ada di Search Console.

## 4. Buat Google Cloud project + service account

Tidak perlu menaruh kartu kredit untuk kode project ini.

1. Buka Google Cloud Console.
2. Buat/select project.
3. Enable **Google Search Console API**.
4. Buka **IAM & Admin → Service Accounts**.
5. Buat service account, misalnya `gsc-rank-monitor`.
6. Buat **JSON key** untuk service account tersebut.
7. Dari file JSON, ambil:
   - `client_email`
   - `private_key`
8. Di Google Search Console, tambahkan email service account tadi ke property `panentogel.com` dengan izin yang mencukupi (paling mudah sebagai owner/delegated owner untuk setup awal).

JANGAN upload file JSON tersebut ke GitHub.

## 5. Deploy GitHub repo ke Vercel

Import repo GitHub tadi ke Vercel.

Di **Vercel → Project → Settings → Environment Variables**, buat:

```text
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SECRET_KEY=sb_secret_xxxxx
GOOGLE_CLIENT_EMAIL=gsc-rank-monitor@xxxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
GSC_SITE_URL=sc-domain:panentogel.com
TARGET_QUERY=panen togel
TARGET_DOMAIN=panentogel.com
GSC_DEVICE=MOBILE
GSC_COUNTRY=IDN
CRON_SECRET=buat-string-random-yang-panjang
```

Untuk `GOOGLE_PRIVATE_KEY`, copy nilai private key dan pastikan line break berbentuk `\n` jika Vercel menyimpannya dalam satu baris.

Lalu **Redeploy**.

## 6. Test sinkronisasi manual

Karena `/api/sync` dilindungi secret, test dengan terminal:

```bash
curl -H "Authorization: Bearer ISI_CRON_SECRET" \
  https://NAMA-PROJECT.vercel.app/api/sync
```

Jika berhasil, respons kira-kira:

```json
{
  "ok": true,
  "inserted_or_updated": 12,
  "latest": {
    "position": 4.2
  }
}
```

Kalau `inserted_or_updated` = 0, itu tidak selalu error. Bisa berarti Google belum punya impression terbaru untuk keyword + device + negara tersebut.

## 7. Aktifkan sinkronisasi tiap jam dari GitHub

Project sudah berisi:

```text
.github/workflows/hourly-sync.yml
```

Di GitHub repository buka:

**Settings → Secrets and variables → Actions → New repository secret**

Tambahkan dua secret:

### `VERCEL_APP_URL`

Contoh:

```text
https://nama-project.vercel.app
```

### `CRON_SECRET`

Harus sama persis dengan `CRON_SECRET` di Vercel.

Setelah itu buka tab **Actions**, pilih **Hourly Google Rank Sync**, lalu klik **Run workflow** untuk tes pertama.

Workflow dijadwalkan pada menit ke-7 setiap jam (`7 * * * *`). GitHub schedule tidak menjamin detik/menit yang benar-benar presisi, tetapi cocok untuk update sekitar tiap jam.

## 8. Buka dashboard

Buka domain Vercel kamu. Dashboard akan menampilkan:

- Keyword
- Domain
- Average position terbaru
- Perubahan dibanding titik data sebelumnya
- Impression
- Clicks / CTR
- Device + negara
- Riwayat posisi
- Waktu data Google
- Waktu sinkronisasi terakhir

Frontend otomatis refresh setiap 60 detik, tetapi data Google hanya berubah ketika Search Console sudah punya data baru dan job sinkronisasi mengambilnya.

## Troubleshooting

### `User does not have sufficient permission for site`

Biasanya `GOOGLE_CLIENT_EMAIL` belum diberi akses ke property Search Console, atau `GSC_SITE_URL` tidak sama persis dengan property.

### `Belum ada data impression`

Coba sementara kosongkan `GSC_DEVICE` dan `GSC_COUNTRY` di Vercel untuk memperluas data. Jika setelah itu muncul, berarti kombinasi `MOBILE + IDN` memang belum punya impression di periode terbaru.

### Private key error

Pastikan environment `GOOGLE_PRIVATE_KEY` memiliki header/footer private key dan `\n` yang benar.

### Vercel Hobby

Project ini sengaja **tidak** memakai Vercel Cron per jam. Vercel Hobby membatasi cron menjadi sekali per hari, jadi jadwal hourly dijalankan oleh GitHub Actions dan hanya memanggil endpoint Vercel yang dilindungi `CRON_SECRET`.
