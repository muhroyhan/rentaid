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
