/* =========================================================================
   Schlaf-Radio — eigene App für 400x1280 Touch-Display
   Zwei Modi: (1) Sound-Mixer (synthetisch, ohne Dateien)  (2) Internet-Radio
   ========================================================================= */

'use strict';

/* ----------------------------------------------------------------------- *
 * 1) AUDIO-KONTEXT
 * ----------------------------------------------------------------------- */
let ctx = null;                 // wird beim ersten Tippen erstellt (Autoplay-Policy)
let masterGain = null;          // Summen-Lautstärke der Sounds
const FADE = 0.9;               // Ein-/Ausblendzeit pro Sound in Sekunden

function ensureCtx() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = ctx.createGain();
  masterGain.gain.value = effectiveMaster();
  masterGain.connect(ctx.destination);
}

/* ----------------------------------------------------------------------- *
 * 2) SOUND-DATEIEN laden & dekodieren (echte Aufnahmen, dann geloopt)
 * ----------------------------------------------------------------------- */
const bufferCache = {};
function loadSound(file) {
  if (bufferCache[file]) return Promise.resolve(bufferCache[file]);
  return fetch(file)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then(a => ctx.decodeAudioData(a))
    .then(buf => (bufferCache[file] = buf));
}

/* ----------------------------------------------------------------------- *
 * 3) SOUND-DEFINITIONEN — echte Loop-Dateien (Quellen: siehe sounds/ATTRIBUTION.md)
 * ----------------------------------------------------------------------- */
const SOUND_DEFS = [
  { id:'rain',        emoji:'🌧️', name:'Regen',          file:'sounds/rain.ogg' },
  { id:'storm',       emoji:'⛈️', name:'Gewitter',       file:'sounds/storm.ogg' },
  { id:'waves',       emoji:'🌊', name:'Meereswellen',   file:'sounds/waves.ogg' },
  { id:'stream',      emoji:'🏞️', name:'Bach',           file:'sounds/stream.ogg' },
  { id:'wind',        emoji:'🍃', name:'Wind',           file:'sounds/wind.ogg' },
  { id:'fireplace',   emoji:'🔥', name:'Kaminfeuer',     file:'sounds/fireplace.ogg' },
  { id:'birds',       emoji:'🐦', name:'Vögel',          file:'sounds/birds.ogg' },
  { id:'summernight', emoji:'🦗', name:'Sommernacht',    file:'sounds/summer-night.ogg' },
  { id:'train',       emoji:'🚂', name:'Zug',            file:'sounds/train.ogg' },
  { id:'boat',        emoji:'⛵', name:'Boot',            file:'sounds/boat.ogg' },
  { id:'city',        emoji:'🏙️', name:'Stadt',          file:'sounds/city.ogg' },
  { id:'coffee',      emoji:'☕', name:'Café',            file:'sounds/coffee-shop.ogg' },
  { id:'white',       emoji:'⚪', name:'Weißes Rauschen', file:'sounds/white-noise.ogg' },
  { id:'pink',        emoji:'🔴', name:'Rosa Rauschen',   file:'sounds/pink-noise.ogg' },
];

/* ----------------------------------------------------------------------- *
 * 4) SOUND-OBJEKT — kapselt Lautstärke + Start/Stop pro Sound
 * ----------------------------------------------------------------------- */
class Sound {
  constructor(def) {
    this.def = def;
    this.playing = false;
    this.gain = null;
    this.source = null;
    this.volume = readNum('vol_' + def.id, 0.6);
  }
  _ensureGain() {
    if (!this.gain) {
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(masterGain);
    }
  }
  start() {
    ensureCtx();
    this._ensureGain();
    if (this.playing) return;
    this.playing = true;
    if (this._card) this._card.classList.add('loading');
    loadSound(this.def.file).then(buf => {
      if (this._card) this._card.classList.remove('loading');
      if (!this.playing) return;                    // inzwischen wieder ausgeschaltet
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      src.connect(this.gain);
      const now = ctx.currentTime;                  // sanft einfaden
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(0.0001, now);
      this.gain.gain.linearRampToValueAtTime(Math.max(0.0001, this.volume), now + FADE);
      src.start();
      this.source = src;
    }).catch(() => {
      this.playing = false;
      if (this._card) this._card.classList.remove('loading', 'on');
    });
    if (typeof notePlayback === 'function') notePlayback();
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    if (this._card) this._card.classList.remove('loading');
    const src = this.source;
    this.source = null;
    if (src) {                                       // sanft ausfaden, dann anhalten
      const now = ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(this.gain.gain.value, now);
      this.gain.gain.linearRampToValueAtTime(0.0001, now + FADE);
      setTimeout(() => { try { src.stop(); } catch(e){} try { src.disconnect(); } catch(e){} }, FADE * 1000 + 60);
    }
    if (typeof notePlayback === 'function') notePlayback();
  }
  setVolume(v) {
    this.volume = v;
    if (this.gain && this.playing) {
      const now = ctx.currentTime;
      this.gain.gain.cancelScheduledValues(now);
      this.gain.gain.setValueAtTime(Math.max(0.0001, v), now);
    } else if (this.gain) {
      this.gain.gain.value = v;
    }
    save('vol_' + this.def.id, v);
  }
}

const sounds = SOUND_DEFS.map(d => new Sound(d));

/* Farbe pro Sound für die glossy Icon-Kacheln (Squeezebox-Look) */
const COLORS = {
  rain:'#3f72c4', storm:'#3b4a6b', waves:'#1f9c92', stream:'#2a8fb0',
  wind:'#4fae62', fireplace:'#c0622a', birds:'#5a9e4f', summernight:'#4d6a8c',
  train:'#8a6d4b', boat:'#2f7fa8', city:'#7a7f8c', coffee:'#9a6a44',
  white:'#9aa6bb', pink:'#c76b95'
};

/* ----------------------------------------------------------------------- *
 * 5) UI: SOUND-KARTEN AUFBAUEN
 * ----------------------------------------------------------------------- */
const listEl = document.getElementById('list');

sounds.forEach(snd => {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    `<div class="card-head">
       <span class="card-emoji">${snd.def.emoji}</span>
       <span class="card-name">${snd.def.name}</span>
       <span class="card-dot"></span>
     </div>
     <input class="slider" type="range" min="0" max="100" value="${Math.round(snd.volume*100)}" />`;

  const slider = card.querySelector('.slider');

  // farbige Icon-Kachel
  const tile = card.querySelector('.card-emoji');
  if (COLORS[snd.def.id]) tile.style.background = COLORS[snd.def.id];

  // Karte antippen = an/aus (außer auf dem Slider)
  card.querySelector('.card-head').addEventListener('click', () => {
    if (snd.playing) { snd.stop(); card.classList.remove('on'); }
    else             { snd.start(); card.classList.add('on'); }
    saveActive();
  });

  // Lautstärke regeln
  slider.addEventListener('input', () => snd.setVolume(slider.value / 100));

  listEl.appendChild(card);
  snd._card = card;
});

/* Master-Lautstärke */
const masterSlider = document.getElementById('master');
masterSlider.addEventListener('input', () => {
  const v = masterSlider.value / 100;
  save('master', v);
  if (masterGain) masterGain.gain.value = Math.min(v, readNum('volLimit', 100) / 100);
});
function effectiveMaster() { return Math.min(readNum('master', 0.8), readNum('volLimit', 100) / 100); }
function applyVolLimit()   { if (masterGain) masterGain.gain.value = effectiveMaster(); }

/* ----------------------------------------------------------------------- *
 * 6) INTERNET-RADIO (TuneIn / Web-Radio via direkter Stream-URL)
 * ----------------------------------------------------------------------- */
const DEFAULT_STATIONS = [
  { name:'SomaFM Drone Zone (Ambient)', url:'https://ice2.somafm.com/dronezone-128-mp3',   logo:'https://somafm.com/img3/dronezone-400.jpg' },
  { name:'SomaFM Deep Space One',       url:'https://ice2.somafm.com/deepspaceone-128-mp3', logo:'https://somafm.com/img3/deepspaceone-400.jpg' },
  { name:'SomaFM Groove Salad',         url:'https://ice2.somafm.com/groovesalad-128-mp3',  logo:'https://somafm.com/img3/groovesalad-400.jpg' },
  { name:'Radio Paradise (Mellow)',     url:'https://stream.radioparadise.com/mellow-128' },
  { name:'Calm Radio – Sleep (Demo)',   url:'https://streams.calmradio.com/api/39/128/stream' },
];

let stations = JSON.parse(localStorage.getItem('stations_v2') || 'null') || DEFAULT_STATIONS.slice();
let currentStation = -1;          // Index in der Liste (-1 = spielt etwas Ungespeichertes)
let currentStream = null;         // {name,url,logo} – was gerade läuft (auch Suchtreffer)
let closeOpenRow = null;          // schließt die aktuell aufgewischte Sender-Zeile

const audio = new Audio();
audio.preload = 'none';
audio.volume = readNum('radioVol', 0.8);

/* Auto-Reconnect bei Streamabbruch / Unterbrechung */
let radioIntended = false;       // soll der aktuelle Sender laufen?
let reconnectTimer = null;
let reconnectDelay = 2000;       // Backoff-Startwert
const RECONNECT_MAX = 30000;

