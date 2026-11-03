# Rentaid — pengembangan lokal

Workspace ini berisi API Go, admin React + Vite, kontrak OpenAPI, klien TypeScript, dan PostgreSQL lokal. Ruang lingkup dan urutan implementasi ada di [AGENTS.md](AGENTS.md) dan [rencana pengembangan](docs/plan.md).

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

Aplikasi Android dan perintah build-nya belum tersedia pada phase ini.

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
