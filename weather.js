/* ----------------------------------------------------------------------- *
 *  WETTER (Open-Meteo, Apple-Stil) — Mehrere Städte + animierter Hintergrund.
 *  Eigenes Modul, lädt nach app.js (geteilte globale Scope: el, save, save0, …).
 * ----------------------------------------------------------------------- */
const wxChip = document.getElementById('wxChip');
const wxView = document.getElementById('wxView');
const wxBack = document.getElementById('wxBack');
const wxFx   = document.getElementById('wxFx');
const wxDots = document.getElementById('wxDots');
const ssWeather = document.getElementById('ssWeather');
let _wxData = null;          // Daten der aktiven Stadt
const _wxCache = {};         // key -> Daten (vermeidet Neuladen beim Wischen)

/* ---- Städte-Liste ---- */
function wxCities() { try { return JSON.parse(localStorage.getItem('wxCities') || '[]'); } catch (e) { return []; } }
function wxSaveCities(a) { save('wxCities', a); }
function wxActiveIdx() {
  const n = wxCities().length;
  let i = parseInt(localStorage.getItem('wxActive') || '0', 10) || 0;
  return Math.max(0, Math.min(n - 1, i));
}
function wxSetActive(i) { save0('wxActive', i); }
(function migrate() {                       // alte Einzelstadt übernehmen
  if (!wxCities().length) {
    const lat = localStorage.getItem('wxLat'), lon = localStorage.getItem('wxLon');
    if (lat && lon) { wxSaveCities([{ name: localStorage.getItem('wxName') || 'Mein Ort', lat: +lat, lon: +lon }]); wxSetActive(0); }
  }
})();

function wxInfo(code, day) {
  const N = !day;
  if (code === 0) return { e: N ? '🌙' : '☀️', label: 'Klar' };
  if (code === 1) return { e: N ? '🌙' : '🌤️', label: 'Überw. klar' };
  if (code === 2) return { e: N ? '☁️' : '⛅', label: 'Teils bewölkt' };
  if (code === 3) return { e: '☁️', label: 'Bewölkt' };
  if (code === 45 || code === 48) return { e: '🌫️', label: 'Nebel' };
  if (code >= 51 && code <= 57) return { e: '🌦️', label: 'Nieselregen' };
  if (code >= 61 && code <= 67) return { e: '🌧️', label: 'Regen' };
  if (code >= 71 && code <= 77) return { e: '🌨️', label: 'Schnee' };
  if (code >= 80 && code <= 82) return { e: '🌦️', label: 'Schauer' };
  if (code >= 85 && code <= 86) return { e: '🌨️', label: 'Schneeschauer' };
  if (code >= 95) return { e: '⛈️', label: 'Gewitter' };
  return { e: '🌡️', label: '—' };
}
function wxTheme(code, day) {
  const N = !day;
  if (code <= 1) return N ? 'wx-clear-night' : 'wx-clear-day';
  if (code === 2 || code === 3) return N ? 'wx-cloud-night' : 'wx-cloud';
  if (code === 45 || code === 48) return 'wx-fog';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'wx-snow';
  if (code >= 95) return 'wx-storm';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'wx-rain';
  return N ? 'wx-clear-night' : 'wx-clear-day';
}

