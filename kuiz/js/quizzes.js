// Set kuiz terbina dalam. Format soalan:
// { text, ar?: 'huruf Arab untuk dipaparkan besar', choices: [2..4], correct: indeks, time: saat, points: 1 | 2 | 0 }
// points: 1 = biasa, 2 = mata berganda, 0 = tiada mata (soalan latihan)

const q = (text, choices, correct, time = 20, extra = {}) => ({ text, choices, correct, time, points: 1, ...extra });
const tf = (text, isTrue, time = 15) => ({ text, choices: ['Betul', 'Salah'], correct: isTrue ? 0 : 1, time, points: 1 });

export const BUILTIN_QUIZZES = [
  {
    id: 'bi-hijaiyah',
    builtin: true,
    title: 'Kenal Huruf Hijaiyah',
    desc: 'Teka nama huruf dan bentuknya. Sesuai untuk pelajar Iqra.',
    questions: [
      q('Huruf apakah ini?', ['Ba', 'Ta', 'Tsa', 'Nun'], 0, 15, { ar: 'ب' }),
      q('Huruf apakah ini?', ['Ha', 'Jim', 'Kho', 'Dal'], 1, 15, { ar: 'ج' }),
      q('Huruf apakah ini?', ['Sin', 'Syin', 'Sod', 'Dhod'], 2, 15, { ar: 'ص' }),
      q('Huruf apakah ini?', ['Ghain', "'Ain", 'Ha', 'Hamzah'], 1, 15, { ar: 'ع' }),
      q('Huruf apakah ini?', ['Fa', 'Kaf', 'Wau', 'Qof'], 3, 15, { ar: 'ق' }),
      q('Yang manakah huruf Kho?', ['ح', 'ج', 'خ', 'ع'], 2, 15),
      q('Yang manakah huruf Syin?', ['س', 'ش', 'ص', 'ث'], 1, 15),
      q('Yang manakah huruf Zho?', ['ط', 'ض', 'ز', 'ظ'], 3, 15),
      q('Huruf ini ada berapa titik?', ['1', '2', '3', 'Tiada'], 2, 15, { ar: 'ث' }),
      q('Huruf manakah yang TIDAK bertitik?', ['خ', 'ح', 'ج', 'ب'], 1, 20),
      q('Huruf pertama dalam huruf hijaiyah ialah...', ['Ba', 'Alif', 'Hamzah', 'Ya'], 1, 15),
      q('Huruf terakhir dalam huruf hijaiyah ialah...', ['Wau', 'Ha', 'Hamzah', 'Ya'], 3, 15),
    ],
  },
  {
    id: 'bi-tajwid',
    builtin: true,
    title: 'Tajwid Asas',
    desc: 'Hukum nun mati, mim mati, qalqalah, mad dan alif lam.',
    questions: [
      q('Nun mati atau tanwin bertemu huruf ب. Apakah hukumnya?', ['Idzhar Halqi', 'Iklab', "Ikhfa' Haqiqi", 'Idgham'], 1, 20),
      q('Nun mati atau tanwin bertemu huruf halqi (ء ه ع ح غ خ). Apakah hukumnya?', ['Idzhar Halqi', 'Iklab', "Ikhfa' Haqiqi", 'Idgham Bilaghunnah'], 0, 20),
      q('Huruf Idzhar Halqi ada berapa?', ['4', '6', '15', '2'], 1, 15),
      q("Ikhfa' Haqiqi berlaku apabila nun mati atau tanwin bertemu salah satu daripada berapa huruf?", ['6', '4', '15', '2'], 2, 20),
      q('Yang manakah huruf Idgham Maal Ghunnah (berdengung)?', ['ي ن م و', 'ل ر', 'ق ط ب ج د', 'ء ه ع ح غ خ'], 0, 20),
      q('Yang manakah huruf Idgham Bilaghunnah (tanpa dengung)?', ['ي ن م و', 'ل ر', 'ب م', 'ق ط ب ج د'], 1, 20),
      q('Yang manakah huruf Qalqalah?', ['ي ر م ل و ن', 'ء ه ع ح غ خ', 'ق ط ب ج د', 'ت ث ج د ذ'], 2, 20),
      q('Qalqalah Kubra berlaku apabila huruf qalqalah...', ['Berbaris atas', 'Dimatikan kerana waqaf (berhenti) di hujung', 'Bertemu nun mati', 'Berada di awal ayat'], 1, 25),
      q('Mim mati bertemu huruf ب. Apakah hukumnya?', ["Ikhfa' Syafawi", 'Idgham Syafawi', 'Idzhar Syafawi', 'Iklab'], 0, 20),
      q('Mim mati bertemu huruf م. Apakah hukumnya?', ['Idzhar Syafawi', "Ikhfa' Syafawi", 'Idgham Syafawi (Mithlain)', 'Idzhar Halqi'], 2, 20),
      q('Mim mati bertemu huruf selain ب dan م. Apakah hukumnya?', ['Idzhar Syafawi', "Ikhfa' Syafawi", 'Idgham Syafawi', 'Qalqalah'], 0, 20),
      q('Mad Asli (Mad Tabii) dibaca berapa harakat?', ['1 harakat', '2 harakat', '4 harakat', '6 harakat'], 1, 15),
      q('Lam pada kalimah ini dibaca jelas. Ini hukum...', ['Alif Lam Syamsiah', 'Alif Lam Qamariah', 'Lam Jalalah', 'Idgham'], 1, 20, { ar: 'الْقَمَر' }),
      q('Lam pada kalimah ini tidak dibaca. Ini hukum...', ['Alif Lam Syamsiah', 'Alif Lam Qamariah', 'Iklab', "Ikhfa'"], 0, 20, { ar: 'الشَّمْس' }),
    ],
  },
  {
    id: 'bi-rukun',
    builtin: true,
    title: 'Rukun Islam & Rukun Iman',
    desc: 'Asas akidah dan ibadah untuk semua peringkat.',
    questions: [
      q('Berapakah bilangan Rukun Islam?', ['4', '5', '6', '7'], 1, 15),
      q('Berapakah bilangan Rukun Iman?', ['5', '6', '7', '4'], 1, 15),
      q('Rukun Islam yang pertama ialah...', ['Mendirikan solat', 'Mengucap dua kalimah syahadah', 'Berpuasa', 'Mengeluarkan zakat'], 1, 20),
      q('Rukun Islam yang kelima ialah...', ['Mengeluarkan zakat', 'Berpuasa di bulan Ramadan', 'Menunaikan haji bagi yang mampu', 'Mendirikan solat'], 2, 20),
      q('Beriman kepada malaikat ialah Rukun Iman yang ke berapa?', ['Pertama', 'Kedua', 'Ketiga', 'Keempat'], 1, 20),
      q('Rukun Iman yang keenam ialah beriman kepada...', ['Hari Akhirat', 'Kitab-kitab', "Qada' dan Qadar", 'Rasul-rasul'], 2, 20),
      q('Solat fardu sehari semalam ada berapa waktu?', ['3', '4', '5', '6'], 2, 15),
      q('Solat Subuh ada berapa rakaat?', ['2', '3', '4', '1'], 0, 15),
      q('Solat Maghrib ada berapa rakaat?', ['2', '3', '4', '5'], 1, 15),
      q('Puasa wajib dilakukan pada bulan...', ['Syawal', 'Rejab', 'Ramadan', 'Muharram'], 2, 15),
      q('Malaikat yang menyampaikan wahyu kepada para rasul ialah...', ['Mikail', 'Jibril', 'Israfil', 'Izrail'], 1, 20),
      q('Malaikat yang akan meniup sangkakala ialah...', ['Israfil', 'Jibril', 'Malik', 'Ridwan'], 0, 20),
    ],
  },
  {
    id: 'bi-quran',
    builtin: true,
    title: 'Al-Quran & Kisah Nabi',
    desc: 'Fakta surah, wahyu dan kisah para nabi.',
    questions: [
      q('Surah pertama dalam Al-Quran ialah...', ['Al-Baqarah', 'Al-Fatihah', 'An-Nas', 'Al-Ikhlas'], 1, 15),
      q('Berapakah bilangan surah dalam Al-Quran?', ['30', '113', '114', '120'], 2, 15),
      q('Al-Quran mempunyai berapa juzuk?', ['30', '40', '60', '114'], 0, 15),
      q('Surah yang paling panjang dalam Al-Quran ialah...', ["Ali 'Imran", 'Yasin', "An-Nisa'", 'Al-Baqarah'], 3, 20),
      q('Surah yang paling pendek dalam Al-Quran ialah...', ['Al-Ikhlas', 'Al-Kauthar', 'An-Nas', "Al-'Asr"], 1, 20),
      q('Surah Al-Ikhlas mempunyai berapa ayat?', ['3', '4', '5', '6'], 1, 15),
      q('Surah Al-Fatihah mempunyai berapa ayat?', ['5', '6', '7', '8'], 2, 15),
      q('Surah yang tidak dimulakan dengan Bismillah ialah surah...', ['Al-Mulk', 'Yasin', 'At-Taubah', 'Al-Kahfi'], 2, 20),
      q('Wahyu pertama diturunkan kepada Nabi Muhammad SAW di...', ['Gua Thur', 'Gua Hira', 'Masjidil Haram', 'Madinah'], 1, 20),
      q('Wahyu pertama ialah surah...', ["Al-'Alaq ayat 1 hingga 5", 'Al-Fatihah', 'Al-Muddaththir', 'Al-Baqarah'], 0, 20),
      tf('Al-Quran diturunkan pada bulan Ramadan.', true),
      q('Nabi yang ditelan ikan nun (ikan besar) ialah...', ['Nabi Nuh a.s.', 'Nabi Musa a.s.', 'Nabi Yunus a.s.', 'Nabi Ibrahim a.s.'], 2, 20),
      q('Nabi yang membina bahtera besar ialah...', ['Nabi Nuh a.s.', 'Nabi Sulaiman a.s.', 'Nabi Daud a.s.', 'Nabi Isa a.s.'], 0, 20),
      q('Kitab Taurat diturunkan kepada...', ['Nabi Isa a.s.', 'Nabi Daud a.s.', 'Nabi Musa a.s.', 'Nabi Muhammad SAW'], 2, 20),
      q('Kitab Zabur diturunkan kepada...', ['Nabi Daud a.s.', 'Nabi Musa a.s.', 'Nabi Isa a.s.', 'Nabi Ibrahim a.s.'], 0, 20),
      tf('Nabi Muhammad SAW dilahirkan di Madinah.', false),
    ],
  },
];

