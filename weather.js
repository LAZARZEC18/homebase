/* Homebase weather: Open-Meteo forecast + geocoding, hand-drawn icons, 24-hour chart, 7-day row. */
(function () {
  'use strict';
  const HB = window.HB, { $, el, store } = HB;

  const FORECAST = 'https://api.open-meteo.com/v1/forecast';
  const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
  const CACHE_MS = 30 * 60 * 1000;
  const DEFAULT_PLACE = { name: 'Perth', detail: 'Western Australia, Australia', lat: -31.95, lon: 115.86 };

  /* ---------- WMO weather codes (as documented by Open-Meteo) ---------- */
  const WMO = {
    0: ['Clear', 'clear'], 1: ['Mainly clear', 'clear'], 2: ['Partly cloudy', 'partly'], 3: ['Overcast', 'cloudy'],
    45: ['Fog', 'fog'], 48: ['Freezing fog', 'fog'],
    51: ['Light drizzle', 'drizzle'], 53: ['Drizzle', 'drizzle'], 55: ['Heavy drizzle', 'drizzle'],
    56: ['Freezing drizzle', 'drizzle'], 57: ['Heavy freezing drizzle', 'drizzle'],
    61: ['Light rain', 'rain'], 63: ['Rain', 'rain'], 65: ['Heavy rain', 'rain'],
    66: ['Freezing rain', 'rain'], 67: ['Heavy freezing rain', 'rain'],
    71: ['Light snow', 'snow'], 73: ['Snow', 'snow'], 75: ['Heavy snow', 'snow'], 77: ['Snow grains', 'snow'],
    80: ['Light showers', 'showers'], 81: ['Showers', 'showers'], 82: ['Heavy showers', 'showers'],
    85: ['Snow showers', 'snow'], 86: ['Heavy snow showers', 'snow'],
    95: ['Thunderstorm', 'storm'], 96: ['Thunderstorm with hail', 'storm'], 99: ['Severe thunderstorm', 'storm']
  };
  const describe = code => WMO[code] || ['Unknown', 'cloudy'];
  HB.describe = describe;

  /* ---------- icons (64×64, gradients defined once in index.html) ---------- */
  const CLOUD = 'M20 50h26a10 10 0 0 0 1.6-19.87A14 14 0 0 0 20.3 33.2 8.5 8.5 0 0 0 20 50z';
  const cloud = (tx, ty, s = 1, dark) => `<path d="${CLOUD}" transform="translate(${tx} ${ty}) scale(${s})" fill="url(#${dark ? 'hbg-cloud2' : 'hbg-cloud'})"/>`;
  function sun(cx, cy, r) {
    let rays = '';
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 4 * k, c = Math.cos(a), s = Math.sin(a);
      rays += `M${(cx + c * (r + 5)).toFixed(1)} ${(cy + s * (r + 5)).toFixed(1)}L${(cx + c * (r + 9.5)).toFixed(1)} ${(cy + s * (r + 9.5)).toFixed(1)}`;
    }
    return `<path d="${rays}" class="wx-rays"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#hbg-sun)"/>`;
  }
  const moon = (cx, cy, r) => `<path fill="url(#hbg-moon)" d="M${cx + r * .35} ${cy - r * .94}A${r} ${r} 0 1 0 ${cx + r * .94} ${cy + r * .35}A${r * .78} ${r * .78} 0 0 1 ${cx + r * .35} ${cy - r * .94}z"/>`;
  const drops = (pts, slant) => `<path class="wx-drop" d="${pts.map(([x, y]) => `M${x} ${y}l${slant ? -3 : -1} ${slant ? 7 : 4.5}`).join('')}"/>`;

  function icon(kind, isDay = true, cls = '') {
    let b;
    switch (kind) {
      case 'clear': b = isDay ? sun(32, 32, 12) : moon(32, 32, 17); break;
      case 'partly': b = (isDay ? sun(24, 23, 9) : moon(24, 22, 12)) + cloud(4, 6, .92); break;
      case 'cloudy': b = cloud(12, -6, .8, true) + cloud(-2, 4); break;
      case 'fog': b = cloud(0, -6) + '<path class="wx-fog" d="M14 52h36M20 59h24"/>'; break;
      case 'drizzle': b = cloud(0, -7) + drops([[23, 50], [33, 52], [43, 50]]); break;
      case 'rain': b = cloud(0, -8, 1, true) + drops([[23, 49], [33, 49], [43, 49]], true); break;
      case 'showers': b = (isDay ? sun(22, 21, 8) : moon(22, 20, 11)) + cloud(4, -1, .9) + drops([[28, 52], [38, 52], [48, 52]], true); break;
      case 'snow': b = cloud(0, -7) + '<g class="wx-flake"><circle cx="23" cy="51" r="2.6"/><circle cx="33" cy="57" r="2.6"/><circle cx="43" cy="51" r="2.6"/></g>'; break;
      case 'storm': b = cloud(0, -9, 1, true) + '<path class="wx-bolt" d="M35 37l-9 12h7l-4 11 12-15h-7l4-8z"/>'; break;
      default: b = cloud(0, 0);
    }
    return `<svg class="wx-icon ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false">${b}</svg>`;
  }
  HB.wxIcon = icon;

  /* ---------- state ---------- */
  let place = store.get('place', null);
  if (!place || typeof place.lat !== 'number' || typeof place.lon !== 'number') place = DEFAULT_PLACE;
  const keyOf = p => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;
  let wx = null;          // { data, at }
  let failure = null;     // { message } when the last attempt failed
  let loading = false;
  let reqId = 0;
  let hoverIdx = null;

  const body = $('#wx-body');
  const card = $('#w-weather');
  const updatedEl = $('#wx-updated');
  const refreshBtn = $('#wx-refresh');

  function renderPlace() {
    $('#wx-place').textContent = place.name;
    $('#wx-detail').textContent = place.detail || '';
  }

  function relTime(at) {
    const mins = Math.floor((Date.now() - at) / 60000);
    if (mins < 1) return 'Updated just now';
    if (mins < 60) return `Updated ${mins} min ago`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `Updated ${h} h ago` : 'Updated over a day ago';
  }
  function renderUpdated() {
    updatedEl.classList.toggle('is-bad', !!failure && !!wx);
    if (loading) { updatedEl.textContent = 'Updating…'; return; }
    updatedEl.textContent = wx ? relTime(wx.at) : '';
  }

  /* ---------- parse helpers ---------- */
  const hmOf = iso => { const m = /T(\d{2}):(\d{2})/.exec(iso || ''); return m ? [+m[1], +m[2]] : null; };
  const dayName = (iso, i) => {
    if (i === 0) return 'Today';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('en-AU', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
  };
  const uvWord = u => u < 3 ? 'Low' : u < 6 ? 'Moderate' : u < 8 ? 'High' : u < 11 ? 'Very high' : 'Extreme';
  function hoursFrom(data) {
    const h = data.hourly, c = data.current || {};
    const key = (c.time || '').slice(0, 13) + ':00';
    let start = h.time.findIndex(t => t >= key);
    if (start < 0) start = 0;
    const out = [];
    for (let i = start; i < Math.min(start + 24, h.time.length); i++) {
      const hm = hmOf(h.time[i]) || [0, 0];
      out.push({
        hour: hm[0], temp: h.temperature_2m[i],
        pop: h.precipitation_probability ? (h.precipitation_probability[i] ?? 0) : 0,
        code: h.weather_code ? h.weather_code[i] : 3,
        day: h.is_day ? h.is_day[i] !== 0 : (hm[0] >= 6 && hm[0] < 19),
        uv: h.uv_index ? h.uv_index[i] : null
      });
    }
    return out;
  }
  HB.hoursFrom = hoursFrom;

  /* ---------- render ---------- */
  function renderSkeleton() {
    body.replaceChildren(el('div', { class: 'wx-skel', 'aria-hidden': 'true' },
      el('div', { class: 'sk sk-a' }), el('div', { class: 'sk sk-b' }), el('div', { class: 'sk sk-c' })),
      el('p', { class: 'sr-only', text: 'Loading the weather' }));
  }
  function renderError() {
    body.replaceChildren(el('div', { class: 'wx-error', id: 'wx-error', role: 'alert' },
      el('div', { class: 'wx-error-ico', html: icon('cloudy') }),
      el('h3', { text: "Weather isn't available right now" }),
      el('p', { id: 'wx-error-msg', text: failure.message }),
      el('button', { class: 'zl-btn zl-btn-primary', type: 'button', id: 'wx-retry', text: 'Try again', onclick: () => load(true) })));
  }

  function render() {
    renderPlace();
    renderUpdated();
    if (!wx) { if (failure) renderError(); else renderSkeleton(); return; }
    const d = wx.data, c = d.current, dy = d.daily;
    const [cond, kind] = describe(c.weather_code);
    const isDay = c.is_day !== 0;
    const hours = hoursFrom(d);
    const uv = (hours[0] && hours[0].uv != null) ? hours[0].uv : (dy.uv_index_max ? dy.uv_index_max[0] : null);
    const rise = hmOf(dy.sunrise && dy.sunrise[0]), set = hmOf(dy.sunset && dy.sunset[0]);
    const rainToday = dy.precipitation_probability_max ? dy.precipitation_probability_max[0] : (hours[0] ? hours[0].pop : null);

    const stat = (label, id, value, small) => el('div', { class: 'wx-stat' },
      el('dt', { text: label }), el('dd', { id }, value, small ? el('small', { text: small }) : null));

    const now = el('div', { class: 'wx-now' },
      el('div', { class: 'wx-main' },
        el('span', { class: 'wx-now-ico', html: icon(kind, isDay, 'lg') }),
        el('span', { class: 'wx-temp num', id: 'wx-temp', text: HB.temp(c.temperature_2m) }),
        el('div', { class: 'wx-desc' },
          el('p', { class: 'wx-cond', id: 'wx-cond', text: cond }),
          el('p', { id: 'wx-feels', text: `Feels like ${HB.temp(c.apparent_temperature ?? c.temperature_2m)}` }),
          el('p', { id: 'wx-hilo', class: 'num', text: `High ${HB.temp(dy.temperature_2m_max[0])}  Low ${HB.temp(dy.temperature_2m_min[0])}` }))),
      el('dl', { class: 'wx-stats', id: 'wx-stats' },
        stat('Rain today', 'wx-rain', rainToday == null ? '--' : `${Math.round(rainToday)}%`),
        stat('Wind', 'wx-wind', HB.wind(c.wind_speed_10m ?? 0)),
        stat('UV index', 'wx-uv', uv == null ? '--' : String(Math.round(uv)), uv == null ? '' : uvWord(uv)),
        stat('Humidity', 'wx-hum', c.relative_humidity_2m == null ? '--' : `${Math.round(c.relative_humidity_2m)}%`),
        stat('Sunrise', 'wx-sunrise', rise ? HB.hm(rise[0], rise[1]) : '--'),
        stat('Sunset', 'wx-sunset', set ? HB.hm(set[0], set[1]) : '--')));

    const kids = [now];
    if (failure) {
      kids.push(el('div', { class: 'wx-warn', id: 'wx-warn', role: 'status' },
        el('span', { html: ZL.icons.alert }), el('span', { text: failure.message + ' Showing the last forecast.' }),
        el('button', { class: 'zl-btn zl-btn-ghost zl-btn-sm', type: 'button', text: 'Try again', onclick: () => load(true) })));
    }
    const chartWrap = el('div', { class: 'wx-chart-wrap', id: 'wx-chart-wrap' },
      el('div', { class: 'wx-chart-head' },
        el('h3', { text: 'Next 24 hours' }),
        el('span', { class: 'wx-legend', 'aria-hidden': 'true' },
          el('span', {}, el('i', { class: 'lg-temp' }), 'Temperature'),
          el('span', {}, el('i', { class: 'lg-rain' }), 'Rain chance'))),
      el('div', { class: 'wx-chart', id: 'wx-chart' }),
      el('div', { class: 'wx-tip', id: 'wx-tip', hidden: true }),
      el('p', { class: 'sr-only', id: 'wx-chart-live', 'aria-live': 'polite' }));
    kids.push(chartWrap);

    const lo = Math.min(...dy.temperature_2m_min.slice(0, 7)), hi = Math.max(...dy.temperature_2m_max.slice(0, 7));
    const days = el('ol', { class: 'wx-days', id: 'wx-days', 'aria-label': 'Next 7 days' });
    for (let i = 0; i < Math.min(7, dy.time.length); i++) {
      const [dc, dk] = describe(dy.weather_code[i]);
      const mn = dy.temperature_2m_min[i], mx = dy.temperature_2m_max[i];
      const pop = dy.precipitation_probability_max ? dy.precipitation_probability_max[i] : null;
      const span = Math.max(1, hi - lo);
      const bar = el('span', { class: 'wx-range', 'aria-hidden': 'true' }, el('i', { style: `left:${((mn - lo) / span * 100).toFixed(1)}%;right:${((hi - mx) / span * 100).toFixed(1)}%` }));
      days.append(el('li', { class: 'wx-day', title: dc },
        el('span', { class: 'wx-dname', text: dayName(dy.time[i], i) }),
        el('span', { html: icon(dk, true, 'sm') }),
        el('span', { class: 'wx-dpop' + (pop >= 20 ? '' : ' is-low'), text: pop == null ? '' : `${Math.round(pop)}%` }),
        el('span', { class: 'wx-dtemps num' }, el('b', { class: 'wx-dhi', text: HB.temp(mx) }), el('span', { class: 'wx-dlo', text: HB.temp(mn) })),
        bar,
        el('span', { class: 'sr-only', text: `${dc}. High ${HB.temp(mx)}, low ${HB.temp(mn)}${pop == null ? '' : `, ${Math.round(pop)}% chance of rain`}.` })));
    }
    kids.push(days);
    body.replaceChildren(...kids);
    drawChart(hours);
    HB.status('weather', `${place.name} ${HB.temp(c.temperature_2m)}`);
  }

  /* ---------- 24-hour chart ---------- */
  function monotone(pts) {
    const n = pts.length;
    if (n < 2) return '';
    const dx = [], m = [], t = [];
    for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
    t[0] = m[0]; t[n - 1] = m[n - 2];
    for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
      if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
    }
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      d += `C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + h * t[i]).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - h * t[i + 1]).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
    }
    return d;
  }

  let chart = null; // geometry for hit-testing
  let introDone = false;
  function drawChart(hours) {
    const host = $('#wx-chart');
    if (!host || !hours.length) return;
    const W = Math.max(280, Math.round(host.clientWidth || 600));
    const H = W < 480 ? 176 : 196;
    const padL = 34, padR = 10, padT = 26, padB = 28;
    const rainH = 34;
    const n = hours.length, step = (W - padL - padR) / n;
    const temps = hours.map(h => HB.toUnit(h.temp));
    let tMin = Math.floor(Math.min(...temps)), tMax = Math.ceil(Math.max(...temps));
    if (tMax - tMin < 4) { const mid = (tMax + tMin) / 2; tMin = Math.floor(mid - 2); tMax = Math.ceil(mid + 2); }
    const bandTop = padT, bandBot = H - padB - rainH - 12;
    const xAt = i => padL + step * (i + .5);
    const yAt = v => bandBot - (v - tMin) / (tMax - tMin) * (bandBot - bandTop);
    const base = H - padB;
    const pts = temps.map((v, i) => [xAt(i), yAt(v)]);
    const line = monotone(pts);
    const area = `${line}L${pts[n - 1][0].toFixed(1)},${bandBot + 8}L${pts[0][0].toFixed(1)},${bandBot + 8}Z`;
    const mid = Math.round((tMin + tMax) / 2);
    const ticks = [tMax, mid, tMin];
    const every = step < 18 ? 6 : 3;
    const bw = Math.min(step * .56, 14);

    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" id="wx-chart-svg" tabindex="0" role="img" aria-label="${summary(hours)}">`;
    s += '<g class="c-grid">' + ticks.map(v => `<line x1="${padL}" x2="${W - padR}" y1="${yAt(v).toFixed(1)}" y2="${yAt(v).toFixed(1)}"/>`).join('') +
      `<line class="c-base" x1="${padL}" x2="${W - padR}" y1="${base}" y2="${base}"/></g>`;
    s += '<g class="c-ylab">' + ticks.map(v => `<text x="${padL - 8}" y="${(yAt(v) + 4).toFixed(1)}">${v}°</text>`).join('') + '</g>';
    s += '<g class="c-bars">' + hours.map((h, i) => {
      const bh = Math.max(h.pop > 0 ? 2 : 0, h.pop / 100 * rainH);
      return `<rect data-i="${i}" x="${(xAt(i) - bw / 2).toFixed(1)}" y="${(base - bh).toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${Math.min(3, bw / 2).toFixed(1)}"/>`;
    }).join('') + '</g>';
    s += `<path class="c-area" d="${area}" fill="url(#hbg-temp)"/><path class="c-line" d="${line}" pathLength="1"/>`;
    s += '<g class="c-xlab">' + hours.map((h, i) => i % every ? '' : `<text x="${xAt(i).toFixed(1)}" y="${H - 8}">${i === 0 ? 'Now' : HB.hm(h.hour, 0, true)}</text>`).join('') + '</g>';
    s += `<circle class="c-now" cx="${pts[0][0].toFixed(1)}" cy="${pts[0][1].toFixed(1)}" r="4"/>`;
    s += `<g class="c-hover" id="wx-hover" visibility="hidden"><line id="wx-guide" y1="${padT - 12}" y2="${base}"/><circle id="wx-dot" r="6"/></g>`;
    s += '</svg>';
    host.innerHTML = s;
    if (!introDone) { introDone = true; host.classList.add('is-intro'); setTimeout(() => host.classList.remove('is-intro'), 1800); }
    chart = { pts, hours, padL, step, n, W };
    const svg = host.firstChild;
    svg.addEventListener('pointermove', onPoint);
    svg.addEventListener('pointerdown', onPoint);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });
    svg.addEventListener('focus', () => showTip(hoverIdx ?? 0, true));
    svg.addEventListener('blur', hideTip);
    svg.addEventListener('keydown', e => {
      const map = { ArrowRight: 1, ArrowLeft: -1 };
      let i = hoverIdx ?? 0;
      if (e.key in map) i = Math.min(n - 1, Math.max(0, i + map[e.key]));
      else if (e.key === 'Home') i = 0; else if (e.key === 'End') i = n - 1; else return;
      e.preventDefault(); showTip(i, true);
    });
    if (hoverIdx != null && hoverIdx < n && document.activeElement === svg) showTip(hoverIdx);
  }
  function summary(hours) {
    const temps = hours.map(h => h.temp);
    const iMax = temps.indexOf(Math.max(...temps)), iMin = temps.indexOf(Math.min(...temps));
    const pops = hours.map(h => h.pop), iPop = pops.indexOf(Math.max(...pops));
    const at = i => i === 0 ? 'now' : 'at ' + HB.hm(hours[i].hour, 0, true);
    return `Next 24 hours. High ${HB.temp(temps[iMax])} ${at(iMax)}, low ${HB.temp(temps[iMin])} ${at(iMin)}. ` +
      (pops[iPop] > 0 ? `Highest rain chance ${Math.round(pops[iPop])}% ${at(iPop)}.` : 'No rain expected.') + ' Use the arrow keys to step through each hour.';
  }
  function onPoint(e) {
    if (!chart) return;
    const svg = e.currentTarget, r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) * (chart.W / r.width);
    const i = Math.min(chart.n - 1, Math.max(0, Math.floor((x - chart.padL) / chart.step)));
    showTip(i);
  }
  function showTip(i, announce) {
    if (!chart) return;
    hoverIdx = i;
    const [x, y] = chart.pts[i], h = chart.hours[i];
    const g = $('#wx-hover'), tip = $('#wx-tip');
    if (!g || !tip) return;
    g.setAttribute('visibility', 'visible');
    $('#wx-guide').setAttribute('x1', x); $('#wx-guide').setAttribute('x2', x);
    $('#wx-dot').setAttribute('cx', x); $('#wx-dot').setAttribute('cy', y);
    document.querySelectorAll('#wx-chart .c-bars rect').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    const when = i === 0 ? 'Now' : HB.hm(h.hour, 0, true);
    const cond = describe(h.code)[0];
    tip.innerHTML = '';
    tip.append(el('span', { class: 'wx-tip-ico', html: icon(describe(h.code)[1], h.day, 'xs') }),
      el('span', { class: 'wx-tip-text' },
        el('b', { text: `${when}  ${HB.temp(h.temp)}` }),
        el('span', { text: `${cond}, rain ${Math.round(h.pop)}%` })));
    tip.hidden = false;
    const wrap = $('#wx-chart-wrap'), svg = $('#wx-chart-svg');
    const scale = svg.getBoundingClientRect().width / chart.W;
    const left = svg.getBoundingClientRect().left - wrap.getBoundingClientRect().left + x * scale;
    const tw = tip.offsetWidth;
    tip.style.left = Math.min(Math.max(0, left - tw / 2), wrap.clientWidth - tw) + 'px';
    if (announce) $('#wx-chart-live').textContent = `${when}: ${HB.temp(h.temp)}, ${cond}, ${Math.round(h.pop)}% chance of rain.`;
  }
  function hideTip() {
    hoverIdx = null;
    const g = $('#wx-hover'), tip = $('#wx-tip');
    if (g) g.setAttribute('visibility', 'hidden');
    if (tip) tip.hidden = true;
    document.querySelectorAll('#wx-chart .c-bars rect.on').forEach(b => b.classList.remove('on'));
  }
  let rzTimer;
  new ResizeObserver(() => {
    clearTimeout(rzTimer);
    rzTimer = setTimeout(() => { if (wx) drawChart(hoursFrom(wx.data)); }, 60);
  }).observe(card);

  /* ---------- fetching ---------- */
  function forecastUrl(p) {
    const q = new URLSearchParams({
      latitude: String(p.lat), longitude: String(p.lon),
      current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m,relative_humidity_2m',
      hourly: 'temperature_2m,precipitation_probability,weather_code,is_day,uv_index',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
      timezone: 'auto', forecast_days: '8'
    });
    return `${FORECAST}?${q}`;
  }
  const valid = d => d && d.current && d.hourly && Array.isArray(d.hourly.time) && d.daily && Array.isArray(d.daily.time) && Array.isArray(d.daily.temperature_2m_max);

  async function load(force) {
    if (!HB.widgetOn('weather') && !force) return;
    const id = ++reqId;
    const cached = store.get('wx', null);
    const usable = cached && cached.key === keyOf(place) && valid(cached.data) ? cached : null;
    if (usable && !wx) wx = { data: usable.data, at: usable.at };
    if (usable && !force && Date.now() - usable.at < CACHE_MS) { failure = null; render(); return; }
    loading = true;
    card.setAttribute('aria-busy', 'true');
    refreshBtn.classList.add('is-spinning');
    refreshBtn.disabled = true;
    if (!wx) { failure = null; }
    render();
    try {
      const res = await fetch(forecastUrl(place));
      if (!res.ok) throw Object.assign(new Error('http'), { status: res.status });
      const data = await res.json();
      if (!valid(data)) throw new Error('shape');
      if (id !== reqId) return;
      wx = { data, at: Date.now() };
      failure = null;
      store.set('wx', { key: keyOf(place), at: wx.at, data });
      if (force) ZL.toast(`Weather updated for ${place.name}`);
    } catch (err) {
      if (id !== reqId) return;
      const offline = navigator.onLine === false;
      failure = {
        message: offline ? "You're offline, so the forecast can't refresh. It will update when you reconnect."
          : err.status ? `The weather service is busy (error ${err.status}). Try again in a minute.`
            : err.message === 'shape' ? 'The weather service sent something unexpected. Try again in a minute.'
              : "Couldn't reach the weather service. Check your connection, then try again."
      };
      if (!wx) HB.status('weather', 'Weather offline');
      if (force) ZL.toast("Couldn't update the weather", { type: 'bad' });
    } finally {
      if (id === reqId) {
        loading = false;
        card.setAttribute('aria-busy', 'false');
        refreshBtn.classList.remove('is-spinning');
        refreshBtn.disabled = false;
        render();
      }
    }
  }

  refreshBtn.addEventListener('click', () => load(true));
  setInterval(() => {
    renderUpdated();
    if (document.visibilityState === 'visible' && wx && Date.now() - wx.at >= CACHE_MS && !loading) load(false);
  }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(false); });
  addEventListener('online', () => { if (failure) load(true); });
  HB.on('settings', () => { if (wx || failure) render(); });

  /* ---------- city dialog ---------- */
  const dlg = $('#city-dlg'), form = $('#city-form'), cq = $('#city-q'), results = $('#city-results'), msg = $('#city-msg');
  const searchBtn = $('#city-search'), locBtn = $('#city-locate');
  HB.wireDialog(dlg);
  const setMsg = (text, bad) => { msg.textContent = text; msg.classList.toggle('zl-error', !!bad); msg.classList.toggle('zl-hint', !bad); cq.toggleAttribute('aria-invalid', !!bad); if (bad) cq.setAttribute('aria-invalid', 'true'); };
  $('#wx-change').addEventListener('click', openCity);
  function openCity() {
    cq.value = ''; results.replaceChildren();
    setMsg('Search by name, then pick the right place from the list.');
    dlg.showModal(); cq.focus();
  }
  HB.openCity = openCity;
  cq.addEventListener('input', () => { if (cq.getAttribute('aria-invalid')) setMsg('Search by name, then pick the right place from the list.'); });

  function choose(p, how) {
    place = p;
    store.set('place', place);
    wx = null; failure = null; hoverIdx = null;
    if (dlg.open) dlg.close();
    renderPlace();
    ZL.toast(how === 'loc' ? 'Weather set to your location' : `Weather set to ${p.name}`);
    load(false);
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const q = cq.value.trim();
    results.replaceChildren();
    if (q.length < 2) { setMsg('Type at least two letters of a city or town.', true); cq.focus(); return; }
    setMsg('Searching…');
    searchBtn.disabled = true; searchBtn.textContent = 'Searching…';
    try {
      const res = await fetch(`${GEOCODE}?${new URLSearchParams({ name: q, count: '6', language: 'en', format: 'json' })}`);
      if (!res.ok) throw new Error('http');
      const data = await res.json();
      const list = data && Array.isArray(data.results) ? data.results : [];
      if (!list.length) { setMsg(`No places match "${q}". Check the spelling or try a larger town nearby.`, true); return; }
      setMsg(`${HB.plural(list.length, 'place matches', 'places match')}. Pick one.`);
      list.forEach(r => {
        const detail = [r.admin1, r.country].filter((v, i, a) => v && v !== r.name && a.indexOf(v) === i).join(', ');
        results.append(el('li', {}, el('button', {
          type: 'button', class: 'hb-city',
          onclick: () => choose({ name: r.name, detail, lat: r.latitude, lon: r.longitude })
        }, el('span', { class: 'hb-city-ico', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>' }),
        el('span', {}, el('b', { text: r.name }), detail ? el('small', { text: detail }) : null))));
      });
    } catch (err) {
      setMsg(navigator.onLine === false ? "You're offline, so places can't be searched right now." : "Couldn't reach the place search. Check your connection and try again.", true);
    } finally {
      searchBtn.disabled = false; searchBtn.textContent = 'Search';
    }
  });
  locBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) { setMsg("This browser can't share your location. Search for a city instead.", true); return; }
    results.replaceChildren();
    setMsg('Finding your location…');
    locBtn.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      locBtn.disabled = false;
      const lat = Math.round(pos.coords.latitude * 100) / 100, lon = Math.round(pos.coords.longitude * 100) / 100;
      const f = (v, a, b) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? a : b}`;
      choose({ name: 'Your location', detail: `${f(lat, 'N', 'S')}, ${f(lon, 'E', 'W')}`, lat, lon }, 'loc');
    }, err => {
      locBtn.disabled = false;
      setMsg(err && err.code === 1 ? 'Location access is blocked. Allow it in your browser settings, or search for a city instead.'
        : "Couldn't find your location. Try again, or search for a city instead.", true);
    }, { timeout: 10000, maximumAge: 600000 });
  });

  /* ---------- public ---------- */
  HB.weather = {
    load, render,
    getPlace: () => place,
    setPlace: p => { if (p && typeof p.lat === 'number' && typeof p.lon === 'number') { place = p; store.set('place', p); wx = null; failure = null; } },
    redraw: () => { if (wx) drawChart(hoursFrom(wx.data)); }
  };
})();