/* ---- Animierter Hintergrund (nur bei offener Ansicht) ---- */
let _wxLightning = null;
function clearFx() { if (wxFx) wxFx.innerHTML = ''; if (_wxLightning) { clearInterval(_wxLightning); _wxLightning = null; } }
function buildFx() {
  if (!wxFx || !_wxData) return;
  clearFx();
  const c = _wxData.current, code = c.weather_code, day = c.is_day;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const add = (cls, n, styler) => { for (let i = 0; i < n; i++) { const e = document.createElement('div'); e.className = cls; styler(e, i); wxFx.appendChild(e); } };
  const drop = (e) => { e.style.left = rnd(0, 100) + '%'; e.style.setProperty('--d', rnd(.5, 1.0) + 's'); e.style.setProperty('--dl', rnd(0, 1.4) + 's'); e.style.opacity = rnd(.3, .7); e.style.height = rnd(14, 26) + 'px'; };

  if (code <= 1 && day) {
    const sun = document.createElement('div'); sun.className = 'wx-sun'; wxFx.appendChild(sun);
  } else if (code <= 1 && !day) {
    add('wx-star', 60, (e) => { e.style.left = rnd(0, 100) + '%'; e.style.top = rnd(0, 72) + '%'; e.style.setProperty('--d', rnd(2, 5) + 's'); e.style.setProperty('--dl', rnd(0, 4) + 's'); const s = rnd(1, 2.6); e.style.width = e.style.height = s + 'px'; });
  } else if (code === 2 || code === 3) {
    add('wx-cloudp', 4, (e, i) => { e.style.top = rnd(4, 42) + '%'; e.style.setProperty('--d', rnd(45, 85) + 's'); e.style.setProperty('--dl', (-i * 14) + 's'); e.style.opacity = day ? .9 : .5; });
  } else if (code === 45 || code === 48) {
    add('wx-fogp', 3, (e, i) => { e.style.top = rnd(20, 70) + '%'; e.style.setProperty('--d', rnd(35, 60) + 's'); e.style.setProperty('--dl', (-i * 12) + 's'); });
  } else if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) {
    add('wx-flake', 50, (e) => { e.style.left = rnd(0, 100) + '%'; e.style.setProperty('--d', rnd(5, 11) + 's'); e.style.setProperty('--dl', rnd(0, 9) + 's'); e.style.setProperty('--x', rnd(-30, 30) + 'px'); const s = rnd(3, 7); e.style.width = e.style.height = s + 'px'; e.style.opacity = rnd(.4, .9); });
  } else if (code >= 95) {
    add('wx-drop', 70, drop);
    const flash = document.createElement('div'); flash.className = 'wx-flash'; wxFx.appendChild(flash);
    const strike = () => { flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on'); };
    _wxLightning = setInterval(strike, 6000); setTimeout(strike, 1500);
  } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    add('wx-drop', 60, drop);
  }
}

