// Casting-Tagebuch: jedes Vorsprechen festhalten, Zahlen sehen, Jahresrückblick.
import { db, uid, ls } from './db.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, ask, fmtDate, monthName, today, setTop, setFab, largeTitle, safeUrl, buzz, undoToast } from './ui.js';
import { events, calendarHtml, dayList, googleLink, exportAll } from './calendar.js';
import { loadRadar } from './radar.js';
import { swipeList, illu } from './fx.js';
import { loadGagen, gagenHtml, wireGagen, gageSheet } from './gagen.js';

export const STATUS = [
  { k: 'eingereicht', l: 'Eingereicht' },
  { k: 'vorgesprochen', l: 'Vorgesprochen' },
  { k: 'callback', l: 'Callback' },
  { k: 'halten', l: 'Option' },
  { k: 'gebucht', l: 'Gebucht' },
  { k: 'abgesagt', l: 'Absage' },
  { k: 'still', l: 'Keine Antwort' }
];
const YES = ['callback', 'halten', 'gebucht'];
export const ART = ['Kino', 'Serie', 'TV-Film', 'Kurzfilm', 'Werbung', 'Theater', 'Musikvideo', 'Studentenfilm', 'Sonstiges'];
const TYP = ['Self-Tape', 'E-Casting', 'Live-Casting', 'Callback', 'Direktanfrage'];
export const statusLabel = k => STATUS.find(s => s.k === k)?.l || k;
export const st = k => `<span class="st st-${esc(k)}">${esc(statusLabel(k))}</span>`;

export async function loadAuditions() {
  return (await db.all('auditions')).sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.created || '').localeCompare(a.created || ''));
}

export function stats(list, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const inY = yr => list.filter(a => a.datum?.startsWith(String(yr)));
  const inM = (yr, mo) => list.filter(a => a.datum?.startsWith(`${yr}-${String(mo + 1).padStart(2, '0')}`));
  const cut = `${y - 1}-${now.toISOString().slice(5, 10)}`;
  return { month: inM(y, m).length, monthPrev: inM(y - 1, m).length, year: inY(y).length, yearPrev: inY(y - 1).filter(a => a.datum <= cut).length, booked: inY(y).filter(a => a.status === 'gebucht').length };
}
const delta = (a, b) => { const d = a - b; if (!a && !b) return ''; return d > 0 ? `<em>+${d} zum Vorjahr</em>` : d < 0 ? `<em class="neg">${d} zum Vorjahr</em>` : '<em class="neg">wie Vorjahr</em>'; };
export function statsHtml(s) {
  return `<div class="kpis">
   <div class="kpi"><b>${s.month}</b><span>Diesen Monat</span>${delta(s.month, s.monthPrev)}</div>
   <div class="kpi"><b>${s.year}</b><span>Dieses Jahr</span>${delta(s.year, s.yearPrev)}</div>
   <div class="kpi"><b>${s.booked}</b><span>Gebucht</span></div>
  </div>`;
}
const tile = a => `<span class="tile t-${esc(a.status)}">${esc((a.projekt || a.rolle || '?').trim()[0].toUpperCase())}</span>`;
export const auditionRow = a => `<button class="li" type="button" data-id="${esc(a.id)}">${tile(a)}<span class="li-main"><b>${esc(a.projekt || 'Ohne Titel')}</b><small>${[a.rolle, a.buero, a.typ].filter(Boolean).map(esc).join(' · ')}</small></span><span class="li-end">${st(a.status)}<span>${esc(fmtDate(a.datum))}</span></span></button>`;

