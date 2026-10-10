// Penyunting kuiz untuk cikgu: tambah/ubah soalan, pilihan jawapan, masa dan mata.
import { $, el, clear, show, toast, shapeSVG, ANSWER_META, download } from './ui.js';
import { sanitizeQuiz, TIME_OPTIONS } from './quizzes.js';

export function openEditor({ quiz, isNew, onSave, onCancel, onDelete }) {
  const data = JSON.parse(JSON.stringify(quiz));
  if (!Array.isArray(data.questions)) data.questions = [];
  if (!data.questions.length) data.questions.push(blankQuestion());
  show('scr-h-editor');
  $('#editor-heading').textContent = isNew ? 'Kuiz baru' : 'Sunting kuiz';
  $('#editor-delete').hidden = !!isNew;

  function blankQuestion(tf = false) {
    return tf
      ? { text: '', choices: ['Betul', 'Salah'], correct: 0, time: 15, points: 1 }
      : { text: '', choices: ['', '', '', ''], correct: 0, time: 20, points: 1 };
  }

  function render() {
    const root = clear($('#editor'));
    root.append(
      el('input', { class: 'editor-title', value: data.title || '', placeholder: 'Tajuk kuiz', maxlength: '80', oninput: (e) => { data.title = e.target.value; } }),
      el('input', { class: 'editor-title', style: { fontSize: '15px' }, value: data.desc || '', placeholder: 'Penerangan ringkas (pilihan)', maxlength: '160', oninput: (e) => { data.desc = e.target.value; } }),
    );
    data.questions.forEach((q, qi) => {
      while (q.choices.length < 2) q.choices.push('');
      const card = el('div', { class: 'q-edit' });
      card.append(el('div', { class: 'row', style: { justifyContent: 'space-between' } },
        el('strong', null, `Soalan ${qi + 1}`),
        el('span', { class: 'row' },
          el('button', { class: 'btn small', type: 'button', disabled: qi === 0, onclick: () => { swap(qi, qi - 1); } }, '↑'),
          el('button', { class: 'btn small', type: 'button', disabled: qi === data.questions.length - 1, onclick: () => { swap(qi, qi + 1); } }, '↓'),
          el('button', { class: 'btn small', type: 'button', onclick: () => { data.questions.splice(qi + 1, 0, JSON.parse(JSON.stringify(q))); render(); } }, 'Salin'),
          el('button', { class: 'btn small danger', type: 'button', onclick: () => { data.questions.splice(qi, 1); if (!data.questions.length) data.questions.push(blankQuestion()); render(); } }, 'Padam'))));
      card.append(el('textarea', { placeholder: 'Tulis soalan di sini', maxlength: '240', oninput: (e) => { q.text = e.target.value; } }, q.text || ''));
      card.append(el('input', { type: 'text', value: q.ar || '', placeholder: 'Teks Arab untuk dipaparkan besar (pilihan), contoh: ب', maxlength: '40', dir: 'auto', class: 'ar-input', oninput: (e) => { q.ar = e.target.value; } }));
      const isTF = q.choices.length === 2 && q.choices[0] === 'Betul' && q.choices[1] === 'Salah';
      q.choices.forEach((c, ci) => {
        card.append(el('label', { class: 'choice-row' },
          el('span', { class: `swatch-dot ${ANSWER_META[ci].cls}` }, shapeSVG(ci)),
          el('input', { type: 'text', value: c, placeholder: `Pilihan ${ci + 1}${ci >= 2 ? ' (pilihan)' : ''}`, maxlength: '90', readonly: isTF, oninput: (e) => { q.choices[ci] = e.target.value; } }),
          el('input', { type: 'radio', name: `correct-${qi}`, checked: q.correct === ci, 'aria-label': 'Jawapan betul', onchange: () => { q.correct = ci; } }),
        ));
      });
      card.append(el('div', { class: 'muted', style: { fontSize: '13px' } }, 'Tanda bulatan hijau pada jawapan yang betul.'));
      card.append(el('div', { class: 'row' },
        el('label', { class: 'row' }, 'Masa ',
          el('select', { onchange: (e) => { q.time = +e.target.value; } }, TIME_OPTIONS.map((t) => el('option', { value: t, selected: q.time === t }, `${t} saat`)))),
        el('label', { class: 'row' }, 'Mata ',
          el('select', { onchange: (e) => { q.points = +e.target.value; } },
            el('option', { value: 1, selected: q.points === 1 }, 'Biasa'),
            el('option', { value: 2, selected: q.points === 2 }, 'Berganda'),
            el('option', { value: 0, selected: q.points === 0 }, 'Tiada mata (latihan)'))),
      ));
      card.append(el('input', { type: 'text', value: q.image || '', placeholder: 'Pautan gambar https:// (pilihan)', maxlength: '500', oninput: (e) => { q.image = e.target.value.trim(); } }));
      root.append(card);
    });
    root.append(el('div', { class: 'row', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      el('button', { class: 'btn', type: 'button', onclick: () => { data.questions.push(blankQuestion()); render(); scrollEnd(); } }, '+ Soalan 4 pilihan'),
      el('button', { class: 'btn', type: 'button', onclick: () => { data.questions.push(blankQuestion(true)); render(); scrollEnd(); } }, '+ Soalan Betul / Salah')));
  }

  function swap(a, b) {
    const t = data.questions[a];
    data.questions[a] = data.questions[b];
    data.questions[b] = t;
    render();
  }

  function scrollEnd() { setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 30); }

  function cleaned() {
    const clean = sanitizeQuiz({ ...data, id: data.id });
    return clean;
  }

  $('#editor-save').onclick = () => {
    const clean = cleaned();
    if (!clean.questions.length) { toast('Sekurang-kurangnya satu soalan dengan dua pilihan diperlukan.', 'bad'); return; }
    const dropped = data.questions.length - clean.questions.length;
    if (dropped > 0) toast(`${dropped} soalan tidak lengkap tidak disimpan.`, 'info', 3500);
    onSave(clean);
  };
  $('#editor-cancel').onclick = () => onCancel();
  $('#editor-delete').onclick = () => { if (confirm('Padam kuiz ini? Tindakan ini tidak boleh dibatalkan.')) onDelete(); };
  $('#editor-export').onclick = () => {
    const clean = cleaned();
    download(`${(clean.title || 'kuiz').replace(/[^\w-]+/g, '_')}.json`, JSON.stringify(clean, null, 2), 'application/json');
  };
  render();
}
