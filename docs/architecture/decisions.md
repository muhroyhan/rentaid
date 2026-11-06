**Catatan:** keputusan berikut mencakup riwayat per phase. Untuk arsitektur dan instruksi saat ini, mulai dari [arsitektur](README.md) dan [panduan engineer](../engineering/README.md).

# Keputusan teknis

- **Migrasi SQL:** runner Go kecil berbasis pgx dan file SQL embedded dengan transaksi, advisory lock, serta checksum. Tabel metadata memakai primary key UUID sesuai aturan proyek; migrasi yang sudah dijalankan tidak boleh diubah. Ini menghindari tabel metadata integer bawaan goose.
- **Kontrak:** OpenAPI 3.0.3 menjadi sumber kontrak. kin-openapi memvalidasi request dan response runtime; salinan embedded diperbarui melalui generator dan diperiksa kesamaannya.
- **Klien TypeScript:** openapi-typescript menghasilkan tipe, openapi-fetch menyediakan klien; output diperiksa terhadap spesifikasi pada `pnpm check`.
- **Tool lanjutan:** gunakan openapi-generator untuk klien Kotlin dan Playwright untuk E2E saat phase terkait dimulai. Implementasi server Go menggunakan `net/http` dan validasi kin-openapi; generator server Go dapat dipertimbangkan ketika kontrak berkembang.
- **Seed awal:** Seed lokal membuat setting demo dan admin dari environment secara idempoten; password admin yang sudah ada tidak diubah dan seed ditolak di production.
- **Lint:** golangci-lint dijalankan melalui image Docker berversi tetap agar tidak memerlukan instalasi global dan dapat berjalan pada lingkungan Windows yang membatasi executable lokal.

- **Login dan CSRF:** browser memperoleh token pra-login melalui endpoint khusus dengan cookie HttpOnly; Origin dan token diperiksa sebelum login. Setelah login, sesi menyimpan token CSRF per sesi. Android menerima bearer token tanpa cookie dan tidak memakai CSRF.
- **Batas login:** default lima percobaan per alamat peer per 15 menit, dihitung dalam proses dan direset saat login sukses. Reverse proxy Compose lokal membuat koneksi dari proxy berbagi batas ini; untuk deployment multi-instance diperlukan pembatasan bersama di proxy/penyimpanan.
- **Proxy lokal:** Vite dan Next.js meneruskan `/api` saat pengembangan; profil Compose `app` memakai Nginx pada port 8081 untuk marketplace, `/admin/`, dan `/api/`.
- **Test Go:** jalankan test melalui image Docker yang dipin karena Application Control Windows dapat memblokir executable Go lokal; `TEST_DATABASE_URL` lokal diterjemahkan ke host Docker untuk integrasi.

- **Konten CMS:** lima halaman tetap memakai key `home`, `faq`, `about`, `terms`, dan `privacy`; masing-masing memiliki judul, isi teks biasa, dan satu gambar opsional. Draft dan snapshot publik disimpan terpisah agar perubahan draft tidak langsung muncul publik.
- **Media lokal:** upload berupa body biner; server memverifikasi dan mendekode JPEG/PNG/WebP, membatasi 5 MB dan 20 juta piksel, lalu memakai nama acak. Media publik hanya dapat dibaca jika direferensikan snapshot halaman yang sudah terbit; media draft dapat dilihat admin.
- **Integrasi media:** klien TypeScript hasil generate digunakan untuk operasi JSON. Upload biner memakai `fetch` karena generator saat ini mengetik format OpenAPI `binary` sebagai string.

## Phase 04 - Pengajuan toko dan akun demo

- Pengajuan toko mewajibkan nama, alamat, dan nomor telepon sesuai keputusan pengguna. Penolakan hanya dari `pending`, persetujuan hanya dari `pending`, penangguhan hanya dari `approved`, dan pengaktifan kembali hanya dari `suspended`. Pengajuan ulang dari `rejected` menyimpan data baru dan kembali ke `pending`. Setiap perubahan status dicatat bersama aktor, waktu, dan alasan; alasan wajib pada penolakan dan penangguhan.
- `SEED_DEMO_PASSWORD` mengaktifkan seed opsional untuk empat akun demo beralamat `demo.<status>@example.test`. Seed atomik, tidak mengubah akun yang sudah ada, dan menggunakan akun admin seed sebagai aktor keputusan contoh.
- Produk belum tersedia hingga Phase 06. Pemeriksaan status toko disediakan sebagai `store.Service.Approved`; semua operasi vendor dan publikasi produk harus menerapkannya di Phase 06, disertai pengujian produk sesungguhnya.

