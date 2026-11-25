// Casting-Radar: passende Ausschreibungen, täglich frisch gesucht.
import { ls } from './db.js';
import { $, $$, esc, ICON, fmtDate, daysUntil, relDays, safeUrl, setTop, setFab, largeTitle, toast, openSheet, closeSheet } from './ui.js';
import { auditionSheet } from './castings.js';
import { topic } from './profile.js';
import { applySheet } from './apply.js';
import { illu } from './fx.js';

// ---------- Rückmeldungen ans Radar (lernt, was dir gefällt) ----------
const REASONS = ['Bewerbung kostet Geld', 'Zu weit weg', 'Zu wenig Gage', 'Rolle passt nicht zu mir', 'Format interessiert mich nicht', 'Wirkt unseriös', 'Termin passt nicht'];
export async function sendFeedback(c, aktion, grund = '') {
  const item = { id: c.id, titel: c.titel, art: c.art, rolle: c.rolle, ort: c.ort, gage: c.gage, quelle: c.quelle, aktion, grund, zeit: new Date().toISOString() };
  const q = ls.get('radar.fb', []).filter(x => !(x.id === c.id && x.aktion === aktion));
  q.push(item);
  ls.set('radar.fb', q.slice(-100));
  await pushFeedback([item]);
}
async function pushFeedback(items) {
  const t = topic();
  if (!t || !items.length) return false;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(t)}-feedback`, { method: 'POST', body: JSON.stringify(items) });
    ls.set('radar.fbSent', Date.now());
    return true;
  } catch { return false; }
}
// Was das Radar noch nicht verarbeitet hat, gelegentlich erneut schicken
export function resendFeedback(stand) {
  const open = ls.get('radar.fb', []).filter(x => !stand || x.zeit > stand);
  if (!open.length || Date.now() - ls.get('radar.fbSent', 0) < 6 * 3600e3) return;
  pushFeedback(open);
}

export async function loadRadar() {
  try {
    const r = await fetch('radar/castings.json', { cache: 'no-cache' });
    if (!r.ok) throw 0;
    const data = await r.json();
    const list = (data.castings || []).filter(c => c && c.id && !(c.frist && daysUntil(c.frist) < 0));
    return { updated: data.aktualisiert, profilStand: data.profilStand || null, feedbackStand: data.feedbackStand || null, tipps: (data.tipps || []).filter(t => t && t.titel), list, offline: false };
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
   <span class="top">${neu ? '<span class="tag new">Neu</span>' : ''}<span class="tag">${esc(c.art || 'Casting')}</span>${costTag(c)}${ring(c.match)}</span>
   <h3>${esc(c.titel)}</h3>
   ${c.rolle ? `<span class="sub">${esc(c.rolle)}</span>` : ''}
   <span class="meta">${c.ort ? `<span>${ICON.pin}${esc(c.ort)}</span>` : ''}${deadline(c)}</span>
  </button>`;
}
// Kostet die Bewerbung etwas (z. B. Plus-Mitgliedschaft)?
export const costTag = c => c.bewerbungKostet ? `<span class="tag" style="background:var(--warn-c);color:var(--warn)" title="${esc(c.plattform || 'Mitgliedschaft nötig')}">Mitgliedschaft</span>` : `<span class="tag ok">Kostenlos</span>`;
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
    <dt>Bewerben</dt><dd>${c.bewerbungKostet ? `Nur mit Mitgliedschaft${c.plattform ? ' bei ' + esc(c.plattform) : ''}` : 'Kostenlos'}</dd>
    <dt>Quelle</dt><dd>${esc(c.quelle || 'unbekannt')}${c.castingbuero ? ' · ' + esc(c.castingbuero) : ''}</dd>
   </dl>
   ${c.checks?.length ? `<div class="tagbox">${c.checks.map(x => `<span class="tag ok">${ICON.check.replace('<svg', '<svg style="width:14px;height:14px"')}${esc(x)}</span>`).join('')}</div>` : ''}
   ${url ? `<a class="btn fill wide" href="${esc(url)}" target="_blank" rel="noopener">Zur Ausschreibung ${ICON.ext}</a>` : ''}
   <button class="btn tonal wide" id="dLetter" type="button">${ICON.edit} Bewerbung schreiben</button>
   <div class="grid2"><button class="btn out" id="dApplied" type="button">Beworben</button><button class="btn out" id="dSave" type="button">${saved.has(c.id) ? ICON.starOn + ' Gemerkt' : ICON.star + ' Merken'}</button></div>
   <button class="btn text" id="dHide" type="button">Passt nicht, ausblenden</button>`, body => {
    $('#dLetter', body).onclick = () => applySheet(c);
    $('#dSave', body).onclick = () => { saved.has(c.id) ? saved.delete(c.id) : saved.add(c.id); ls.set('radar.saved', [...saved]); if (saved.has(c.id)) sendFeedback(c, 'gemerkt'); closeSheet(); toast(saved.has(c.id) ? 'Gemerkt' : 'Nicht mehr gemerkt'); onChange?.(); };
    $('#dHide', body).onclick = () => openSheet('Warum passt es nicht?', `<p class="muted small">Das Radar merkt sich das und sucht künftig gezielter.</p><div class="chips" id="fbR" style="flex-wrap:wrap;margin:0;padding:0">${REASONS.map(r => `<button type="button" class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div><button class="btn fill wide" id="fbGo" type="button">Ausblenden</button>`, b2 => {
      $('#fbR', b2).onclick = e => { const x = e.target.closest('.chip'); if (x) x.classList.toggle('on'); };
      $('#fbGo', b2).onclick = () => {
        const why = $$('#fbR .chip.on', b2).map(x => x.dataset.r).join(', ');
        ls.set('radar.hidden', [...ls.get('radar.hidden', []), c.id]);
        sendFeedback(c, 'passt-nicht', why);
        closeSheet(); toast('Ausgeblendet. Das Radar lernt mit.'); onChange?.();
      };
    });
    $('#dApplied', body).onclick = () => auditionSheet(null, () => { sendFeedback(c, 'beworben'); toast('Im Tagebuch eingetragen'); }, {
      projekt: c.projekt || c.titel, rolle: c.rolle || '', art: c.art, status: 'eingereicht', typ: /tape/i.test(c.bewerbung || '') ? 'Self-Tape' : 'E-Casting',
      buero: c.castingbuero || c.quelle || '', quelle: url || '', notiz: c.frist ? `Frist: ${fmtDate(c.frist, { year: true })}` : ''
    });
  });
}

