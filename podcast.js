/* ----------------------------------------------------------------------- *
 *  PODCASTS — Suche (iTunes), Abos, Folgen abspielen (über den Radio-Player,
 *  damit der Sleep-Timer die Einschlafgeschichte sanft ausblendet).
 *  Eigenes Modul, lädt nach app.js (geteilte Globals).
 * ----------------------------------------------------------------------- */
function podSubs() { try { return JSON.parse(localStorage.getItem('podcasts') || '[]'); } catch (e) { return []; } }
function podSave(a) { save('podcasts', a); }

function playPodcast(ep, podName) {
  if (typeof ensureCtx === 'function') ensureCtx();
  radioIntended = false; currentStream = null; currentStation = -1;
  currentPodcast = { title: ep.title, url: ep.url };
  if (typeof cancelReconnect === 'function') cancelReconnect();
  if (typeof stopNowPlay === 'function') stopNowPlay();
  if (typeof collapseCover === 'function') collapseCover();
  npArt.innerHTML = '🎙️';
  setNpName((podName ? podName + ' — ' : '') + ep.title);
  npState.textContent = 'lädt …'; npToggle.textContent = '…'; npToggle.classList.add('loading');
  audio.src = ep.url;
  audio.play().catch(() => { npState.textContent = 'Fehler – Folge nicht abspielbar'; npToggle.textContent = '▶'; npToggle.classList.remove('loading'); });
  if (typeof showTab === 'function') showTab('radio');           // Now-Playing-Leiste zeigen
  if (typeof renderStations === 'function') renderStations();
  settingsView.classList.add('hidden');                          // Einstellungen schließen
}

function podEpisodesPanel(p, canSubscribe) {
  return {
    title: (p.name && p.name.length > 22) ? p.name.slice(0, 22) + '…' : (p.name || 'Podcast'),
    render(b) {
      if (canSubscribe && !podSubs().some(x => x.feedUrl === p.feedUrl)) {
        const sub = el('button', 'set-action', '➕ Abonnieren');
        sub.addEventListener('click', () => { const a = podSubs(); a.push({ name: p.name, feedUrl: p.feedUrl, artwork: p.artwork }); podSave(a); sub.textContent = '✓ Abonniert'; sub.disabled = true; });
        b.appendChild(sub);
      }
      const list = el('div'); list.appendChild(el('div', 'search-hint', 'lädt …')); b.appendChild(list);
      fetch('/api/podcast/feed?url=' + encodeURIComponent(p.feedUrl)).then(r => r.json()).then(f => {
        list.innerHTML = '';
        if (f.error || !f.episodes || !f.episodes.length) { list.appendChild(el('div', 'search-hint', 'Folgen konnten nicht geladen werden.')); return; }
        f.episodes.forEach(ep => {
          const meta = ep.duration ? '<br><span class="pod-meta">' + escapeHtml(ep.duration) + '</span>' : '';
          const it = el('button', 'set-item', '<span class="si-ico">▶</span><span class="si-label">' + escapeHtml(ep.title) + meta + '</span>');
          it.addEventListener('click', () => playPodcast(ep, f.title));
          list.appendChild(it);
        });
      }).catch(() => { list.innerHTML = ''; list.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });
    }
  };
}

PANELS.podcast = {
  title: 'Podcasts',
  render(b) {
    if (currentPodcast) b.appendChild(el('div', 'set-note', '▶ Läuft: ' + escapeHtml(currentPodcast.title)));

    b.appendChild(setSection('Abonniert'));
    const subsEl = el('div'); b.appendChild(subsEl);
    const renderSubs = () => {
      subsEl.innerHTML = '';
      const subs = podSubs();
      if (!subs.length) { subsEl.appendChild(el('div', 'search-hint', 'Noch keine – unten suchen & abonnieren.')); return; }
      subs.forEach((p, i) => {
        const it = el('button', 'set-item', '<span class="si-ico">🎙️</span><span class="si-label">' + escapeHtml(p.name) + '</span><span class="si-chev">›</span>');
        it.addEventListener('click', () => navigate(podEpisodesPanel(p)));
        const del = el('button', 'station-del', '🗑');
        del.addEventListener('click', (e) => { e.stopPropagation(); const a = podSubs(); a.splice(i, 1); podSave(a); renderSubs(); });
        const row = el('div', 'wx-city-row'); row.appendChild(it); row.appendChild(del); subsEl.appendChild(row);
      });
    };
    renderSubs();

    b.appendChild(setSection('Einschlafgeschichten finden'));
    const chips = el('div', 'set-choices');
    ['Einschlafgeschichten', 'Schlafgeschichten Erwachsene', 'Gute-Nacht-Geschichten', 'Meditation Einschlafen', 'Sleep Stories'].forEach(q => {
      const c = el('button', 'chip', q);
      c.addEventListener('click', () => { inp.value = q; doSearch(); });
      chips.appendChild(c);
    });
    b.appendChild(chips);

    b.appendChild(setSection('Podcast suchen'));
    const inp = el('input', 'search-input osk-input'); inp.placeholder = 'Name oder Thema …'; inp.setAttribute('inputmode', 'none'); inp.autocomplete = 'off';
    const results = el('div');
    const doSearch = () => {
      if (!inp.value.trim()) return;
      results.innerHTML = ''; results.appendChild(el('div', 'search-hint', 'Suche …'));
      fetch('/api/podcast/search?q=' + encodeURIComponent(inp.value.trim())).then(r => r.json()).then(d => {
        results.innerHTML = '';
        const li = (d && d.results) || [];
        if (!li.length) { results.appendChild(el('div', 'search-hint', 'Nichts gefunden.')); return; }
        li.forEach(p => {
          const it = el('button', 'set-item', '<span class="si-ico">🎙️</span><span class="si-label">' + escapeHtml(p.name) + (p.author ? '<br><span class="pod-meta">' + escapeHtml(p.author) + '</span>' : '') + '</span><span class="si-chev">›</span>');
          it.addEventListener('click', () => navigate(podEpisodesPanel(p, true)));
          results.appendChild(it);
        });
      }).catch(() => { results.innerHTML = ''; results.appendChild(el('div', 'search-hint', 'Kein Dienst erreichbar.')); });
    };
    inp.addEventListener('focus', () => showKeyboard(inp, doSearch));
    inp.addEventListener('click', () => showKeyboard(inp, doSearch));
    const go = el('button', 'set-action', '🔍 Suchen'); go.addEventListener('click', doSearch);
    const row = el('div', 'wifi-pw-row'); row.appendChild(inp); row.appendChild(go);
    b.appendChild(row); b.appendChild(results);
  }
};
