# Rentaid — pengembangan lokal

Workspace ini berisi marketplace Next.js, API Go, admin React + Vite, kontrak OpenAPI, klien TypeScript, dan PostgreSQL lokal. Ruang lingkup dan urutan implementasi ada di [AGENTS.md](AGENTS.md) dan [rencana pengembangan](docs/plan.md).

Paket demo lengkap, akun, alur pengguna, dan backup/restore dijelaskan pada [panduan demo web](docs/demo.md). Jalankan `pnpm demo:up` setelah mengatur environment seed.

## Prasyarat

- Node.js 24.22.1 dan pnpm 12.14.0.
- Go 1.27.2.
- Docker Desktop/Engine dengan Docker Compose aktif.

Folder aplikasi lama tidak dibutuhkan untuk menjalankan fondasi ini. Jangan menggunakan kredensial dari project lama.

## Menjalankan di Windows PowerShell

```powershell
pnpm install --frozen-lockfile
pnpm db:up
$env:APP_ENV = "local"
$env:DATABASE_URL = "postgres://rentaid:rentaid_local@localhost:5432/rentaid?sslmode=disable"
pnpm db:migrate
# Ikuti bagian Phase 02 untuk membuat akun admin.
pnpm api:dev
```

Gunakan terminal lain untuk memeriksa `http://127.0.0.1:8080/api/v1/health` dan `http://127.0.0.1:8080/api/v1/ready`. Liveness menguji proses; readiness memeriksa koneksi PostgreSQL. Hentikan API dengan Ctrl+C. `pnpm db:down` menghentikan layanan Compose tanpa menghapus volume.

Nilai contoh tersedia dalam `.env.example`; file itu tidak dimuat otomatis. Jika port 5432 sudah digunakan, sesuaikan port Compose dan `DATABASE_URL` sebelum memulai.

## Pemeriksaan dan build

```powershell
pnpm contracts:generate
pnpm contracts:check
pnpm check
pnpm test
pnpm api:build
```

`pnpm check` memeriksa nama lama pada folder baru, sinkronisasi kontrak dan klien, tipe TypeScript, ESLint, Prettier, gofmt, go vet, golangci-lint, dan test Go. Pemeriksaan golangci-lint berjalan melalui image Docker berversi tetap; pertama kali dijalankan, Docker mengunduh image tersebut. Build API disimpan di `.artifacts/`.

Untuk menjalankan test integrasi database, buat database khusus test menggunakan `docker compose -f infra/compose.yaml exec postgres psql -U rentaid -d postgres -c "CREATE DATABASE rentaid_test"`, tetapkan `$env:TEST_DATABASE_URL` ke URL PostgreSQL database tersebut pada port 5432, lalu jalankan `pnpm test`. Test integrasi dilewati jika variabel itu tidak tersedia. Seed membuat setting demo dan akun admin dari environment, serta menolak `APP_ENV=production`.

## Android: toolchain dan koneksi lokal

Gunakan JDK Temurin 17.0.20.1, Android SDK Platform 35 dan Build Tools 35.0.0. Atur `JAVA_HOME` dan `ANDROID_HOME` ke instalasi masing-masing. Gradle Wrapper 8.11.1 mengunduh distribusi yang telah diverifikasi checksum pada build pertama.

```powershell
pnpm android:client-check
pnpm android:check
pnpm android:build
```

APK debug tersedia di `apps/android/app/build/outputs/apk/debug/app-debug.apk`. Jalankan `pnpm app:up`, lalu pasang APK dengan `adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk`. Buka Rentaid dan pilih **Periksa koneksi**. Emulator menggunakan `http://10.0.2.2:8081` secara default. Untuk perangkat USB, jalankan `adb reverse tcp:8081 tcp:8081`, kemudian build dengan `cd apps/android; .\gradlew.bat assembleDebug -PapiBaseUrl=http://127.0.0.1:8081`. Untuk alamat LAN, jalankan API pada alamat yang dapat dijangkau perangkat dan gunakan alamat tersebut dengan `-PapiBaseUrl`. Gateway Compose default hanya mendengarkan localhost, sehingga tidak langsung dapat diakses lewat LAN. HTTP hanya diizinkan dalam build debug; alamat HTTPS localhost pada release adalah placeholder sampai alamat deployment ditentukan.

