/**
 * ============================================================
 *  PORTAL KELAS MENGAJI — BACKEND (Google Apps Script)
 * ============================================================
 *  Semua tetapan (logo, nama, gred, subjek, aspek bacaan, markah
 *  penuh, pengguna) disimpan dalam Google Sheet ini dan boleh
 *  diubah oleh SUPERADMIN terus dari portal web.
 *
 *  Cara pasang ringkas (lihat README.md untuk langkah penuh):
 *   1. Buka Google Sheet > Extensions > Apps Script.
 *   2. Tampal fail ini sebagai Code.gs (ganti kod lama).
 *   3. Jalankan fungsi `setupSistem` sekali (beri kebenaran).
 *   4. Deploy > New deployment > Web app
 *        Execute as : Me
 *        Who has access : Anyone
 *   5. Salin URL /exec ke dalam index.html (API_URL).
 * ============================================================
 */

// Isi ID spreadsheet jika skrip ini BUKAN dicipta dari dalam Sheet (standalone).
const SPREADSHEET_ID = '';

const SHEET = {
  SETTINGS: 'TETAPAN',
  SUBJECTS: 'SUBJEK',
  ASPECTS: 'ASPEK',
  STUDENTS: 'PELAJAR',
  USERS: 'PENGGUNA'
};

const COLUMNS = {
  TETAPAN: ['kunci', 'nilai'],
  SUBJEK: ['id', 'nama', 'sasaranSkor', 'labelSasaran', 'teksCapai', 'teksBelumCapai', 'ikon', 'susunan', 'aktif'],
  ASPEK: ['id', 'subjekId', 'bahagian', 'nama', 'markahPenuh', 'susunan'],
  PELAJAR: ['subjekId', 'ic', 'nama', 'gambar', 'markah', 'dikemaskini'],
  PENGGUNA: ['username', 'nama', 'peranan', 'salt', 'hash', 'dicipta']
};

const DEFAULT_SETTINGS = {
  appName: 'Kelas Mengaji Hafsah',
  shortName: 'KM Hafsah',
  loginSubtitle: 'Portal Pelajar & Ibu Bapa',
  tagline: 'Pemantauan Prestasi',
  footerText: '© Kelas Mengaji Hafsah. Hak Cipta Terpelihara.',
  logoUrl: 'https://i.postimg.cc/TwZN5fP1/image.png',
  logoFileId: '',
  allowStudentPhoto: true,
  grades: [
    { label: 'Cemerlang', min: 90, color: 'emerald' },
    { label: 'Baik', min: 70, color: 'green' },
    { label: 'Sederhana', min: 41, color: 'orange' },
    { label: 'Lemah', min: 0, color: 'red' }
  ]
};

// Kunci tetapan yang superadmin boleh ubah dari portal.
const EDITABLE_SETTINGS = ['appName', 'shortName', 'loginSubtitle', 'tagline', 'footerText', 'allowStudentPhoto'];
const GRADE_COLORS = ['emerald', 'green', 'lime', 'blue', 'amber', 'orange', 'red', 'purple', 'gray'];
const TOKEN_TTL_SECONDS = 6 * 60 * 60;
const DEFAULT_PASSWORD = 'hafsah123#';

// ============================================================
//  ENTRY POINTS
// ============================================================

function doGet() {
  return jsonOut({ status: 'success', data: { message: 'API Portal Mengaji aktif.' } });
}

function doPost(e) {
  let req = {};
  try {
    const raw = (e && e.parameter && e.parameter.payload) || (e && e.postData && e.postData.contents) || '{}';
    req = JSON.parse(raw);
  } catch (err) {
    return jsonOut({ status: 'error', message: 'Format permintaan tidak sah.' });
  }

  const def = ACTIONS[req.action];
  if (!def) return jsonOut({ status: 'error', message: 'Tindakan tidak dikenali: ' + req.action });

  let lock = null;
  try {
    ensureSetup();

    let user = null;
    if (def.role !== 'public') {
      user = getSessionUser(req.token);
      if (!user) return jsonOut({ status: 'error', code: 'AUTH', message: 'Sesi tamat. Sila log masuk semula.' });
      if (def.role === 'superadmin' && user.role !== 'superadmin') {
        return jsonOut({ status: 'error', message: 'Hanya Superadmin dibenarkan membuat perubahan ini.' });
      }
    }

    if (def.write) {
      lock = LockService.getScriptLock();
      lock.waitLock(20000);
    }

    const data = def.fn(req, user);
    return jsonOut({ status: 'success', data: data });
  } catch (err) {
    console.error(err);
    return jsonOut({ status: 'error', message: err && err.message ? err.message : String(err) });
  } finally {
    if (lock) lock.releaseLock();
  }
}

