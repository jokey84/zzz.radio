/* ----------------------------------------------------------------------- *
 *  PHILIPS HUE — lokale Steuerung über die Bridge (Proxy in server.py).
 *  Stylische Karten im Hue-App-Look: Glow im Lichtton, Schalter,
 *  Helligkeit, Farbspektrum + Warm/Kalt-Weiß + Schnellfarben.
 * ----------------------------------------------------------------------- */
function hueCfg() { return { ip: localStorage.getItem('hueIp') || '', user: localStorage.getItem('hueUser') || '' }; }
function huePaired() { const c = hueCfg(); return !!(c.ip && c.user); }
function hueApiSet(kind, id, state) {
  const c = hueCfg();
  return fetch('/api/hue/set', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ip: c.ip, user: c.user, kind: kind, id: id, state: state })
  }).then(r => r.json()).catch(() => ({ ok: false }));
}
const _hueT = {};
function hueDeb(kind, id, state) { const k = kind + id; clearTimeout(_hueT[k]); _hueT[k] = setTimeout(() => hueApiSet(kind, id, state), 180); }

/* aktuelle Lichtfarbe als CSS-Farbe (für den Glow) */
function hueColorOf(st) {
  if (!st) return '#ffd479';
  if (st.colormode === 'ct' || (st.ct !== undefined && st.hue === undefined)) {
    const t = Math.max(0, Math.min(1, (st.ct - 153) / 347));        // 0 kühl … 1 warm
    const L = (a, b) => Math.round(a + (b - a) * t);
    return 'rgb(' + L(210, 255) + ',' + L(228, 198) + ',' + L(255, 150) + ')';
  }
  if (st.hue !== undefined) {
    const h = st.hue / 65535 * 360, s = Math.max(45, (st.sat || 200) / 254 * 100);
    return 'hsl(' + h.toFixed(0) + ',' + s.toFixed(0) + '%,58%)';
  }
  return '#ffe49a';
}

const HUE_SWATCHES = [
  { c: '#ff3b30', hue: 0, sat: 254 }, { c: '#ff9500', hue: 5000, sat: 254 },
  { c: '#ffcc00', hue: 9000, sat: 230 }, { c: '#34c759', hue: 25500, sat: 254 },
  { c: '#00c7be', hue: 35000, sat: 230 }, { c: '#0a84ff', hue: 44000, sat: 254 },
  { c: '#5e5ce6', hue: 47000, sat: 220 }, { c: '#ff2d55', hue: 56000, sat: 230 },
  { c: '#ffd9a0', ct: 454 }, { c: '#eaf2ff', ct: 200 }
];

function hueSliderRow(icon, sl) { const r = el('div', 'hue-slrow'); r.appendChild(el('span', 'hue-ico', icon)); r.appendChild(sl); return r; }