Jalankan `pnpm android:generate` setelah mengubah kontrak OpenAPI dan commit klien yang diperbarui. Generator menggunakan image Docker OpenAPI Generator 7.13.0; `pnpm android:client-check` memeriksa kecocokan hasilnya. Test instrumentasi membuat data dan memerlukan fixture katalog; gunakan database terpisah seperti petunjuk berikut.

## Phase 19 — Akun Android

Pilih **Akun dan profil** untuk mendaftar, masuk, mengubah nama dan nomor telepon, atau keluar. Token sesi dienkripsi menggunakan Android Keystore dan dipulihkan setelah aplikasi dibuka kembali. Jika koneksi terputus, coba lagi; logout memerlukan koneksi agar server dapat mencabut sesi. Sesi kedaluwarsa atau akun yang ditangguhkan meminta pengguna masuk kembali.

## Phase 20 — Katalog Android dan test perangkat

Beranda menampilkan konten CMS yang telah diterbitkan. Pilih **Lihat katalog** untuk mencari produk, menyaring kategori, membuka halaman berikutnya, dan melihat detail serta foto produk. Konten FAQ, tentang, syarat, dan privasi dapat dibuka dari beranda. Foto yang gagal dimuat menampilkan pesan tanpa menghentikan aplikasi.

Test instrumentasi akun, katalog, dan checkout membuat data, sehingga gunakan database test baru yang terpisah. Contoh PowerShell berikut menggunakan PostgreSQL Compose, image `rentaid-api` yang sudah dibangun, dan satu perangkat USB:

```powershell
docker compose -f infra/compose.yaml exec -T postgres psql -U rentaid -d postgres -c 'CREATE DATABASE rentaid_android_test'
docker run -d --name rentaid-android-test-api --network rentaid_default -p 127.0.0.1:18083:8080 -e APP_ENV=local -e HTTP_ADDR=0.0.0.0:8080 -e ALLOWED_ORIGINS=http://localhost:18083 -e 'DATABASE_URL=postgres://rentaid:rentaid_local@postgres:5432/rentaid_android_test?sslmode=disable' -e SEED_ADMIN_EMAIL=admin@example.test -e SEED_ADMIN_PASSWORD=Phase21-test-password! -e SEED_DEMO_PASSWORD=Phase21-test-password! rentaid-api /bin/sh -c '/app/rentaid migrate && /app/rentaid seed && exec /app/rentaid serve'
# Tunggu http://127.0.0.1:18083/api/v1/ready mengembalikan status ok.
Get-Content -Raw tests/android/phase20-fixtures.sql | docker compose -f infra/compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U rentaid -d rentaid_android_test
Get-Content -Raw tests/android/phase21-fixtures.sql | docker compose -f infra/compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U rentaid -d rentaid_android_test
adb reverse tcp:18083 tcp:18083
cd apps/android
.\gradlew.bat connectedDebugAndroidTest -PapiBaseUrl=http://127.0.0.1:18083
```

Untuk emulator, gunakan alamat `http://10.0.2.2:18083`. Fixture membuat produk dan konten publik, produk nonpublik, foto yang sengaja gagal dimuat, dan produk dengan satu stok untuk pengujian persaingan web–Android; jalankan sekali pada database baru. Test API Go terhadap PostgreSQL terpisah dapat dijalankan dengan `TEST_DATABASE_URL` yang menunjuk database test dan `pnpm test`. Kembali ke root workspace setelah menjalankan Gradle.

## Phase 21 — Penawaran dan checkout Android

Dari detail produk, pilih **Rencanakan sewa**, isi tanggal mulai dan selesai dalam format `YYYY-MM-DD`, serta jumlah barang. Periksa penawaran dari server sebelum melanjutkan checkout. Jika harga atau ketersediaan berubah, periksa dan setujui kembali penawaran terbaru. Setelah checkout berhasil, aplikasi menampilkan kode pesanan dan sisa waktu hold berdasarkan waktu server.

