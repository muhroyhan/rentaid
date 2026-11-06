# Pengujian

- Gunakan `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e:web`, `pnpm test:e2e:android`, dan `pnpm test:e2e` sesuai cakupan. `--app=api|web|admin|android` tersedia untuk unit/integrasi.
- Unit Go memakai default build; test PostgreSQL Go memakai build tag `integration`. Test integrasi wajib `TEST_DATABASE_URL` terpisah; jangan menganggap skip tanpa database sebagai lulus.
- Android integration dan E2E menjalankan fixture serta alur bertahap dengan stack test terisolasi. Jangan melewatkan skenario yang membutuhkan argumen instrumentasi. Laporkan perangkat, emulator, dan prasyarat yang tersedia.
- Jangan arahkan test yang membuat data ke data pengguna. Pertahankan pembersihan resource test milik runner, pemeriksaan stok konkuren, idempotensi, otorisasi, dan pemulihan.
- Perubahan kontrak memerlukan regenerasi klien serta pemeriksaan kontrak. `pnpm check` mencakup kualitas statis dan unit; integrasi/E2E dijalankan terpisah.
