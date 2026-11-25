# DESIGN — Audit UI Frontend NebengBeli

Basis audit: kode di `frontend/src/` (snapshot working tree; nomor baris merujuk file aktual). Path selalu relatif root repository. Tidak ada perubahan kode aplikasi. Working tree awal sudah memuat perubahan user pada `.gitignore`, `frontend/src/components/TablePaginationBar.tsx`, dan untracked `DESIGN.md`; perubahan tersebut dipertahankan.

## 1. Ringkasan Audit & Tech Stack UI

- React + TypeScript, Material UI (`@mui/material`) dan ikon MUI; routing `react-router-dom`. `frontend/src/App.tsx:2-4,18-43,80-146`.
- Entry point `frontend/src/main.tsx`: import `frontend/src/index.css:4`; inisialisasi offline seam, lalu `ReactDOM.createRoot` dan render dalam `React.StrictMode` pada `frontend/src/main.tsx:10-14`. Alur: entry point -> `App` (`frontend/src/main.tsx:3,12`) -> `ThemeProvider` dan `CssBaseline` (`frontend/src/App.tsx:82-83`).
- `createTheme` dimulai `frontend/src/App.tsx:18`; menetapkan primary `#1976d2`, light `#42a5f5`, dark `#1565c0`, secondary `#9c27b0`, background default `#f8fafc` pada `frontend/src/App.tsx:29` (paper putih pada `:30`), font Roboto dan radius dasar 8 px. `ThemeProvider`/`CssBaseline` pada `frontend/src/App.tsx:82-83`.
- CSS global menetapkan body background `#f8fafc` pada `frontend/src/index.css:13`; deklarasi `code` ada pada `frontend/src/index.css:17-24`.
- Deklarasi font di `frontend/src/index.css:7-10` menggunakan system stack, sementara `createTheme` pada `frontend/src/App.tsx:34` menyatakan Roboto. Ini **duplikasi sumber deklarasi font / potensi konflik CSS cascade** antara CSS global dan tema (termasuk baseline), bukan bukti bahwa rendered font pasti berbeda. Kepastian butuh pemeriksaan computed style di browser.
- Implementasi mencampur token tema dengan warna literal dan inline `sx`: contoh `frontend/src/components/Layout.tsx:12` `#f8f9fa`, `frontend/src/components/TablePaginationBar.tsx:27` `#f8fafc`, header tabel `#f1f5f9`, serta warna status di Dashboard, StatementView dan BalanceCard.

## 2. Design Tokens & Standar Konsistensi

Fakta implementasi dibedakan dari target normatif pada matriks dan rekomendasi di bawah.

### Color Palette

| Peran | Warna aktual dan lokasi |
|---|---|
| Primary | `#1976d2`, `#42a5f5`, `#1565c0` — `frontend/src/App.tsx:21-24`; Navbar literal `#1976d2` — `frontend/src/components/Navbar.tsx:42,145` |
| Secondary | `#9c27b0` — `frontend/src/App.tsx:26` |
| Latar | `#f8fafc` — `frontend/src/App.tsx:29`, `frontend/src/index.css:13`, `frontend/src/components/TablePaginationBar.tsx:27`; `#f8f9fa` — `frontend/src/components/Layout.tsx:12`; `#fafafa` — `frontend/src/pages/DashboardPage.tsx:655` |
| Tabel | `#f1f5f9` — `frontend/src/pages/AdminPage.tsx:333,391,467,531,599,638`, `frontend/src/pages/LinkRequestsPage.tsx:118`, `frontend/src/components/StatementView.tsx:318`, `frontend/src/components/ShoppingSessionModal.tsx:654`; admin summary `#e2e8f0` — `frontend/src/pages/AdminPage.tsx:431` |
| Saldo/status | BalanceCard gradient `#1e3c72`→`#2a5298`, status `#4caf50/#ff5252/#40c4ff` — `frontend/src/components/BalanceCard.tsx:41,82`; Dashboard `#0288d1/#2e7d32/#d32f2f` — `frontend/src/pages/DashboardPage.tsx:488,554,609`; StatementView chips `#ffebee/#c62828`, `#e8f5e9/#2e7d32`, `#fff3e0/#ef6c00` — `frontend/src/components/StatementView.tsx:115-119` |
| Insight | oranye/hijau/biru literal — `frontend/src/components/CreatorInsightsCard.tsx:67-117` |
| Lain | Admin KPI `#0288d1/#388e3c/#f57c00` — `frontend/src/pages/AdminPage.tsx:273-297`; `#f5f5f5` — `frontend/src/components/MoveEntryModal.tsx:152`; `#fff5f5` — `frontend/src/components/StatementView.tsx:234,346` |

