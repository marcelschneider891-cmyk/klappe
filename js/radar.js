// Casting-Radar: passende Ausschreibungen, täglich frisch gesucht.
import { ls } from './db.js';
import { $, $$, esc, ICON, fmtDate, daysUntil, safeUrl, setTop, toast } from './ui.js';
import { auditionSheet } from './castings.js';

export async function loadRadar() {
  try {
    const r = await fetch('radar/castings.json', { cache: 'no-cache' });
    if (!r.ok) throw 0;
    const data = await r.json();
    const list = (data.castings || []).filter(c => c && c.id && !(c.frist && daysUntil(c.frist) < 0));
    return { updated: data.aktualisiert, list, offline: false };
  } catch {
    return { updated: null, list: [], offline: true };
  }
}

export async function loadProfile() {
  try { const r = await fetch('radar/profil.json', { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch { return null; }
}

export function newOnes(list) {
  const seen = new Set(ls.get('radar.seen', []));
  return list.filter(c => !seen.has(c.id) && !ls.get('radar.hidden', []).includes(c.id));
}

export function updateBadge(n) {
  const dot = $('#radarDot');
  dot.hidden = !n; dot.textContent = n > 9 ? '9+' : n;
  try { n ? navigator.setAppBadge?.(n) : navigator.clearAppBadge?.(); } catch {}
}

export function cardHtml(c, { neu = false, saved = false, compact = false } = {}) {
  const d = daysUntil(c.frist);
  const url = safeUrl(c.url);
  const match = Math.max(0, Math.min(100, +c.match || 0));
  return `<article class="rcard${neu ? ' neu' : ''}" data-id="${esc(c.id)}">
   <div class="between"><span class="row" style="gap:8px">${neu ? '<span class="pill neu">Neu</span>' : ''}<span class="pill gold">${esc(c.art || 'Casting')}</span></span>
    <span class="match" title="Wie gut es zu dir passt">${match}%<i><b style="width:${match}%"></b></i></span></div>
   <h3>${esc(c.titel)}</h3>
   ${c.rolle ? `<p><b style="color:var(--silber)">Rolle:</b> ${esc(c.rolle)}${c.rollenprofil ? ` <span class="leise">(${esc(c.rollenprofil)})</span>` : ''}</p>` : ''}
   <div class="meta">
    ${c.ort ? `<span>${ICON.pin}${esc(c.ort)}</span>` : ''}
    ${c.frist ? `<span class="deadline${d != null && d <= 3 ? ' bald' : ''}">${ICON.cal}Bewerben bis ${esc(fmtDate(c.frist))}${d != null && d <= 3 ? (d <= 0 ? ' (heute)' : ` (noch ${d} ${d === 1 ? 'Tag' : 'Tage'})`) : ''}</span>` : ''}
    ${c.gage ? `<span>${ICON.euro}${esc(c.gage)}</span>` : ''}
    ${c.drehzeitraum ? `<span>${ICON.film}${esc(c.drehzeitraum)}</span>` : ''}
   </div>
   ${!compact && c.warum ? `<p class="why">${esc(c.warum)}</p>` : ''}
   ${!compact && c.bewerbung ? `<p class="small leise">So bewirbst du dich: ${esc(c.bewerbung)}</p>` : ''}
   ${!compact && c.checks?.length ? `<div class="checks">${c.checks.map(x => `<span class="pill s-gebucht" style="background:var(--gut-bg);color:var(--gut)">✓ ${esc(x)}</span>`).join('')}</div>` : ''}
   ${!compact ? `<div class="row">
    ${url ? `<a class="btn gold sm" href="${esc(url)}" target="_blank" rel="noopener" data-act="open">Zur Ausschreibung ${ICON.ext}</a>` : ''}
    <button class="btn sm" type="button" data-act="applied">Beworben</button>
    <button class="ic" type="button" data-act="save" aria-label="${saved ? 'Nicht mehr merken' : 'Merken'}" style="color:var(--messing-hell)">${saved ? ICON.starOn : ICON.star}</button>
    <button class="link" type="button" data-act="hide" style="margin-left:auto;color:var(--leise)">Passt nicht</button>
   </div>
   <p class="small leise">Quelle: ${esc(c.quelle || 'unbekannt')} · gefunden ${esc(fmtDate(c.gefunden))}</p>` : ''}
  </article>`;
}

export async function radarView(view, { go }) {
  setTop({ title: 'Casting-Radar' });
  view.innerHTML = '<p class="leise">Lade Castings …</p>';
  const [{ updated, list, offline }, profile] = await Promise.all([loadRadar(), loadProfile()]);
  const fresh = new Set(newOnes(list).map(c => c.id));
  let tab = fresh.size ? 'neu' : 'alle';

  const render = () => {
    const hidden = new Set(ls.get('radar.hidden', []));
    const saved = new Set(ls.get('radar.saved', []));
    let rows = list.filter(c => !hidden.has(c.id));
    if (tab === 'neu') rows = rows.filter(c => fresh.has(c.id));
    if (tab === 'gemerkt') rows = rows.filter(c => saved.has(c.id));
    rows.sort((a, b) => (fresh.has(b.id) - fresh.has(a.id)) || ((b.match || 0) - (a.match || 0)) || (a.frist || '9').localeCompare(b.frist || '9'));
    $('#rlist', view).innerHTML = rows.length ? rows.map(c => cardHtml(c, { neu: fresh.has(c.id), saved: saved.has(c.id) })).join('') :
      `<div class="empty"><b>${tab === 'neu' ? 'Nichts Neues seit deinem letzten Blick' : tab === 'gemerkt' ? 'Noch nichts gemerkt' : 'Gerade keine passenden Castings'}</b>${tab === 'alle' ? 'Der Suchlauf schaut jeden Tag neu nach. Sobald etwas passt, bekommst du eine Nachricht.' : ''}</div>`;
  };

  view.innerHTML = `
  <div class="stack-l">
   <div class="stack">
    <h2 class="h">Castings, die zu dir passen</h2>
    <p class="leise small">${updated ? `Zuletzt gesucht: ${esc(new Date(updated).toLocaleString('de-DE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }))} Uhr` : offline ? 'Keine Verbindung. Gespeicherte Castings werden gezeigt, sobald du online bist.' : 'Noch kein Suchlauf.'}</p>
    <div class="chips" id="rchips">
     <button class="chip${tab === 'neu' ? ' on' : ''}" data-k="neu" type="button">Neu (${fresh.size})</button>
     <button class="chip${tab === 'alle' ? ' on' : ''}" data-k="alle" type="button">Alle (${list.length})</button>
     <button class="chip${tab === 'gemerkt' ? ' on' : ''}" data-k="gemerkt" type="button">Gemerkt</button>
    </div>
    <div class="stack" id="rlist"></div>
   </div>
   <div class="panel stack profile">
    <span class="eyebrow">Gesucht wird für</span>
    ${profile ? `<dl>
      <dt>Name</dt><dd>${esc(profile.name)}</dd>
      <dt>Spielalter</dt><dd>${esc(profile.spielalter)}</dd>
      <dt>Größe</dt><dd>${esc(profile.groesse)}</dd>
      <dt>Wohnort</dt><dd>${esc(profile.wohnort)}</dd>
      <dt>Sprachen</dt><dd>${esc((profile.sprachen || []).join(', '))}</dd>
      <dt>Gebiet</dt><dd>${esc(profile.gebiet)}</dd>
      <dt>Formate</dt><dd>${esc((profile.formate || []).join(', '))}</dd>
     </dl>` : '<p class="leise">Profil wird geladen, sobald du online bist.</p>'}
    <p class="small leise">Gesucht wird nur in öffentlich zugänglichen Ausschreibungen. Unbezahlte Projekte, Angebote mit Gebühren für dich und unseriöse Anbieter werden aussortiert. Profil ändern? Sag Claude Bescheid.</p>
   </div>
  </div>`;
  render();
  // Ab jetzt gelten alle als gesehen (der Neu-Reiter bleibt bis zum nächsten Öffnen)
  ls.set('radar.seen', [...new Set([...ls.get('radar.seen', []), ...list.map(c => c.id)])].slice(-500));
  updateBadge(0);

  $('#rchips', view).onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    tab = c.dataset.k;
    $$('#rchips .chip', view).forEach(x => x.classList.toggle('on', x === c));
    render();
  };
  $('#rlist', view).onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('[data-id]').dataset.id;
    const c = list.find(x => x.id === id);
    const act = b.dataset.act;
    if (act === 'save') {
      const s = new Set(ls.get('radar.saved', []));
      s.has(id) ? s.delete(id) : s.add(id);
      ls.set('radar.saved', [...s]); render();
    } else if (act === 'hide') {
      ls.set('radar.hidden', [...ls.get('radar.hidden', []), id]); render(); toast('Ausgeblendet');
    } else if (act === 'applied') {
      auditionSheet(null, () => toast('Im Tagebuch eingetragen'), {
        projekt: c.projekt || c.titel, rolle: c.rolle || '', art: c.art, status: 'eingereicht', typ: /tape/i.test(c.bewerbung || '') ? 'Self-Tape' : 'E-Casting',
        buero: c.castingbuero || c.quelle || '', quelle: safeUrl(c.url) || '', notiz: c.frist ? `Frist: ${fmtDate(c.frist, { year: true })}` : ''
      });
    }
  };
}