function hueCard(kind, id, name, st) {
  const on = (kind === 'groups' && st.any_on !== undefined) ? st.any_on : st.on;
  const card = el('div', 'hue-card' + (on ? ' on' : ''));
  card.style.setProperty('--c', hueColorOf(st));
  card.appendChild(el('div', 'hue-glow'));
  const body = el('div', 'hue-body');

  const head = el('div', 'hue-head');
  head.appendChild(el('span', 'hue-name', '💡 ' + escapeHtml(name || ('Licht ' + id))));
  const sw = el('button', 'hue-sw' + (on ? ' on' : ''));
  sw.setAttribute('aria-label', 'An/Aus');
  sw.addEventListener('click', () => { const v = !sw.classList.contains('on'); sw.classList.toggle('on', v); card.classList.toggle('on', v); hueApiSet(kind, id, { on: v }); });
  head.appendChild(sw); body.appendChild(head);

  const bri = el('input', 'slider'); bri.type = 'range'; bri.min = 1; bri.max = 254; bri.value = st.bri || 200; fillSlider(bri);
  bri.addEventListener('input', () => { fillSlider(bri); sw.classList.add('on'); card.classList.add('on'); hueDeb(kind, id, { on: true, bri: +bri.value }); });
  body.appendChild(hueSliderRow('🔆', bri));

  const hasColor = st.hue !== undefined, hasCt = st.ct !== undefined;
  if (hasColor) {
    const h = el('input', 'slider hue-spectrum'); h.type = 'range'; h.min = 0; h.max = 360; h.value = Math.round((st.hue || 0) / 65535 * 360);
    h.addEventListener('input', () => { card.style.setProperty('--c', 'hsl(' + h.value + ',90%,58%)'); card.classList.add('on'); hueDeb(kind, id, { on: true, hue: Math.round(h.value / 360 * 65535), sat: 254 }); });
    body.appendChild(hueSliderRow('🎨', h));
  }
  if (hasCt) {
    const ct = el('input', 'slider ct-spectrum'); ct.type = 'range'; ct.min = 153; ct.max = 500; ct.value = st.ct || 366;
    ct.addEventListener('input', () => { card.style.setProperty('--c', hueColorOf({ ct: +ct.value })); card.classList.add('on'); hueDeb(kind, id, { on: true, ct: +ct.value }); });
    body.appendChild(hueSliderRow('🌡️', ct));
  }
  if (hasColor || hasCt) {
    const sws = el('div', 'hue-colors');
    HUE_SWATCHES.forEach(s => {
      if (s.ct !== undefined && !hasCt) return;
      if (s.hue !== undefined && !hasColor) return;
      const dot = el('button', 'hue-dot'); dot.style.background = s.c;
      dot.addEventListener('click', () => {
        sw.classList.add('on'); card.classList.add('on'); card.style.setProperty('--c', s.c);
        hueApiSet(kind, id, s.ct !== undefined ? { on: true, ct: s.ct } : { on: true, hue: s.hue, sat: s.sat });
      });
      sws.appendChild(dot);
    });
    body.appendChild(sws);
  }
  card.appendChild(body);
  return card;
}

function hueRenderControl(b) {
  const c = hueCfg();
  b.appendChild(setSection('Schnell'));
  const tools = el('div', 'set-choices');
  [['💡 Alle an', true], ['🌑 Alle aus', false]].forEach(([lbl, v]) => {
    const ch = el('button', 'chip', lbl);
    ch.addEventListener('click', () => hueApiSet('groups', '0', { on: v }).then(() => setTimeout(load, 500)));
    tools.appendChild(ch);
  });
  const gn = el('button', 'chip', '🌙 Gute Nacht');
  gn.addEventListener('click', () => uiConfirm('Gute Nacht: Lichter über 1 Min. ausblenden und Sleep-Timer (30 Min.) starten?').then(ok => {
    if (!ok) return;
    hueApiSet('groups', '0', { on: false, transitiontime: 600 });   // sanft über 60 s ausblenden
    if (typeof startTimer === 'function') startTimer(30);            // Ton über 30 Min ausblenden
    setTimeout(load, 800);
  }));
  tools.appendChild(gn);
  b.appendChild(tools);

  b.appendChild(setSection('Räume & Lichter'));
  const wrap = el('div'); wrap.appendChild(el('div', 'search-hint', 'lädt …')); b.appendChild(wrap);
  function load() {
    fetch('/api/hue/state?ip=' + encodeURIComponent(c.ip) + '&user=' + encodeURIComponent(c.user))
      .then(r => r.json()).then(d => {
        wrap.innerHTML = '';
        if (d.error) { wrap.appendChild(el('div', 'search-hint', 'Bridge nicht erreichbar: ' + d.error)); return; }
        const groups = d.groups || {}, gk = Object.keys(groups);
        gk.forEach(id => {
          const g = groups[id];
          const st = Object.assign({}, g.action || {}, { any_on: g.state ? g.state.any_on : (g.action && g.action.on) });
          wrap.appendChild(hueCard('groups', id, g.name, st));
        });
        const lights = d.lights || {}, lk = Object.keys(lights);
        if (lk.length) {
          wrap.appendChild(setSection('Einzelne Lichter'));
          lk.forEach(id => { const L = lights[id]; wrap.appendChild(hueCard('lights', id, L.name, L.state)); });
        }
        if (!gk.length && !lk.length) wrap.appendChild(el('div', 'search-hint', 'Keine Lichter gefunden.'));

        const scenes = d.scenes || {};
        const sk = Object.keys(scenes).filter(id => scenes[id].name && (scenes[id].type === 'GroupScene' || scenes[id].group)).slice(0, 40);
        if (sk.length) {
          wrap.appendChild(setSection('Szenen'));
          const sc = el('div', 'hue-scenes');
          sk.forEach(id => {
            const s = scenes[id];
            const btn = el('button', 'hue-scene', '🎬 ' + escapeHtml(s.name));
            btn.addEventListener('click', () => hueApiSet('groups', s.group || '0', { scene: id }).then(() => setTimeout(load, 600)));
            sc.appendChild(btn);
          });
          wrap.appendChild(sc);
        }
      }).catch(() => { wrap.innerHTML = ''; wrap.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });
  }
  load();

  b.appendChild(setSection('Bridge: ' + escapeHtml(c.ip)));
  const dis = el('button', 'set-action', 'Bridge trennen');
  dis.addEventListener('click', () => uiConfirm('Verbindung zur Hue Bridge trennen?').then(ok => { if (ok) { localStorage.removeItem('hueUser'); refresh(); } }));
  b.appendChild(dis);
}