function attemptReconnect() {
  if (!radioIntended || !currentStream) return;
  npState.textContent = 'neu verbinden …';
  audio.src = currentStream.url;
  audio.play().catch(() => {});
}
function scheduleReconnect() {
  if (!radioIntended || reconnectTimer) return;
  npState.textContent = 'Verbindung verloren – neu verbinden …';
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    attemptReconnect();
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX);   // Backoff erhöhen
  }, reconnectDelay);
}
function reconnectNow() {                 // bei wiederkehrender Verbindung
  clearTimeout(reconnectTimer); reconnectTimer = null;
  reconnectDelay = 2000;
  attemptReconnect();
}
function cancelReconnect() {
  clearTimeout(reconnectTimer); reconnectTimer = null;
  reconnectDelay = 2000;
}

const stationsEl = document.getElementById('stations');
const npArt   = document.getElementById('npArt');
const npName  = document.getElementById('npName');
const npTrack = document.getElementById('npTrack');
const npState = document.getElementById('npState');
const npToggle= document.getElementById('npToggle');
const npCover    = document.getElementById('npCover');
const npCoverImg = document.getElementById('npCoverImg');

/* Aktuell laufende Sendung/Song + optionales Cover über das Backend pollen */
let npPollTimer = null;
let npArtUrl = null;          // aktuell gezeigtes Cover (null = Senderlogo)

function collapseCover() { npCover.classList.remove('show'); npArtUrl = null; }

/* Senderlogo bleibt oben; das Cover erscheint smooth UNTERHALB, sobald da */
function updateNpArt(art) {
  if (art) {
    if (art === npArtUrl) return;                 // unverändert → nichts tun
    npArtUrl = art;
    npCoverImg.onload  = () => npCover.classList.add('show');    // erst zeigen, wenn geladen
    npCoverImg.onerror = () => collapseCover();                 // kein Cover → einklappen
    npCoverImg.src = imgProxy(art);
  } else if (npArtUrl !== null) {                 // Track ohne Cover → einklappen
    collapseCover();
  }
}
function startNowPlay(url) {
  stopNowPlay();
  const tick = () => {
    fetch('/api/nowplaying?url=' + encodeURIComponent(url))
      .then(r => r.json())
      .then(d => { setNpTrack(d.title || ''); updateNpArt(d.art || ''); })
      .catch(() => {});
  };
  tick();                                   // sofort
  npPollTimer = setInterval(tick, 20000);   // dann alle 20 s
}
function stopNowPlay() {
  clearInterval(npPollTimer); npPollTimer = null;
  npTrack.innerHTML = '';
  collapseCover();
}

/* registrierbare Domain aus der Stream-URL (für Favicon-Fallback) */
function regDomain(url) {
  try {
    const h = new URL(url).hostname.split('.');
    return h.length > 2 ? h.slice(-2).join('.') : h.join('.');
  } catch(e) { return null; }
}

/* Bilder über den lokalen Proxy laden (gleiche Herkunft, Zert.-tolerant) */
function imgProxy(url) { return '/api/img?url=' + encodeURIComponent(url); }

/* Icon-Element für einen Sender: Logo → Favicon → 📡 (mit Fallback-Kette) */
function stationIcon(st) {
  const candidates = [];
  if (st.logo) candidates.push(st.logo);
  const d = regDomain(st.url);
  if (d) candidates.push(`https://icons.duckduckgo.com/ip3/${d}.ico`);
  if (!candidates.length) return document.createTextNode('📡');
  const img = document.createElement('img');
  img.className = 'ico-img';
  let i = 0;
  img.src = imgProxy(candidates[0]);
  img.onerror = () => {
    i++;
    if (i < candidates.length) img.src = imgProxy(candidates[i]);
    else img.replaceWith(document.createTextNode('📡'));
  };
  return img;
}

/* Text in einen Container setzen, bei Überlänge sanft scrollen lassen */
function marqueeText(container, text) {
  container.innerHTML = `<span class="mq-inner">${escapeHtml(text)}</span>`;
  const inner = container.firstChild;
  requestAnimationFrame(() => {
    const over = inner.scrollWidth - container.clientWidth;
    if (over > 4) {
      inner.style.setProperty('--shift', `-${over + 10}px`);
      inner.classList.add('scroll');
    }
  });
}
function setNpName(name)  { marqueeText(npName, name); }
function setNpTrack(text) { if (text) marqueeText(npTrack, text); else npTrack.innerHTML = ''; }

function renderStations() {
  stationsEl.innerHTML = '';
  closeOpenRow = null;
  stations.forEach((st, i) => {
    const wrap = el('div', 'station-wrap');
    const delbg = el('div', 'station-delete-bg', '🗑');
    const row = el('div', 'station' + (i === currentStation ? ' playing' : ''),
      `<span class="station-ico"></span>
       <span class="station-name">${escapeHtml(st.name)}</span>
       <span class="station-chevron">${i === currentStation ? '▶' : '›'}</span>`);
    row.querySelector('.station-ico').appendChild(stationIcon(st));
    wrap.appendChild(delbg);
    wrap.appendChild(row);
    stationsEl.appendChild(wrap);

    const removeStation = () => {
      stations.splice(i, 1);
      if (currentStation === i) stopRadio();
      saveStations(); renderStations();
    };
    delbg.addEventListener('click', removeStation);
    attachSwipe(row, i, removeStation);
  });
}

/* Wisch-Geste pro Sender-Zeile (Pointer = Maus + Touch) */
function attachSwipe(row, i, onDelete) {
  const MAX = 88, OPEN = 76, DEL = 150, TAP = 8;
  let startX = 0, dx = 0, dragging = false, opened = false;
  const setT = v => { row.style.transform = `translateX(${v}px)`; };
  const close = () => { opened = false; row.style.transition = ''; setT(0);
    if (closeOpenRow === close) closeOpenRow = null; };
  const open  = () => { opened = true; row.style.transition = ''; setT(-OPEN);
    if (closeOpenRow && closeOpenRow !== close) closeOpenRow();
    closeOpenRow = close; };

  row.addEventListener('pointerdown', e => {
    dragging = true; startX = e.clientX; dx = 0;
    row.style.transition = 'none';
    try { row.setPointerCapture(e.pointerId); } catch (_) {}
  });
  row.addEventListener('pointermove', e => {
    if (!dragging) return;
    dx = e.clientX - startX;
    const base = opened ? -OPEN : 0;
    setT(Math.max(-MAX, Math.min(0, base + dx)));
  });
  const end = () => {
    if (!dragging) return;
    dragging = false; row.style.transition = '';
    const final = (opened ? -OPEN : 0) + dx;
    if (final <= -DEL) { onDelete(); return; }              // weit gewischt = löschen
    if (final <= -OPEN / 2) open();                          // offen einrasten
    else if (Math.abs(dx) <= TAP && !opened) { close(); playStation(i); }  // Tipp = abspielen
    else close();
  };
  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', () => {
    if (dragging) { dragging = false; row.style.transition = ''; opened ? open() : close(); }
  });
}

/* beliebigen Stream abspielen (auch ungespeicherte Suchtreffer) */
function playStream(st) {
  ensureCtx();
  currentStream = { name: st.name, url: st.url, logo: st.logo || '' };
  currentStation = stations.findIndex(s => s.url === st.url);   // -1 wenn nicht in Liste
  radioIntended = true;
  cancelReconnect();
  setNpName(st.name);
  collapseCover();                   // neues Cover erst, wenn der Poll es liefert
  npArt.innerHTML = '';
  npArt.appendChild(stationIcon(currentStream));   // Senderlogo bleibt oben
  npState.textContent = 'verbinde …';
  npToggle.textContent = '…';
  npToggle.classList.add('loading');
  audio.src = st.url;
  audio.play().catch(() => { npState.textContent = 'Fehler – Stream nicht erreichbar'; });
  startNowPlay(st.url);
  renderStations();
}
/* Sender aus der gespeicherten Liste abspielen */
function playStation(i) { playStream(stations[i]); }

function stopRadio() {
  radioIntended = false;
  cancelReconnect();
  audio.pause();
  audio.removeAttribute('src');
  stopNowPlay();
  currentStation = -1;
  currentStream = null;
  setNpName('Kein Sender');
  npArt.innerHTML = '📻';
  npState.textContent = 'gestoppt';
  npToggle.textContent = '▶';
  npToggle.classList.remove('loading');
  renderStations();
}

audio.addEventListener('playing', () => {
  npState.textContent = 'läuft';
  npToggle.textContent = '⏸';
  npToggle.classList.remove('loading');
  cancelReconnect();                 // Verbindung steht → Backoff zurücksetzen
  if (typeof notePlayback === 'function') notePlayback();
});
audio.addEventListener('pause', () => {
  if (currentStream && !radioIntended) { npState.textContent = 'pausiert'; npToggle.textContent = '▶'; }
  if (typeof notePlayback === 'function') notePlayback();
});
audio.addEventListener('error', () => {
  npToggle.classList.remove('loading');
  if (radioIntended) scheduleReconnect();
  else npState.textContent = 'Fehler – Stream nicht erreichbar';
});
audio.addEventListener('ended', () => { if (radioIntended) scheduleReconnect(); });

npToggle.addEventListener('click', () => {
  if (!currentStream) { if (stations.length) playStation(0); return; }
  if (audio.paused) { radioIntended = true; cancelReconnect(); audio.play(); }
  else { radioIntended = false; cancelReconnect(); audio.pause(); }
});

document.getElementById('radioVol').addEventListener('input', (e) => {
  audio.volume = e.target.value / 100;
  save('radioVol', audio.volume);
});

renderStations();

