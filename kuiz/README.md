# Kuiz Hafsah

Kuiz langsung gaya Kahoot untuk Kelas Mengaji Hafsah. Murid pilih dan reka karakter 3D gaya anime (termasuk tudung, kopiah, songkok, serban), main serentak dari telefon masing-masing, dan papan markah dikemas kini secara langsung.

## Pautan

Selepas branch ini di-merge ke `main`, GitHub Pages akan menghidangkan:

- Murid: `https://annurprosolutions-cell.github.io/draftngajihafsah/kuiz/`
- Cikgu (hos): butang **"Saya cikgu: hos permainan"** di halaman yang sama, atau terus `.../kuiz/?hos=1`
- Penonton (papan markah sahaja): `.../kuiz/?tonton=PIN`

## Cara main

**Cikgu**
1. Buka halaman kuiz pada laptop yang disambung ke projektor, tekan "Saya cikgu: hos permainan".
2. Pilih set kuiz, tekan **Hos sekarang**. PIN 6 digit dan kod QR akan dipaparkan.
3. Tunggu murid masuk. Karakter 3D mereka akan "jatuh" ke pentas lobi. Ketik nama murid di senarai kanan untuk keluarkan.
4. Tekan **Mula**. Setiap soalan: tekan "Seterusnya" selepas jawapan didedahkan, kemudian papan markah dipaparkan.
5. Di akhir, podium 3D tunjuk 3 juara. Boleh muat turun keputusan (CSV) atau "Main lagi" dengan pemain sama.

Jangan tutup tab hos semasa permainan. Kalau ter-refresh, buka semula halaman hos dan tekan **Sambung**: PIN dan markah dipulihkan, telefon murid bersambung semula sendiri.

**Murid**
1. Imbas kod QR atau buka pautan, masukkan PIN.
2. Tulis nama panggilan dan reka karakter: warna kulit, mata, rambut, tudung (bawal / sarung / labuh, warna tudung & anak tudung), kopiah, songkok, serban, topi, baju Melayu, baju kurung, jubah, hoodie, T-shirt, cermin mata.
3. Jawab dengan menekan butang warna. Lebih cepat jawab betul, lebih banyak mata.

## Ciri utama

- Aliran sebiji macam Kahoot: PIN, lobi, soalan dengan 4 bentuk/warna, carta taburan jawapan, papan markah, podium.
- Markah: sehingga 1000 mata (separuh ikut kepantasan), soalan **mata berganda**, soalan **latihan** (tiada mata), bonus rentetan betul (+100 hingga +500).
- Karakter 3D chibi anime dibina terus dalam kod (tiada fail model), dengan ekspresi: gembira bila betul, sedih bila salah, menari di podium.
- Papan markah langsung: laci "Papan markah langsung" di skrin hos (tunjuk siapa dah jawab), kedudukan di telefon setiap murid, dan pautan penonton untuk skrin kedua atau ibu bapa.
- Set kuiz terbina dalam: Kenal Huruf Hijaiyah, Tajwid Asas, Rukun Islam & Rukun Iman, Al-Quran & Kisah Nabi.
- Penyunting kuiz: cipta soalan sendiri (2-4 pilihan atau Betul/Salah), masa 5-120 saat, teks Arab besar, gambar.
- Import dari CSV (boleh sedia di Google Sheets, guna "Muat turun templat CSV") atau JSON; eksport JSON untuk dikongsi.
- Masuk lewat, kunci bilik, kocok soalan, auto ke soalan seterusnya, bunyi (boleh dimatikan), skrin penuh.

## Di mana data disimpan

Tiada pangkalan data dan tiada akaun. Semuanya berlaku dalam pelayar:

| Data | Lokasi | Tempoh |
| --- | --- | --- |
| Permainan semasa (pemain, markah, jawapan) | Memori tab hos (laptop cikgu) | Sehingga tab ditutup |
| Salinan permainan untuk sambung semula | `localStorage` pelayar hos (`kh.hostSession`) | Dipadam bila permainan tamat |
| Kuiz ciptaan cikgu | `localStorage` pelayar hos (`kh.quizzes`) | Kekal di peranti itu sahaja. Eksport JSON untuk backup |
| Sejarah keputusan (20 permainan terakhir) | `localStorage` pelayar hos (`kh.history`) | Kekal di peranti itu |
| Nama & karakter murid | `localStorage` telefon murid (`kh.profile`) | Kekal di telefon itu |

Telefon murid bersambung terus ke laptop cikgu melalui **WebRTC (peer-to-peer)** menggunakan pustaka PeerJS. Pelayan awam percuma **PeerJS Cloud** (`0.peerjs.com`) hanya digunakan untuk "memperkenalkan" dua pelayar semasa mula bersambung. Jika rangkaian menghalang sambungan terus, PeerJS akan guna pelayan relay (TURN) percuma mereka. Tiada data markah disimpan di pelayan tersebut.

## Had & tip

- Maksimum 80 pemain sebilik. Sudah diuji dengan 24 pemain serentak.
- Perlu internet (untuk PeerJS). WiFi sekolah yang ketat kadang-kadang menyekat WebRTC: suruh murid guna data telefon jika tak dapat masuk.
- PeerJS Cloud ialah servis percuma tanpa jaminan. Jika ia gagal, bilik tak dapat dibuka. Penyelesaian: jalankan pelayan PeerJS sendiri dan tambah `?peer=host:port` pada pautan hos (pautan QR akan ikut sama).
- Grafik 3D perlukan WebGL2 (kebanyakan telefon 2019 ke atas). Peranti lama tetap boleh main; karakter dipaparkan sebagai ikon huruf.
- Kuiz custom hanya ada di pelayar tempat ia dicipta. Guna **Eksport JSON** untuk pindah ke laptop lain.

## Format CSV

```
Soalan,Pilihan A,Pilihan B,Pilihan C,Pilihan D,Jawapan (A-D),Masa (saat)
"Berapakah bilangan Rukun Islam?",4,5,6,7,B,20
"Solat Subuh ada 2 rakaat.",Betul,Salah,,,A,10
```

## Struktur fail

```
kuiz/
  index.html          semua skrin (murid, hos, penonton)
  css/kuiz.css        gaya
  js/app.js           titik masuk & penghala
  js/host.js          enjin permainan hos (markah, fasa, podium)
  js/player.js        aliran telefon murid
  js/watch.js         papan markah penonton
  js/net.js           sambungan PeerJS (hos & klien, sambung semula automatik)
  js/avatar3d.js      karakter 3D anime (Three.js)
  js/stage3d.js       pentas lobi, podium, potret
  js/avatar-config.js pilihan karakter & pengesahan data
  js/creator.js       panel reka karakter
  js/editor.js        penyunting kuiz
  js/quizzes.js       set kuiz terbina dalam & import CSV
  js/ui.js            pembantu DOM, bunyi, konfeti, QR
  vendor/             Three.js r180, PeerJS 1.5.5, qrcode-generator (semua lesen MIT)
```

## Ujian tempatan

```
python3 -m http.server 8080        # dari folder repo
npx peer --port 9000               # pelayan PeerJS tempatan (pilihan)
# buka http://localhost:8080/kuiz/?hos=1&peer=localhost:9000
```