function hueRenderPairing(b) {
  b.appendChild(setSection('Hue Bridge koppeln'));
  b.appendChild(el('div', 'set-note', 'Verbinde dich mit deiner Philips-Hue-Bridge im selben WLAN.'));
  const status = el('div');
  const pairWith = (ip) => uiConfirm('Drücke jetzt den runden Knopf oben auf der Hue Bridge und tippe dann OK.').then(ok => {
    if (!ok) return;
    status.innerHTML = ''; status.appendChild(el('div', 'search-hint', 'koppeln …'));
    fetch('/api/hue/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: ip }) })
      .then(r => r.json()).then(d => {
        if (d.ok) { save0('hueIp', ip); save0('hueUser', d.username); refresh(); }
        else { status.innerHTML = ''; uiAlert('Koppeln fehlgeschlagen: ' + (d.msg || '') + '\n\nBitte den Knopf auf der Bridge drücken und erneut versuchen.'); }
      }).catch(() => { status.innerHTML = ''; uiAlert('Kein Dienst erreichbar.'); });
  });

  const findBtn = el('button', 'set-action', '🔍 Bridge im Netzwerk suchen');
  findBtn.addEventListener('click', () => {
    status.innerHTML = ''; status.appendChild(el('div', 'search-hint', 'suche …'));
    fetch('/api/hue/discover').then(r => r.json()).then(d => {
      status.innerHTML = '';
      const list = (d && d.bridges) || [];
      if (!list.length) { status.appendChild(el('div', 'search-hint', 'Keine Bridge gefunden – IP unten manuell eingeben.')); return; }
      list.forEach(br => {
        const it = el('button', 'set-item', '<span class="si-label">Bridge ' + escapeHtml(br.ip) + '</span><span class="si-chev">›</span>');
        it.addEventListener('click', () => pairWith(br.ip));
        status.appendChild(it);
      });
    }).catch(() => { status.innerHTML = ''; status.appendChild(el('div', 'search-hint', 'Discovery fehlgeschlagen (kein Internet?).')); });
  });
  b.appendChild(findBtn); b.appendChild(status);

  b.appendChild(setSection('Oder Bridge-IP manuell'));
  const inp = el('input', 'search-input osk-input'); inp.placeholder = 'z. B. 192.168.2.50'; inp.setAttribute('inputmode', 'none'); inp.autocomplete = 'off';
  const tryIp = () => { if (inp.value.trim()) pairWith(inp.value.trim()); };
  inp.addEventListener('focus', () => showKeyboard(inp, tryIp));
  inp.addEventListener('click', () => showKeyboard(inp, tryIp));
  const go = el('button', 'set-action', 'Verbinden'); go.addEventListener('click', tryIp);
  const row = el('div', 'wifi-pw-row'); row.appendChild(inp); row.appendChild(go);
  b.appendChild(row);
}

PANELS.hue = {
  title: 'Philips Hue',
  render(b) { if (huePaired()) hueRenderControl(b); else hueRenderPairing(b); }
};
