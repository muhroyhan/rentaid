# Panduan agen: migrasi Raggam ke Rentaid

## Cara memakai dokumen ini

- File ini berisi aturan permanen: tujuan, arsitektur, keamanan, konvensi, aturan bisnis, dan verifikasi. Rencana per phase ada di `docs/plan.md`; baca phase yang sedang dikerjakan, tetapi patuhi urutannya.
- Aturan bisnis di file ini kanonik. `docs/business-rules.md` boleh menjelaskan lebih rinci dan memberi contoh, tetapi tidak boleh bertentangan. Jika aturan berubah, perbarui file ini, OpenAPI, dan test dalam perubahan yang sama.
- Jika kebutuhan bisnis yang penting belum jelas dan tidak dicakup dokumen ini, tanyakan kepada pengguna. Untuk keputusan teknis kecil, pilih default paling sederhana, catat satu entri singkat (keputusan dan alasan) di `docs/decisions.md`, lalu lanjutkan.
- Setelah Phase 01, isi bagian "Perintah" di bawah dengan perintah yang benar-benar ada. Di akhir setiap phase, perbarui bagian "Progres".

## Tujuan dan kondisi workspace

- Bangun Rentaid sebagai rental marketplace dalam satu repository dan pnpm workspace. Target pertama adalah demo lokal yang berfungsi dan APK Android, dengan data baru; tidak diperlukan migrasi data produksi atau kompatibilitas API/aplikasi lama.
- `raggam/` berisi marketplace web React dan backend Express/MySQL, `admin-raggam/` berisi web admin dan backend Express/MySQL, dan `raggam-app-master/` berisi aplikasi Flutter. Gunakan ketiganya sebagai referensi fitur dan alur, bukan sebagai implementasi target.
- Ketiga folder lama tetap tersedia selama migrasi. Jangan menghapus atau menimpa pekerjaan yang sudah ada. Root workspace sudah merupakan repository Git.
- Folder lama tidak termasuk workspace, build, atau runtime baru: `pnpm-workspace.yaml` hanya memuat `apps/*` dan `packages/*`, dan glob lint, tsc, test, serta build tidak boleh menjangkau folder lama. Pastikan dependensi terpasang dan hasil build folder lama masuk `.gitignore`.
- Jangan membaca, mencetak, atau menyalin kredensial, file environment berisi rahasia, dependensi terpasang, atau konfigurasi layanan eksternal dari project lama. Gunakan konfigurasi contoh tanpa rahasia dan seed lokal.
- Nama "Raggam" tidak boleh muncul di `apps/`, `packages/`, `infra/`, dan `tests/`; `pnpm check` harus gagal jika ada.
- Perilaku kode lama dapat berbeda antarproject. Aturan dalam dokumen ini menjadi acuan MVP.

## Arsitektur target

- `apps/web`: marketplace Next.js dan TypeScript untuk penyewa dan vendor.
- `apps/admin`: admin dan CMS React, Vite, dan TypeScript. Payload tidak digunakan.
- `apps/api`: satu modular monolith Go (minimal 1.22) menggunakan `net/http`, `pgx`, dan migrasi SQL berversi. Go memiliki aturan bisnis, otorisasi, dan akses PostgreSQL.
- `apps/android`: aplikasi Android native Kotlin dan Jetpack Compose untuk penyewa; gunakan Gradle Wrapper, ViewModel, repository, Coroutines, dan Flow.
- `packages/contracts`: spesifikasi REST OpenAPI `/api/v1` dan konfigurasi generator; `packages/api-client`: klien TypeScript hasil generate; `packages/ui` dan `packages/config`: komponen/token desain dan konfigurasi bersama untuk aplikasi web.
- `infra`: Docker Compose dan konfigurasi lokal; `tests`: pengujian lintas aplikasi; `docs`: arsitektur, aturan bisnis, keputusan, dan panduan operasional.
- pnpm mengelola paket JavaScript/TypeScript dan menyediakan perintah penghubung. Go tetap menggunakan Go modules dan Android tetap menggunakan Gradle. Pin versi toolchain dan dependensi.
- PostgreSQL berjalan dalam Docker Compose dengan volume persisten. API Go adalah satu-satunya aplikasi yang mengakses database secara langsung.
- OpenAPI adalah sumber kontrak bersama (contract-first). Request dan response divalidasi terhadap spesifikasi, dan klien TypeScript serta Kotlin di-generate darinya. Dokumentasikan bentuk error, pagination, status pesanan, autentikasi, dan otorisasi. Hindari menduplikasi aturan bisnis dalam UI.
- Terapkan migrasi SQL, foreign key, indeks, dan constraint yang diperlukan. Simpan nilai uang sebagai bilangan bulat rupiah (`bigint`), tanggal sewa sebagai `DATE`, dan waktu kejadian sebagai `timestamptz`.
- Pilihan tool dibuat di Phase 01 dan dicatat di `docs/decisions.md`. Default yang disarankan: goose (migrasi), oapi-codegen (server Go), openapi-typescript atau orval (klien TS), openapi-generator (klien Kotlin), Playwright (E2E).

