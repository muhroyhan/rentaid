# Keputusan teknis

- **Migrasi SQL:** runner Go kecil berbasis pgx dan file SQL embedded dengan transaksi, advisory lock, serta checksum. Tabel metadata memakai primary key UUID sesuai aturan proyek; migrasi yang sudah dijalankan tidak boleh diubah. Ini menghindari tabel metadata integer bawaan goose.
- **Kontrak:** OpenAPI 3.0.3 menjadi sumber kontrak. kin-openapi memvalidasi request dan response runtime; salinan embedded diperbarui melalui generator dan diperiksa kesamaannya.
- **Klien TypeScript:** openapi-typescript menghasilkan tipe, openapi-fetch menyediakan klien; output diperiksa terhadap spesifikasi pada `pnpm check`.
- **Tool lanjutan:** gunakan openapi-generator untuk klien Kotlin dan Playwright untuk E2E saat phase terkait dimulai. Implementasi server Go menggunakan `net/http` dan validasi kin-openapi; generator server Go dapat dipertimbangkan ketika kontrak berkembang.
- **Seed awal:** Seed lokal membuat setting demo dan admin dari environment secara idempoten; password admin yang sudah ada tidak diubah dan seed ditolak di production.
- **Lint:** golangci-lint dijalankan melalui image Docker berversi tetap agar tidak memerlukan instalasi global dan dapat berjalan pada lingkungan Windows yang membatasi executable lokal.

- **Login dan CSRF:** browser memperoleh token pra-login melalui endpoint khusus dengan cookie HttpOnly; Origin dan token diperiksa sebelum login. Setelah login, sesi menyimpan token CSRF per sesi. Android menerima bearer token tanpa cookie dan tidak memakai CSRF.
- **Batas login:** default lima percobaan per alamat peer per 15 menit, dihitung dalam proses dan direset saat login sukses. Reverse proxy Compose lokal membuat koneksi dari proxy berbagi batas ini; untuk deployment multi-instance diperlukan pembatasan bersama di proxy/penyimpanan.
- **Proxy lokal:** Vite meneruskan `/api` saat pengembangan; profil Compose `app` memakai Nginx pada port 8081 untuk `/admin/` dan `/api/`.
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
