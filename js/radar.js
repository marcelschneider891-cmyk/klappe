// Casting-Radar: passende Ausschreibungen, täglich frisch gesucht.
import { ls } from './db.js';
import { $, $$, esc, ICON, fmtDate, daysUntil, relDays, safeUrl, setTop, setFab, largeTitle, toast, openSheet, closeSheet } from './ui.js';
import { auditionSheet } from './castings.js';

export async function loadRadar() {
  try {
    const r = await fetch('radar/castings.json', { cache: 'no-cache' });
    if (!r.ok) throw 0;
    const data = await r.json();
    const list = (data.castings || []).filter(c => c && c.id && !(c.frist && daysUntil(c.frist) < 0));
    return { updated: data.aktualisiert, profilStand: data.profilStand || null, list, offline: false };
  } catch { return { updated: null, profilStand: null, list: [], offline: true }; }
}
export function newOnes(list) {
  const seen = new Set(ls.get('radar.seen', [])), hidden = new Set(ls.get('radar.hidden', []));
  return list.filter(c => !seen.has(c.id) && !hidden.has(c.id));
}
export function updateBadge(n) {
  const dot = $('#radarDot');
  dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n;
  try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {}
}
const ring = m => `<span class="ring" style="--p:${Math.max(0, Math.min(100, +m || 0))}" title="Passt zu ${+m || 0} %">${+m || 0}</span>`;
const deadline = c => { if (!c.frist) return ''; const d = daysUntil(c.frist); return `<span class="${d <= 3 ? 'bald' : ''}">${ICON.clock}Frist ${esc(fmtDate(c.frist))}${d <= 3 ? ` (${relDays(c.frist)})` : ''}</span>`; };

export function cardHtml(c, { neu = false } = {}) {
  return `<button class="rcard" type="button" data-id="${esc(c.id)}">
   <span class="top">${neu ? '<span class="tag new">Neu</span>' : ''}<span class="tag">${esc(c.art || 'Casting')}</span>${ring(c.match)}</span>
   <h3>${esc(c.titel)}</h3>
   ${c.rolle ? `<span class="sub">${esc(c.rolle)}</span>` : ''}
   <span class="meta">${c.ort ? `<span>${ICON.pin}${esc(c.ort)}</span>` : ''}${deadline(c)}</span>
  </button>`;
}
export function miniHtml(c, neu) {
  return `<a class="mini press" href="#radar" data-id="${esc(c.id)}"><span class="row" style="flex-wrap:nowrap">${neu ? '<span class="tag new">Neu</span>' : `<span class="tag">${esc(c.art || 'Casting')}</span>`}${ring(c.match)}</span><b>${esc(c.titel)}</b><small>${[c.ort, c.frist ? 'Frist ' + fmtDate(c.frist) : ''].filter(Boolean).map(esc).join(' · ')}</small></a>`;
}

export function detailSheet(c, onChange) {
  const url = safeUrl(c.url);
  const saved = new Set(ls.get('radar.saved', []));
  openSheet(c.art || 'Casting', `
   <div class="stack" style="gap:6px"><h3 style="margin:0;font:600 1.25rem/1.3 var(--f)">${esc(c.titel)}</h3>${c.projekt && c.projekt !== c.titel ? `<p class="muted">${esc(c.projekt)}</p>` : ''}</div>
   ${c.warum ? `<div class="card pad row" style="flex-wrap:nowrap;align-items:flex-start">${ring(c.match)}<p>${esc(c.warum)}</p></div>` : ''}
   <dl class="dl">
    ${c.rolle ? `<dt>Rolle</dt><dd>${esc(c.rolle)}${c.rollenprofil ? `<br><span class="muted">${esc(c.rollenprofil)}</span>` : ''}</dd>` : ''}
    ${c.ort ? `<dt>Ort</dt><dd>${esc(c.ort)}</dd>` : ''}
    ${c.drehzeitraum ? `<dt>Zeitraum</dt><dd>${esc(c.drehzeitraum)}</dd>` : ''}
    ${c.gage ? `<dt>Gage</dt><dd>${esc(c.gage)}</dd>` : ''}
    ${c.frist ? `<dt>Frist</dt><dd>${esc(fmtDate(c.frist, { long: true, year: true }))} (${esc(relDays(c.frist))})</dd>` : ''}
    ${c.bewerbung ? `<dt>Bewerbung</dt><dd>${esc(c.bewerbung)}</dd>` : ''}
    <dt>Quelle</dt><dd>${esc(c.quelle || 'unbekannt')}${c.castingbuero ? ' · ' + esc(c.castingbuero) : ''}</dd>
   </dl>
   ${c.checks?.length ? `<div class="tagbox">${c.checks.map(x => `<span class="tag ok">${ICON.check.replace('<svg', '<svg style="width:14px;height:14px"')}${esc(x)}</span>`).join('')}</div>` : ''}
   ${url ? `<a class="btn fill wide" href="${esc(url)}" target="_blank" rel="noopener">Zur Ausschreibung ${ICON.ext}</a>` : ''}
   <div class="grid2"><button class="btn tonal" id="dApplied" type="button">Beworben</button><button class="btn out" id="dSave" type="button">${saved.has(c.id) ? ICON.starOn + ' Gemerkt' : ICON.star + ' Merken'}</button></div>
   <button class="btn text" id="dHide" type="button">Passt nicht, ausblenden</button>`, body => {
    $('#dSave', body).onclick = () => { saved.has(c.id) ? saved.delete(c.id) : saved.add(c.id); ls.set('radar.saved', [...saved]); closeSheet(); toast(saved.has(c.id) ? 'Gemerkt' : 'Nicht mehr gemerkt'); onChange?.(); };
    $('#dHide', body).onclick = () => { ls.set('radar.hidden', [...ls.get('radar.hidden', []), c.id]); closeSheet(); toast('Ausgeblendet'); onChange?.(); };
    $('#dApplied', body).onclick = () => auditionSheet(null, () => toast('Im Tagebuch eingetragen'), {
      projekt: c.projekt || c.titel, rolle: c.rolle || '', art: c.art, status: 'eingereicht', typ: /tape/i.test(c.bewerbung || '') ? 'Self-Tape' : 'E-Casting',
      buero: c.castingbuero || c.quelle || '', quelle: url || '', notiz: c.frist ? `Frist: ${fmtDate(c.frist, { year: true })}` : ''
    });
  });
}

