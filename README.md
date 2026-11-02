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

Aplikasi marketplace web dan Android serta perintah build masing-masing belum tersedia pada phase ini.

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

API pemilik tersedia di `/api/v1/store` dan riwayatnya di `/api/v1/store/history`; endpoint admin tersedia di `/api/v1/admin/users` dan `/api/v1/admin/stores`. Kontrak lengkap tersedia di `packages/contracts/openapi.json`. Antarmuka pengajuan pengguna dan produk vendor menyusul pada Phase 07 dan 08.

Untuk membuat empat akun dan toko demo opsional, tetapkan `SEED_DEMO_PASSWORD` (minimal 12 karakter) sebelum menjalankan `pnpm db:seed`, bersama variabel seed admin seperti di atas. Akunnya `demo.pending@example.test`, `demo.approved@example.test`, `demo.rejected@example.test`, dan `demo.suspended@example.test`, semuanya menggunakan password demo tersebut. Seed berulang tidak mengubah akun atau password yang sudah ada. Untuk Compose, tambahkan `-e SEED_DEMO_PASSWORD` pada perintah `docker compose ... exec` yang dijelaskan di bagian Phase 02. Hapus variabel password dari environment setelah selesai.

Untuk memeriksa alur admin melalui browser, gunakan layanan dan database test terpisah lalu tetapkan `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH`; jalankan `pnpm test:admin-stores`. Test membuat akun dan toko baru serta mengubah statusnya, sehingga tidak boleh diarahkan ke data pengguna. Pengujian bahwa produk dari toko belum disetujui atau ditangguhkan tidak dapat dipublikasikan dilakukan pada Phase 06, ketika fitur produk tersedia.

## Phase 05 - Kategori katalog

Admin dapat menambahkan, mengubah nama, dan menghapus kategori melalui panel. Endpoint publik `GET /api/v1/categories` mendukung `page` dan `page_size` (default 20, maksimal 50). Perubahan nama mempertahankan UUID kategori. Penghapusan kategori yang dirujuk foreign key produk ditolak dengan respons 409.

`pnpm test:admin-categories` memeriksa alur kategori di browser. Tetapkan variabel `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, dan `CHROME_PATH` seperti pada test admin lainnya, dan gunakan database test terpisah. Pengujian foreign key saat ini menggunakan tabel produk sementara; integrasi dengan produk sebenarnya dilakukan pada Phase 06.

## Phase 06 - Produk dan moderasi katalog

Vendor dengan toko yang disetujui dapat menggunakan API `/api/v1/vendor/products` untuk membuat dan mengubah produk, mengatur publikasi dan arsip, serta mengunggah foto melalui `/api/v1/vendor/media`. Nama, deskripsi, kategori, harga harian, dan stok wajib; foto opsional (maksimal sepuluh). Harga harus positif dan stok boleh nol. Antarmuka vendor menyusul pada Phase 08.

Admin dapat meninjau produk dan riwayat moderasi melalui panel. Menyembunyikan atau mengaktifkan kembali produk memerlukan alasan. API publik `/api/v1/products` hanya menampilkan produk terbit yang tidak diarsipkan atau disembunyikan dan berasal dari toko yang disetujui. Saat `SEED_DEMO_PASSWORD` disediakan pada `pnpm db:seed`, seed juga membuat beberapa kategori dan produk demo tanpa menimpa produk demo yang sudah ada.

Jalankan `pnpm test:admin-products` pada database test terpisah yang sudah diberi seed demo; tetapkan variabel browser seperti test admin lainnya. Test mengubah status moderasi produk demo dan menyimpan riwayat. Pengujian stok terhadap pesanan aktif dan pengarsipan produk yang pernah dipesan dilakukan pada Phase 11.