## Phase 05 - Kategori katalog

- Kategori memiliki nama dan UUID tanpa hierarki. Daftar publik diurutkan berdasarkan nama dan UUID untuk pagination deterministik; nama dibatasi 120 karakter dan tidak boleh kosong setelah spasi dihapus.
- Produk Phase 06 wajib memakai foreign key `category_id` ke `categories(id)` dengan `ON DELETE RESTRICT` atau `NO ACTION`. API menerjemahkan kedua jenis pelanggaran foreign key menjadi 409. Pengujian saat ini menggunakan tabel produk sementara pada schema PostgreSQL terisolasi karena tabel produk belum ada.
- Pemeriksaan checksum migrasi menerima konversi LF/CRLF yang tidak mengubah isi SQL, agar checkout Git Windows tidak membuat migrasi lama gagal; perubahan isi SQL tetap ditolak.

## Phase 06 - Produk dan moderasi

- Sesuai keputusan pengguna, nama, deskripsi, kategori, harga harian, dan stok wajib; foto bersifat opsional. Produk terbit langsung tampil bila tokonya disetujui dan produk tidak diarsipkan atau disembunyikan. Admin dapat menyembunyikan dan mengaktifkan kembali produk dengan alasan yang disimpan pada riwayat.
- Maksimal sepuluh foto per produk untuk membatasi ukuran permintaan; unggahan milik vendor harus direferensikan oleh pemilik yang sama. Stok nol diperbolehkan untuk menandai barang yang sedang tidak tersedia, sedangkan harga harus positif. Arsip menonaktifkan publikasi; produk yang dipulihkan tetap harus diterbitkan kembali.
- Operasi vendor mengunci baris toko saat memeriksa persetujuan agar penangguhan toko dan perubahan produk tidak saling melewati. Produk dan media publik disaring berdasarkan status produk dan toko. Pembatasan stok terhadap pesanan aktif dan aturan produk yang sudah dipesan dilaksanakan pada Phase 11.
- Produk demo ditambahkan hanya saat `SEED_DEMO_PASSWORD` disediakan, menggunakan toko demo yang disetujui. Penanda seed menjaga seed berulang tidak menimpa perubahan produk demo.

## Phase 07 - Marketplace Next.js

- Marketplace menggunakan Next.js App Router dan token bersama `packages/ui`; server membaca cookie sesi dan meneruskannya ke API menggunakan permintaan tanpa cache. Browser tetap mengirim permintaan API pada origin yang sama.
- Endpoint `GET /api/v1/vendor/dashboard` memeriksa role pengguna dan persetujuan toko di Go; endpoint baca produk dan media vendor juga menolak toko yang belum disetujui atau ditangguhkan.
- Compose melayani marketplace pada `/`, admin pada `/admin/`, dan API pada `/api/` melalui satu origin. `API_ORIGIN` dipakai server Next.js untuk menghubungi API internal.

## Phase 08 - Antarmuka produk vendor

- Formulir memakai klien OpenAPI untuk data dan status produk, serta `fetch` dengan body biner untuk upload foto karena tipe biner generator saat ini berupa string. Foto yang telah diunggah hanya terhubung ke produk setelah formulir disimpan; aset yang dilepas belum dibersihkan otomatis.
- Kategori diambil per halaman dengan ukuran 50 sampai habis; produk vendor ditampilkan 20 per halaman. Formulir menampilkan validasi API dan status moderasi, serta meminta konfirmasi saat membatalkan perubahan yang belum disimpan.

## Phase 09 - Katalog publik

- Pencarian produk publik mencocokkan teks literal tanpa membedakan huruf besar/kecil pada nama dan deskripsi; filter kategori memakai UUID. Pengurutan tetap berdasarkan waktu pembuatan dan UUID agar pagination deterministik.
- Katalog menampilkan 12 produk per halaman dan memeriksa halaman berikutnya untuk menentukan navigasi. Alamat toko disertakan pada respons produk sebagai informasi pengambilan.
- Konten CMS dan produk publik dibaca tanpa cache; prefetch tautan produk dinonaktifkan agar detail memeriksa kembali status publik saat pengunjung membukanya.

