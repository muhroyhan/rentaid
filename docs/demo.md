# Demo web lokal Rentaid

Untuk membangun dan memasang APK penyewa, ikuti juga [panduan demo Android](android-demo.md).

Paket ini menjalankan marketplace Next.js, admin statis di `/admin/`, API Go, PostgreSQL, dan volume media melalui satu origin. Pembayaran dan refund adalah simulasi lokal. Build pertama mengunduh image dan dependensi; aplikasi yang sudah dibangun berjalan tanpa layanan pihak ketiga.

## Persiapan

Pasang Docker dengan Compose, Node.js 24.22.1, dan pnpm 12.14.0. Jalankan `pnpm install --frozen-lockfile`. Go pada host tidak diperlukan untuk demo Compose. Chrome atau Chromium lokal hanya diperlukan untuk pengujian browser otomatis.

File `.env.example` adalah referensi dan tidak dimuat otomatis. Contoh PowerShell berikut memakai project terpisah dari database pengembangan default:

```powershell
$env:RENTAID_COMPOSE_PROJECT = "rentaid-demo"
$env:RENTAID_DB_PORT = "5433"
$env:RENTAID_HTTP_PORT = "8081"
$env:SEED_ADMIN_EMAIL = "admin@example.test"
foreach ($taskVariable in @("SEED_ADMIN_PASSWORD", "SEED_DEMO_PASSWORD")) {
  $taskSecret = Read-Host "$taskVariable (minimal 12 karakter)" -AsSecureString
  $taskPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskSecret)
  try { Set-Item -Path "Env:$taskVariable" -Value ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPtr)) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPtr) }
}
pnpm demo:up
Remove-Item Env:SEED_ADMIN_PASSWORD, Env:SEED_DEMO_PASSWORD
```

Default tanpa pengaturan adalah project `rentaid`, PostgreSQL port 5432, dan web port 8081. Pilih port yang belum dipakai; URL internal antarcontainer tetap sama. Pertahankan nama project dan port pada terminal saat menjalankan perintah berikutnya.

`demo:up` membangun image, menerapkan migrasi, menunggu seluruh health check, dan menjalankan seed. Buka marketplace di `http://127.0.0.1:8081/` dan admin di `http://127.0.0.1:8081/admin/`. Pemeriksaan kesiapan tersedia di `/api/v1/ready`; `/api/v1/health` memeriksa proses API. Gateway memeriksa API, marketplace, dan halaman admin.

Seed membuat admin dari environment serta akun `demo.pending@example.test`, `demo.approved@example.test`, `demo.rejected@example.test`, dan `demo.suspended@example.test` dengan password `SEED_DEMO_PASSWORD`. Toko demo yang disetujui mempunyai kategori dan produk contoh. Untuk mengulang seed, tetapkan lagi tiga variabel seed lalu jalankan `pnpm demo:seed`. Seed tidak mengubah password, produk, atau keputusan toko yang sudah ada.

## Alur demo manual

1. Daftarkan akun vendor baru di marketplace, isi nomor telepon, lalu ajukan toko dengan nama, alamat, dan nomor telepon.
2. Masuk ke admin dan setujui pengajuan toko tersebut.
3. Masuk kembali sebagai vendor, buka dashboard, tambahkan produk beserta foto, harga harian, kategori, dan stok, lalu terbitkan.
4. Gunakan browser atau profil terpisah untuk mendaftarkan penyewa. Cari produk, pilih tanggal mulai hari ini dan tanggal selesai, lalu lanjutkan checkout.
5. Pilih **Simulasikan berhasil** pada pesanan. Sebagai vendor, pilih **Konfirmasi serah terima**, kemudian **Konfirmasi pengembalian**.
6. Periksa status selesai, waktu pengembalian, snapshot harga, pembayaran, dan riwayat pada penyewa, vendor, serta admin.
7. Buat pesanan lain untuk mencoba pembayaran gagal, pembatalan sebelum bayar, dan pembatalan setelah pembayaran sukses dengan refund penuh. Stok pesanan yang dikembalikan lebih awal tetap dipakai sampai tanggal akhir sewa.

Gunakan `pnpm demo:down` untuk menghentikan layanan. Database dan media tetap tersimpan. Jalankan kembali `pnpm demo:up` dengan kredensial seed untuk melanjutkan. Jangan mengganti nama project jika ingin memakai data yang sama.

Untuk melihat status atau log:

```powershell
docker compose -f infra/compose.yaml -p $env:RENTAID_COMPOSE_PROJECT --profile app ps
docker compose -f infra/compose.yaml -p $env:RENTAID_COMPOSE_PROJECT --profile app logs --tail 100 api gateway
```

## Backup database dan media

Saat layanan aktif, jalankan:

```powershell
pnpm demo:backup .artifacts/backups/demo-01
```

Direktori tujuan harus baru. Perintah menghentikan API sementara agar tidak ada perubahan database atau unggahan di tengah backup, membuat `database.dump` dan `media.tar.gz`, menulis checksum SHA-256 di `manifest.json`, lalu menghidupkan API kembali. Aplikasi tidak dapat menerima perubahan selama jendela ini. Paket backup menyimpan data akun dan sesi; simpan secara privat dan cadangkan seluruh direktori bersama.

## Restore ke project kosong

Gunakan project baru dengan port lain. Kredensial akun mengikuti data pada backup; restore tidak menjalankan seed atau mengganti password.

```powershell
$env:RENTAID_COMPOSE_PROJECT = "rentaid-demo-restored"
$env:RENTAID_DB_PORT = "5434"
$env:RENTAID_HTTP_PORT = "8082"
pnpm demo:restore .artifacts/backups/demo-01
```

Perintah memeriksa checksum, membangun image, menjalankan PostgreSQL, menolak database atau media yang sudah berisi data, memulihkan keduanya, lalu menjalankan aplikasi dan health check. Buka `http://127.0.0.1:8082/`. Restore juga ditolak jika API, web, atau gateway target masih berjalan. Jika restore terhenti setelah sebagian data dipulihkan, gunakan project kosong baru dan paket backup yang sama; perintah tidak menghapus data target secara otomatis.

Untuk kembali mengelola sumber backup, kembalikan tiga variabel project/port ke nilai sumber. `demo:down` selalu mengacu pada project yang sedang dipilih.

## Pengujian otomatis dari nol

```powershell
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
pnpm test:demo
```

Pengujian membuat dua project Compose unik dengan port bebas dan password acak. Ia memeriksa database kosong, seed berulang, registrasi vendor, persetujuan toko, produk/foto, checkout, pembayaran berhasil/gagal, pembatalan/refund, serah terima, pengembalian, restart, serta restore database dan media ke project kedua. Bukti verifikasi ditulis ke `.artifacts/demo-last-result.json`; paket backup test berada di `.artifacts/demo-tests/`.

Container dan volume kedua project test dibersihkan setelah pengujian. Project demo atau database pengembangan yang sudah ada tidak dipakai. Jika proses dihentikan paksa, nama project test yang tercetak di output dapat dipakai untuk memeriksa sisa container dan volume sebelum membersihkannya.