const ACTIONS = {
  // Awam
  getConfig:        { role: 'public', fn: actionGetConfig },
  studentLogin:     { role: 'public', fn: actionStudentLogin },
  updateOwnPhoto:   { role: 'public', fn: actionUpdateOwnPhoto, write: true },
  login:            { role: 'public', fn: actionLogin },

  // Admin / Guru
  logout:           { role: 'admin', fn: actionLogout },
  getStudents:      { role: 'admin', fn: actionGetStudents },
  addStudent:       { role: 'admin', fn: actionAddStudent, write: true },
  updateStudent:    { role: 'admin', fn: actionUpdateStudent, write: true },
  deleteStudent:    { role: 'admin', fn: actionDeleteStudent, write: true },
  changePassword:   { role: 'admin', fn: actionChangePassword, write: true },

  // Superadmin
  saveSettings:     { role: 'superadmin', fn: actionSaveSettings, write: true },
  saveSubject:      { role: 'superadmin', fn: actionSaveSubject, write: true },
  deleteSubject:    { role: 'superadmin', fn: actionDeleteSubject, write: true },
  listUsers:        { role: 'superadmin', fn: actionListUsers },
  saveUser:         { role: 'superadmin', fn: actionSaveUser, write: true },
  deleteUser:       { role: 'superadmin', fn: actionDeleteUser, write: true }
};

// ============================================================
//  AWAM
// ============================================================

function actionGetConfig() {
  return buildPublicConfig();
}

function buildPublicConfig() {
  const settings = getSettings();
  const subjects = readTable(SHEET.SUBJECTS).map(toSubject).sort(byOrder);
  const aspects = readTable(SHEET.ASPECTS).map(toAspect).sort(byOrder);
  return {
    settings: {
      appName: settings.appName,
      shortName: settings.shortName,
      loginSubtitle: settings.loginSubtitle,
      tagline: settings.tagline,
      footerText: settings.footerText,
      allowStudentPhoto: settings.allowStudentPhoto !== false,
      logo: getLogoForClient(settings)
    },
    grades: normalizeGrades(settings.grades),
    subjects: subjects,
    aspects: aspects
  };
}

function actionStudentLogin(req) {
  const ic = digits(req.ic);
  if (ic.length < 6) throw new Error('Sila masukkan No. Kad Pengenalan yang sah.');

  const activeIds = readTable(SHEET.SUBJECTS).map(toSubject).filter(s => s.aktif).map(s => s.id);
  const rows = readTable(SHEET.STUDENTS).filter(r => digits(r.ic) === ic && activeIds.indexOf(String(r.subjekId)) !== -1);
  return rows.map(r => ({ subjectId: String(r.subjekId), student: toStudent(r) }));
}

function actionUpdateOwnPhoto(req) {
  const settings = getSettings();
  if (settings.allowStudentPhoto === false) throw new Error('Kemaskini gambar oleh pelajar telah dimatikan oleh pentadbir.');
  const ic = digits(req.ic);
  if (ic.length < 6 || !req.image) throw new Error('Maklumat tidak lengkap.');

  const sheet = getSheet(SHEET.STUDENTS);
  const rows = readTable(SHEET.STUDENTS).filter(r => digits(r.ic) === ic);
  if (!rows.length) throw new Error('Rekod pelajar tidak dijumpai.');

  const fileId = saveImageToDrive(req.image, req.mimeType, 'pelajar_' + ic);
  rows.forEach(r => {
    setTextValues(sheet.getRange(r._row, COLUMNS.PELAJAR.indexOf('gambar') + 1), [[fileId]]);
    setTextValues(sheet.getRange(r._row, COLUMNS.PELAJAR.indexOf('dikemaskini') + 1), [[nowString()]]);
  });
  return { picUrl: drivePicUrl(fileId) };
}

function actionLogin(req) {
  const username = String(req.username || '').trim().toLowerCase();
  const password = String(req.password || '');
  if (!username || !password) throw new Error('Sila isi nama pengguna dan kata laluan.');

  const user = readTable(SHEET.USERS).find(u => String(u.username).toLowerCase() === username);
  if (!user || hashPassword(password, user.salt) !== user.hash) {
    Utilities.sleep(600);
    throw new Error('Nama pengguna atau kata laluan tidak sah.');
  }

  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  const session = { username: user.username, name: user.nama || user.username, role: user.peranan === 'superadmin' ? 'superadmin' : 'admin' };
  CacheService.getScriptCache().put('tok_' + token, JSON.stringify(session), TOKEN_TTL_SECONDS);
  return { token: token, user: session };
}

// ============================================================
//  ADMIN / GURU
// ============================================================

function actionLogout(req) {
  CacheService.getScriptCache().remove('tok_' + req.token);
  return true;
}

function actionGetStudents(req) {
  const subjectId = String(req.subjectId || '');
  return readTable(SHEET.STUDENTS)
    .filter(r => String(r.subjekId) === subjectId)
    .map(toStudent);
}