export async function castingsView(view, { go }) {
  const list = await loadAuditions();
  const years = [...new Set(list.map(a => a.datum?.slice(0, 4)).filter(Boolean))].sort().reverse();
  setTop({ title: 'Castings', large: true, actions: list.length ? `<button class="ic" id="wrapBtn" type="button" aria-label="Jahresrückblick">${ICON.star}</button>` : '' });
  let filter = 'alle', q = '', mode = ls.get('castings.mode', 'liste'), month = new Date(), day = today();
  const fab = () => mode === 'gagen'
    ? setFab({ label: 'Gage eintragen', icon: ICON.euro, onClick: () => gageSheet(null, () => go('castings', true)) })
    : setFab({ label: 'Eintragen', onClick: () => auditionSheet(null, () => go('castings', true)) });
  fab();
  const [radar, gagen] = await Promise.all([loadRadar(), loadGagen()]);
  const ev = events(list, radar.list);

  view.innerHTML = `${largeTitle('Castings')}
   ${statsHtml(stats(list))}
   <div class="seg sec" id="amode"><button type="button" data-k="liste"${mode === 'liste' ? ' class="on"' : ''}>Liste</button><button type="button" data-k="kalender"${mode === 'kalender' ? ' class="on"' : ''}>Kalender</button><button type="button" data-k="gagen"${mode === 'gagen' ? ' class="on"' : ''}>Gagen</button></div>
   <div class="sec" id="aGageBox"${mode === 'gagen' ? '' : ' hidden'}>${gagenHtml(gagen)}</div>
   <div class="sec" id="aListBox"${mode === 'liste' ? '' : ' hidden'}>
    <label class="search">${ICON.search}<input id="aq" type="search" placeholder="Castings durchsuchen" aria-label="Castings durchsuchen"></label>
    <div class="chips" id="achips" style="margin-top:12px">${[{ k: 'alle', l: 'Alle' }, ...STATUS].map(s => `<button class="chip${s.k === 'alle' ? ' on' : ''}" data-k="${s.k}" type="button">${s.l}</button>`).join('')}</div>
    <div id="alist"></div>
    ${list.length ? '<p class="legal" style="margin-top:12px">Tipp: Zeile nach rechts wischen ändert den Stand, nach links löscht.</p>' : ''}
   </div>
   <div class="sec" id="aCalBox"${mode === 'kalender' ? '' : ' hidden'}>
    <div id="acal"></div>
    <div id="aday"></div>
    <button class="btn out wide" id="icsAll" type="button" style="margin-top:16px">${ICON.cal} Kommende Termine in den Kalender</button>
   </div>`;
  const drawCal = () => {
    $('#acal', view).innerHTML = calendarHtml(ev, month);
    $$('#acal .cd', view).forEach(c => c.classList.toggle('sel', c.dataset.d === day));
    $('#aday', view).innerHTML = dayList(ev, day);
  };
  drawCal();
  $('#amode', view).onclick = e => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    mode = b.dataset.k; ls.set('castings.mode', mode);
    $$('#amode button', view).forEach(x => x.classList.toggle('on', x === b));
    $('#aListBox', view).hidden = mode !== 'liste'; $('#aCalBox', view).hidden = mode !== 'kalender'; $('#aGageBox', view).hidden = mode !== 'gagen';
    fab();
  };
  wireGagen($('#aGageBox', view), gagen, () => go('castings', true));
  $('#acal', view).onclick = e => {
    const m = e.target.closest('[data-m]');
    if (m) { month = new Date(month.getFullYear(), month.getMonth() + +m.dataset.m, 1); drawCal(); return; }
    const d = e.target.closest('[data-d]');
    if (d) { day = d.dataset.d; drawCal(); }
  };
  $('#aday', view).onclick = e => {
    const r = e.target.closest('[data-ev]'); if (!r) return;
    const evs = ev.filter(x => x.date === day), x = evs[+r.dataset.ev];
    if (x.kind === 'a') auditionSheet(x.ref, () => go('castings', true));
    else { ls.set('radar.open', x.ref.id); go('radar'); }
  };
  $('#icsAll', view).onclick = () => exportAll(ev);

  const render = () => {
    const ql = q.toLowerCase();
    const rows = list.filter(a => (filter === 'alle' || a.status === filter) && (!ql || [a.projekt, a.rolle, a.buero, a.notiz, a.art].join(' ').toLowerCase().includes(ql)));
    const box = $('#alist', view);
    if (!list.length) { box.innerHTML = `<div class="empty" style="margin-top:8px">${illu('castings')}<b>Noch keine Castings</b>Trag dein nächstes Vorsprechen ein. Mit der Zeit siehst du, wer dich am meisten einlädt und wie oft es klappt.</div>`; return; }
    if (!rows.length) { box.innerHTML = '<p class="muted" style="padding:24px 4px">Nichts gefunden.</p>'; return; }
    let html = '', cur = '';
    for (const a of rows) {
      const ym = (a.datum || '').slice(0, 7);
      if (ym !== cur) { if (cur) html += '</div>'; cur = ym; const [yy, mm] = ym.split('-'); html += `<div class="group-h">${mm ? monthName(+mm - 1) + ' ' + yy : 'Ohne Datum'}</div><div class="list">`; }
      html += auditionRow(a);
    }
    box.innerHTML = html + '</div>';
  };
  render();
  $('#aq', view).oninput = e => { q = e.target.value; render(); };
  $('#achips', view).onclick = e => { const c = e.target.closest('.chip'); if (!c) return; filter = c.dataset.k; $$('#achips .chip', view).forEach(x => x.classList.toggle('on', x === c)); render(); };
  $('#alist', view).onclick = e => { const r = e.target.closest('[data-id]'); if (r && !r.dataset.swiped) auditionSheet(list.find(a => a.id === r.dataset.id), () => go('castings', true)); };
  // Wischen: rechts = Stand ändern, links = löschen (mit Rückgängig)
  swipeList($('#alist', view), {
    right: id => quickStatus(list.find(a => a.id === id), () => go('castings', true)),
    left: async id => {
      const a = list.find(x => x.id === id);
      await db.del('auditions', id);
      go('castings', true);
      undoToast(`„${a.projekt || a.rolle}“ gelöscht`, async () => { await db.put('auditions', a); go('castings', true); });
    }
  });
  $('#wrapBtn')?.addEventListener('click', () => wrapped(list, +(years[0] || new Date().getFullYear())));
}

