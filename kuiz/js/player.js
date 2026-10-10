// Aliran pemain (telefon murid): sambung -> cipta karakter -> lobi -> jawab soalan -> keputusan.
import { $, $$, el, clear, show, sfx, store, randomId, shapeSVG, ANSWER_META, confetti, keepAwake, fmt, ordinal, cleanName } from './ui.js';
import { ClientLink } from './net.js';
import { sanitizeAvatar, randomAvatar, DEFAULT_AVATAR } from './avatar-config.js';
import { mountCreator } from './creator.js';
import { hasArabic } from './quizzes.js';

function buzz(pattern) {
  try {
    const ua = navigator.userActivation;
    if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(pattern);
  } catch (e) { /* abaikan */ }
}

export async function startPlayer(app, pin) {
  show('scr-loading');
  $('#loading-text').textContent = 'Mencari permainan...';
  $('#loading-sub').textContent = `PIN ${pin}`;
  const g3d = await app.load3D();

  const profile = store.get('kh.profile', null) || { name: '', avatar: randomAvatar() };
  const sessKey = 'kh.sess.' + pin;
  let sess = store.sget(sessKey, null); // {pid, token, name, avatar} untuk sambung semula
  let joined = false;
  let phase = 'connecting';
  let creatorOpen = false;
  let current = { i: -1, n: 0, choices: [], answered: -1, openAt: 0, time: 20, score: 0, lastResult: null };
  let timerInt = null;
  let ackTimer = null;
  let lastEmote = 0;
  let resultTimeout = null;

  const me = () => ({ name: (sess && sess.name) || profile.name, avatar: (sess && sess.avatar) || profile.avatar });

  // ---------------------------------------------------------- 3D bantuan
  const stage = app.getStage();
  function stageInto(id, expr, anim) {
    const box = $('#' + id);
    if (!stage || !box) {
      if (box && !box.firstChild) box.append(app.portrait(me().avatar, me().name, 'lg'));
      return null;
    }
    stage.mount(box);
    const av = stage.showSolo(me().avatar, { zoom: 'full', pedestal: true });
    av.setBaseExpression(expr || 'normal');
    if (anim) av.play(anim, anim === 'celebrate' || anim === 'dance' ? Infinity : undefined);
    else av.stop();
    stage.onTap = () => { const a = stage.soloAvatar(); if (a) a.play('jump'); sendEmote('jump'); };
    return av;
  }

  // ---------------------------------------------------------- rangkaian
  const link = new ClientLink(pin, {
    onOpen() {
      if (sess && sess.pid) {
        link.send({ t: 'join', role: 'player', pid: sess.pid, token: sess.token, name: sess.name, avatar: sess.avatar });
      } else {
        link.send({ t: 'hello', role: 'player' });
      }
    },
    onData: handle,
    onStatus(s) {
      const ov = $('#reconnect');
      if (s === 'connected') { ov.hidden = true; return; }
      if (s === 'connecting') { return; }
      if (phase === 'final') { ov.hidden = true; return; }
      if (s === 'reconnecting') {
        if (joined || phase !== 'connecting') {
          ov.hidden = false;
          $('#reconnect-text').textContent = 'Menyambung semula...';
          $('#reconnect-sub').textContent = 'Jangan tutup halaman ini. Markah anda selamat.';
        }
        return;
      }
      ov.hidden = true;
      if (s === 'notfound') {
        if (joined) app.error('Permainan tamat', 'Skrin hos sudah ditutup atau permainan tamat.');
        else app.home(`Tiada permainan dengan PIN ${pin}. Semak semula PIN di skrin cikgu.`);
      } else if (s === 'failed') {
        app.error('Tidak dapat bersambung', 'Semak sambungan internet anda dan cuba lagi. Jika guna WiFi sekolah, cuba data telefon.');
      }
    },
  });
  link.connect();
  document.body.dataset.awake = '1';
  keepAwake(true);

  app.cleanup = () => {
    clearInterval(timerInt);
    clearTimeout(ackTimer);
    clearTimeout(resultTimeout);
    $('#reconnect').hidden = true;
    link.send({ t: 'leave' });
    link.close();
    keepAwake(false);
  };

  function handle(msg) {
    switch (msg.t) {
      case 'hi':
        phase = 'create';
        if (!joined) openCreator(msg);
        break;
      case 'welcome':
        joined = true;
        sess = { pid: msg.pid, token: msg.token || (sess && sess.token), name: msg.name, avatar: sanitizeAvatar(msg.avatar) };
        store.sset(sessKey, sess);
        store.set('kh.profile', { name: msg.name, avatar: sess.avatar });
        current.score = msg.score || 0;
        link.markStable();
        creatorOpen = false;
        if (msg.phase === 'lobby' || !msg.phase) showLobby();
        else showLobby(true); // permainan sedang berjalan: hos akan hantar soalan/keputusan seterusnya
        break;
      case 'reject':
        onReject(msg);
        break;
      case 'phase':
        if (msg.phase === 'lobby' && joined) showLobby();
        break;
      case 'qintro':
        showIntro(msg);
        break;
      case 'qopen':
        showAnswer(msg);
        break;
      case 'ack':
        clearTimeout(ackTimer);
        break;
      case 'result':
        showResult(msg);
        break;
      case 'board':
        renderMiniBoard(msg.top, $('#pf-board'));
        break;
      case 'final':
        showFinal(msg);
        break;
      case 'avatar-ok':
        sess.avatar = sanitizeAvatar(msg.avatar);
        store.sset(sessKey, sess);
        store.set('kh.profile', { name: sess.name, avatar: sess.avatar });
        showLobby();
        break;
      case 'kicked':
        store.sset(sessKey, null);
        joined = false;
        link.close();
        app.error('Anda telah dikeluarkan', 'Hos telah mengeluarkan anda daripada permainan ini.');
        break;
      case 'ended':
        store.sset(sessKey, null);
        link.close();
        if (phase !== 'final') app.error('Permainan dibatalkan', 'Hos telah menutup permainan ini.');
        break;
      default:
    }
  }

  function onReject(msg) {
    const reasons = {
      name: 'Nama tidak sesuai. Sila guna nama lain.',
      nametaken: 'Nama ini sudah digunakan. Cuba tambah huruf atau nombor.',
      full: 'Bilik permainan sudah penuh.',
      started: 'Permainan sudah bermula dan hos tidak benarkan masuk lewat.',
      locked: 'Hos telah mengunci bilik permainan.',
      token: 'Sesi lama tidak sah. Sila masuk semula.',
      banned: 'Anda tidak dibenarkan masuk semula ke permainan ini.',
    };
    const text = reasons[msg.reason] || 'Tidak dapat masuk.';
    if (msg.reason === 'token') { store.sset(sessKey, null); sess = null; link.send({ t: 'hello', role: 'player' }); return; }
    if (msg.reason === 'name' || msg.reason === 'nametaken') {
      if (!creatorOpen) openCreator({});
      $('#create-error').textContent = text;
      $('#name-input').focus();
      $('#btn-join').disabled = false;
      return;
    }
    link.close();
    app.error('Tidak dapat masuk', text);
  }

  // ---------------------------------------------------------- pencipta karakter
  function openCreator(info, editing = false) {
    creatorOpen = true;
    show('scr-p-create');
    $('#create-pin').textContent = `PIN ${pin}`;
    $('#create-error').textContent = '';
    const nameIn = $('#name-input');
    nameIn.value = me().name || '';
    nameIn.disabled = editing;
    const joinBtn = $('#btn-join');
    joinBtn.textContent = editing ? 'Simpan karakter' : 'Masuk permainan';
    joinBtn.disabled = false;
    let draft = sanitizeAvatar(me().avatar || DEFAULT_AVATAR);
    let av = null;
    if (stage) {
      stage.mount($('#create-stage'));
      av = stage.showSolo(draft, { zoom: 'face' });
      av.stop();
      stage.onTap = () => stage.soloAvatar() && stage.soloAvatar().play('jump');
    } else {
      clear($('#create-stage')).append(el('div', { class: 'empty-lobby' }, 'Pratonton 3D tidak disokong peranti ini, tetapi pilihan anda tetap disimpan.'));
    }
    const creator = mountCreator({
      tabsEl: $('#creator-tabs'),
      bodyEl: $('#creator-body'),
      initial: draft,
      onChange(a) {
        draft = a;
        if (stage) {
          const nav = stage.showSolo(a);
          nav.play('nod');
        }
        store.set('kh.profile', { name: nameIn.value || profile.name, avatar: a });
      },
      onZoom(z) { stage && stage.setZoom(z); },
    });
    $('#btn-random').onclick = () => { creator.setValue(randomAvatar()); stage && stage.soloAvatar() && stage.soloAvatar().play('spin'); };
    joinBtn.onclick = () => {
      sfx.unlock();
      if (editing) {
        link.send({ t: 'avatar', avatar: draft });
        joinBtn.disabled = true;
        setTimeout(() => { joinBtn.disabled = false; }, 3000);
        return;
      }
      const name = cleanName(nameIn.value);
      if (!name) { $('#create-error').textContent = 'Sila masukkan nama yang sesuai (maksimum 16 huruf).'; nameIn.focus(); return; }
      profile.name = name;
      store.set('kh.profile', { name, avatar: draft });
      const pid = (sess && sess.pid) || randomId(12);
      const token = (sess && sess.token) || randomId(20);
      sess = { pid, token, name, avatar: draft };
      store.sset(sessKey, sess);
      joinBtn.disabled = true;
      $('#create-error').textContent = '';
      link.send({ t: 'join', role: 'player', pid, token, name, avatar: draft });
      setTimeout(() => { joinBtn.disabled = false; }, 4000);
    };
    nameIn.onkeydown = (e) => { if (e.key === 'Enter') joinBtn.click(); };
  }

  // ---------------------------------------------------------- lobi
  function showLobby(inGame = false) {
    phase = inGame ? 'waiting' : 'lobby';
    creatorOpen = false;
    show('scr-p-lobby');
    $('#pl-title').textContent = inGame ? 'Anda dalam permainan!' : 'Anda dah masuk!';
    $('#pl-sub').textContent = inGame ? 'Permainan sedang berjalan. Tunggu soalan seterusnya...' : 'Nampak nama anda di skrin depan? Tunggu cikgu mulakan.';
    $('#btn-edit-avatar').hidden = inGame;
    $('#pl-pin').textContent = `PIN ${pin}`;
    $('#pl-name').textContent = me().name;
    const av = stageInto('pl-stage', 'normal');
    if (av) av.play('wave');
    for (const b of $$('[data-emote]')) {
      b.onclick = () => {
        const e = b.dataset.emote;
        const a = stage && stage.soloAvatar();
        if (a) a.play(e);
        sendEmote(e);
      };
    }
    $('#btn-edit-avatar').onclick = () => openCreator({}, true);
  }

  function sendEmote(e) {
    if (phase !== 'lobby') return;
    const now = Date.now();
    if (now - lastEmote < 900) return;
    lastEmote = now;
    link.send({ t: 'emote', e });
  }

  // ---------------------------------------------------------- soalan
  function showIntro(m) {
    phase = 'intro';
    creatorOpen = false;
    clearInterval(timerInt);
    current.i = m.i; current.n = m.n;
    show('scr-p-intro');
    $('#pi-num').textContent = `Soalan ${m.i + 1}/${m.n}`;
    $('#pi-score').textContent = `${fmt(current.score)} mata`;
    $('#pi-title').textContent = m.points === 2 ? 'Mata berganda!' : m.points === 0 ? 'Soalan latihan' : 'Bersedia!';
    const qt = clear($('#pi-text'));
    if (m.ar) qt.append(el('span', { class: 'ar ar-big' }, m.ar));
    if (m.text) qt.append(m.text);
    const bar = $('#pi-bar');
    bar.style.transition = 'none';
    bar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = `transform ${Math.max(0.5, (m.introMs || 4000) / 1000)}s linear`;
      bar.style.transform = 'scaleX(0)';
    }));
  }

  function showAnswer(m) {
    phase = 'question';
    creatorOpen = false;
    current.i = m.i; current.n = m.n; current.time = m.time; current.answered = m.answered === undefined ? -1 : m.answered;
    current.openAt = performance.now() - (m.elapsed || 0);
    if (current.answered >= 0) { showWait(current.answered); return; }
    show('scr-p-answer');
    $('#pa-num').textContent = `Soalan ${m.i + 1}/${m.n}`;
    const qt = clear($('#pa-text'));
    if (m.ar) qt.append(el('span', { class: 'ar ar-big' }, m.ar));
    if (m.text) qt.append(m.text);
    const grid = clear($('#pa-grid'));
    grid.classList.toggle('two', m.count === 2);
    for (let i = 0; i < m.count; i++) {
      const txt = m.choices ? m.choices[i] : '';
      grid.append(el('button', {
        class: `ans-btn ${ANSWER_META[i].cls}`, type: 'button', 'aria-label': `${ANSWER_META[i].label}${txt ? ': ' + txt : ''}`,
        onclick: () => answer(i),
      }, shapeSVG(i), txt ? el('span', { class: hasArabic(txt) ? 'ar' : '' }, txt) : null));
    }
    const tick = () => {
      const left = Math.max(0, current.time - (performance.now() - current.openAt) / 1000);
      $('#pa-time').textContent = `⏱ ${Math.ceil(left)}`;
      if (left <= 0) clearInterval(timerInt);
    };
    clearInterval(timerInt);
    tick();
    timerInt = setInterval(tick, 200);
    buzz(30);
  }

  function answer(i) {
    if (phase !== 'question' || current.answered >= 0) return;
    const ms = Math.round(performance.now() - current.openAt);
    current.answered = i;
    sfx.sent();
    const send = () => link.send({ t: 'ans', q: current.i, c: i, ms });
    send();
    clearTimeout(ackTimer);
    let tries = 0;
    const retry = () => { if (tries++ < 4) { send(); ackTimer = setTimeout(retry, 2500); } };
    ackTimer = setTimeout(retry, 2500);
    showWait(i);
  }

  const TIPS = ['Tengok skrin depan...', 'Adakah anda yang terpantas?', 'Sabar, tunggu kawan-kawan...', 'Doa dulu: Rabbi zidni ilma!', 'Hmm, betul ke tak ya?'];
  function showWait(i) {
    phase = 'answered';
    clearInterval(timerInt);
    show('scr-p-wait');
    $('#pw-num').textContent = `Soalan ${current.i + 1}/${current.n}`;
    $('#pw-score').textContent = `${fmt(current.score)} mata`;
    const echo = clear($('#pw-choice'));
    echo.append(el('div', { class: `choice-echo ${ANSWER_META[i].cls}` }, shapeSVG(i), ANSWER_META[i].label));
    $('#pw-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const av = stageInto('pw-stage', 'normal');
    if (av) av.play('nod');
  }

  function showResult(m) {
    phase = 'result';
    clearInterval(timerInt);
    clearTimeout(ackTimer);
    current.score = m.total;
    current.lastResult = m;
    const scr = $('#scr-p-result');
    scr.classList.remove('ok', 'bad', 'late');
    show('scr-p-result');
    $('#pr-num').textContent = `Soalan ${m.i + 1}/${m.n}`;
    $('#pr-name').textContent = me().name;
    const answered = m.choice !== null && m.choice !== undefined && m.choice >= 0;
    if (m.correct) {
      scr.classList.add('ok');
      $('#pr-title').textContent = m.points > 0 ? 'Betul!' : 'Betul! (soalan latihan)';
      $('#pr-points').textContent = `+ ${fmt(m.points)}`;
      $('#pr-points').hidden = false;
      $('#pr-streak').textContent = m.streak >= 2 ? `🔥 ${m.streak} betul berturut-turut${m.bonus ? ` (+${m.bonus} bonus)` : ''}` : '';
      sfx.correct();
      confetti(1600);
      stageInto('pr-stage', 'happy', 'celebrate');
    } else {
      scr.classList.add(answered ? 'bad' : 'late');
      $('#pr-title').textContent = answered ? 'Salah...' : 'Masa tamat!';
      $('#pr-points').hidden = true;
      $('#pr-streak').textContent = m.lostStreak ? 'Rentetan jawapan betul terputus' : '';
      sfx.wrong();
      stageInto('pr-stage', 'sad', 'sad');
    }
    const behind = m.behind ? ` • ${fmt(m.behind.gap)} mata di belakang ${m.behind.name}` : '';
    $('#pr-rank').textContent = `Tempat ${ordinal(m.rank)} daripada ${m.of} • ${fmt(m.total)} mata${behind}`;
    $('#pr-correct').textContent = m.correct ? '' : `Jawapan betul: ${m.correctText}`;
    buzz(m.correct ? [40, 60, 40] : 160);
  }

  function renderMiniBoard(top, box) {
    if (!box || !Array.isArray(top)) return;
    clear(box);
    for (const r of top) {
      box.append(el('div', { class: 'row' + (sess && r.pid === sess.pid ? ' me' : '') }, el('span', null, `${r.rank}. ${r.name}`), el('span', null, fmt(r.score))));
    }
  }

  function showFinal(m) {
    phase = 'final';
    clearInterval(timerInt);
    show('scr-p-final');
    store.sset(sessKey, null);
    $('#pf-pin').textContent = `PIN ${pin}`;
    $('#pf-name').textContent = me().name;
    const medal = m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : m.rank === 3 ? '🥉' : '';
    $('#pf-title').textContent = m.rank <= 3 ? `${medal} Tempat ${ordinal(m.rank)}!` : `Tempat ${ordinal(m.rank)} daripada ${m.of}`;
    $('#pf-score').textContent = `${fmt(m.total)} mata • ${m.correctCount}/${m.n} betul`;
    renderMiniBoard(m.top, $('#pf-board'));
    if (m.rank <= 3) { confetti(3000); sfx.fanfare(); }
    stageInto('pf-stage', 'happy', m.rank <= 3 ? 'celebrate' : 'dance');
    $('#pf-home').onclick = () => app.home();
  }
}