function actionAddStudent(req) {
  const subject = requireSubject(req.subjectId);
  const ic = String(req.ic || '').trim();
  const nama = String(req.name || '').trim();
  if (digits(ic).length < 6) throw new Error('No. IC tidak sah.');
  if (!nama) throw new Error('Nama pelajar diperlukan.');

  const exists = readTable(SHEET.STUDENTS).some(r => String(r.subjekId) === subject.id && digits(r.ic) === digits(ic));
  if (exists) throw new Error('Pelajar dengan IC ini telah berdaftar dalam ' + subject.nama + '.');

  let gambar = '';
  if (req.image) {
    gambar = saveImageToDrive(req.image, req.mimeType, 'pelajar_' + digits(ic));
  } else {
    // Guna semula gambar sedia ada jika pelajar sama sudah ada dalam subjek lain
    const other = readTable(SHEET.STUDENTS).find(r => digits(r.ic) === digits(ic) && r.gambar);
    if (other) gambar = other.gambar;
  }

  appendRow(SHEET.STUDENTS, {
    subjekId: subject.id, ic: ic, nama: nama, gambar: gambar, markah: '{}', dikemaskini: nowString()
  });
  return true;
}

function actionUpdateStudent(req) {
  const subject = requireSubject(req.subjectId);
  const ic = digits(req.ic);
  const sheet = getSheet(SHEET.STUDENTS);
  const row = readTable(SHEET.STUDENTS).find(r => String(r.subjekId) === subject.id && digits(r.ic) === ic);
  if (!row) throw new Error('Rekod pelajar tidak dijumpai. Sila muat semula data.');

  const nama = String(req.name || '').trim() || row.nama;

  // Hanya terima markah untuk aspek subjek ini & dalam julat 0..markahPenuh
  const aspects = readTable(SHEET.ASPECTS).map(toAspect).filter(a => a.subjectId === subject.id);
  const marks = parseJSON(row.markah, {});
  const incoming = req.marks || {};
  aspects.forEach(a => {
    if (incoming[a.id] === undefined || incoming[a.id] === null || incoming[a.id] === '') return;
    let v = Number(incoming[a.id]);
    if (isNaN(v)) return;
    v = Math.max(0, Math.min(a.maxMark, v));
    marks[a.id] = v;
  });

  let gambar = row.gambar;
  if (req.image) {
    gambar = saveImageToDrive(req.image, req.mimeType, 'pelajar_' + ic);
    // Gambar ialah milik pelajar, jadi kemaskini di semua subjek
    readTable(SHEET.STUDENTS).filter(r => digits(r.ic) === ic).forEach(r => {
      setTextValues(sheet.getRange(r._row, COLUMNS.PELAJAR.indexOf('gambar') + 1), [[gambar]]);
    });
  }

  writeRow(SHEET.STUDENTS, row._row, {
    subjekId: subject.id, ic: row.ic, nama: nama, gambar: gambar,
    markah: JSON.stringify(marks), dikemaskini: nowString()
  });
  return true;
}

function actionDeleteStudent(req) {
  const subjectId = String(req.subjectId || '');
  const ic = digits(req.ic);
  const row = readTable(SHEET.STUDENTS).find(r => String(r.subjekId) === subjectId && digits(r.ic) === ic);
  if (!row) throw new Error('Rekod pelajar tidak dijumpai.');
  getSheet(SHEET.STUDENTS).deleteRow(row._row);
  return true;
}

function actionChangePassword(req, user) {
  const sheet = getSheet(SHEET.USERS);
  const row = readTable(SHEET.USERS).find(u => String(u.username).toLowerCase() === String(user.username).toLowerCase());
  if (!row) throw new Error('Pengguna tidak dijumpai.');
  if (hashPassword(String(req.oldPassword || ''), row.salt) !== row.hash) throw new Error('Kata laluan lama tidak tepat.');
  const pwd = String(req.newPassword || '');
  if (pwd.length < 6) throw new Error('Kata laluan baharu mesti sekurang-kurangnya 6 aksara.');
  const salt = Utilities.getUuid();
  setTextValues(sheet.getRange(row._row, COLUMNS.PENGGUNA.indexOf('salt') + 1, 1, 2), [[salt, hashPassword(pwd, salt)]]);
  return true;
}

// ============================================================
//  SUPERADMIN — KONFIGURASI
// ============================================================

function actionSaveSettings(req) {
  const current = getSettings();
  const incoming = req.settings || {};

  EDITABLE_SETTINGS.forEach(k => {
    if (incoming[k] === undefined) return;
    current[k] = k === 'allowStudentPhoto' ? Boolean(incoming[k]) : String(incoming[k]).trim();
  });
  if (!current.appName) current.appName = DEFAULT_SETTINGS.appName;

  if (req.grades) current.grades = normalizeGrades(req.grades, true);

  const logo = req.logo || {};
  if (logo.remove) {
    current.logoFileId = '';
    current.logoUrl = '';
  } else if (logo.image) {
    current.logoFileId = saveImageToDrive(logo.image, logo.mimeType, 'logo');
    current.logoUrl = '';
  } else if (logo.url !== undefined && logo.url !== null) {
    current.logoUrl = String(logo.url).trim();
    current.logoFileId = '';
  }

  saveSettings(current);
  CacheService.getScriptCache().remove('logo_data');
  return buildPublicConfig();
}

