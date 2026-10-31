/* Homebase core: shared helpers, settings, status line and a pointer-based sortable list. */
(function () {
  'use strict';
  const HB = window.HB = {};
  const store = ZL.store;
  HB.store = store;

  HB.$ = (sel, root = document) => root.querySelector(sel);
  HB.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  HB.el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids) if (kid != null && kid !== false) n.append(kid);
    return n;
  };
  HB.uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  HB.reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  HB.todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  HB.plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

  /* ---------- tiny event bus ---------- */
  const subs = {};
  HB.on = (ev, fn) => { (subs[ev] = subs[ev] || []).push(fn); };
  HB.emit = (ev, data) => { (subs[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.warn(e); } }); };

  /* ---------- settings ---------- */
  HB.WIDGETS = [
    { id: 'clock', name: 'Clock and greeting' },
    { id: 'search', name: 'Search' },
    { id: 'links', name: 'Quick links' },
    { id: 'weather', name: 'Weather' },
    { id: 'today', name: 'Today' },
    { id: 'focus', name: 'Focus timer' },
    { id: 'notes', name: 'Notes' }
  ];
  HB.BGS = [
    { id: 'ember', name: 'Ember', note: 'Warm mesh, drifts' },
    { id: 'lagoon', name: 'Lagoon', note: 'Cool mesh, drifts' },
    { id: 'dusk', name: 'Dusk', note: 'Violet mesh, drifts' },
    { id: 'sand', name: 'Sand', note: 'Soft and warm' },
    { id: 'mist', name: 'Mist', note: 'Soft and cool' },
    { id: 'plain', name: 'Plain', note: 'No tint' }
  ];
  const DEFAULTS = { name: '', units: 'c', clock: '12', bg: 'ember', widgets: HB.WIDGETS.map(w => ({ id: w.id, on: true })) };

  HB.sanitizeSettings = function (raw) {
    const s = Object.assign({}, DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    s.name = typeof s.name === 'string' ? s.name.slice(0, 30) : '';
    if (!['c', 'f'].includes(s.units)) s.units = 'c';
    if (!['12', '24'].includes(String(s.clock))) s.clock = '12';
    s.clock = String(s.clock);
    if (!HB.BGS.some(b => b.id === s.bg)) s.bg = 'ember';
    const seen = new Set();
    const list = Array.isArray(s.widgets) ? s.widgets : [];
    s.widgets = list.filter(w => w && HB.WIDGETS.some(x => x.id === w.id) && !seen.has(w.id) && seen.add(w.id))
      .map(w => ({ id: w.id, on: w.on !== false }));
    HB.WIDGETS.forEach(w => { if (!seen.has(w.id)) s.widgets.push({ id: w.id, on: true }); });
    return s;
  };
  HB.settings = HB.sanitizeSettings(store.get('settings', null));
  HB.saveSettings = function (what) {
    store.set('settings', HB.settings);
    HB.saved();
    HB.emit('settings', what);
  };
  HB.widgetOn = id => { const w = HB.settings.widgets.find(x => x.id === id); return !w || w.on; };

  /* ---------- units ---------- */
  HB.toUnit = c => HB.settings.units === 'f' ? c * 9 / 5 + 32 : c;
  HB.temp = c => (c == null || isNaN(c)) ? '--' : `${Math.round(HB.toUnit(c))}°`;
  HB.wind = kmh => HB.settings.units === 'f' ? `${Math.round(kmh * 0.621371)} mph` : `${Math.round(kmh)} km/h`;
  // Format an hour (0–23) and minutes for the chosen clock style
  HB.hm = (h, m = 0, short) => {
    if (HB.settings.clock === '24') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const ap = h < 12 ? 'am' : 'pm';
    const hh = h % 12 || 12;
    return (short && m === 0) ? `${hh} ${ap}` : `${hh}:${String(m).padStart(2, '0')} ${ap}`;
  };

  /* ---------- app bar status ---------- */
  const parts = {};
  let savedTimer = 0, flashing = false;
  function renderStatus() {
    const node = document.getElementById('hb-status');
    if (!node) return;
    const live = ['timer', 'todo', 'weather'].map(k => parts[k]).filter(Boolean);
    node.textContent = flashing ? 'Saved' : (live.join(', ') || 'All saved');
  }
  HB.status = (key, text) => { parts[key] = text; renderStatus(); };
  HB.saved = () => {
    flashing = true; renderStatus();
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { flashing = false; renderStatus(); }, 1600);
  };

  /* ---------- sortable (pointer events: mouse, touch and pen) ---------- */
  HB.sortable = function (container, opts) {
    const o = Object.assign({ item: 'li', handle: null, axis: 'y', enabled: () => true, onEnd: () => {} }, opts);
    let drag = null;
    container.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !o.enabled()) return;
      const grip = o.handle ? e.target.closest(o.handle) : e.target.closest(o.item);
      if (!grip || !container.contains(grip)) return;
      if (!o.handle && e.target.closest('button,input,textarea,select')) return;
      const it = grip.closest(o.item);
      if (!it) return;
      drag = { it, x: e.clientX, y: e.clientY, id: e.pointerId, started: false };
    });
    addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        drag.started = true;
        drag.before = ids();
        drag.it.classList.add('is-dragging');
        container.classList.add('is-sorting');
      }
      e.preventDefault();
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under && under.closest(o.item);
      if (!target || target === drag.it || target.parentNode !== drag.it.parentNode) return;
      const r = target.getBoundingClientRect();
      const after = o.axis === 'y' ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
      const ref = after ? target.nextElementSibling : target;
      if (ref !== drag.it) target.parentNode.insertBefore(drag.it, ref);
    }, { passive: false });
    const end = e => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      const d = drag; drag = null;
      if (!d.started) return;
      d.it.classList.remove('is-dragging');
      container.classList.remove('is-sorting');
      const now = ids();
      if (now.join() !== d.before.join()) o.onEnd(now, d.it.dataset.id);
      const stop = ev => { ev.preventDefault(); ev.stopPropagation(); };
      addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', stop, true), 0);
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    function ids() { return HB.$$(o.item, container).map(n => n.dataset.id); }
  };

  /* move an item inside an array by id */
  HB.moveBy = (arr, id, delta) => {
    const i = arr.findIndex(x => x.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= arr.length) return false;
    const [x] = arr.splice(i, 1); arr.splice(j, 0, x); return true;
  };
  HB.reorder = (arr, ids) => ids.map(id => arr.find(x => x.id === id)).filter(Boolean).concat(arr.filter(x => !ids.includes(x.id)));

  /* dialogs: [data-close] buttons and backdrop clicks close them */
  HB.wireDialog = function (dlg) {
    dlg.addEventListener('click', e => {
      if (e.target.closest('[data-close]')) { dlg.close('cancel'); return; }
      if (e.target === dlg) {
        const r = dlg.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (!inside) dlg.close('cancel');
      }
    });
  };
})();