/* ---- Laden / Rendern ---- */
function key(c) { return c.lat + ',' + c.lon; }
function loadWeather(force) {
  const cities = wxCities();
  if (!cities.length) {
    fetch('/api/iploc').then(r => r.json()).then(d => {
      if (d && d.lat) { wxSaveCities([{ name: d.name || 'Mein Ort', lat: d.lat, lon: d.lon }]); wxSetActive(0); loadWeather(true); }
    }).catch(() => {});
    return;
  }
  const c = cities[wxActiveIdx()], k = key(c);
  if (_wxCache[k] && !force) { _wxData = _wxCache[k]; afterLoad(); return; }
  fetch('/api/weather?lat=' + encodeURIComponent(c.lat) + '&lon=' + encodeURIComponent(c.lon))
    .then(r => r.json()).then(d => {
      if (!d || !d.current) return;
      d._name = c.name; _wxCache[k] = d; _wxData = d; afterLoad();
    }).catch(() => {});
}
function afterLoad() {
  renderWxChip(); renderSsWeather(); renderDots();
  if (!wxView.classList.contains('hidden')) { renderWxView(); buildFx(); }
}
function renderDots() {
  if (!wxDots) return;
  const cities = wxCities(), ai = wxActiveIdx();
  wxDots.innerHTML = '';
  if (cities.length < 2) return;
  cities.forEach((c, i) => { const d = document.createElement('i'); if (i === ai) d.classList.add('on'); d.onclick = () => { wxSetActive(i); loadWeather(); }; wxDots.appendChild(d); });
}
function renderWxChip() {
  if (!_wxData) return;
  const c = _wxData.current, inf = wxInfo(c.weather_code, c.is_day);
  document.getElementById('wxChipIco').textContent = inf.e;
  document.getElementById('wxChipTemp').textContent = Math.round(c.temperature_2m) + '°';
  wxChip.classList.remove('hidden');
}
function renderSsWeather() {
  if (!_wxData) { ssWeather.classList.add('hidden'); return; }
  const c = _wxData.current, inf = wxInfo(c.weather_code, c.is_day), d = _wxData.daily;
  ssWeather.innerHTML = '<span class="e">' + inf.e + '</span> ' + Math.round(c.temperature_2m) + '° · ' + inf.label
    + (d ? '   ↑' + Math.round(d.temperature_2m_max[0]) + '° ↓' + Math.round(d.temperature_2m_min[0]) + '°' : '');
  ssWeather.classList.remove('hidden');
}
function renderWxView() {
  if (!_wxData) return;
  const c = _wxData.current, h = _wxData.hourly, d = _wxData.daily, inf = wxInfo(c.weather_code, c.is_day);
  const hidden = wxView.classList.contains('hidden');
  wxView.className = 'wx-view ' + wxTheme(c.weather_code, c.is_day) + (hidden ? ' hidden' : '');
  document.getElementById('wxCity').textContent = _wxData._name || 'Wetter';
  document.getElementById('wxTemp').textContent = Math.round(c.temperature_2m) + '°';
  document.getElementById('wxCond').textContent = inf.label;
  document.getElementById('wxHilo').textContent = d
    ? '↑ ' + Math.round(d.temperature_2m_max[0]) + '°   ↓ ' + Math.round(d.temperature_2m_min[0]) + '°' : '';

  const hh = document.getElementById('wxHourly'); hh.innerHTML = '';
  let s = 0;
  if (h && h.time) { s = h.time.findIndex(t => new Date(t) >= new Date()); if (s < 0) s = 0; }
  for (let i = s; i < s + 12 && h && i < h.time.length; i++) {
    const dt = new Date(h.time[i]); const hi = wxInfo(h.weather_code[i], h.is_day ? h.is_day[i] : 1);
    hh.appendChild(el('div', 'wx-h',
      '<span class="t">' + (i === s ? 'Jetzt' : dt.getHours() + ' Uhr') + '</span>' +
      '<span class="e">' + hi.e + '</span>' +
      '<span class="d">' + Math.round(h.temperature_2m[i]) + '°</span>'));
  }

  const dd = document.getElementById('wxDaily'); dd.innerHTML = '';
  if (d && d.time) {
    const wkMin = Math.min.apply(null, d.temperature_2m_min), wkMax = Math.max.apply(null, d.temperature_2m_max);
    const span = Math.max(1, wkMax - wkMin), WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    for (let i = 0; i < d.time.length; i++) {
      const dt = new Date(d.time[i]); const di = wxInfo(d.weather_code[i], 1);
      const lo = d.temperature_2m_min[i], hi = d.temperature_2m_max[i];
      const left = ((lo - wkMin) / span) * 100, w = Math.max(8, ((hi - lo) / span) * 100);
      dd.appendChild(el('div', 'wx-d',
        '<span class="dy">' + (i === 0 ? 'Heute' : WD[dt.getDay()]) + '</span>' +
        '<span class="e">' + di.e + '</span>' +
        '<span class="lo">' + Math.round(lo) + '°</span>' +
        '<span class="wx-bar"><i style="left:' + left + '%;width:' + w + '%"></i></span>' +
        '<span class="hi">' + Math.round(hi) + '°</span>'));
    }
  }

  const det = document.getElementById('wxDetails'); det.innerHTML = '';
  const fmt = (x) => x ? (String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0')) : '–';
  const sr = d && d.sunrise ? new Date(d.sunrise[0]) : null, ssu = d && d.sunset ? new Date(d.sunset[0]) : null;
  [
    { k: 'Gefühlt', v: Math.round(c.apparent_temperature) + '°' },
    { k: 'Luftfeuchte', v: c.relative_humidity_2m + ' %' },
    { k: 'Wind', v: Math.round(c.wind_speed_10m) + ' km/h' },
    { k: 'Sonne', v: '↑ ' + fmt(sr), s: '↓ ' + fmt(ssu) }
  ].forEach(t => det.appendChild(el('div', 'wx-tile',
    '<div class="k">' + t.k + '</div><div class="v">' + t.v + '</div>' + (t.s ? '<div class="s">' + t.s + '</div>' : ''))));
}

/* ---- Öffnen/Schließen + Wischen zwischen Städten ---- */
function openWx() { renderWxView(); buildFx(); wxView.classList.remove('hidden'); }
function closeWx() { wxView.classList.add('hidden'); clearFx(); }
wxChip.addEventListener('click', openWx);
wxBack.addEventListener('click', closeWx);
let _sx = 0, _sy = 0;
wxView.addEventListener('pointerdown', e => { _sx = e.clientX; _sy = e.clientY; });
wxView.addEventListener('pointerup', e => {
  const dx = e.clientX - _sx, dy = e.clientY - _sy;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    const cities = wxCities(); if (cities.length < 2) return;
    let i = (wxActiveIdx() + (dx < 0 ? 1 : -1) + cities.length) % cities.length;
    wxSetActive(i); loadWeather();
  }
});
/* Screensaver/Idle: Wetteransicht schließen, damit die FX-Animation nicht im
   Hintergrund die GPU dauerbelastet. */
