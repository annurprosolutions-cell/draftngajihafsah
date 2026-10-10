// Penonton: papan markah langsung (untuk skrin kedua, ibu bapa, atau cikgu lain).
import { $, el, show, fmt, keepAwake } from './ui.js';
import { ClientLink } from './net.js';

export async function startWatch(app, pin) {
  show('scr-loading');
  $('#loading-text').textContent = 'Membuka papan markah...';
  $('#loading-sub').textContent = `PIN ${pin}`;
  await app.load3D();
  let shown = false;
  const rowsByPid = new Map();
  const PHASE = { lobby: 'Menunggu pemain', intro: 'Soalan akan bermula', question: 'Sedang menjawab', reveal: 'Jawapan didedahkan', scoreboard: 'Papan markah', final: 'Tamat' };

  const link = new ClientLink(pin, {
    onOpen() { link.send({ t: 'watch' }); },
    onData(m) {
      if (m.t !== 'wstate') return;
      if (!shown) { show('scr-watch'); shown = true; link.markStable(); }
      render(m);
    },
    onStatus(s) {
      const ov = $('#reconnect');
      if (s === 'connected') { ov.hidden = true; return; }
      if (s === 'reconnecting' && shown) { ov.hidden = false; $('#reconnect-sub').textContent = 'Papan markah akan dikemas kini sebaik sahaja bersambung.'; return; }
      ov.hidden = true;
      if (s === 'notfound') app.home(`Tiada permainan dengan PIN ${pin}.`);
      else if (s === 'failed') app.error('Tidak dapat bersambung', 'Semak sambungan internet dan cuba lagi.');
    },
  });
  link.connect();
  document.body.dataset.awake = '1';
  keepAwake(true);
  app.cleanup = () => { link.close(); $('#reconnect').hidden = true; keepAwake(false); };

  function render(m) {
    $('#w-title').textContent = m.title;
    $('#w-pin').textContent = `PIN ${m.pin}`;
    let phase = PHASE[m.phase] || '';
    if (m.phase === 'question' || m.phase === 'intro') phase += ` • Soalan ${m.qi + 1}/${m.n}`;
    if (m.phase === 'question') phase += ` • ${m.answered}/${m.players.filter((p) => p.online).length} dah jawab`;
    $('#w-phase').textContent = phase;
    const board = $('#w-board');
    // Animasi susunan semula (FLIP): rekod kedudukan lama, susun semula, gelongsor ke kedudukan baru.
    const before = new Map();
    for (const [pid, row] of rowsByPid) before.set(pid, row.getBoundingClientRect().top);
    const seen = new Set();
    for (const p of m.players) {
      seen.add(p.pid);
      let row = rowsByPid.get(p.pid);
      const key = JSON.stringify(p.avatar);
      if (!row || row.dataset.key !== key) {
        const fresh = el('div', { class: 'watch-row' });
        fresh.dataset.key = key;
        fresh.append(el('span', { class: 'rk' }), app.portrait(p.avatar, p.name), el('span', { class: 'nm' }), el('span', { class: 'dl' }), el('span', { class: 'sc' }));
        if (row) row.replaceWith(fresh);
        row = fresh;
        rowsByPid.set(p.pid, row);
      }
      row.className = 'watch-row' + (p.rank <= 3 && p.score > 0 ? ` top${p.rank}` : '');
      row.style.opacity = p.online ? '1' : '0.55';
      row.querySelector('.rk').textContent = String(p.rank);
      row.querySelector('.nm').textContent = p.name + (p.answered ? ' ✔' : '') + (p.streak >= 3 ? ` 🔥${p.streak}` : '');
      row.querySelector('.dl').textContent = p.delta > 0 && (m.phase === 'reveal' || m.phase === 'scoreboard') ? `+${fmt(p.delta)}` : '';
      row.querySelector('.sc').textContent = fmt(p.score);
      board.append(row);
    }
    for (const [pid, row] of rowsByPid) if (!seen.has(pid)) { row.remove(); rowsByPid.delete(pid); }
    for (const [pid, row] of rowsByPid) {
      const old = before.get(pid);
      if (old === undefined) continue;
      const dy = old - row.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) {
        row.style.transition = 'none';
        row.style.transform = `translateY(${dy}px)`;
        requestAnimationFrame(() => requestAnimationFrame(() => { row.style.transition = ''; row.style.transform = ''; }));
      }
    }
    if (!m.players.length) {
      if (!board.querySelector('.muted')) board.append(el('p', { class: 'muted', style: { textAlign: 'center' } }, 'Belum ada pemain.'));
    } else {
      const e = board.querySelector('p.muted');
      if (e) e.remove();
    }
  }
}
