# Aturan bisnis Rentaid

Dokumen ini adalah sumber kanonik aturan bisnis MVP. Jika aturan berubah, perbarui dokumen ini, OpenAPI, dan test dalam perubahan yang sama.

## Cakupan MVP

- Akun lokal email/password untuk pendaftaran, login, profil, dan logout. Profil memuat nama dan nomor telepon; telepon wajib diisi sebelum checkout. Satu akun dapat menjadi penyewa dan memiliki satu toko.
- Status pengguna: `active` atau `suspended`. Suspend mencabut semua sesi dan menolak login.
- Vendor mendaftarkan toko di web dengan nama, alamat, dan nomor telepon yang wajib diisi; admin menyetujuinya sebelum toko beroperasi. Status toko: `pending`, `approved`, `rejected`, `suspended`. Toko yang ditolak dapat diedit dan diajukan ulang (kembali `pending`). Admin dapat men-suspend dan mengaktifkan kembali toko, dan mencatat alasan penolakan atau suspend. Toko `suspended` tidak tampil di katalog dan tidak menerima pesanan baru, tetapi pesanan yang sudah ada tetap dapat diserahkan, dikembalikan, atau dibatalkan.
- Produk mewajibkan nama, deskripsi, kategori, harga harian, dan stok; foto opsional. Publikasi vendor langsung tampil jika toko disetujui dan produk tidak disembunyikan. Admin dapat menyembunyikan dan mengaktifkan kembali produk dengan alasan yang tercatat. Vendor mengelola produk, foto, kategori, harga harian, jumlah stok, dan publikasi. Vendor tidak dapat menurunkan stok di bawah pemakaian puncak oleh pesanan aktif (lihat aturan stok) pada hari ini dan tanggal mendatang. Produk yang pernah dipesan tidak dihapus permanen; ia diarsipkan atau di-unpublish, dan pesanan berjalan tidak terpengaruh karena snapshot.
- Kategori satu level. Kategori tidak dapat dihapus selama dipakai produk (409); namanya boleh diubah. Saat tabel produk dibuat, `category_id` wajib memiliki foreign key ke `categories(id)` dengan `ON DELETE RESTRICT` atau `NO ACTION`.
- Admin mengelola pengguna, persetujuan toko, moderasi produk, kategori, pesanan, serta konten beranda, FAQ, tentang, syarat penggunaan, dan kebijakan privasi.
- Web mendukung penyewa dan vendor. Android mendukung penyewa: autentikasi, katalog, detail produk, pilihan tanggal dan kuantitas, checkout, pembayaran simulasi, serta riwayat dan detail pesanan.
- Gunakan desain baru yang konsisten, wordmark Rentaid, Bahasa Indonesia, rupiah, dan zona waktu Asia/Jakarta.
- Pembayaran dan refund menggunakan simulasi lokal. Tidak ada komunikasi runtime ke layanan pihak ketiga; akun, stok, pesanan, dan riwayat transaksi tetap nyata dan disimpan dalam PostgreSQL. Jelaskan status simulasi pada UI pembayaran.
- Tunda deposit, komisi, dompet, pencairan vendor, tarif per jam atau bertingkat, reschedule, promo, wishlist, chat, review, komplain, kurir, peta, KYC/OCR, OAuth, OTP, email eksternal, push notification, iOS, denda keterlambatan, dan publikasi store. Jangan menambahkan fitur tersebut tanpa arahan pengguna.

## Aturan sewa dan transaksi

### Pesanan, harga, dan validasi

- Satu pesanan terdiri dari satu produk dan kuantitas tertentu. Tidak ada checkout keranjang banyak produk atau toko pada MVP. Penyewa tidak boleh menyewa produk dari tokonya sendiri (ditolak server).
- Sewa dihitung per hari secara inklusif: 4–5 November adalah dua hari, dan stok dipakai pada tanggal terakhir. Total adalah harga harian × jumlah hari inklusif × kuantitas. Hitung di Go dan simpan snapshot produk serta harga pada pesanan.
- Validasi penawaran dan checkout: `start_date` tidak lebih awal dari hari ini (Asia/Jakarta), `end_date` tidak lebih awal dari `start_date`, durasi maksimal 30 hari inklusif, dan kuantitas 1 sampai stok produk. Batas-batas ini adalah konstanta di satu tempat.
- Setiap pesanan memiliki `order_code` unik yang mudah dibaca (contoh `RNT-7K3Q9XZA`). Vendor melihat nama dan telepon penyewa hanya untuk pesanan tokonya; admin melihat semua.
- Saat checkout, klien mengirim `expected_total` beserta parameter penawaran. Jika harga atau ketersediaan berubah, server menjawab 409 `quote_changed` dengan penawaran baru dan tidak membuat pesanan.

