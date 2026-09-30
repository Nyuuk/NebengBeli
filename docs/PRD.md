# PRD — NebengBeli

Sep 26, 2026 · @Adnan Khafabi

## Ringkasan

NebengBeli adalah PWA untuk mencatat titipan jajan di kantor, dengan tujuan utama membuat pencatatan oleh penerima titipan (OB/GA) secepat mungkin. Setiap penitip punya dompet berbasis ledger yang bisa bersaldo minus (hutang) tanpa pernah memblokir transaksi.

**Masalah:** OB menalangi belanja banyak orang setiap hari dengan uang pribadi. Pencatatan manual di buku atau chat lambat, mudah salah, dan sulit direkap saat menagih.

**Tujuan:**

- Mencatat titipan banyak orang dalam satu kali belanja di bawah 1 menit.
- Membuat rekap teks yang siap dikirim ke WhatsApp/Telegram dalam dua tap, dengan saldo before/after yang selalu cocok.
- Penitip bisa memantau saldo dan riwayatnya sendiri tanpa bisa mengubah apa pun.
- Riwayat keuangan permanen dan bisa diaudit, sehingga tidak ada sengketa angka.

## Persona & peran

Sistem hanya punya dua role, `user` dan `admin`. "Pembuat" dan "pemilik" adalah relasi per dompet, bukan role, sehingga satu user bisa menjadi keduanya.

| Persona | Relasi | Yang bisa dilakukan |
| --- | --- | --- |
| Rahmat (OB/GA) | Pembuat dompet | Membuat, menamai, mengarsip dompet; mencatat titipan, top-up, koreksi; membuat rekap; meminta dan memutus link pemilik |
| Rendy (penitip) | Pemilik dompet | Menyetujui/menolak permintaan link; melihat saldo dan riwayat; membuat rekap sendiri; tidak bisa mengubah data apa pun |
| Adnan | Admin | Melihat semua user, dompet, dan transaksi; melihat dashboard; me-reset password user |

Semua user yang terdaftar bisa membuat dompet. Tidak ada proses penunjukan OB.

## Konsep inti

Saldo dompet tidak pernah disimpan sebagai angka yang diedit, melainkan selalu dihitung dari penjumlahan semua entri ledger di dompet itu.

**Dompet**

- Setiap dompet punya tepat 1 pembuat dan maksimal 1 pemilik. Pemilik boleh kosong (penitip belum punya akun).
- Satu pasangan pembuat × pemilik boleh punya lebih dari satu dompet, jadi setiap dompet wajib punya nama/label, misalnya "Rendy – Kopi".
- Dompet dari pembuat berbeda selalu terpisah, karena uangnya dipegang orang yang berbeda.
- Dompet bisa diarsip dan dibatalkan arsipnya. Dompet tidak pernah bisa dihapus.

**Jenis entri ledger**

| Jenis | Arah | Keterangan |
| --- | --- | --- |
| Titipan | Debit (−) | Barang yang dibelikan pembuat untuk pemilik |
| Top-up | Kredit (+) | Uang yang dititipkan penitip ke pembuat; transfernya terjadi di luar aplikasi |
| Koreksi | Debit/kredit | Selisih perbaikan atas satu titipan atau top-up asli |

**Saldo**

- Saldo = jumlah semua entri. Saldo boleh 0 atau minus kapan saja; minus berarti hutang.
- Tidak ada batas hutang, dan saldo tidak pernah memblokir pencatatan.
- Tidak ada status "selesai/belum selesai" per transaksi. Semua entri permanen sejak dibuat dan tidak bisa diedit.

## Kebutuhan fungsional

Fitur inti produk adalah Sesi Belanja, rekap per rentang tanggal, dan transaksi koreksi; semua fitur lain mendukung ketiganya.

### F1. Pencatatan — Sesi Belanja (layar utama pembuat)

- Satu form berisi banyak baris: dompet, nama item, harga.
- Kolom dompet memakai autocomplete, hanya menampilkan dompet aktif (bukan arsip) milik pembuat. Bentuknya dropdown yang bisa diketik (MUI Autocomplete): tap kolom langsung menampilkan daftar dompet diurutkan dari yang paling sering dipakai, dan mengetik sebagian nama (misalnya "ren") menyaring daftar menjadi "Rendy – Kopi", "Rendy – Makan Siang".
- Setelah dompet dipilih, kolom item menampilkan riwayat item dompet itu, diurutkan dari yang paling sering, beserta harga terakhir. Tap satu saran mengisi nama dan harga.
- Tampilkan total belanja semua baris.
- Tanggal/jam default ke sekarang dan bisa diubah.
- "Simpan Semua" menyimpan seluruh baris dalam satu transaksi database (semua berhasil atau semua gagal).
- Isi form tersimpan sebagai draft di perangkat dan tetap ada walau aplikasi ditutup.
- Tanpa koneksi, Simpan Semua tetap berfungsi dan entri masuk antrean sinkronisasi (F11).

