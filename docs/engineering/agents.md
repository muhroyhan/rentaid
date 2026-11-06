# Instruksi Codex untuk Rentaid

`AGENTS.md` di root berisi aturan bersama dan mengarahkan Codex membaca modul sesuai tugas di `.codex/instructions/`. Modul audit berisi cara memeriksa dan melaporkan temuan; modul testing dan dokumentasi berisi aturan khusus pekerjaan tersebut. File Markdown modul dibaca ketika diarahkan oleh instruksi root atau permintaan pengguna.

Masing-masing aplikasi memiliki `AGENTS.md` di direktorinya. Codex menggabungkan instruksi dari root menuju direktori kerja; instruksi yang lebih dekat diterapkan lebih akhir. `apps/web/AGENTS.md` juga memuat blok yang dikelola Next.js dan harus dipertahankan.

Codex memilih maksimal satu berkas instruksi per direktori: `AGENTS.override.md` didahulukan jika ada, lalu `AGENTS.md`. Jangan membuat override root yang hanya berisi sebagian aturan karena override tersebut akan terpilih menggantikan instruksi root. Nama file lain tidak ditemukan otomatis kecuali dikonfigurasi sebagai fallback. Lihat [dokumentasi resmi AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Memeriksa instruksi aktif

Dengan Codex CLI yang mendukung `debug prompt-input`, jalankan dari root dan direktori aplikasi untuk melihat instruksi yang masuk ke prompt:

```powershell
codex debug prompt-input "Periksa instruksi aktif."
Push-Location apps/web
try { codex debug prompt-input "Periksa instruksi aktif." }
finally { Pop-Location }
```

Hasil root harus memuat `Panduan agen Rentaid`; hasil web juga harus memuat `Marketplace web` dan blok Next.js. Ulangi dari `apps/api`, `apps/admin`, dan `apps/android` untuk memeriksa instruksi masing-masing. Mulai sesi Codex baru setelah perubahan instruksi. Bila CLI tidak menyediakan perintah debug tersebut, lihat langkah verifikasi pada dokumentasi resmi.

Struktur ini menggunakan instruksi modular untuk sesi biasa. Jika kelak diperlukan custom subagent, dokumentasi resmi menjelaskan [konfigurasi agen TOML](https://learn.chatgpt.com/docs/agent-configuration/subagents); file `.md` dalam `.codex/agents/` tidak otomatis menjadi custom agent.