Jika hasil checkout tidak diketahui karena koneksi terputus, pilih **Periksa dan coba lagi**. Aplikasi menyimpan kunci dan data checkout secara terenkripsi serta memakai data yang sama saat mencoba ulang, termasuk setelah aplikasi dibuka kembali. Gunakan akun dan alamat server yang sama. Setelah masa kunci 24 jam hampir habis, retry otomatis diblokir; minta admin memeriksa pesanan sebelum membuat checkout baru.

## Phase 22 — Pembayaran simulasi Android

Pada pesanan yang menunggu pembayaran, pilih **Simulasikan berhasil**, **Simulasikan gagal**, atau **Simulasikan kedaluwarsa**. Ini adalah simulasi lokal dan tidak memindahkan uang. Status pesanan diperbarui dari server; pembayaran gagal dan kedaluwarsa bersifat final.

Jika aplikasi ditutup atau koneksi terputus saat pembayaran, buka **Lanjutkan pesanan** di beranda dengan akun dan server yang sama. Aplikasi memeriksa hasil dan menggunakan kunci yang sama saat perlu mencoba ulang. Setelah masa kunci hampir 24 jam, aplikasi tidak mengirim ulang; jika hasil tetap belum diketahui, minta admin memeriksa pesanan. Simulator harus diaktifkan melalui `PAYMENT_SIMULATOR_ENABLED=true` pada API lokal.

Untuk memverifikasi pemulihan lintas proses pada perangkat dengan API test di atas, pasang APK test lalu jalankan metode instrumentasi `PaymentRecoveryProcessTest#prepareInterruptedPayment`, hentikan aplikasi dengan `adb shell am force-stop id.rentaid.app`, dan jalankan metode `PaymentRecoveryProcessTest#recoverInterruptedPayment`. Kedua tahap menggunakan penyimpanan test terpisah.

## Phase 23 — Pesanan Android

Pilih **Pesanan saya** pada beranda untuk melihat riwayat dan detail pembayaran, refund simulasi, serta perubahan status. Gunakan **Muat ulang** untuk memeriksa tindakan terbaru vendor atau admin. Pesanan yang masih menunggu pembayaran atau telah terkonfirmasi dapat dibatalkan setelah konfirmasi; server menentukan hasil akhir dan refund simulasi penuh untuk pembayaran yang berhasil.

Test instrumentasi `OrderCrossClientIntegrationTest` dan `OrderUiIntegrationTest` memakai database test terpisah dan fixture yang dijelaskan di atas. Untuk menguji tindakan vendor melalui browser sungguhan, jalankan marketplace dengan `API_ORIGIN` menuju API test, izinkan origin marketplace pada `ALLOWED_ORIGINS`, pasang APK debug dan APK test yang menunjuk API test, dan pastikan `adb reverse` aktif. Tetapkan `ANDROID_HOME`, `ANDROID_SERIAL`, `CHROME_PATH`, `E2E_VENDOR_PASSWORD`, serta `E2E_WEB_URL` jika bukan `http://127.0.0.1:3000`, lalu jalankan `pnpm test:android-vendor`. Test membuat akun dan pesanan baru pada database test.

## Phase 24 — Stabilitas lintas aplikasi

`pnpm test:stability` membangun stack Compose test terpisah dan menjalankan web, admin, serta Android pada API dan PostgreSQL yang sama. Pengujian memutus respons checkout/pembayaran setelah commit, menghentikan proses Android, me-restart API dan PostgreSQL, memeriksa sesi offline dan pencabutan sesi oleh admin, serta menguji stok dan transaksi lintas aplikasi. Tetapkan `JAVA_HOME`, `ANDROID_HOME`, `ANDROID_SERIAL`, dan `CHROME_PATH`; port 18083, 18084, dan 15432 harus tersedia. Lihat [panduan dan bukti pengujian](docs/phase24-testing.md).

Untuk menguji pemulihan sesi lintas proses setelah paket test terpasang, jalankan perintah berikut dengan satu perangkat aktif dan API test tetap berjalan. Tahap pertama membuat sesi; tahap kedua memverifikasi sesi setelah aplikasi dihentikan, kemudian logout:

```powershell
adb shell am instrument -w -e sessionPhase prepare -e class 'id.rentaid.app.SessionProcessTest#prepareSession' id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner
adb shell am force-stop id.rentaid.app
adb shell am instrument -w -e sessionPhase restore -e class 'id.rentaid.app.SessionProcessTest#restoreSession' id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner
```

## Phase 02 — Admin dan autentikasi

Seed memerlukan email admin dan password minimal 12 karakter melalui environment. Seed tidak mengubah password admin yang sudah ada dan menolak berjalan pada `APP_ENV=production`.

Untuk pengembangan lokal, setelah PostgreSQL aktif dan `DATABASE_URL` ditetapkan:

```powershell
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

Pada terminal kedua, jalankan `pnpm admin:dev` dan buka `http://127.0.0.1:5173/admin/`. Proxy Vite meneruskan `/api` ke API lokal.

Untuk menjalankan aplikasi melalui Compose, gunakan `pnpm app:up` dan buka `http://127.0.0.1:8081/admin/`. Tetapkan `SEED_ADMIN_EMAIL` dan `SEED_ADMIN_PASSWORD` di terminal seperti di atas, lalu jalankan:

```powershell
docker compose -f infra/compose.yaml --profile app exec -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD api /app/rentaid seed
Remove-Item Env:SEED_ADMIN_PASSWORD
```

`pnpm app:down` menghentikan aplikasi dan database tanpa menghapus volume. `SESSION_TTL_DAYS` default 14 hari, `LOGIN_RATE_LIMIT` default lima percobaan per 15 menit, dan `ALLOWED_ORIGINS` menentukan origin browser yang diizinkan.

`pnpm test` menggunakan image Docker Go/lint yang dipin untuk menghindari pembatasan executable lokal Windows. Tetapkan `TEST_DATABASE_URL` ke database test terpisah untuk menjalankan test integrasi. Untuk test UI dengan Chrome/Chromium yang sudah terpasang, siapkan akun admin test, tetapkan `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH`, lalu jalankan `pnpm test:admin-browser`. Default URL browser adalah `http://127.0.0.1:8081`; `E2E_BASE_URL` dapat menggantinya.

## Phase 03 — Konten dan media

Setelah login admin, pilih Beranda, FAQ, Tentang, Syarat penggunaan, atau Kebijakan privasi. Isi judul dan konten sebagai teks biasa; gambar JPEG, PNG, atau WebP maksimal 5 MB bersifat opsional. **Simpan draft** menyimpan perubahan untuk admin. **Publikasikan** menyimpan lalu menerbitkan snapshot terbaru. Perubahan berikutnya tidak muncul di API publik sampai dipublikasikan kembali.

API publik menyediakan `GET /api/v1/content/{key}` untuk key `home`, `faq`, `about`, `terms`, dan `privacy`. Gambar yang direferensikan versi publik tersedia di `GET /api/v1/media/{id}`; gambar draft hanya tersedia melalui endpoint admin.

`MEDIA_DIR` menentukan lokasi media lokal. Default untuk `pnpm api:dev` adalah `.artifacts/media` di root repository; Compose menggunakan volume `media_data`. Cadangkan database dan volume media bersama agar referensi gambar tetap sesuai. Menghapus atau mengganti gambar dalam draft tidak langsung menghapus file dari penyimpanan.

Untuk test browser konten, gunakan API dan database test terpisah dengan halaman FAQ kosong, lalu tetapkan `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH` seperti pada test admin. Jalankan `pnpm test:admin-content`. Test menulis dan memublikasikan FAQ sehingga tidak boleh diarahkan ke data pengguna.

## Phase 04 - Pengguna dan persetujuan toko

Pengguna mendaftar dan mengelola profil melalui API. Pengajuan toko mewajibkan nama, alamat, dan nomor telepon; setiap pengguna hanya memiliki satu toko. Admin melihat antrean toko yang menempatkan pengajuan menunggu di awal, memeriksa detail dan riwayat, lalu menyetujui atau menolak. Penolakan memerlukan alasan dan pemilik dapat memperbaiki data serta mengajukan ulang. Toko yang disetujui dapat ditangguhkan dengan alasan dan diaktifkan kembali. Admin juga dapat menangguhkan pengguna; seluruh sesi pengguna dicabut dan tidak kembali aktif setelah akun diaktifkan.