export const TIME_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

export function hasArabic(s) {
  return /[؀-ۿ]/.test(String(s || ''));
}

// Bersihkan kuiz yang diimport/dibina supaya selamat dan konsisten.
export function sanitizeQuiz(input) {
  const src = input && typeof input === 'object' ? input : {};
  const title = String(src.title || 'Kuiz tanpa nama').slice(0, 80);
  const questions = (Array.isArray(src.questions) ? src.questions : [])
    .map((qq) => {
      const choices = (Array.isArray(qq.choices) ? qq.choices : []).map((c) => String(c == null ? '' : c).slice(0, 90)).filter((c) => c.trim() !== '').slice(0, 4);
      if (choices.length < 2) return null;
      let correct = Number.isInteger(qq.correct) ? qq.correct : parseInt(qq.correct, 10);
      if (!(correct >= 0 && correct < choices.length)) correct = 0;
      let time = parseInt(qq.time, 10);
      if (!(time >= 5 && time <= 240)) time = 20;
      const points = [0, 1, 2].includes(Number(qq.points)) ? Number(qq.points) : 1;
      const out = { text: String(qq.text || '').slice(0, 240), choices, correct, time, points };
      if (qq.ar) out.ar = String(qq.ar).slice(0, 40);
      if (qq.image && /^https:\/\/[^\s"'<>]+$/i.test(String(qq.image))) out.image = String(qq.image).slice(0, 500);
      return out.text.trim() || out.ar ? out : null;
    })
    .filter(Boolean)
    .slice(0, 100);
  return { id: src.id && !src.builtin ? String(src.id).slice(0, 40) : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title, desc: String(src.desc || '').slice(0, 160), questions };
}

// CSV: Soalan, Pilihan A, Pilihan B, Pilihan C, Pilihan D, Jawapan (A-D atau 1-4), Masa (saat)
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

export function quizFromCSV(text, title) {
  const rows = parseCSV(text);
  if (!rows.length) return null;
  const first = rows[0].map((c) => String(c).toLowerCase());
  const start = first[0] && (first[0].includes('soalan') || first[0].includes('question')) ? 1 : 0;
  const questions = rows.slice(start).map((r) => {
    const choices = r.slice(1, 5).map((c) => String(c).trim()).filter(Boolean);
    const ans = String(r[5] || 'A').trim().toUpperCase();
    let correct = 'ABCD'.indexOf(ans);
    if (correct < 0) correct = parseInt(ans, 10) - 1;
    return { text: String(r[0] || '').trim(), choices, correct, time: parseInt(r[6], 10) || 20, points: 1 };
  });
  return sanitizeQuiz({ title: title || 'Kuiz dari CSV', questions });
}

export const CSV_TEMPLATE = 'Soalan,Pilihan A,Pilihan B,Pilihan C,Pilihan D,Jawapan (A-D),Masa (saat)\n'
  + '"Berapakah bilangan Rukun Islam?",4,5,6,7,B,20\n'
  + '"Surah pertama dalam Al-Quran?",Al-Baqarah,Al-Fatihah,An-Nas,Al-Ikhlas,B,15\n'
  + '"Solat Subuh ada 2 rakaat.",Betul,Salah,,,A,10\n';
