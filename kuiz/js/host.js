// Skrin hos (cikgu): pilih kuiz, lobi dengan PIN/QR, kawal soalan, kira markah,
// papan markah langsung dan podium 3D. Hos ialah sumber kebenaran tunggal untuk markah.
import { $, $$, el, clear, show, toast, sfx, store, shapeSVG, ANSWER_META, keepAwake, fmt, download, qrSVG, cleanName } from './ui.js';
import { HostLink } from './net.js';
import { BUILTIN_QUIZZES, sanitizeQuiz, quizFromCSV, CSV_TEMPLATE, hasArabic } from './quizzes.js';
import { sanitizeAvatar } from './avatar-config.js';
import { openEditor } from './editor.js';

const SESSION_KEY = 'kh.hostSession';
const QUIZZES_KEY = 'kh.quizzes';
const HISTORY_KEY = 'kh.history';
const SETTINGS_KEY = 'kh.hostSettings';
const MAX_PLAYERS = 80;

const randomPin = () => String(100000 + Math.floor(Math.random() * 900000));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function allQuizzes() {
  return [...BUILTIN_QUIZZES, ...store.get(QUIZZES_KEY, [])];
}

function joinURL(pin) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('pin', pin);
  const qs = new URLSearchParams(location.search);
  if (qs.get('peer')) u.searchParams.set('peer', qs.get('peer'));
  return u.toString();
}