API pemilik tersedia di `/api/v1/store` dan riwayatnya di `/api/v1/store/history`; endpoint admin tersedia di `/api/v1/admin/users` dan `/api/v1/admin/stores`. Kontrak lengkap tersedia di `packages/contracts/openapi.json`. Antarmuka pengajuan toko dan pengelolaan produk vendor tersedia pada marketplace.

Untuk membuat empat akun dan toko demo opsional, tetapkan `SEED_DEMO_PASSWORD` (minimal 12 karakter) sebelum menjalankan `pnpm db:seed`, bersama variabel seed admin seperti di atas. Akunnya `demo.pending@example.test`, `demo.approved@example.test`, `demo.rejected@example.test`, dan `demo.suspended@example.test`, semuanya menggunakan password demo tersebut. Seed berulang tidak mengubah akun atau password yang sudah ada. Untuk Compose, tambahkan `-e SEED_DEMO_PASSWORD` pada perintah `docker compose ... exec` yang dijelaskan di bagian Phase 02. Hapus variabel password dari environment setelah selesai.

Untuk memeriksa alur admin melalui browser, gunakan layanan dan database test terpisah lalu tetapkan `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH`; jalankan `pnpm test:admin-stores`. Test membuat akun dan toko baru serta mengubah statusnya, sehingga tidak boleh diarahkan ke data pengguna. Pengujian bahwa produk dari toko belum disetujui atau ditangguhkan tidak dapat dipublikasikan dilakukan pada Phase 06, ketika fitur produk tersedia.

## Phase 05 - Kategori katalog

Admin dapat menambahkan, mengubah nama, dan menghapus kategori melalui panel. Endpoint publik `GET /api/v1/categories` mendukung `page` dan `page_size` (default 20, maksimal 50). Perubahan nama mempertahankan UUID kategori. Penghapusan kategori yang dirujuk foreign key produk ditolak dengan respons 409.

`pnpm test:admin-categories` memeriksa alur kategori di browser. Tetapkan variabel `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH` seperti pada test admin lainnya, dan gunakan database test terpisah. Pengujian foreign key saat ini menggunakan tabel produk sementara; integrasi dengan produk sebenarnya dilakukan pada Phase 06.

## Phase 06 - Produk dan moderasi katalog

Vendor dengan toko yang disetujui dapat menggunakan API `/api/v1/vendor/products` untuk membuat dan mengubah produk, mengatur publikasi dan arsip, serta mengunggah foto melalui `/api/v1/vendor/media`. Nama, deskripsi, kategori, harga harian, dan stok wajib; foto opsional (maksimal sepuluh). Harga harus positif dan stok boleh nol. Antarmuka vendor tersedia di dashboard marketplace setelah toko disetujui.

Admin dapat meninjau produk dan riwayat moderasi melalui panel. Menyembunyikan atau mengaktifkan kembali produk memerlukan alasan. API publik `/api/v1/products` hanya menampilkan produk terbit yang tidak diarsipkan atau disembunyikan dan berasal dari toko yang disetujui. Saat `SEED_DEMO_PASSWORD` disediakan pada `pnpm db:seed`, seed juga membuat beberapa kategori dan produk demo tanpa menimpa produk demo yang sudah ada.

Jalankan `pnpm test:admin-products` pada database test terpisah yang sudah diberi seed demo; tetapkan variabel browser seperti test admin lainnya. Test mengubah status moderasi produk demo dan menyimpan riwayat. Pengujian stok terhadap pesanan aktif dan pengarsipan produk yang pernah dipesan dilakukan pada Phase 11.

## Phase 07 - Akun marketplace dan pengajuan toko

Setelah API dan PostgreSQL berjalan, jalankan `pnpm web:dev` dan buka `http://127.0.0.1:3000`. Marketplace menggunakan proxy Next.js untuk `/api`; `API_ORIGIN` default adalah `http://127.0.0.1:8080`. Tambahkan origin web ke `ALLOWED_ORIGINS` bila memakai konfigurasi sendiri. `pnpm web:build` membuat build produksi.