**Target:** gunakan `theme.palette.primary`, `success`, `error`, `warning`, `info`, `text`, `background`, `divider` untuk warna semantik; sentralisasi warna khusus melalui tema sebelum migrasi. Jangan gunakan warna saja untuk mengomunikasikan status.

### Typography

Belum ada skala `typography` khusus selain font family dan button transform (`frontend/src/App.tsx:34-37`); ukuran variant mengikuti default MUI kecuali dioverride lokal. Body stack CSS global pada `frontend/src/index.css:7-10` berbeda deklarasinya dari tema pada `frontend/src/App.tsx:34`.

- Page heading h4 + weight 800: `frontend/src/pages/DashboardPage.tsx:330`, `frontend/src/pages/AdminPage.tsx:236`, `frontend/src/pages/LinkRequestsPage.tsx:90`, `frontend/src/pages/LoginPage.tsx:51`, `frontend/src/pages/RegisterPage.tsx:69`; beberapa halaman memakai h5.
- Section umumnya h6; KPI lazim h5 weight 800. Saldo detail responsif 1.75rem xs / 2.125rem sm di `frontend/src/components/BalanceCard.tsx:64-67`.
- Table header weight 700; monospace `code` memakai 0.85em, padding 2px 6px, radius 4px pada `frontend/src/index.css:17-24`.

**Matriks target typography (preskriptif):**

| Peran | Ukuran target | Weight target | Variant visual / semantik |
|---|---:|---:|---|
| Page title | 1.5rem xs; 2rem sm+ | 700 | `variant="h4"`, semantik `component="h1"` |
| Section title | 1.25rem xs; 1.5rem sm+ | 700 | `variant="h6"`, semantik `component="h2"` |
| KPI utama | 1.25rem xs; 1.5rem sm+ | 700–800 | `variant="h5"`; gunakan heading element hanya bila hierarki dokumen memang heading |
| Body | 1rem | 400 | `body1`; semantik sesuai konten |
| Table header | 0.875rem | 700 | `body2`, semantik `th` dari TableCell |
| Metadata/caption | 0.75rem minimum | 400–500 | `caption`; jangan jadikan caption terlalu kecil |

`variant` mengatur tampilan, `component="h1"|"h2"` mengatur elemen semantik; pilih keduanya terpisah dan jaga satu h1 per halaman.

### Matriks Nilai Target — Spacing & Padding

Semua nilai `sx` berikut preskriptif; breakpoint MUI (`xs`, `sm`) eksplisit. Table header/cell padding konsisten dan pagination tetap responsif.

| Komponen | Token/Nilai Target | Breakpoint | Pengecualian |
|---|---|---|---|
| Page container | `px: { xs: 2, sm: 3 }, py: { xs: 2.5, sm: 3 }` | xs/sm | Auth/not-found boleh shell tersendiri, tetap mengikuti skala |
| `CardContent` | `p: { xs: 2, sm: 2.5 }` | xs/sm | Hero khusus boleh menambah padding bila kebutuhan konten jelas |
| Table header | `py: 1.5, px: 2` | semua | Tabel padat dapat `py: 1`, konsisten dalam tabel yang sama |
| Table cell | `py: 1.25, px: 2` | semua | Tabel padat/mobile boleh `px: 1, py: 1` |
| `TablePaginationBar` footer | `px: { xs: 2, sm: 2.5 }, py: 1.5, borderTop: 1` + `borderColor: 'divider'` | xs/sm; column xs, row md+ | Jangan hilangkan pembatas bila footer menempel pada tabel |
| `DialogTitle` / `DialogContent` | `p: 2.5` | semua | Full-screen mobile boleh mengurangi horizontal padding ke 2 |
| `DialogActions` | `px: 2.5, py: 1.5` | semua | Button wrap mobile tidak boleh terpotong |
| Section gap | `mb: 3` atau `spacing: { xs: 2, sm: 3 }` | xs/sm | Gap 1–2 untuk elemen rapat dalam satu field group |