## Phase 10 - Penawaran harga

- Penawaran bersifat baca saja melalui GET agar dapat dilihat pengunjung tanpa sesi dan tidak menahan stok. Ketersediaan adalah stok dikurangi pemakaian puncak pada setiap tanggal inklusif; hold dengan waktu berakhir sama dengan waktu pemeriksaan dianggap kedaluwarsa.
- Skema pesanan minimal menyimpan produk, tanggal, kuantitas, status, dan waktu hold. Checkout, pemilik, snapshot harga, serta penguncian stok ditambahkan pada Phase 11. Total dibatasi pada integer aman JavaScript agar nilai rupiah yang diterima web tidak kehilangan presisi.

## Phase 11 - Checkout dan hold

- Checkout mengunci toko lalu produk dalam urutan yang sama dengan operasi vendor; perhitungan stok dan penyimpanan pesanan berada dalam satu transaksi. Penurunan stok vendor memeriksa pemakaian puncak tanggal saat ini dan mendatang, sementara arsip atau pembatalan publikasi tidak mengubah snapshot pesanan.
- Kunci idempotensi diserialisasi per pengguna dan endpoint melalui advisory lock PostgreSQL; respons yang diproses disimpan selama 24 jam. Browser mempertahankan kunci untuk retry jika respons jaringan tidak diterima. Kode pesanan memakai 40 bit acak heksadesimal dan constraint unik database.

## Phase 12 - Pembayaran simulasi

- Simulator dinonaktifkan secara default di API dan diaktifkan eksplisit pada Compose lokal. Setiap pesanan memiliki paling banyak satu catatan pembayaran; nilai pembayaran diambil dari snapshot total, dan perubahan status serta riwayat disimpan dalam transaksi yang mengunci pesanan.
- Permintaan setelah hold berakhir mengubah pesanan menjadi `expired` dan mengembalikan 409 tanpa membuat transaksi pembayaran. Hasil simulasi kedaluwarsa yang dipilih saat hold masih aktif membuat catatan simulasi `expired`. Kedua jalur melepaskan stok; pembersihan berkala tetap dikerjakan pada Phase 13.
- Daftar vendor difilter berdasarkan kepemilikan toko dan tetap dapat dilihat saat toko ditangguhkan. Daftar dan detail pembayaran admin tidak dapat diakses akun pengguna.

## Phase 13 - Pembatalan dan refund

- Pembatalan memerlukan status yang terakhir dilihat klien dan mengunci baris pesanan yang sama dengan simulator pembayaran. Jika status berubah sebelum kunci diperoleh, API mengembalikan 409; pengulangan pesanan yang sudah dibatalkan mengembalikan hasil refund tersimpan.
- Refund simulasi penuh dibuat dalam transaksi pembatalan untuk pembayaran sukses, dengan constraint unik pada pembayaran. Pembersih hold berjalan saat API dimulai dan setiap menit, memakai `Clock`, batch 200, serta penguncian `SKIP LOCKED` agar aman terhadap tindakan pada pesanan yang sama.
- Properti `refundAmount` pada kontrak detail pesanan bersifat opsional untuk mendukung respons checkout lama yang masih tersimpan sebagai hasil idempotensi. Respons detail yang baru menyertakan nilai nol atau jumlah refund.

## Phase 14 - Serah terima barang

- Serah terima mengunci baris pesanan yang sama dengan pembatalan, memeriksa kepemilikan toko serta tanggal inklusif memakai `Clock` dan Asia/Jakarta, lalu mencatat aktor dalam riwayat. Toko yang ditangguhkan tetap dapat memproses pesanan yang sudah ada.
- Pengulangan saat pesanan `renting` mengembalikan status saat ini tanpa riwayat tambahan. Setelah pesanan selesai, pengulangan juga mengembalikan status saat ini bila riwayat menunjukkan serah terima sudah terjadi.

## Phase 15 - Pengembalian barang