Pengunjung dapat mendaftar, masuk, memperbarui profil, mengajukan toko, melihat alasan penolakan, dan mengajukan ulang. Setelah admin menyetujui toko, dashboard vendor tersedia. Sesi browser menggunakan cookie HttpOnly dan token CSRF; saat render sisi server Next.js meneruskan cookie ke API Go. Endpoint dashboard dan pembacaan produk vendor menolak toko yang belum disetujui atau sedang ditangguhkan.

`pnpm app:up` membangun dan menjalankan marketplace, admin, API, PostgreSQL, dan proxy Compose pada satu origin: marketplace `http://127.0.0.1:8081/`, admin `http://127.0.0.1:8081/admin/`. Untuk menguji alur browser secara menyeluruh, gunakan database terpisah, siapkan admin test, lalu tetapkan `E2E_WEB_URL`, `E2E_ADMIN_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH`; jalankan `pnpm test:marketplace-account`. Default URL adalah `http://127.0.0.1:3000` dan `http://127.0.0.1:5173`. Test membuat akun dan toko baru serta mengubah statusnya.

## Phase 08 - Pengelolaan produk vendor

Vendor dengan toko yang disetujui dapat membuka dashboard dan menambahkan atau mengedit produk dengan nama, deskripsi, kategori, harga harian, stok, serta maksimal sepuluh foto opsional. Simpan produk sebagai draft, lalu pilih **Terbitkan** agar tampil pada API katalog publik. Vendor juga dapat menghentikan publikasi, mengarsipkan, dan memulihkan produk sebagai draft. Label moderasi menunjukkan jika admin menyembunyikan produk. Harga harus positif; stok boleh nol.

Foto JPEG, PNG, atau WebP dibatasi 5 MB per file dan divalidasi API dari isi file. Foto yang dihapus dari formulir atau tidak jadi digunakan tidak otomatis dihapus dari penyimpanan lokal. Aturan stok terhadap pesanan aktif dan produk yang pernah dipesan diterapkan pada Phase 11.

Untuk uji browser, gunakan database test terpisah yang sudah diberi seed admin dan demo, lalu tetapkan `E2E_WEB_URL`, `E2E_ADMIN_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_VENDOR_PASSWORD`, dan `CHROME_PATH`. `E2E_VENDOR_PASSWORD` adalah password seed demo untuk `demo.approved@example.test`. Jalankan `pnpm test:vendor-products`. Test membuat dan mengubah produk serta akun dan toko test, dan memproses moderasi melalui admin.

## Phase 09 - Katalog publik

Beranda menampilkan konten `home` yang diterbitkan melalui CMS dan pilihan produk publik. Pengunjung dapat membuka `/katalog`, mencari nama atau deskripsi produk, memfilter kategori, berpindah halaman, dan membuka detail berisi foto, harga harian, stok, nama toko, dan alamat pengambilan. Produk yang tidak lagi publik tidak dapat dibuka. Beranda dan katalog tetap memberikan pesan yang sesuai ketika konten kosong atau API tidak tersedia.

API `GET /api/v1/products` menerima `q`, `category_id`, `page`, dan `page_size`. Pencarian nama dan deskripsi tidak membedakan huruf besar/kecil dan memperlakukan karakter pencarian sebagai teks biasa. Data publik diambil tanpa cache agar publikasi CMS dan moderasi produk segera terlihat.

Jalankan `pnpm test:public-catalog` dengan variabel browser dan database test terpisah seperti Phase 08. Test membuat produk dan mengubah konten beranda serta status moderasi, sehingga tidak boleh diarahkan ke data pengguna. `pnpm test:catalog-errors` memeriksa penanganan kegagalan API tanpa database.

## Phase 10 - Penawaran harga

Pada detail produk, pengunjung dapat memilih tanggal mulai, tanggal selesai, dan jumlah barang untuk melihat penawaran. Server menghitung hari secara inklusif, maksimal 30 hari, dengan tanggal hari ini menggunakan zona Asia/Jakarta. Total adalah harga harian dikali jumlah hari dan barang. Penawaran memeriksa ketersediaan setiap tanggal, termasuk pesanan aktif dan hold yang belum kedaluwarsa, tetapi tidak menyimpan pesanan atau menahan stok. Checkout dan validasi ulang penawaran dilakukan pada Phase 11.

