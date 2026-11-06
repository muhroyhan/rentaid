# Pengujian lintas aplikasi dan stabilitas

Jalankan dari root repository dengan Docker, JDK 17, Android SDK 35, Chrome/Chromium lokal, dan perangkat Android yang terhubung melalui USB debugging. Layar perangkat harus terbuka untuk test UI.

```powershell
$env:JAVA_HOME = 'C:\path\to\jdk-17'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:ANDROID_SERIAL = 'SERIAL_DARI_ADB_DEVICES'
$env:ANDROID_EMULATOR_SERIAL = 'SERIAL_EMULATOR_DARI_ADB_DEVICES'
$env:CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
pnpm test:e2e:android
```

Tahap stabilitas membangun marketplace, admin, API, dan PostgreSQL dalam project Compose baru bernama `rentaid-stability-<acak>`. Port 18083, 18084, dan 15432 harus tersedia. Marketplace dan admin memakai origin 18083; Android memakai proxy test 18084 yang meneruskan request ke API yang sama. Seed dan fixture diterapkan hanya pada database test baru. Perintah yang sama selanjutnya membangun dan menguji APK USB/emulator; lihat [prasyarat E2E Android](testing.md#e2e-dan-pemulihan).

## Skenario

| Skenario                                   | Bukti yang diperiksa                                                                                                                                                                    |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Respons checkout terputus setelah commit   | Android tetap menyimpan upaya terenkripsi; sesudah proses aplikasi, API, dan PostgreSQL di-restart, retry memakai kunci dan payload yang sama; hanya satu pesanan tersimpan.            |
| Respons pembayaran terputus setelah commit | Browser sudah melihat pesanan terkonfirmasi; sesudah restart, Android memulihkan hasil dengan kunci dan payload yang sama; hanya satu pembayaran dan satu riwayat konfirmasi tersimpan. |
| Stok sesudah restart                       | Stok terakhir yang sedang ditahan atau sudah dibayar tetap tidak tersedia pada penawaran web dan Android.                                                                               |
| Android offline lalu tersambung kembali    | Gangguan koneksi tidak menghapus sesi maupun referensi pesanan terenkripsi; sesi dan pesanan dapat dibaca kembali.                                                                      |
| Admin menangguhkan pengguna                | Tindakan melalui UI admin mencabut sesi browser dan Android; token Android dibersihkan ketika ditolak, sedangkan pesanan tersimpan tetap ada.                                           |
| Regresi lintas klien                       | Perebutan stok terakhir, replay checkout, hasil pembayaran, pembatalan/refund dua arah, otorisasi, layar pesanan, dan pemeriksaan sesi saat layar akun kembali aktif.                   |
| Vendor bertindak lewat browser             | Android membuat pesanan; vendor mengonfirmasi serah terima dan pengembalian melalui UI web; Android membaca status sedang disewa lalu selesai.                                          |

Proxy test memutus koneksi HTTP setelah menerima seluruh respons upstream, sehingga gangguan terjadi sesudah transaksi backend selesai. Skenario offline juga memutus koneksi HTTP tanpa mengganti layanan atau aturan bisnis dengan mock.

## Hasil dan pembersihan

Log per tahap dan `result.json` disimpan di `.artifacts/stability-tests/<acak>/`. Laporan memuat daftar pemeriksaan dan jumlah pesanan, pembayaran, riwayat konfirmasi, serta sesi aktif akun test; tidak menyimpan password atau token.

Setelah pengujian, APK perangkat dikembalikan ke alamat demo `http://127.0.0.1:8081`, pemetaan ADB port test dihapus, dan container, network, serta volume milik project test dibersihkan. PostgreSQL pengembangan dan data demo tetap tersedia. Jalankan layanan demo secara terpisah untuk memakai APK setelah pengujian.

## Pelaksanaan 5 November 2026

Pengujian lulus pada perangkat Android USB dan Chrome lokal menggunakan build Compose terbaru. Tujuh tahap pemulihan/pencabutan sesi, sepuluh test regresi perangkat, serta satu pengujian vendor melalui browser selesai tanpa kegagalan. Stok terakhir tetap tidak tersedia sesudah dua rangkaian restart PostgreSQL dan API.

`pnpm check` juga lulus dengan `TEST_DATABASE_URL` menuju database pemeriksaan terpisah, mencakup lint, sinkronisasi kontrak, TypeScript, test Go/PostgreSQL, serta build Android debug dan release.

Pemeriksaan akhir pada akun stabilitas menemukan tepat satu pesanan, satu pembayaran, satu riwayat konfirmasi, dan nol sesi sesudah penangguhan oleh admin. Bukti lokal tersimpan di `.artifacts/stability-tests/5b7dbea64d89/result.json` beserta log per tahap. Pengujian ini juga memverifikasi perbaikan pemeriksaan sesi saat layar akun Android kembali aktif.