### Matriks Nilai Target — Border Radius

Dengan `theme.shape.borderRadius = 8px` (`frontend/src/App.tsx:39-41`), angka `borderRadius` di `sx` MUI adalah **pengali**, bukan nilai pixel langsung: `1` = 8px, `1.5` = 12px, `2` = 16px, `3` = 24px.

| Komponen | Target |
|---|---|
| Card / Paper / Dialog | `borderRadius: 1.5` (12px); gunakan `2` (16px) hanya untuk surface hero/utama |
| Button / Input / Chip | `borderRadius: 1` (8px) |
| Inline `code` | 4px literal; selaras `frontend/src/index.css:22` |
| Progress track / status dekoratif | radius penuh hanya bila bentuk pill memang disengaja |

### Matriks Nilai Target — Elevation & Border

| Komponen | Target | Pengecualian |
|---|---|---|
| Default card / table wrapper | `elevation={0}` + `variant="outlined"` (border `divider`) **atau** `elevation={1}` dengan border `divider`; pilih satu pola konsisten per surface | Auth card `elevation={3}` |
| Hero `BalanceCard` | `elevation={2}` | Jangan perluas elevation tinggi ke kartu informasi biasa |
| Dialog | Elevation overlay bawaan MUI | Tidak menambah shadow dekoratif lain |

### Responsive Breakpoints

MUI breakpoints `xs`, `sm`, `md` digunakan: shell `frontend/src/components/Layout.tsx:15`; Dashboard grid 12/6/4 kolom `frontend/src/pages/DashboardPage.tsx:443`; Admin KPI 12/6/3 `frontend/src/pages/AdminPage.tsx:258`; ShoppingSession full-screen mobile `frontend/src/components/ShoppingSessionModal.tsx:103,434`; pagination column hingga md `frontend/src/components/TablePaginationBar.tsx:25`; Navbar menyembunyikan tombol pada xs/sm `frontend/src/components/Navbar.tsx:60,69,79`.

**Gunakan:** mobile-first, definisikan perilaku xs/sm/md yang dibutuhkan. **Hindari:** asumsi semua tabel otomatis responsif; tambah `lg` hanya bila kebutuhan layout nyata.

## 3. Standar Komponen

| Area | Pola aktual dan target konsistensi |
|---|---|
| Layout & Page Shell | `frontend/src/components/Layout.tsx:11-19` membungkus Navbar, Container lg, OfflineBadge. Satu shell untuk halaman terautentikasi; auth/not-found boleh tersendiri. |
| Cards & KPI | Dashboard wallet cards, BalanceCard, CreatorInsightsCard, admin KPI. Konsistenkan h5/weight 700–800 dan semantic palette. |
| Tables & `TablePaginationBar` | Admin memakai pagination (`frontend/src/pages/AdminPage.tsx:206`); beberapa tabel memakai Paper/TableContainer dan header literal. StatementView mempunyai tampilan tabel dan alternatif mobile. Samakan header/cell, overflow, pagination, empty/error/loading. |
| Forms & Dialogs | Forms auth dan password; dialog entry, koreksi, wallet, rekap, shopping. Pertahankan label/error, disable submit saat proses, spacing matriks. |
| Chips & badges | Status link memakai palette (`frontend/src/pages/LinkRequestsPage.tsx:77-83`); migrasikan status literal ke token dan pertahankan label tekstual. |
| Tabs & Navigation | Navbar responsive `frontend/src/components/Navbar.tsx:41-145`; ResponsiveTabs aksesibel `frontend/src/components/ResponsiveTabs.tsx:4-31`. Pertahankan keyboard/focus dan label. |
| Loading/Empty/Error | `frontend/src/pages/AdminPage.tsx:320-327`, `frontend/src/pages/LinkRequestsPage.tsx:111-113` memakai CircularProgress. `frontend/src/pages/OfflineEntryReviewPage.tsx:121` loading memakai `Box role="status"` + `CircularProgress`, bukan Alert; Alert dipakai untuk empty/error. `frontend/src/components/StatementView.tsx` tidak mengimplementasikan loading state; area sekitar `:216` merupakan cabang mobile/empty state. Loading harus punya konteks accessible; empty bukan error. |