### F2. Pencatatan tunggal per dompet

- Dari halaman dompet, pembuat bisa menambah titipan atau top-up satu per satu.
- Top-up mencatat nominal dan catatan opsional (misalnya "transfer BCA 1 Okt").

### F3. Transaksi koreksi

- Hanya pembuat dompet yang bisa membuat koreksi.
- Koreksi selalu menempel ke entri asli (titipan atau top-up), tidak pernah ke koreksi lain.
- Form meminta **nominal yang benar**. Aplikasi menghitung selisih dari nilai efektif terakhir (asli + semua koreksi sebelumnya).
- Pembatalan = koreksi dengan nominal yang benar 0.
- Alasan wajib, dipilih dari opsi cepat: salah harga, batal, salah dompet, lainnya (dengan teks).
- Form koreksi terisi otomatis dengan data entri asli.
- Di riwayat, entri asli menampilkan nilai efektif (nilai lama dicoret) dan tautan ke daftar koreksinya.
- Aksi **"Pindahkan ke dompet lain"** pada titipan: pembuat memilih dompet tujuan (miliknya sendiri), lalu aplikasi dalam satu database transaction membuat koreksi ke 0 di dompet asal (alasan "salah dompet") dan titipan baru dengan item dan harga yang sama di dompet tujuan. Kedua entri saling tertaut.

### F4. Rekap teks (export to text)

- Pembuat dan pemilik sama-sama bisa membuat rekap untuk satu dompet.
- Pilihan rentang: Hari ini (default), Minggu ini, Bulan ini, atau tanggal custom.
- Semua entri dalam rentang ikut masuk, termasuk top-up dan koreksi.
- Isi: nama dompet, rentang, saldo di awal rentang, daftar entri (tanggal, keterangan, nominal), total, saldo di akhir rentang.
- Saldo akhir selalu sama dengan saldo awal ditambah total entri.
- Tombol Copy menyalin teks ke clipboard.

### F5. Manajemen dompet (pembuat)

- Membuat dompet dengan nama wajib dan pemilik opsional.
- Mengubah nama dompet.
- Mengarsip dan membatalkan arsip. Mengarsip dompet bersaldo ≠ 0 menampilkan peringatan tapi tetap diizinkan.
- Dompet arsip tampil di tab "Arsip" secara read-only.

### F6. Linking pemilik

- Pembuat meminta link dompet ke sebuah username.
- Calon pemilik melihat permintaan sebagai badge/banner di beranda, hanya dengan informasi nama dompet dan nama pembuat.
- Calon pemilik menyetujui atau menolak. Transaksi baru terlihat setelah disetujui.
- Setelah disetujui, pemilik melihat seluruh riwayat dompet, termasuk entri sebelum link.
- Hanya pembuat yang bisa memutus link. Setelah diputus, dompet kembali tanpa pemilik dengan saldo dan riwayat utuh.
- Link ulang ke siapa pun perlu approval lagi. Tidak ada batas jumlah permintaan link, tidak ada cooldown setelah ditolak, dan permintaan pending tidak pernah kedaluwarsa.

### F7. Beranda pemilik

- Menampilkan semua dompet milik user, dikelompokkan per pembuat, dengan subtotal saldo per pembuat.
- Tidak ada total gabungan lintas pembuat.
- User yang juga pembuat mendapat dua tab: "Dompet saya kelola" dan "Dompet milik saya".
- Data diperbarui saat halaman dibuka, pull-to-refresh, dan saat aplikasi kembali ke foreground.

### F8. Insight pembuat

- Ringkasan di beranda pembuat: **"Total uang saya yang masih di luar"**, yaitu jumlah semua saldo minus di dompet aktif buatannya.
- Grafik jumlah dan nominal titipan per hari, minggu, dan bulan.
- Chart saldo per dompet, bisa diurutkan dari saldo paling minus.

### F9. Admin (Adnan)

- Daftar user, daftar dompet (dengan pembuat dan pemilik), dan semua transaksi, semuanya read-only.
- Dashboard: kartu ringkasan (total user, total dompet aktif/arsip, total transaksi dan nominal pada periode terpilih).
- Grafik tren jumlah dan nominal titipan per hari/minggu/bulan.
- Rincian per pembuat (jumlah dan nominal) dan per dompet (nominal dan saldo saat ini).
- Top-up dan koreksi ditampilkan terpisah dari titipan.
- Reset password: Adnan langsung mengatur password baru user.

### F10. Akun & autentikasi

- Registrasi terbuka dengan username dan password. Username tidak bisa diganti setelah registrasi.
- Login, logout, dan halaman ganti password sendiri.
- Reset atau ganti password mencabut semua sesi aktif user tersebut.
- Akun admin hanya dibuat lewat perintah CLI backend (misalnya `nebengbeli create-admin --username adnan`), bukan lewat registrasi atau UI.