function actionSaveSubject(req) {
  const s = req.subject || {};
  const nama = String(s.nama || '').trim();
  if (!nama) throw new Error('Nama subjek / kelas diperlukan.');

  const subjects = readTable(SHEET.SUBJECTS);
  let id = String(s.id || '').trim();
  let existing = id ? subjects.find(r => String(r.id) === id) : null;
  if (id && !existing) throw new Error('Subjek tidak dijumpai.');

  if (!existing) {
    id = slugify(nama);
    let n = 2;
    const base = id;
    while (subjects.some(r => String(r.id) === id)) id = base + '_' + (n++);
  }

  const target = Number(s.sasaranSkor);
  const record = {
    id: id,
    nama: nama,
    sasaranSkor: isNaN(target) ? 100 : Math.max(0, Math.min(100, target)),
    labelSasaran: String(s.labelSasaran || '').trim(),
    teksCapai: String(s.teksCapai || '').trim(),
    teksBelumCapai: String(s.teksBelumCapai || '').trim(),
    ikon: String(s.ikon || 'book').trim(),
    susunan: existing ? existing.susunan : subjects.length + 1,
    aktif: s.aktif === false ? 'FALSE' : 'TRUE'
  };
  if (s.susunan !== undefined && s.susunan !== null && s.susunan !== '') record.susunan = Number(s.susunan) || record.susunan;

  // Sahkan aspek dahulu supaya tiada simpanan separuh jalan jika ada ralat
  const cleanAspects = Array.isArray(req.aspects) ? cleanAspectList(id, req.aspects) : null;

  if (existing) writeRow(SHEET.SUBJECTS, existing._row, record);
  else appendRow(SHEET.SUBJECTS, record);

  if (cleanAspects) writeAspectsForSubject(id, cleanAspects);

  return { subjectId: id, config: buildPublicConfig() };
}

function saveAspectsForSubject(subjectId, list) {
  writeAspectsForSubject(subjectId, cleanAspectList(subjectId, list));
}

function cleanAspectList(subjectId, list) {
  const seenNames = {};
  return list.map((a, i) => {
    const nama = String(a.nama || '').trim();
    if (!nama) return null;
    const key = nama.toUpperCase();
    if (seenNames[key]) throw new Error('Aspek "' + nama + '" berulang. Setiap aspek mesti unik.');
    seenNames[key] = true;
    const max = Number(a.markahPenuh);
    if (isNaN(max) || max <= 0) throw new Error('Markah penuh untuk "' + nama + '" mesti lebih dari 0.');
    return {
      id: String(a.id || '').trim() || ('a' + Utilities.getUuid().replace(/-/g, '').slice(0, 10)),
      subjekId: subjectId,
      bahagian: String(a.bahagian || '').trim().toUpperCase() || 'UMUM',
      nama: nama,
      markahPenuh: max,
      susunan: i + 1
    };
  }).filter(Boolean);
}

function writeAspectsForSubject(subjectId, clean) {
  const sheet = getSheet(SHEET.ASPECTS);
  const all = readTable(SHEET.ASPECTS);

  // Buang aspek lama subjek ini (dari bawah ke atas supaya nombor baris tidak berubah)
  all.filter(r => String(r.subjekId) === subjectId)
    .map(r => r._row)
    .sort((a, b) => b - a)
    .forEach(rowNum => sheet.deleteRow(rowNum));

  if (clean.length) {
    const values = clean.map(r => COLUMNS.ASPEK.map(c => r[c]));
    setTextValues(sheet.getRange(sheet.getLastRow() + 1, 1, values.length, COLUMNS.ASPEK.length), values);
  }
}

function actionDeleteSubject(req) {
  const id = String(req.subjectId || '');
  const subj = readTable(SHEET.SUBJECTS).find(r => String(r.id) === id);
  if (!subj) throw new Error('Subjek tidak dijumpai.');
  const count = readTable(SHEET.STUDENTS).filter(r => String(r.subjekId) === id).length;
  if (count > 0) {
    throw new Error('Subjek ini masih ada ' + count + ' pelajar. Padam pelajar dahulu, atau tandakan subjek sebagai "Tidak Aktif".');
  }
  saveAspectsForSubject(id, []);
  getSheet(SHEET.SUBJECTS).deleteRow(subj._row);
  return buildPublicConfig();
}

function actionListUsers() {
  return readTable(SHEET.USERS).map(u => ({
    username: u.username, nama: u.nama, peranan: u.peranan === 'superadmin' ? 'superadmin' : 'admin', dicipta: u.dicipta
  }));
}

