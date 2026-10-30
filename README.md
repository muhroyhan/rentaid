# Rentaid — fondasi Phase 01

Workspace ini berisi fondasi API Go, kontrak OpenAPI, klien TypeScript, dan PostgreSQL lokal. Ruang lingkup dan urutan implementasi ada di [AGENTS.md](AGENTS.md) dan [rencana pengembangan](docs/plan.md).

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
$env:DATABASE_URL = "postgres://rentaid:rentaid_local@localhost:55432/rentaid?sslmode=disable"
pnpm db:migrate
pnpm db:seed
pnpm api:dev
```

Gunakan terminal lain untuk memeriksa `http://127.0.0.1:8080/api/v1/health` dan `http://127.0.0.1:8080/api/v1/ready`. Liveness menguji proses; readiness memeriksa koneksi PostgreSQL. Hentikan API dengan Ctrl+C. `pnpm db:down` menghentikan layanan Compose tanpa menghapus volume.

Nilai contoh tersedia dalam `.env.example`; file itu tidak dimuat otomatis. Jika port 55432 sudah digunakan, sesuaikan port Compose dan `DATABASE_URL` sebelum memulai.

## Pemeriksaan dan build

```powershell
pnpm contracts:generate
pnpm contracts:check
pnpm check
pnpm test
pnpm api:build
```

`pnpm check` memeriksa nama lama pada folder baru, sinkronisasi kontrak dan klien, tipe TypeScript, ESLint, Prettier, gofmt, go vet, golangci-lint, dan test Go. Pemeriksaan golangci-lint berjalan melalui image Docker berversi tetap; pertama kali dijalankan, Docker mengunduh image tersebut. Build API disimpan di `.artifacts/`.

Untuk menjalankan test integrasi database, buat database khusus test menggunakan `docker compose -f infra/compose.yaml exec postgres psql -U rentaid -d postgres -c "CREATE DATABASE rentaid_test"`, tetapkan `$env:TEST_DATABASE_URL` ke URL PostgreSQL database tersebut pada port 55432, lalu jalankan `pnpm test`. Test integrasi dilewati jika variabel itu tidak tersedia. Seed saat ini hanya membuat setting demo dan menolak `APP_ENV=production`; akun admin dibuat pada Phase 02.

Aplikasi web, admin, dan Android serta perintah build masing-masing belum tersedia pada phase ini.
