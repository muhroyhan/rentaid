# Rencana phase pengembangan Rentaid

Aturan permanen (arsitektur, keamanan, konvensi, aturan bisnis) ada di `AGENTS.md` dan menjadi acuan jika ada perbedaan dengan dokumen ini.

Kerjakan phase secara berurutan. Setiap phase memiliki satu fokus; selesaikan task sesuai urutan, penuhi kriteria selesai, dan jalankan test sebelum memulai phase berikutnya. Catat hasil dan keterbatasan pengujian, lalu perbarui bagian "Progres" di `AGENTS.md`. Pembaruan API harus disertai pembaruan OpenAPI, klien yang terdampak, dan test kontrak. Gunakan PostgreSQL nyata untuk test integrasi dan `Clock` terkendali untuk test kedaluwarsa. Jalankan build, lint, pemeriksaan tipe, dan test yang relevan dengan perubahan.

## Kelompok A — Backend + admin/CMS

Fokus awal pada akun, toko, katalog, dan konten. Panel admin untuk pesanan, pembayaran, dan refund ditambahkan bersama backend transaksi dan marketplace web pada kelompok B.

### Phase 01 — Workspace ke backend yang dapat dijalankan

- Task berurutan: (1) siapkan struktur workspace, konfigurasi bersama, toolchain terpin, `.gitignore`/pengecualian folder lama, dan environment contoh; (2) siapkan Go, PostgreSQL, migrasi SQL, dan Compose dengan volume; (3) tambahkan health/readiness, log terstruktur, `Clock`, dan shutdown; (4) siapkan `packages/contracts` dengan OpenAPI awal, pipeline generate klien TypeScript, dan pemeriksaan kontrak; (5) pilih tool, catat di `docs/decisions.md`, lalu sediakan perintah root untuk API, migrasi, seed, `pnpm check`, dan pemeriksaan.
- Selesai: API dapat dijalankan dari database kosong dengan langkah terdokumentasi; klien TypeScript ter-generate dari OpenAPI; bagian "Perintah" di `AGENTS.md` terisi.
- Test: migrasi database kosong; readiness saat database tidak tersedia; data bertahan setelah container dibuat ulang dengan volume yang sama; `pnpm check` gagal jika string "raggam" muncul di folder baru.

### Phase 02 — Akun admin ke sesi yang terlindungi

- Task berurutan: (1) implementasikan pengguna, hash argon2id, role `user`/`admin`, sesi database, dan seed admin dari environment; (2) buat login/logout, cookie browser, bearer Android, token CSRF + pemeriksaan `Origin`, dan pembatasan percobaan login; (3) siapkan proxy `/api` untuk server dev dan Compose, lalu buat login, layout, navigasi, dan penanganan sesi berakhir di admin; (4) hubungkan klien API hasil generate.
- Selesai: admin dapat login/logout dan endpoint admin menerapkan otorisasi server.
- Test: password salah, akses pengguna biasa, sesi dicabut, permintaan browser tanpa CSRF yang benar ditolak, login berulang dibatasi, seed menolak berjalan pada `APP_ENV=production`, dan login admin di web marketplace ditolak.

### Phase 03 — Konten CMS ke konten publik

- Task berurutan: (1) buat penyimpanan media lokal dan validasi upload (jenis dari isi file, maksimal 5 MB, nama acak); (2) buat API konten beranda, FAQ, tentang, syarat penggunaan, dan kebijakan privasi; (3) buat pengelolaan dan publikasi konten beserta aset di admin; (4) sediakan endpoint baca publik untuk konten terpublikasi.
- Selesai: admin dapat mengelola konten/aset dan API publik dapat membacanya.
- Test: konten belum terpublikasi tidak bocor; upload tidak valid (jenis palsu, terlalu besar) dan perubahan tanpa hak ditolak; konten bertahan setelah restart.

### Phase 04 — Pengguna ke persetujuan toko