function actionSaveUser(req, me) {
  const u = req.user || {};
  const username = String(u.username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Nama pengguna mesti 3-30 aksara (huruf kecil, nombor, titik, sengkang).');
  const role = u.peranan === 'superadmin' ? 'superadmin' : 'admin';
  const users = readTable(SHEET.USERS);
  const existing = users.find(r => String(r.username).toLowerCase() === username);
  const pwd = String(u.password || '');

  if (!existing) {
    if (pwd.length < 6) throw new Error('Kata laluan mesti sekurang-kurangnya 6 aksara.');
    const salt = Utilities.getUuid();
    appendRow(SHEET.USERS, { username: username, nama: String(u.nama || username).trim(), peranan: role, salt: salt, hash: hashPassword(pwd, salt), dicipta: nowString() });
  } else {
    if (existing.peranan === 'superadmin' && role !== 'superadmin' && countSuperadmins(users) <= 1) {
      throw new Error('Mesti ada sekurang-kurangnya seorang Superadmin.');
    }
    let salt = existing.salt, hash = existing.hash;
    if (pwd) {
      if (pwd.length < 6) throw new Error('Kata laluan mesti sekurang-kurangnya 6 aksara.');
      salt = Utilities.getUuid();
      hash = hashPassword(pwd, salt);
    }
    writeRow(SHEET.USERS, existing._row, { username: existing.username, nama: String(u.nama || existing.nama).trim(), peranan: role, salt: salt, hash: hash, dicipta: existing.dicipta });
  }
  return actionListUsers();
}

function actionDeleteUser(req, me) {
  const username = String(req.username || '').toLowerCase();
  if (username === String(me.username).toLowerCase()) throw new Error('Anda tidak boleh memadam akaun sendiri.');
  const users = readTable(SHEET.USERS);
  const row = users.find(r => String(r.username).toLowerCase() === username);
  if (!row) throw new Error('Pengguna tidak dijumpai.');
  if (row.peranan === 'superadmin' && countSuperadmins(users) <= 1) throw new Error('Mesti ada sekurang-kurangnya seorang Superadmin.');
  getSheet(SHEET.USERS).deleteRow(row._row);
  return actionListUsers();
}

// ============================================================
//  SETUP & MIGRASI
// ============================================================

/** Jalankan sekali dari editor untuk cipta struktur & beri kebenaran Drive/Sheets. */
function setupSistem() {
  PropertiesService.getScriptProperties().deleteProperty('SETUP_V2');
  ensureSetup();
  getDriveFolder();
  const users = readTable(SHEET.USERS);
  console.log('Setup selesai. Pengguna: ' + users.map(u => u.username + ' (' + u.peranan + ')').join(', '));
}

function ensureSetup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('SETUP_V2') === 'done') return;

  const ss = getSpreadsheet();
  Object.keys(COLUMNS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, COLUMNS[name].length).setValues([COLUMNS[name]]).setFontWeight('bold').setBackground('#dcfce7');
      sh.setFrozenRows(1);
      // Simpan semua sebagai teks biasa supaya IC / sifar di depan tidak berubah
      sh.getRange(1, 1, sh.getMaxRows(), COLUMNS[name].length).setNumberFormat('@');
    }
  });

  if (readTable(SHEET.SETTINGS).length === 0) saveSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));

  if (readTable(SHEET.SUBJECTS).length === 0) {
    const migrated = migrateLegacyInternal();
    if (!migrated) seedDefaultSubjects();
  }

  if (readTable(SHEET.USERS).length === 0) {
    const pwd = findLegacyPassword() || DEFAULT_PASSWORD;
    const salt = Utilities.getUuid();
    appendRow(SHEET.USERS, { username: 'superadmin', nama: 'Superadmin', peranan: 'superadmin', salt: salt, hash: hashPassword(pwd, salt), dicipta: nowString() });
  }

  props.setProperty('SETUP_V2', 'done');
}

/** Boleh dijalankan manual jika mahu import semula data dari tab lama (hanya jika PELAJAR kosong). */
function migrasiDataLama() {
  if (readTable(SHEET.STUDENTS).length > 0) {
    throw new Error('Tab PELAJAR sudah ada data. Kosongkan dahulu jika mahu migrasi semula.');
  }
  const ok = migrateLegacyInternal();
  console.log(ok ? 'Migrasi selesai.' : 'Tiada tab lama dijumpai.');
}

const LEGACY_TABS = [
  { tab: 'TALAQQI AL QURAN', id: 'talaqqi', nama: 'Talaqqi Al-Quran', picIndex: 37, sasaranSkor: 100, labelSasaran: 'Sasaran Khatam (100%)', teksCapai: '', teksBelumCapai: 'Sasaran Utama: Khatam 30 Juz', ikon: 'book' },
  { tab: 'KELAS ABAHATA', id: 'abahata', nama: 'Kelas ABAHATA', picIndex: 53, sasaranSkor: 90, labelSasaran: 'Sasaran Sijil (90%)', teksCapai: 'Layak Menerima Sijil ABAHATA', teksBelumCapai: 'Sasaran Kelayakan Sijil: 90%', ikon: 'library' }
];

