/* Homebase widgets: quick links, today (to-dos + one thing), focus timer, notes. */
(function () {
  'use strict';
  const HB = window.HB, { $, $$, el, store } = HB;
  const SVG = {
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L8 19z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 12.5l4 4L18 8"/></svg>'
  };
  HB.SVG = SVG;

  /* =====================================================================
     Quick links
     ===================================================================== */
  const DEFAULT_LINKS = [
    { name: 'GitHub', url: 'https://github.com' },
    { name: 'YouTube', url: 'https://www.youtube.com' },
    { name: 'Gmail', url: 'https://mail.google.com' },
    { name: 'Blackboard', url: 'https://lms.curtin.edu.au' },
    { name: 'Claude', url: 'https://claude.ai' },
    { name: 'Spotify', url: 'https://open.spotify.com' }
  ];
  const cleanLinks = arr => (Array.isArray(arr) ? arr : []).filter(l => l && typeof l.url === 'string' && typeof l.name === 'string')
    .map(l => ({ id: l.id || HB.uid(), name: l.name.slice(0, 24), url: l.url }));
  let links = store.get('links', null);
  links = links == null ? DEFAULT_LINKS.map(l => ({ id: HB.uid(), ...l })) : cleanLinks(links);
  const saveLinks = () => { store.set('links', links); HB.saved(); };
  let editing = false;

  const list = $('#links-list'), hint = $('#links-hint');
  let editBtn = null;

  function normalizeUrl(input) {
    let s = String(input || '').trim();
    if (!s) return { error: 'Enter a web address, like github.com.' };
    if (/^(javascript|data|file|vbscript):/i.test(s)) return { error: 'Only web addresses that start with http or https can be added.' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
    let u;
    try { u = new URL(s); } catch (e) { return { error: "That doesn't look like a web address. Try something like github.com." }; }
    if (!/^https?:$/.test(u.protocol)) return { error: 'Only web addresses that start with http or https can be added.' };
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return { error: 'Add the full domain, like example.com.' };
    const bare = u.pathname === '/' && !u.search && !u.hash;
    return { url: bare ? u.origin : u.href };
  }
  function nameFromUrl(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      const first = host.split('.')[0];
      return first.charAt(0).toUpperCase() + first.slice(1);
    } catch (e) { return 'Link'; }
  }
  const hostOf = url => { try { return new URL(url).hostname; } catch (e) { return ''; } };
  HB.normalizeUrl = normalizeUrl;

  function favicon(link) {
    const box = el('span', { class: 'hb-fav', 'aria-hidden': 'true' });
    const letter = () => { box.classList.add('is-letter'); box.replaceChildren(el('span', { text: (link.name.trim()[0] || '?').toUpperCase() })); };
    const host = hostOf(link.url);
    if (!host) { letter(); return box; }
    const img = el('img', { alt: '', width: '32', height: '32', draggable: 'false', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', letter, { once: true });
    // Google returns a 16px globe when a site has no icon: a letter reads better
    img.addEventListener('load', () => { if (img.naturalWidth && img.naturalWidth <= 16) letter(); else box.classList.add('is-img'); }, { once: true });
    img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
    box.append(img);
    return box;
  }

  function renderLinks(focusSel) {
    list.replaceChildren();
    links.forEach((l, i) => {
      const a = el('a', { class: 'hb-link-a', href: l.url, draggable: editing ? 'false' : null, title: `${l.name}, ${hostOf(l.url)}` }, favicon(l), el('span', { class: 'hb-link-name', text: l.name }));
      a.addEventListener('click', e => { if (editing) { e.preventDefault(); openLink(l.id); } });
      const li = el('li', { class: 'hb-link', 'data-id': l.id }, a);
      if (editing) {
        li.append(
          el('button', { class: 'hb-link-del', type: 'button', 'aria-label': `Remove ${l.name}`, html: SVG.x, onclick: () => removeLink(l.id) }),
          el('div', { class: 'hb-link-tools' },
            el('button', { type: 'button', class: 'hb-mini', 'data-move': '-1', 'aria-label': `Move ${l.name} left`, html: SVG.left, disabled: i === 0, onclick: () => moveLink(l.id, -1, 'left') }),
            el('button', { type: 'button', class: 'hb-mini', 'data-edit': '', 'aria-label': `Edit ${l.name}`, html: SVG.pencil, onclick: () => openLink(l.id) }),
            el('button', { type: 'button', class: 'hb-mini', 'data-move': '1', 'aria-label': `Move ${l.name} right`, html: SVG.right, disabled: i === links.length - 1, onclick: () => moveLink(l.id, 1, 'right') })));
      }
      list.append(li);
    });
    list.append(el('li', { class: 'hb-link hb-link-add-li' },
      el('button', { class: 'hb-link-a hb-link-add', id: 'link-add', type: 'button', onclick: () => openLink(null) },
        el('span', { class: 'hb-fav is-add', html: SVG.plus }), el('span', { class: 'hb-link-name', text: 'Add link' }))));
    editBtn = el('button', { class: 'hb-link-a hb-link-edit', id: 'links-edit', type: 'button', 'aria-pressed': String(editing), onclick: () => { setEditing(!editing); const b = $('#links-edit'); if (b) b.focus(); } },
      el('span', { class: 'hb-fav is-add is-edit', html: editing ? SVG.check : SVG.pencil }), el('span', { class: 'hb-link-name', text: editing ? 'Done' : 'Edit links' }));
    list.append(el('li', { class: 'hb-link hb-link-add-li' }, editBtn));
    list.classList.toggle('is-editing', editing);
    if (focusSel) { const f = list.querySelector(focusSel); if (f) f.focus(); }
  }
  function setEditing(on) {
    editing = on;
    hint.hidden = !on;
    renderLinks();
  }
  list.addEventListener('keydown', e => { if (e.key === 'Escape' && editing) { setEditing(false); $('#links-edit').focus(); } });

  function moveLink(id, d, dir) {
    if (!HB.moveBy(links, id, d)) return;
    saveLinks();
    const l = links.find(x => x.id === id);
    renderLinks(`[data-id="${id}"] [data-move="${d}"]:not([disabled])`) ;
    if (!list.contains(document.activeElement) || document.activeElement === document.body) {
      const alt = list.querySelector(`[data-id="${id}"] [data-edit]`); if (alt) alt.focus();
    }
    ZL.toast(`Moved ${l.name} ${dir}`);
  }
  HB.sortable(list, {
    item: '.hb-link:not(.hb-link-add-li)', axis: 'x', enabled: () => editing,
    onEnd: ids => { links = HB.reorder(links, ids); saveLinks(); renderLinks(); ZL.toast('Links reordered'); }
  });

  function removeLink(id) {
    const i = links.findIndex(l => l.id === id);
    if (i < 0) return;
    const [gone] = links.splice(i, 1);
    saveLinks(); renderLinks();
    ZL.toast(`Removed ${gone.name}`, { action: { label: 'Undo', fn: () => { links.splice(Math.min(i, links.length), 0, gone); saveLinks(); renderLinks(); ZL.toast(`Restored ${gone.name}`); } } });
  }

  /* link dialog */
  const ldlg = $('#link-dlg'), lform = $('#link-form'), lurl = $('#link-url'), lname = $('#link-name'), lerr = $('#link-url-err');
  let editId = null;
  HB.wireDialog(ldlg);
  function openLink(id) {
    editId = id;
    const l = links.find(x => x.id === id);
    $('#link-dlg-h').textContent = l ? `Edit ${l.name}` : 'Add a link';
    $('#link-save').textContent = l ? 'Save changes' : 'Add link';
    $('#link-delete').hidden = !l;
    lurl.value = l ? l.url : ''; lname.value = l ? l.name : '';
    clearErr();
    ldlg.showModal(); lurl.focus();
  }
  function clearErr() { lerr.hidden = true; lerr.textContent = ''; lurl.removeAttribute('aria-invalid'); }
  lurl.addEventListener('input', clearErr);
  lurl.addEventListener('blur', () => { const r = normalizeUrl(lurl.value); if (!lname.value.trim() && r.url) lname.placeholder = nameFromUrl(r.url); });
  $('#link-delete').addEventListener('click', () => { const id = editId; ldlg.close(); removeLink(id); });
  lform.addEventListener('submit', e => {
    e.preventDefault();
    const r = normalizeUrl(lurl.value);
    if (r.error) { lerr.textContent = r.error; lerr.hidden = false; lurl.setAttribute('aria-invalid', 'true'); lurl.focus(); return; }
    const name = (lname.value.trim() || nameFromUrl(r.url)).slice(0, 24);
    if (editId) {
      const l = links.find(x => x.id === editId);
      if (l) { l.url = r.url; l.name = name; }
      ZL.toast(`Saved ${name}`);
    } else {
      links.push({ id: HB.uid(), name, url: r.url });
      ZL.toast(`Added ${name}`);
    }
    saveLinks(); ldlg.close(); renderLinks();
  });

  /* =====================================================================
     Today: one thing + to-dos
     ===================================================================== */
  let todos = (store.get('todos', []) || []).filter(t => t && typeof t.text === 'string').map(t => ({ id: t.id || HB.uid(), text: t.text, done: !!t.done }));
  const saveTodos = () => { store.set('todos', todos); HB.saved(); };
  const tlist = $('#todo-list'), dlist = $('#done-list'), tform = $('#todo-form'), tinput = $('#todo-input'), terr = $('#todo-err');
  const one = $('#one-thing');
  let doneOpen = !!store.get('doneOpen', false);

  (function initOne() {
    const saved = store.get('one', null);
    one.value = saved && saved.date === HB.todayKey() ? saved.text : '';
    let t;
    one.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { store.set('one', { text: one.value, date: HB.todayKey() }); HB.saved(); }, 300); });
    one.addEventListener('change', () => { if (one.value.trim()) ZL.toast("Today's one thing is set"); });
    one.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); one.blur(); } });
  })();

  function todoItem(t) {
    const li = el('li', { class: 'hb-todo' + (t.done ? ' is-done' : ''), 'data-id': t.id });
    if (!t.done) li.append(el('button', { class: 'hb-grip', type: 'button', 'aria-label': `Reorder ${t.text}. Drag, or press the up and down arrow keys.`, html: SVG.grip }));
    const cb = el('input', { type: 'checkbox', class: 'hb-cb', 'aria-label': t.done ? `Mark "${t.text}" as not done` : `Mark "${t.text}" as done` });
    cb.checked = t.done;
    cb.addEventListener('change', () => toggle(t.id, li));
    li.append(el('span', { class: 'hb-check' }, cb, el('span', { class: 'hb-check-box', html: SVG.check })),
      el('span', { class: 'hb-todo-text', text: t.text }));
    if (!t.done) li.append(el('button', { class: 'hb-mini hb-todo-edit', type: 'button', 'aria-label': `Edit "${t.text}"`, html: SVG.pencil, onclick: () => startEdit(t.id) }));
    li.append(el('button', { class: 'hb-mini hb-todo-del', type: 'button', 'aria-label': `Delete "${t.text}"`, html: SVG.x, onclick: () => removeTodo(t.id) }));
    li.querySelector('.hb-todo-text').addEventListener('dblclick', () => { if (!t.done) startEdit(t.id); });
    return li;
  }
  function renderTodos(focusSel) {
    const open = todos.filter(t => !t.done), done = todos.filter(t => t.done);
    tlist.replaceChildren(...open.map(todoItem));
    dlist.replaceChildren(...done.map(todoItem));
    const empty = $('#todo-empty');
    empty.hidden = open.length > 0;
    $('#todo-empty-h').textContent = done.length ? 'All done for today' : 'A clear day';
    $('#todo-empty-p').textContent = done.length ? "You've finished everything on your list. Add more, or enjoy the rest of the day."
      : 'Add what you want to get done today. Tick things off and they move to Done.';
    $('#done-wrap').hidden = !done.length;
    $('#done-label').textContent = `Done (${done.length})`;
    $('#done-toggle').setAttribute('aria-expanded', String(doneOpen));
    dlist.hidden = !doneOpen;
    $('#todo-meta').textContent = open.length ? `${open.length} left` : '';
    HB.status('todo', open.length ? HB.plural(open.length, 'to-do') + ' left' : done.length ? 'All to-dos done' : '');
    if (focusSel) { const f = $('#w-today').querySelector(focusSel); if (f) f.focus(); }
  }
  tform.addEventListener('submit', e => {
    e.preventDefault();
    const text = tinput.value.trim();
    if (!text) { terr.textContent = 'Type something to do first, then press Add.'; terr.hidden = false; tinput.setAttribute('aria-invalid', 'true'); tinput.focus(); return; }
    todos.push({ id: HB.uid(), text, done: false });
    // keep open items before done ones so order reads naturally
    todos = todos.filter(t => !t.done).concat(todos.filter(t => t.done));
    saveTodos(); tinput.value = ''; renderTodos();
    const last = tlist.lastElementChild; if (last && !HB.reduced()) last.classList.add('is-new');
    ZL.toast('To-do added');
  });
  tinput.addEventListener('input', () => { terr.hidden = true; tinput.removeAttribute('aria-invalid'); });

  function toggle(id, li) {
    const t = todos.find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    saveTodos();
    const finish = () => {
      renderTodos();
      if (t.done) ZL.toast('Moved to Done', { action: { label: 'Undo', fn: () => { t.done = false; saveTodos(); renderTodos(); } } });
      else ZL.toast('Moved back to your list');
    };
    if (t.done && !HB.reduced()) { li.classList.add('is-checking'); setTimeout(finish, 280); } else finish();
  }
  function removeTodo(id) {
    const i = todos.findIndex(t => t.id === id);
    if (i < 0) return;
    const [gone] = todos.splice(i, 1);
    saveTodos(); renderTodos();
    ZL.toast('To-do deleted', { action: { label: 'Undo', fn: () => { todos.splice(i, 0, gone); saveTodos(); renderTodos(); } } });
  }
  function startEdit(id) {
    const t = todos.find(x => x.id === id);
    const li = tlist.querySelector(`[data-id="${id}"]`);
    if (!t || !li) return;
    const span = li.querySelector('.hb-todo-text');
    const input = el('input', { class: 'zl-input hb-todo-input', value: t.text, maxlength: '160', 'aria-label': 'Edit to-do. Enter saves, Escape cancels.' });
    span.replaceWith(input);
    li.classList.add('is-editing');
    input.focus(); input.select();
    let done = false;
    const commit = save => {
      if (done) return; done = true;
      const v = input.value.trim();
      if (save && v && v !== t.text) { t.text = v; saveTodos(); ZL.toast('To-do updated'); }
      else if (save && !v) ZL.toast("A to-do can't be empty, so it was left as it was", { type: 'info' });
      renderTodos(`[data-id="${id}"] .hb-todo-edit`);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(true); } if (e.key === 'Escape') { e.preventDefault(); commit(false); } });
    input.addEventListener('blur', () => commit(true));
  }
  // keyboard reorder on the grip
  tlist.addEventListener('keydown', e => {
    const grip = e.target.closest('.hb-grip');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const id = grip.closest('.hb-todo').dataset.id;
    const open = todos.filter(t => !t.done);
    if (HB.moveBy(open, id, e.key === 'ArrowUp' ? -1 : 1)) {
      todos = open.concat(todos.filter(t => t.done)); saveTodos();
      renderTodos(`[data-id="${id}"] .hb-grip`);
      $('#hb-live').textContent = `Moved to position ${open.findIndex(t => t.id === id) + 1} of ${open.length}`;
    }
  });
  HB.sortable(tlist, {
    item: '.hb-todo', handle: '.hb-grip', axis: 'y',
    onEnd: ids => { const open = HB.reorder(todos.filter(t => !t.done), ids); todos = open.concat(todos.filter(t => t.done)); saveTodos(); renderTodos(); ZL.toast('List reordered'); }
  });
  $('#done-toggle').addEventListener('click', () => { doneOpen = !doneOpen; store.set('doneOpen', doneOpen); renderTodos(); });
  $('#done-clear').addEventListener('click', () => {
    const before = todos.slice();
    const n = todos.filter(t => t.done).length;
    todos = todos.filter(t => !t.done); saveTodos(); renderTodos();
    ZL.toast(`Cleared ${HB.plural(n, 'done item')}`, { action: { label: 'Undo', fn: () => { todos = before; saveTodos(); renderTodos(); } } });
  });

  /* =====================================================================
     Focus timer
     ===================================================================== */
  const PRESETS = { '25': [25, 5], '50': [50, 10], '15': [15, 3] };
  const tdef = { preset: '25', mode: 'focus', running: false, endAt: 0, left: 25 * 60000, sessions: { date: HB.todayKey(), count: 0 } };
  let tm = Object.assign({}, tdef, store.get('timer', {}));
  if (!PRESETS[tm.preset]) tm.preset = '25';
  if (!['focus', 'break'].includes(tm.mode)) tm.mode = 'focus';
  if (!tm.sessions || tm.sessions.date !== HB.todayKey()) tm.sessions = { date: HB.todayKey(), count: 0 };
  const dur = (mode = tm.mode) => PRESETS[tm.preset][mode === 'focus' ? 0 : 1] * 60000;
  if (typeof tm.left !== 'number' || tm.left <= 0 || tm.left > dur()) tm.left = dur();
  const saveTimer = () => store.set('timer', tm);
  const baseTitle = document.title;
  let tick = 0, audio = null;
  const fill = $('#timer-fill'), ttime = $('#timer-time');
  HB.timer = { chimes: 0 };

  const presetSeg = $('#timer-presets');
  Object.keys(PRESETS).forEach(k => presetSeg.append(el('button', { type: 'button', 'data-v': k, text: `${PRESETS[k][0]} / ${PRESETS[k][1]}`, 'aria-label': `${PRESETS[k][0]} minutes focus, ${PRESETS[k][1]} minutes break` })));
  const remaining = () => tm.running ? Math.max(0, tm.endAt - Date.now()) : tm.left;
  const mmss = ms => { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  function renderTimer() {
    const left = remaining(), total = dur();
    ttime.textContent = mmss(left);
    fill.style.strokeDashoffset = String(1000 - 1000 * (left / total));
    $('#w-focus').dataset.mode = tm.mode;
    $('#w-focus').classList.toggle('is-running', tm.running);
    $('#timer-mode').textContent = tm.mode === 'focus' ? 'Focus' : 'Break';
    const paused = !tm.running && left < total;
    const end = new Date(tm.endAt);
    $('#timer-sub').textContent = tm.running ? `Ends at ${HB.hm(end.getHours(), end.getMinutes())}` : paused ? 'Paused' : tm.mode === 'focus' ? 'Ready when you are' : `Take ${PRESETS[tm.preset][1]} minutes`;
    $('#timer-start').textContent = tm.running ? 'Pause' : paused ? 'Resume' : tm.mode === 'focus' ? 'Start focus' : 'Start break';
    $('#timer-start').classList.toggle('zl-btn-primary', !tm.running);
    $('#timer-start').classList.toggle('zl-btn-secondary', tm.running);
    $('#timer-skip').textContent = tm.mode === 'focus' ? 'Skip to break' : 'Skip to focus';
    $('#timer-reset').disabled = !tm.running && !paused;
    presetSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === tm.preset)));
    $('#timer-sessions').textContent = HB.plural(tm.sessions.count, 'session') + ' today';
    document.title = tm.running ? `${mmss(left)} ${tm.mode === 'focus' ? 'Focus' : 'Break'} — Homebase` : baseTitle;
    const dot = $('#hb-dot');
    if (dot) dot.classList.toggle('is-live', tm.running);
    HB.status('timer', tm.running ? (tm.mode === 'focus' ? 'Focus running' : 'Break running') : paused ? 'Timer paused' : '');
  }
  function runTick() {
    clearInterval(tick);
    if (!tm.running) return;
    tick = setInterval(() => {
      if (remaining() <= 0) complete(false); else renderTimer();
    }, 250);
  }
  function chime() {
    HB.timer.chimes++;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      audio = audio || new AC();
      if (audio.state === 'suspended') audio.resume();
      const t0 = audio.currentTime + .02;
      [[659.25, 0], [880, .18], [1318.5, .36]].forEach(([f, d]) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.22, t0 + d + .02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 1.4);
        o.connect(g).connect(audio.destination);
        o.start(t0 + d); o.stop(t0 + d + 1.5);
      });
    } catch (e) { /* audio is optional */ }
  }
  function complete(away) {
    clearInterval(tick);
    const was = tm.mode;
    if (was === 'focus') { tm.sessions.count++; }
    tm.mode = was === 'focus' ? 'break' : 'focus';
    tm.running = false; tm.left = dur();
    saveTimer(); renderTimer();
    if (!away) chime();
    const msg = was === 'focus'
      ? (away ? 'Your focus session ended while you were away' : `Focus session done. Take a ${PRESETS[tm.preset][1]}-minute break.`)
      : (away ? 'Your break ended while you were away' : 'Break over. Ready for the next session?');
    $('#timer-live').textContent = msg;
    ZL.toast(msg, { duration: 6000 });
  }
  $('#timer-start').addEventListener('click', () => {
    if (tm.running) {
      tm.left = remaining(); tm.running = false; clearInterval(tick); saveTimer(); renderTimer();
      ZL.toast('Timer paused', { type: 'info' });
      return;
    }
    // unlock audio on a user gesture so the end chime can play
    try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !audio) audio = new AC(); if (audio && audio.state === 'suspended') audio.resume(); } catch (e) {}
    const resumed = tm.left < dur();
    tm.running = true; tm.endAt = Date.now() + tm.left;
    saveTimer(); renderTimer(); runTick();
    ZL.toast(resumed ? 'Timer resumed' : tm.mode === 'focus' ? `Focus started. ${PRESETS[tm.preset][0]} minutes.` : `Break started. ${PRESETS[tm.preset][1]} minutes.`);
  });
  $('#timer-reset').addEventListener('click', () => {
    tm.running = false; tm.left = dur(); clearInterval(tick); saveTimer(); renderTimer();
    ZL.toast('Timer reset', { type: 'info' });
  });
  $('#timer-skip').addEventListener('click', () => {
    tm.mode = tm.mode === 'focus' ? 'break' : 'focus';
    tm.running = false; tm.left = dur(); clearInterval(tick); saveTimer(); renderTimer();
    ZL.toast(tm.mode === 'break' ? 'Skipped to break' : 'Skipped to focus', { type: 'info' });
  });
  presetSeg.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || b.dataset.v === tm.preset) return;
    if (tm.running || tm.left < dur()) {
      const ok = await ZL.confirm({ title: 'Change the timer length?', body: 'This resets the session in progress.', confirmLabel: 'Change length' });
      if (!ok) return;
    }
    tm.preset = b.dataset.v; tm.running = false; tm.mode = 'focus'; tm.left = dur();
    clearInterval(tick); saveTimer(); renderTimer();
    ZL.toast(`Timer set to ${PRESETS[tm.preset][0]} minutes focus, ${PRESETS[tm.preset][1]} break`);
  });

  /* =====================================================================
     Notes
     ===================================================================== */
  const notes = $('#notes-text'), ncount = $('#notes-count'), nstatus = $('#notes-status');
  notes.value = store.get('notes', '') || '';
  const words = s => (s.trim().match(/\S+/g) || []).length;
  const renderCount = () => { ncount.textContent = HB.plural(words(notes.value), 'word'); };
  let nt;
  notes.addEventListener('input', () => {
    nstatus.textContent = 'Saving…';
    renderCount();
    clearTimeout(nt);
    nt = setTimeout(() => { store.set('notes', notes.value); nstatus.textContent = 'Saved'; HB.saved(); }, 400);
  });
  $('#notes-copy').addEventListener('click', async () => {
    if (!notes.value.trim()) { ZL.toast('Nothing to copy yet', { type: 'info' }); return; }
    const ok = await ZL.copy(notes.value);
    ZL.toast(ok === false ? "Couldn't copy. Select the text and copy it instead." : 'Copied to clipboard', { type: ok === false ? 'bad' : 'good' });
  });
  $('#notes-clear').addEventListener('click', () => {
    const before = notes.value;
    if (!before) { ZL.toast('Notes are already empty', { type: 'info' }); return; }
    notes.value = ''; store.set('notes', ''); renderCount(); nstatus.textContent = 'Cleared'; HB.saved();
    ZL.toast('Notes cleared', { action: { label: 'Undo', fn: () => { notes.value = before; store.set('notes', before); renderCount(); nstatus.textContent = 'Restored'; } } });
  });

  /* =====================================================================
     public
     ===================================================================== */
  HB.widgets = {
    init() {
      renderLinks(); renderTodos(); renderCount();
      if (tm.running && tm.endAt <= Date.now()) complete(true);
      else { renderTimer(); runTick(); }
    },
    renderTimer,
    getLinks: () => links.map(l => ({ ...l })),
    reloadFromStore() {
      links = cleanLinks(store.get('links', [])); renderLinks();
      todos = (store.get('todos', []) || []).filter(t => t && typeof t.text === 'string').map(t => ({ id: t.id || HB.uid(), text: t.text, done: !!t.done })); renderTodos();
      const o = store.get('one', null); one.value = o && o.date === HB.todayKey() ? o.text : '';
      notes.value = store.get('notes', '') || ''; renderCount();
    }
  };
  HB.on('settings', () => renderTimer());
})();
