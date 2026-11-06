# Gambaran bisnis Rentaid

Rentaid mempertemukan penyewa dengan vendor yang menawarkan barang untuk disewa. Marketplace web melayani penyewa dan vendor, Android melayani penyewa, dan admin mengelola persetujuan serta moderasi. Satu pengguna dapat menyewa dan memiliki satu toko; akun admin terpisah dari akun pengguna.

## Alur nilai

1. Vendor mengajukan toko dan admin menyetujui sebelum produk tersedia di katalog.
2. Penyewa memilih satu produk, kuantitas, dan tanggal; server menghitung harga harian secara inklusif dan memeriksa stok per tanggal.
3. Checkout menahan stok selama 15 menit. Pembayaran simulasi yang berhasil mengonfirmasi pesanan.
4. Vendor menyerahkan barang pada masa sewa dan mengonfirmasi pengembalian. Semua pihak yang berwenang melihat status dan riwayat yang sesuai.
5. Pembatalan sebelum serah terima melepaskan stok; bila pembayaran berhasil, refund simulasi penuh dicatat.

## Batas MVP

Data akun, stok, pesanan, dan transaksi tersimpan di PostgreSQL. Pembayaran dan refund hanya simulasi lokal; tidak ada perpindahan uang atau kebutuhan akun layanan eksternal. Hosting publik, publikasi Play Store, dan fitur seperti deposit, dompet, chat, ulasan, kurir, dan iOS berada di luar MVP.

[Aturan bisnis kanonik](rules.md) memuat validasi tanggal/harga, persediaan, status dan aktor, refund, serta idempotensi. Perubahan aturan memerlukan pembaruan aturan tersebut, kontrak API, dan test bersama implementasinya.