/* ----- Sender-Suche über radio-browser.info ----------------------------- */
const RB_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];
const searchView    = document.getElementById('searchView');
const searchInput   = document.getElementById('searchInput');
const searchGo      = document.getElementById('searchGo');
const searchChips   = document.getElementById('searchChips');
const searchResults = document.getElementById('searchResults');

const GENRES = [
  {l:'Ambient', t:'ambient'}, {l:'Sleep', t:'sleep'}, {l:'Lo-Fi', t:'lounge'},
  {l:'Chillout', t:'chillout'}, {l:'Jazz', t:'jazz'}, {l:'Klassik', t:'classical'},
  {l:'Piano', t:'piano'}, {l:'Natur', t:'nature'}, {l:'Meditation', t:'meditation'},
  {l:'Nachrichten', t:'news'},
];

function openSearch() {
  searchView.classList.remove('hidden');
  if (!searchChips.childElementCount) {
    GENRES.forEach(g => {
      const c = el('button', 'chip', g.l);
      c.addEventListener('click', () => { searchInput.value = g.l; hideKeyboard(); searchByTag(g.t); });
      searchChips.appendChild(c);
    });
  }
  if (!searchResults.childElementCount)
    searchResults.appendChild(el('div', 'search-hint',
      'Tippe oben auf ein Genre – oder gib einen Namen ins Suchfeld ein. ' +
      'Ein Treffer wird gespeichert und sofort abgespielt.'));
}
document.getElementById('searchStation').addEventListener('click', openSearch);
document.getElementById('searchBack').addEventListener('click', () => { hideKeyboard(); searchView.classList.add('hidden'); });
searchGo.addEventListener('click', () => { hideKeyboard(); searchByName(searchInput.value); });
searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchByName(searchInput.value); });

async function rbFetch(path) {
  for (const m of RB_MIRRORS) {
    try {
      const r = await fetch(m + path);
      if (r.ok) return await r.json();
    } catch (e) { /* nächsten Mirror versuchen */ }
  }
  throw new Error('kein Server erreichbar');
}

function runSearch(path) {
  searchResults.innerHTML = '';
  searchResults.appendChild(el('div', 'search-hint', 'Suche …'));
  rbFetch(path).then(renderResults).catch(() => {
    searchResults.innerHTML = '';
    searchResults.appendChild(el('div', 'search-hint',
      'Keine Verbindung zum Sender-Verzeichnis. Internet vorhanden?'));
  });
}
function searchByName(q) {
  q = (q || '').trim(); if (!q) return;
  runSearch('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=40&name=' + encodeURIComponent(q));
}
function searchByTag(t) {
  runSearch('/json/stations/search?hidebroken=true&order=clickcount&reverse=true&limit=40&tag=' + encodeURIComponent(t));
}

function renderResults(list) {
  searchResults.innerHTML = '';
  if (!Array.isArray(list) || !list.length) {
    searchResults.appendChild(el('div', 'search-hint', 'Nichts gefunden. Anderen Begriff probieren.'));
    return;
  }
  list.forEach(st => {
    const url = st.url_resolved || st.url;
    if (!url) return;
    const meta = [st.countrycode, st.bitrate ? st.bitrate + ' kbps' : '', (st.codec || '').toUpperCase()]
      .filter(Boolean).join(' · ');
    const item = { name: st.name || 'Sender', url, logo: st.favicon || '' };
    const inList = stations.some(s => s.url === url);
    const row = el('div', 'station result',
      `<span class="station-ico"></span>
       <span class="result-info">
         <span class="station-name">${escapeHtml(item.name)}</span>
         <span class="result-meta">${escapeHtml(meta)}</span>
       </span>
       <button class="station-chevron add${inList ? ' added' : ''}" title="Zur Liste hinzufügen">${inList ? '✓' : '＋'}</button>`);
    row.querySelector('.station-ico').appendChild(stationIcon(item));

    // Antippen (Icon/Info) = nur abspielen, NICHT zur Liste hinzufügen
    const playOnly = () => { hideKeyboard(); searchView.classList.add('hidden'); showTab('radio'); playStream(item); };
    row.querySelector('.station-ico').addEventListener('click', playOnly);
    row.querySelector('.result-info').addEventListener('click', playOnly);

    // "+" = zur Favoritenliste hinzufügen (bleibt in der Suche)
    const addBtn = row.querySelector('.station-chevron.add');
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToStations(item);
      addBtn.textContent = '✓';
      addBtn.classList.add('added');
    });
    searchResults.appendChild(row);
  });
}

/* Sender zur gespeicherten Liste hinzufügen (ohne abzuspielen) */
function addToStations(st) {
  if (stations.some(s => s.url === st.url)) return false;
  stations.push({ name: (st.name || 'Sender').trim(), url: st.url, logo: st.logo || '' });
  saveStations(); renderStations();
  return true;
}

/* ----------------------------------------------------------------------- *
 * 6b) EIGENE ON-SCREEN-TASTATUR (DE / EN / HR), augenschonend
 * ----------------------------------------------------------------------- */
const osk = document.getElementById('osk');
const KB_ORDER = ['DE', 'EN', 'HR'];
/* alphabetisch + Ziffern; wird in Reihen zu je 7 großen Tasten zerlegt */
const KB_CHARS = {
  DE: 'abcdefghijklmnopqrstuvwxyzäöüß0123456789',
  EN: 'abcdefghijklmnopqrstuvwxyz0123456789',
  HR: 'abcčćdđefghijklmnopqrsštuvwxyzž0123456789',
};
const KB_COLS = 7;
let oskTarget = null, kbShift = false, oskOnEnter = null;

function makeKey(k) {
  const b = el('button', 'osk-key');
  let label = k;
  if (k === 'back')       { label = '⌫'; b.classList.add('back'); }
  else if (k === 'shift') { label = '⇧'; b.classList.add('shift'); if (kbShift) b.classList.add('active'); }
  else if (k === 'space') { label = 'Leerzeichen'; b.classList.add('space'); }
  else if (k === 'enter') { label = 'Suchen'; b.classList.add('enter'); }
  else if (k === 'lang')  { label = localStorage.getItem('kbLang') || 'DE'; b.classList.add('lang'); }
  else                    { label = kbShift ? k.toUpperCase() : k; }
  b.textContent = label;
  b.addEventListener('pointerdown', e => { e.preventDefault(); onKey(k); });
  return b;
}
function buildKeyboard() {
  const lang = localStorage.getItem('kbLang') || 'DE';
  osk.innerHTML = '';
  const chars = [...KB_CHARS[lang]];
  for (let i = 0; i < chars.length; i += KB_COLS) {
    const row = el('div', 'osk-row');
    chars.slice(i, i + KB_COLS).forEach(ch => row.appendChild(makeKey(ch)));
    osk.appendChild(row);
  }
  const ctrl = el('div', 'osk-row osk-ctrl');  // Steuerzeile: Sprache | ⇧ | Space | ⌫ | Suchen
  ctrl.appendChild(makeKey('lang'));           // unten links: Layout DE/EN/HR
  ctrl.appendChild(makeKey('shift'));
  ctrl.appendChild(makeKey('space'));
  ctrl.appendChild(makeKey('back'));
  ctrl.appendChild(makeKey('enter'));
  osk.appendChild(ctrl);
}
function insertAtCursor(inp, text) {
  const s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
  inp.value = inp.value.slice(0, s) + text + inp.value.slice(e);
  const pos = s + text.length;
  inp.setSelectionRange(pos, pos);
}
function delAtCursor(inp) {
  let s = inp.selectionStart ?? inp.value.length, e = inp.selectionEnd ?? inp.value.length;
  if (s === e) { if (s === 0) return; inp.value = inp.value.slice(0, s - 1) + inp.value.slice(e); s -= 1; }
  else { inp.value = inp.value.slice(0, s) + inp.value.slice(e); }
  inp.setSelectionRange(s, s);
}
function onKey(k) {
  const t = oskTarget;
  if (!t) return;
  if (k === 'shift')      { kbShift = !kbShift; buildKeyboard(); return; }
  if (k === 'lang')       { const c = localStorage.getItem('kbLang') || 'DE';
                            localStorage.setItem('kbLang', KB_ORDER[(KB_ORDER.indexOf(c) + 1) % KB_ORDER.length]);
                            buildKeyboard(); return; }
  if (k === 'back')       { delAtCursor(t); return; }
  if (k === 'space')      { insertAtCursor(t, ' '); return; }
  if (k === 'enter')      { const v = t.value, cb = oskOnEnter; hideKeyboard(); if (cb) cb(v); return; }
  insertAtCursor(t, kbShift ? k.toUpperCase() : k);
  if (kbShift) { kbShift = false; buildKeyboard(); }       // Shift wirkt einmalig
}
function showKeyboard(target, onEnter) { oskTarget = target; oskOnEnter = onEnter || null; buildKeyboard(); osk.classList.remove('hidden'); }
function hideKeyboard() { osk.classList.add('hidden'); oskTarget = null; oskOnEnter = null; }

searchInput.addEventListener('focus', () => showKeyboard(searchInput, v => searchByName(v)));
searchInput.addEventListener('click', () => showKeyboard(searchInput, v => searchByName(v)));

/* ----------------------------------------------------------------------- *
 * 7) TABS
 * ----------------------------------------------------------------------- */
const tabSounds = document.getElementById('tabSounds');
const tabRadio  = document.getElementById('tabRadio');
const soundsView= document.getElementById('soundsView');
const radioView = document.getElementById('radioView');

