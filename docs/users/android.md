# Panduan APK demo Android Rentaid

Panduan ini menjalankan penyewa Android bersama marketplace vendor, admin, API Go, dan PostgreSQL lokal. Pembayaran dan refund menggunakan simulasi lokal. APK ditandatangani dengan kunci debug pada mesin pembuat dan ditujukan untuk demonstrasi lokal.

## Persiapan

Siapkan Docker Compose, Node.js 24.22.1, pnpm 12.14.0, JDK 17, Android SDK Platform dan Build Tools 35, serta perangkat Android 8 atau lebih baru atau emulator. Atur `JAVA_HOME` dan `ANDROID_HOME`; pastikan direktori `platform-tools` dan `emulator` dari Android SDK tersedia di `PATH`. Dari root repository jalankan:

```powershell
pnpm install --frozen-lockfile
pnpm android:demo
```

Perintah membuat dua APK bertanda tangan debug di `.artifacts/android-demo/`:

| File                         | Koneksi                               | API yang tertanam       |
| ---------------------------- | ------------------------------------- | ----------------------- |
| `rentaid-usb-debug.apk`      | Perangkat fisik melalui `adb reverse` | `http://127.0.0.1:8081` |
| `rentaid-emulator-debug.apk` | Android Emulator                      | `http://10.0.2.2:8081`  |

`manifest.json` mencatat ukuran dan SHA-256 masing-masing APK. Periksa dengan `Get-FileHash .artifacts/android-demo/rentaid-usb-debug.apk -Algorithm SHA256`. Kunci debug berasal dari mesin build; instalasi di atas aplikasi dengan tanda tangan berbeda dapat ditolak. Menghapus instalasi juga menghapus data lokal aplikasi, sehingga lakukan hanya setelah data lokal tidak diperlukan.

## Menjalankan layanan demo

