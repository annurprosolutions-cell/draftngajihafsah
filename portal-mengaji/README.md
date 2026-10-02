# Portal Kelas Mengaji (versi boleh konfigurasi)

Folder ini mengandungi sistem lengkap:

| Fail | Fungsi |
|---|---|
| `index.html` | Portal web (pelajar, guru, superadmin) |
| `Code.gs` | Backend Google Apps Script (API + Google Sheets + Drive) |
| `appsscript.json` | Manifest Apps Script (zon masa & akses Web App) |

## Apa yang baharu

1. **Boleh dikonfigurasi sepenuhnya oleh Superadmin** (menu *Konfigurasi*):
   - **Logo & Jenama**: muat naik logo (atau guna URL), nama pusat, nama pendek, tagline, teks footer.
   - **Subjek & Aspek Bacaan**: tambah / edit / padam subjek (kelas), sasaran skor, mesej sasaran,
     dan senarai aspek (point bacaan) dengan *bahagian* dan *markah penuh* masing-masing. Ada fungsi
     *Tambah Pukal* (tampal banyak aspek sekali gus).
   - **Gred Markah**: label, peratus minimum dan warna setiap gred (cth: Cemerlang ≥ 90%).
   - **Pengguna**: tambah guru (admin) atau superadmin lain, reset kata laluan.
2. **PDF tidak lagi terpotong.** PDF kini dijana sebagai dokumen A4 sebenar (jsPDF + AutoTable),
   bukan screenshot. Teks panjang dibalut ke baris baru, jadual bersambung ke muka surat seterusnya
   dengan tajuk jadual berulang, dan ada nombor halaman. Muat turun *Gambar* juga diperbaiki.
3. **Keselamatan lebih baik**: kata laluan tidak lagi dibaca dari CSV awam. Log masuk disemak di
   server, kata laluan disimpan sebagai hash, dan pelajar hanya boleh lihat rekod IC sendiri.

## Cara pasang (±10 minit)

1. Buka Google Sheet sedia ada (yang ada tab `TALAQQI AL QURAN` / `KELAS ABAHATA`).
   *Buat salinan dahulu sebagai backup.*
2. **Extensions → Apps Script**. Padam kod lama, tampal isi `Code.gs`.
3. Klik ikon gear (*Project Settings*) → tandakan *Show "appsscript.json"* → tampal isi `appsscript.json`.
4. Pilih fungsi `setupSistem` → **Run** → beri kebenaran (Sheets & Drive).
   Fungsi ini akan:
   - cipta tab `TETAPAN`, `SUBJEK`, `ASPEK`, `PELAJAR`, `PENGGUNA`;
   - **migrasi automatik** data dari tab lama (aspek, markah penuh, pelajar, gambar);
   - cipta akaun `superadmin` dengan kata laluan admin lama (jika dijumpai), atau `hafsah123#`.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Salin URL yang berakhir dengan `/exec`, buka `index.html` dan tampal pada baris:
   ```js
   const API_URL = 'PASTE_URL_WEB_APP_ANDA_DI_SINI';
   ```
7. Upload `index.html` ke hosting anda (GitHub Pages, Netlify, dsb).
8. Log masuk sebagai `superadmin`, **terus tukar kata laluan** di menu *Akaun Saya*.

> Bila kemaskini `Code.gs` pada masa depan: **Deploy → Manage deployments → Edit → Version: New version**
> supaya URL kekal sama.

## Struktur data (Google Sheets)

- `TETAPAN` — kunci/nilai (JSON) untuk jenama, logo, gred.
- `SUBJEK` — senarai subjek/kelas & sasaran.
- `ASPEK` — aspek bacaan setiap subjek: bahagian, nama, markah penuh, susunan.
- `PELAJAR` — satu baris setiap pelajar per subjek; markah disimpan sebagai JSON ikut ID aspek
  (supaya tambah/ubah aspek tidak merosakkan lajur).
- `PENGGUNA` — akaun guru/superadmin (kata laluan di-hash).

Tab lama tidak diusik. Selepas yakin data migrasi betul, boleh sorok atau padam tab lama.
Jika mahu migrasi semula: kosongkan tab `PELAJAR`, kemudian jalankan `migrasiDataLama`.

## Nota

- Logo yang dimuat naik disimpan dalam folder Drive *Portal Mengaji - Gambar* dan dihantar ke
  portal sebagai data URL, jadi ia sentiasa muncul dalam PDF. Logo dari URL luar mungkin tidak
  muncul dalam PDF jika laman tersebut menyekat CORS.
- Fon PDF ialah Helvetica (standard). Nama dalam tulisan Jawi/Arab tidak akan dipaparkan dengan
  betul dalam PDF; tulisan Rumi tiada masalah.
- Sesi log masuk admin tamat selepas 6 jam.