### F11. Offline penuh dengan antrean sinkronisasi

- Pembuat bisa mencatat titipan (Sesi Belanja dan tunggal), top-up, koreksi, dan "Pindahkan ke dompet lain" tanpa koneksi.
- Entri offline disimpan di IndexedDB dengan `client_id` (UUID) sebagai idempotency key dan `occurred_at` dari perangkat.
- Antrean dikirim otomatis saat koneksi kembali (Background Sync bila didukung; fallback saat event `online` dan saat aplikasi dibuka), berurutan sesuai waktu dibuat.
- Server menolak duplikat berdasarkan `client_id` dan mengembalikan entri yang sudah ada, sehingga pengiriman ulang tidak pernah mencatat dobel.
- Data terakhir (daftar dompet, saldo, riwayat, riwayat item untuk autocomplete) di-cache untuk dibaca offline, dengan label "Terakhir disinkron \<waktu>".
- Saldo yang tampil = saldo server terakhir + entri yang menunggu sinkron. Entri pending diberi tanda "Menunggu sinkron".
- Rekap teks bisa dibuat offline, tapi menampilkan peringatan jika rentangnya berisi entri yang belum tersinkron.
- Entri yang ditolak server (misalnya dompet sudah dipindah/akses dicabut) ditandai "Gagal sinkron" beserta alasannya; pembuat bisa memindahkannya ke dompet lain atau membuangnya.
- Antrean terikat ke `user_id`. Jika sesi dicabut (reset/ganti password), antrean ditahan sampai user login ulang dengan akun yang sama. Logout dengan antrean berisi menampilkan peringatan.
- Aksi yang tetap membutuhkan koneksi: registrasi, login, ganti/reset password, membuat/mengubah nama/mengarsip dompet, meminta/menyetujui/memutus link, dan dashboard admin.

## Aturan bisnis & kasus tepi

Prinsip utamanya: data keuangan tidak pernah diubah atau dihapus, hanya ditambah.

| Kasus | Perilaku |
| --- | --- |
| Salah ketik harga | Koreksi ke entri asli dengan nominal yang benar |
| Koreksi yang ternyata salah | Koreksi lagi entri aslinya; selisih dihitung dari nilai efektif terakhir |
| Penitip batal | Koreksi ke nominal 0 dengan alasan "Batal" |
| Salah dompet | Aksi "Pindahkan ke dompet lain" (koreksi ke 0 di dompet asal + titipan baru di dompet tujuan, otomatis) |
| Top-up salah nominal | Koreksi ke entri top-up asli |
| Saldo 0 atau minus saat mencatat | Transaksi tetap tersimpan; saldo menjadi minus |
| Salah link ke user lain | Pembuat memutus link; admin tidak bisa membantu |
| Pembuat resign/tidak aktif | Di luar aplikasi; admin bisa me-reset password untuk mengunci akun |
| Dompet tidak dipakai lagi | Diarsip; tetap terlihat read-only oleh pembuat dan pemilik |
| Mengarsip dompet bersaldo ≠ 0 | Peringatan, tetap diizinkan |
| Permintaan link ditolak | Bisa langsung dikirim ulang; tanpa batas dan tanpa kedaluwarsa |

Hak akses per aksi:

| Aksi | Pembuat | Pemilik | Admin |
| --- | --- | --- | --- |
| Catat titipan/top-up/koreksi | Ya | Tidak | Tidak |
| Lihat saldo & riwayat | Ya | Ya (setelah approve) | Ya (semua) |
| Buat rekap teks | Ya | Ya | Tidak |
| Ubah nama/arsip dompet | Ya | Tidak | Tidak |
| Minta/putus link | Ya | Tidak | Tidak |
| Setujui/tolak link | Tidak | Ya | Tidak |
| Reset password user | Tidak | Tidak | Ya |

## Kebutuhan non-fungsional & teknis

Stack: React Vite + MUI (frontend), Go + Gin (backend), PostgreSQL, dijalankan dengan Docker Compose di belakang reverse proxy satu domain.

**Autentikasi & sesi**

- JWT berlaku 3 hari, disimpan di httpOnly cookie dengan `Secure` dan `SameSite=Lax/Strict`.
- Frontend dan backend satu domain; reverse proxy meneruskan `/api` ke Gin.
- Response login dan renew mengembalikan `expires_at`, karena frontend tidak bisa membaca cookie.
- Frontend otomatis memanggil `POST /auth/renew` saat sisa umur token kurang dari 24 jam.
- Tabel `users` punya kolom `token_version`. Nilainya masuk ke JWT dan dicek middleware serta endpoint renew. Reset atau ganti password menaikkan nilainya, sehingga semua sesi lama langsung tidak berlaku.