- Konfirmasi vendor mengunci pesanan dan menyimpan `returned_at`, perubahan status, serta riwayat dalam satu transaksi. Pengulangan mengembalikan waktu tersimpan; pengembalian terlambat tidak mengubah snapshot harga atau menambah denda.
- Pesanan `completed` tetap dihitung dalam penawaran, checkout, dan pembatasan pengurangan stok selama rentang tanggal sewanya. Dengan demikian pengembalian awal tidak membebaskan stok sebelum tanggal akhir. `returnedAt` pada respons detail bersifat opsional agar respons idempotensi lama tetap berlaku.

## Phase 16 - Riwayat pesanan

- Filter daftar menggunakan satu status pesanan opsional dan pagination `page`/`page_size`; urutan memakai waktu pembuatan dan UUID menurun. Detail dibaca dalam transaksi read-only dengan snapshot konsisten agar pesanan, pembayaran, refund, dan riwayat berasal dari keadaan database yang sama.
- Penyewa hanya melihat pesanan miliknya; vendor hanya melihat pesanan toko miliknya, termasuk saat toko ditangguhkan; admin melihat seluruh pesanan. Kontak penyewa hanya disertakan pada detail vendor dan admin. Aktor sistem dan admin ditampilkan dengan label peran tanpa mengekspos email.

## Phase 17 - Paket demo dan pemulihan

- Demo memakai Compose yang sama dengan pengembangan, dengan nama project dan port yang dapat dipilih. Gateway memiliki health check untuk API, marketplace, dan admin statis agar perintah startup menunggu seluruh jalur aplikasi siap.
- Backup menghentikan API sementara, menyimpan dump PostgreSQL format custom serta arsip media, dan menambahkan checksum SHA-256. Restore memeriksa integritas dan menolak aplikasi target yang masih berjalan atau database/media yang sudah berisi data; tidak ada penghapusan otomatis terhadap target.
- Pengujian demo memakai dua project Compose unik beserta port dan password acak. Alur browser membuat vendor, toko, produk bergambar, serta pesanan sampai selesai dan skenario gagal/batal/refund. Pemulihan diverifikasi lewat status pesanan, jumlah data, login, dan checksum media sebelum volume test dibersihkan.

## Phase 18 - Fondasi Android

- Gradle 8.11.1, JDK Temurin 17.0.20.1, Android Gradle Plugin 8.9.3, Kotlin 2.1.20, dan Android SDK 35 dipilih agar build dapat diulang. Kotlin client dihasilkan menggunakan OpenAPI Generator 7.13.0 dengan OkHttp dan Gson; kontrak API tetap satu sumber.
- Layar awal memeriksa endpoint health untuk membuktikan komunikasi tanpa mendahului fitur katalog Phase 20. URL debug default menuju gateway Compose melalui `10.0.2.2:8081`; perangkat USB dapat memakai `adb reverse`.

## Phase 19 - Akun Android

- Token bearer dienkripsi dengan AES-GCM memakai kunci Android Keystore dan disimpan di preferensi privat; backup aplikasi dinonaktifkan. Password hanya disimpan dalam memori untuk input dan tidak ditulis ke log.
- Sesi dipulihkan dengan memeriksa profil pada API. Respons 401 menghapus token dan meminta login kembali; kegagalan jaringan mempertahankan token agar pengguna dapat mencoba lagi. Logout memerlukan respons server agar pencabutan sesi dapat dipastikan.
- Test end-to-end akun menggunakan API dan database lokal terpisah karena registrasi membuat data baru.

## Phase 20 - Katalog Android

- Katalog, kategori, detail, dan konten CMS diambil melalui klien Kotlin hasil generate; publikasi dan visibilitas tetap diputuskan API. Pagination meminta 20 produk per halaman dan menghapus duplikasi berdasarkan ID; pencarian dan perubahan kategori memulai halaman pertama kembali.
- Foto dimuat dari endpoint media publik dengan batas unduhan 5 MB dan ukuran decode maksimal sekitar 1024 piksel per sisi. Gambar gagal ditampilkan sebagai pesan tanpa menghentikan aplikasi.
- Pengujian memakai database terpisah dengan fixture produk terbit, produk nonpublik, halaman CMS, dan media yang gagal dimuat.

## Phase 21 - Checkout Android