## Keamanan, sesi, dan media

- Password di-hash dengan argon2id. Role hanya `user` dan `admin`, dan eksklusif: admin hanya memakai panel admin (tidak menyewa dan tidak memiliki toko), dan login admin di web marketplace ditolak.
- Sesi disimpan di database: token acak 256-bit, hanya hash SHA-256 yang disimpan, masa berlaku default 14 hari (konfigurasi). Sesi dicabut saat logout, suspend pengguna, dan ganti password.
- Browser memakai cookie `HttpOnly`, `SameSite=Lax`, dan `Secure` di luar lokal. Untuk metode non-GET, wajibkan token CSRF per sesi lewat header `X-CSRF-Token` dan periksa `Origin`. Android memakai bearer token yang disimpan terlindungi (Keystore) dan tidak memerlukan CSRF.
- Browser hanya berbicara ke satu origin: server dev (rewrites Next, proxy Vite) dan Compose (reverse proxy) meneruskan `/api` ke Go, dan admin dilayani di `/admin/`. Tidak ada CORS longgar. Next.js meneruskan cookie ke API pada render sisi server.
- Batasi percobaan login (dalam proses, dapat dikonfigurasi). Log terstruktur tidak memuat password atau token.
- Akun admin awal dibuat dari seed lokal dengan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` dari environment; seed menolak berjalan jika `APP_ENV=production`.
- Upload gambar: JPEG, PNG, atau WebP yang diverifikasi dari isi file, maksimal 5 MB, nama file diganti acak, disimpan di `MEDIA_DIR` (volume lokal) dan disajikan melalui API.
- semua table pada database, primary key menggunakan uuid random, bukan int increment

## Konvensi kerja

- Bahasa: kode, identifier, komentar, dan pesan commit dalam bahasa Inggris. UI dan panduan untuk pengguna (README demo, dokumen operasional) dalam Bahasa Indonesia. Error API memiliki `code` snake_case berbahasa Inggris dan `message` berbahasa Indonesia.
- Git: Conventional Commits, branch per phase (manual dibuat user), commit per task untuk tiap branch. Working tree bersih saat phase selesai. Jangan push, force-push, atau menulis ulang riwayat tanpa diminta.
- Kualitas: gofmt, go vet, dan golangci-lint; ESLint, Prettier, dan `tsc` strict; ktlint atau detekt. Satu perintah `pnpm check` menjalankan semua yang relevan.
- Satu sumber waktu: antarmuka `Clock` di Go. Semua keputusan bisnis (hold, kedaluwarsa, "hari ini") memakai `Clock` dan zona Asia/Jakarta, bukan `now()` database. Test kedaluwarsa memakai clock terkendali.
- Pagination memakai `page` dan `page_size` (default 20, maksimal 50) dengan urutan deterministik yang menyertakan `id` sebagai tie-breaker.
- Android: lalu lintas HTTP ke API lokal hanya diizinkan pada build debug (emulator memakai `10.0.2.2`; perangkat fisik lewat IP LAN atau `adb reverse`).

## Cakupan MVP

- Akun lokal email/password untuk pendaftaran, login, profil, dan logout. Profil memuat nama dan nomor telepon; telepon wajib diisi sebelum checkout. Satu akun dapat menjadi penyewa dan memiliki satu toko.
- Status pengguna: `active` atau `suspended`. Suspend mencabut semua sesi dan menolak login.
- Vendor mendaftarkan toko di web; admin menyetujuinya sebelum toko beroperasi. Status toko: `pending`, `approved`, `rejected`, `suspended`. Toko yang ditolak dapat diedit dan diajukan ulang (kembali `pending`). Admin dapat men-suspend dan mengaktifkan kembali toko, dan mencatat alasan penolakan atau suspend. Toko `suspended` tidak tampil di katalog dan tidak menerima pesanan baru, tetapi pesanan yang sudah ada tetap dapat diserahkan, dikembalikan, atau dibatalkan.
- Vendor mengelola produk, foto, kategori, harga harian, jumlah stok, dan publikasi. Vendor tidak dapat menurunkan stok di bawah pemakaian puncak oleh pesanan aktif (lihat aturan stok) pada hari ini dan tanggal mendatang. Produk yang pernah dipesan tidak dihapus permanen; ia diarsipkan atau di-unpublish, dan pesanan berjalan tidak terpengaruh karena snapshot.
- Kategori satu level. Kategori tidak dapat dihapus selama dipakai produk (409); namanya boleh diubah.
- Admin mengelola pengguna, persetujuan toko, moderasi produk, kategori, pesanan, serta konten beranda, FAQ, tentang, syarat penggunaan, dan kebijakan privasi.
- Web mendukung penyewa dan vendor. Android mendukung penyewa: autentikasi, katalog, detail produk, pilihan tanggal dan kuantitas, checkout, pembayaran simulasi, serta riwayat dan detail pesanan.
- Gunakan desain baru yang konsisten, wordmark Rentaid, Bahasa Indonesia, rupiah, dan zona waktu Asia/Jakarta.
- Pembayaran dan refund menggunakan simulasi lokal. Tidak ada komunikasi runtime ke layanan pihak ketiga; akun, stok, pesanan, dan riwayat transaksi tetap nyata dan disimpan dalam PostgreSQL. Jelaskan status simulasi pada UI pembayaran.
- Tunda deposit, komisi, dompet, pencairan vendor, tarif per jam atau bertingkat, reschedule, promo, wishlist, chat, review, komplain, kurir, peta, KYC/OCR, OAuth, OTP, email eksternal, push notification, iOS, denda keterlambatan, dan publikasi store. Jangan menambahkan fitur tersebut tanpa arahan pengguna.

## Aturan sewa dan transaksi

### Pesanan, harga, dan validasi

- Satu pesanan terdiri dari satu produk dan kuantitas tertentu. Tidak ada checkout keranjang banyak produk atau toko pada MVP. Penyewa tidak boleh menyewa produk dari tokonya sendiri (ditolak server).
- Sewa dihitung per hari secara inklusif: 4–5 November adalah dua hari, dan stok dipakai pada tanggal terakhir. Total adalah harga harian × jumlah hari inklusif × kuantitas. Hitung di Go dan simpan snapshot produk serta harga pada pesanan.
- Validasi penawaran dan checkout: `start_date` tidak lebih awal dari hari ini (Asia/Jakarta), `end_date` tidak lebih awal dari `start_date`, durasi maksimal 30 hari inklusif, dan kuantitas 1 sampai stok produk. Batas-batas ini adalah konstanta di satu tempat.
- Setiap pesanan memiliki `order_code` unik yang mudah dibaca (contoh `RNT-7K3Q9XZA`). Vendor melihat nama dan telepon penyewa hanya untuk pesanan tokonya; admin melihat semua.
- Saat checkout, klien mengirim `expected_total` beserta parameter penawaran. Jika harga atau ketersediaan berubah, server menjawab 409 `quote_changed` dengan penawaran baru dan tidak membuat pesanan.

### Ketersediaan dan hold stok

- Ketersediaan dihitung per produk per tanggal. Dalam satu transaksi, kunci baris produk (`SELECT ... FOR UPDATE`), hitung pemakaian per tanggal (pesanan `confirmed`, `renting`, dan `pending_payment` dengan hold yang belum kedaluwarsa menurut `Clock`), lalu pastikan pemakaian ditambah kuantitas baru tidak melebihi stok pada setiap tanggal rentang. Perubahan stok produk mengunci baris yang sama. Jangan menjumlahkan secara naif semua pesanan yang beririsan dengan rentang jika pemakaiannya terjadi pada tanggal berbeda.
- Tahan stok selama 15 menit saat menunggu pembayaran. Abaikan hold yang sudah kedaluwarsa saat menghitung ketersediaan; jalankan pekerjaan berkala dalam proses Go untuk merapikan statusnya. Satu instance API adalah asumsi MVP.

### Status pesanan

| Dari | Aksi | Aktor | Ke | Efek |
|---|---|---|---|---|
| (baru) | checkout | penyewa | `pending_payment` | hold stok 15 menit |
| `pending_payment` | bayar sukses | pemilik pesanan (simulator) | `confirmed` | pembayaran `succeeded` |
| `pending_payment` | bayar gagal | pemilik pesanan (simulator) | `payment_failed` | stok dilepas |
| `pending_payment` | kedaluwarsa | sistem (hold habis) atau simulator | `expired` | stok dilepas |
| `pending_payment` | batal | penyewa, vendor toko, admin | `cancelled` | stok dilepas, tanpa refund |
| `confirmed` | batal | penyewa, vendor toko, admin | `cancelled` | refund mock penuh |
| `confirmed` | serah terima | vendor toko | `renting` | hanya antara `start_date` dan `end_date` (Asia/Jakarta) |
| `renting` | pengembalian | vendor toko | `completed` | waktu pengembalian tercatat |

- Status akhir: `completed`, `cancelled`, `expired`, `payment_failed`. Pembayaran gagal bersifat final; penyewa membuat pesanan baru. Pembayaran setelah hold berakhir ditolak.
- Tidak ada pembatalan setelah serah terima; pesanan diselesaikan melalui pengembalian.
- Pesanan `confirmed` yang melewati `end_date` tanpa serah terima tetap `confirmed`; admin dapat membatalkannya (refund penuh). Tidak ada otomatisasi.
- Pengembalian terlambat tidak dikenai denda dan pesanan tetap `renting` sampai vendor mengonfirmasi. Pengembalian lebih awal diperbolehkan dan tidak membebaskan stok.
- Perubahan status memakai compare-and-set (`UPDATE ... WHERE status = $expected`) dalam transaksi yang mengunci baris pesanan. Permintaan yang kalah balapan menerima 409 beserta status saat ini, kecuali pengulangan identik (lihat idempotensi).
- Catat riwayat status (dari, ke, aktor, waktu), pembayaran, dan refund.

### Pembayaran simulasi dan refund

- Endpoint simulator dipisah dari endpoint pesanan dan hanya dapat dipanggil pemilik pesanan. Simulator aktif jika `PAYMENT_SIMULATOR_ENABLED=true` (nilai `true` pada environment contoh lokal). Simulator mendukung berhasil, gagal, dan kedaluwarsa; hasil "kedaluwarsa" sama dengan hold yang habis.
- Refund mock selalu penuh dan hanya untuk pembayaran yang sukses; satu pembayaran memiliki paling banyak satu refund.

### Idempotensi

- Header `Idempotency-Key` wajib untuk checkout dan simulasi pembayaran. Cakupan kunci adalah (pengguna, endpoint, key), disimpan 24 jam bersama hasilnya. Pengulangan dengan payload sama mengembalikan respons yang sama; payload berbeda menghasilkan 409 `idempotency_key_reuse`.
- Transisi lain (batal, serah terima, pengembalian, refund) idempoten secara alami: pengulangan setelah berhasil mengembalikan keadaan sekarang tanpa menambah riwayat atau mengubah status akhir; transisi yang tidak sah menghasilkan 409.

## Verifikasi

- Sediakan perintah root untuk menjalankan layanan, migrasi, seed, pemeriksaan kontrak, pengujian, build aplikasi server/web/admin, dan build Android. Dokumentasikan konfigurasi API untuk emulator dan perangkat fisik.
- Uji aturan harga dan tanggal inklusif, lintas bulan/tahun dan tahun kabisat; validasi tanggal dan durasi; stok per tanggal dan perebutan stok terakhir; kedaluwarsa hold; idempotensi; pembayaran atau pembatalan bersamaan; refund; serta persistensi setelah restart.
- Uji otorisasi antar pengguna, vendor, dan admin. Gunakan PostgreSQL nyata untuk pengujian integrasi, E2E browser untuk alur pengguna/vendor/admin, dan emulator atau perangkat untuk alur Android.
- Periksa migrasi database kosong, seed berulang, health check, backup/restore lokal, serta pemulihan volume media.
- Pembaruan API harus disertai pembaruan OpenAPI, klien yang terdampak, dan test kontrak.
- Kriteria penerimaan: web dan Android dapat menyelesaikan alur pilih produk → bayar mock → ambil → kembalikan; vendor dan admin dapat menjalankan tugasnya; stok konsisten; demo berjalan tanpa kredensial layanan eksternal; dan APK dapat dipasang. Hosting publik dan publikasi Play Store di luar MVP.
- Java dan `adb` belum ditemukan di `PATH` saat perencanaan. Verifikasi JDK, Android SDK, dan emulator sebelum build atau pengujian Android; laporkan keterbatasan lingkungan secara akurat.

## Cara mengerjakan phase

- Kerjakan phase di `docs/plan.md` secara berurutan: Kelompok A (backend + admin/CMS), B (backend + marketplace web), lalu C (backend + Android). Satu phase memiliki satu fokus: selesaikan task sesuai urutan, penuhi kriteria selesai, dan jalankan build, lint, pemeriksaan tipe, dan test yang relevan sebelum memulai phase berikutnya.
- Catat hasil dan keterbatasan pengujian di akhir phase. Pertahankan project lama sebagai referensi selama pekerjaan berlangsung.

## Progres

Tandai `[x]` saat kriteria selesai dan test phase lulus. Catat keterbatasan singkat di samping phase jika ada.

- [x] 01 Workspace ke backend yang dapat dijalankan — migrasi/seed PostgreSQL, readiness saat database mati, persistensi volume, guard merek, kontrak, build, dan `pnpm check` lulus; golangci-lint dijalankan via Docker karena Application Control Windows.
- [x] 02 Akun admin ke sesi yang terlindungi — integrasi PostgreSQL, role, CSRF/Origin, pembatasan login, expiry/logout, dan browser melalui Vite serta Compose lulus.
- [ ] 03 Konten CMS ke konten publik
- [ ] 04 Pengguna ke persetujuan toko
- [ ] 05 Kategori ke referensi katalog
- [ ] 06 Produk ke moderasi katalog
- [ ] Gate A
- [ ] 07 Pengunjung ke akun dan pengajuan vendor
- [ ] 08 Toko disetujui ke produk terpublikasi
- [ ] 09 Katalog publik ke detail produk
- [ ] 10 Detail produk ke penawaran harga
- [ ] 11 Penawaran harga ke checkout dengan hold stok
- [ ] 12 Checkout ke pembayaran mock dan order terkonfirmasi
- [ ] 13 Pesanan belum diserahkan ke pembatalan dan refund
- [ ] 14 Order terkonfirmasi ke barang diserahkan
- [ ] 15 Barang disewa ke pengembalian dan order selesai
- [ ] 16 Riwayat dan detail pesanan lintas peran
- [ ] 17 Paket demo web yang dapat diulang
- [ ] Gate B
- [ ] 18 Toolchain Android ke aplikasi terhubung API
- [ ] 19 Pengguna Android ke sesi dan profil
- [ ] 20 Katalog Android ke detail produk
- [ ] 21 Detail Android ke checkout dengan hold
- [ ] 22 Checkout Android ke pembayaran dan order terkonfirmasi
- [ ] 23 Order Android ke pemantauan, pembatalan, dan penyelesaian
- [ ] 24 Uji lintas aplikasi dan stabilitas
- [ ] 25 APK penyerahan dan panduan demo
- [ ] Gate akhir

## Perintah

- `pnpm install --frozen-lockfile`: instal dependensi workspace.
- `pnpm db:up` / `pnpm db:down`: mulai/hentikan PostgreSQL lokal tanpa menghapus volume.
- Tetapkan `APP_ENV` dan `DATABASE_URL` seperti `.env.example` sebelum menjalankan API, migrasi, atau seed; lihat `README.md`.
- `pnpm db:migrate` / `pnpm db:seed`: jalankan migrasi / seed lokal idempoten; seed memerlukan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD`.
- `pnpm api:dev` / `pnpm api:build`: jalankan API / build executable ke `.artifacts/`.
- `pnpm contracts:generate` / `pnpm contracts:check`: generate / periksa sinkronisasi OpenAPI dan klien TypeScript.
- `pnpm check`: pemeriksaan merek, kontrak, TypeScript, ESLint, Prettier, gofmt, go vet, golangci-lint via Docker, dan test Go.
- `pnpm test`: test Go melalui Docker; tetapkan `TEST_DATABASE_URL` untuk menjalankan test integrasi PostgreSQL.
- `pnpm admin:dev` / `pnpm admin:build`: jalankan panel admin Vite / build admin.
- `pnpm app:up` / `pnpm app:down`: jalankan / hentikan API, PostgreSQL, dan proxy admin Compose tanpa menghapus volume.
- `pnpm test:admin-browser`: uji login dan logout melalui browser; konfigurasi akun test dan Chrome dijelaskan di `README.md`.
- Build marketplace web dan Android belum tersedia; tambahkan perintah saat phase terkait selesai.
