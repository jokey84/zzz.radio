/* ----------------------------------------------------------------------- *
 *  PHILIPS HUE — lokale Steuerung über die Bridge (Proxy in server.py).
 *  Eigenes Modul, lädt nach app.js (geteilte Globals: el, setSection, …).
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

/* eine Zeile: Name + An/Aus + Helligkeit */
function hueRow(kind, id, name, on, bri) {
  const wrap = el('div', 'hue-row');
  const head = el('div', 'hue-head');
  head.appendChild(el('span', 'hue-name', escapeHtml(name || ('Licht ' + id))));
  const tog = el('button', 'hue-toggle' + (on ? ' on' : ''), on ? 'An' : 'Aus');
  head.appendChild(tog); wrap.appendChild(head);
  const sl = el('input', 'slider'); sl.type = 'range'; sl.min = 1; sl.max = 254; sl.value = bri || 254;
  fillSlider(sl); wrap.appendChild(sl);
  tog.addEventListener('click', () => {
    const nowOn = !tog.classList.contains('on');
    tog.classList.toggle('on', nowOn); tog.textContent = nowOn ? 'An' : 'Aus';
    hueApiSet(kind, id, { on: nowOn });
  });
  let t = null;
  sl.addEventListener('input', () => {
    fillSlider(sl);
    clearTimeout(t);
    t = setTimeout(() => { tog.classList.add('on'); tog.textContent = 'An'; hueApiSet(kind, id, { on: true, bri: +sl.value }); }, 160);
  });
  return wrap;
}

function hueRenderControl(b) {
  const c = hueCfg();
  const tools = el('div', 'set-choices');
  ['An', 'Aus'].forEach(lbl => {
    const ch = el('button', 'chip', (lbl === 'An' ? '💡 Alle an' : '🌑 Alle aus'));
    ch.addEventListener('click', () => hueApiSet('groups', '0', { on: lbl === 'An' }).then(() => setTimeout(load, 400)));
    tools.appendChild(ch);
  });
  b.appendChild(setSection('Schnell'));
  b.appendChild(tools);

  b.appendChild(setSection('Räume & Lichter'));
  const wrap = el('div'); wrap.appendChild(el('div', 'search-hint', 'lädt …')); b.appendChild(wrap);
  function load() {
    fetch('/api/hue/state?ip=' + encodeURIComponent(c.ip) + '&user=' + encodeURIComponent(c.user))
      .then(r => r.json()).then(d => {
        wrap.innerHTML = '';
        if (d.error) { wrap.appendChild(el('div', 'search-hint', 'Bridge nicht erreichbar: ' + d.error)); return; }
        const groups = d.groups || {}, gk = Object.keys(groups);
        if (gk.length) {
          gk.forEach(id => {
            const g = groups[id];
            const on = g.state ? g.state.any_on : (g.action && g.action.on);
            wrap.appendChild(hueRow('groups', id, g.name, on, g.action ? g.action.bri : 254));
          });
        }
        const lights = d.lights || {}, lk = Object.keys(lights);
        if (lk.length) {
          wrap.appendChild(setSection('Einzelne Lichter'));
          lk.forEach(id => { const L = lights[id]; wrap.appendChild(hueRow('lights', id, L.name, L.state.on, L.state.bri)); });
        }
        if (!gk.length && !lk.length) wrap.appendChild(el('div', 'search-hint', 'Keine Lichter gefunden.'));
      }).catch(() => { wrap.innerHTML = ''; wrap.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });
  }
  load();
  window._hueReload = load;

  const dis = el('button', 'set-action', 'Bridge trennen');
  dis.addEventListener('click', () => uiConfirm('Verbindung zur Hue Bridge trennen?').then(ok => {
    if (ok) { localStorage.removeItem('hueUser'); refresh(); }
  }));
  b.appendChild(setSection('Bridge: ' + escapeHtml(c.ip)));
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
  inp.addEventListener('focus', () => showKeyboard(inp, () => { if (inp.value.trim()) pairWith(inp.value.trim()); }));
  inp.addEventListener('click', () => showKeyboard(inp, () => { if (inp.value.trim()) pairWith(inp.value.trim()); }));
  const go = el('button', 'set-action', 'Verbinden'); go.addEventListener('click', () => { if (inp.value.trim()) pairWith(inp.value.trim()); });
  const row = el('div', 'wifi-pw-row'); row.appendChild(inp); row.appendChild(go);
  b.appendChild(row);
}

PANELS.hue = {
  title: 'Philips Hue',
  render(b) { if (huePaired()) hueRenderControl(b); else hueRenderPairing(b); }
};