export async function radarView(view, { go }) {
  setTop({ title: 'Radar', large: true, actions: `<button class="ic" id="rRef" type="button" aria-label="Aktualisieren">${ICON.refresh}</button><button class="ic" id="rProf" type="button" aria-label="Suchprofil">${ICON.user}</button>` });
  setFab(null);
  view.innerHTML = `${largeTitle('Radar')}<div class="stack"><div class="skel" style="height:120px"></div><div class="skel" style="height:120px"></div></div>`;
  const { updated, list, offline } = await loadRadar();
  const fresh = new Set(newOnes(list).map(c => c.id));
  let tab = fresh.size ? 'neu' : 'alle';
  const sub = updated ? `Zuletzt gesucht ${esc(new Date(updated).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} Uhr` : offline ? 'Offline' : 'Noch kein Suchlauf';

  view.innerHTML = `${largeTitle('Radar', sub)}
   <div class="chips" id="rchips">
    <button class="chip${tab === 'neu' ? ' on' : ''}" data-k="neu" type="button">Neu · ${fresh.size}</button>
    <button class="chip${tab === 'alle' ? ' on' : ''}" data-k="alle" type="button">Alle · ${list.length}</button>
    <button class="chip${tab === 'gemerkt' ? ' on' : ''}" data-k="gemerkt" type="button">Gemerkt</button>
   </div>
   <div class="stack" id="rlist" style="margin-top:8px"></div>
   <p class="legal" style="margin-top:20px">Nur bezahlte, öffentliche Ausschreibungen ohne Gebühren für dich.</p>`;
  const render = () => {
    const hidden = new Set(ls.get('radar.hidden', [])), saved = new Set(ls.get('radar.saved', []));
    let rows = list.filter(c => !hidden.has(c.id));
    if (tab === 'neu') rows = rows.filter(c => fresh.has(c.id));
    if (tab === 'gemerkt') rows = rows.filter(c => saved.has(c.id));
    rows.sort((a, b) => (fresh.has(b.id) - fresh.has(a.id)) || ((b.match || 0) - (a.match || 0)) || (a.frist || '9').localeCompare(b.frist || '9'));
    $('#rlist', view).innerHTML = rows.length ? rows.map(c => cardHtml(c, { neu: fresh.has(c.id) })).join('') :
      `<div class="empty">${ICON.search}<b>${tab === 'neu' ? 'Nichts Neues' : tab === 'gemerkt' ? 'Noch nichts gemerkt' : 'Gerade nichts Passendes'}</b>${tab === 'alle' ? 'Das Radar sucht jeden Tag neu. Neue Treffer kommen als Benachrichtigung.' : ''}</div>`;
  };
  render();
  ls.set('radar.seen', [...new Set([...ls.get('radar.seen', []), ...list.map(c => c.id)])].slice(-500));
  updateBadge(0);
  const open = ls.get('radar.open', null);
  if (open) { ls.set('radar.open', null); const c = list.find(x => x.id === open); if (c) detailSheet(c, render); }

  $('#rchips', view).onclick = e => { const c = e.target.closest('.chip'); if (!c) return; tab = c.dataset.k; $$('#rchips .chip', view).forEach(x => x.classList.toggle('on', x === c)); render(); };
  $('#rlist', view).onclick = e => { const b = e.target.closest('[data-id]'); if (b) detailSheet(list.find(x => x.id === b.dataset.id), render); };
  $('#rRef').onclick = () => go('radar', true);
  $('#rProf').onclick = () => go('profil');
}
