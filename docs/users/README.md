# Panduan pengguna Rentaid

Rentaid adalah demo lokal untuk menyewa barang. Web menyediakan alur penyewa dan vendor, panel admin menyediakan pengelolaan, dan Android menyediakan alur penyewa. Pembayaran dan refund berupa simulasi dan tidak memindahkan uang.

Untuk menjalankan demo web, ikuti [persiapan demo](../engineering/demo.md#persiapan). Untuk memakai APK, ikuti [panduan Android](android.md). Setelah layanan siap, buka marketplace pada `http://127.0.0.1:8081/` atau admin pada `http://127.0.0.1:8081/admin/`.

## Penyewa

1. Daftarkan akun dan isi nomor telepon di profil sebelum checkout.
2. Cari produk pada katalog, buka detail, lalu pilih tanggal mulai, tanggal selesai, dan jumlah. Harga dihitung per hari secara inklusif.
3. Periksa penawaran dan lanjutkan checkout. Stok ditahan selama 15 menit untuk menunggu pembayaran.
4. Pilih hasil pembayaran simulasi. Pembayaran berhasil mengonfirmasi pesanan; pembayaran gagal atau kedaluwarsa mengakhiri pesanan.
5. Ambil barang dari vendor pada masa sewa. Setelah barang dikembalikan, vendor mengonfirmasi pengembalian dan pesanan menjadi selesai.

Pada **Pesanan saya**, lihat status dan riwayat. Pesanan yang belum diserahkan dapat dibatalkan; pesanan yang sudah dibayar mendapat refund simulasi penuh. Setelah serah terima, tunggu vendor mengonfirmasi pengembalian.

## Vendor

Masuk ke marketplace, ajukan satu toko dengan nama, alamat, dan nomor telepon, lalu tunggu persetujuan admin. Jika ditolak, perbaiki data dan ajukan ulang. Toko yang disetujui dapat membuat dan menerbitkan produk, mengelola foto, harga dan stok, serta mengarsipkan produk.

Melalui dashboard vendor, lihat pesanan toko, konfirmasi serah terima selama tanggal sewa, lalu konfirmasi pengembalian. Toko yang ditangguhkan tidak menerima pesanan baru, tetapi pesanan yang sudah ada tetap dapat diselesaikan sesuai statusnya.

## Admin

Masuk melalui panel admin dengan akun admin seed. Setujui atau tolak toko, kelola pengguna dan kategori, moderasi produk, serta tinjau pesanan dan pembayaran. Alasan diperlukan saat menolak atau menangguhkan toko dan saat memoderasi produk.

Pada CMS, perubahan tersimpan sebagai draft sampai dipublikasikan. Beranda, FAQ, tentang, syarat penggunaan, dan privasi dapat dikelola dari panel. Akun admin hanya untuk panel admin.

## Bantuan

Jika aplikasi tidak terhubung, periksa kesiapan pada `http://127.0.0.1:8081/api/v1/ready` dan pastikan layanan demo aktif. Jika hasil checkout atau pembayaran Android belum diketahui, gunakan **Lanjutkan pesanan** dengan akun dan server yang sama; lihat [pemulihan Android](android.md#akun-katalog-dan-pemulihan).
