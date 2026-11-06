# Pengembangan lokal Rentaid

Panduan ini untuk menjalankan dan mengubah aplikasi dari source. Untuk mencoba produk, gunakan [mulai cepat](../../README.md#mulai-cepat) dan [panduan demo web](demo.md). Jalankan perintah dari root repository kecuali dinyatakan lain.

## Prasyarat

- Node.js 24.22.1 dan pnpm 12.14.0, sesuai `package.json` dan `.node-version`.
- Docker Desktop/Engine dengan Docker Compose aktif untuk PostgreSQL, generator Kotlin, dan pemeriksaan Go melalui container.
- Go 1.27.2 untuk API, migrasi, seed, `go vet`, dan gofmt pada host.
- Untuk Android: JDK 17 (lingkungan demo menggunakan Temurin 17.0.20.1), Android SDK Platform 35 dan Build Tools 35.0.0. Atur `JAVA_HOME`, `ANDROID_HOME`, serta `PATH` untuk `platform-tools` dan emulator.

Gradle Wrapper 8.11.1 mengunduh distribusi dengan verifikasi checksum pada build pertama. Perangkat Android minimal Android 8 (API 26). Verifikasi `java -version` dan `adb devices -l` sebelum build atau test perangkat.

Folder aplikasi lama hanya referensi; jangan memakai konfigurasi layanan atau kredensialnya. Workspace pnpm hanya mencakup `apps/*` dan `packages/*`.

## Menjalankan API dan database

Contoh PowerShell berikut memakai PostgreSQL pengembangan pada port 5432. Jika port sudah dipakai, tetapkan `RENTAID_DB_PORT` sebelum `db:up` dan sesuaikan port dalam `DATABASE_URL`.

```powershell
pnpm install --frozen-lockfile
pnpm db:up
$env:APP_ENV = "local"
$env:DATABASE_URL = "postgres://rentaid:rentaid_local@localhost:5432/rentaid?sslmode=disable"
$env:PAYMENT_SIMULATOR_ENABLED = "true"
pnpm db:migrate
$env:SEED_ADMIN_EMAIL = "admin@example.test"
$taskSecret = Read-Host "Password admin lokal (minimal 12 karakter)" -AsSecureString
$taskPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
try { $env:SEED_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr) }
pnpm db:seed
Remove-Item Env:SEED_ADMIN_PASSWORD
pnpm api:dev
```

Periksa `http://127.0.0.1:8080/api/v1/health` untuk liveness proses dan `http://127.0.0.1:8080/api/v1/ready` untuk kesiapan database. Hentikan API dengan Ctrl+C. `pnpm db:down` menghentikan Compose tanpa menghapus volume.

Seed membuat setting demo dan admin, tidak mengganti password akun yang sudah ada, dan menolak `APP_ENV=production`. Untuk membuat akun/toko/produk demo, tetapkan juga `SEED_DEMO_PASSWORD` minimal 12 karakter sebelum `db:seed` menggunakan pola input aman di [mulai cepat](../../README.md#mulai-cepat). Akun demo adalah `demo.pending@example.test`, `demo.approved@example.test`, `demo.rejected@example.test`, dan `demo.suspended@example.test`. Seed tidak menimpa perubahan toko atau produk demo yang sudah ada. Hapus variabel password setelah seed.

## Menjalankan marketplace dan admin

Pada terminal kedua, jalankan `pnpm web:dev` dan buka `http://127.0.0.1:3000/`. Pada terminal ketiga, jalankan `pnpm admin:dev` dan buka `http://127.0.0.1:5173/admin/`.

Next.js meneruskan `/api` ke `API_ORIGIN`, default `http://127.0.0.1:8080`. Pada render sisi server, cookie sesi diteruskan ke API dan data diambil tanpa cache. Proxy Vite juga meneruskan `/api` ke port 8080; targetnya ada di `apps/admin/vite.config.ts`. Tambahkan origin browser ke `ALLOWED_ORIGINS` jika memakai alamat sendiri.

### Seluruh aplikasi melalui Compose

`pnpm app:up` membangun marketplace, admin, API, PostgreSQL, dan gateway. Migrasi berjalan saat API dimulai; seed perlu dijalankan terpisah. Dengan environment seed admin yang sudah ditetapkan, jalankan:

```powershell
pnpm app:up
docker compose -f infra/compose.yaml --profile app exec -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD api /app/rentaid seed
Remove-Item Env:SEED_ADMIN_PASSWORD
```

Tambahkan `-e SEED_DEMO_PASSWORD` pada perintah `exec` jika membutuhkan data demo dan hapus variabel tersebut sesudahnya. Marketplace tersedia di `http://127.0.0.1:8081/`, admin di `/admin/`, dan API di `/api/` pada origin yang sama. `pnpm app:down` menghentikan stack tanpa menghapus volume.

Untuk memilih project terpisah, menjalankan seed otomatis, atau backup/restore, gunakan perintah `demo:*` sesuai [panduan demo](demo.md). `RENTAID_COMPOSE_PROJECT` dibaca oleh pembungkus `demo:*`; perintah `app:*` dan `db:*` tidak membaca variabel tersebut. Jangan menjalankan keduanya pada port yang sama dengan demo terpisah.

## Konfigurasi

[`.env.example`](../../.env.example) berisi contoh tanpa rahasia dan tidak dimuat otomatis oleh perintah pnpm. Environment proses API host terpisah dari environment container; Compose menetapkan konfigurasi API internal pada `infra/compose.yaml`.

| Variabel                                   | Perilaku                                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                                  | Gunakan `local` untuk pengembangan. Cookie memakai `Secure` di luar lokal; seed menolak `production`.                                                                                           |
| `DATABASE_URL`                             | Wajib untuk API/migrasi/seed. Contoh host: `postgres://rentaid:rentaid_local@localhost:5432/rentaid?sslmode=disable`. Compose memakai hostname internal `postgres`.                             |
| `HTTP_ADDR`                                | Default API host `127.0.0.1:8080`; container memakai `0.0.0.0:8080`.                                                                                                                            |
| `SESSION_TTL_DAYS`                         | Default 14 hari. Logout, suspend, dan ganti password mencabut sesi.                                                                                                                             |
| `LOGIN_RATE_LIMIT`                         | Default 5 percobaan per 15 menit per alamat peer, disimpan dalam proses. Proxy lokal dapat membuat klien berbagi batas ini.                                                                     |
| `ALLOWED_ORIGINS`                          | Daftar origin browser dipisahkan koma. Default host mencakup `localhost` dan `127.0.0.1` pada port 3000, 5173, dan 8081. Compose memakai port gateway yang dipilih.                             |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Wajib pada seed; password minimal 12 karakter.                                                                                                                                                  |
| `SEED_DEMO_PASSWORD`                       | Opsional pada seed langsung, wajib pada `demo:up`/`demo:seed`; password minimal 12 karakter.                                                                                                    |
| `MEDIA_DIR`                                | Default API `../../.artifacts/media`, relatif terhadap direktori kerja `apps/api`, sehingga berada di root `.artifacts/media`. Compose memakai volume `media_data` di `/var/lib/rentaid/media`. |
| `PAYMENT_SIMULATOR_ENABLED`                | API mengaktifkan simulator hanya jika bernilai `true`; `.env.example` dan Compose lokal menyediakannya.                                                                                         |
| `API_ORIGIN`                               | Koneksi server Next.js ke API; default host `http://127.0.0.1:8080`, Compose `http://api:8080`.                                                                                                 |
| `RENTAID_COMPOSE_PROJECT`                  | Pemilihan project oleh `demo:*`; default `rentaid`.                                                                                                                                             |
| `RENTAID_DB_PORT` / `RENTAID_HTTP_PORT`    | Port host Compose; default 5432 / 8081. Mengganti port database tidak mengubah URL antarcontainer.                                                                                              |

Database dan media perlu dicadangkan bersama. Mengganti atau menghapus referensi gambar dari formulir tidak otomatis menghapus file media. Gunakan [backup dan restore demo](demo.md#backup-database-dan-media).

## Kontrak dan build

[OpenAPI](../../packages/contracts/openapi.json) adalah sumber kontrak REST `/api/v1`. Setelah perubahan kontrak, perbarui implementasi, test, dan klien terdampak:

```powershell
pnpm contracts:generate
pnpm android:generate
pnpm contracts:check
pnpm android:client-check
```

Generator TypeScript memperbarui tipe klien dan salinan kontrak API. Generator Kotlin memakai Docker OpenAPI Generator 7.13.0. Commit hasil generate bersama perubahan kontrak.

| Perintah             | Hasil                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `pnpm api:build`     | Executable API di `.artifacts/`.                                              |
| `pnpm web:build`     | Build produksi Next.js.                                                       |
| `pnpm admin:build`   | Pemeriksaan tipe dan build Vite admin.                                        |
| `pnpm android:build` | APK debug di `apps/android/app/build/outputs/apk/debug/app-debug.apk`.        |
| `pnpm android:check` | ktlint serta build debug dan release.                                         |
| `pnpm android:demo`  | APK debug USB/emulator dan manifest checksum di `.artifacts/android-demo/`.   |
| `pnpm check`         | Pemeriksaan terpadu, termasuk Android; lihat [panduan pengujian](testing.md). |

### Koneksi Android

APK debug default memakai `http://10.0.2.2:8081` untuk emulator. Jalankan stack Compose lalu pasang dengan `adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk` dan pilih **Periksa koneksi**. Untuk USB, aktifkan `adb reverse tcp:8081 tcp:8081` lalu build dari `apps/android`:

```powershell
.\gradlew.bat assembleDebug -PapiBaseUrl=http://127.0.0.1:8081
```

Kembali ke root setelah menjalankan Gradle. Untuk LAN, API harus mendengarkan alamat yang dapat dijangkau perangkat; sesuaikan `HTTP_ADDR` dan gunakan origin tersebut pada `-PapiBaseUrl`. Gateway Compose default hanya mendengarkan localhost. HTTP diizinkan hanya pada debug; release memakai `https://localhost` sebagai placeholder hingga alamat deployment ditentukan. Build release belum merupakan paket untuk publikasi store.

Untuk APK USB/emulator yang siap demo, ikuti [panduan Android](../users/android.md). Pengujian perangkat dan pemulihan lintas proses ada di [panduan pengujian](testing.md#android-dan-perangkat).

## Referensi alur dan API

Ringkasan ini mempertahankan petunjuk fitur yang sebelumnya berada di README. Bentuk request/response lengkap mengikuti OpenAPI; aturan bisnis kanonik berada di [aturan bisnis](../business/rules.md).

### Akun dan persetujuan toko

Pengguna dapat mendaftar, login, memperbarui profil, dan mengajukan satu toko dengan nama, alamat, serta telepon wajib. Di admin, antrean mendahulukan pengajuan menunggu. Penolakan dan suspend memerlukan alasan; toko ditolak dapat diperbaiki dan diajukan ulang. Toko dapat diaktifkan kembali, tetapi mengaktifkan pengguna tidak memulihkan sesi yang sudah dicabut. Admin ditolak login di marketplace.

API pemilik toko tersedia di `/api/v1/store` dan `/api/v1/store/history`; admin memakai `/api/v1/admin/users` dan `/api/v1/admin/stores`. Dashboard dan pengelolaan produk vendor memerlukan toko disetujui. Pesanan toko suspended tetap dapat dibatalkan, diserahkan, atau dikembalikan sesuai statusnya.

### CMS dan media

Di admin, pilih Beranda, FAQ, Tentang, Syarat penggunaan, atau Kebijakan privasi. Judul dan isi berupa teks biasa; gambar opsional. **Simpan draft** hanya mengubah draft; **Publikasikan** menyimpan dan menerbitkan snapshot terbaru. Perubahan berikutnya perlu dipublikasikan kembali agar terlihat oleh publik.

`GET /api/v1/content/{key}` menerima `home`, `faq`, `about`, `terms`, atau `privacy`. Media publik dapat dibaca melalui `GET /api/v1/media/{id}` ketika direferensikan konten/produk publik; media draft CMS hanya melalui endpoint admin. API memverifikasi JPEG/PNG/WebP dari isi file, membatasi 5 MB, dan mengganti nama file secara acak.

### Kategori dan produk

Admin menambah, mengganti nama, dan menghapus kategori satu level. `GET /api/v1/categories` memakai `page` dan `page_size` (default 20, maksimal 50). Penggantian nama mempertahankan UUID; foreign key produk mencegah penghapusan kategori terpakai dengan respons 409.

Vendor mengelola `/api/v1/vendor/products` dan mengunggah foto melalui `/api/v1/vendor/media`. Nama, deskripsi, kategori, harga harian positif, dan stok wajib; stok nol diperbolehkan dan foto opsional maksimal sepuluh. Dari dashboard `/vendor`, simpan draft, lalu **Terbitkan**. Arsip menghentikan publikasi; pemulihan mengembalikan produk menjadi draft. Produk yang pernah dipesan tidak dihapus permanen dan stok tidak boleh diturunkan di bawah pemakaian puncak aktif pada hari ini dan masa depan.

Admin dapat menyembunyikan/mengaktifkan produk dengan alasan tercatat. Katalog hanya menampilkan produk terbit yang tidak diarsipkan/disembunyikan dari toko disetujui. `GET /api/v1/products` mendukung `q`, `category_id`, `page`, dan `page_size`; pencarian nama/deskripsi tidak membedakan huruf besar/kecil dan memperlakukan input sebagai teks biasa. Halaman `/katalog` dan detail menampilkan foto, harga, stok, toko, serta alamat pengambilan; data kosong, produk nonpublik, dan API gagal ditangani melalui pesan UI.

### Penawaran, checkout, dan pembayaran

Dari detail produk, pilih tanggal `YYYY-MM-DD` dan jumlah barang. `GET /api/v1/products/{id}/quote` memakai `start_date`, `end_date`, dan `quantity`. Penawaran menghitung harga inklusif maksimal 30 hari dan ketersediaan per tanggal, tanpa membuat pesanan atau hold. Stok tidak cukup menghasilkan 409 `stock_unavailable`.

Checkout memerlukan pengguna login dengan telepon terisi. `POST /api/v1/checkout` menerima parameter penawaran, `expectedTotal`, `expectedAvailable`, dan header `Idempotency-Key`. Perubahan penawaran menghasilkan 409 `quote_changed` tanpa pesanan. Checkout berhasil membuat `pending_payment`, snapshot harga, dan hold 15 menit. `GET /api/v1/orders/{id}` hanya dapat dibaca pemiliknya. Hold kedaluwarsa segera diabaikan dalam ketersediaan; pekerja API merapikan status saat startup dan setiap menit.

`POST /api/v1/payment-simulator` terpisah dari endpoint pesanan, hanya untuk pemilik pesanan, dan memakai nilai pembayaran tersimpan. Simulasi berhasil mengubah pesanan menjadi `confirmed`; gagal atau kedaluwarsa bersifat final dan melepas stok. Pembayaran setelah hold berakhir ditolak. Checkout dan pembayaran memakai kunci idempotensi selama 24 jam: payload sama mengembalikan hasil tersimpan, payload berbeda dengan kunci sama ditolak.

### Pembatalan, serah terima, dan pengembalian

Penyewa, vendor terkait, dan admin dapat membatalkan sebelum serah terima. `POST /api/v1/orders/{id}/cancel` menerima `expectedStatus` (`pending_payment` atau `confirmed`). Sebelum bayar, hold dilepas tanpa refund; setelah pembayaran sukses, refund simulasi penuh dicatat sekali. Admin dapat membatalkan pesanan terkonfirmasi yang melewati masa sewa tanpa serah terima.

Vendor pemilik toko memakai `POST /api/v1/vendor/orders/{id}/handover` untuk mengubah `confirmed` menjadi `renting`, hanya selama rentang sewa inklusif menurut Asia/Jakarta. `POST /api/v1/vendor/orders/{id}/return` mengubah `renting` menjadi `completed` dan mencatat waktu pengembalian. Setelah serah terima pesanan tidak dapat dibatalkan. Pengembalian terlambat tanpa denda; pengembalian awal tetap memakai stok sampai tanggal akhir.

Pengulangan transisi sukses mengembalikan keadaan saat ini tanpa menambah riwayat; konflik status atau transisi tidak sah menghasilkan 409. Browser memerlukan sesi, CSRF, dan Origin yang sesuai untuk tindakan perubahan.

### Riwayat dan privasi pesanan

Penyewa membuka **Pesanan saya**; vendor melihat pesanan tokonya dan admin melihat seluruh pesanan. API daftar `/api/v1/orders`, `/api/v1/vendor/orders`, dan `/api/v1/admin/orders` memakai `status`, `page`, dan `page_size`. Detail tersedia di `/api/v1/orders/{id}/detail`, `/api/v1/vendor/orders/{id}`, dan `/api/v1/admin/orders/{id}`. Transaksi admin juga tersedia di `/api/v1/admin/payments`.

Detail menampilkan snapshot harga, pembayaran, refund, aktor, dan waktu riwayat dalam zona Jakarta. Kontak penyewa hanya dibagikan kepada vendor toko terkait dan admin. Pada Android, gunakan **Muat ulang** untuk menyegarkan tindakan vendor/admin; lihat [penggunaan dan pemulihan Android](../users/android.md#akun-katalog-dan-pemulihan).