function showTab(which) {
  const radio = which === 'radio';
  tabRadio.classList.toggle('active', radio);
  tabSounds.classList.toggle('active', !radio);
  radioView.classList.toggle('hidden', !radio);
  soundsView.classList.toggle('hidden', radio);
}
tabSounds.addEventListener('click', () => showTab('sounds'));
tabRadio.addEventListener('click', () => showTab('radio'));

/* ----------------------------------------------------------------------- *
 * 8) SLEEP-TIMER mit sanftem Ausblenden
 * ----------------------------------------------------------------------- */
const TIMER_STEPS = [0, 15, 30, 45, 60, 90];   // Minuten; 0 = aus
let timerIdx = 0;
let timerTimeout = null;
let timerTick = null;
const timerBtn = document.getElementById('timerBtn');

timerBtn.addEventListener('click', () => {
  timerIdx = (timerIdx + 1) % TIMER_STEPS.length;
  startTimer(TIMER_STEPS[timerIdx]);
});

function startTimer(minutes) {
  clearTimeout(timerTimeout); clearInterval(timerTick);
  timerBtn.classList.toggle('active', minutes > 0);
  if (minutes === 0) { timerBtn.textContent = '⏱ Timer'; return; }

  let endAt = Date.now() + minutes * 60000;
  const update = () => {
    const left = Math.max(0, endAt - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    timerBtn.textContent = `⏱ ${m}:${String(s).padStart(2,'0')}`;
  };
  update();
  timerTick = setInterval(update, 1000);

  timerTimeout = setTimeout(() => {
    clearInterval(timerTick);
    fadeOutEverything(30);   // über 30 s ausblenden, dann alles stoppen
    timerIdx = 0;
    timerBtn.classList.remove('active');
    timerBtn.textContent = '⏱ Timer';
  }, minutes * 60000);
}

function fadeOutEverything(seconds) {
  // Sounds: masterGain rampen
  if (ctx && masterGain) {
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0.0001, now + seconds);
  }
  // Radio: Lautstärke schrittweise senken
  const startVol = audio.volume;
  const steps = seconds * 4;
  let n = 0;
  const fade = setInterval(() => {
    n++;
    audio.volume = Math.max(0, startVol * (1 - n / steps));
    if (n >= steps) {
      clearInterval(fade);
      stopAll();
      // Lautstärken zurücksetzen für nächstes Mal
      audio.volume = startVol;
      if (masterGain) masterGain.gain.value = readNum('master', 0.8);
    }
  }, 250);
}

/* ----------------------------------------------------------------------- *
 * 9) NACHTMODUS + "ALLES AUS"
 * ----------------------------------------------------------------------- */
const dimOverlay = document.getElementById('dimOverlay');
const dimBtn = document.getElementById('dimBtn');
dimBtn.addEventListener('click', () => dimOverlay.classList.remove('hidden'));
dimOverlay.addEventListener('click', () => dimOverlay.classList.add('hidden'));

/* Nachtlicht / Blaulichtfilter — 0=aus, 1=sanft, 2=mittel, 3=stark */
const warmOverlay = document.getElementById('warmOverlay');
const warmBtn = document.getElementById('warmBtn');
const WARM_OPACITY = [0, 0.22, 0.38, 0.55];
function applyWarm(level) {
  level = Math.max(0, Math.min(3, Math.round(level)));
  save('warmLevel', level);
  if (level > 0) save('warmLast', level);
  warmOverlay.style.opacity = WARM_OPACITY[level];
  warmBtn.classList.toggle('active', level > 0);
}
warmBtn.addEventListener('click', () => {
  const cur = readNum('warmLevel', 0);
  applyWarm(cur > 0 ? 0 : readNum('warmLast', 2));   // toggelt mit zuletzt gewählter Stärke
});
applyWarm(readNum('warmLevel', 0));   // gespeicherten Zustand wiederherstellen

/* Helligkeit – 6 Stufen (weiche Abdunklung). 0 = min (dunkel) … 5 = max (hell) */
const brightnessOverlay = document.getElementById('brightnessOverlay');
const briBtn  = document.getElementById('briBtn');
const briHud  = document.getElementById('briHud');
const briSegs = briHud.querySelectorAll('.bri-segs i');
const BRI_DIM = [0.78, 0.62, 0.46, 0.30, 0.15, 0.0];   // Overlay-Deckkraft je Stufe
let briHudTimer = null;
function applyBrightness(level) {
  level = Math.max(0, Math.min(5, level));
  save('briLevel', level);
  brightnessOverlay.style.opacity = BRI_DIM[level];
}
function showBriHud(level) {
  briSegs.forEach((s, i) => s.classList.toggle('on', i <= level));
  briHud.classList.remove('hidden'); void briHud.offsetWidth; briHud.classList.add('show');
  clearTimeout(briHudTimer);
  briHudTimer = setTimeout(() => briHud.classList.remove('show'), 1300);
}
briBtn.addEventListener('click', () => {
  const next = (readNum('briLevel', 5) + 5) % 6;       // eine Stufe dunkler; nach min zurück auf max
  applyBrightness(next);
  showBriHud(next);
});
applyBrightness(readNum('briLevel', 5));               // gespeicherte Helligkeit wiederherstellen

/* Eigene Dialoge statt Chromium-Popups (sehen aufs Hochformat zugeschnitten aus) */
const modal     = document.getElementById('modal');
const modalMsg  = document.getElementById('modalMsg');
const modalBtns = document.getElementById('modalBtns');
function uiDialog(msg, buttons) {
  return new Promise(resolve => {
    modalMsg.textContent = msg;
    modalBtns.innerHTML = '';
    buttons.forEach(b => {
      const btn = el('button', 'modal-btn' + (b.kind ? ' ' + b.kind : ''), b.label);
      btn.addEventListener('click', () => { modal.classList.add('hidden'); resolve(b.value); });
      modalBtns.appendChild(btn);
    });
    modal.classList.remove('hidden');
  });
}
function uiAlert(msg) { return uiDialog(msg, [{ label: 'OK', value: true, kind: 'primary' }]); }
function uiConfirm(msg, okLabel, danger) {
  return uiDialog(msg, [
    { label: 'Abbrechen', value: false },
    { label: okLabel || 'OK', value: true, kind: danger ? 'danger' : 'primary' },
  ]);
}

/* Hintergrund-Effekt (Screensaver + optional ganze App) */
const FX_LIST = ['none', 'aurora', 'nebula', 'stars', 'lava', 'plasma', 'bokeh', 'atem'];
const FX_MOTION = { off: '1', slow: '1.8', normal: '1', fast: '0.55' };
const ssAura = document.getElementById('ssAura');
const appAura = document.getElementById('appAura');
function applyEffect() {
  const fx = localStorage.getItem('fxEffect') || 'aurora';
  const inApp = readNum('fxInApp', 0);
  const motion = localStorage.getItem('fxMotion') || 'normal';
  [ssAura, appAura].forEach(a => {
    FX_LIST.forEach(f => a.classList.remove('fx-' + f));
    a.classList.add('fx-' + fx);
    a.classList.toggle('fx-static', motion === 'off');
    a.style.setProperty('--mo', FX_MOTION[motion] || '1');
  });
  appAura.classList.toggle('hidden', !(inApp && fx !== 'none'));
}
applyEffect();

/* ----------------------------------------------------------------------- *
 * WLAN-Signalbalken + Connectivity-Graph (Statusleiste oben links)
 * ----------------------------------------------------------------------- */
const wifiBars = document.getElementById('wifiBars');
const connGraph = document.getElementById('connGraph');
const connCtx = connGraph.getContext('2d');
const connHist = [];
const CONN_MAX = 40;
let netWasOnline = true;

function setWifi(signal, online) {
  const bars = wifiBars.querySelectorAll('i');
  let level = signal == null ? (online ? 2 : 0) : Math.round(signal / 25);
  level = Math.max(0, Math.min(4, level));
  wifiBars.classList.toggle('off', !online);
  wifiBars.classList.toggle('weak', online && signal != null && signal < 40);
  bars.forEach((b, i) => b.classList.toggle('on', online && i < level));
}

function drawConn() {
  const w = connGraph.width, h = connGraph.height;
  connCtx.clearRect(0, 0, w, h);
  const bw = w / CONN_MAX;
  connHist.forEach((s, i) => {
    const x = i * bw;
    if (s.online) {
      const lat = s.latency == null ? 200 : s.latency;
      const q = Math.max(0.3, 1 - Math.min(lat, 400) / 400);   // niedrige Latenz = höherer Balken
      const bh = Math.max(2, h * q);
      connCtx.fillStyle = '#3ad29f';
      connCtx.fillRect(x, h - bh, Math.max(1, bw - 1), bh);
    } else {
      connCtx.fillStyle = '#e0556b';                            // Unterbrechung = roter Vollbalken
      connCtx.fillRect(x, 0, Math.max(1, bw - 1), h);
    }
  });
}

function pollNet() {
  fetch('/api/net').then(r => r.json()).then(d => {
    setWifi(d.signal, d.online);
    connHist.push({ online: d.online, latency: d.latency });
    // Verbindung kommt zurück → Radio sofort wieder verbinden
    if (d.online && !netWasOnline && radioIntended && audio.paused) reconnectNow();
    netWasOnline = d.online;
  }).catch(() => {
    setWifi(null, false);
    connHist.push({ online: false, latency: null });
    netWasOnline = false;
  }).finally(() => {
    if (connHist.length > CONN_MAX) connHist.shift();
    drawConn();
  });
}
pollNet();
setInterval(pollNet, 5000);