function watchURL(pin) {
  const u = new URL(joinURL(pin));
  u.searchParams.delete('pin');
  u.searchParams.set('tonton', pin);
  return u.toString();
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ====================================================================== SKRIN TETAPAN
export async function startHost(app) {
  let selected = store.get('kh.lastQuiz', BUILTIN_QUIZZES[0].id);
  const settings = { device: true, late: true, shuffle: false, auto: false, ...store.get(SETTINGS_KEY, {}) };

  function renderSetup() {
    show('scr-h-setup');
    const list = clear($('#quiz-list'));
    const quizzes = allQuizzes();
    if (!quizzes.find((q) => q.id === selected)) selected = quizzes[0].id;
    for (const qz of quizzes) {
      const card = el('div', { class: 'quiz-card' + (qz.id === selected ? ' on' : ''), role: 'button', tabindex: '0', onclick: () => { selected = qz.id; store.set('kh.lastQuiz', selected); renderSetup(); } },
        el('span', null, el('span', { class: 'tag' }, qz.builtin ? 'Terbina dalam' : 'Kuiz saya')),
        el('h3', null, qz.title),
        el('div', { class: 'meta' }, `${qz.questions.length} soalan${qz.desc ? ' • ' + qz.desc : ''}`),
        el('div', { class: 'actions' },
          el('button', { class: 'btn small', type: 'button', onclick: (e) => { e.stopPropagation(); edit(qz); } }, qz.builtin ? 'Salin & sunting' : 'Sunting')));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') card.click(); });
      list.append(card);
    }
    const sel = quizzes.find((q) => q.id === selected);
    $('#setup-selected').textContent = sel ? `Dipilih: ${sel.title} (${sel.questions.length} soalan)` : '';
    $('#set-device').checked = settings.device;
    $('#set-late').checked = settings.late;
    $('#set-shuffle').checked = settings.shuffle;
    $('#set-auto').checked = settings.auto;

    const snap = store.get(SESSION_KEY, null);
    const banner = $('#resume-banner');
    if (snap && Date.now() - snap.savedAt < 3 * 3600 * 1000 && snap.phase !== 'final') {
      banner.hidden = false;
      $('#resume-text').textContent = `Permainan "${snap.quiz.title}" (PIN ${snap.pin}, ${snap.players.length} pemain) tergendala. Sambung semula?`;
      $('#resume-yes').onclick = () => launch(snap.quiz, snap.settings, snap);
      $('#resume-no').onclick = () => { store.del(SESSION_KEY); renderSetup(); };
    } else banner.hidden = true;
  }

  function edit(qz) {
    const isNew = !qz || qz.builtin;
    const base = !qz ? { title: '', desc: '', questions: [] } : qz.builtin ? { ...JSON.parse(JSON.stringify(qz)), id: undefined, builtin: false, title: qz.title + ' (salinan)' } : qz;
    openEditor({
      quiz: base,
      isNew,
      onSave(clean) {
        const mine = store.get(QUIZZES_KEY, []);
        const i = mine.findIndex((m) => m.id === clean.id);
        if (i >= 0) mine[i] = clean; else mine.push(clean);
        if (!store.set(QUIZZES_KEY, mine)) toast('Storan pelayar penuh. Eksport kuiz sebagai JSON untuk simpanan.', 'bad', 4000);
        selected = clean.id;
        store.set('kh.lastQuiz', selected);
        toast('Kuiz disimpan dalam pelayar ini.', 'ok');
        renderSetup();
      },
      onCancel: renderSetup,
      onDelete() {
        store.set(QUIZZES_KEY, store.get(QUIZZES_KEY, []).filter((m) => m.id !== qz.id));
        toast('Kuiz dipadam.');
        renderSetup();
      },
    });
  }

  for (const [id, key] of [['set-device', 'device'], ['set-late', 'late'], ['set-shuffle', 'shuffle'], ['set-auto', 'auto']]) {
    $('#' + id).onchange = (e) => { settings[key] = e.target.checked; store.set(SETTINGS_KEY, settings); };
  }
  $('#btn-new-quiz').onclick = () => edit(null);
  $('#btn-template').onclick = () => download('templat-kuiz-hafsah.csv', '﻿' + CSV_TEMPLATE, 'text/csv');
  $('#btn-import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Fail terlalu besar (had 2MB).', 'bad'); return; }
    const text = await file.text();
    let quiz = null;
    try {
      if (/\.json$/i.test(file.name) || text.trim().startsWith('{')) quiz = sanitizeQuiz(JSON.parse(text));
      else quiz = quizFromCSV(text, file.name.replace(/\.[^.]+$/, ''));
    } catch (err) {
      quiz = null;
    }
    if (!quiz || !quiz.questions.length) { toast('Tidak dapat membaca kuiz. Semak format fail (guna templat CSV).', 'bad', 4000); return; }
    const mine = store.get(QUIZZES_KEY, []);
    mine.push(quiz);
    store.set(QUIZZES_KEY, mine);
    selected = quiz.id;
    toast(`Diimport: ${quiz.title} (${quiz.questions.length} soalan)`, 'ok');
    renderSetup();
  };
  $('#btn-history').onclick = showHistory;
  $('#setup-back').onclick = () => app.home();
  $('#btn-start-host').onclick = () => {
    const qz = allQuizzes().find((q) => q.id === selected);
    if (!qz || !qz.questions.length) { toast('Pilih kuiz yang ada soalan.', 'bad'); return; }
    launch(qz, { ...settings });
  };

  async function launch(quiz, gameSettings, snap) {
    show('scr-loading');
    $('#loading-text').textContent = snap ? 'Menyambung semula bilik...' : 'Menyediakan bilik permainan...';
    $('#loading-sub').textContent = 'Menyambung ke rangkaian PeerJS';
    await app.load3D();
    let pin = snap ? snap.pin : randomPin();
    let link = null;
    for (let attempt = 0; attempt < (snap ? 25 : 6); attempt++) {
      const candidate = new HostLink(pin, {});
      try {
        await candidate.open();
        link = candidate;
        break;
      } catch (err) {
        if (err && err.type === 'unavailable-id') {
          if (snap) { $('#loading-sub').textContent = 'Menunggu PIN lama dilepaskan...'; await sleep(3000); continue; }
          pin = randomPin();
          continue;
        }
        console.warn(err);
        $('#loading-sub').textContent = 'Gagal menyambung, mencuba lagi...';
        await sleep(2000);
      }
    }
    if (!link) {
      app.error('Tidak dapat membuka bilik', 'Pelayan PeerJS tidak dapat dihubungi. Semak sambungan internet dan cuba lagi.');
      return;
    }
    const game = new HostGame(app, link, pin, quiz, gameSettings, snap);
    app.cleanup = () => game.destroy();
    game.enter();
  }

  function showHistory() {
    const hist = store.get(HISTORY_KEY, []);
    const modal = el('div', { class: 'modal', onclick: (e) => { if (e.target === modal) modal.remove(); } });
    const card = el('div', { class: 'card' }, el('h2', null, 'Sejarah permainan (peranti ini)'));
    if (!hist.length) card.append(el('p', { class: 'muted' }, 'Belum ada permainan.'));
    for (const h of hist.slice().reverse()) {
      card.append(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', borderBottom: '1px solid #eee', padding: '8px 0', flexWrap: 'wrap' } },
        el('div', null, el('strong', null, h.title), el('div', { class: 'muted', style: { fontSize: '13px' } }, `${new Date(h.date).toLocaleString('ms-MY')} • ${h.rows.length} pemain • Juara: ${h.rows[0] ? h.rows[0].name : '-'}`)),
        el('button', { class: 'btn small', onclick: () => download(`keputusan-${h.title.replace(/[^\w-]+/g, '_')}-${h.date.slice(0, 10)}.csv`, toCSV(h.rows, h.n), 'text/csv') }, 'CSV')));
    }
    card.append(el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
      hist.length ? el('button', { class: 'btn small danger', onclick: () => { if (confirm('Padam semua sejarah?')) { store.del(HISTORY_KEY); modal.remove(); } } }, 'Padam semua') : null,
      el('button', { class: 'btn small primary', onclick: () => modal.remove() }, 'Tutup')));
    modal.append(card);
    document.body.append(modal);
  }

  renderSetup();
}

function toCSV(rows, n) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Kedudukan', 'Nama', 'Markah', 'Betul', 'Jumlah soalan', 'Purata masa jawab (saat)'];
  const lines = [head.map(esc).join(',')];
  for (const r of rows) lines.push([r.rank, r.name, r.score, r.correct, n, r.avg].map(esc).join(','));
  return '﻿' + lines.join('\n');
}