- Penawaran, harga, ketersediaan, dan hold tetap ditentukan oleh API. Respons sesi, checkout, dan detail pesanan menyertakan header `Date` dari clock bisnis server. Android menghitung sisa hold dengan waktu monoton, dikurangi durasi perjalanan respons dan ketelitian satu detik header HTTP.
- Upaya checkout disimpan terenkripsi sebelum dikirim, termasuk kunci idempotensi, data penawaran, akun, dan origin API. Hasil jaringan yang tidak diketahui dapat dicoba ulang dengan kunci dan data yang sama; percobaan otomatis diblokir mendekati batas idempotensi 24 jam. Data yang gagal didekripsi dipertahankan, dan upaya tidak dapat diteruskan oleh akun atau origin yang berbeda.
- Perubahan penawaran memerlukan konfirmasi pengguna sebelum membuat upaya dan kunci baru. Pengujian perangkat memeriksa kesamaan penawaran web dan Android, pengulangan tanpa duplikasi, serta perebutan stok terakhir antara sesi web dan token Android.

## Phase 22 - Pembayaran Android

- Pembayaran memakai endpoint simulator dan klien Kotlin dari kontrak yang sudah ada. Pilihan berhasil, gagal, atau kedaluwarsa dijelaskan sebagai simulasi lokal; status yang ditampilkan selalu dimuat ulang dari API.
- Kunci, hasil simulasi yang dipilih, waktu server, akun, dan origin disimpan bersama checkout terenkripsi sebelum request. Jika respons terputus, aplikasi memakai payload dan kunci yang sama; setelah batas aman 24 jam, aplikasi hanya memeriksa status dan tidak mengulang request. Detail lama disembunyikan saat sesi diperiksa kembali.
- Tombol lanjutkan pesanan pada beranda membuka checkout tersimpan setelah aplikasi dibuka kembali. Saat layar kembali aktif, status dan upaya yang belum diketahui diperiksa melalui API; daftar riwayat tetap menjadi cakupan Phase 23.

## Phase 23 - Riwayat dan pembatalan Android

- Daftar penyewa memakai pagination API 20 pesanan dan detail memakai endpoint penyewa yang memuat pembayaran, refund, serta riwayat status. Data disegarkan saat layar aktif atau dimuat ulang; data lama dihapus sebelum memeriksa sesi kembali.
- Pembatalan meminta konfirmasi dan mengirim status yang terakhir dibaca sebagai prasyarat. Konflik atau hasil jaringan yang tidak diketahui diikuti pembacaan ulang detail; server tetap menentukan status dan refund, termasuk ketika vendor atau admin bertindak bersamaan.
- Pengujian perangkat mencakup pembatalan dan refund lintas sesi Android–web, akses pengguna lain, dan penolakan pembatalan setelah serah terima. Test browser tambahan membuat pesanan melalui Android, lalu menjalankan serah terima dan pengembalian melalui antarmuka vendor web sambil memeriksa status di Android.

## Phase 24 - Stabilitas lintas aplikasi

- Pengujian membangun project Compose acak dengan database dan volume baru. Proxy lokal test membuang respons sesudah upstream menyelesaikan request, sehingga pemulihan checkout dan pembayaran menguji transaksi PostgreSQL yang benar-benar tersimpan.
- Pemulihan menjalankan ViewModel checkout Android dengan penyimpanan Keystore yang sama lintas penghentian proses. Kunci dan hash payload dibandingkan sebelum dan sesudah restart API/PostgreSQL; jumlah pesanan, pembayaran, dan riwayat konfirmasi diperiksa langsung pada database test.
- Layar akun memeriksa sesi kembali saat aktif, dengan penjagaan agar pemulihan tidak berjalan bersamaan dengan operasi akun yang sedang diproses. Hal ini membuat pencabutan sesi tercermin saat pengguna kembali dari background.

## Phase 25 - APK dan panduan demo

- `pnpm android:demo` membangun dua APK debug dengan origin tetap sesuai cara koneksi: `127.0.0.1:8081` untuk USB dengan `adb reverse`, dan `10.0.2.2:8081` untuk emulator. Salinan APK dan manifest ukuran/SHA-256 disimpan di `.artifacts/android-demo`; kunci penandatanganan debug tetap dikelola oleh Gradle pada mesin build.
- Verifikasi penyerahan memasang kedua berkas, memeriksa tanda tangan dan hash, lalu menjalankan alur UI Android bersama vendor dan admin browser pada project Compose terpisah. Jaringan runtime dibuat internal, dengan relay lokal khusus pengujian ke gateway; seed memakai akun dan password lokal tanpa layanan kredensial eksternal.
