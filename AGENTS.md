# Panduan agen Rentaid

## Cara bekerja

- Baca dokumen yang relevan sebelum mengubah perilaku. Aturan bisnis kanonik berada di [docs/business/rules.md](docs/business/rules.md); perubahan aturan harus disertai pembaruan dokumen tersebut, OpenAPI, dan test dalam perubahan yang sama.
- Untuk audit kode atau struktur, baca [.codex/instructions/audit.md](.codex/instructions/audit.md). Untuk pekerjaan test, baca [.codex/instructions/testing.md](.codex/instructions/testing.md). Untuk dokumentasi, baca [.codex/instructions/docs.md](.codex/instructions/docs.md). File modul ini dibaca sesuai tugas; namanya tidak ditemukan otomatis oleh Codex.
- Baca `AGENTS.md` yang lebih dekat ke aplikasi yang disentuh. Pertahankan blok instruksi Next.js yang dihasilkan di `apps/web/AGENTS.md`.
- Kebutuhan bisnis penting yang tidak jelas harus ditanyakan kepada pengguna. Keputusan teknis kecil dicatat singkat di `docs/architecture/decisions.md`.

## Workspace dan arsitektur

- Rentaid adalah marketplace rental dalam satu pnpm workspace: Next.js di `apps/web`, React/Vite di `apps/admin`, modular monolith Go di `apps/api`, dan Kotlin/Compose di `apps/android`. `packages/contracts` adalah OpenAPI, `packages/api-client` klien TypeScript, dan `packages/ui` token web. Demo memakai data baru; migrasi data produksi dan kompatibilitas API/aplikasi lama tidak diperlukan.
- Pertahankan ketiga folder proyek lama sebagai referensi; jangan menghapus atau menimpanya. Folder lama tidak termasuk workspace, build, runtime, atau glob pemeriksaan baru. Jangan membaca, mencetak, atau menyalin kredensial, file environment berisi rahasia, dependensi terpasang, maupun konfigurasi layanan eksternal dari proyek lama.
- Nama lama tidak boleh muncul pada path atau konten `apps/`, `packages/`, `infra/`, dan `tests/`; `pnpm check` harus gagal jika ditemukan.
- API Go adalah satu-satunya aplikasi dengan akses PostgreSQL dan pemilik aturan bisnis/otorisasi. Kontrak REST `/api/v1` adalah sumber bersama; validasi request dan response, generate klien TypeScript/Kotlin, dan sertakan test kontrak pada perubahan API.
- Gunakan migrasi SQL berversi, UUID acak sebagai primary key semua tabel, foreign key, indeks, dan constraint. Simpan uang dalam bigint rupiah, tanggal sewa sebagai DATE, dan waktu kejadian sebagai timestamptz. Kategori yang digunakan produk harus dilindungi foreign key.
- Semua keputusan bisnis memakai antarmuka `Clock` Go dan zona Asia/Jakarta, termasuk tanggal hari ini dan hold. Test kedaluwarsa memakai clock terkendali. Pagination memakai `page` dan `page_size` (default 20, maksimal 50) dengan urutan deterministik dan `id` sebagai tie-breaker.
- PostgreSQL dan media lokal menggunakan volume persisten. Runtime demo tidak berkomunikasi dengan layanan pihak ketiga; pembayaran dan refund adalah simulasi lokal. Hosting publik, publikasi store, dan fitur yang ditunda tercantum pada aturan bisnis.

## Keamanan, sesi, dan media

- Password memakai argon2id. Role `user` dan `admin` eksklusif: admin hanya memakai panel admin, tidak menyewa atau memiliki toko, dan login admin di marketplace ditolak.
- Sesi disimpan di database: token acak 256-bit, hanya hash SHA-256 disimpan, masa berlaku default 14 hari dan dapat dikonfigurasi. Logout, suspend pengguna, dan ganti password mencabut sesi.
- Browser menggunakan cookie HttpOnly, SameSite=Lax, dan Secure di luar lokal; metode non-GET memerlukan CSRF per sesi melalui `X-CSRF-Token` serta pemeriksaan Origin. Android menggunakan bearer token yang dilindungi Keystore tanpa CSRF.
- Browser memakai satu origin; Next.js/Vite dan reverse proxy Compose meneruskan `/api` ke Go, admin dilayani di `/admin/`, dan Next.js meneruskan cookie saat SSR. Jangan menambahkan CORS longgar. HTTP lokal Android hanya untuk debug; emulator menggunakan `10.0.2.2`, perangkat fisik IP LAN atau `adb reverse`.
- Batasi percobaan login dalam proses dan jangan mencatat password atau token. Admin awal dibuat melalui environment seed lokal; seed menolak `APP_ENV=production`.
- Upload JPEG, PNG, atau WebP diverifikasi dari isi, maksimal 5 MB, diberi nama acak, disimpan di `MEDIA_DIR`, dan disajikan melalui API.

## Konvensi dan verifikasi

- Kode, identifier, komentar, dan pesan commit berbahasa Inggris; UI dan panduan pengguna berbahasa Indonesia. Error API memakai `code` snake_case Inggris dan `message` Indonesia.
- Gunakan Conventional Commits, branch yang dibuat pengguna, dan commit per task; jangan push, force-push, atau menulis ulang riwayat tanpa diminta.
- `pnpm check` menjalankan guard merek, pemeriksaan kontrak, TypeScript, lint, format, unit test, dan build Android. Test integrasi memakai PostgreSQL nyata dan environment terisolasi; browser dan perangkat memakai stack test terpisah. Gunakan perintah serta prasyarat di [panduan test](docs/engineering/testing.md).
- Jangan menurunkan cakupan test atau menyatakan suite yang dilewati sebagai lulus. Verifikasi migrasi kosong, seed berulang, health/readiness, persistensi, pemulihan database/media, otorisasi, transaksi, stok, dan alur web/Android sesuai perubahan.
- JDK, Android SDK, emulator/perangkat, dan Docker harus diverifikasi sebelum build atau test yang memerlukannya. Laporkan keterbatasan lingkungan secara akurat.
- Riwayat implementasi dan progres MVP disimpan di `docs/archive/`; ikuti urutan phase jika pengguna secara eksplisit memulai phase baru. Dokumentasi menurut pembaca tersedia di [docs/README.md](docs/README.md).
