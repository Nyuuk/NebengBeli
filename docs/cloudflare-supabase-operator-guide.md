# Panduan Operator — Backup dan Restore NebengBeli ke Supabase

Panduan manual untuk pemilik/operator. Mulai dengan rehearsal ke **project Supabase staging yang kosong**, bukan project produksi.

## 1. Isi variable koneksi

`SOURCE_DATABASE_URL` adalah alamat koneksi PostgreSQL NebengBeli yang sedang dipakai di server k3s. Ambil nilainya dari Secret/secret manager yang dipakai workload backend, atau minta administrator cluster melihat secret tersebut secara lokal. Jangan mengirimkannya ke chat, menaruhnya di file repo, atau membagikannya ke GitHub Actions.

Bentuknya seperti ini (contoh placeholder, bukan nilai asli):

```text
postgresql://<USER>:<PASSWORD>@<HOST>:<PORT>/<DATABASE>?sslmode=require
```

Isinya:

- `<USER>`: user PostgreSQL aplikasi.
- `<PASSWORD>`: password database; karakter khusus URL harus di-percent-encode.
- `<HOST>` dan `<PORT>`: alamat dan port PostgreSQL yang dapat dijangkau dari mesin tempat command backup dijalankan. Jika backup dijalankan di dalam jaringan k3s, gunakan alamat service PostgreSQL internal yang benar.
- `<DATABASE>`: nama database; berdasarkan prompt yang kamu kirim sebelumnya kemungkinan `nebengbeli_prod`, tetapi cek konfigurasi aktual sebelum menjalankan.
- `sslmode`: gunakan sesuai konfigurasi server; jangan tambahkan `require` jika sumber tidak mendukung TLS.

`TARGET_DATABASE_URL` adalah connection string project **Supabase staging** tujuan restore. Buka Supabase Dashboard → project staging → **Connect** → pilih **Direct connection** untuk `pg_dump`/`pg_restore`. Bila koneksi langsung tidak tersedia dari jaringanmu, pilih **Session pooler** dan salin host, port, username, dan nama database dari Dashboard. Jangan gunakan **Transaction pooler** untuk dump/restore. Ganti placeholder password dengan database password staging; jangan mengetik password ke dokumen.

Contoh bentuk Supabase (placeholder saja):

```text
postgresql://postgres:<PASSWORD>@db.<PROJECT-REF>.supabase.co:5432/postgres
```

Direct connection Supabase menggunakan IPv6 secara default. Jika jaringan operator hanya IPv4, gunakan Session pooler string yang diberikan Dashboard (port 5432). Password yang mengandung `@`, `#`, `?`, `/`, `:` atau karakter reserved lain harus di-percent-encode sebelum menjadi bagian URL. Copy connection string dari Dashboard, bukan menebak host/username.

### Cara set variable dengan aman

Jalankan di shell lokal tepercaya yang digunakan untuk backup. Input password lewat prompt tersembunyi agar tidak tersimpan pada history. Isi bagian host/user/db sesuai konfigurasi aktual:

```bash
read -r -p 'Source host: ' SRC_HOST
read -r -p 'Source port [5432]: ' SRC_PORT
SRC_PORT=${SRC_PORT:-5432}
read -r -p 'Source database [nebengbeli_prod]: ' SRC_DB
SRC_DB=${SRC_DB:-nebengbeli_prod}
read -r -p 'Source user: ' SRC_USER
read -r -s -p 'Source password: ' SRC_PASS; printf '\n'
export SOURCE_DATABASE_URL="postgresql://${SRC_USER}:${SRC_PASS}@${SRC_HOST}:${SRC_PORT}/${SRC_DB}?sslmode=require"
unset SRC_PASS
```

Pastikan karakter khusus password sudah di-percent-encode. Jika sumber tidak memakai TLS, hapus `?sslmode=require` dari URL. Jangan `echo` atau `printf` URL lengkap untuk memeriksanya.

Untuk Supabase staging, copy connection string Dashboard lalu isi dengan prompt tersembunyi (password perlu URL-encoded):

```bash
read -r -s -p 'Supabase staging connection string: ' TARGET_DATABASE_URL; printf '\n'
export TARGET_DATABASE_URL
```

Catatan: input di atas tidak diecho oleh shell prompt biasa, tetapi bisa terekam oleh terminal/clipboard manager. Gunakan mesin dan terminal tepercaya; jangan screenshare saat mengisi. Variabel hanya berlaku di shell itu dan jangan tempel nilai ke chat.

## 2. Buat backup dari database sumber

Jalankan dari mesin yang punya PostgreSQL client tools (`pg_dump`, `pg_restore`, `psql`) dan akses jaringan ke database sumber. Pastikan versi `pg_dump` kompatibel dengan server. Simpan file di lokasi privat yang terenkripsi/dilindungi akses.

```bash
umask 077
pg_dump --format=custom --no-owner --no-acl \
  --file=nebengbeli-pre-migration.dump \
  "$SOURCE_DATABASE_URL"
```

Tujuan command: membuat dump PostgreSQL custom-format portabel tanpa ownership/privilege source yang Supabase tidak dapat/harus samakan. Ini pembacaan database saja, tidak mengubah data sumber.

Periksa archive dan checksum:

```bash
pg_restore --list nebengbeli-pre-migration.dump > nebengbeli-pre-migration.toc
sha256sum nebengbeli-pre-migration.dump
```

