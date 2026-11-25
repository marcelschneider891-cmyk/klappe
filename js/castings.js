// Casting-Tagebuch: jedes Vorsprechen festhalten, Zahlen sehen, Jahresrückblick.
import { db, uid } from './db.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, ask, fmtDate, monthName, today, setTop, safeUrl } from './ui.js';

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
export const pill = k => `<span class="pill s-${esc(k)}">${esc(statusLabel(k))}</span>`;

export async function loadAuditions() {
  return (await db.all('auditions')).sort((a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.created || '').localeCompare(a.created || ''));
}

export function stats(list, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const inY = yr => list.filter(a => a.datum?.startsWith(String(yr)));
  const inM = (yr, mo) => list.filter(a => a.datum?.startsWith(`${yr}-${String(mo + 1).padStart(2, '0')}`));
  // Vorjahr nur bis zum gleichen Tag zählen, damit der Vergleich fair ist
  const cut = `${y - 1}-${now.toISOString().slice(5, 10)}`;
  return {
    month: inM(y, m).length,
    monthPrev: inM(y - 1, m).length,
    year: inY(y).length,
    yearPrev: inY(y - 1).filter(a => a.datum <= cut).length,
    booked: inY(y).filter(a => a.status === 'gebucht').length
  };
}

const delta = (a, b) => {
  const d = a - b;
  if (!b && !a) return '';
  return d > 0 ? `<em>↑ ${d} mehr als im Vorjahr</em>` : d < 0 ? `<em class="neg">${-d} weniger als im Vorjahr</em>` : '<em class="neg">wie im Vorjahr</em>';
};
export function statsHtml(s) {
  return `<div class="stats">
   <div class="stat"><b>${s.month}</b><span>diesen Monat</span>${delta(s.month, s.monthPrev)}</div>
   <div class="stat"><b>${s.year}</b><span>dieses Jahr</span>${delta(s.year, s.yearPrev)}</div>
   <div class="stat"><b>${s.booked}</b><span>gebucht ${new Date().getFullYear()}</span></div>
  </div>`;
}

export async function castingsView(view, { go }) {
  setTop({ title: 'Castings', actions: `<button class="ic" id="addA" type="button" aria-label="Casting eintragen">${ICON.plus}</button>` });
  const list = await loadAuditions();
  let filter = 'alle', q = '';
  const years = [...new Set(list.map(a => a.datum?.slice(0, 4)).filter(Boolean))].sort().reverse();
  const thisYear = String(new Date().getFullYear());

  view.innerHTML = `
  <div class="stack-l">
   <div class="stack">
    <div class="between"><h2 class="h">Dein Casting-Tagebuch</h2></div>
    ${statsHtml(stats(list))}
    <div class="grid2">
     <button class="btn gold" id="addA2" type="button">${ICON.plus} Eintragen</button>
     <button class="btn" id="wrapBtn" type="button"${list.length ? '' : ' disabled'}>${ICON.star} Rückblick ${esc(years[0] || thisYear)}</button>
    </div>
   </div>
   <div class="stack">
    <div class="search">${ICON.search}<input class="inp" id="aq" type="search" placeholder="Projekt, Rolle, Casting-Büro, Notizen" aria-label="Castings durchsuchen"></div>
    <div class="chips" id="achips">${[{ k: 'alle', l: 'Alle' }, ...STATUS].map(s => `<button class="chip${s.k === 'alle' ? ' on' : ''}" data-k="${s.k}" type="button">${s.l}</button>`).join('')}</div>
    <div id="alist"></div>
   </div>
  </div>`;

  const render = () => {
    const ql = q.toLowerCase();
    const rows = list.filter(a => (filter === 'alle' || a.status === filter) &&
      (!ql || [a.projekt, a.rolle, a.buero, a.notiz, a.art].join(' ').toLowerCase().includes(ql)));
    const box = $('#alist', view);
    if (!list.length) {
      box.innerHTML = `<div class="empty"><b>Noch kein Casting eingetragen</b>Trag dein nächstes Vorsprechen ein. Nach ein paar Wochen siehst du hier, wer dich am meisten einlädt und wie oft es klappt.</div>`;
      return;
    }
    if (!rows.length) { box.innerHTML = '<div class="empty">Nichts gefunden.</div>'; return; }
    let html = '', cur = '';
    for (const a of rows) {
      const ym = (a.datum || '').slice(0, 7);
      if (ym !== cur) {
        if (cur) html += '</div>';
        cur = ym;
        const [yy, mm] = ym.split('-');
        html += `<div class="month">${mm ? monthName(+mm - 1) + ' ' + yy : 'Ohne Datum'}</div><div class="list">`;
      }
      html += `<button class="li" type="button" data-id="${esc(a.id)}"><span class="li-main"><b>${esc(a.projekt || 'Ohne Titel')}${a.rolle ? ` <span class="leise">· ${esc(a.rolle)}</span>` : ''}</b><small>${esc(fmtDate(a.datum))}${a.buero ? ' · ' + esc(a.buero) : ''}${a.typ ? ' · ' + esc(a.typ) : ''}</small></span>${pill(a.status)}</button>`;
    }
    box.innerHTML = html + '</div>';
  };
  render();

  const add = () => auditionSheet(null, () => go('castings', true));
  $('#addA').onclick = add;
  $('#addA2', view).onclick = add;
  $('#aq', view).oninput = e => { q = e.target.value; render(); };
  $('#achips', view).onclick = e => {
    const c = e.target.closest('.chip'); if (!c) return;
    filter = c.dataset.k;
    $$('.chip', view).forEach(x => x.classList.toggle('on', x === c));
    render();
  };
  $('#alist', view).onclick = e => {
    const r = e.target.closest('[data-id]'); if (!r) return;
    auditionSheet(list.find(a => a.id === r.dataset.id), () => go('castings', true));
  };
  $('#wrapBtn', view).onclick = () => wrapped(list, +(years[0] || thisYear));
}

