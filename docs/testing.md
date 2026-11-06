# Pengujian Rentaid

Jalankan perintah dari root repository kecuali dinyatakan lain. Siapkan toolchain pada [panduan pengembangan](development.md). Pengujian integrasi, browser, dan perangkat membuat atau mengubah data; gunakan database/stack test terpisah dari data demo yang ingin dipertahankan.

## Pemeriksaan terpadu

```powershell
pnpm contracts:check
pnpm android:client-check
pnpm check
```

`pnpm check` mencakup guard merek pada folder baru, sinkronisasi kontrak TypeScript/Kotlin, ktlint, unit test serta build Android debug/release, test kegagalan katalog, TypeScript strict, ESLint, Prettier pada glob kode/konfigurasi, gofmt, go vet, golangci-lint, dan test Go. Perintah ini memerlukan JDK/Android SDK, Go, Docker, serta dependensi workspace. Ia tidak menjalankan seluruh E2E browser atau instrumentasi perangkat.

golangci-lint dan test Go berjalan melalui image Docker terpin `golangci/golangci-lint:v2.15.0`, untuk menghindari pembatasan executable test pada Windows. Image diunduh saat pertama kali diperlukan. Test integrasi Go dilewati jika `TEST_DATABASE_URL` tidak tersedia.

## Integrasi Go dengan PostgreSQL

Contoh memakai PostgreSQL pengembangan Compose pada port 5432, dengan database test khusus yang belum ada:

```powershell
pnpm db:up
docker compose -f infra/compose.yaml exec -T postgres psql -U rentaid -d postgres -c "CREATE DATABASE rentaid_test"
$env:TEST_DATABASE_URL = "postgres://rentaid:rentaid_local@localhost:5432/rentaid_test?sslmode=disable"
pnpm test
```

Sesuaikan port bila memakai `RENTAID_DB_PORT` lain. Pembungkus test menerjemahkan hostname `localhost`/`127.0.0.1` menjadi `host.docker.internal` agar container test menjangkau database host. Database test harus dapat diakses dari Docker. `pnpm check` juga menggunakan variabel ini ketika menjalankan test Go.

Test mencakup otorisasi, tanggal inklusif dan kabisat, pemakaian stok per tanggal, perebutan stok terakhir, hold dengan clock terkendali, idempotensi, balapan pembayaran/pembatalan, refund, serta persistensi. Pemeriksaan migrasi/seed dan backup/restore menyeluruh tersedia pada test demo.

## E2E browser

