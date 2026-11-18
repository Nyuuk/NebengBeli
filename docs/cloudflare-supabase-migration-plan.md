# Rencana Migrasi NebengBeli: Cloudflare Pages + Cloud Run + Supabase

## Tujuan dan batas dokumen

Rencana manual untuk memindahkan hosting frontend/backend NebengBeli dari Kubernetes k3s ke Cloudflare Pages, Google Cloud Run, dan Supabase PostgreSQL. Dokumen ini adalah panduan dan belum menjalankan provisioning, deployment, backup/restore, ataupun cutover.

Baseline yang diperiksa: repository `Nyuuk/NebengBeli`, branch `main`, commit `d9b36b55d4eb2f9c318a940eb58034a625f083da`. Worktree bersih saat pemeriksaan.

### Keputusan arsitektur yang disarankan

- Frontend React/Vite tetap menjadi static assets di Cloudflare Pages.
- Backend Go tetap sebagai container pada Google Cloud Run; **tidak perlu port ke Workers**.
- PostgreSQL dipindah ke Supabase. Ukuran produksi yang diberikan pemilik: 9,239 kB (sekitar 9.02 MiB), 9 users, 68 wallets, 908 entries, 1,507 audit logs.
- Untuk awal, gunakan jalur same-origin `/api/*` melalui Cloudflare Pages Functions/reverse proxy ke Cloud Run. Ini menjaga pola API relatif frontend dan mengurangi kompleksitas cookie/CORS. Implementasi proxy dan uji cookie tetap acceptance wajib; alternatif direct cross-origin harus mengatur CORS credentials dan cookie secara eksplisit.
- Pertahankan database PostgreSQL agar transaksi, migrasi, constraint, trigger ledger, dan query tidak perlu dialihkan ke SQLite/D1.

**Belum diukur:** request/egress bulanan, peak concurrency, ukuran dump terkompresi, laju pertumbuhan, kebutuhan RPO/RTO dan domain final. Ukuran database kecil tidak cukup untuk menyimpulkan biaya/availability keseluruhan.

## Effort relatif per area

- **Frontend static hosting:** rendah–sedang. Build statis sudah ada; konfigurasi Pages, SPA fallback, base API/proxy, domain, HTTPS, PWA/service worker, dan browser smoke perlu diverifikasi.
- **Backend Cloud Run:** rendah–sedang. `Dockerfile.backend` sudah membangun server dan CLI Go. Perlu verifikasi port `$PORT`, health/readiness, statelessness, startup/scale-to-zero, koneksi PostgreSQL/pooler, secret injection, dan migration ordering. Container saat ini mengemas Alpine dan binary statis.
- **Supabase PostgreSQL:** sedang. Uji seluruh migration/extension/trigger terhadap project baru, lakukan dump/restore rehearsed, verifikasi data, transaksi multi-row, idempotensi `client_id`, dan penolakan UPDATE/DELETE pada `entries`.
- **Routing dan browser:** sedang. Frontend menggunakan path API relatif dan cookie HttpOnly (`frontend/src/api/client.ts`); pilih same-origin proxy atau kontrak cross-origin, lalu uji login, logout/revoke, cookie, CORS, PWA, offline queue dan sync pada domain HTTPS sebenarnya.
- **Operasional/recovery:** sedang. Siapkan backup off-site terjadwal, uji restore, monitoring kuota, rollback DNS/routing, dan pemilik tindakan saat incident.

## Rencana bertahap dan acceptance

### Tahap 0 — Persiapan dan keputusan

- Pemilik membuat project Supabase dan Cloud Run/GCP, Cloudflare Pages, memilih region/domain, menetapkan anggaran alert, RPO/RTO, dan masa coexistence dengan k3s.
- Tentukan deploy workflow manual atau otomatis sebelum perubahan pipeline.
- Catat URL publik yang diinginkan untuk frontend dan API; jangan menaruh password/token di dokumen.
- Jangan cutover sebelum dump backup berhasil, restore ke project target berhasil, dan validasi ledger/data lulus.

### Tahap 1–2 — Backup dan restore rehearsal

Prosedur operator dan arti setiap variable/command ada di [`cloudflare-supabase-operator-guide.md`](cloudflare-supabase-operator-guide.md). Jalankan dahulu hanya untuk rehearsal pada project Supabase staging yang kosong. Jangan melakukan cutover sebelum restore dan validasi ledger berhasil.


### Tahap 3 — Deploy staging

