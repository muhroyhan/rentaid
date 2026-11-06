# Lapisan aplikasi

Rentaid menggunakan folder per fitur dengan pemisahan tanggung jawab di dalamnya. API Go tetap menjadi modular monolith dan pemilik aturan bisnis. Web, admin, serta Android mengelola presentasi dan alur interaksi melalui kontrak OpenAPI yang sama.

## API Go

```text
apps/api/
├── cmd/rentaid/main.go
└── internal/
    ├── httpapi/              # Route, autentikasi HTTP, dan pemetaan error
    ├── auth/
    ├── category/
    ├── checkout/
    ├── content/
    ├── order/
    ├── payment/
    ├── product/
    ├── quote/
    ├── store/
    │   ├── model.go         # Model dan error domain
    │   ├── service.go       # Validasi, aturan bisnis, dan transaksi
    │   └── postgres.go      # Query dan operasi repository
    ├── clock/
    ├── database/
    │   ├── executor.go      # Operasi bersama pool dan transaksi
    │   └── migrations/
    └── demo/
```

Setiap domain memiliki `model.go`, `service.go`, dan `postgres.go`; domain tertentu juga memiliki file alur seperti `auth/profile.go` dan `order/history.go`. Handler memanggil service, kemudian service memanggil fungsi repository dalam package domain yang sama. Model digunakan bersama oleh lapisan tersebut. Package Go per domain dipertahankan agar pemisahan file tidak menghasilkan siklus import.

SQL dan penyusunan query berada di `postgres.go`. Fungsi repository menerima `database.Executor`, yang dapat berupa pool atau transaksi pgx. Service membuka transaksi, meneruskan transaksi yang sama ke setiap operasi repository, lalu melakukan commit atau rollback. Repository tidak membuka transaksi sendiri. Urutan penguncian toko, produk, dan pesanan mengikuti [aturan bisnis](../business/rules.md).

Lapisan ini menggunakan pgx secara langsung untuk lifecycle transaksi, hasil query, dan penanganan error. Interface repository terpisah per domain tidak diwajibkan; tambahkan ketika ada kebutuhan implementasi alternatif atau pengujian yang memerlukannya. Test PostgreSQL tetap memakai database nyata.

## Marketplace Next.js

```text
apps/web/
├── app/                     # Route, layout, dan komposisi halaman
├── features/
│   ├── account/
│   ├── catalog/
│   │   ├── components/
│   │   ├── application/loadCatalog.ts
│   │   ├── data/catalog.ts
│   │   └── model.ts
│   ├── checkout/
│   ├── orders/
│   └── vendor/
└── lib/
    ├── api.ts               # Klien browser satu origin
    └── authenticatedFetch.ts # Transport server dengan cookie sesi
```

`components/` berisi tampilan React. Hook `application/use*.ts` mengelola state, validasi formulir, tindakan pengguna, navigasi, dan status pemuatan. Modul `data/` mengirim request JSON melalui klien hasil OpenAPI serta upload biner melalui `fetch`. File `*.model.ts` menyimpan tipe dan konstanta presentasi yang dipakai fitur terkait.

Komponen interaktif menggunakan `"use client"`. Hook yang diimpor komponen tersebut mengikuti batas klien React. Pembacaan sesi dan toko pada server menggunakan `authenticatedFetch`; modul tersebut membaca cookie Next.js dan meneruskannya ke API dengan `cache: "no-store"`. Modul server ini tidak boleh diimpor hook atau komponen klien.

Route dapat mengomposisikan pembacaan server yang sederhana. Alur katalog yang mencakup normalisasi parameter, validasi, dan pemuatan halaman berikutnya berada di `application/loadCatalog.ts`. Otorisasi, harga, stok, dan keputusan status selalu ditentukan API Go.

## Admin React

```text
apps/admin/src/
├── app/
│   ├── main.tsx
│   └── App.tsx
├── features/
│   ├── account/
│   ├── categories/
│   │   ├── components/CategoryManagement.tsx
│   │   ├── application/useCategoryManagement.ts
│   │   ├── data/categoryManagementApi.ts
│   │   └── CategoryManagement.model.ts
│   ├── content/
│   ├── orders/
│   ├── payments/
│   ├── products/
│   ├── stores/
│   └── users/
├── lib/api.ts
└── style.css
```

`app/` menyusun aplikasi dan menampilkan fitur sesuai sesi. Komponen fitur merender tampilan dan memanggil hook aplikasi. Hook mengelola state dan memanggil modul API fitur. Modul `data/` menggunakan klien bersama dari `lib/api.ts`. Request mutasi tetap menyertakan CSRF per sesi; hook memproses sesi yang kedaluwarsa melalui callback yang disediakan aplikasi.

`ApiRequestOptions` dari `packages/api-client` menjaga tipe parameter, body, dan header pada fungsi request tetap berasal dari OpenAPI. Tipe ini digunakan web dan admin tanpa mendefinisikan ulang payload kontrak.

## Android Compose

```text
apps/android/
├── app/src/main/java/id/rentaid/app/
│   ├── MainActivity.kt
│   ├── AppContainer.kt
│   ├── navigation/RentaidApp.kt
│   ├── account/
│   ├── catalog/
│   │   ├── presentation/
│   │   │   ├── CatalogScreens.kt
│   │   │   └── CatalogViewModel.kt
│   │   └── data/CatalogRepository.kt
│   ├── checkout/
│   ├── connection/
│   ├── orders/
│   └── core/
│       ├── network/PublicImageLoader.kt
│       ├── presentation/PublicImage.kt
│       └── security/SessionStore.kt
└── generated/src/main/kotlin/ # Klien OpenAPI
```

`MainActivity` membuat `AppContainer`, yang menyusun repository dan penyimpanan aman. `navigation/` menghubungkan route Compose dengan layar dan ViewModel fitur. `presentation/` berisi Compose, state UI, serta ViewModel dengan Coroutines/Flow. `data/` berisi kontrak repository dan implementasi API atau penyimpanan fitur.

MVVM dipertahankan dengan lapisan presentation dan data. Model klien hasil generate boleh digunakan langsung ketika sesuai kebutuhan layar. Lapisan domain dan modul Gradle tambahan dapat dibuat ketika ada kebutuhan alur yang lebih besar. Token tetap disimpan melalui Keystore; upaya checkout dan pembayaran tetap menyimpan kunci idempotensi serta konteks pemulihan.

Test unit dan instrumentasi mengimpor package fitur yang baru. Package test instrumentasi tetap `id.rentaid.app` agar runner dan pemanggilan skenario bertahap tetap sesuai konfigurasi pengujian.

## Pemeriksaan batas lapisan

`node scripts/architecture-check.mjs` dijalankan oleh `pnpm check`. Pemeriksaan menolak request HTTP langsung dari komponen/hook web dan admin, import lapisan yang berlawanan, query database Go di luar file akses data domain, serta dependensi Android dari data ke presentation. Migrasi, seed demo, dan transport HTTP Go memiliki tanggung jawab tersendiri dan diperiksa melalui suite terkait.

Lint, tipe, build, unit, integrasi PostgreSQL, dan E2E memeriksa perilaku setelah refaktor. Ikuti [panduan pengujian](../engineering/testing.md) untuk prasyarat dan stack yang terisolasi.