Siapkan API, marketplace, dan admin pada stack test terpisah. Gunakan [setup pengembangan](development.md#menjalankan-api-dan-database) dengan `DATABASE_URL` menunjuk database browser test, jalankan migrasi dan seed admin/demo, lalu aktifkan `PAYMENT_SIMULATOR_ENABLED=true`. Jangan memakai database integrasi Go yang sedang diuji bersamaan.

Gunakan Chrome/Chromium lokal dan tetapkan environment berikut; password harus sesuai seed stack test. Contoh ini memakai server dev pada port default:

```powershell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$env:E2E_BASE_URL = "http://127.0.0.1:5173"
$env:E2E_WEB_URL = "http://127.0.0.1:3000"
$env:E2E_ADMIN_URL = "http://127.0.0.1:5173"
$env:E2E_ADMIN_EMAIL = "admin@example.test"
foreach ($taskVariable in @("E2E_ADMIN_PASSWORD", "E2E_VENDOR_PASSWORD")) {
  $taskSecret = Read-Host "$taskVariable (password seed test)" -AsSecureString
  $taskPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
  try { Set-Item -Path "Env:$taskVariable" -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr) }
}
```

`E2E_VENDOR_PASSWORD` adalah password seed `demo.approved@example.test`. Untuk Compose, arahkan ketiga variabel URL ke origin gateway test yang sama, tanpa akhiran `/admin/`. Next.js harus memakai `API_ORIGIN` menuju API test dan origin browser harus tercantum pada `ALLOWED_ORIGINS`. Proxy Vite default menuju API port 8080; sesuaikan target jika API test memakai port lain.

`test:admin-browser` memiliki default origin 8081; test admin lainnya default 5173. Menetapkan `E2E_BASE_URL` secara eksplisit menghindari perbedaan tersebut. Test marketplace default 3000 dan admin 5173.

| Perintah                        | Skenario dan persiapan khusus                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `pnpm test:admin-browser`       | Login/logout admin dengan akun seed test.                                                          |
| `pnpm test:admin-content`       | Draft, publikasi, dan media CMS; gunakan FAQ kosong pada database baru.                            |
| `pnpm test:admin-stores`        | Persetujuan/penolakan/suspend toko serta suspend pengguna; membuat akun/toko.                      |
| `pnpm test:admin-categories`    | Tambah, ubah nama, baca API publik, dan hapus kategori; kategori terpakai diuji pada integrasi Go. |
| `pnpm test:admin-products`      | Moderasi dan riwayat produk; perlu seed demo.                                                      |
| `pnpm test:marketplace-account` | Akun, profil, pengajuan/pengajuan ulang toko, persetujuan, dan dashboard vendor.                   |
| `pnpm test:vendor-products`     | Produk, foto, draft/publikasi, arsip, moderasi, dan kepemilikan; perlu seed demo.                  |
| `pnpm test:public-catalog`      | CMS, pencarian, kategori, pagination, detail, dan produk nonpublik; mengubah beranda dan moderasi. |
| `pnpm test:catalog-errors`      | Penanganan kegagalan API; tidak memerlukan database.                                               |
| `pnpm test:product-quote`       | Tanggal, jumlah, harga, dan ketersediaan pada penawaran; perlu katalog demo.                       |
| `pnpm test:checkout`            | Checkout dan halaman hold; membuat akun/pesanan pada katalog demo.                                 |
| `pnpm test:payment`             | Simulasi pembayaran, pesanan vendor, dan transaksi admin.                                          |
| `pnpm test:cancellation`        | Pembatalan lintas peran, hold dilepas, dan refund penuh.                                           |
| `pnpm test:handover`            | Serah terima vendor serta status penyewa/admin.                                                    |
| `pnpm test:return`              | Pengembalian vendor, status selesai, dan stok inklusif.                                            |
| `pnpm test:order-history`       | Detail transaksi/aktor, filter status, pagination, dan hak akses.                                  |

Test transaksi memerlukan seed admin/demo dan simulator aktif. Jalankan test satu per satu; gunakan database baru bila skenario membutuhkan keadaan awal tertentu. Setelah selesai, hapus `E2E_ADMIN_PASSWORD` dan `E2E_VENDOR_PASSWORD` dari environment.

## Instrumentasi Android

Gunakan database baru dan satu perangkat USB aktif. Contoh berikut memakai PostgreSQL Compose default (`rentaid_default`, port 5432), API test pada port 18083, dan image API test yang dibangun secara eksplisit. Jangan jalankan bersama test stabilitas yang memakai port 18083.

Tetapkan `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, dan `SEED_DEMO_PASSWORD` untuk akun test menggunakan input aman seperti pada [mulai cepat](../README.md#mulai-cepat), lalu jalankan:

```powershell
pnpm db:up
docker compose -f infra/compose.yaml exec -T postgres psql -U rentaid -d postgres -c "CREATE DATABASE rentaid_android_test"
docker build -f apps/api/Dockerfile -t rentaid-api-test .
docker run -d --name rentaid-android-test-api --network rentaid_default -p 127.0.0.1:18083:8080 -e APP_ENV=local -e HTTP_ADDR=0.0.0.0:8080 -e MEDIA_DIR=/var/lib/rentaid/media -e PAYMENT_SIMULATOR_ENABLED=true -e 'ALLOWED_ORIGINS=http://localhost:18083,http://127.0.0.1:18083,http://localhost:3000,http://127.0.0.1:3000' -e 'DATABASE_URL=postgres://rentaid:rentaid_local@postgres:5432/rentaid_android_test?sslmode=disable' -e SEED_ADMIN_EMAIL -e SEED_ADMIN_PASSWORD -e SEED_DEMO_PASSWORD rentaid-api-test /bin/sh -c '/app/rentaid migrate && /app/rentaid seed && exec /app/rentaid serve'
Remove-Item Env:SEED_ADMIN_PASSWORD, Env:SEED_DEMO_PASSWORD
```

Tunggu `http://127.0.0.1:18083/api/v1/ready` mengembalikan status `ok` sebelum menerapkan fixture:

```powershell
Get-Content -Raw tests/android/phase20-fixtures.sql | docker compose -f infra/compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U rentaid -d rentaid_android_test
Get-Content -Raw tests/android/phase21-fixtures.sql | docker compose -f infra/compose.yaml exec -T postgres psql -v ON_ERROR_STOP=1 -U rentaid -d rentaid_android_test
adb reverse tcp:18083 tcp:18083
Push-Location apps/android
try { .\gradlew.bat connectedDebugAndroidTest -PapiBaseUrl=http://127.0.0.1:18083 }
finally { Pop-Location }
```

Fixture dijalankan sekali pada database baru: berisi produk dan CMS publik, produk nonpublik, foto yang sengaja gagal dimuat, serta produk stok satu untuk perebutan lintas web–Android. Pada emulator, gunakan `-PapiBaseUrl=http://10.0.2.2:18083` tanpa `adb reverse`. Jika beberapa perangkat terhubung, pilih serial melalui `ANDROID_SERIAL` dan gunakan `adb -s SERIAL`.

### Pemulihan sesi lintas proses

Setelah APK debug dan APK test terpasang, biarkan API test aktif dan jalankan pada perangkat yang sama. Penyimpanan sesi skenario ini terpisah dari sesi utama aplikasi:

```powershell
adb shell am instrument -w -e sessionPhase prepare -e class 'id.rentaid.app.SessionProcessTest#prepareSession' id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner
adb shell am force-stop id.rentaid.app
adb shell am instrument -w -e sessionPhase restore -e class 'id.rentaid.app.SessionProcessTest#restoreSession' id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner
```

Tahap pertama membuat sesi; tahap kedua memulihkan sesi setelah proses dihentikan dan memverifikasi logout.

### Pemulihan pembayaran lintas proses

Pada stack dan perangkat yang sama dengan simulator aktif serta katalog seed, jalankan:

```powershell
adb shell am instrument -w -e class 'id.rentaid.app.PaymentRecoveryProcessTest#prepareInterruptedPayment' id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner
adb shell am force-stop id.rentaid.app
adb shell am instrument -w -e class 'id.rentaid.app.PaymentRecoveryProcessTest#recoverInterruptedPayment' id.rentaid.app.test/androidx.test.runner.AndroidJUnitRunner
```

Kedua tahap memakai penyimpanan test terpisah dan menguji replay pembayaran yang sudah diproses server. Jangan memasang ulang dengan penghapusan data di antara tahap persiapan dan pemulihan.

### Vendor browser dan status Android

`OrderCrossClientIntegrationTest` dan `OrderUiIntegrationTest` memakai database/fixture terpisah di atas. Untuk tindakan vendor melalui browser sungguhan, jalankan marketplace dengan `API_ORIGIN=http://127.0.0.1:18083`, pastikan origin marketplace diizinkan API test, serta pasang APK debug dan test yang menunjuk API test. Aktifkan `adb reverse` dan tetapkan `ANDROID_HOME`, `ANDROID_SERIAL`, `CHROME_PATH`, `E2E_VENDOR_PASSWORD`, serta `E2E_WEB_URL` jika bukan `http://127.0.0.1:3000`, lalu jalankan `pnpm test:android-vendor`.

Test membuat akun dan pesanan baru, menyerahkan/mengembalikan melalui browser vendor, serta memeriksa status di Android. API test manual dapat dihentikan dengan `docker stop rentaid-android-test-api` dan dilanjutkan dengan `docker start rentaid-android-test-api`; data database tetap berada di volume PostgreSQL. Container yang sama mempertahankan file media test, tanpa menguji pemulihan volume media.

## Demo, stabilitas, dan penyerahan APK

| Perintah                     | Panduan dan kebutuhan                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test:demo`             | [Demo web](demo.md#pengujian-otomatis-dari-nol): Chrome, dua project Compose sementara, migrasi kosong, seed berulang, alur lengkap, restart, serta backup/restore database dan media.                                   |
| `pnpm test:stability`        | [Stabilitas](phase24-testing.md): Docker, JDK/SDK, perangkat USB, dan Chrome; port 18083, 18084, dan 15432. Menguji respons terputus setelah commit, restart, sesi offline/dicabut, stok, dan transaksi lintas aplikasi. |
| `pnpm test:android-delivery` | [Penyerahan Android](android-demo.md#pengujian-otomatis): jalankan `pnpm android:demo` lebih dahulu; siapkan USB/emulator, JDK/SDK, Chrome, serta port 8081, 15435, dan 18124.                                           |

Pembungkus test tersebut mengelola stack dan pembersihan project test sendiri; ikuti panduan masing-masing untuk variabel, laporan, dan kondisi setelah pengujian. Hasil historis pada dokumen stabilitas/Android bukan bukti bahwa perubahan baru telah diuji ulang.
