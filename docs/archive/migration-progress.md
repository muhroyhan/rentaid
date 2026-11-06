# Progres migrasi MVP

Catatan historis yang dipindahkan dari instruksi agen.

## Progres

Tandai `[x]` saat kriteria selesai dan test phase lulus. Catat keterbatasan singkat di samping phase jika ada.

- [x] 01 Workspace ke backend yang dapat dijalankan — migrasi/seed PostgreSQL, readiness saat database mati, persistensi volume, guard merek, kontrak, build, dan `pnpm check` lulus; golangci-lint dijalankan via Docker karena Application Control Windows.
- [x] 02 Akun admin ke sesi yang terlindungi — integrasi PostgreSQL, role, CSRF/Origin, pembatasan login, expiry/logout, dan browser melalui Vite serta Compose lulus.
- [x] 03 Konten CMS ke konten publik — draft/publikasi, validasi media, otorisasi, persistensi volume, API publik, dan browser pada database sementara lulus.
- [x] 04 Pengguna ke persetujuan toko - registrasi/profil, keputusan toko, seed, pencabutan sesi, dan publikasi produk berdasarkan status toko teruji.
- [x] 05 Kategori ke referensi katalog - API publik, admin, penghapusan kategori terpakai, dan perubahan nama dengan produk sebenarnya teruji.
- [x] 06 Produk ke moderasi katalog - kepemilikan, publikasi, arsip, foto, moderasi, katalog publik, seed, dan pengujian PostgreSQL/browser lulus; aturan pesanan dan stok aktif dilanjutkan di Phase 11.
- [x] Gate A - admin/CMS akun, toko, kategori, produk, media, dan konten terhubung ke API Go dan PostgreSQL; uji integrasi dan browser lulus.
- [x] 07 Pengunjung ke akun dan pengajuan vendor - Next.js, akun, profil, pengajuan dan pengajuan ulang, persetujuan, pembatasan API, SSR, serta E2E lokal dan Compose lulus.
- [x] 08 Toko disetujui ke produk terpublikasi - daftar, formulir, foto, publikasi, arsip, moderasi, validasi, dan E2E lintas vendor melalui dev serta Compose lulus.
- [x] 09 Katalog publik ke detail produk - konten CMS, pencarian, kategori, pagination, detail, status nonpublik, dan penanganan kegagalan API teruji.
- [x] 10 Detail produk ke penawaran harga - tanggal inklusif, ketersediaan per tanggal dan hold, kontrak API, ringkasan web, integrasi PostgreSQL, dan browser teruji tanpa menahan stok.
- [x] 11 Penawaran harga ke checkout dengan hold stok - transaksi stok, idempotensi, snapshot, validasi ulang penawaran, aturan stok vendor, arsip, dan uji PostgreSQL/browser lulus.
- [x] 12 Checkout ke pembayaran mock dan order terkonfirmasi - simulator, idempotensi, batas hold, status pesanan, transaksi admin, pesanan vendor, dan uji PostgreSQL/browser lulus.
- [x] 13 Pesanan belum diserahkan ke pembatalan dan refund - pembersihan hold, pembatalan lintas peran, refund idempoten, konkurensi, restart, dan uji PostgreSQL/browser lulus.
- [x] 14 Order terkonfirmasi ke barang diserahkan - otorisasi vendor, tanggal Jakarta, audit, idempotensi, konflik pembatalan, privasi kontak, dan uji PostgreSQL/browser lulus.
- [x] 15 Barang disewa ke pengembalian dan order selesai - konfirmasi vendor, waktu dan riwayat idempoten, pengembalian terlambat, stok tanggal akhir, dan uji PostgreSQL/browser lulus.
- [x] 16 Riwayat dan detail pesanan lintas peran - detail pembayaran/refund dan riwayat aktor, filter status, pagination, otorisasi, serta uji PostgreSQL/browser lulus.
- [x] 17 Paket demo web yang dapat diulang - Compose sehat, seed berulang, alur lengkap, gagal/batal/refund, restart, dan backup/restore database/media pada project kosong teruji.
- [x] Gate B - marketplace web, vendor, dan admin menyelesaikan alur MVP melalui satu origin Compose; paket demo dan pemulihan teruji tanpa layanan eksternal saat runtime.
- [x] 18 Toolchain Android ke aplikasi terhubung API - build debug/release, sinkronisasi OpenAPI, unit test, serta instalasi dan empat test koneksi pada emulator dan perangkat USB lulus.
- [x] 19 Pengguna Android ke sesi dan profil - registrasi/login, profil, logout dan pencabutan, pemulihan setelah restart dan enkripsi Keystore teruji pada emulator dan perangkat USB; kedaluwarsa/suspend teruji dengan PostgreSQL.
- [x] 20 Katalog Android ke detail produk - konten CMS, pencarian, filter, pagination, detail dan foto teruji pada perangkat; produk nonpublik, kegagalan data/gambar, regresi akun, dan integrasi PostgreSQL lulus.
- [x] 21 Detail Android ke checkout dengan hold - penawaran server, checkout idempoten, pemulihan hasil tidak diketahui, hold berdasarkan waktu server, dan perebutan stok web–Android teruji pada perangkat.
- [x] 22 Checkout Android ke pembayaran dan order terkonfirmasi - simulasi berhasil/gagal/kedaluwarsa, retry idempoten, pemulihan setelah proses dihentikan, refresh status, dan batas hold teruji.
- [x] 23 Order Android ke pemantauan, pembatalan, dan penyelesaian - riwayat, transaksi, pembatalan/refund, refresh status, otorisasi, serta serah terima dan pengembalian lewat browser vendor teruji pada perangkat.
- [x] 24 Uji lintas aplikasi dan stabilitas - respons checkout/pembayaran terputus setelah commit, restart Android/API/PostgreSQL, sesi offline dan pencabutan admin, stok lintas klien, serta regresi perangkat/browser lulus pada stack test terpisah.
- [x] 25 APK penyerahan dan panduan demo - APK debug USB/emulator bertanda tangan dan checksum tersedia; instalasi, alur Android–vendor–admin, gagal/batal/refund, dan runtime lokal teruji pada perangkat serta emulator.
- [x] Gate akhir - Phase 24 dan 25 memverifikasi aturan lintas aplikasi, stok dan transaksi, persistensi setelah restart, demo lokal, pemulihan, serta APK pada perangkat dan emulator.
