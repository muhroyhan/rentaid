# API Go

- Pisahkan model/error di `model.go`, aturan dan transaksi di service, serta SQL di `postgres.go` per domain. Repository menerima `database.Executor`; teruskan transaksi yang sama dari service untuk operasi yang harus atomik.

- Aturan transaksi, stok per tanggal, idempotensi, sesi, dan otorisasi berada di API; ikuti `docs/business/rules.md` serta kontrak OpenAPI.
- Gunakan `Clock` dan zona Asia/Jakarta untuk keputusan bisnis; simpan uang sebagai bigint, tanggal sebagai DATE, dan waktu peristiwa sebagai timestamptz.
- Test unit memakai build constraint `!integration`; test dengan PostgreSQL memakai `integration`. Perbarui migrasi berversi, foreign key, dan test relevan tanpa mengubah migrasi yang sudah diterapkan.