**Keamanan**

- Aplikasi terbuka ke publik di `nebengbeli.nyuuk.my.id` / `nebengbeli.com`, dengan HTTPS wajib.
- Registrasi terbuka tanpa undangan.
- Rate limit hanya pada endpoint registrasi dan login (mencegah brute force dan bot). Permintaan link tidak dibatasi.
- Semua input teks (nama item, nama dompet, catatan) di-escape saat ditampilkan.
- Password di-hash (bcrypt/argon2).
- Aksi link, approve, tolak, putus link, dan reset password dicatat di audit log.

**Data & konsistensi**

- Nominal disimpan sebagai `BIGINT` dalam satuan rupiah, bukan float.
- Simpan Semua di Sesi Belanja berjalan dalam satu database transaction.
- Batas "hari ini/minggu ini/bulan ini" untuk rekap dan grafik dihitung di backend dengan zona waktu `Asia/Jakarta`.
- Relasi memakai `user_id`, bukan username.

**Offline & update data**

- Offline penuh untuk pencatatan (lihat F11): IndexedDB untuk antrean dan cache, service worker untuk aset dan Background Sync.
- Tidak ada live update atau push notification; data di-refresh saat halaman dibuka, pull-to-refresh, saat aplikasi kembali ke foreground, dan setelah antrean selesai tersinkron.

**PWA**

- Bisa di-install ke home screen, dengan manifest dan service worker untuk aset statis.
- Layar utama dioptimalkan untuk HP (satu tangan, target tap besar).

## Model data awal

Produk memakai lima tabel inti; saldo dihitung dari `entries`, tidak disimpan sebagai kolom yang diedit.

| Tabel | Kolom utama | Catatan |
| --- | --- | --- |
| `users` | id, username (unik), password\_hash, role (`user`/`admin`), token\_version, created\_at | Relasi lain memakai id |
| `wallets` | id, name, creator\_id, owner\_id (nullable), archived\_at (nullable), created\_at | Tidak ada constraint unik pada pasangan creator × owner |
| `entries` | id, wallet\_id, type (`titipan`/`topup`/`koreksi`), amount (BIGINT, bertanda), item\_name, note, corrects\_entry\_id (nullable), correction\_reason, occurred\_at, client\_id (UUID unik, idempotency key), created\_by, created\_at | Koreksi wajib mengisi corrects\_entry\_id ke entri titipan/top-up; tidak ada UPDATE/DELETE |
| `link_requests` | id, wallet\_id, requested\_by, target\_user\_id, status (`pending`/`approved`/`rejected`), created\_at, decided\_at | Satu request pending per dompet |
| `audit_logs` | id, actor\_id, action, target\_type, target\_id, metadata (JSONB), created\_at | Link, approve, tolak, putus link, reset password |

Catatan implementasi:

- Saldo = `SUM(amount)` per `wallet_id`. Kalau nanti lambat, tambahkan saldo cache yang diperbarui di dalam transaksi yang sama.
- Nilai efektif sebuah entri = amount asli + jumlah amount koreksinya.
- Riwayat item untuk autocomplete diambil dari `entries` bertipe titipan per dompet (frekuensi dan harga terakhir).
- Tambahkan hak DB-level supaya user aplikasi tidak punya izin UPDATE/DELETE pada `entries`.

## Di luar cakupan & pengembangan berikutnya

NebengBeli sengaja tidak menyentuh uang sungguhan; semua transfer terjadi di luar aplikasi.

**Tidak akan dibuat (keputusan desain):**

- Edit atau hapus transaksi.
- Hapus dompet.
- Status selesai/belum selesai per transaksi.
- Batas hutang per dompet.
- Admin menonaktifkan user atau memutus link.
- Pemilik memutus link sendiri.
- Total saldo gabungan lintas pembuat.

**Kandidat pengembangan berikutnya:**

- Push notification (transaksi baru, permintaan link). Di iPhone hanya berfungsi jika PWA di-install.
- Merge dompet.
- Offline penuh dengan antrean sinkronisasi. (Sudah masuk cakupan produk sebagai F11.)
- Live update via SSE/WebSocket.
- Pembayaran/transfer langsung di aplikasi.

## Pertanyaan terbuka

- [x] Username bisa diganti? **Tidak.**
- [x] Ringkasan "total uang saya yang masih di luar" di beranda pembuat? **Ya** (F8).
- [x] Salah dompet? **Satu aksi "Pindahkan ke dompet lain"** (F3).
- [x] Batas dan cooldown permintaan link? **Tidak ada batas, tidak ada kedaluwarsa** (F6).
- [x] Deploy? **Terbuka ke publik** di nebengbeli.nyuuk.my.id / nebengbeli.com.
- [x] Admin pertama dibuat bagaimana? **Perintah CLI** (F10).