function migrateLegacyInternal() {
  const ss = getSpreadsheet();
  let any = false;

  LEGACY_TABS.forEach((cfg, order) => {
    const sh = ss.getSheetByName(cfg.tab);
    if (!sh || sh.getLastRow() < 2) return;
    any = true;

    const values = sh.getDataRange().getDisplayValues();
    const headers = values[0];
    const base = values[1] || [];

    // Cari lajur gambar ikut nama header; jika tiada guna kedudukan lama
    let picIndex = -1;
    for (let c = 3; c < headers.length; c++) {
      if (/GAMBAR|FOTO|PHOTO|PIC|IMAGE/i.test(headers[c])) { picIndex = c; break; }
    }
    if (picIndex === -1) picIndex = Math.min(cfg.picIndex, headers.length);

    if (!readTable(SHEET.SUBJECTS).some(r => String(r.id) === cfg.id)) {
      appendRow(SHEET.SUBJECTS, {
        id: cfg.id, nama: cfg.nama, sasaranSkor: cfg.sasaranSkor, labelSasaran: cfg.labelSasaran,
        teksCapai: cfg.teksCapai, teksBelumCapai: cfg.teksBelumCapai, ikon: cfg.ikon, susunan: order + 1, aktif: 'TRUE'
      });
    }

    const aspects = [];
    const colToAspect = {};
    for (let c = 3; c < picIndex; c++) {
      const name = String(headers[c] || '').trim();
      if (!name) continue;
      const max = parseFloat(base[c]);
      const id = 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
      aspects.push({ id: id, bahagian: legacySection(name, cfg.id), nama: name, markahPenuh: isNaN(max) || max <= 0 ? 100 : max });
      colToAspect[c] = id;
    }
    saveAspectsForSubject(cfg.id, aspects);

    const rows = [];
    for (let r = 2; r < values.length; r++) {
      const row = values[r];
      const nama = String(row[1] || '').trim();
      if (!nama) continue;
      const marks = {};
      Object.keys(colToAspect).forEach(c => {
        const v = parseFloat(row[c]);
        if (!isNaN(v)) marks[colToAspect[c]] = v;
      });
      const rawPic = String(row[picIndex] || '').trim();
      const m = rawPic.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawPic.match(/id=([a-zA-Z0-9_-]+)/);
      rows.push([cfg.id, String(row[2] || '').trim(), nama, m ? m[1] : rawPic, JSON.stringify(marks), nowString()]);
    }
    if (rows.length) {
      const st = getSheet(SHEET.STUDENTS);
      setTextValues(st.getRange(st.getLastRow() + 1, 1, rows.length, COLUMNS.PELAJAR.length), rows);
    }
  });

  return any;
}

function legacySection(header, classId) {
  header = String(header).toUpperCase().trim();
  if (classId === 'talaqqi') {
    if (header === 'SEBUTAN MAKHRAJ') return 'SEBUTAN';
    if (['QALQALAH', 'HURUF BERSABDU', 'MIM & NUN BERSABDU', 'CARA WAQAF', 'TANDA WAQAF', 'ALIF LAM QAMARIAH', 'ALIF LAM SYAMSIAH', 'BACAAN LAIN'].indexOf(header) !== -1) return 'CARA BACAAN';
    if (['MAD ASLI', 'IDZHAR', 'IDGHAM', 'IKLAB', "IKHFA' HAQIQI", 'IDGHAM SYAFAWI', "IKHFA' SYAFAWI", 'IDZHAR SYAFAWI', 'HUKUM RO', 'LAM LAFAZHUL', 'IDGHAM MUTAMATHILAIN', 'IDGHAM MUTAQARIBAIN', 'IDGHAM MUTAJANISAIN', 'MAD WAJIB', 'MAD JAIZ MUNFASIL', 'MAD ARID', 'MAD IWAD', 'MAD BADAL', 'MAD LIN', 'MAD SILAH', 'MAD TAMKIN', 'MAD FARQI', 'MAD LAZIM'].indexOf(header) !== -1) return 'HUKUM TAJWID';
  } else {
    if (header.indexOf('SEBUTAN TUNGGAL') !== -1 || header.indexOf('HURUF SAMBUNG') !== -1) return 'SEBUTAN MAKHRAJ';
    if (['BACAAN QALQALAH', 'BACAAN HURUF BERSABDU', 'MIM & NUN BERSABDU', 'CARA WAQAF', 'TANDA WAQAF', 'ALIF LAM QAMARIAH', 'ALIF LAM SYAMSIAH', 'BACAAN LAIN *', 'BACAAN LAIN'].indexOf(header) !== -1) return 'BACAAN';
    if (['MAD ASLI', 'IDZHAR HALQI', 'IDGHAM', 'IQLAB', "IKHFA' HAQIQI", 'IDGHAM SYAFAWI', "IKHFA' SYAFAWI", 'IDZHAR SYAFAWI', 'HUKUM RO', 'LAM LAAFZHUL JALALAH', 'IDGHAM MUTAMASILAINI', 'IDGHAM MUTAQORIBAINI', 'IDGHAM MUTAJANISAINI', 'MAD WAJIB MUTTASIL', 'MAD JAIZ MUNFASIL', 'MAD ARID LISSUKUN', 'MAD IWAD', 'MAD BADAL', 'MAD LIN', 'MAD SILAH', 'MAD TAMKIN', 'MAD FARQI', 'MAD LAZIM'].indexOf(header) !== -1) return 'HUKUM TAJWID';
  }
  if (header === 'FASIH') return 'FASIH';
  if (header === 'LANCAR') return 'LANCAR';
  return 'LAIN-LAIN';
}