## 4. Inventaris & Temuan Audit

Nomor baris contoh diverifikasi terhadap snapshot ini. Semua path lengkap relatif root repo.

### Halaman (`frontend/src/pages/`)

| File | Implementasi / temuan |
|---|---|
| `frontend/src/pages/AdminPage.tsx` | KPI, tab dataset, tabel/dialog; header `#f1f5f9` 333,391,467,531,599,638; KPI literal 273-297; Paper/padding/radius 431-457; pagination 206; heading h4 236; grid xs/sm/md 257-258. |
| `frontend/src/pages/ChangePasswordPage.tsx` | Card elevation 2/radius 2, CardContent breakpoint 109-110; title h5 114; Alert 130-142. |
| `frontend/src/pages/DashboardPage.tsx` | Heading h4 330; grid 441-444; info panel literal 378-384; saldo literal 488,554,609; loading 425, empty 428-434. |
| `frontend/src/pages/LinkRequestsPage.tsx` | Status chip 77-83; Paper elevation1/radius2 115; header literal 118; loading 111-113; error/success Alert 99-105; empty row 131-138. |
| `frontend/src/pages/LoginPage.tsx` | Heading h4/800 51; card elevation3/radius3/p1 59; form heading h6 61. |
| `frontend/src/pages/NotFoundPage.tsx` | H1 primary 13; h5 16; body2 19. |
| `frontend/src/pages/OfflineEntryReviewPage.tsx` | Card padding xs/sm 100; title h5 118; loading `Box role="status"` + `CircularProgress` 121; Alert empty/error pada cabang lain; confirm dialog 134-137. |
| `frontend/src/pages/RegisterPage.tsx` | Pola Login: h4 69; Card elevation3/radius3/p1 77; form h6 79. |
| `frontend/src/pages/WalletDetailPage.tsx` | Loading/error 453-465; title h5 485; Dialog 690-746; Actions p2 704,746. |

### Komponen (`frontend/src/components/`)

| File | Implementasi / temuan |
|---|---|
| `frontend/src/components/BalanceCard.tsx` | elevation2/radius3; gradient/status literal 38-42,82-96; saldo responsive 64-67; CardContent xs/sm 48. |
| `frontend/src/components/ClaimUsernameModal.tsx` | Dialog 82; title 90-96; Alert 105-123; actions p2 148; progress 166. |
| `frontend/src/components/CorrectionModal.tsx` | Dialog 65,241; Paper outlined p2/background/radius2 255; status chips 263-274. |
| `frontend/src/components/CreatorInsightsCard.tsx` | elevation2/radius3 43; palette literal 67-117; grid 62-64; empty/background literal 157,202,216. |
| `frontend/src/components/EntryModal.tsx` | Dialog sm/fullWidth 175-176; alerts 183-189; actions p2 258. |
| `frontend/src/components/Layout.tsx` | Background `#f8f9fa` 12; Container lg, margin, responsive px 15. |
| `frontend/src/components/LinkWalletModal.tsx` | Dialog sm/fullWidth 67; Alert 73,107; actions p2 116. |
| `frontend/src/components/MoveEntryModal.tsx` | Dialog sm/fullWidth 133-134; summary literal/radius/padding 152; alerts 141-192; actions 208. |
| `frontend/src/components/Navbar.tsx` | AppBar sticky elevation1; primary literal 42; avatar 86; chip 93; responsive buttons 60,69,79; CTA 145. |
| `frontend/src/components/OfflineBadge.tsx` | Alert/Chip online-offline-sync dan progress 15-57. |
| `frontend/src/components/RekapTextModal.tsx` | Dialog sm/fullWidth 199-200; Paper summary background/radius sekitar 266-276; warning 246. |
| `frontend/src/components/ResponsiveTabs.tsx` | Scrollable Tabs, auto scroll buttons dan aksesibilitas 4-31. |
| `frontend/src/components/ShoppingSessionModal.tsx` | Dialog md/fullWidth/fullScreen mobile 103,434; responsive layout 439-492; item card 513-516; tabel 652-659; actions 820-837. |
| `frontend/src/components/StatementView.tsx` | Paper elevation1/radius2 217; tidak ada loading state; sekitar 216 cabang mobile/empty; header literal 318; status chip 115-119; offline row 234,346. |
| `frontend/src/components/TablePaginationBar.tsx` | Responsive column xs/row md, gap/padding 25-27; divider dan background literal 27; count/select/pagination/loading 18-49. File telah berubah di working tree sebelum tugas. |
| `frontend/src/components/UnlinkWalletModal.tsx` | Dialog xs/fullWidth 48; title 49; Alert 54,65; actions p2 70. |