- Task berurutan: (1) buat registrasi/profil (nama, telepon), pengajuan toko, kepemilikan, batas satu toko per akun, dan status toko `pending`/`approved`/`rejected`/`suspended` beserta pengajuan ulang setelah penolakan; (2) buat operasi admin untuk melihat pengguna, men-suspend/mengaktifkan pengguna (sesi dicabut), serta menyetujui/menolak/men-suspend toko dengan alasan; (3) bangun daftar/detail pengguna dan antrean toko; (4) seed pengguna dan toko dengan beberapa status.
- Selesai: admin dapat memproses pengajuan dan hanya toko disetujui yang dapat beroperasi.
- Test: toko kedua dan perubahan toko orang lain ditolak; toko belum disetujui atau suspended tidak dapat memublikasikan produk; toko ditolak dapat diajukan ulang; pengguna suspended tidak dapat login dan sesinya ditolak; keputusan tercatat beserta alasan.

### Phase 05 — Kategori ke referensi katalog

- Task berurutan: (1) buat kategori satu level dan endpoint referensi publik; (2) bangun pengelolaan kategori di admin; (3) blokir penghapusan kategori yang masih dipakai produk (409) dan pastikan pengubahan nama tidak merusak referensi.
- Selesai: kategori dapat dikelola admin dan digunakan oleh API produk.
- Test: kategori tidak valid dan operasi tanpa hak ditolak; penghapusan kategori terpakai ditolak; tidak ada referensi produk yang rusak.

### Phase 06 — Produk ke moderasi katalog

- Task berurutan: (1) buat produk, foto, harga harian, stok, status publikasi/arsip, dan relasi toko/kategori; (2) buat API vendor berdasarkan kepemilikan dan katalog publik (pagination deterministik); (3) buat daftar/detail serta moderasi di admin; (4) seed variasi produk.
- Selesai: admin dapat memoderasi produk dan katalog publik hanya menampilkan produk yang layak ditampilkan.
- Test: harga/stok tidak valid dan perubahan oleh vendor lain ditolak; produk nonpublik, diarsipkan, atau dari toko belum disetujui/suspended tidak muncul di katalog; pagination tidak menggandakan atau melewatkan item.
- Catatan: aturan "stok tidak boleh di bawah pemakaian pesanan aktif" dan "produk yang pernah dipesan hanya diarsipkan" diberlakukan penuh di Phase 11 saat pesanan ada; di phase ini siapkan titik pemeriksaannya.

Gate A: admin/CMS berfungsi untuk akun, persetujuan toko, kategori, produk, media, dan konten melalui API Go dan PostgreSQL.

## Kelompok B — Backend + marketplace web

### Phase 07 — Pengunjung ke akun dan pengajuan vendor

- Task berurutan: (1) siapkan Next.js, layout Rentaid, token desain, sesi (termasuk penerusan cookie pada render sisi server), dan API; (2) buat registrasi, login/logout, dan profil; (3) buat pengajuan toko, statusnya, dan pengajuan ulang; (4) hubungkan persetujuan admin ke akses dashboard vendor.
- Selesai: pengguna baru dapat mendaftar, mengajukan toko, dan mengakses dashboard vendor setelah disetujui.
- Test: E2E registrasi → pengajuan → persetujuan → dashboard; API menolak akses vendor sebelum persetujuan.

### Phase 08 — Toko disetujui ke produk terpublikasi

- Task berurutan: (1) buat daftar dan formulir produk vendor; (2) hubungkan foto, kategori, harga, stok, dan publikasi; (3) tampilkan validasi API dan status moderasi; (4) verifikasi produk terpublikasi muncul di katalog publik.
- Selesai: vendor dapat membuat dan memperbarui produk tanpa bantuan admin.
- Test: E2E membuat produk dengan foto hingga tampil publik; input tidak valid dan perubahan oleh vendor lain ditolak.

### Phase 09 — Katalog publik ke detail produk

- Task berurutan: (1) buat beranda memakai konten CMS; (2) buat daftar produk, pencarian, filter kategori, dan pagination; (3) buat detail produk, foto, harga, dan informasi toko/pengambilan; (4) tangani tampilan kosong, tidak ditemukan, dan kegagalan API.
- Selesai: pengunjung dapat membuka detail produk dari beranda atau katalog.
- Test: pencarian/filter/pagination sesuai API; produk nonpublik tidak dapat dibuka; perubahan konten CMS terlihat.

### Phase 10 — Detail produk ke penawaran harga

