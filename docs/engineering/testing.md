# Pengujian Rentaid

Jalankan dari root repository. Setiap kategori melaporkan kegagalan prasyarat dan kode keluar nonzero; jangan memakai database pengguna untuk test. `pnpm check` menjalankan guard merek, kontrak, lint, format, tipe, build Android, dan unit test. Integrasi dan E2E dijalankan terpisah.

## Perintah

| Perintah                | Cakupan                                                                                        | Prasyarat                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm test:unit`        | Unit Go, kegagalan katalog web, dan unit Android. Admin belum memiliki unit test.              | Docker, JDK 17, Android SDK 35.                                                  |
| `pnpm test:integration` | Integrasi Go dengan PostgreSQL dan instrumentasi Android terhadap stack test.                  | `TEST_DATABASE_URL`, Docker, JDK 17, SDK, `ANDROID_HOME`, `ANDROID_SERIAL`.      |
| `pnpm test:e2e:web`     | Lima belas skenario browser web/admin/API, kemudian demo lengkap, restart, dan backup/restore. | Docker, Chrome/Chromium melalui `CHROME_PATH`.                                   |
| `pnpm test:e2e:android` | Stabilitas lintas aplikasi dan penyerahan APK USB/emulator, termasuk vendor/admin browser.     | Docker, JDK 17, SDK, `ANDROID_SERIAL`, `ANDROID_EMULATOR_SERIAL`, `CHROME_PATH`. |
| `pnpm test:e2e`         | E2E web dan Android di atas, termasuk full cycle.                                              | Semua prasyarat kedua kelompok E2E.                                              |

Unit dan integrasi dapat difilter dengan `--app=api`, `--app=web`, `--app=admin`, atau `--app=android`, misalnya `pnpm test:unit --app=api`. Jika suite web/admin tidak tersedia untuk kategori itu, runner menyatakan belum ada test, bukan mengklaim cakupan yang belum dibuat. E2E menjalankan kelompok lengkap tanpa filter aplikasi.

## Unit dan integrasi API

Unit Go menggunakan file `*_test.go` dengan build constraint `!integration`. File yang memerlukan PostgreSQL menggunakan suffix `_integration_test.go` dan build constraint `integration`. Unit tidak membaca `TEST_DATABASE_URL`; integrasi mewajibkannya dan menggunakan `-count=1`. Runner menjalankan Go dalam image Docker terpin untuk kompatibilitas Windows.

Buat database test khusus, contohnya pada PostgreSQL pengembangan Compose dengan port default:

```powershell
pnpm db:up
docker compose -f infra/compose.yaml exec -T postgres psql -U rentaid -d postgres -c "CREATE DATABASE rentaid_test"
$env:TEST_DATABASE_URL = "postgres://rentaid:rentaid_local@localhost:5432/rentaid_test?sslmode=disable"
pnpm test:integration --app=api
```

Gunakan nama database baru dan sesuaikan port jika berbeda. Runner menerjemahkan hostname localhost menjadi `host.docker.internal` untuk container test. Jika variabel kosong atau database tidak dapat diakses, test gagal. Test Go membuat schema test terisolasi di database tersebut.

Pertahankan pengujian harga dan tanggal inklusif lintas bulan/tahun serta tahun kabisat; batas tanggal dan durasi; stok per tanggal dan perebutan stok terakhir; kedaluwarsa hold; idempotensi; balapan pembayaran/pembatalan; refund; otorisasi; dan persistensi setelah restart. Skenario waktu memakai clock terkendali, sedangkan integrasi data memakai PostgreSQL nyata.

## Android dan perangkat

Siapkan JDK 17 dan Android SDK Platform/Build Tools 35, tetapkan `JAVA_HOME`, `ANDROID_HOME`, serta serial dari `adb devices -l`. Contoh PowerShell berikut memakai satu perangkat USB untuk integrasi:

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-17'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SERIAL = 'SERIAL_DARI_ADB_DEVICES'
pnpm test:integration --app=android
```

Runner membuat project Compose test bernama acak, memberi seed dan menerapkan fixture katalog, membangun/memasang APK debug dan APK test, lalu menjalankan unit instrumentasi, API/UI, serta pengujian antar klien. Pemulihan sesi dan pembayaran dijalankan dalam tahap terpisah dengan penghentian proses di antaranya. Skenario vendor melalui browser dijalankan oleh suite E2E Android. Project/volume dan pemetaan port test dibersihkan setelah selesai.

Test memasang APK debug yang menunjuk API test pada perangkat. Setelah stack test dihentikan, APK tersebut tidak terhubung; pasang kembali APK demo menggunakan [panduan Android](../users/android.md) untuk melanjutkan penggunaan. Gunakan perangkat test dan jangan hapus instalasi jika data lokal masih dibutuhkan.

## E2E dan pemulihan

Untuk browser, tetapkan lokasi Chrome lalu jalankan:

```powershell
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm test:e2e:web
```

Runner membuat project Compose dengan nama, port, dan kredensial test acak. Skenario mencakup CMS, admin, akun, toko, produk, katalog, penawaran, checkout, pembayaran, pembatalan/refund, serah terima, pengembalian, dan riwayat. Pengujian demo memakai dua project terpisah untuk memeriksa seed berulang, restart, dan backup/restore database serta media. Resource project test dibersihkan oleh runner.

Untuk E2E Android, selain JDK/SDK dan Chrome, hubungkan perangkat USB dan jalankan emulator. Tetapkan `ANDROID_SERIAL` dan `ANDROID_EMULATOR_SERIAL` sesuai `adb devices -l`. Port 8081, 15435, 18124, 18083, 18084, dan 15432 harus tersedia. Jalankan `pnpm test:e2e:android` atau `pnpm test:e2e` untuk seluruh kelompok. Runner membangun APK demo sebelum menguji penyerahan pada kedua target. [Panduan stabilitas](stability.md) menjelaskan gangguan setelah commit dan bukti test.

`pnpm test:e2e:android` memasang APK pada perangkat dan emulator. Pastikan layar perangkat terbuka. Jika alat, serial, browser, atau port tidak tersedia, perintah gagal dan menampilkan prasyarat; tidak ada fallback yang melewati Android. Pemasangan yang menunggu dialog perangkat lebih dari tiga menit dihentikan dengan pesan kesalahan; selesaikan dialog pada perangkat sebelum mencoba kembali.

## Kontrak dan kualitas

```powershell
pnpm contracts:check
pnpm android:client-check
pnpm check
```

Setelah mengubah OpenAPI, jalankan `pnpm contracts:generate` dan `pnpm android:generate`, lalu sertakan hasil yang berubah. Generator Kotlin serta golangci-lint memakai Docker. Lihat [pengembangan lokal](development.md#kontrak-dan-build) untuk build dan konfigurasi.