### Ketersediaan dan hold stok

- Ketersediaan dihitung per produk per tanggal. Dalam satu transaksi, kunci baris produk (`SELECT ... FOR UPDATE`), hitung pemakaian per tanggal (pesanan `confirmed`, `renting`, `completed` sepanjang tanggal sewanya, dan `pending_payment` dengan hold yang belum kedaluwarsa menurut `Clock`), lalu pastikan pemakaian ditambah kuantitas baru tidak melebihi stok pada setiap tanggal rentang. Perubahan stok produk mengunci baris yang sama. Jangan menjumlahkan secara naif semua pesanan yang beririsan dengan rentang jika pemakaiannya terjadi pada tanggal berbeda.
- Tahan stok selama 15 menit saat menunggu pembayaran. Abaikan hold yang sudah kedaluwarsa saat menghitung ketersediaan; jalankan pekerjaan berkala dalam proses Go untuk merapikan statusnya. Satu instance API adalah asumsi MVP.

### Status pesanan

| Dari              | Aksi         | Aktor                              | Ke                | Efek                                                    |
| ----------------- | ------------ | ---------------------------------- | ----------------- | ------------------------------------------------------- |
| (baru)            | checkout     | penyewa                            | `pending_payment` | hold stok 15 menit                                      |
| `pending_payment` | bayar sukses | pemilik pesanan (simulator)        | `confirmed`       | pembayaran `succeeded`                                  |
| `pending_payment` | bayar gagal  | pemilik pesanan (simulator)        | `payment_failed`  | stok dilepas                                            |
| `pending_payment` | kedaluwarsa  | sistem (hold habis) atau simulator | `expired`         | stok dilepas                                            |
| `pending_payment` | batal        | penyewa, vendor toko, admin        | `cancelled`       | stok dilepas, tanpa refund                              |
| `confirmed`       | batal        | penyewa, vendor toko, admin        | `cancelled`       | refund mock penuh                                       |
| `confirmed`       | serah terima | vendor toko                        | `renting`         | hanya antara `start_date` dan `end_date` (Asia/Jakarta) |
| `renting`         | pengembalian | vendor toko                        | `completed`       | waktu pengembalian tercatat                             |

- Status akhir: `completed`, `cancelled`, `expired`, `payment_failed`. Pembayaran gagal bersifat final; penyewa membuat pesanan baru. Pembayaran setelah hold berakhir ditolak.
- Tidak ada pembatalan setelah serah terima; pesanan diselesaikan melalui pengembalian.
- Pesanan `confirmed` yang melewati `end_date` tanpa serah terima tetap `confirmed`; admin dapat membatalkannya (refund penuh). Tidak ada otomatisasi.
- Pengembalian terlambat tidak dikenai denda dan pesanan tetap `renting` sampai vendor mengonfirmasi. Pengembalian lebih awal diperbolehkan dan tidak membebaskan stok.
- Perubahan status memakai compare-and-set (`UPDATE ... WHERE status = $expected`) dalam transaksi yang mengunci baris pesanan. Permintaan yang kalah balapan menerima 409 beserta status saat ini, kecuali pengulangan identik (lihat idempotensi).
- Catat riwayat status (dari, ke, aktor, waktu), pembayaran, dan refund.

### Pembayaran simulasi dan refund

- Endpoint simulator dipisah dari endpoint pesanan dan hanya dapat dipanggil pemilik pesanan. Simulator aktif jika `PAYMENT_SIMULATOR_ENABLED=true` (nilai `true` pada environment contoh lokal). Simulator mendukung berhasil, gagal, dan kedaluwarsa; hasil "kedaluwarsa" sama dengan hold yang habis.
- Refund mock selalu penuh dan hanya untuk pembayaran yang sukses; satu pembayaran memiliki paling banyak satu refund.

### Idempotensi

- Header `Idempotency-Key` wajib untuk checkout dan simulasi pembayaran. Cakupan kunci adalah (pengguna, endpoint, key), disimpan 24 jam bersama hasilnya. Pengulangan dengan payload sama mengembalikan respons yang sama; payload berbeda menghasilkan 409 `idempotency_key_reuse`.
- Transisi lain (batal, serah terima, pengembalian, refund) idempoten secara alami: pengulangan setelah berhasil mengembalikan keadaan sekarang tanpa menambah riwayat atau mengubah status akhir; transisi yang tidak sah menghasilkan 409.