- Task berurutan: (1) hitung hari inklusif, harga, dan validasi tanggal/durasi/kuantitas di Go; (2) buat skema pesanan minimal dan hitung ketersediaan per produk per tanggal (hold dan pesanan aktif); (3) buat endpoint penawaran durasi, kuantitas, dan total; (4) buat pilihan tanggal/kuantitas dan ringkasan di web.
- Selesai: server menghasilkan penawaran yang dapat dilihat penyewa tanpa menahan stok.
- Test: satu tanggal adalah satu hari; 4–5 November adalah dua hari; lintas bulan/tahun dan tahun kabisat; rentang terbalik, tanggal lampau, durasi melebihi 30 hari, dan kuantitas melebihi stok ditolak; ketersediaan per tanggal benar untuk pesanan yang sebagian beririsan (pesanan dimasukkan lewat fixture test, karena checkout baru ada di Phase 11).

### Phase 11 — Penawaran harga ke checkout dengan hold stok

- Task berurutan: (1) buat pemeriksaan dan alokasi stok per tanggal secara atomik dengan penguncian baris produk; (2) buat pesanan idempoten (`Idempotency-Key`), `order_code`, snapshot, dan hold 15 menit; (3) validasi ulang penawaran dengan `expected_total` dan jawab 409 `quote_changed` jika harga/stok berubah; (4) buat checkout dan halaman menunggu pembayaran; (5) terapkan aturan stok vendor (tidak boleh di bawah pemakaian aktif) dan pengarsipan produk yang pernah dipesan.
- Selesai: checkout menyimpan tepat satu pesanan `pending_payment` dan hold yang konsisten.
- Test: checkout bersamaan untuk stok terakhir maksimal satu berhasil; retry tidak menggandakan pesanan; key sama dengan payload berbeda ditolak; snapshot tidak berubah setelah produk diedit; batas hold tersimpan; penyewa tidak dapat memesan produk tokonya sendiri; penurunan stok di bawah pemakaian aktif ditolak.

### Phase 12 — Checkout ke pembayaran mock dan order terkonfirmasi

- Task berurutan: (1) buat catatan pembayaran dan simulator berhasil/gagal/kedaluwarsa (endpoint terpisah, hanya pemilik pesanan, dikontrol `PAYMENT_SIMULATOR_ENABLED`); (2) ubah status dan stok secara atomik dan idempoten; (3) buat UI pembayaran yang menjelaskan simulasi dan hasilnya; (4) buat daftar/detail transaksi admin dan daftar pesanan masuk vendor.
- Selesai: pembayaran sukses mengonfirmasi pesanan; gagal/kedaluwarsa melepas stok dan menghasilkan status akhir (`payment_failed`/`expired`) yang sesuai.
- Test: request pembayaran berulang tidak menggandakan transaksi; pembayaran terlambat dan akses pesanan orang lain ditolak; pemanggil selain pemilik ditolak; simulator nonaktif menolak; total mengikuti snapshot.

### Phase 13 — Pesanan belum diserahkan ke pembatalan dan refund

- Task berurutan: (1) rapikan hold kedaluwarsa di proses Go dan abaikan hold kedaluwarsa dalam pembacaan stok; (2) buat pembatalan sebelum serah terima untuk penyewa/vendor terkait/admin (tanpa refund untuk `pending_payment`, refund penuh untuk `confirmed`), termasuk pembatalan admin untuk no-show; (3) buat refund mock penuh untuk pembayaran sukses; (4) tampilkan tindakan dan hasil di web/vendor/admin.
- Selesai: pembatalan atau kedaluwarsa tidak meninggalkan stok tertahan maupun refund ganda.
- Test: batas 15 menit dengan clock terkendali, pembayaran bersamaan dengan pembatalan (tepat satu menang, yang kalah menerima 409), refund berulang, restart dengan hold aktif, pembatalan oleh pihak tidak berhak, dan pembatalan pesanan `confirmed` yang melewati `end_date`.

### Phase 14 — Order terkonfirmasi ke barang diserahkan