export async function radarView(view, { go }) {
  setTop({ title: 'Radar', large: true, actions: `<button class="ic" id="rRef" type="button" aria-label="Aktualisieren">${ICON.refresh}</button><button class="ic" id="rProf" type="button" aria-label="Suchprofil">${ICON.user}</button>` });
  setFab(null);
  view.innerHTML = `${largeTitle('Radar')}<div class="stack"><div class="skel" style="height:120px"></div><div class="skel" style="height:120px"></div></div>`;
  const { updated, list, offline, feedbackStand, tipps } = await loadRadar();
  resendFeedback(feedbackStand);
  const fresh = new Set(newOnes(list).map(c => c.id));
  let tab = fresh.size ? 'neu' : 'alle';
  const sub = updated ? `Zuletzt gesucht ${esc(new Date(updated).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))} Uhr` : offline ? 'Offline' : 'Noch kein Suchlauf';

  view.innerHTML = `${largeTitle('Radar', sub)}
   <div class="chips" id="rchips">
    <button class="chip${tab === 'neu' ? ' on' : ''}" data-k="neu" type="button">Neu · ${fresh.size}</button>
    <button class="chip${tab === 'alle' ? ' on' : ''}" data-k="alle" type="button">Alle · ${list.length}</button>
    <button class="chip${tab === 'frei' ? ' on' : ''}" data-k="frei" type="button">Kostenlos bewerben</button>
    <button class="chip${tab === 'abo' ? ' on' : ''}" data-k="abo" type="button">Mit Mitgliedschaft</button>
    <button class="chip${tab === 'gemerkt' ? ' on' : ''}" data-k="gemerkt" type="button">Gemerkt</button>
   </div>
   <div class="stack" id="rlist" style="margin-top:8px"></div>
   ${tipps?.length ? `<div class="sec"><div class="sec-h"><h2>Kostenlos, bringt bezahlte Jobs</h2></div><div class="list">${tipps.map(t => { const u = safeUrl(t.url); return `<${u ? 'a' : 'div'} class="li"${u ? ` href="${esc(u)}" target="_blank" rel="noopener"` : ''}><span class="tile">${ICON.star}</span><span class="li-main"><b>${esc(t.titel)}</b><small style="white-space:normal">${esc(t.text)}</small></span>${u ? ICON.ext : ''}</${u ? 'a' : 'div'}>`; }).join('')}</div></div>` : ''}
   <p class="legal" style="margin-top:20px">Nur Castings mit Gage. „Kostenlos“ heißt: Bewerbung direkt und ohne Kosten. „Mitgliedschaft“ heißt: Die Plattform verlangt zum Bewerben ein Bezahl-Konto.</p>`;
  const render = () => {
    const hidden = new Set(ls.get('radar.hidden', [])), saved = new Set(ls.get('radar.saved', []));
    let rows = list.filter(c => !hidden.has(c.id));
    if (tab === 'neu') rows = rows.filter(c => fresh.has(c.id));
    if (tab === 'gemerkt') rows = rows.filter(c => saved.has(c.id));
    if (tab === 'frei') rows = rows.filter(c => !c.bewerbungKostet);
    if (tab === 'abo') rows = rows.filter(c => c.bewerbungKostet);
    rows.sort((a, b) => (fresh.has(b.id) - fresh.has(a.id)) || ((b.match || 0) - (a.match || 0)) || (a.frist || '9').localeCompare(b.frist || '9'));
    $('#rlist', view).innerHTML = rows.length ? rows.map(c => cardHtml(c, { neu: fresh.has(c.id) })).join('') :
      `<div class="empty">${illu(tab === 'gemerkt' ? 'search' : 'radar')}<b>${tab === 'neu' ? 'Nichts Neues' : tab === 'gemerkt' ? 'Noch nichts gemerkt' : 'Gerade nichts Passendes'}</b>${tab === 'alle' ? 'Das Radar sucht jeden Tag neu. Neue Treffer kommen als Benachrichtigung.' : ''}</div>`;
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