/* ----------------------------------------------------------------------- *
 * Bluetooth-Lautsprecher automatisch ein/aus je nach Wiedergabe
 *   - verbinden (= aufwecken), sobald etwas spielt
 *   - nach 1 min Stille trennen (= Abschalt-Signal)
 * ----------------------------------------------------------------------- */
let btIdleTimer = null, btConnected = false, btBusy = false;
function btCtl(action) {
  const mac = localStorage.getItem('btSpeaker');
  if (!mac) return Promise.resolve({});
  return fetch('/api/bt/' + action, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mac })
  }).then(r => r.json()).catch(() => ({}));
}
function isPlaying() {
  return sounds.some(s => s.playing) || (currentStream && !audio.paused);
}
function notePlayback() {
  if (!localStorage.getItem('btSpeaker')) return;
  if (isPlaying()) {
    clearTimeout(btIdleTimer); btIdleTimer = null;
    if (!btConnected && !btBusy) {
      btBusy = true;
      btCtl('connect').then(d => { btConnected = !!(d && d.ok); btBusy = false; });
    }
  } else if (!btIdleTimer) {
    btIdleTimer = setTimeout(() => {
      btIdleTimer = null;
      btCtl('disconnect').then(() => { btConnected = false; });
    }, 60000);
  }
}

/* ----------------------------------------------------------------------- *
 * Lautsprecher-Akku (oben) + Apple-artiges Lautstärke-HUD
 * ----------------------------------------------------------------------- */
const btBatt  = document.getElementById('btBatt');
const battFill = document.getElementById('battFill');
const battPct  = document.getElementById('battPct');
function setBattery(pct) {
  battFill.style.width = Math.max(4, Math.min(100, pct)) + '%';
  battPct.textContent = pct + '%';
  btBatt.classList.toggle('low', pct <= 20);
}
function pollBattery() {
  const mac = localStorage.getItem('btSpeaker');
  if (!mac) { btBatt.classList.add('hidden'); return; }
  fetch('/api/bt/battery?mac=' + encodeURIComponent(mac)).then(r => r.json()).then(d => {
    if (d.battery == null) btBatt.classList.add('hidden');
    else { setBattery(d.battery); btBatt.classList.remove('hidden'); }
  }).catch(() => { btBatt.classList.add('hidden'); });
}
pollBattery();
setInterval(pollBattery, 30000);

const volHud  = document.getElementById('volHud');
const volFill = document.getElementById('volFill');
const volPct  = document.getElementById('volPct');
const volIco  = document.getElementById('volIco');
let volHudTimer = null;
function showVolHud(pct) {
  volFill.style.width = pct + '%';
  volPct.textContent = pct + '%';
  volIco.textContent = pct === 0 ? '🔇' : (pct < 45 ? '🔉' : '🔊');
  volHud.classList.remove('hidden'); void volHud.offsetWidth; volHud.classList.add('show');
  clearTimeout(volHudTimer);
  volHudTimer = setTimeout(() => volHud.classList.remove('show'), 1400);
}
let lastSinkVol = null;
function pollVolume() {
  if (!localStorage.getItem('btSpeaker')) { lastSinkVol = null; return; }
  fetch('/api/audio/volume').then(r => r.json()).then(d => {
    if (d.volume == null) return;
    if (lastSinkVol != null && d.volume !== lastSinkVol) showVolHud(d.volume);  // externe Änderung = Tasten am Lautsprecher
    lastSinkVol = d.volume;
  }).catch(() => {});
}
setInterval(pollVolume, 1500);

/* Live-Uhr für Statusleiste + Screensaver */
const clockEl  = document.getElementById('clock');
const ssClock  = document.getElementById('ssClock');
const ssDate   = document.getElementById('ssDate');
const WEEKDAYS = ['So','Mo','Di','Mi','Do','Fr','Sa'];
function updateClocks() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  const t = `${hh}:${mm}`;
  clockEl.textContent = t;
  ssClock.textContent = t;
  ssDate.textContent = `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth()+1}.`;
}
updateClocks();
setInterval(updateClocks, 10000);

/* Wecker / Sunrise-Alarm */
let alarmFired = null;
function checkAlarm() {
  if (!readNum('alarmOn', 0)) return;
  const t = localStorage.getItem('alarmTime') || '07:00';
  const now = new Date();
  const cur = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const key = now.toDateString() + ' ' + t;
  if (cur === t && alarmFired !== key) { alarmFired = key; triggerAlarm(); }
}
function triggerAlarm() {
  ensureCtx();
  dimOverlay.classList.add('hidden');                 // Bildschirm wecken
  const sid = localStorage.getItem('alarmSound') || 'birds';
  if (sid === 'radio') { if (stations.length) playStation(0); }
  else {
    const s = sounds.find(x => x.def.id === sid);
    if (s) { if (s._card) s._card.classList.add('on'); s.start(); saveActive(); }
  }
  if (masterGain) {                                   // Sunrise: über 3 min sanft lauter
    const target = effectiveMaster();
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(0.08, now);
    masterGain.gain.linearRampToValueAtTime(Math.max(0.08, target), now + 180);
  }
}
setInterval(checkAlarm, 20000);

/* Auto-Screensaver: nach Inaktivität die Uhr einblenden (Squeezebox-Stil).
   Zeit ist in den Einstellungen wählbar (Minuten; 0 = aus). */
let idleTimer = null;
function idleMs() { const m = readNum('idleMin', 3); return m > 0 ? m * 60000 : 0; }
function resetIdle() {
  clearTimeout(idleTimer);
  const ms = idleMs();
  if (ms > 0) idleTimer = setTimeout(() => dimOverlay.classList.remove('hidden'), ms);
}
document.addEventListener('pointerdown', resetIdle, true);
resetIdle();

document.getElementById('stopAll').addEventListener('click', stopAll);

function stopAll() {
  sounds.forEach(s => { s.stop(); s._card.classList.remove('on'); });
  stopRadio();
  saveActive();
}

/* ----------------------------------------------------------------------- *
 * 10) HILFSFUNKTIONEN + PERSISTENZ
 * ----------------------------------------------------------------------- */