export function auditionSheet(a, done, preset = {}) {
  const v = Object.assign({ datum: today(), status: 'eingereicht', typ: 'Self-Tape', art: 'Kino' }, preset, a || {});
  const sel = (id, arr, val) => `<select class="inp" id="${id}">${arr.map(x => { const k = x.k ?? x, l = x.l ?? x; return `<option value="${esc(k)}"${k === val ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  openSheet(a ? 'Casting bearbeiten' : 'Casting eintragen', `
   <div class="field"><label for="fP">Projekt</label><input class="inp" id="fP" value="${esc(v.projekt)}" placeholder="z. B. Tatort, Kinofilm „Nordlicht“" autocomplete="off"></div>
   <div class="grid2">
    <div class="field"><label for="fR">Rolle</label><input class="inp" id="fR" value="${esc(v.rolle)}" placeholder="z. B. Jonas" autocomplete="off"></div>
    <div class="field"><label for="fD">Datum</label><input class="inp" id="fD" type="date" value="${esc(v.datum)}"></div>
   </div>
   <div class="field"><label for="fB">Casting-Büro oder Agentur</label><input class="inp" id="fB" value="${esc(v.buero)}" placeholder="Wer hat dich eingeladen?" autocomplete="off" list="buerosList"><datalist id="buerosList"></datalist></div>
   <div class="grid2">
    <div class="field"><label for="fA">Format</label>${sel('fA', ART, v.art)}</div>
    <div class="field"><label for="fT">Art</label>${sel('fT', TYP, v.typ)}</div>
   </div>
   <div class="field"><label for="fS">Stand</label>${sel('fS', STATUS, v.status)}</div>
   <div class="field"><label for="fN">Notizen</label><textarea class="inp" id="fN" style="min-height:90px;font-family:var(--sans)" placeholder="Feedback, Kostüm, wer war im Raum …">${esc(v.notiz)}</textarea></div>
   ${safeUrl(v.quelle) ? `<a class="link" href="${esc(v.quelle)}" target="_blank" rel="noopener">Zur Ausschreibung ${ICON.ext}</a>` : ''}
   <button class="btn gold wide" id="fSave" type="button">Speichern</button>
   ${a ? `<button class="btn line wide" id="fDel" type="button">${ICON.trash} Löschen</button>` : ''}`, async body => {
    const all = await db.all('auditions');
    $('#buerosList', body).innerHTML = [...new Set(all.map(x => x.buero).filter(Boolean))].map(b => `<option value="${esc(b)}">`).join('');
    $('#fSave', body).onclick = async () => {
      const rec = {
        ...v, id: v.id || uid(), created: v.created || new Date().toISOString(),
        projekt: $('#fP', body).value.trim(), rolle: $('#fR', body).value.trim(), datum: $('#fD', body).value,
        buero: $('#fB', body).value.trim(), art: $('#fA', body).value, typ: $('#fT', body).value,
        status: $('#fS', body).value, notiz: $('#fN', body).value.trim()
      };
      if (!rec.projekt && !rec.rolle) { toast('Gib mindestens Projekt oder Rolle an.'); return; }
      await db.put('auditions', rec);
      closeSheet();
      toast(rec.status === 'gebucht' ? 'Gebucht! Glückwunsch 🎬' : 'Gespeichert');
      done?.(rec);
    };
    if (a) $('#fDel', body).onclick = async () => {
      if (await ask('Casting löschen?', `„${a.projekt || a.rolle}“ wird aus deinem Tagebuch entfernt.`)) {
        await db.del('auditions', a.id); toast('Gelöscht'); done?.();
      }
    };
  });
}

// ---------- Jahresrückblick ----------
export function wrappedData(list, year) {
  const ys = list.filter(a => a.datum?.startsWith(String(year)));
  const yes = ys.filter(a => YES.includes(a.status)).length;
  const booked = ys.filter(a => a.status === 'gebucht').length;
  const by = {};
  ys.forEach(a => { if (a.buero) by[a.buero] = (by[a.buero] || 0) + 1; });
  const top = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const fm = {};
  ys.forEach(a => { if (a.art) fm[a.art] = (fm[a.art] || 0) + 1; });
  const topArt = Object.entries(fm).sort((a, b) => b[1] - a[1])[0];
  return { year, total: ys.length, yes, booked, top, topArt };
}

export function wrapped(list, year) {
  const years = [...new Set(list.map(a => +a.datum?.slice(0, 4)).filter(Boolean))].sort((a, b) => b - a);
  const el = document.createElement('div');
  el.className = 'wr';
  const draw = y => {
    const d = wrappedData(list, y);
    el.innerHTML = `
     <span class="eyebrow">Klappe · Rückblick</span>
     <h2>${d.year}</h2>
     <div class="funnel">
      <div style="width:100%;background:#8C7446">${d.total} ${d.total === 1 ? 'Casting' : 'Castings'}</div>
      <div style="width:80%;background:#B08F55">${d.yes} Ja<small>Callbacks, Optionen, Buchungen</small></div>
      <div style="width:60%;background:#E2C892">${d.booked} gebucht</div>
     </div>
     <p class="fact">${d.top ? `<b>${esc(d.top[0])}</b> hat dich am häufigsten eingeladen, ${d.top[1]}×.` : 'Trag das Casting-Büro mit ein, dann siehst du hier, wer dich am meisten einlädt.'}${d.topArt ? ` Meistes Format: <b>${esc(d.topArt[0])}</b>.` : ''}</p>
     <div class="ctl">
      ${years.length > 1 ? `<select class="inp" id="wrY" style="width:auto">${years.map(x => `<option${x === y ? ' selected' : ''}>${x}</option>`).join('')}</select>` : ''}
      <button class="btn gold" id="wrShare" type="button">${ICON.share} Als Bild teilen</button>
      <button class="btn line" id="wrClose" type="button">Schließen</button>
     </div>`;
    $('#wrClose', el).onclick = () => el.remove();
    $('#wrY', el)?.addEventListener('change', e => draw(+e.target.value));
    $('#wrShare', el).onclick = () => shareWrapped(d);
  };
  draw(year);
  document.body.appendChild(el);
}

async function shareWrapped(d) {
  await document.fonts.ready;
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1920;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(540, 0, 50, 540, 0, 1300);
  grd.addColorStop(0, '#3A3222'); grd.addColorStop(1, '#0B0C0E');
  g.fillStyle = grd; g.fillRect(0, 0, 1080, 1920);
  g.textAlign = 'center';
  g.fillStyle = '#C9A464'; g.font = '600 40px Archivo, sans-serif'; g.fillText('KLAPPE · RÜCKBLICK', 540, 360);
  g.fillStyle = '#ECE8E1'; g.font = '400 200px Newsreader, serif'; g.fillText(String(d.year), 540, 580);
  const rows = [[`${d.total} Castings`, 900, '#8C7446'], [`${d.yes} Ja`, 720, '#B08F55'], [`${d.booked} gebucht`, 540, '#E2C892']];
  rows.forEach(([t, w, col], i) => {
    const y = 760 + i * 190, x = 540 - w / 2, inset = w * 0.08;
    g.fillStyle = col; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - inset, y + 160); g.lineTo(x + inset, y + 160); g.closePath(); g.fill();
    g.fillStyle = '#17130B'; g.font = '700 60px Archivo, sans-serif'; g.fillText(t, 540, y + 100);
  });
  g.fillStyle = '#C6C9CF'; g.font = '400 44px Archivo, sans-serif';
  if (d.top) { g.fillText(`${d.top[0]} hat mich am häufigsten`, 540, 1440); g.fillText(`eingeladen: ${d.top[1]}×`, 540, 1500); }
  const blob = await new Promise(r => c.toBlob(r, 'image/png'));
  const f = new File([blob], `Rueckblick_${d.year}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f] }); } catch {} }
  else { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; a.click(); toast('Bild gespeichert'); }
}