- Task berurutan: (1) buat transisi `confirmed → renting` dan audit aktor, hanya antara `start_date` dan `end_date` (Asia/Jakarta); (2) buat tindakan serah terima vendor, dengan nama/telepon penyewa dan `order_code` terlihat hanya oleh vendor pesanan tersebut; (3) tampilkan status pada penyewa/admin; (4) tolak pembatalan setelah serah terima.
- Selesai: hanya vendor terkait dapat menyerahkan pesanan terkonfirmasi.
- Test: pesanan belum dibayar, batal, atau kedaluwarsa tidak dapat diserahkan; serah terima di luar jendela tanggal ditolak; pengulangan tidak membuat riwayat ganda; pembatalan setelah serah terima ditolak; vendor lain tidak melihat data kontak penyewa.

### Phase 15 — Barang disewa ke pengembalian dan order selesai

- Task berurutan: (1) buat konfirmasi pengembalian vendor dengan transisi `renting → completed`; (2) simpan waktu dan riwayat secara atomik; (3) tampilkan tindakan dan status selesai; (4) pertahankan snapshot harga dan aturan stok tanggal akhir inklusif (pengembalian awal tidak membebaskan stok).
- Selesai: pengembalian terkonfirmasi menghasilkan pesanan selesai yang konsisten.
- Test: hanya pesanan `renting` dapat diselesaikan; vendor lain ditolak; pengulangan tidak menggandakan kejadian; pengembalian terlambat tetap dapat dikonfirmasi; stok tanggal akhir mengikuti aturan inklusif.

### Phase 16 — Riwayat dan detail pesanan lintas peran

- Task berurutan: (1) lengkapi riwayat/detail pesanan, pembayaran, dan refund untuk penyewa; (2) lengkapi tampilan yang sama untuk vendor (pesanan tokonya) dan admin (semua pesanan, dengan tindakan pembatalan); (3) tampilkan riwayat status beserta aktor dan waktu; (4) lengkapi pemfilteran dan pagination daftar pesanan.
- Selesai: setiap peran melihat data pesanan sesuai haknya dan tindakan yang tersedia sesuai status.
- Test: akses pesanan orang lain ditolak untuk setiap peran; filter dan pagination konsisten; tindakan yang tidak sah untuk status tertentu tidak ditampilkan dan ditolak API.

### Phase 17 — Paket demo web yang dapat diulang

- Task berurutan: (1) siapkan Compose untuk API, web, admin statis (di `/admin/`), reverse proxy, PostgreSQL, dan media; (2) siapkan seed demo, health check, panduan demo, serta backup/restore database dan media; (3) tulis dan jalankan E2E alur lengkap; (4) perbaiki masalah integrasi yang ditemukan.
- Selesai: demo dapat diulang dari database kosong sampai pesanan selesai tanpa layanan eksternal.
- Test: registrasi → persetujuan toko → produk → checkout → bayar mock → serah terima → pengembalian; gagal/batal/refund; restart; seed berulang; backup/restore database dan media.

Gate B: marketplace web, vendor, dan admin menyelesaikan alur MVP. Backend menjadi fondasi Android; aturan bisnis tidak dibangun ulang di mobile.

## Kelompok C — Backend + Android penyewa

### Phase 18 — Toolchain Android ke aplikasi terhubung API

- Task berurutan: (1) verifikasi JDK, Android SDK, emulator/perangkat, dan Gradle Wrapper serta pin versi; (2) siapkan Compose, navigasi, tema, ViewModel, repository, dan konfigurasi jaringan khusus debug; (3) generate klien Kotlin dari OpenAPI dan konfigurasi API emulator/perangkat; (4) tangani loading, error, dan koneksi.
- Selesai: APK pengembangan dapat dipasang dan membaca data API lokal.
- Test: build dan instalasi; koneksi emulator/perangkat; API tidak tersedia menghasilkan pesan yang jelas tanpa crash.

### Phase 19 — Pengguna Android ke sesi dan profil

- Task berurutan: (1) hubungkan registrasi/login dan penyimpanan token yang terlindungi; (2) buat profil (nama, telepon) dan logout dengan pencabutan sesi; (3) tangani kedaluwarsa, restart, suspend, dan autentikasi ulang; (4) uji aturan akun terhadap API yang sama dengan browser.
- Selesai: akun dapat digunakan dari Android dengan sesi yang dapat dipulihkan dan dicabut.
- Test: registrasi/login/logout; token bertahan setelah restart sesuai masa berlaku; token yang dicabut atau milik pengguna suspended ditolak; kredensial tidak masuk log.

### Phase 20 — Katalog Android ke detail produk

