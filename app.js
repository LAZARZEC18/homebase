/* Homebase app: clock, search, layout, customise dialog, backup, tour. */
(function () {
  'use strict';
  const HB = window.HB, { $, $$, el, store } = HB;
  const S = () => HB.settings;

  /* =====================================================================
     Clock and greeting
     ===================================================================== */
  const timeEl = $('#clock-time'), dateEl = $('#clock-date'), greetEl = $('#greeting'), addName = $('#add-name');
  let lastKey = '';
  function greetingFor(h) {
    if (h >= 5 && h < 12) return 'Good morning';
    if (h >= 12 && h < 17) return 'Good afternoon';
    if (h >= 17 && h < 22) return 'Good evening';
    return 'Good night';
  }
  HB.greetingFor = greetingFor;
  function renderClock(force) {
    const now = new Date(), h = now.getHours(), m = String(now.getMinutes()).padStart(2, '0');
    const is12 = S().clock === '12';
    const hh = is12 ? String(h % 12 || 12) : String(h).padStart(2, '0');
    const ap = is12 ? (h < 12 ? 'am' : 'pm') : '';
    const key = `${hh}:${m}${ap}|${now.toDateString()}|${S().name}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    timeEl.replaceChildren(...[el('span', { class: 'hb-hh', text: hh }), el('span', { class: 'hb-colon', 'aria-hidden': 'true', text: ':' }),
      el('span', { class: 'hb-mm', text: m }), ap ? el('span', { class: 'hb-ap', text: ap }) : null].filter(Boolean));
    timeEl.setAttribute('datetime', `${String(h).padStart(2, '0')}:${m}`);
    dateEl.textContent = new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
    const name = S().name.trim();
    greetEl.textContent = greetingFor(h) + (name ? `, ${name}` : '');
    addName.hidden = !!name;
    // the one-thing field clears at midnight
    const one = store.get('one', null);
    if (one && one.date !== HB.todayKey() && $('#one-thing').value && document.activeElement !== $('#one-thing')) $('#one-thing').value = '';
  }
  addName.addEventListener('click', () => openCustomise('#set-name'));
  function scheduleClock() {
    renderClock();
    setTimeout(scheduleClock, 1000 - (Date.now() % 1000) + 5);
  }

  /* =====================================================================
     Search
     ===================================================================== */
  const ENGINES = [
    { id: 'google', name: 'Google', bangs: ['g'], url: 'https://www.google.com/search?q=' },
    { id: 'duckduckgo', name: 'DuckDuckGo', bangs: ['d', 'ddg'], url: 'https://duckduckgo.com/?q=' },
    { id: 'youtube', name: 'YouTube', bangs: ['y', 'yt'], url: 'https://www.youtube.com/results?search_query=' },
    { id: 'github', name: 'GitHub', bangs: ['gh'], url: 'https://github.com/search?q=' },
    { id: 'perplexity', name: 'Perplexity', bangs: ['p', 'pp'], url: 'https://www.perplexity.ai/search?q=' }
  ];
  HB.ENGINES = ENGINES;
  let engine = store.get('engine', 'google');
  if (!ENGINES.some(e => e.id === engine)) engine = 'google';
  const q = $('#q'), hintEl = $('#search-hint'), seg = $('#engine-seg');
  const DEFAULT_HINT = 'Press / to search from anywhere. Prefixes switch engine:';
  function defaultHint() {
    hintEl.replaceChildren(el('span', { text: DEFAULT_HINT + ' ' }), el('span', { class: 'hb-bangs' },
      ...ENGINES.map(e => el('span', { class: 'hb-bang' }, el('kbd', { text: '!' + e.bangs[0] }), ' ' + e.name))));
  }

  function parseQuery(raw, fallback) {
    let text = String(raw || '').trim(), id = fallback;
    const find = b => ENGINES.find(e => e.bangs.includes(b.toLowerCase()));
    let m = /^!(\w+)(?:\s+|$)(.*)$/s.exec(text);
    if (m && find(m[1])) { id = find(m[1]).id; text = m[2].trim(); }
    else if ((m = /^(.*\S)\s+!(\w+)$/s.exec(text)) && find(m[2])) { id = find(m[2]).id; text = m[1].trim(); }
    return { engine: id, query: text };
  }
  function searchUrl(id, query) {
    const e = ENGINES.find(x => x.id === id) || ENGINES[0];
    return e.url + encodeURIComponent(query);
  }
  HB.parseQuery = parseQuery; HB.searchUrl = searchUrl;
  HB.go = url => location.assign(url);

  ENGINES.forEach(e => seg.append(el('button', { type: 'button', 'data-engine': e.id, text: e.name })));
  function renderEngine() {
    seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.engine === engine)));
    q.placeholder = `Search ${ENGINES.find(e => e.id === engine).name}`;
    renderHint();
  }
  function renderHint() {
    const p = parseQuery(q.value, engine);
    const bang = p.engine !== engine;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('is-bang', bang && b.dataset.engine === p.engine));
    hintEl.classList.remove('zl-error');
    if (bang) {
      const name = ENGINES.find(e => e.id === p.engine).name;
      hintEl.textContent = p.query ? `Press Enter to search ${name} for "${p.query}".` : `Type what to search ${name} for.`;
    } else defaultHint();
  }
  seg.addEventListener('click', e => {
    const b = e.target.closest('button[data-engine]');
    if (!b || b.dataset.engine === engine) return;
    engine = b.dataset.engine; store.set('engine', engine); renderEngine();
    ZL.toast(`Searching with ${b.textContent}`);
    q.focus();
  });
  q.addEventListener('input', renderHint);
  q.addEventListener('keydown', e => { if (e.key === 'Escape') { q.value = ''; renderHint(); q.blur(); } });
  $('#search-form').addEventListener('submit', e => {
    e.preventDefault();
    const p = parseQuery(q.value, engine);
    if (!p.query) {
      hintEl.textContent = 'Type something to search for, then press Enter.';
      hintEl.classList.add('zl-error');
      q.focus();
      return;
    }
    HB.go(searchUrl(p.engine, p.query));
  });
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
    if (document.querySelector('dialog[open]') || !HB.widgetOn('search')) return;
    e.preventDefault();
    q.focus({ preventScroll: true });
    q.scrollIntoView({ block: 'center', behavior: HB.reduced() ? 'auto' : 'smooth' });
  });

  /* =====================================================================
     Layout: widget order, visibility and background
     ===================================================================== */
  const grid = $('#hb-grid'), dash = $('#dash');
  function applyLayout() {
    const vis = [];
    S().widgets.forEach(w => {
      const node = $(`#w-${w.id}`);
      if (!node) return;
      grid.append(node);
      node.hidden = !w.on;
      if (w.on) vis.push(w.id);
    });
    const ci = vis.indexOf('clock'), si = vis.indexOf('search');
    const paired = ci >= 0 && si >= 0 && Math.abs(ci - si) === 1;
    $('#w-clock').classList.toggle('is-solo', !paired);
    $('#w-search').classList.toggle('is-solo', !paired);
    $('#all-off').hidden = vis.length > 0;
    dash.dataset.bg = S().bg;
  }

  /* =====================================================================
     Customise dialog
     ===================================================================== */
  const cdlg = $('#cust-dlg');
  HB.wireDialog(cdlg);
  const nameIn = $('#set-name');
  function openCustomise(focusSel) {
    syncCustomise();
    if (!cdlg.open) cdlg.showModal();
    const f = focusSel && $(focusSel);
    if (f) f.focus();
  }
  HB.openCustomise = openCustomise;
  $$('[data-open-customise]').forEach(b => b.addEventListener('click', () => openCustomise()));

  function syncCustomise() {
    if (document.activeElement !== nameIn) nameIn.value = S().name;
    $$('#set-units button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S().units)));
    $$('#set-clock button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S().clock)));
    renderBgs(); renderWidgetList();
  }
  let nameT;
  nameIn.addEventListener('input', () => {
    clearTimeout(nameT);
    nameT = setTimeout(() => { S().name = nameIn.value.trim().slice(0, 30); HB.saveSettings('name'); renderClock(true); }, 250);
  });
  nameIn.addEventListener('change', () => {
    clearTimeout(nameT); S().name = nameIn.value.trim().slice(0, 30); HB.saveSettings('name'); renderClock(true);
    ZL.toast(S().name ? `Hello, ${S().name}` : 'Name removed from the greeting');
  });
  $('#set-units').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === S().units) return;
    S().units = b.dataset.v; HB.saveSettings('units'); syncCustomise();
    ZL.toast(`Temperatures in ${b.dataset.v === 'f' ? 'Fahrenheit' : 'Celsius'}`);
  });
  $('#set-clock').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.dataset.v === S().clock) return;
    S().clock = b.dataset.v; HB.saveSettings('clock'); renderClock(true); syncCustomise();
    ZL.toast(`Clock set to ${b.dataset.v}-hour`);
  });

  /* background picker (radio group with arrow keys) */
  const bgBox = $('#set-bg');
  function renderBgs() {
    bgBox.replaceChildren(...HB.BGS.map(b => el('button', {
      type: 'button', role: 'radio', class: 'hb-bg', 'data-bg': b.id, 'aria-checked': String(b.id === S().bg),
      tabindex: b.id === S().bg ? '0' : '-1', 'aria-label': `${b.name}. ${b.note}`
    }, el('span', { class: 'hb-bg-swatch', 'data-bg': b.id }), el('span', { class: 'hb-bg-name', text: b.name }))));
  }
  function setBg(id, focus) {
    if (id === S().bg) return;
    S().bg = id; HB.saveSettings('bg'); applyLayout(); renderBgs();
    if (focus) bgBox.querySelector(`[data-bg="${id}"]`).focus();
    ZL.toast(`Background set to ${HB.BGS.find(b => b.id === id).name}`);
  }
  bgBox.addEventListener('click', e => { const b = e.target.closest('.hb-bg'); if (b) setBg(b.dataset.bg, true); });
  bgBox.addEventListener('keydown', e => {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = HB.BGS.findIndex(b => b.id === S().bg);
    setBg(HB.BGS[(i + d + HB.BGS.length) % HB.BGS.length].id, true);
  });

  /* widget list: switches, arrows and drag */
  const wlist = $('#set-widgets');
  function renderWidgetList(focusSel) {
    const ws = S().widgets;
    wlist.replaceChildren(...ws.map((w, i) => {
      const meta = HB.WIDGETS.find(x => x.id === w.id);
      const cb = el('input', { type: 'checkbox', 'data-toggle': w.id });
      cb.checked = w.on;
      return el('li', { class: 'hb-wrow' + (w.on ? '' : ' is-off'), 'data-id': w.id },
        el('button', { class: 'hb-grip', type: 'button', 'aria-label': `Reorder ${meta.name}. Drag, or press the up and down arrow keys.`, html: HB.SVG.grip }),
        el('label', { class: 'zl-switch hb-wswitch' }, cb, el('span', { text: meta.name })),
        el('button', { class: 'hb-mini', type: 'button', 'data-wmove': '-1', 'aria-label': `Move ${meta.name} up`, html: HB.SVG.up, disabled: i === 0 }),
        el('button', { class: 'hb-mini', type: 'button', 'data-wmove': '1', 'aria-label': `Move ${meta.name} down`, html: HB.SVG.down, disabled: i === ws.length - 1 }));
    }));
    if (focusSel) { const f = wlist.querySelector(focusSel); if (f) f.focus(); }
  }
  function moveWidget(id, d, viaKey) {
    if (!HB.moveBy(S().widgets, id, d)) return;
    HB.saveSettings('order'); applyLayout();
    renderWidgetList(viaKey ? `[data-id="${id}"] .hb-grip` : `[data-id="${id}"] [data-wmove="${d}"]:not([disabled])`);
    if (!viaKey && !wlist.contains(document.activeElement)) { const g = wlist.querySelector(`[data-id="${id}"] .hb-grip`); if (g) g.focus(); }
    const name = HB.WIDGETS.find(x => x.id === id).name;
    $('#hb-live').textContent = `${name} moved to position ${S().widgets.findIndex(w => w.id === id) + 1}`;
    ZL.toast(`Moved ${name} ${d < 0 ? 'up' : 'down'}`);
  }
  wlist.addEventListener('change', e => {
    const cb = e.target.closest('[data-toggle]'); if (!cb) return;
    const w = S().widgets.find(x => x.id === cb.dataset.toggle);
    w.on = cb.checked; HB.saveSettings('widgets'); applyLayout();
    cb.closest('.hb-wrow').classList.toggle('is-off', !w.on);
    const name = HB.WIDGETS.find(x => x.id === w.id).name;
    ZL.toast(w.on ? `${name} shown` : `${name} hidden`);
    if (w.id === 'weather' && w.on) HB.weather.load(false);
  });
  wlist.addEventListener('click', e => {
    const b = e.target.closest('[data-wmove]'); if (!b) return;
    moveWidget(b.closest('.hb-wrow').dataset.id, +b.dataset.wmove);
  });
  wlist.addEventListener('keydown', e => {
    const g = e.target.closest('.hb-grip');
    if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    moveWidget(g.closest('.hb-wrow').dataset.id, e.key === 'ArrowUp' ? -1 : 1, true);
  });
  HB.sortable(wlist, {
    item: '.hb-wrow', handle: '.hb-grip', axis: 'y',
    onEnd: ids => { S().widgets = HB.reorder(S().widgets, ids); HB.saveSettings('order'); applyLayout(); renderWidgetList(); ZL.toast('Widget order saved'); }
  });

  /* =====================================================================
     Backup: export and import
     ===================================================================== */
  const importErr = $('#import-err');
  function backup() {
    return {
      app: 'homebase', version: 2, exportedAt: new Date().toISOString(),
      settings: S(), engine, place: HB.weather.getPlace(),
      links: HB.widgets.getLinks(), todos: store.get('todos', []), one: store.get('one', null), notes: store.get('notes', '')
    };
  }
  HB.backup = backup;
  $('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(backup(), null, 2)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `homebase-backup-${HB.todayKey()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    ZL.toast('Backup downloaded');
  });
  $('#import-btn').addEventListener('click', () => { importErr.hidden = true; $('#import-file').click(); });
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const fail = msg => { importErr.textContent = msg; importErr.hidden = false; ZL.toast("Couldn't import that file", { type: 'bad' }); };
    let data;
    try { data = JSON.parse(await f.text()); } catch (err) { return fail("That file isn't valid JSON. Choose a file made with Export."); }
    if (!data || data.app !== 'homebase' || typeof data.settings !== 'object') return fail("That file isn't a Homebase backup. Choose a file made with Export.");
    const ok = await ZL.confirm({ title: 'Replace your current setup?', body: 'Your settings, links, city, to-dos and notes will be replaced with the ones in this backup.', confirmLabel: 'Import backup' });
    if (!ok) return;
    applyBackup(data);
    ZL.toast('Backup imported');
  });
  function applyBackup(data) {
    HB.settings = HB.sanitizeSettings(data.settings);
    store.set('settings', HB.settings);
    if (Array.isArray(data.links)) store.set('links', data.links);
    if (Array.isArray(data.todos)) store.set('todos', data.todos);
    if (data.one && typeof data.one.text === 'string') store.set('one', data.one);
    if (typeof data.notes === 'string') store.set('notes', data.notes);
    if (ENGINES.some(x => x.id === data.engine)) { engine = data.engine; store.set('engine', engine); }
    if (data.place) HB.weather.setPlace(data.place);
    HB.widgets.reloadFromStore();
    applyLayout(); renderEngine(); renderClock(true); syncCustomise();
    HB.emit('settings', 'import');
    HB.weather.load(false);
    importErr.hidden = true;
  }
  HB.applyBackup = applyBackup;

  /* =====================================================================
     Misc
     ===================================================================== */
  $('#copy-url').addEventListener('click', async () => {
    const ok = await ZL.copy(location.href.split('#')[0]);
    ZL.toast(ok === false ? "Couldn't copy. Copy the address from the address bar instead." : 'Address copied to clipboard', { type: ok === false ? 'bad' : 'good' });
  });
  $('#faq-home') && document.querySelector('.hb-about .zl-btn-primary').addEventListener('click', () => { $('#faq-home').open = true; });

  /* =====================================================================
     Init
     ===================================================================== */
  applyLayout();
  renderEngine();
  scheduleClock();
  HB.widgets.init();
  HB.weather.load(false);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderClock(true); });

  ZL.tour([
    { el: '#w-clock', title: 'Your clock', body: 'The time, date and a greeting. Add your name and pick 12 or 24-hour time in Customise.' },
    { el: '#w-weather', title: 'Weather where you are', body: 'Current conditions, UV and sunrise. Use Change city to search for a place or use your location.' },
    { el: '#wx-chart-wrap', title: 'The next 24 hours', body: 'Temperature on the line, rain chance in the bars. Hover or tap any hour for details.' },
    { el: '#w-search', title: 'Search', body: 'Press / from anywhere. Start with !y, !gh or !p to search YouTube, GitHub or Perplexity.' },
    { el: '#w-links', title: 'Quick links', body: 'Your most-used sites. Choose Edit to add, rename, remove or drag them into order.' },
    { el: '#w-today', title: 'Today', body: "Set today's one thing, add to-dos and tick them off. Finished items move to Done." },
    { el: '#customise-btn', title: 'Make it yours', body: 'Change your name, units, background and which widgets show, or export a backup.' }
  ]);
})();
