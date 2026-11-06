<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Marketplace web

- Pertahankan route Next.js di `app/`; susun fitur di `features/` dengan `components/`, `application/`, dan `data/`. Komponen/hook tidak mengirim request HTTP langsung. Pembacaan cookie server hanya melalui transport `lib/authenticatedFetch.ts` dan modul data server yang memakainya.

- Next.js melayani penyewa dan vendor serta meneruskan `/api` melalui origin yang sama. Teruskan cookie sesi pada SSR dan gunakan API Go sebagai sumber aturan bisnis.
- Tampilkan UI dan pesan dalam Bahasa Indonesia; perbarui kontrak/klien bersama perubahan API dan uji alur relevan.