new MutationObserver(() => {
  if (!dimOverlay.classList.contains('hidden') && !wxView.classList.contains('hidden')) closeWx();
}).observe(dimOverlay, { attributes: true, attributeFilter: ['class'] });

loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);

/* ---- Einstellungen: Städte verwalten ---- */
PANELS.weather = {
  title: 'Wetter',
  render(b) {
    b.appendChild(setSection('Städte'));
    const list = el('div'); b.appendChild(list);
    const renderList = () => {
      list.innerHTML = '';
      const cities = wxCities(), ai = wxActiveIdx();
      if (!cities.length) { list.appendChild(el('div', 'search-hint', 'Noch keine Stadt – unten suchen & hinzufügen.')); return; }
      cities.forEach((c, i) => {
        const it = el('div', 'station' + (i === ai ? ' playing' : ''),
          '<span class="station-ico">📍</span><span class="station-name">' + escapeHtml(c.name) + '</span>' +
          (i === ai ? '<span class="station-chevron">▶</span>' : ''));
        it.addEventListener('click', () => { wxSetActive(i); loadWeather(); refresh(); });
        const del = el('button', 'station-del', '🗑');
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          const a = wxCities(); a.splice(i, 1); wxSaveCities(a);
          if (wxActiveIdx() >= a.length) wxSetActive(Math.max(0, a.length - 1));
          _wxData = null; loadWeather(); refresh();
        });
        const wrap = el('div', 'wx-city-row'); wrap.appendChild(it); wrap.appendChild(del); list.appendChild(wrap);
      });
    };
    renderList();

    b.appendChild(setSection('Stadt hinzufügen'));
    const inp = el('input', 'search-input osk-input');
    inp.placeholder = 'Stadt suchen …'; inp.setAttribute('inputmode', 'none'); inp.autocomplete = 'off';
    const results = el('div');
    const addCity = (r) => {
      const a = wxCities();
      if (a.some(x => x.lat == r.latitude && x.lon == r.longitude)) { hideKeyboard(); return; }
      a.push({ name: r.name, lat: r.latitude, lon: r.longitude });
      wxSaveCities(a); wxSetActive(a.length - 1); hideKeyboard(); _wxData = null; loadWeather(); refresh();
    };
    const doSearch = () => {
      if (!inp.value.trim()) return;
      results.innerHTML = ''; results.appendChild(el('div', 'search-hint', 'Suche …'));
      fetch('/api/geocode?q=' + encodeURIComponent(inp.value.trim())).then(r => r.json()).then(d => {
        results.innerHTML = '';
        const li = (d && d.results) || [];
        if (!li.length) { results.appendChild(el('div', 'search-hint', 'Nichts gefunden.')); return; }
        li.forEach(r => {
          const it = el('button', 'set-item', '<span class="si-label">' +
            escapeHtml(r.name + (r.admin1 ? ', ' + r.admin1 : '') + ' · ' + (r.country || '')) + '</span><span class="si-chev">＋</span>');
          it.addEventListener('click', () => addCity(r));
          results.appendChild(it);
        });
      }).catch(() => { results.innerHTML = ''; results.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });
    };
    inp.addEventListener('focus', () => showKeyboard(inp, doSearch));
    inp.addEventListener('click', () => showKeyboard(inp, doSearch));
    const go = el('button', 'set-action', '🔍 Suchen'); go.addEventListener('click', doSearch);
    const row = el('div', 'wifi-pw-row'); row.appendChild(inp); row.appendChild(go);
    b.appendChild(row); b.appendChild(results);

    const ip = el('button', 'set-action', '📍 Aktuellen Standort (per IP) hinzufügen');
    ip.addEventListener('click', () => fetch('/api/iploc').then(r => r.json()).then(d => {
      if (d && d.lat) addCity({ name: d.name || 'Mein Ort', latitude: d.lat, longitude: d.lon });
      else uiAlert('Standort ließ sich nicht automatisch ermitteln.');
    }).catch(() => uiAlert('Kein Dienst erreichbar.')));
    b.appendChild(ip);
    b.appendChild(el('div', 'set-note',
      'Mehrere Städte möglich. In der Wetteransicht zwischen ihnen wischen (Punkte oben). ' +
      'Oben in der Leiste 🌤️ antippen öffnet die Ansicht. Daten: Open-Meteo.'));
  }
};