- `pg_restore --list`: memastikan file dump dapat dibaca dan mencatat objek yang ada.
- `sha256sum`: sidik jari untuk memastikan file yang disimpan/dipindahkan tidak berubah.
- Pastikan command selesai dengan exit code `0`, file dump tidak kosong, dan simpan checksum di catatan privat terpisah.
- Jangan commit, mengirim lewat Discord, atau mengunggah dump ke GitHub Actions artifact. Dump berisi data pengguna dan ledger.

## 3. Restore ke project Supabase staging yang kosong

Sebelum restore, pastikan project staging benar dan database-nya kosong. Jangan gunakan target produksi atau project yang sudah berisi data.

```bash
pg_restore --no-owner --no-acl --exit-on-error --single-transaction \
  --dbname="$TARGET_DATABASE_URL" \
  nebengbeli-pre-migration.dump
```

Tujuan command: mengimpor schema dan data dari dump ke database Supabase staging. `--exit-on-error` menghentikan proses pada error; `--single-transaction` membuat restore all-or-nothing bila server mendukung transaksi untuk seluruh objek. Jangan menambahkan `--clean` pada target yang berisi data. Jika restore gagal karena extension/permission/object milik Supabase, hentikan dan simpan pesan error yang sudah disensor; jangan mengabaikan error secara membabi buta.

## 4. Validasi hasil restore

Bandingkan query ini pada source dan staging (gunakan `psql` tanpa menampilkan password; koneksi mengambil URL dari environment):

```bash
psql "$SOURCE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'wallets', count(*) FROM wallets
UNION ALL SELECT 'entries', count(*) FROM entries
UNION ALL SELECT 'link_requests', count(*) FROM link_requests
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT 'schema_migrations', count(*) FROM schema_migrations;"

psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
SELECT 'users' AS table_name, count(*) FROM users
UNION ALL SELECT 'wallets', count(*) FROM wallets
UNION ALL SELECT 'entries', count(*) FROM entries
UNION ALL SELECT 'link_requests', count(*) FROM link_requests
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
UNION ALL SELECT 'schema_migrations', count(*) FROM schema_migrations;"
```

Tujuan command: membandingkan jumlah baris pada enam tabel inti/migrasi. Hasil harus sama untuk rehearsal snapshot yang sama. Bandingkan juga total ledger per wallet dan beberapa contoh entry/koreksi yang diketahui lewat query read-only yang sama pada kedua database.

Periksa tabel, trigger, dan extension pada target:

```bash
psql "$TARGET_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c "
SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
SELECT tgname, tgrelid::regclass FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid::regclass::text='entries';
SELECT extname FROM pg_extension WHERE extname IN ('uuid-ossp','pgcrypto') ORDER BY extname;"
```

Tujuan command: memastikan tabel inti, trigger proteksi ledger dan extension yang dibutuhkan terlihat di Supabase. Jika ada objek yang hilang atau row count berbeda, jangan hubungkan aplikasi dan jangan cutover.

## 5. Tutup sesi operator

Setelah selesai, hapus variable dari shell dan tutup sesi:

```bash
unset SOURCE_DATABASE_URL TARGET_DATABASE_URL
```

Simpan dump dan checksum pada penyimpanan privat sampai rehearsal dan rencana retensi selesai. Hapus hanya sesuai kebijakan retensi dan setelah memastikan backup lain tersedia.

## Variable lain yang muncul di rencana migrasi

Variable ini **bukan untuk command backup**, melainkan konfigurasi saat backend kelak dijalankan di Cloud Run:

- `DATABASE_URL`: connection string Supabase yang dipasang ke runtime Cloud Run sebagai secret. Pilih mode pooler yang sesuai untuk backend persisten; uji prepared statement dan koneksi dulu. Jangan menyimpannya di frontend.
- `JWT_SECRET`: secret acak kuat untuk menandatangani cookie/JWT; simpan di Google Secret Manager, bukan GitHub atau file repo. Jika berubah, token lama tidak akan valid.
- `ENVIRONMENT=production`: menandai mode produksi.
- `COOKIE_SECURE=true`: mewajibkan cookie dikirim lewat HTTPS.
- `CORS_ALLOWED_ORIGINS`: origin frontend yang diizinkan bila browser memanggil API lintas-origin. Contoh format: `https://app.example.com`; jangan masukkan slash path. Bila Pages mem-proxy `/api` secara same-origin, set sesuai kebutuhan CORS yang sudah diuji.
- `PORT`: Cloud Run mengatur port runtime; aplikasi harus mendengarkan nilai port yang disediakan platform.
- `ENABLE_DEV_ENDPOINTS`: jangan aktifkan di produksi; konfigurasi aplikasi fail-closed di luar development/local.

GitHub Actions variables/secrets seperti `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `GCP_PROJECT_ID`, dan Workload Identity belum diperlukan untuk backup/restore manual. CI/CD akan menjadi panduan/tahap terpisah setelah setup awal dan keputusan trigger deploy disetujui.

## Sumber resmi

- Migrasi PostgreSQL ke Supabase: https://supabase.com/docs/guides/platform/migrating-to-supabase/postgres
- Cara memilih koneksi PostgreSQL: https://supabase.com/docs/guides/database/connecting-to-postgres
- Backup Supabase: https://supabase.com/docs/guides/platform/backups
- Rencana utama: [`cloudflare-supabase-migration-plan.md`](cloudflare-supabase-migration-plan.md)
