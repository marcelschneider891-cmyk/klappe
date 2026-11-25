// Kalender: Castings, Termine und Fristen im Monat; Export in Google Kalender.
import { ls } from './db.js';
import { $, $$, esc, ICON, monthName, fmtDate, toast } from './ui.js';
import { statusLabel } from './castings.js';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function events(auditions, radarList = []) {
  const ev = auditions.filter(a => a.datum).map(a => ({ date: a.datum, time: a.zeit || '', title: a.projekt || a.rolle || 'Casting', sub: [a.typ, a.rolle, a.buero].filter(Boolean).join(' · '), kind: 'a', status: a.status, ref: a }));
  const saved = new Set(ls.get('radar.saved', []));
  radarList.filter(c => c.frist && saved.has(c.id)).forEach(c => ev.push({ date: c.frist, time: '', title: 'Frist: ' + c.titel, sub: [c.rolle, c.ort].filter(Boolean).join(' · '), kind: 'f', ref: c }));
  return ev.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function calendarHtml(ev, month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
  const today = iso(new Date());
  const byDay = {};
  ev.forEach(e => (byDay[e.date] = byDay[e.date] || []).push(e));
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = iso(d), list = byDay[k] || [];
    const out = d.getMonth() !== month.getMonth();
    if (i === 35 && out) break;
    cells += `<button type="button" class="cd${out ? ' out' : ''}${k === today ? ' today' : ''}" data-d="${k}"><span>${d.getDate()}</span><i>${list.slice(0, 3).map(e => `<b class="${e.kind === 'f' ? 'dot-f' : 'dot-' + esc(e.status)}"></b>`).join('')}</i></button>`;
  }
  return `<div class="cal">
   <div class="cal-h"><button class="ic" type="button" data-m="-1" aria-label="Vorheriger Monat">${ICON.chev.replace('<svg', '<svg style="transform:rotate(180deg)"')}</button><b>${monthName(month.getMonth())} ${month.getFullYear()}</b><button class="ic" type="button" data-m="1" aria-label="Nächster Monat">${ICON.chev}</button></div>
   <div class="cal-g">${WD.map(w => `<span class="wd">${w}</span>`).join('')}${cells}</div>
  </div>`;
}

export function dayList(ev, day) {
  const list = ev.filter(e => e.date === day);
  if (!list.length) return `<p class="muted" style="padding:16px 4px">Nichts am ${esc(fmtDate(day, { long: true }))}.</p>`;
  return `<div class="group-h">${esc(new Date(day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))}</div><div class="list">${list.map((e, i) => `
   <button class="li" type="button" data-ev="${i}"><span class="tile ${e.kind === 'f' ? 't-callback' : 't-' + esc(e.status)}">${e.kind === 'f' ? ICON.clock : ICON.cal}</span>
    <span class="li-main"><b>${esc(e.title)}</b><small>${[e.time && e.time + ' Uhr', e.kind === 'a' ? statusLabel(e.status) : '', e.sub].filter(Boolean).map(esc).join(' · ')}</small></span></button>`).join('')}</div>`;
}

// ---------- Export ----------
const pad = n => String(n).padStart(2, '0');
function gStamp(date, time, addMin = 0) {
  if (!time) return date.replace(/-/g, '');
  const d = new Date(`${date}T${time}:00`); d.setMinutes(d.getMinutes() + addMin);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}
export function googleLink(e) {
  const endDate = e.time ? null : (() => { const d = new Date(e.date + 'T12:00'); d.setDate(d.getDate() + 1); return iso(d); })();
  const dates = e.time ? `${gStamp(e.date, e.time)}/${gStamp(e.date, e.time, 60)}` : `${gStamp(e.date)}/${gStamp(endDate)}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates, details: [e.sub, 'Aus Klappe'].filter(Boolean).join('\n') });
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
export function icsFile(ev) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Klappe//DE', 'CALSCALE:GREGORIAN'];
  ev.forEach((e, i) => {
    L.push('BEGIN:VEVENT', `UID:klappe-${e.date}-${i}-${(e.ref?.id || '')}@klappe`, `DTSTAMP:${now}`);
    if (e.time) { L.push(`DTSTART:${gStamp(e.date, e.time)}`, `DTEND:${gStamp(e.date, e.time, 60)}`); }
    else { const d = new Date(e.date + 'T12:00'); d.setDate(d.getDate() + 1); L.push(`DTSTART;VALUE=DATE:${gStamp(e.date)}`, `DTEND;VALUE=DATE:${gStamp(iso(d))}`); }
    L.push(`SUMMARY:${icsEsc(e.title)}`, `DESCRIPTION:${icsEsc(e.sub)}`, 'END:VEVENT');
  });
  L.push('END:VCALENDAR');
  return new File([L.join('\r\n')], 'Klappe-Termine.ics', { type: 'text/calendar' });
}
export async function exportAll(ev) {
  const upcoming = ev.filter(e => e.date >= iso(new Date()));
  if (!upcoming.length) { toast('Keine kommenden Termine.'); return; }
  const f = icsFile(upcoming);
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: f.name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
  toast(`${upcoming.length} Termine exportiert. Datei öffnen, um sie in den Kalender zu übernehmen.`);
}