API `GET /api/v1/products/{id}/quote` menerima parameter `start_date`, `end_date` (format `YYYY-MM-DD`), dan `quantity`. Respons memuat durasi, harga harian, jumlah tersedia, dan total; stok yang tidak cukup menghasilkan 409 `stock_unavailable`. Gunakan database demo terpisah yang sudah diberi seed dan tetapkan `E2E_WEB_URL` serta `CHROME_PATH`, lalu jalankan `pnpm test:product-quote` untuk menguji formulir melalui browser.

## Phase 11 - Checkout dan hold stok

Pengguna yang sudah masuk dan mengisi nomor telepon dapat melanjutkan penawaran ke checkout. Server memeriksa kembali harga dan ketersediaan, membuat pesanan `pending_payment`, dan menahan stok selama 15 menit. Detail pesanan menampilkan batas waktu dalam zona Asia/Jakarta. Pembayaran simulasi baru tersedia pada Phase 12; pembersihan status hold kedaluwarsa dilakukan pada Phase 13, tetapi hold kedaluwarsa sudah diabaikan dalam perhitungan stok.

`POST /api/v1/checkout` memerlukan sesi pengguna, `Idempotency-Key`, parameter penawaran, `expectedTotal`, dan `expectedAvailable`. Respons 409 `quote_changed` memuat penawaran terbaru tanpa membuat pesanan. Kunci dengan payload yang sama mengembalikan hasil tersimpan selama 24 jam; payload berbeda ditolak. Endpoint `GET /api/v1/orders/{id}` hanya dapat dibaca pemilik pesanan. Gunakan database demo terpisah dan tetapkan `E2E_WEB_URL` serta `CHROME_PATH`, lalu jalankan `pnpm test:checkout`; test membuat akun dan pesanan.

## Phase 12 - Pembayaran simulasi

Halaman pesanan menyediakan pilihan simulasi berhasil, gagal, dan kedaluwarsa. Ini simulasi lokal dan tidak memindahkan uang. Hasil berhasil mengonfirmasi pesanan; gagal atau kedaluwarsa melepaskan stok. Pembayaran setelah batas hold ditolak dan pesanan menjadi kedaluwarsa. Daftar pesanan vendor menampilkan pesanan tokonya, sedangkan admin dapat membuka daftar dan detail transaksi.

Aktifkan simulator dengan `PAYMENT_SIMULATOR_ENABLED=true`; jika variabel tidak bernilai `true`, API menolak simulasi. Konfigurasi Compose lokal mengaktifkannya. `POST /api/v1/payment-simulator` hanya menerima pemilik pesanan, memerlukan `Idempotency-Key`, serta memakai jumlah yang tersimpan pada pesanan. Retry dengan kunci dan data yang sama mengembalikan hasil yang sama selama 24 jam. Endpoint admin `/api/v1/admin/payments` dan vendor `/api/v1/vendor/orders` mendukung `page` dan `page_size`.

Untuk uji browser, gunakan database demo terpisah dengan seed admin dan demo serta simulator aktif. Tetapkan `E2E_WEB_URL`, `E2E_ADMIN_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_VENDOR_PASSWORD`, dan `CHROME_PATH`, lalu jalankan `pnpm test:payment`. Test membuat akun, pesanan, dan transaksi.

## Phase 13 - Pembatalan dan refund

Penyewa, vendor toko terkait, dan admin dapat membatalkan pesanan sebelum serah terima. Pembatalan pesanan yang masih menunggu pembayaran melepas hold tanpa refund; pembatalan pesanan terkonfirmasi menghasilkan refund simulasi penuh. Refund tercatat sekali dan dapat dilihat pada pesanan. Admin juga dapat membatalkan pesanan terkonfirmasi yang sudah melewati tanggal sewa. Pesanan yang sudah diserahkan tidak dapat dibatalkan.

`POST /api/v1/orders/{id}/cancel` menerima `expectedStatus` (`pending_payment` atau `confirmed`) dan memerlukan sesi serta CSRF untuk browser. Pengulangan pembatalan mengembalikan hasil yang sama; jika status berubah sebelum pembatalan, API mengembalikan 409 dengan status saat ini. Pekerja API memeriksa hold saat dimulai dan setiap menit; hold yang sudah kedaluwarsa diabaikan dalam perhitungan stok meskipun belum dirapikan.