function seedDefaultSubjects() {
  const seed = [
    {
      cfg: LEGACY_TABS[0],
      groups: {
        'SEBUTAN': ['SEBUTAN MAKHRAJ'],
        'CARA BACAAN': ['QALQALAH', 'HURUF BERSABDU', 'MIM & NUN BERSABDU', 'CARA WAQAF', 'TANDA WAQAF', 'ALIF LAM QAMARIAH', 'ALIF LAM SYAMSIAH', 'BACAAN LAIN'],
        'HUKUM TAJWID': ['MAD ASLI', 'IDZHAR', 'IDGHAM', 'IKLAB', "IKHFA' HAQIQI", 'IDGHAM SYAFAWI', "IKHFA' SYAFAWI", 'IDZHAR SYAFAWI', 'HUKUM RO', 'LAM LAFAZHUL', 'IDGHAM MUTAMATHILAIN', 'IDGHAM MUTAQARIBAIN', 'IDGHAM MUTAJANISAIN', 'MAD WAJIB', 'MAD JAIZ MUNFASIL', 'MAD ARID', 'MAD IWAD', 'MAD BADAL', 'MAD LIN', 'MAD SILAH', 'MAD TAMKIN', 'MAD FARQI', 'MAD LAZIM'],
        'FASIH': ['FASIH'],
        'LANCAR': ['LANCAR']
      }
    },
    {
      cfg: LEGACY_TABS[1],
      groups: {
        'SEBUTAN MAKHRAJ': ['SEBUTAN TUNGGAL', 'BENTUK HURUF SAMBUNG', 'SEBUTAN HURUF SAMBUNG (SUKUN)'],
        'BACAAN': ['BACAAN QALQALAH', 'BACAAN HURUF BERSABDU', 'MIM & NUN BERSABDU', 'CARA WAQAF', 'TANDA WAQAF', 'ALIF LAM QAMARIAH', 'ALIF LAM SYAMSIAH', 'BACAAN LAIN'],
        'HUKUM TAJWID': ['MAD ASLI', 'IDZHAR HALQI', 'IDGHAM', 'IQLAB', "IKHFA' HAQIQI", 'IDGHAM SYAFAWI', "IKHFA' SYAFAWI", 'IDZHAR SYAFAWI', 'HUKUM RO', 'LAM LAAFZHUL JALALAH', 'MAD WAJIB MUTTASIL', 'MAD JAIZ MUNFASIL', 'MAD ARID LISSUKUN', 'MAD LAZIM'],
        'FASIH': ['FASIH'],
        'LANCAR': ['LANCAR']
      }
    }
  ];

  seed.forEach((s, i) => {
    const c = s.cfg;
    appendRow(SHEET.SUBJECTS, {
      id: c.id, nama: c.nama, sasaranSkor: c.sasaranSkor, labelSasaran: c.labelSasaran,
      teksCapai: c.teksCapai, teksBelumCapai: c.teksBelumCapai, ikon: c.ikon, susunan: i + 1, aktif: 'TRUE'
    });
    const aspects = [];
    Object.keys(s.groups).forEach(sec => s.groups[sec].forEach(n => aspects.push({ bahagian: sec, nama: n, markahPenuh: 10 })));
    saveAspectsForSubject(c.id, aspects);
  });
}

function findLegacyPassword() {
  try {
    const ss = getSpreadsheet();
    const sh = ss.getSheets().find(s => s.getSheetId() === 1794402337);
    if (!sh) return '';
    const v = sh.getRange(1, 1, 2, 1).getDisplayValues();
    const first = String(v[0][0] || '').trim();
    if (/password|laluan/i.test(first)) return String(v[1][0] || '').trim();
    return first;
  } catch (e) {
    return '';
  }
}

// ============================================================
//  HELPERS — DATA
// ============================================================

function getSpreadsheet() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet(name) {
  const sh = getSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error('Tab "' + name + '" tidak dijumpai. Jalankan setupSistem().');
  return sh;
}

function readTable(name) {
  const sh = getSheet(name);
  const cols = COLUMNS[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, cols.length).getValues();
  const out = [];
  values.forEach((row, i) => {
    if (row.every(v => v === '' || v === null)) return;
    const obj = { _row: i + 2 };
    cols.forEach((c, j) => obj[c] = row[j] instanceof Date ? row[j].toISOString() : row[j]);
    out.push(obj);
  });
  return out;
}

function appendRow(name, obj) {
  const sh = getSheet(name);
  const cols = COLUMNS[name];
  setTextValues(sh.getRange(sh.getLastRow() + 1, 1, 1, cols.length), [cols.map(c => obj[c] === undefined ? '' : obj[c])]);
}

function writeRow(name, rowNum, obj) {
  const cols = COLUMNS[name];
  setTextValues(getSheet(name).getRange(rowNum, 1, 1, cols.length), [cols.map(c => obj[c] === undefined ? '' : obj[c])]);
}

/** Tulis sebagai teks biasa supaya IC bermula dengan 0 tidak hilang. */
function setTextValues(range, values) {
  range.setNumberFormat('@').setValues(values.map(r => r.map(v => (v === null || v === undefined) ? '' : String(v))));
}

function getSettings() {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  readTable(SHEET.SETTINGS).forEach(r => {
    const key = String(r.kunci);
    if (!key) return;
    s[key] = parseJSON(r.nilai, r.nilai);
  });
  return s;
}