function quickStatus(a, done) {
  openSheet('Stand ändern', `<p class="muted">${esc(a.projekt || a.rolle)}</p><div class="list">${STATUS.map(s => `<button class="li" type="button" data-k="${s.k}"><span class="tile t-${s.k}">${s.k === a.status ? ICON.check : ''}</span><span class="li-main"><b>${s.l}</b></span></button>`).join('')}</div>`, body => {
    body.onclick = async e => {
      const b = e.target.closest('[data-k]'); if (!b) return;
      a.status = b.dataset.k; await db.put('auditions', a); buzz(12); closeSheet();
      toast(a.status === 'gebucht' ? 'Gebucht. Glückwunsch!' : 'Stand: ' + statusLabel(a.status)); done?.();
    };
  });
}

export function auditionSheet(a, done, preset = {}) {
  const v = Object.assign({ datum: today(), status: 'eingereicht', typ: 'Self-Tape', art: 'Kino' }, preset, a || {});
  const sel = (id, arr, val) => `<select class="inp" id="${id}">${arr.map(x => { const k = x.k ?? x, l = x.l ?? x; return `<option value="${esc(k)}"${k === val ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  openSheet(a ? 'Casting bearbeiten' : 'Neues Casting', `
   <div class="field"><span class="flabel">Stand</span><div class="chips" id="fS" style="flex-wrap:wrap;margin:0;padding:0">${STATUS.map(s => `<button type="button" class="chip${s.k === v.status ? ' on' : ''}" data-k="${s.k}">${s.l}</button>`).join('')}</div></div>
   <div class="field"><label for="fP">Projekt</label><input class="inp" id="fP" value="${esc(v.projekt)}" autocomplete="off"></div>
   <div class="grid2">
    <div class="field"><label for="fR">Rolle</label><input class="inp" id="fR" value="${esc(v.rolle)}" autocomplete="off"></div>
    <div class="field"><label for="fD">Datum</label><input class="inp" id="fD" type="date" value="${esc(v.datum)}"></div>
   </div>
   <div class="field"><label for="fZ">Uhrzeit (bei Terminen)</label><input class="inp" id="fZ" type="time" value="${esc(v.zeit || '')}"></div>
   <div class="field"><label for="fB">Casting-Büro oder Agentur</label><input class="inp" id="fB" value="${esc(v.buero)}" autocomplete="off" list="buerosList"><datalist id="buerosList"></datalist></div>
   <div class="grid2"><div class="field"><label for="fA">Format</label>${sel('fA', ART, v.art)}</div><div class="field"><label for="fT">Art</label>${sel('fT', TYP, v.typ)}</div></div>
   <div class="field"><label for="fN">Notizen</label><textarea class="inp" id="fN" style="min-height:96px">${esc(v.notiz)}</textarea></div>
   ${safeUrl(v.quelle) ? `<a class="btn out" href="${esc(v.quelle)}" target="_blank" rel="noopener">Ausschreibung öffnen ${ICON.ext}</a>` : ''}
   <button class="btn fill wide" id="fSave" type="button">Speichern</button>
   ${a && a.status === 'gebucht' ? `<button class="btn tonal wide" id="fGage" type="button">${ICON.euro} Gage dazu eintragen</button>` : ''}
   ${a ? `<a class="btn out wide" id="fCal" href="#" target="_blank" rel="noopener">${ICON.cal} In Google Kalender eintragen</a><button class="btn danger wide" id="fDel" type="button">Löschen</button>` : ''}`, async body => {
    if (a) { const e = events([a])[0]; if (e) $('#fCal', body).href = googleLink(e); else $('#fCal', body).hidden = true; }
    $('#fGage', body)?.addEventListener('click', () => gageSheet(null, () => done?.(), { projekt: a.projekt, art: /werbung/i.test(a.art) ? 'Werbung' : /theater/i.test(a.art) ? 'Theater' : 'Drehtag', auditionId: a.id }));
    const all = await db.all('auditions');
    $('#buerosList', body).innerHTML = [...new Set(all.map(x => x.buero).filter(Boolean))].map(b => `<option value="${esc(b)}">`).join('');
    let status = v.status;
    $('#fS', body).onclick = e => { const c = e.target.closest('.chip'); if (!c) return; status = c.dataset.k; $$('#fS .chip', body).forEach(x => x.classList.toggle('on', x === c)); };
    $('#fSave', body).onclick = async () => {
      const rec = { ...v, id: v.id || uid(), created: v.created || new Date().toISOString(), projekt: $('#fP', body).value.trim(), rolle: $('#fR', body).value.trim(), datum: $('#fD', body).value,
        buero: $('#fB', body).value.trim(), art: $('#fA', body).value, typ: $('#fT', body).value, status, notiz: $('#fN', body).value.trim(), zeit: $('#fZ', body).value };
      if (!rec.projekt && !rec.rolle) { toast('Gib mindestens Projekt oder Rolle an.'); return; }
      await db.put('auditions', rec);
      buzz(12); closeSheet();
      toast(rec.status === 'gebucht' ? 'Gebucht. Glückwunsch!' : 'Gespeichert');
      done?.(rec);
    };
    if (a) $('#fDel', body).onclick = async () => { if (await ask('Casting löschen?', `„${a.projekt || a.rolle}“ wird aus deinem Tagebuch entfernt.`)) { await db.del('auditions', a.id); toast('Gelöscht'); done?.(); } };
  });
}

// ---------- Jahresrückblick ----------
export function wrappedData(list, year) {
  const ys = list.filter(a => a.datum?.startsWith(String(year)));
  const by = {}, fm = {};
  ys.forEach(a => { if (a.buero) by[a.buero] = (by[a.buero] || 0) + 1; if (a.art) fm[a.art] = (fm[a.art] || 0) + 1; });
  return { year, total: ys.length, yes: ys.filter(a => YES.includes(a.status)).length, booked: ys.filter(a => a.status === 'gebucht').length,
    top: Object.entries(by).sort((a, b) => b[1] - a[1])[0], topArt: Object.entries(fm).sort((a, b) => b[1] - a[1])[0] };
}
export function wrapped(list, year) {
  const years = [...new Set(list.map(a => +a.datum?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
  const el = document.createElement('div');
  el.className = 'wr';
  const draw = y => {
    const d = wrappedData(list, y);
    el.innerHTML = `<span class="k">Dein Jahr</span><h2>${d.year}</h2>
     <div class="funnel"><div style="width:100%;background:#8C7446">${d.total} ${d.total === 1 ? 'Casting' : 'Castings'}</div><div style="width:80%;background:#B79558">${d.yes} Ja<small>Callbacks, Optionen, Buchungen</small></div><div style="width:60%;background:#E6CC92">${d.booked} gebucht</div></div>
     <p class="fact">${d.top ? `<b>${esc(d.top[0])}</b> hat dich am häufigsten eingeladen, ${d.top[1]}-mal.` : 'Trag das Casting-Büro mit ein, dann siehst du hier, wer dich am meisten einlädt.'}${d.topArt ? ` Meistes Format: <b>${esc(d.topArt[0])}</b>.` : ''}</p>
     <div class="ctl">${years.length > 1 ? `<select class="inp" id="wrY" style="width:auto">${years.map(x => `<option${x === y ? ' selected' : ''}>${x}</option>`).join('')}</select>` : ''}
      <button class="btn fill" id="wrShare" type="button">${ICON.share} Teilen</button><button class="btn out" id="wrClose" type="button">Schließen</button></div>`;
    $('#wrClose', el).onclick = () => el.remove();
    $('#wrY', el)?.addEventListener('change', e => draw(+e.target.value));
    $('#wrShare', el).onclick = () => shareWrapped(d);
  };
  draw(year);
  document.body.appendChild(el);
}
async function shareWrapped(d) {
  await document.fonts.ready;
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const g = c.getContext('2d');
  g.fillStyle = '#0A0B0D'; g.fillRect(0, 0, 1080, 1920);
  g.textAlign = 'center';
  g.fillStyle = '#D4B072'; g.font = '600 40px Archivo, sans-serif'; g.fillText('DEIN JAHR', 540, 380);
  g.fillStyle = '#ECE8E1'; g.font = '700 220px Archivo, sans-serif'; g.fillText(String(d.year), 540, 600);
  [[`${d.total} Castings`, 900, '#8C7446'], [`${d.yes} Ja`, 720, '#B79558'], [`${d.booked} gebucht`, 540, '#E6CC92']].forEach(([t, w, col], i) => {
    const y = 760 + i * 190, x = 540 - w / 2, inset = w * 0.08;
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - inset, y + 160); g.lineTo(x + inset, y + 160); g.closePath(); g.fill();
    g.fillStyle = '#1F1708'; g.font = '700 60px Archivo, sans-serif'; g.fillText(t, 540, y + 100);
  });
  g.fillStyle = '#A7ACB4'; g.font = '400 44px Archivo, sans-serif';
  if (d.top) { g.fillText(`${d.top[0]} hat mich am häufigsten`, 540, 1440); g.fillText(`eingeladen: ${d.top[1]}-mal`, 540, 1500); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], `Rueckblick_${d.year}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch {} }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); toast('Bild gespeichert'); }
}