function save(key, val)      { localStorage.setItem(key, JSON.stringify(val)); }
function save0(key, val)     { localStorage.setItem(key, val); }   // roher String (ohne JSON)
function readNum(key, def)   { const v = localStorage.getItem(key); return v === null ? def : JSON.parse(v); }
function saveStations()      { localStorage.setItem('stations_v2', JSON.stringify(stations)); }
function saveActive()        { save('active', sounds.filter(s=>s.playing).map(s=>s.def.id)); }
function escapeHtml(s)       { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

/* zuletzt aktive Sounds wiederherstellen.
   Browser blockieren Audio bis zur ersten Nutzer-Geste → optisch markieren,
   tatsächlich starten beim ersten Tippen irgendwo auf den Screen. */
window.addEventListener('load', () => {
  const active = JSON.parse(localStorage.getItem('active') || '[]');
  sounds.forEach(s => { if (active.includes(s.def.id)) s._card.classList.add('on'); });

  const resumeOnce = () => {
    ensureCtx();
    sounds.forEach(s => { if (s._card.classList.contains('on') && !s.playing) s.start(); });
    document.removeEventListener('pointerdown', resumeOnce);
  };
  document.addEventListener('pointerdown', resumeOnce);
});

/* ----------------------------------------------------------------------- *
 * 11) EINSTELLUNGEN (Squeezebox-Drill-down)
 * ----------------------------------------------------------------------- */
const APP_VERSION = '1.0';
const settingsView = document.getElementById('settingsView');
const setBody  = document.getElementById('setBody');
const setTitle = document.getElementById('setTitle');
const setBack  = document.getElementById('setBack');
const settingsBtn = document.getElementById('settingsBtn');

let setStack = [];

settingsBtn.addEventListener('click', () => {
  settingsView.classList.remove('hidden');
  settingsView.classList.remove('opening'); void settingsView.offsetWidth;
  settingsView.classList.add('opening');          // ganze Ansicht hereinschieben
  setStack = [];
  navigate(PANELS.root);
});
setBack.addEventListener('click', () => {
  setStack.pop();
  if (setStack.length === 0) { settingsView.classList.add('hidden'); return; }
  renderPanel(setStack[setStack.length - 1], 'back');   // zurück = von links
});
function navigate(panel)  { setStack.push(panel); renderPanel(panel, 'fwd'); }
function renderPanel(p, dir) {
  setTitle.textContent = p.title;
  setBody.innerHTML = '';
  p.render(setBody);
  setBody.classList.remove('anim-fwd', 'anim-back');
  void setBody.offsetWidth;                              // Reflow → Animation neu starten
  setBody.classList.add(dir === 'back' ? 'anim-back' : 'anim-fwd');
}
function refresh()        { renderPanel(setStack[setStack.length - 1], 'fwd'); }

/* kleine DOM-Helfer */
function el(tag, cls, html) { const e = document.createElement(tag);
  if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function setSection(t) { return el('div', 'set-section', t); }
function navItem(parent, emoji, label, onClick) {
  const it = el('button', 'set-item',
    `<span class="si-ico">${emoji}</span><span class="si-label">${label}</span><span class="si-chev">›</span>`);
  it.addEventListener('click', onClick);
  parent.appendChild(it); return it;
}
function infoRow(parent, k, v) {
  parent.appendChild(el('div', 'set-info',
    `<span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span>`));
}

/* Neustart/Herunterfahren über das lokale Backend */
function powerAction(action, msg) {
  uiConfirm(msg, 'OK', true).then(ok => {
    if (!ok) return;
    fetch('/api/power', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    }).then(r => r.json())
      .then(d => uiAlert(d.ok ? 'Wird ausgeführt …' : (d.msg || 'Nicht möglich')))
      .catch(() => uiAlert('Keine Verbindung zum lokalen Dienst (server.py).'));
  });
}

/* Bluetooth-Aktion ans Backend schicken */
function btApi(action, mac) {
  const opt = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  if (mac) opt.body = JSON.stringify({ mac });
  return fetch('/api/bt/' + action, opt).then(r => r.json()).catch(() => ({ ok: false }));
}

/* eine Geräte-Zeile (gekoppelt ODER neu gefunden) bauen */
function btRow(dev, reload, isNew) {
  const row = el('div', 'station');
  const isDefault = localStorage.getItem('btSpeaker') === dev.mac;
  const status = dev.connected ? 'verbunden' : (dev.paired ? 'gekoppelt' : 'gefunden');
  row.innerHTML =
    `<span class="station-ico">🔊</span>
     <span class="result-info">
       <span class="station-name">${escapeHtml(dev.name)}</span>
       <span class="result-meta">${status}${isDefault ? ' · Standard ★' : ''}</span>
     </span>`;
  const act = el('span', 'bt-actions');

  if (isNew || !dev.paired) {
    const pair = el('button', 'bt-btn', 'Koppeln');
    pair.addEventListener('click', () => {
      pair.textContent = 'koppelt …'; pair.disabled = true;
      btApi('pair', dev.mac).then(d => {
        if (d.ok) localStorage.setItem('btSpeaker', dev.mac);
        else uiAlert('Koppeln fehlgeschlagen.\n' +
                   (d.msg ? '\nMeldung: ' + d.msg + '\n' : '') +
                   '\n• Lautsprecher in den Pairing-Modus bringen ' +
                   '(meist Taste lange halten, bis die LED schnell blinkt).\n' +
                   '• Nah an den Pi halten und „suchen" erneut.\n' +
                   '• War er schon mal verbunden? Mit 🗑 entfernen und neu koppeln.');
        reload && reload();
      });
    });
    act.appendChild(pair);
  } else {
    const conn = el('button', 'bt-btn', dev.connected ? 'Trennen' : 'Verbinden');
    conn.addEventListener('click', () => {
      conn.textContent = '…';
      btApi(dev.connected ? 'disconnect' : 'connect', dev.mac).then(() => reload && reload());
    });
    act.appendChild(conn);

    const star = el('button', 'bt-btn' + (isDefault ? ' active' : ''), isDefault ? '★' : '☆');
    star.title = 'Als Standard-Lautsprecher (Auto-Ein/Aus)';
    star.addEventListener('click', () => { localStorage.setItem('btSpeaker', dev.mac); reload && reload(); });
    act.appendChild(star);

    const del = el('button', 'station-del', '🗑');
    del.addEventListener('click', () => {
      btApi('remove', dev.mac).then(() => {
        if (localStorage.getItem('btSpeaker') === dev.mac) localStorage.removeItem('btSpeaker');
        reload && reload();
      });
    });
    act.appendChild(del);
  }
  row.appendChild(act);
  return row;
}

/* kleine WLAN-Signalbalken */
function wifiMini(sig) {
  const lvl = Math.max(0, Math.min(4, Math.round((sig || 0) / 25)));
  const w = el('span', 'wifi-mini');
  for (let i = 0; i < 4; i++) { const bar = el('i'); if (i < lvl) bar.classList.add('on'); w.appendChild(bar); }
  return w;
}

/* eine WLAN-Netz-Zeile mit ausklappbarem Verbinden-Bereich */
function wifiNetRow(net, onConnected) {
  const wrap = el('div', 'wifi-wrap');
  const row = el('div', 'wifi-net' + (net.active ? ' active' : ''));
  row.appendChild(wifiMini(net.signal));
  row.appendChild(el('span', 'wifi-ssid', escapeHtml(net.ssid)));
  if (net.secure) row.appendChild(el('span', 'wifi-lock', '🔒'));
  if (net.active)  row.appendChild(el('span', 'wifi-state', '✓'));
  wrap.appendChild(row);

  const panel = el('div', 'wifi-connect hidden');
  wrap.appendChild(panel);

  const connect = (pw, status, btn) => {
    status.textContent = 'verbinde …'; if (btn) btn.disabled = true;
    fetch('/api/wifi/connect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ssid: net.ssid, password: pw })
    }).then(r => r.json()).then(d => {
      if (btn) btn.disabled = false;
      if (d.ok) { status.textContent = 'verbunden ✓'; hideKeyboard(); onConnected && onConnected(); }
      else status.textContent = 'Fehler: ' + (d.msg || 'fehlgeschlagen');
    }).catch(() => { if (btn) btn.disabled = false; status.textContent = 'Kein Dienst erreichbar.'; });
  };

  row.addEventListener('click', () => {
    if (net.active) return;
    if (!panel.childElementCount) {
      const status = el('div', 'search-hint', '');
      if (net.secure) {
        const inp = el('input', 'search-input osk-input');
        inp.type = 'password'; inp.placeholder = 'Passwort'; inp.autocomplete = 'off';
        inp.setAttribute('inputmode', 'none');
        const btn = el('button', 'set-action', 'Verbinden');
        const go = () => connect(inp.value, status, btn);
        inp.addEventListener('focus', () => showKeyboard(inp, go));
        inp.addEventListener('click', () => showKeyboard(inp, go));
        btn.addEventListener('click', go);
        const pwRow = el('div', 'wifi-pw-row'); pwRow.appendChild(inp); pwRow.appendChild(btn);
        panel.appendChild(pwRow); panel.appendChild(status);
      } else {
        panel.appendChild(status); connect('', status, null);
      }
    }
    panel.classList.toggle('hidden');
    const inp = panel.querySelector('input');
    if (inp && !panel.classList.contains('hidden')) inp.focus();
  });
  return wrap;
}