function saveSettings(obj) {
  const sh = getSheet(SHEET.SETTINGS);
  const keys = Object.keys(obj);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).clearContent();
  const values = keys.map(k => [k, JSON.stringify(obj[k])]);
  if (values.length) setTextValues(sh.getRange(2, 1, values.length, 2), values);
}

function normalizeGrades(list, strict) {
  if (!Array.isArray(list) || !list.length) {
    if (strict) throw new Error('Sekurang-kurangnya satu gred diperlukan.');
    return DEFAULT_SETTINGS.grades;
  }
  const out = list.map(g => ({
    label: String(g.label || '').trim(),
    min: Math.max(0, Math.min(100, Number(g.min) || 0)),
    color: GRADE_COLORS.indexOf(g.color) !== -1 ? g.color : 'gray'
  })).filter(g => g.label);
  if (!out.length) {
    if (strict) throw new Error('Label gred tidak boleh kosong.');
    return DEFAULT_SETTINGS.grades;
  }
  out.sort((a, b) => b.min - a.min);
  out[out.length - 1].min = 0; // gred paling rendah sentiasa bermula dari 0
  return out;
}

function toSubject(r) {
  const target = Number(r.sasaranSkor);
  return {
    id: String(r.id),
    nama: String(r.nama),
    sasaranSkor: isNaN(target) ? 100 : target,
    labelSasaran: String(r.labelSasaran || ''),
    teksCapai: String(r.teksCapai || ''),
    teksBelumCapai: String(r.teksBelumCapai || ''),
    ikon: String(r.ikon || 'book'),
    susunan: Number(r.susunan) || 0,
    aktif: String(r.aktif).toUpperCase() !== 'FALSE'
  };
}

function toAspect(r) {
  return {
    id: String(r.id),
    subjectId: String(r.subjekId),
    section: String(r.bahagian || 'UMUM'),
    name: String(r.nama),
    maxMark: Number(r.markahPenuh) || 100,
    susunan: Number(r.susunan) || 0
  };
}

function toStudent(r) {
  return {
    ic: String(r.ic),
    nama: String(r.nama),
    picUrl: drivePicUrl(r.gambar),
    marks: parseJSON(r.markah, {}),
    updatedAt: String(r.dikemaskini || '')
  };
}

function requireSubject(id) {
  const s = readTable(SHEET.SUBJECTS).map(toSubject).find(x => x.id === String(id || ''));
  if (!s) throw new Error('Subjek / kelas tidak dijumpai.');
  return s;
}

function countSuperadmins(users) {
  return users.filter(u => u.peranan === 'superadmin').length;
}

function byOrder(a, b) { return (a.susunan || 0) - (b.susunan || 0); }

// ============================================================
//  HELPERS — DRIVE / GAMBAR
// ============================================================

function getDriveFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* folder dipadam, cipta semula */ }
  }
  const folder = DriveApp.createFolder('Portal Mengaji - Gambar');
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

function saveImageToDrive(dataUrl, mimeType, prefix) {
  const str = String(dataUrl);
  const base64 = str.indexOf(',') !== -1 ? str.split(',')[1] : str;
  const type = mimeType || (str.match(/^data:([^;]+);/) || [])[1] || 'image/png';
  if (!/^image\//.test(type)) throw new Error('Fail mesti dalam format gambar.');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > 5 * 1024 * 1024) throw new Error('Saiz gambar melebihi 5MB.');
  const ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  const blob = Utilities.newBlob(bytes, type, prefix + '_' + Date.now() + '.' + ext);
  const file = getDriveFolder().createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    console.warn('Tidak dapat set perkongsian awam: ' + e);
  }
  return file.getId();
}

function drivePicUrl(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) {
    const m = v.match(/\/d\/([a-zA-Z0-9_-]+)/) || v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m && /google\.com/.test(v) ? 'https://lh3.googleusercontent.com/d/' + m[1] : v;
  }
  if (/^data:image\//.test(v)) return v;
  return 'https://lh3.googleusercontent.com/d/' + v;
}

/** Logo dihantar sebagai data URL supaya boleh dimasukkan ke dalam PDF tanpa isu CORS. */
function getLogoForClient(settings) {
  if (settings.logoFileId) {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('logo_data');
    if (cached) return cached;
    try {
      const blob = DriveApp.getFileById(settings.logoFileId).getBlob();
      const data = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
      if (data.length < 95000) cache.put('logo_data', data, 21600);
      return data;
    } catch (e) {
      console.warn('Logo tidak dapat dibaca: ' + e);
      return drivePicUrl(settings.logoFileId);
    }
  }
  return settings.logoUrl || '';
}

// ============================================================
//  HELPERS — UMUM
// ============================================================

function getSessionUser(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('tok_' + token);
  return raw ? JSON.parse(raw) : null;
}

function hashPassword(password, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + '::' + String(password), Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function digits(v) { return String(v || '').replace(/\D/g, ''); }

function slugify(s) {
  const slug = String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  return slug || 'subjek';
}

function parseJSON(v, fallback) {
  if (v === '' || v === null || v === undefined) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch (e) { return fallback === undefined ? v : (typeof fallback === 'string' ? v : fallback); }
}

function nowString() {
  return Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'dd/MM/yyyy HH:mm');
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
