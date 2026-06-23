/* ----------------------------------------------------------------------- *
 *  WETTER (Open-Meteo, Apple-Wetter-Stil) — eigenes Modul, lädt nach app.js
 *  Greift auf app.js-Globals zu (el, save0, escapeHtml, showKeyboard, …),
 *  da klassische <script>-Tags die globale lexikalische Umgebung teilen.
 * ----------------------------------------------------------------------- */
const wxChip = document.getElementById('wxChip');
const wxView = document.getElementById('wxView');
const wxBack = document.getElementById('wxBack');
const ssWeather = document.getElementById('ssWeather');
let _wxData = null;

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
function wxLoc() {
  const lat = localStorage.getItem('wxLat'), lon = localStorage.getItem('wxLon');
  return (lat && lon) ? { lat: lat, lon: lon, name: localStorage.getItem('wxName') || '' } : null;
}
function wxSetLoc(lat, lon, name) { save0('wxLat', lat); save0('wxLon', lon); save0('wxName', name || ''); }

function loadWeather() {
  const fetchFor = (l) => {
    if (!l) return;
    fetch('/api/weather?lat=' + encodeURIComponent(l.lat) + '&lon=' + encodeURIComponent(l.lon))
      .then(r => r.json()).then(d => {
        if (!d || !d.current) return;
        _wxData = d; renderWxChip(); renderSsWeather();
        if (!wxView.classList.contains('hidden')) renderWxView();
      }).catch(() => {});
  };
  const loc = wxLoc();
  if (loc) fetchFor(loc);
  else fetch('/api/iploc').then(r => r.json()).then(d => {
    if (d && d.lat) { wxSetLoc(d.lat, d.lon, d.name || ''); fetchFor(wxLoc()); }
  }).catch(() => {});
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
  document.getElementById('wxCity').textContent = localStorage.getItem('wxName') || 'Wetter';
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
wxChip.addEventListener('click', () => { renderWxView(); wxView.classList.remove('hidden'); });
wxBack.addEventListener('click', () => wxView.classList.add('hidden'));
loadWeather();
setInterval(loadWeather, 30 * 60 * 1000);

/* Einstellungs-Panel "Wetter" (Standort suchen/setzen) */
PANELS.weather = {
  title: 'Wetter',
  render(b) {
    b.appendChild(setSection('Standort'));
    b.appendChild(el('div', 'set-info',
      '<span class="k">Aktuell</span><span class="v">' +
      escapeHtml(localStorage.getItem('wxName') || '– (nicht gesetzt)') + '</span>'));
    const inp = el('input', 'search-input osk-input');
    inp.placeholder = 'Stadt suchen …'; inp.setAttribute('inputmode', 'none'); inp.autocomplete = 'off';
    const results = el('div');
    const doSearch = () => {
      if (!inp.value.trim()) return;
      results.innerHTML = ''; results.appendChild(el('div', 'search-hint', 'Suche …'));
      fetch('/api/geocode?q=' + encodeURIComponent(inp.value.trim())).then(r => r.json()).then(d => {
        results.innerHTML = '';
        const list = (d && d.results) || [];
        if (!list.length) { results.appendChild(el('div', 'search-hint', 'Nichts gefunden.')); return; }
        list.forEach(r => {
          const it = el('button', 'set-item', '<span class="si-label">' +
            escapeHtml(r.name + (r.admin1 ? ', ' + r.admin1 : '') + ' · ' + (r.country || '')) + '</span>');
          it.addEventListener('click', () => {
            wxSetLoc(r.latitude, r.longitude, r.name); hideKeyboard(); _wxData = null; loadWeather(); refresh();
          });
          results.appendChild(it);
        });
      }).catch(() => { results.innerHTML = ''; results.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });
    };
    inp.addEventListener('focus', () => showKeyboard(inp, doSearch));
    inp.addEventListener('click', () => showKeyboard(inp, doSearch));
    const go = el('button', 'set-action', '🔍 Suchen'); go.addEventListener('click', doSearch);
    const row = el('div', 'wifi-pw-row'); row.appendChild(inp); row.appendChild(go);
    b.appendChild(row); b.appendChild(results);
    const ip = el('button', 'set-action', '📍 Automatisch (per IP)');
    ip.addEventListener('click', () => fetch('/api/iploc').then(r => r.json()).then(d => {
      if (d && d.lat) { wxSetLoc(d.lat, d.lon, d.name || ''); _wxData = null; loadWeather(); refresh(); }
      else uiAlert('Standort ließ sich nicht automatisch ermitteln.');
    }).catch(() => uiAlert('Kein Dienst erreichbar.')));
    b.appendChild(ip);
    b.appendChild(el('div', 'set-note',
      'Das Wetter erscheint oben in der Leiste (antippen für die Vollansicht) und im Uhr-Screensaver. Daten: Open-Meteo, kostenlos & ohne Konto.'));
  }
};
