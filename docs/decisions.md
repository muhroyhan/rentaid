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
