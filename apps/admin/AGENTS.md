# Admin

- Susun fitur dalam `src/features/`: komponen memanggil hook `application/`, dan hook memakai fungsi request `data/`. Klien bersama berada di `src/lib/api.ts`; komposisi aplikasi berada di `src/app/`.

- Panel React/Vite berada pada `/admin/` dan memakai API Go melalui satu origin; jangan melakukan akses database atau menduplikasi aturan bisnis di UI.
- Tampilkan pesan dalam Bahasa Indonesia dan patuhi kontrak, hak akses admin, serta token CSRF untuk tindakan browser.