Ikuti [persiapan dan seed demo](../engineering/demo.md#persiapan) untuk membuat project Compose lokal beserta password admin dan akun demo melalui environment. Tetapkan `RENTAID_HTTP_PORT=8081` agar sesuai dengan kedua APK; gunakan project dan port PostgreSQL yang tidak berbenturan dengan layanan lain. Contoh panduan web memakai project `rentaid-demo` dan port PostgreSQL 5433.

Setelah `pnpm demo:up` menyatakan layanan siap, buka marketplace di `http://127.0.0.1:8081/` dan admin di `http://127.0.0.1:8081/admin/`. Akun vendor contoh adalah `demo.approved@example.test` dengan password `SEED_DEMO_PASSWORD` yang ditetapkan saat seed. Catat kredensial seed secara aman; menjalankan seed lagi tidak mengganti password akun yang sudah ada.

## Memasang pada perangkat USB

Aktifkan opsi pengembang dan USB debugging, hubungkan perangkat, lalu setujui permintaan otorisasi pada perangkat. Pastikan `adb devices -l` menampilkan status `device`. Ganti `SERIAL` dengan serial perangkat:

```powershell
adb -s SERIAL reverse tcp:8081 tcp:8081
adb -s SERIAL install -r .artifacts/android-demo/rentaid-usb-debug.apk
```

Biarkan koneksi USB aktif selama demo. Setelah kabel atau koneksi debugging terputus, periksa lagi `adb -s SERIAL reverse --list` dan ulangi perintah `reverse` jika perlu. Opsi pemasangan melalui USB mungkin perlu diaktifkan dan disetujui pada perangkat.

## Memasang pada emulator

Jalankan Android Virtual Device yang sudah dibuat melalui Android Studio atau `emulator -avd NAMA_AVD`. Setelah boot selesai, gunakan serial yang ditampilkan `adb devices -l`:

```powershell
adb -s emulator-5554 install -r .artifacts/android-demo/rentaid-emulator-debug.apk
```

Emulator memakai `10.0.2.2` untuk menjangkau port 8081 pada komputer host. Kedua APK ditujukan untuk koneksi lokal ini; gateway Compose default mendengarkan localhost dan tidak langsung tersedia bagi perangkat lain di LAN.

## Skenario demo

1. Buka Rentaid, pilih **Periksa koneksi**, lalu daftarkan dan masuki akun penyewa melalui **Akun dan profil**. Isi nomor telepon sebelum checkout.
2. Pilih **Lihat katalog**, buka **Kamera Mirrorless**, dan pilih **Rencanakan sewa**. Isi tanggal mulai dan selesai dengan format `YYYY-MM-DD`. Gunakan tanggal hari ini di Jakarta agar vendor dapat langsung melakukan serah terima.
3. Pilih **Lihat penawaran**, periksa total dan ketersediaan, lalu **Lanjut ke checkout**. Pilih **Simulasikan berhasil**; pesanan menjadi terkonfirmasi.
4. Di browser, masuk sebagai vendor contoh dan buka `/vendor`. Pada pesanan yang sesuai, pilih **Konfirmasi serah terima**, lalu **Konfirmasi pengembalian**. Di Android, buka **Pesanan saya**, pilih pesanan, dan gunakan **Muat ulang** untuk melihat status **Sedang disewa** lalu **Selesai**. Admin dapat memeriksa pesanan dan transaksi di `/admin/`.
5. Untuk hasil gagal, buat checkout baru dan pilih **Simulasikan gagal**. Status akhir adalah pembayaran gagal; buat pesanan baru untuk mencoba lagi.
6. Untuk membatalkan sebelum membayar, kembali dari checkout, buka detail pesanan melalui **Pesanan saya**, lalu pilih **Batalkan pesanan** dan konfirmasi. Tidak ada refund. Kembali ke beranda dan pilih **Lanjutkan pesanan**, lalu **Selesai**, untuk menutup checkout tersimpan.
7. Untuk refund, buat pesanan lain, simulasikan pembayaran berhasil, buka detailnya di **Pesanan saya**, dan batalkan sebelum serah terima. Detail menampilkan refund simulasi penuh. Setelah barang diserahkan, pembatalan ditolak dan vendor menyelesaikan pesanan melalui pengembalian.

Jika aplikasi tidak dapat terhubung, periksa kesiapan layanan pada `http://127.0.0.1:8081/api/v1/ready`, serial ADB, pemetaan `reverse` untuk USB, dan pilihan APK yang sesuai. Jika hasil checkout atau pembayaran tidak diketahui karena koneksi terputus, buka **Lanjutkan pesanan** dan gunakan tombol pemeriksaan yang tersedia; aplikasi akan mempertahankan data upaya yang sama.

## Akun, katalog, dan pemulihan

Gunakan **Akun dan profil** untuk mendaftar, masuk, mengubah nama/telepon, atau keluar. Token sesi dienkripsi dengan Android Keystore dan dipulihkan setelah aplikasi dibuka kembali. Logout memerlukan koneksi agar server dapat mencabut sesi; sesi kedaluwarsa atau pengguna yang ditangguhkan meminta login ulang.

Beranda menampilkan konten CMS yang diterbitkan, termasuk akses FAQ, tentang, syarat, dan privasi. **Lihat katalog** menyediakan pencarian, filter kategori, pagination, detail, serta foto produk. Kegagalan gambar ditampilkan sebagai pesan tanpa menghentikan aplikasi.

Dari **Rencanakan sewa**, isi tanggal `YYYY-MM-DD` dan jumlah barang, lalu periksa penawaran server. Jika harga atau ketersediaan berubah, setujui kembali penawaran terbaru sebelum checkout. Pesanan menampilkan kode dan sisa hold berdasarkan waktu server.

Jika hasil checkout tidak diketahui, pilih **Periksa dan coba lagi** dengan akun dan alamat server yang sama. Data upaya dan kunci idempotensi disimpan terenkripsi dan dipakai kembali, termasuk setelah proses aplikasi dihentikan. Untuk pembayaran terputus, buka **Lanjutkan pesanan**; aplikasi memeriksa status dan memakai kunci yang sama saat perlu mencoba ulang. Menjelang batas kunci 24 jam, aplikasi memblokir pengiriman ulang; bila hasil masih belum diketahui, minta admin memeriksa pesanan sebelum membuat checkout baru.

**Pesanan saya** menampilkan riwayat, detail pembayaran, refund simulasi, dan perubahan status. Gunakan **Muat ulang** untuk melihat tindakan vendor/admin. Pembayaran gagal dan kedaluwarsa bersifat final; pembatalan sebelum serah terima memerlukan konfirmasi dan hasil akhirnya ditentukan server.

Petunjuk fixture, instrumentasi, dan pemulihan lintas proses tersedia pada [panduan pengujian](../engineering/testing.md#android-dan-perangkat).

## Pengujian otomatis

Pengujian Android otomatis mencakup stabilitas serta penyerahan APK USB dan emulator. Ikuti [panduan pengujian](../engineering/testing.md#e2e-dan-pemulihan) untuk prasyarat dan jalankan `pnpm test:e2e:android`. Test menggunakan stack dan akun terpisah serta membersihkan container dan volume test.

Kedua APK tetap terpasang setelah pengujian. Stack test dihentikan, jadi jalankan layanan demo pada port 8081 untuk melanjutkan penggunaan manual. Laporan dan log test berada di `.artifacts/delivery-tests/<acak>/`.

## Hasil verifikasi 6 November 2026

Kedua APK versi `0.1.0` berhasil dipasang dan diuji: perangkat fisik Android 16 (API 36) serta emulator Android 15 (API 35). Tanda tangan `Android Debug` dengan skema APK v2 terverifikasi, dan SHA-256 APK terpasang cocok dengan berkas penyerahan:

| Target   | SHA-256                                                            |
| -------- | ------------------------------------------------------------------ |
| USB      | `6812e449d031adfa92e66240e7fb0f6e53d32e76471d2de2fc81c0e86a8ff049` |
| Emulator | `de6070a97a32acb04daeb8733f9bc8086fe9855540c3aef47b129c2ca7b9a762` |

Pada masing-masing target, pengujian melalui layar Android mencapai checkout dan pembayaran berhasil, lalu vendor web melakukan serah terima dan pengembalian hingga Android menampilkan pesanan selesai. Pembayaran gagal, pembatalan sebelum bayar, serta pembatalan dengan refund penuh juga lulus; admin membaca status dan transaksi yang sesuai. Layanan test berjalan dalam jaringan Docker internal memakai akun seed lokal. Bukti lokal tersedia di `.artifacts/delivery-tests/00e058323916/result.json` dan log instrumentasi di direktori yang sama.

Pada tanggal tersebut, pemeriksaan terpadu dan pengujian demo juga lulus, termasuk seed berulang, alur browser vendor/penyewa/admin, restart, backup, dan restore database serta media pada project Compose lain.

Nilai checksum di atas mencatat build yang diuji pada tanggal tersebut; gunakan `manifest.json` yang baru jika APK dibangun ulang. APK debug memerlukan layanan demo lokal dan koneksi emulator atau USB seperti dijelaskan di atas.
