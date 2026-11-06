# Android

- Susun package per fitur dengan `presentation/` dan `data/`. `AppContainer` menyusun dependency, `navigation/` menyusun route Compose, dan `core/` memuat keamanan serta infrastruktur bersama. Pertahankan import package fitur pada test unit dan instrumentasi.

- Aplikasi Kotlin/Compose mendukung penyewa; aturan bisnis, harga, status, dan otorisasi berasal dari API Go.
- Gunakan ViewModel, repository, Coroutines/Flow, dan klien Kotlin hasil generate. Simpan token dan upaya checkout secara terlindungi; pertahankan idempotensi dan pemulihan lintas proses.
- HTTP hanya untuk build debug. Verifikasi JDK, SDK, dan perangkat sebelum test; jangan menganggap test instrumentasi bertahap yang dilewati sebagai lulus.