Jalankan `pnpm test:cancellation` dengan variabel browser dan database demo terpisah seperti Phase 12. Test membuat akun, pesanan, pembayaran simulasi, dan refund.

## Phase 14 - Serah terima barang

Vendor pemilik toko dapat mengonfirmasi serah terima pesanan yang sudah terbayar pada tanggal mulai sampai tanggal selesai sewa, secara inklusif menurut waktu Asia/Jakarta. Status berubah menjadi `renting` dan terlihat sebagai **Sedang disewa** oleh vendor, penyewa, dan admin. Pengulangan konfirmasi tidak membuat riwayat baru. Pesanan yang sudah diserahkan tidak dapat dibatalkan; proses pengembalian dilanjutkan pada Phase 15.

`POST /api/v1/vendor/orders/{id}/handover` memerlukan sesi vendor pemilik toko dan CSRF untuk browser. Status yang tidak sesuai atau tanggal di luar masa sewa menghasilkan 409. Gunakan database demo terpisah dengan simulator aktif dan variabel browser seperti Phase 12, lalu jalankan `pnpm test:handover`. Test membuat akun, pesanan, pembayaran, dan serah terima.

## Phase 15 - Pengembalian barang

Vendor pemilik toko dapat mengonfirmasi pengembalian untuk pesanan yang sedang disewa. Pesanan menjadi selesai, dan waktu pengembalian serta aktor tercatat. Pengembalian terlambat tetap dapat dikonfirmasi tanpa denda. Jika barang dikembalikan lebih awal, stok tetap terpakai sampai tanggal akhir sewa secara inklusif.

`POST /api/v1/vendor/orders/{id}/return` memerlukan sesi vendor pemilik toko dan CSRF untuk browser. Pengulangan setelah berhasil mengembalikan waktu pengembalian yang sama tanpa menambah riwayat. Gunakan database demo terpisah dengan simulator aktif dan variabel browser seperti Phase 12, lalu jalankan `pnpm test:return`; test membuat akun dan pesanan serta memakai stok produk demo.

## Phase 16 - Riwayat pesanan lintas peran

Penyewa dapat membuka **Pesanan saya** untuk melihat daftar dan detail pesanannya. Vendor melihat pesanan tokonya, dan admin melihat seluruh pesanan. Ketiganya dapat memfilter daftar berdasarkan status dan berpindah halaman. Detail menampilkan snapshot harga, pembayaran, refund, serta riwayat status beserta aktor dan waktu dalam zona Asia/Jakarta. Nomor telepon penyewa pada detail hanya disertakan untuk vendor toko terkait dan admin.

API daftar tersedia pada `GET /api/v1/orders`, `/api/v1/vendor/orders`, dan `/api/v1/admin/orders`, dengan parameter `status`, `page`, dan `page_size`. Detail masing-masing tersedia pada `/api/v1/orders/{id}/detail`, `/api/v1/vendor/orders/{id}`, dan `/api/v1/admin/orders/{id}`. Gunakan database demo terpisah dengan variabel browser seperti Phase 12, lalu jalankan `pnpm test:order-history`; test membuat akun, pesanan, pembayaran, dan refund.

## Phase 17 - Paket demo web

`pnpm demo:up` menjalankan seluruh aplikasi dan seed melalui Compose. `pnpm demo:down` menghentikan layanan sambil mempertahankan database dan media. Pilih project dan port melalui `RENTAID_COMPOSE_PROJECT`, `RENTAID_DB_PORT`, dan `RENTAID_HTTP_PORT`. `pnpm demo:backup <direktori-baru>` mencadangkan database serta media bersama, sedangkan `pnpm demo:restore <direktori-backup>` memulihkannya ke target kosong.

Ikuti [panduan demo dan pemulihan](docs/demo.md) untuk konfigurasi, akun, dan langkah demo. `pnpm test:demo` menguji alur lengkap dari dua project Compose kosong, termasuk seed berulang, restart, serta backup/restore database dan foto produk.