### Entry point dan tema

| File | Implementasi / temuan |
|---|---|
| `frontend/src/main.tsx` | Import `frontend/src/index.css` pada `:4`; `ReactDOM.createRoot` dan `<React.StrictMode>` merender `<App />` pada `:10-14`; offline seam diinisialisasi sebelum render. Entry point meneruskan ke `App`, lalu `ThemeProvider`/`CssBaseline` pada `frontend/src/App.tsx:82-83`. |
| `frontend/src/App.tsx` | `createTheme` mulai `:18`; background default `:29`, paper `:30`; ThemeProvider/CssBaseline `:82-83`. |
| `frontend/src/index.css` | Body background `:13`; aturan `code` `:17-24`. Font stack global berpotensi bertumpang tindih dengan theme; rendered font belum diverifikasi computed style browser. |

## 5. Roadmap Perapihan & Acceptance Criteria

### P1 — Konsistensi warna & aksesibilitas

1. Satukan background body, page shell, pagination (`frontend/src/index.css:13`, `frontend/src/components/Layout.tsx:12`, `frontend/src/components/TablePaginationBar.tsx:27`) via token tema.
2. Migrasikan warna saldo/status/insight menjadi semantic theme tokens; hapus literal duplikat.
3. Gunakan palette untuk table head `#f1f5f9` dan panel netral.
4. Jadikan satu sumber deklarasi font; validasi computed style browser sebelum menyatakan font hasil render.

**Acceptance Criteria P1:** tidak ada literal hex untuk warna semantik pada halaman/komponen yang masuk cakupan; seluruh background shell/table/footer memakai token konsisten; status memiliki teks/icon selain warna; computed `font-family` pada body dan Typography diperiksa di browser dan keputusan sumber font didokumentasikan.

### P2 — Sistem komponen dan ukuran

1. Terapkan matriks typography dan bedakan visual `variant` dari semantik `component`.
2. Standarkan radius/elevation dengan aturan di atas.
3. Standarkan padding CardContent/Dialog/table/pagination dan section gap.
4. Samakan table header, empty row, overflow dan pagination; gunakan `TablePaginationBar` untuk daftar yang dipaginasi.

**Acceptance Criteria P2:** semua page title memakai pola ukuran/weight target dan semantik h1; section heading memakai h2; seluruh surface umum memenuhi radius target; card/table wrapper memenuhi salah satu pola elevation+border; komponen tercakup memakai nilai matriks spacing, kecuali pengecualian tercatat; tidak ada overflow horizontal tak disengaja pada viewport 320px.

### P3 — Verifikasi responsive dan states

1. Uji xs/sm/md untuk tabel lebar, Dashboard grid, Navbar, PaginationBar dan dialog shopping full-screen.
2. Samakan loading/error/empty state dengan konteks accessible dan retry yang relevan.
3. Tambahkan visual regression/component test untuk palette, hierarchy, pagination dan modal breakpoint.

**Acceptance Criteria P3:** pada viewport 320px, 600px, 900px, 1280px tidak ada konten/page overflow selain tabel yang memang memakai scroll terkontrol; tiap async view menampilkan loading yang dapat diakses, empty state hanya saat data kosong, error state punya pesan dan retry bila operasi dapat diulang; automated tests mencakup minimal satu assertion tiap kategori palette, typography, table pagination, modal mobile; test suite terkait lulus.