- Task berurutan: (1) buat beranda dan konten publik CMS; (2) buat katalog, pencarian, filter, dan pagination; (3) buat detail produk, foto, harga, dan toko; (4) tangani data kosong, produk tidak tersedia, dan kegagalan jaringan.
- Selesai: penyewa dapat menemukan dan membuka produk yang sama dengan marketplace web.
- Test: filter/pencarian sesuai API; pagination tidak menggandakan item; produk nonpublik tidak tampil; kegagalan gambar/data tidak menyebabkan crash.

### Phase 21 — Detail Android ke checkout dengan hold

- Task berurutan: (1) buat pilihan tanggal/kuantitas dan penawaran dari Go; (2) hubungkan checkout idempoten dengan `Idempotency-Key` yang dibuat sekali per upaya; (3) tampilkan ringkasan, total, dan sisa hold berdasarkan waktu server; (4) tangani `quote_changed`, perubahan stok, dan hasil tidak diketahui akibat koneksi terputus (ulangi dengan key yang sama).
- Selesai: Android menghasilkan satu pesanan dengan harga dan hold yang sama dengan web.
- Test: total web dan Android sama; double tap/retry tidak menggandakan pesanan; perebutan stok lintas web–Android tetap aman.

### Phase 22 — Checkout Android ke pembayaran dan order terkonfirmasi

- Task berurutan: (1) buat layar pembayaran mock berhasil/gagal/kedaluwarsa dengan penjelasan simulasi; (2) tampilkan hasil pada detail pesanan; (3) pulihkan status dari API setelah aplikasi ditutup atau kembali dari background; (4) lengkapi kontrak/backend yang dibutuhkan mobile tanpa mengubah aturan bisnis.
- Selesai: hasil pembayaran tersimpan di server dan konsisten setelah aplikasi dibuka kembali.
- Test: hasil sukses/gagal/kedaluwarsa, request berulang, aplikasi ditutup saat pembayaran, serta pembayaran setelah hold berakhir.

### Phase 23 — Order Android ke pemantauan, pembatalan, dan penyelesaian

- Task berurutan: (1) buat daftar/detail riwayat pesanan, pembayaran, refund, dan status; (2) hubungkan pembatalan sebelum serah terima dan refund mock; (3) segarkan status saat layar dibuka kembali atau di-refresh; (4) tampilkan transisi `confirmed → renting → completed` dari tindakan vendor web.
- Selesai: Android mencerminkan tindakan penyewa/vendor/admin tanpa fitur pengelolaan vendor.
- Test: pesanan Android diserahkan/dikembalikan di web dan status mengikuti; pembatalan/refund konsisten lintas aplikasi; pembatalan terlambat dan akses pesanan orang lain ditolak.

### Phase 24 — Uji lintas aplikasi dan stabilitas

- Task berurutan: (1) jalankan test lintas aplikasi pada backend dan PostgreSQL yang sama; (2) verifikasi sesi dan transaksi saat gangguan jaringan, restart aplikasi, dan restart server; (3) verifikasi konsistensi stok dan idempotensi lintas web–Android; (4) perbaiki temuan.
- Selesai: tidak ada selisih perilaku bisnis antara web dan Android pada skenario yang diuji.
- Test: perebutan stok terakhir web vs Android; retry setelah koneksi terputus; sesi dicabut dari satu klien terlihat di klien lain; data bertahan setelah restart.

### Phase 25 — APK penyerahan dan panduan demo

- Task berurutan: (1) sediakan perintah root build Android; (2) tulis panduan instalasi, koneksi emulator/perangkat fisik, dan skenario demo; (3) hasilkan APK demo bertanda tangan debug; (4) catat hasil test dan keterbatasan lingkungan.
- Selesai: APK dapat dipasang dan seluruh alur penyewa dapat diselesaikan bersama vendor/admin web.
- Test: instalasi emulator/perangkat; produk → checkout → bayar mock → serah terima → pengembalian → selesai; gagal/batal/refund; runtime tanpa kredensial layanan eksternal.

Gate akhir: backend, admin/CMS, web, dan Android memakai aturan bisnis yang sama; stok dan transaksi konsisten; data bertahan setelah restart; demo lokal terdokumentasi; APK tersedia. Hosting publik dan publikasi Play Store di luar MVP.
