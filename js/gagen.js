// Gagen: Drehtage und Einnahmen festhalten, Summen sehen, für die Steuer exportieren.
import { db, uid } from './db.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, ask, fmtDate, monthName, today, buzz } from './ui.js';

export const GART = ['Drehtag', 'Werbung', 'Theater', 'Synchron', 'Moderation', 'Komparserie', 'Sonstiges'];
const eur = n => (+n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = n => (+n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function loadGagen() {
  return (await db.all('gagen')).sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
}

export function gagenHtml(list) {
  const y = String(new Date().getFullYear()), m = new Date().toISOString().slice(0, 7);
  const sum = arr => arr.reduce((s, g) => s + (+g.betrag || 0), 0);
  const yr = list.filter(g => g.datum?.startsWith(y));
  const open = list.filter(g => g.status !== 'bezahlt');
  let rows = '', cur = '';
  for (const g of list) {
    const ym = (g.datum || '').slice(0, 7);
    if (ym !== cur) { if (cur) rows += '</div>'; cur = ym; const [yy, mm] = ym.split('-'); rows += `<div class="group-h">${mm ? monthName(+mm - 1) + ' ' + yy : 'Ohne Datum'}</div><div class="list">`; }
    rows += `<button class="li" type="button" data-g="${esc(g.id)}"><span class="tile ${g.status === 'bezahlt' ? 't-gebucht' : 't-callback'}">${ICON.euro}</span>
      <span class="li-main"><b>${esc(g.projekt || g.art)}</b><small>${[g.art, g.tage ? g.tage + (g.tage == 1 ? ' Tag' : ' Tage') : '', fmtDate(g.datum)].filter(Boolean).map(esc).join(' · ')}</small></span>
      <span class="li-end"><b class="num" style="color:var(--on);font-size:.95rem">${esc(eur(g.betrag))}</b><span class="st ${g.status === 'bezahlt' ? 'st-gebucht' : 'st-callback'}">${g.status === 'bezahlt' ? 'Bezahlt' : 'Offen'}</span></span></button>`;
  }
  if (cur) rows += '</div>';
  return `<div class="kpis">
    <div class="kpi"><b>${esc(eur(sum(yr)))}</b><span>${y}</span></div>
    <div class="kpi"><b>${esc(eur(sum(list.filter(g => g.datum?.startsWith(m)))))}</b><span>Diesen Monat</span></div>
    <div class="kpi"><b style="color:${open.length ? 'var(--warn)' : 'inherit'}">${esc(eur(sum(open)))}</b><span>Noch offen</span></div>
   </div>
   ${list.length ? rows + `<button class="btn out wide" id="gCsv" type="button" style="margin-top:16px">${ICON.dl} Für die Steuer exportieren (CSV)</button>`
     : `<div class="empty" style="margin-top:12px"><b>Noch keine Gagen</b>Trag Drehtage und Gagen ein. Dann siehst du, was du im Jahr verdienst und was noch offen ist.</div>`}`;
}

export function wireGagen(box, list, done) {
  box.addEventListener('click', e => {
    const r = e.target.closest('[data-g]');
    if (r) return gageSheet(list.find(g => g.id === r.dataset.g), done);
    if (e.target.closest('#gCsv')) exportCsv(list);
  });
}

export function gageSheet(g, done, preset = {}) {
  const v = Object.assign({ datum: today(), art: 'Drehtag', tage: 1, status: 'offen' }, preset, g || {});
  openSheet(g ? 'Gage bearbeiten' : 'Gage eintragen', `
   <div class="field"><label for="gP">Projekt</label><input class="inp" id="gP" value="${esc(v.projekt)}" autocomplete="off"></div>
   <div class="grid2">
    <div class="field"><label for="gA">Art</label><select class="inp" id="gA">${GART.map(a => `<option${a === v.art ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
    <div class="field"><label for="gD">Datum</label><input class="inp" id="gD" type="date" value="${esc(v.datum)}"></div>
   </div>
   <div class="grid2">
    <div class="field"><label for="gB">Betrag (€, brutto)</label><input class="inp" id="gB" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(v.betrag ?? '')}"></div>
    <div class="field"><label for="gT">Tage</label><input class="inp" id="gT" type="number" inputmode="numeric" min="0" step="0.5" value="${esc(v.tage)}"></div>
   </div>
   <div class="field"><span class="flabel">Stand</span><div class="seg" id="gS"><button type="button" data-k="offen"${v.status !== 'bezahlt' ? ' class="on"' : ''}>Offen</button><button type="button" data-k="bezahlt"${v.status === 'bezahlt' ? ' class="on"' : ''}>Bezahlt</button></div></div>
   <div class="field"><label for="gN">Notiz</label><input class="inp" id="gN" value="${esc(v.notiz)}" placeholder="z. B. Rechnung geschickt am …"></div>
   <button class="btn fill wide" id="gSave" type="button">Speichern</button>
   ${g ? '<button class="btn danger wide" id="gDel" type="button">Löschen</button>' : ''}`, body => {
    let status = v.status;
    $('#gS', body).onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; status = b.dataset.k; $$('#gS button', body).forEach(x => x.classList.toggle('on', x === b)); };
    $('#gSave', body).onclick = async () => {
      const rec = { ...v, id: v.id || uid(), projekt: $('#gP', body).value.trim(), art: $('#gA', body).value, datum: $('#gD', body).value,
        betrag: parseFloat(String($('#gB', body).value).replace(',', '.')) || 0, tage: parseFloat($('#gT', body).value) || 0, status, notiz: $('#gN', body).value.trim(),
        bezahltAm: status === 'bezahlt' ? (v.bezahltAm || today()) : '' };
      if (!rec.projekt && !rec.betrag) return toast('Gib mindestens Projekt oder Betrag an.');
      await db.put('gagen', rec); buzz(12); closeSheet(); toast('Gespeichert'); done?.();
    };
    if (g) $('#gDel', body).onclick = async () => { if (await ask('Gage löschen?', `„${g.projekt || g.art}“ wird gelöscht.`)) { await db.del('gagen', g.id); toast('Gelöscht'); done?.(); } };
  });
}

function exportCsv(list) {
  const q = s => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['Datum', 'Projekt', 'Art', 'Tage', 'Betrag brutto (EUR)', 'Stand', 'Bezahlt am', 'Notiz'].map(q).join(';')];
  for (const g of [...list].sort((a, b) => (a.datum || '').localeCompare(b.datum || '')))
    lines.push([g.datum, g.projekt, g.art, String(g.tage ?? '').replace('.', ','), eur2(g.betrag), g.status === 'bezahlt' ? 'bezahlt' : 'offen', g.bezahltAm || '', g.notiz].map(q).join(';'));
  // Mit Byte-Order-Mark, damit Excel die Umlaute richtig zeigt
  const f = new File(['﻿' + lines.join('\r\n')], `Gagen_${new Date().getFullYear()}.csv`, { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  toast('CSV gespeichert. Öffnet sich mit Excel oder Google Tabellen.');
}
