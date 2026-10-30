# Rentaid — fondasi Phase 01

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