// ====================================================================== ENJIN PERMAINAN
class HostGame {
  constructor(app, link, pin, quiz, settings, snap) {
    this.app = app;
    this.link = link;
    this.pin = pin;
    this.settings = settings;
    this.sourceQuiz = quiz;
    this.quiz = snap ? snap.quiz : { ...quiz, questions: settings.shuffle ? shuffle(quiz.questions) : quiz.questions.slice() };
    this.players = new Map();
    this.byConn = new Map();
    this.watchers = new Set();
    this.banned = new Set();
    this.phase = 'lobby';
    this.qi = -1;
    this.answers = new Map();
    this.locked = false;
    this.timers = [];
    this.tickInt = null;
    this.lastEmote = new Map();
    this.liveOpen = false;
    this.joinSeq = 0;
    if (snap) this.restore(snap);

    link.h.onConnect = (c) => this.onConnect(c);
    link.h.onData = (c, m) => this.onData(c, m);
    link.h.onClose = (c) => this.onClose(c);
    link.h.onStatus = (s) => {
      const pill = $('#net-status');
      if (pill) pill.textContent = s === 'online' ? '● Dalam talian' : '● Menyambung semula...';
    };

    this.onBeforeUnload = (e) => {
      if (this.phase !== 'final' && this.players.size) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', this.onBeforeUnload);
    document.addEventListener('click', this.liveHandler = (e) => {
      const t = e.target.closest('[data-action="live"]');
      if (t) this.toggleLive();
    });
    document.body.dataset.awake = '1';
    keepAwake(true);
  }

  // ------------------------------------------------------------ kitaran hidup
  enter() {
    if (this.phase === 'lobby') this.showLobby();
    else if (this.phase === 'final') this.finish();
    else this.showBoard(true);
  }

  destroy() {
    for (const t of this.timers) clearTimeout(t);
    clearInterval(this.tickInt);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
    document.removeEventListener('click', this.liveHandler);
    $('#live-drawer').classList.remove('open');
    this.link.broadcast({ t: 'ended' });
    setTimeout(() => this.link.close(), 300);
    keepAwake(false);
    if (this.app.stage) this.app.stage.unmount();
  }

  later(fn, ms) {
    const t = setTimeout(fn, ms);
    this.timers.push(t);
    return t;
  }

  clearLater() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  save() {
    if (this.phase === 'final') { store.del(SESSION_KEY); return; }
    const players = [...this.players.values()].map((p) => ({
      pid: p.pid, token: p.token, name: p.name, avatar: p.avatar, score: p.score, streak: p.streak,
      correctCount: p.correctCount, totalMs: p.totalMs, rank: p.rank, joinSeq: p.joinSeq, last: p.last,
    }));
    store.set(SESSION_KEY, {
      pin: this.pin, quiz: this.quiz, settings: this.settings, phase: this.phase, qi: this.qi, savedAt: Date.now(),
      players, banned: [...this.banned],
    });
  }

  restore(snap) {
    for (const p of snap.players) this.players.set(p.pid, { ...p, conn: null, online: false, avatar: sanitizeAvatar(p.avatar) });
    this.joinSeq = snap.players.reduce((m, p) => Math.max(m, p.joinSeq || 0), 0);
    this.banned = new Set(snap.banned || []);
    this.qi = snap.qi;
    if (snap.phase === 'lobby') this.phase = 'lobby';
    else if (snap.phase === 'intro' || snap.phase === 'question') {
      // Soalan tergendala diulang semula selepas papan markah.
      this.qi = snap.qi - 1;
      this.phase = 'scoreboard';
    } else this.phase = 'scoreboard';
  }

  // ------------------------------------------------------------ mesej rangkaian
  onConnect() { /* tunggu mesej hello/join */ }

  onClose(conn) {
    const pid = this.byConn.get(conn);
    this.watchers.delete(conn);
    if (!pid) return;
    this.byConn.delete(conn);
    const p = this.players.get(pid);
    if (!p || p.conn !== conn) return;
    p.conn = null;
    p.online = false;
    if (this.phase === 'lobby') {
      // Beri masa untuk sambung semula (contoh: telefon ditutup sekejap)
      this.later(() => {
        if (!p.online && this.phase === 'lobby' && this.players.get(pid) === p) {
          this.players.delete(pid);
          this.renderLobby();
          this.pushWatch();
          this.save();
        }
      }, 45000);
      this.renderLobby();
    }
    this.renderLive();
    this.pushWatch();
    if (this.phase === 'question') this.checkAllAnswered();
  }

  send(p, msg) { if (p && p.conn) this.link.send(p.conn, msg); }

  onData(conn, m) {
    if (m.t === 'hello') {
      this.link.send(conn, { t: 'hi', title: this.quiz.title, phase: this.phase, count: this.players.size });
      return;
    }
    if (m.t === 'watch') {
      this.watchers.add(conn);
      this.pushWatch(conn);
      return;
    }
    if (m.t === 'join') { this.onJoin(conn, m); return; }
    const pid = this.byConn.get(conn);
    const p = pid && this.players.get(pid);
    if (!p) return;
    switch (m.t) {
      case 'ans': this.onAnswer(p, m); break;
      case 'emote': this.onEmote(p, m); break;
      case 'avatar':
        if (this.phase !== 'lobby') return;
        p.avatar = sanitizeAvatar(m.avatar);
        this.send(p, { t: 'avatar-ok', avatar: p.avatar });
        this.renderLobby();
        this.pushWatch();
        this.save();
        break;
      case 'leave':
        if (this.phase === 'lobby') {
          this.players.delete(p.pid);
          this.byConn.delete(conn);
          this.renderLobby();
          this.pushWatch();
          this.save();
        }
        break;
      default:
    }
  }

  onJoin(conn, m) {
    const pid = typeof m.pid === 'string' ? m.pid.slice(0, 40) : '';
    const token = typeof m.token === 'string' ? m.token.slice(0, 60) : '';
    if (!pid || !token) { this.link.send(conn, { t: 'reject', reason: 'token' }); return; }
    if (this.banned.has(pid)) { this.link.send(conn, { t: 'reject', reason: 'banned' }); return; }
    const existing = this.players.get(pid);
    if (existing) {
      if (existing.token !== token) { this.link.send(conn, { t: 'reject', reason: 'token' }); return; }
      if (existing.conn && existing.conn !== conn) { this.byConn.delete(existing.conn); try { existing.conn.close(); } catch (e) { /* abaikan */ } }
      existing.conn = conn;
      existing.online = true;
      this.byConn.set(conn, pid);
      this.welcome(existing);
      this.renderLobby();
      this.renderLive();
      this.pushWatch();
      return;
    }
    if (this.locked) { this.link.send(conn, { t: 'reject', reason: 'locked' }); return; }
    if (this.phase !== 'lobby' && !this.settings.late) { this.link.send(conn, { t: 'reject', reason: 'started' }); return; }
    if (this.phase === 'final') { this.link.send(conn, { t: 'reject', reason: 'started' }); return; }
    if (this.players.size >= MAX_PLAYERS) { this.link.send(conn, { t: 'reject', reason: 'full' }); return; }
    const name = cleanName(m.name);
    if (!name) { this.link.send(conn, { t: 'reject', reason: 'name' }); return; }
    const lower = name.toLowerCase();
    for (const o of this.players.values()) if (o.name.toLowerCase() === lower) { this.link.send(conn, { t: 'reject', reason: 'nametaken' }); return; }
    const p = {
      pid, token, name, avatar: sanitizeAvatar(m.avatar), score: 0, streak: 0, correctCount: 0, totalMs: 0,
      rank: this.players.size + 1, prevRank: this.players.size + 1, conn, online: true, joinSeq: ++this.joinSeq, last: null,
    };
    this.players.set(pid, p);
    this.byConn.set(conn, pid);
    this.welcome(p);
    sfx.join();
    this.renderLobby();
    this.renderLive();
    this.pushWatch();
    this.save();
  }

  welcome(p) {
    this.send(p, { t: 'welcome', pid: p.pid, token: p.token, name: p.name, avatar: p.avatar, score: p.score, phase: this.phase });
    const q = this.quiz.questions[this.qi];
    if (this.phase === 'intro' && q) this.send(p, this.introMsg(q, Math.max(500, this.introEnds - performance.now())));
    else if (this.phase === 'question' && q) {
      const a = this.answers.get(p.pid);
      this.send(p, { ...this.openMsg(q), elapsed: Math.round(performance.now() - this.openAt), answered: a ? a.c : -1 });
    } else if ((this.phase === 'reveal' || this.phase === 'scoreboard') && p.last && p.last.i === this.qi) {
      this.send(p, p.last);
    } else if (this.phase === 'final') {
      this.send(p, this.finalMsg(p));
    }
  }

  onEmote(p, m) {
    if (this.phase !== 'lobby') return;
    const allowed = ['jump', 'wave', 'dance', 'spin'];
    if (!allowed.includes(m.e)) return;
    const now = Date.now();
    if (now - (this.lastEmote.get(p.pid) || 0) < 700) return;
    this.lastEmote.set(p.pid, now);
    if (this.app.stage && this.app.stage.mode === 'crowd') this.app.stage.crowdEmote(p.pid, m.e);
    sfx.pop();
  }

  // ------------------------------------------------------------ lobi
  showLobby() {
    this.phase = 'lobby';
    show('scr-h-lobby');
    const url = joinURL(this.pin);
    const pretty = url.replace(/^https?:\/\//, '').replace(/\?.*$/, '');
    $('#lobby-url').textContent = pretty;
    $('#lobby-pin').textContent = this.pin.replace(/(\d{3})(\d{3})/, '$1 $2');
    const qrBox = clear($('#lobby-qr'));
    const qr = qrSVG(url);
    if (qr) qrBox.append(qr);
    $('#lobby-quiz').textContent = `${this.quiz.title} • ${this.quiz.questions.length} soalan`;
    $('#lobby-start').onclick = () => this.startGame();
    $('#lobby-cancel').onclick = () => {
      if (this.players.size && !confirm('Batalkan permainan ini? Semua pemain akan dikeluarkan.')) return;
      store.del(SESSION_KEY);
      this.app.cleanup = null;
      this.destroy();
      startHost(this.app);
    };
    $('#lobby-lock').onclick = () => {
      this.locked = !this.locked;
      $('#lobby-lock').textContent = this.locked ? 'Buka kunci bilik' : 'Kunci bilik';
      toast(this.locked ? 'Bilik dikunci. Pemain baru tidak boleh masuk.' : 'Bilik dibuka semula.');
    };
    $('#lobby-watch').onclick = async () => {
      const w = watchURL(this.pin);
      try { await navigator.clipboard.writeText(w); toast('Pautan penonton disalin. Buka di skrin lain untuk papan markah langsung.', 'ok', 4000); } catch (e) { prompt('Salin pautan penonton:', w); }
    };
    const stage = this.app.getStage();
    if (stage) {
      stage.mount($('#lobby-stage'));
      stage.showCrowd();
    }
    this.renderLobby();
    this.save();
  }

  renderLobby() {
    if (this.phase !== 'lobby' || document.body.dataset.screen !== 'scr-h-lobby') return;
    const players = [...this.players.values()].sort((a, b) => a.joinSeq - b.joinSeq);
    $('#lobby-count').textContent = players.length;
    $('#lobby-empty').hidden = players.length > 0;
    $('#lobby-start').disabled = players.length === 0;
    const list = clear($('#lobby-list'));
    for (const p of players.slice().reverse()) {
      list.append(el('button', { class: 'player-chip' + (p.online ? '' : ' offline'), type: 'button', title: 'Ketik untuk keluarkan', onclick: () => this.kick(p) },
        this.app.portrait(p.avatar, p.name), el('span', null, p.name), el('span', { class: 'x' }, p.online ? '✕' : 'luar talian')));
    }
    const stage = this.app.stage;
    if (stage && stage.mode === 'crowd') stage.syncCrowd(players.filter((p) => p.online).map((p) => ({ pid: p.pid, name: p.name, avatar: p.avatar })));
  }

  kick(p) {
    if (!confirm(`Keluarkan ${p.name} daripada permainan?`)) return;
    this.banned.add(p.pid);
    this.send(p, { t: 'kicked' });
    const c = p.conn;
    setTimeout(() => { try { c && c.close(); } catch (e) { /* abaikan */ } }, 400);
    this.players.delete(p.pid);
    if (c) this.byConn.delete(c);
    this.renderLobby();
    this.renderLive();
    this.pushWatch();
    this.save();
  }

  // ------------------------------------------------------------ aliran soalan
  startGame() {
    if (!this.players.size) { toast('Belum ada pemain.', 'bad'); return; }
    sfx.start();
    if (this.app.stage) this.app.stage.unmount();
    this.qi = -1;
    this.nextQuestion();
  }

  introMsg(q, introMs) {
    const dev = this.settings.device;
    return { t: 'qintro', i: this.qi, n: this.quiz.questions.length, text: dev ? q.text : '', ar: dev ? q.ar || '' : '', introMs: Math.round(introMs), points: q.points };
  }

  openMsg(q) {
    const dev = this.settings.device;
    return { t: 'qopen', i: this.qi, n: this.quiz.questions.length, count: q.choices.length, choices: dev ? q.choices : null, text: dev ? q.text : '', ar: dev ? q.ar || '' : '', time: q.time };
  }

  nextQuestion() {
    this.clearLater();
    this.qi += 1;
    if (this.qi >= this.quiz.questions.length) { this.finish(); return; }
    const q = this.quiz.questions[this.qi];
    this.phase = 'intro';
    this.answers = new Map();
    const introMs = Math.min(6000, Math.max(3000, 1600 + (q.text || '').length * 45));
    this.introEnds = performance.now() + introMs;
    show('scr-h-intro');
    const n = this.quiz.questions.length;
    $('#hi-num').textContent = `Soalan ${this.qi + 1}/${n}`;
    $('#hi-pin').textContent = `PIN ${this.pin}`;
    $('#hi-label').textContent = `Soalan ${this.qi + 1} daripada ${n}`;
    const qt = clear($('#hi-text'));
    qt.append(q.text || '');
    const extra = clear($('#hi-extra'));
    if (q.ar) extra.append(el('div', { class: 'ar-glyph' }, q.ar));
    if (q.points === 2) extra.append(el('div', { class: 'double-badge' }, 'MATA BERGANDA'));
    if (q.points === 0) extra.append(el('div', { class: 'double-badge' }, 'Soalan latihan (tiada mata)'));
    const bar = $('#hi-bar');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = `transform ${introMs / 1000}s linear`; bar.style.transform = 'scaleX(0)'; }));
    for (const p of this.players.values()) this.send(p, this.introMsg(q, introMs));
    this.pushWatch();
    this.save();
    this.later(() => this.openQuestion(), introMs);
  }

  openQuestion() {
    const q = this.quiz.questions[this.qi];
    this.phase = 'question';
    this.endingSoon = false;
    this.openAt = performance.now();
    this.deadline = this.openAt + q.time * 1000;
    show('scr-h-question');
    $('#hq-text').textContent = q.text || 'Pilih jawapan yang betul';
    $('#hq-num').textContent = `Soalan ${this.qi + 1}/${this.quiz.questions.length}`;
    $('#hq-pin').textContent = `PIN ${this.pin}`;
    $('#hq-answers').textContent = '0';
    $('#hq-skip').hidden = false;
    $('#hq-next').hidden = true;
    $('#hq-timer').hidden = false;
    $('#hq-count').hidden = false;
    const media = clear($('#hq-media'));
    if (q.image) media.append(el('img', { class: 'qimg', src: q.image, alt: '', referrerpolicy: 'no-referrer' }));
    if (q.ar) media.append(el('div', { class: 'ar-glyph' }, q.ar));
    media.append(el('div', { class: 'answered-strip', id: 'hq-strip' }));
    const grid = clear($('#hq-answers-grid'));
    q.choices.forEach((c, i) => grid.append(el('div', { class: `h-ans ${ANSWER_META[i].cls}` }, shapeSVG(i), el('span', { class: hasArabic(c) ? 'ar' : '' }, c))));
    for (const p of this.players.values()) this.send(p, this.openMsg(q));
    $('#hq-skip').onclick = () => this.endQuestion();
    const ring = $('#hq-ring');
    const C = 2 * Math.PI * 47;
    ring.style.strokeDasharray = String(C);
    let lastSec = -1;
    clearInterval(this.tickInt);
    this.tickInt = setInterval(() => {
      const left = Math.max(0, (this.deadline - performance.now()) / 1000);
      const sec = Math.ceil(left);
      $('#hq-secs').textContent = sec;
      ring.style.strokeDashoffset = String(C * (1 - left / q.time));
      if (sec !== lastSec && sec <= 5 && sec > 0) sfx.tick();
      lastSec = sec;
      if (left <= 0) {
        clearInterval(this.tickInt);
        this.later(() => this.endQuestion(), 350); // tempoh ihsan untuk jawapan dalam perjalanan
      }
    }, 100);
    this.renderLive();
    this.pushWatch();
  }

  onAnswer(p, m) {
    if (this.phase !== 'question' || m.q !== this.qi || this.answers.has(p.pid)) {
      if (m.q === this.qi && this.answers.has(p.pid)) this.send(p, { t: 'ack', i: this.qi });
      return;
    }
    const q = this.quiz.questions[this.qi];
    const c = Number(m.c);
    if (!Number.isInteger(c) || c < 0 || c >= q.choices.length) return;
    const hostMs = performance.now() - this.openAt;
    if (hostMs > q.time * 1000 + 600) return;
    let ms = Number(m.ms);
    if (!Number.isFinite(ms)) ms = hostMs;
    // Masa pelanggan diterima tetapi dihadkan oleh masa yang dilihat hos (elak tipu, adil untuk rangkaian lambat).
    ms = Math.min(Math.max(ms, hostMs - 2500, 0), hostMs, q.time * 1000);
    this.answers.set(p.pid, { c, ms });
    this.send(p, { t: 'ack', i: this.qi });
    $('#hq-answers').textContent = String(this.answers.size);
    const strip = $('#hq-strip');
    if (strip && strip.children.length < 40) strip.append(this.app.portrait(p.avatar, p.name));
    this.renderLive();
    this.pushWatch();
    this.checkAllAnswered();
  }

  checkAllAnswered() {
    if (this.phase !== 'question') return;
    const online = [...this.players.values()].filter((p) => p.online);
    if (online.length && online.every((p) => this.answers.has(p.pid)) && !this.endingSoon) {
      this.endingSoon = true;
      this.later(() => { this.endingSoon = false; this.endQuestion(); }, 500);
    }
  }

  endQuestion() {
    if (this.phase !== 'question') return;
    clearInterval(this.tickInt);
    this.clearLater();
    this.phase = 'reveal';
    const q = this.quiz.questions[this.qi];
    sfx.timeup();
    const n = this.quiz.questions.length;
    const base = 1000 * q.points;
    const players = [...this.players.values()];
    for (const p of players) p.prevRank = p.rank;
    for (const p of players) {
      const a = this.answers.get(p.pid);
      const correct = !!a && a.c === q.correct;
      let points = 0, bonus = 0;
      const prevStreak = p.streak;
      if (correct) {
        p.streak += 1;
        p.correctCount += 1;
        p.totalMs += a.ms;
        if (base > 0) {
          points = Math.round(base * (1 - Math.min(1, a.ms / (q.time * 1000)) / 2));
          bonus = p.streak >= 2 ? Math.min(500, (p.streak - 1) * 100) : 0;
        }
      } else {
        p.streak = 0;
      }
      p.delta = points + bonus;
      p.score += p.delta;
      p.last = { t: 'result', i: this.qi, n, correct, choice: a ? a.c : -1, points: points + bonus, bonus, streak: p.streak, lostStreak: !correct && prevStreak >= 2, total: p.score, correctText: q.choices[q.correct] };
    }
    this.rank();
    const sorted = this.sorted();
    for (const p of sorted) {
      const above = sorted[p.rank - 2];
      p.last.rank = p.rank;
      p.last.of = sorted.length;
      p.last.behind = above && above.score > p.score ? { name: above.name, gap: above.score - p.score } : null;
      this.send(p, p.last);
    }
    this.renderReveal(q);
    this.renderLive();
    this.pushWatch();
    this.save();
    const top = this.topList(5);
    for (const p of this.players.values()) this.send(p, { t: 'board', top });
    if (this.settings.auto) this.later(() => this.afterReveal(), 6000);
  }

  rank() {
    const sorted = this.sorted();
    sorted.forEach((p, i) => { p.rank = i + 1; });
  }

  sorted() {
    return [...this.players.values()].sort((a, b) => b.score - a.score || a.totalMs - b.totalMs || a.joinSeq - b.joinSeq);
  }

  topList(k) {
    return this.sorted().slice(0, k).map((p) => ({ rank: p.rank, name: p.name, score: p.score, pid: p.pid }));
  }

  renderReveal(q) {
    $('#hq-skip').hidden = true;
    $('#hq-next').hidden = false;
    $('#hq-timer').hidden = true;
    $('#hq-count').hidden = true;
    const isLast = this.qi >= this.quiz.questions.length - 1;
    $('#hq-next').textContent = isLast ? 'Lihat pemenang' : 'Seterusnya';
    $('#hq-next').onclick = () => this.afterReveal();
    const counts = q.choices.map(() => 0);
    for (const a of this.answers.values()) counts[a.c] += 1;
    const max = Math.max(1, ...counts);
    const media = clear($('#hq-media'));
    const dist = el('div', { class: 'dist' });
    counts.forEach((cnt, i) => {
      const bar = el('div', { class: `bar ${ANSWER_META[i].cls}`, style: { height: '0%' } });
      dist.append(el('div', { class: 'col' + (i === q.correct ? '' : ' dim') }, el('div', { class: 'lab' }, String(cnt), i === q.correct ? '✔' : ''), bar, el('div', { class: 'lab' }, shapeSVG(i))));
      requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.height = `${Math.max(3, (cnt / max) * 100)}%`; }));
    });
    media.append(dist);
    const fastest = [...this.answers.entries()].filter(([, a]) => a.c === q.correct).sort((a, b) => a[1].ms - b[1].ms).slice(0, 3);
    if (fastest.length) {
      const row = el('div', { class: 'fastest' }, 'Terpantas: ');
      for (const [pid, a] of fastest) {
        const p = this.players.get(pid);
        if (p) row.append(this.app.portrait(p.avatar, p.name), `${p.name} (${(a.ms / 1000).toFixed(1)}s)`);
      }
      media.append(row);
    }
    $$('#hq-answers-grid .h-ans').forEach((tile, i) => {
      tile.classList.toggle('dim', i !== q.correct);
      tile.classList.toggle('win', i === q.correct);
      if (i === q.correct) tile.append(el('span', { class: 'tick' }, '✔'));
    });
  }

  afterReveal() {
    this.clearLater();
    if (this.qi >= this.quiz.questions.length - 1) this.finish();
    else this.showBoard();
  }

  showBoard(resumed = false) {
    this.phase = 'scoreboard';
    show('scr-h-board');
    const n = this.quiz.questions.length;
    $('#hb-num').textContent = resumed ? `Disambung semula • ${this.qi + 1}/${n} soalan selesai` : `Selepas soalan ${this.qi + 1}/${n}`;
    $('#hb-next').textContent = this.qi + 1 >= n ? 'Lihat pemenang' : 'Soalan seterusnya';
    $('#hb-next').onclick = () => { this.clearLater(); this.nextQuestion(); };
    const board = clear($('#hb-board'));
    const top = this.sorted().slice(0, 5);
    const rowH = 76;
    top.forEach((p, i) => {
      const prevScore = p.score - (p.delta || 0);
      const moved = this.qi === 0 ? 0 : (p.prevRank || p.rank) - p.rank; // soalan pertama: semua bermula sama
      const scoreEl = el('span', { class: 'sc' }, fmt(prevScore));
      const row = el('div', { class: 'board-row' + (i === 0 ? ' first' : '') },
        el('span', { class: 'rk' }, String(p.rank)),
        this.app.portrait(p.avatar, p.name),
        el('span', { class: 'nm' }, p.name),
        el('span', { class: 'mv ' + (moved > 0 ? 'up' : moved < 0 ? 'down' : '') }, moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : ''),
        scoreEl);
      // animasi FLIP: mula dari kedudukan lama (jika dalam 5 teratas) dan gelongsor ke kedudukan baru
      const prevIdx = Math.min(5, (p.prevRank || p.rank) - 1);
      row.style.transform = `translateY(${(prevIdx - i) * rowH}px)`;
      board.append(row);
      requestAnimationFrame(() => requestAnimationFrame(() => { row.style.transform = 'none'; }));
      countUp(scoreEl, prevScore, p.score, 1100);
    });
    if (!resumed) for (const p of this.players.values()) this.send(p, { t: 'board', top: this.topList(5) });
    this.renderLive();
    this.pushWatch();
    this.save();
    if (this.settings.auto && !resumed) this.later(() => this.nextQuestion(), 6000);
  }

  // ------------------------------------------------------------ penamat
  finalMsg(p) {
    return { t: 'final', rank: p.rank, of: this.players.size, total: p.score, correctCount: p.correctCount, n: this.quiz.questions.length, top: this.topList(5) };
  }

  finish() {
    this.clearLater();
    clearInterval(this.tickInt);
    this.phase = 'final';
    this.rank();
    for (const p of this.players.values()) this.send(p, this.finalMsg(p));
    this.pushWatch();
    store.del(SESSION_KEY);
    const rows = this.resultRows();
    const hist = store.get(HISTORY_KEY, []);
    hist.push({ title: this.quiz.title, date: new Date().toISOString(), pin: this.pin, n: this.quiz.questions.length, rows });
    store.set(HISTORY_KEY, hist.slice(-20));

    show('scr-h-podium');
    $('#hp-quiz').textContent = this.quiz.title;
    $('#hp-title').textContent = 'Juara Kuiz!';
    const top3 = this.sorted().slice(0, 3);
    const tags = clear($('#podium-tags'));
    const stage = this.app.getStage();
    const reveal = (rank) => {
      const p = top3[rank - 1];
      if (!p) return;
      if (stage) stage.revealPodium(rank);
      const tag = el('div', { class: 'podium-tag' }, el('div', { class: 'nm' }, p.name), el('div', { class: 'sc' }, `${fmt(p.score)} mata`));
      tags.append(tag);
      if (stage) stage.attachTag(tag, rank);
      else tag.style.cssText += `left:${rank === 1 ? 50 : rank === 2 ? 25 : 75}%;top:${rank === 1 ? 20 : rank === 2 ? 34 : 44}%`;
      if (rank === 1) { sfx.fanfare(); } else sfx.pop();
    };
    if (stage) {
      stage.mount($('#podium-stage'));
      stage.showPodium(top3.map((p) => ({ name: p.name, score: p.score, avatar: p.avatar })));
    } else {
      const box = clear($('#podium-stage'));
      const row = el('div', { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '16px', height: '100%', paddingBottom: '20px' } });
      [2, 1, 3].forEach((r) => {
        const p = top3[r - 1];
        if (!p) return;
        row.append(el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' } },
          this.app.portrait(p.avatar, p.name, 'lg'),
          el('div', { style: { width: '120px', height: `${r === 1 ? 180 : r === 2 ? 130 : 90}px`, background: r === 1 ? 'var(--gold)' : r === 2 ? 'var(--silver)' : 'var(--bronze)', borderRadius: '10px 10px 0 0', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-head)', fontSize: '48px', color: '#3a2a00' } }, String(r))));
      });
      box.append(row);
    }
    this.later(() => reveal(3), 900);
    this.later(() => reveal(2), 2600);
    this.later(() => sfx.drum(1.8), 3600);
    this.later(() => reveal(1), 5600);

    $('#hp-results').onclick = () => this.showResults(rows);
    $('#hp-csv').onclick = () => download(`keputusan-${this.quiz.title.replace(/[^\w-]+/g, '_')}.csv`, toCSV(rows, this.quiz.questions.length), 'text/csv');
    $('#hp-again').onclick = () => this.playAgain();
    $('#hp-done').onclick = () => {
      this.app.cleanup = null;
      this.destroy();
      startHost(this.app);
    };
  }

  resultRows() {
    return this.sorted().map((p) => ({
      rank: p.rank, name: p.name, score: p.score, correct: p.correctCount,
      avg: p.correctCount ? (p.totalMs / p.correctCount / 1000).toFixed(1) : '-',
    }));
  }

  showResults(rows) {
    const modal = el('div', { class: 'modal', onclick: (e) => { if (e.target === modal) modal.remove(); } });
    const tbody = el('tbody', null, rows.map((r) => el('tr', null, el('td', null, String(r.rank)), el('td', null, r.name), el('td', null, fmt(r.score)), el('td', null, `${r.correct}/${this.quiz.questions.length}`), el('td', null, r.avg))));
    modal.append(el('div', { class: 'card' },
      el('h2', null, `Keputusan: ${this.quiz.title}`),
      el('div', { class: 'table-wrap' }, el('table', { class: 'results' },
        el('thead', null, el('tr', null, ['#', 'Nama', 'Markah', 'Betul', 'Purata masa (s)'].map((h) => el('th', null, h)))), tbody)),
      el('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } },
        el('button', { class: 'btn small', onclick: () => download(`keputusan-${this.quiz.title.replace(/[^\w-]+/g, '_')}.csv`, toCSV(rows, this.quiz.questions.length), 'text/csv') }, 'Muat turun CSV'),
        el('button', { class: 'btn small primary', onclick: () => modal.remove() }, 'Tutup'))));
    document.body.append(modal);
  }

  playAgain() {
    this.clearLater();
    for (const [pid, p] of this.players) {
      if (!p.online) { this.players.delete(pid); continue; }
      Object.assign(p, { score: 0, streak: 0, correctCount: 0, totalMs: 0, delta: 0, last: null, rank: 1, prevRank: 1 });
    }
    this.quiz = { ...this.sourceQuiz, questions: this.settings.shuffle ? shuffle(this.sourceQuiz.questions) : this.sourceQuiz.questions.slice() };
    this.qi = -1;
    for (const p of this.players.values()) this.send(p, { t: 'welcome', pid: p.pid, token: p.token, name: p.name, avatar: p.avatar, score: 0, phase: 'lobby' });
    this.showLobby();
    this.pushWatch();
  }

  // ------------------------------------------------------------ papan markah langsung (hos + penonton)
  toggleLive() {
    this.liveOpen = !this.liveOpen;
    $('#live-drawer').classList.toggle('open', this.liveOpen);
    this.renderLive();
  }

  renderLive() {
    if (!this.liveOpen) return;
    const list = clear($('#live-list'));
    for (const p of this.sorted()) {
      const answered = this.phase === 'question' && this.answers.has(p.pid);
      list.append(el('div', { class: 'live-row' },
        el('span', { class: 'rk' }, String(p.rank)),
        this.app.portrait(p.avatar, p.name),
        el('span', { class: 'nm' }, p.name + (p.online ? '' : ' (luar talian)')),
        answered ? el('span', { class: 'ok', title: 'Sudah jawab' }, '✔') : null,
        el('span', null, fmt(p.score))));
    }
  }

  pushWatch(only) {
    if (!only && !this.watchers.size) return;
    const send = () => {
      this.watchPending = null;
      const players = this.sorted().map((p) => ({ pid: p.pid, name: p.name, avatar: p.avatar, score: p.score, rank: p.rank, delta: p.delta || 0, streak: p.streak, online: p.online, answered: this.phase === 'question' && this.answers.has(p.pid) }));
      const msg = { t: 'wstate', title: this.quiz.title, pin: this.pin, phase: this.phase, qi: this.qi, n: this.quiz.questions.length, answered: this.answers.size, players };
      if (only) this.link.send(only, msg);
      else for (const w of this.watchers) this.link.send(w, msg);
    };
    if (only) { send(); return; }
    if (!this.watchPending) this.watchPending = setTimeout(send, 250);
  }
}

function countUp(node, from, to, ms) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    node.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