const PANELS = {
  root: {
    title: 'Einstellungen',
    render(b) {
      b.appendChild(setSection('Gerät'));
      navItem(b, '📶', 'Netzwerk',      () => navigate(PANELS.network));
      navItem(b, '🔵', 'Bluetooth',     () => navigate(PANELS.bluetooth));
      navItem(b, '🔊', 'Audio-Ausgang', () => navigate(PANELS.audio));
      navItem(b, '🖥️', 'Anzeige',       () => navigate(PANELS.display));
      b.appendChild(setSection('Allgemein'));
      navItem(b, '⏰', 'Wecker',        () => navigate(PANELS.alarm));
      navItem(b, '🕐', 'Datum & Zeit',  () => navigate(PANELS.datetime));
      navItem(b, '⬇️', 'Update',        () => navigate(PANELS.update));
      navItem(b, '⚙️', 'System',        () => navigate(PANELS.system));
      navItem(b, 'ℹ️', 'Über',           () => navigate(PANELS.about));
    }
  },

  network: {
    title: 'Netzwerk',
    render(b) {
      b.appendChild(setSection('Aktuelle Verbindung'));
      const info = el('div'); b.appendChild(info);
      info.appendChild(el('div', 'search-hint', 'lädt …'));
      const loadInfo = () => fetch('/api/system').then(r => r.json()).then(d => {
        info.innerHTML = '';
        infoRow(info, 'WLAN (SSID)', d.ssid || '—');
        infoRow(info, 'IP-Adresse',  d.ip || '—');
        infoRow(info, 'Signal',      d.signal != null && d.signal !== '' ? d.signal + ' %' : '—');
        infoRow(info, 'Hostname',    d.hostname || '—');
      }).catch(() => { info.innerHTML = '';
        info.appendChild(el('div', 'search-hint', 'Kein lokaler Dienst (server.py) erreichbar.')); });
      loadInfo();

      b.appendChild(setSection('WLAN-Netzwerke'));
      const results = el('div');
      const scanBtn = el('button', 'set-action', '🔍 Netze suchen');
      scanBtn.addEventListener('click', () => {
        results.innerHTML = '';
        results.appendChild(el('div', 'search-hint', 'Suche läuft …'));
        fetch('/api/wifi/scan').then(r => r.json()).then(d => {
          results.innerHTML = '';
          if (!d.available) { results.appendChild(el('div', 'search-hint', 'WLAN-Steuerung nur auf dem Pi (nmcli).')); return; }
          if (!d.networks.length) { results.appendChild(el('div', 'search-hint', 'Keine Netze gefunden.')); return; }
          d.networks.forEach(net => results.appendChild(wifiNetRow(net, loadInfo)));
        }).catch(() => { results.innerHTML = '';
          results.appendChild(el('div', 'search-hint', 'Kein lokaler Dienst erreichbar.')); });
      });
      b.appendChild(scanBtn);
      b.appendChild(results);
    }
  },

  bluetooth: {
    title: 'Bluetooth',
    render(b) {
      b.appendChild(setSection('Gekoppelte Geräte'));
      const known = el('div'); b.appendChild(known);
      function loadKnown() {
        known.innerHTML = '';
        known.appendChild(el('div', 'search-hint', 'lädt …'));
        fetch('/api/bt').then(r => r.json()).then(d => {
          known.innerHTML = '';
          if (!d.available) { known.appendChild(el('div', 'search-hint',
            'Bluetooth ist nur auf dem Pi verfügbar (über server.py / bluetoothctl).')); return; }
          if (!d.devices.length) known.appendChild(el('div', 'search-hint', 'Noch keine Geräte gekoppelt.'));
          d.devices.forEach(dev => known.appendChild(btRow(dev, loadKnown, false)));
        }).catch(() => { known.innerHTML = '';
          known.appendChild(el('div', 'search-hint', 'Kein lokaler Dienst erreichbar.')); });
      }
      loadKnown();

      b.appendChild(setSection('Neue Lautsprecher'));
      const scanRes = el('div');
      const scanBtn = el('button', 'set-action', '🔍 Lautsprecher suchen (ca. 12 s)');
      scanBtn.addEventListener('click', () => {
        scanRes.innerHTML = '';
        scanRes.appendChild(el('div', 'search-hint', 'Suche läuft …'));
        btApi('scan').then(d => {
          scanRes.innerHTML = '';
          if (!d.available) { scanRes.appendChild(el('div', 'search-hint', 'Bluetooth nur auf dem Pi.')); return; }
          const fresh = (d.devices || []).filter(x => !x.paired);
          if (!fresh.length) scanRes.appendChild(el('div', 'search-hint', 'Keine neuen Geräte gefunden. Lautsprecher in den Pairing-Modus bringen.'));
          fresh.forEach(dev => scanRes.appendChild(btRow(dev, loadKnown, true)));
        });
      });
      b.appendChild(scanBtn);
      b.appendChild(scanRes);

      b.appendChild(el('div', 'set-note',
        'Der mit ★ markierte Lautsprecher wird automatisch verbunden, sobald etwas ' +
        'spielt, und nach 1 Minute Stille getrennt (Abschalt-Signal).'));
    }
  },

  audio: {
    title: 'Audio-Ausgang',
    render(b) {
      b.appendChild(setSection('Ausgabegerät (Klinke / HDMI / Bluetooth)'));
      const list = el('div'); b.appendChild(list);
      list.appendChild(el('div', 'search-hint', 'lädt …'));
      const load = () => fetch('/api/audio/sinks').then(r => r.json()).then(d => {
        list.innerHTML = '';
        if (!d.available) { list.appendChild(el('div', 'search-hint', 'Audio-Umschaltung nur auf dem Pi (PipeWire/pactl).')); return; }
        d.sinks.forEach(s => {
          const txt = (s.name + ' ' + s.desc).toLowerCase();
          const ico = /bluez|blue/.test(txt) ? '🔵' : (/hdmi/.test(txt) ? '🖥️' : '🔊');
          const it = el('button', 'set-item',
            `<span class="si-ico">${ico}</span>
             <span class="si-label">${escapeHtml(s.desc || s.name)}</span>
             <span class="si-val">${s.default ? 'aktiv ✓' : ''}</span>`);
          it.addEventListener('click', () => {
            fetch('/api/audio/default', { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: s.name }) }).then(r => r.json()).then(() => load());
          });
          list.appendChild(it);
        });
      }).catch(() => { list.innerHTML = ''; list.appendChild(el('div', 'search-hint', 'Kein lokaler Dienst erreichbar.')); });
      load();

      b.appendChild(setSection('Lautstärke-Limit'));
      const lc = el('div', 'set-choices'); b.appendChild(lc);
      const cur = readNum('volLimit', 100);
      [{v:100,l:'Aus'},{v:85,l:'85 %'},{v:70,l:'70 %'},{v:50,l:'50 %'}].forEach(o => {
        const c = el('button', 'chip' + (o.v === cur ? ' active' : ''), o.l);
        c.addEventListener('click', () => { save('volLimit', o.v); applyVolLimit(); refresh(); });
        lc.appendChild(c);
      });
      b.appendChild(el('div', 'set-note', 'Begrenzt die Maximal-Lautstärke (z.B. nachts).'));
    }
  },

  alarm: {
    title: 'Wecker',
    render(b) {
      b.appendChild(setSection('Weckzeit'));
      const t0 = (localStorage.getItem('alarmTime') || '07:00').split(':');
      let H = parseInt(t0[0], 10) || 0, M = parseInt(t0[1], 10) || 0;
      const saveTime = () => save0('alarmTime', String(H).padStart(2,'0') + ':' + String(M).padStart(2,'0'));
      const grid = el('div', 'alarm-grid'); b.appendChild(grid);
      const col = (get, set, mod) => {
        const c = el('div', 'alarm-col');
        const up = el('button', 'alarm-btn', '▲');
        const val = el('div', 'alarm-val', String(get()).padStart(2,'0'));
        const dn = el('button', 'alarm-btn', '▼');
        up.addEventListener('click', () => { set((get()+1) % mod); val.textContent = String(get()).padStart(2,'0'); saveTime(); });
        dn.addEventListener('click', () => { set((get()+mod-1) % mod); val.textContent = String(get()).padStart(2,'0'); saveTime(); });
        c.append(up, val, dn); return c;
      };
      grid.appendChild(col(() => H, v => H = v, 24));
      grid.appendChild(el('div', 'alarm-colon', ':'));
      grid.appendChild(col(() => M, v => M = v, 60));

      b.appendChild(setSection('Wecker'));
      const oc = el('div', 'set-choices'); b.appendChild(oc);
      const aon = readNum('alarmOn', 0);
      [{v:0,l:'Aus'},{v:1,l:'An'}].forEach(o => {
        const c = el('button', 'chip' + (o.v === aon ? ' active' : ''), o.l);
        c.addEventListener('click', () => { save('alarmOn', o.v); refresh(); });
        oc.appendChild(c);
      });

      b.appendChild(setSection('Aufwach-Klang'));
      const sc = el('div', 'set-choices'); b.appendChild(sc);
      const asound = localStorage.getItem('alarmSound') || 'birds';
      [['birds','Vögel'],['waves','Wellen'],['stream','Bach'],['rain','Regen'],['radio','Radio']].forEach(([id,l]) => {
        const c = el('button', 'chip' + (id === asound ? ' active' : ''), l);
        c.addEventListener('click', () => { save0('alarmSound', id); refresh(); });
        sc.appendChild(c);
      });
      b.appendChild(el('div', 'set-note', 'Zur Weckzeit startet der Klang und wird über ~3 min sanft lauter (Sunrise).'));
    }
  },

  datetime: {
    title: 'Datum & Zeit',
    render(b) {
      b.appendChild(setSection('Aktuell'));
      const info = el('div'); b.appendChild(info);
      info.appendChild(el('div', 'search-hint', 'lädt …'));
      fetch('/api/time').then(r => r.json()).then(d => {
        info.innerHTML = '';
        infoRow(info, 'Uhrzeit',  d.time || '—');
        infoRow(info, 'Datum',    d.date || '—');
        infoRow(info, 'Zeitzone', d.tz || '—');
        infoRow(info, 'NTP',      d.ntp ? (d.synced ? 'synchron ✓' : 'an') : 'aus');
      }).catch(() => { info.innerHTML = ''; info.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });

      b.appendChild(setSection('Zeitzone'));
      const zc = el('div', 'set-choices'); b.appendChild(zc);
      [['Europe/Berlin','Berlin'],['Europe/Zagreb','Zagreb'],['Europe/Vienna','Wien'],['UTC','UTC']].forEach(([tz,l]) => {
        const c = el('button', 'chip', l);
        c.addEventListener('click', () => { c.textContent = '…';
          fetch('/api/time', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ timezone: tz }) })
            .then(r => r.json()).then(() => refresh()); });
        zc.appendChild(c);
      });

      const ntpBtn = el('button', 'set-action', '🕒 Automatische Zeit (NTP) einschalten');
      ntpBtn.addEventListener('click', () => { ntpBtn.textContent = '…';
        fetch('/api/time', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ntp: true }) })
          .then(r => r.json()).then(() => refresh()); });
      b.appendChild(ntpBtn);
      b.appendChild(el('div', 'set-note',
        'Falsche Uhrzeit verhindert das Laden von Logos/Cover (Zertifikatsfehler). ' +
        'Zeitzone/NTP brauchen sudo-Rechte (siehe start-kiosk.sh).'));
    }
  },

  display: {
    title: 'Anzeige',
    render(b) {
      b.appendChild(setSection('Bildschirmschoner (Uhr)'));
      const choices = el('div', 'set-choices'); b.appendChild(choices);
      const opts = [{m:0,l:'Aus'},{m:1,l:'1 min'},{m:3,l:'3 min'},{m:5,l:'5 min'},{m:10,l:'10 min'},{m:30,l:'30 min'}];
      const cur = readNum('idleMin', 3);
      opts.forEach(o => {
        const c = el('button', 'chip' + (o.m === cur ? ' active' : ''), o.l);
        c.addEventListener('click', () => { save('idleMin', o.m); resetIdle(); refresh(); });
        choices.appendChild(c);
      });
      b.appendChild(el('div', 'set-note',
        'Nach dieser Zeit ohne Berührung erscheint die große Uhr.'));

      b.appendChild(setSection('Nachtlicht (Blaulichtfilter)'));
      const wc = el('div', 'set-choices'); b.appendChild(wc);
      const wlevels = [{n:0,l:'Aus'},{n:1,l:'Sanft'},{n:2,l:'Mittel'},{n:3,l:'Stark'}];
      const wcur = readNum('warmLevel', 0);
      wlevels.forEach(o => {
        const c = el('button', 'chip' + (o.n === wcur ? ' active' : ''), o.l);
        c.addEventListener('click', () => { applyWarm(o.n); refresh(); });
        wc.appendChild(c);
      });
      b.appendChild(el('div', 'set-note',
        'Reduziert den Blauanteil – augenschonend am Abend. Schnell ein/aus: ' +
        '„🌙 Warm" in der unteren Leiste.'));

      b.appendChild(setSection('Hintergrund-Effekt'));
      const fc = el('div', 'set-choices'); b.appendChild(fc);
      const fxOpts = [{v:'none',l:'Aus'},{v:'aurora',l:'Aurora'},{v:'nebula',l:'Nebel'},
                      {v:'lava',l:'Lava'},{v:'plasma',l:'Plasma'},{v:'bokeh',l:'Bokeh'},
                      {v:'atem',l:'Atem'},{v:'stars',l:'Sterne'}];
      const fxCur = localStorage.getItem('fxEffect') || 'aurora';
      fxOpts.forEach(o => {
        const c = el('button', 'chip' + (o.v === fxCur ? ' active' : ''), o.l);
        c.addEventListener('click', () => { localStorage.setItem('fxEffect', o.v); applyEffect(); refresh(); });
        fc.appendChild(c);
      });

      const inAppCur = readNum('fxInApp', 0);
      const ac = el('div', 'set-choices'); b.appendChild(ac);
      [{v:0,l:'Nur Screensaver'},{v:1,l:'Auch im App-Hintergrund'}].forEach(o => {
        const c = el('button', 'chip' + (o.v === inAppCur ? ' active' : ''), o.l);
        c.addEventListener('click', () => { save('fxInApp', o.v); applyEffect(); refresh(); });
        ac.appendChild(c);
      });
      b.appendChild(el('div', 'set-note',
        'Der Effekt läuft im Uhr-Screensaver. Optional auch dezent hinter der ' +
        'ganzen App. „Aus" deaktiviert ihn ganz.'));

      b.appendChild(setSection('Bewegung'));
      const mc = el('div', 'set-choices'); b.appendChild(mc);
      const moCur = localStorage.getItem('fxMotion') || 'normal';
      [['off','Aus'],['slow','Langsam'],['normal','Normal'],['fast','Schnell']].forEach(([v, l]) => {
        const c = el('button', 'chip' + (v === moCur ? ' active' : ''), l);
        c.addEventListener('click', () => { save0('fxMotion', v); applyEffect(); refresh(); });
        mc.appendChild(c);
      });
      b.appendChild(el('div', 'set-note', 'Tempo der Animation – „Aus" friert das Bild ein.'));

      b.appendChild(setSection('Aktion'));
      const now = el('button', 'set-action', '🌑 Bildschirmschoner jetzt starten');
      now.addEventListener('click', () => {
        settingsView.classList.add('hidden');
        dimOverlay.classList.remove('hidden');
      });
      b.appendChild(now);
    }
  },

  update: {
    title: 'Update',
    render(b) {
      b.appendChild(setSection('Version'));
      const ver = el('div'); b.appendChild(ver);
      const status = el('div'); b.appendChild(status);
      b.appendChild(setSection('GitHub'));
      const checkBtn = el('button', 'set-action', '🔄 Nach Updates suchen');
      b.appendChild(checkBtn);
      const applyWrap = el('div'); b.appendChild(applyWrap);
      b.appendChild(el('div', 'set-note',
        'zzz.radio holt die neueste Version aus dem GitHub-Repo (git pull) und ' +
        'startet anschließend neu. Funktioniert nur, wenn per git installiert.'));

      const renderState = (d) => {
        ver.innerHTML = ''; status.innerHTML = ''; applyWrap.innerHTML = '';
        if (!d) return;
        if (d.git === false) {
          status.appendChild(el('div', 'search-hint', d.msg || 'Kein Git-Repo.'));
          return;
        }
        infoRow(ver, 'Installiert', d.current || '—');
        infoRow(ver, 'Auf GitHub',  d.latest || '—');
        if (d.available) {
          status.appendChild(el('div', 'update-badge', `⬆️ Update verfügbar (${d.behind} Commit${d.behind > 1 ? 's' : ''})`));
          if (d.latestMsg) status.appendChild(el('div', 'set-note', 'Neueste Änderung: ' + escapeHtml(d.latestMsg)));
          const applyBtn = el('button', 'set-action', '⬇️ Jetzt aktualisieren');
          applyBtn.addEventListener('click', () => doApply(applyBtn));
          applyWrap.appendChild(applyBtn);
        } else {
          status.appendChild(el('div', 'update-badge ok', '✓ zzz.radio ist aktuell'));
        }
      };
      const doCheck = () => {
        checkBtn.textContent = 'verbinde mit GitHub …'; checkBtn.disabled = true;
        ver.innerHTML = ''; status.innerHTML = ''; applyWrap.innerHTML = '';
        fetch('/api/update/check').then(r => r.json()).then(d => {
          checkBtn.textContent = '🔄 Nach Updates suchen'; checkBtn.disabled = false; renderState(d);
        }).catch(() => {
          checkBtn.textContent = '🔄 Nach Updates suchen'; checkBtn.disabled = false;
          status.appendChild(el('div', 'search-hint', 'Kein Dienst / kein Internet.'));
        });
      };
      const doApply = (btn) => {
        uiConfirm('Update installieren und zzz.radio neu starten?').then(ok => {
          if (!ok) return;
          btn.textContent = 'aktualisiere …'; btn.disabled = true;
          fetch('/api/update/apply', { method: 'POST' }).then(r => r.json()).then(d => {
            if (d.ok) {
              status.innerHTML = ''; applyWrap.innerHTML = '';
              status.appendChild(el('div', 'update-badge ok', '✓ Aktualisiert – Neustart …'));
              setTimeout(() => location.reload(), 5000);
            } else { btn.textContent = '⬇️ Jetzt aktualisieren'; btn.disabled = false; uiAlert('Fehler: ' + (d.msg || '')); }
          }).catch(() => {       // Dienst startet neu → Verbindung kurz weg ist normal
            status.innerHTML = ''; applyWrap.innerHTML = '';
            status.appendChild(el('div', 'update-badge ok', '✓ Neustart …'));
            setTimeout(() => location.reload(), 6000);
          });
        });
      };

      checkBtn.addEventListener('click', doCheck);
      doCheck();                                   // beim Öffnen direkt prüfen
    }
  },

  system: {
    title: 'System',
    render(b) {
      b.appendChild(setSection('Info'));
      const box = el('div'); b.appendChild(box);
      infoRow(box, 'App-Version', APP_VERSION);
      box.appendChild(el('div', 'set-info',
        `<span class="k">Uhrzeit</span><span class="v" id="setTime">${new Date().toLocaleString('de-DE')}</span>`));
      fetch('/api/system').then(r => r.json()).then(d => {
        if (d.hostname) infoRow(box, 'Hostname', d.hostname);
        if (d.os)       infoRow(box, 'System',   d.os);
      }).catch(() => {});

      b.appendChild(setSection('Pi-Status'));
      const hb = el('div'); b.appendChild(hb);
      hb.appendChild(el('div', 'search-hint', 'lädt …'));
      fetch('/api/status').then(r => r.json()).then(h => {
        hb.innerHTML = '';
        infoRow(hb, 'CPU-Temperatur', h.tempC != null ? h.tempC + ' °C' : '—');
        infoRow(hb, 'Auslastung',     h.load || '—');
        infoRow(hb, 'Speicher',       h.memPct != null ? h.memPct + ' %' : '—');
        infoRow(hb, 'Datenträger',    h.diskPct != null ? h.diskPct + ' %' : '—');
        infoRow(hb, 'Laufzeit',       h.uptime || '—');
      }).catch(() => { hb.innerHTML = ''; hb.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });

      b.appendChild(setSection('Aktionen'));
      const reload = el('button', 'set-action', '🔄 App neu laden');
      reload.addEventListener('click', () => location.reload());
      b.appendChild(reload);
      const reboot = el('button', 'set-action danger', '♻️ Pi neu starten');
      reboot.addEventListener('click', () => powerAction('reboot', 'Pi wirklich neu starten?'));
      b.appendChild(reboot);
      const shut = el('button', 'set-action danger', '⏻ Pi herunterfahren');
      shut.addEventListener('click', () => powerAction('shutdown', 'Pi wirklich herunterfahren?'));
      b.appendChild(shut);
      const reset = el('button', 'set-action danger', '🧹 Werkseinstellungen');
      reset.addEventListener('click', () => {
        uiConfirm('Alle lokalen App-Einstellungen zurücksetzen?', 'Zurücksetzen', true).then(ok => {
          if (!ok) return;
          localStorage.clear(); location.reload();
        });
      });
      b.appendChild(reset);
      b.appendChild(el('div', 'set-note',
        'Neustart/Herunterfahren laufen nur auf dem Pi (über server.py). ' +
        'Updates unter „Update". Werkseinstellungen löscht die lokalen App-Einstellungen.'));
    }
  },

  about: {
    title: 'Über',
    render(b) {
      b.appendChild(el('div', 'set-note',
        `<b style="color:#eef3fb;font-size:16px">zzz.radio</b><br>Version ${APP_VERSION}<br><br>` +
        'Touch-App für Einschlaf-Sounds & Internet-Radio.<br>' +
        'Design inspiriert von der Logitech Squeezebox Touch.'));
    }
  }
};