- Deploy frontend static ke Pages preview dan backend Go container ke Cloud Run staging.
- Atur `DATABASE_URL`, `JWT_SECRET`, `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `CORS_ALLOWED_ORIGINS` (jika cross-origin), `PORT` sesuai kontrak Cloud Run. `ENABLE_DEV_ENDPOINTS` tidak boleh aktif.
- Tetapkan concurrency/instance limits dan koneksi DB secara sadar. Backend saat ini mengatur 25 koneksi terbuka dan 10 idle di `backend/internal/database/db.go`; kalikan dengan jumlah instance dan cocokan dengan batas Supabase/pooler.
- Uji `/healthz`, `/readyz`, auth/cookie, CRUD wallet, posting ledger, duplicate offline sync, batch transaction, correction, move atomicity, statement/CSV, admin authorization, dan audit log.
- Uji offline PWA: antrekan transaksi saat offline, reconnect/sync, tidak ada posting ganda, dan hasil server konsisten.
- Periksa CORS, origin cookie, secure context/HTTPS, frontend service worker dan redirect SPA pada domain preview.

### Tahap 4 — Cutover produksi

1. Tetapkan maintenance/read-only window atau strategi write freeze agar tidak ada transaksi baru hilang setelah snapshot final.
2. Buat dump final terverifikasi dan restore ke project Supabase produksi yang bersih; validasi ulang row counts, totals dan invariants.
3. Deploy backend Cloud Run dan frontend Pages, simpan revision/deployment identifiers dan konfigurasi non-secret.
4. Jalankan migrasi hanya melalui prosedur yang disepakati; verifikasi `/readyz` sebelum membuka trafik.
5. Alihkan routing/domain setelah smoke test. Pertahankan k3s dan database lama dalam keadaan aman/read-only sesuai kebijakan retensi sampai periode rollback berakhir; jangan hapus volume/database lama sebagai bagian dari cutover awal.
6. Pantau error API, koneksi/latency DB, kuota, egress, login, dan offline sync. Bila acceptance gagal, kembalikan routing ke sistem lama; jangan melakukan dual-write tanpa desain dan pengujian khusus.

## Panduan operator dan CI/CD

- Langkah setup awal, arti variable, backup, restore rehearsal, dan validasi manual dipisah di [`cloudflare-supabase-operator-guide.md`](cloudflare-supabase-operator-guide.md).
- Setup GitHub Actions/CI-CD adalah tahap berikutnya dan belum termasuk panduan operator ini. Belum ada workflow atau credential deployment yang diubah.

## Rollback dan restore

- **Rollback aplikasi saja:** arahkan kembali route/domain ke Cloud Run revision/Pages deployment sebelumnya atau sistem k3s lama; rollback aplikasi tidak mengembalikan data yang berubah.
- **Restore database:** lakukan hanya ke project/instance target yang terisolasi dan disetujui. Untuk database utama, hentikan/freeze write, buat backup kondisi saat ini sebelum restore, restore dump terpilih ke target kosong, validasi jumlah baris dan ledger, lalu alihkan aplikasi. Hindari restore destructive ke target live tanpa prosedur incident yang disepakati.
- Jika ada transaksi setelah cutover, restore snapshot lama menghilangkan transaksi tersebut. Tetapkan RPO dan prosedur rekonsiliasi terlebih dulu; jangan mengarahkan kembali aplikasi lama ke database baru tanpa kompatibilitas schema/versi yang diverifikasi.
- Supabase Free tidak menyediakan backup otomatis downloadable setara backup harian Pro; jadwalkan backup logis off-site dan lakukan rehearsal restore secara berkala. Supabase menganjurkan ekspor berkala untuk Free.

## Sumber teknis

- Repository: `ARCHITECTURE.md`, `README.md`, `backend/internal/database/migrations/`, `backend/internal/database/db.go`, `backend/internal/config/config.go`, `frontend/src/api/client.ts`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `.github/actions/vault-secrets/action.yml`.
- Supabase backups: https://supabase.com/docs/guides/platform/backups
- Supabase database size: https://supabase.com/docs/guides/platform/database-size
- Cloud Run pricing: https://cloud.google.com/run/pricing
- Cloud Run ingress: https://cloud.google.com/run/docs/securing/ingress
- Google GitHub OIDC auth: https://github.com/google-github-actions/auth
- Cloudflare Pages CI deployment: https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

## Status dan batas yang belum selesai

- Dokumen planning dibuat dari inspeksi source repository dan dokumentasi platform; belum ada provider yang diprovision atau diuji.
- Backup/restore di atas adalah prosedur operator yang belum dieksekusi. Wajib rehearsal pada staging sebelum produksi.
- CI/CD setup guide will be written separately after initial manual setup and approval of deployment trigger.
- The current GitHub Actions release workflow remains connected to Kubernetes deployment until a replacement has been agreed and verified; this planning document does not change it.
