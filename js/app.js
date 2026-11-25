// Klappe – Start, Skripte, Navigation
import { db, uid, ls } from './db.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, ask, fmtDate, setTop } from './ui.js';
import { pdfToLines, textToLines, parseLines } from './parser.js';
import { rehearseView } from './rehearse.js';
import { tapeView, reviewTake, downloadTake, shareTake } from './tape.js';
import { castingsView, loadAuditions, stats, statsHtml } from './castings.js';
import { radarView, loadRadar, loadProfile, newOnes, updateBadge, cardHtml } from './radar.js';

const view = $('#view');
let cleanup = null;

// ---------- Router ----------
export function go(route, replace = false) {
  const h = '#' + route;
  if (location.hash === h) render();
  else if (replace) { history.replaceState(null, '', h); render(); }
  else location.hash = h;
}
window.addEventListener('hashchange', render);
$('#back').onclick = () => { if (history.length > 1) history.back(); else go('skripte'); };

async function render() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  closeSheet();
  const h = location.hash.slice(1) || 'start';
  const [name, id] = [h.split('-')[0], h.split('-').slice(1).join('-')];
  const tab = ['start', 'skripte', 'castings', 'radar'].includes(name) ? name : name === 'skript' ? 'skripte' : '';
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  document.body.classList.toggle('full', name === 'proben' || name === 'tape');
  $('#app').classList.toggle('full', name === 'proben' || name === 'tape');
  view.classList.remove('has-bar');
  view.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    if (name === 'start') await startView();
    else if (name === 'skripte') await scriptsView();
    else if (name === 'skript') await scriptView(id);
    else if (name === 'proben' || name === 'tape') {
      const s = await db.get('scripts', id);
      if (!s) return go('skripte', true);
      if (!s.me?.length) { toast('Wähle zuerst deine Rolle.'); return go('skript-' + id, true); }
      const exit = () => go('skript-' + id, true);
      cleanup = name === 'proben' ? await rehearseView(view, s, { exit }) : await tapeView(view, s, { exit, profile: await loadProfile() });
    }
    else if (name === 'castings') await castingsView(view, { go });
    else if (name === 'radar') await radarView(view, { go });
    else if (name === 'import') await importShared();
    else go('start', true);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty"><b>Da ist was schiefgelaufen</b>${esc(e.message || e)}</div>`;
  }
  view.focus({ preventScroll: true });
}

// ---------- Start ----------
async function startView() {
  setTop({});
  const [scripts, auditions, radar] = await Promise.all([db.all('scripts'), loadAuditions(), loadRadar()]);
  const profile = await loadProfile();
  const fresh = newOnes(radar.list);
  updateBadge(fresh.length);
  const hr = new Date().getHours();
  const hi = hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Servus' : 'Guten Abend';
  const first = (profile?.name || '').split(' ')[0];
  const teaser = (fresh.length ? fresh : radar.list).slice().sort((a, b) => (b.match || 0) - (a.match || 0)).slice(0, 2);
  scripts.sort((a, b) => (b.used || b.created).localeCompare(a.used || a.created));

  view.innerHTML = `
  <div class="stack-l">
   <section class="hero">
    <span class="eyebrow">${esc(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }))}</span>
    <h2 class="h">${hi}${first ? ', ' + esc(first) : ''}.</h2>
    <p>${fresh.length ? `Das Radar hat <b style="color:var(--messing-hell)">${fresh.length} ${fresh.length === 1 ? 'neues Casting' : 'neue Castings'}</b> für dich.` : 'Text lernen, proben, Self-Tape drehen. Alles hier.'}</p>
    <div class="cta-row">
     <button class="btn gold" id="impBtn" type="button">${ICON.upload} Skript laden</button>
     <a class="btn" href="#castings" id="logBtn">${ICON.plus} Casting eintragen</a>
    </div>
   </section>

   <section class="stack">
    <div class="between"><h3 class="h">Casting-Radar</h3><a class="link" href="#radar">Alle ansehen</a></div>
    ${teaser.length ? teaser.map(c => `<a href="#radar" style="text-decoration:none;color:inherit">${cardHtml(c, { neu: fresh.some(f => f.id === c.id), compact: true })}</a>`).join('') :
      `<div class="empty">${radar.offline ? 'Offline. Das Radar lädt, sobald du wieder Netz hast.' : 'Noch keine passenden Castings gefunden. Der Suchlauf schaut jeden Tag nach.'}</div>`}
   </section>

   <section class="stack">
    <div class="between"><h3 class="h">Skripte</h3><a class="link" href="#skripte">Alle</a></div>
    ${scripts.length ? `<div class="pages">${scripts.slice(0, 3).map(pageCard).join('')}</div>` :
      `<button class="empty" id="demoBtn" type="button" style="background:none;width:100%;cursor:pointer"><b>Probier die Demo-Szene</b>„Nachtschicht“: zwei Figuren, eine Tankstelle, drei Uhr nachts. Tippe hier, um sie zu laden.</button>`}
   </section>

   <section class="stack">
    <div class="between"><h3 class="h">Castings</h3><a class="link" href="#castings">Tagebuch</a></div>
    ${statsHtml(stats(auditions))}
   </section>
  </div>`;
  $('#impBtn', view).onclick = importSheet;
  $('#demoBtn', view)?.addEventListener('click', loadDemo);
  $('#logBtn', view).onclick = e => { e.preventDefault(); go('castings'); setTimeout(() => $('#addA')?.click(), 60); };
}

function pageCard(s) {
  const lines = s.blocks.slice(0, 9).map(b => b.type === 'act' ? `<span>${esc(b.text.slice(0, 90))}</span>` : `<i>${esc(b.who)}</i><u>${esc(b.text.slice(0, 70))}</u>`).join('');
  const n = s.blocks.filter(b => b.type === 'line' && s.me?.includes(b.who)).length;
  return `<a class="page" href="#skript-${esc(s.id)}"><div class="page-p" aria-hidden="true">${lines}</div><b>${esc(s.title)}</b><small>${s.me?.length ? `${n} Sätze für dich` : 'Rolle wählen'} · ${esc(fmtDate(s.created))}</small></a>`;
}

// ---------- Skripte ----------
async function scriptsView() {
  setTop({ title: 'Skripte', actions: `<button class="ic" id="impTop" type="button" aria-label="Skript laden">${ICON.plus}</button>` });
  const scripts = (await db.all('scripts')).sort((a, b) => b.created.localeCompare(a.created));
  view.innerHTML = `
  <div class="stack-l">
   <div class="stack">
    <h2 class="h">Deine Szenen</h2>
    <p class="leise">PDF aus der Mail: in Gmail aufs PDF tippen, dann <b>Teilen</b> und <b>Klappe</b>. Oder hier laden.</p>
    <div class="grid2"><button class="btn gold" id="imp1" type="button">${ICON.upload} PDF laden</button><button class="btn" id="imp2" type="button">Text einfügen</button></div>
   </div>
   ${scripts.length ? `<div class="pages">${scripts.map(pageCard).join('')}</div>` : `<button class="empty" id="demoBtn" type="button" style="background:none;width:100%;cursor:pointer"><b>Noch keine Szene</b>Tippe hier für die Demo-Szene „Nachtschicht“.</button>`}
  </div>`;
  $('#impTop').onclick = importSheet;
  $('#imp1', view).onclick = () => $('#pdfInput').click();
  $('#imp2', view).onclick = pasteSheet;
  $('#demoBtn', view)?.addEventListener('click', loadDemo);
}

function importSheet() {
  openSheet('Skript laden', `
   <button class="btn gold wide" id="iPdf" type="button">${ICON.upload} PDF vom Handy wählen</button>
   <button class="btn wide" id="iTxt" type="button">Text einfügen</button>
   <button class="btn line wide" id="iDemo" type="button">Demo-Szene laden</button>
   <p class="small leise">Tipp für Sides aus der Mail: PDF in Gmail öffnen, <b>Teilen</b> tippen und <b>Klappe</b> wählen. Klappt, sobald die App auf dem Startbildschirm installiert ist.</p>`, body => {
    $('#iPdf', body).onclick = () => { closeSheet(); $('#pdfInput').click(); };
    $('#iTxt', body).onclick = pasteSheet;
    $('#iDemo', body).onclick = () => { closeSheet(); loadDemo(); };
  });
}

function pasteSheet() {
  openSheet('Text einfügen', `
   <div class="field"><label for="pT">Titel</label><input class="inp" id="pT" placeholder="z. B. Tatort Szene 12" autocomplete="off"></div>
   <div class="field"><label for="pX">Szene</label><textarea class="inp" id="pX" placeholder="MIRA&#10;Eine Banane. Um drei Uhr morgens.&#10;&#10;JONAS&#10;Ich hab Hunger auf was Gesundes.&#10;&#10;oder:&#10;Mira: Eine Banane …"></textarea></div>
   <button class="btn gold wide" id="pGo" type="button">Szene anlegen</button>`, body => {
    $('#pGo', body).onclick = async () => {
      const text = $('#pX', body).value;
      if (!text.trim()) return toast('Füge zuerst den Text ein.');
      const parsed = parseLines(textToLines(text), $('#pT', body).value.trim() || 'Neue Szene');
      if (!parsed.characters.length) return toast('Keine Figuren erkannt. Schreib Namen in GROSSBUCHSTABEN oder „Name: Text“.');
      closeSheet();
      await saveScript(parsed, 'text');
    };
  });
}

$('#pdfInput').addEventListener('change', async e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) await importFile(f);
});

async function importFile(f) {
  const title = f.name.replace(/\.(pdf|txt)$/i, '').replace(/[_]+/g, ' ').trim() || 'Neue Szene';
  toast('Lese Skript …');
  try {
    let lines;
    if (/pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) lines = await pdfToLines(await f.arrayBuffer());
    else lines = textToLines(await f.text());
    const parsed = parseLines(lines, title);
    if (!parsed.characters.length) {
      toast('Keine Figuren erkannt. Prüf den Text kurz.');
      pasteSheet();
      $('#pT').value = title;
      $('#pX').value = lines.map(l => (l.gap ? '\n' : '') + l.t).join('\n').trim();
      return;
    }
    await saveScript(parsed, 'pdf');
  } catch (err) {
    if (err.code === 'scan') openSheet('PDF ist ein Scan', '<p>In diesem PDF steckt nur ein Bild, kein Text. Nimm am besten das Original-PDF aus der Mail vom Casting oder füge den Text ein.</p><button class="btn gold wide" type="button" data-close>OK</button>');
    else if (err.message === 'offline') toast('Zum ersten PDF-Import braucht die App einmal Internet.');
    else { console.error(err); toast('Das PDF konnte nicht gelesen werden.'); }
  }
}

async function saveScript(parsed, src) {
  const s = { id: uid(), title: parsed.title, created: new Date().toISOString(), blocks: parsed.blocks, characters: parsed.characters, me: [], src, voices: {} };
  await db.put('scripts', s);
  toast(`${parsed.characters.length} Figuren erkannt`);
  go('skript-' + s.id);
}

async function importShared() {
  try {
    const cache = await caches.open('klappe-share');
    const res = await cache.match('shared-file');
    if (!res) return go('skripte', true);
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get('x-name') || 'Sides.pdf');
    await cache.delete('shared-file');
    history.replaceState(null, '', '#skripte');
    await importFile(new File([blob], name, { type: blob.type || 'application/pdf' }));
  } catch { go('skripte', true); }
}

// ---------- Ein Skript ----------
async function scriptView(id) {
  const s = await db.get('scripts', id);
  if (!s) return go('skripte', true);
  setTop({ title: s.title, back: true, actions: `<button class="ic" id="sMenu" type="button" aria-label="Skript bearbeiten">${ICON.edit}</button>` });
  const takes = (await db.all('takes')).filter(t => t.scriptId === id).sort((a, b) => b.created.localeCompare(a.created));
  s.me = s.me || [];
  const cnt = c => s.blocks.filter(b => b.type === 'line' && b.who === c).length;
  view.classList.add('has-bar');
  view.innerHTML = `
  <div class="stack-l">
   <div class="stack">
    <span class="eyebrow">Wer bist du?</span>
    <div class="rolepick" id="roles">${s.characters.map(c => `<button class="chip${s.me.includes(c) ? ' on' : ''}" data-c="${esc(c)}" type="button">${esc(c)} <span class="leise">· ${cnt(c)}</span></button>`).join('')}</div>
    <p class="small leise">Stimmt eine Zuordnung nicht? Tippe im Skript auf die Zeile und korrigiere sie.</p>
   </div>
   ${takes.length ? `<div class="stack"><h3 class="h">Deine Takes</h3><div class="takes">${takes.map(t => `
     <div class="take" data-t="${esc(t.id)}"><video muted playsinline preload="metadata" data-src="1"></video>
      <div class="li-main"><b>Take ${t.n}</b><small>${esc(fmtDate(t.created))} · ${t.dur} s</small></div>
      <button class="ic" data-a="share" type="button" aria-label="Teilen">${ICON.share}</button>
      <button class="ic" data-a="dl" type="button" aria-label="Speichern">${ICON.dl}</button>
      <button class="ic" data-a="del" type="button" aria-label="Löschen">${ICON.trash}</button></div>`).join('')}</div></div>` : ''}
   <div class="script" id="paper">${s.blocks.map((b, i) => b.type === 'act'
      ? `<p class="act" data-edit="${i}">${esc(b.text)}</p>`
      : `<p class="ln${s.me.includes(b.who) ? ' me' : ''}" data-edit="${i}"><span class="who">${s.me.includes(b.who) ? `<mark>${esc(b.who)}</mark>` : esc(b.who)}</span><span class="txt">${esc(b.text)}</span></p>`).join('')}</div>
  </div>
  <div class="bar">
   <a class="btn wide" href="#proben-${esc(id)}" id="goR">${ICON.play} Proben</a>
   <a class="btn rot wide" href="#tape-${esc(id)}" id="goT">${ICON.rec} Aufnehmen</a>
  </div>`;

  const urls = [];
  $$('.take', view).forEach(el => {
    const t = takes.find(x => x.id === el.dataset.t);
    const u = URL.createObjectURL(t.blob); urls.push(u);
    $('video', el).src = u + '#t=0.5';
    el.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'share') shareTake(t, s.title);
      else if (a === 'dl') downloadTake(t, s.title);
      else if (a === 'del') { if (await ask('Take löschen?', `Take ${t.n} wird aus der App gelöscht. Schon gespeicherte Kopien bleiben.`)) { await db.del('takes', t.id); go('skript-' + id, true); } }
      else reviewTake(t, s);
    };
  });
  cleanup = () => urls.forEach(u => URL.revokeObjectURL(u));

  const gate = e => { if (!s.me.length) { e.preventDefault(); toast('Wähle zuerst deine Rolle.'); } else { s.used = new Date().toISOString(); db.put('scripts', s); } };
  $('#goR', view).onclick = gate;
  $('#goT', view).onclick = gate;

  $('#roles', view).onclick = async e => {
    const c = e.target.closest('[data-c]'); if (!c) return;
    const n = c.dataset.c;
    s.me = s.me.includes(n) ? s.me.filter(x => x !== n) : [...s.me, n];
    await db.put('scripts', s);
    go('skript-' + id, true);
  };

  $('#paper', view).onclick = e => {
    const p = e.target.closest('[data-edit]'); if (!p) return;
    editBlock(s, +p.dataset.edit);
  };

  $('#sMenu').onclick = () => openSheet('Skript', `
    <div class="field"><label for="eT">Titel</label><input class="inp" id="eT" value="${esc(s.title)}"></div>
    <button class="btn gold wide" id="eSave" type="button">Speichern</button>
    <button class="btn line wide" id="eDel" type="button">${ICON.trash} Skript löschen</button>`, body => {
    $('#eSave', body).onclick = async () => { s.title = $('#eT', body).value.trim() || s.title; await db.put('scripts', s); go('skript-' + id, true); };
    $('#eDel', body).onclick = async () => {
      if (await ask('Skript löschen?', `„${s.title}“ und seine Takes werden aus der App gelöscht.`)) {
        await db.del('scripts', id);
        for (const t of takes) await db.del('takes', t.id);
        toast('Gelöscht'); go('skripte', true);
      }
    };
  });
}

function editBlock(s, i) {
  const b = s.blocks[i];
  const opts = [...s.characters.map(c => [c, c]), ['__act', 'Regieanweisung (wird nicht gesprochen)'], ['__new', 'Neue Figur …']];
  const cur = b.type === 'act' ? '__act' : b.who;
  openSheet('Zeile bearbeiten', `
   <div class="field"><label for="bW">Wer spricht?</label><select class="inp" id="bW">${opts.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
   <div class="field" id="bNewF" hidden><label for="bNew">Name der neuen Figur</label><input class="inp" id="bNew" autocomplete="off"></div>
   <div class="field"><label for="bX">Text</label><textarea class="inp" id="bX" style="font-family:var(--sans);min-height:120px">${esc(b.text)}</textarea></div>
   <button class="btn gold wide" id="bSave" type="button">Speichern</button>
   <button class="btn line wide" id="bDel" type="button">${ICON.trash} Zeile löschen</button>`, body => {
    $('#bW', body).onchange = e => { $('#bNewF', body).hidden = e.target.value !== '__new'; };
    $('#bSave', body).onclick = async () => {
      let w = $('#bW', body).value;
      if (w === '__new') { w = $('#bNew', body).value.trim().toUpperCase(); if (!w) return toast('Gib einen Namen ein.'); }
      s.blocks[i] = w === '__act' ? { id: b.id, type: 'act', text: $('#bX', body).value.trim() } : { id: b.id, type: 'line', who: w, text: $('#bX', body).value.trim() };
      recount(s); await db.put('scripts', s); closeSheet(); go('skript-' + s.id, true);
    };
    $('#bDel', body).onclick = async () => { s.blocks.splice(i, 1); recount(s); await db.put('scripts', s); closeSheet(); go('skript-' + s.id, true); };
  });
}

function recount(s) {
  const c = {};
  s.blocks.forEach(b => { if (b.type === 'line') c[b.who] = (c[b.who] || 0) + 1; });
  s.characters = Object.keys(c).sort((a, b) => c[b] - c[a]);
  s.me = (s.me || []).filter(m => c[m]);
}

// ---------- Demo ----------
const DEMO = `INNEN. TANKSTELLE – NACHT
Neonlicht. MIRA (Mitte 20) sortiert Kaugummis. JONAS (Mitte 20) kommt rein, nass vom Regen, und legt eine einzelne Banane auf den Tresen.

MIRA
Eine Banane. Um drei Uhr morgens.

JONAS
Ich hab Hunger auf was Gesundes.

MIRA
Du sitzt seit einer Stunde draußen im Auto.

JONAS
(ertappt)
Du hast mich gesehen.

MIRA
Kamera zwei. Du hast mit dem Lenkrad geredet.

JONAS
Ich hab geübt.

MIRA
Was?

JONAS
Was ich dir sagen will.

Pause. Mira legt die Banane langsam zur Seite.

MIRA
Jonas. Wenn das wegen Samstag ist …

JONAS
Es ist nicht wegen Samstag. Es ist wegen der letzten drei Jahre.

MIRA
(leise)
Dann sag's halt.

JONAS
Ich zieh nach Köln. Am Montag.

MIRA
Und dafür kaufst du eine Banane?

JONAS
Ich wollte nicht mit leeren Händen kommen.

Mira muss lachen, obwohl sie nicht will.

MIRA
Ein Euro neunzehn.

JONAS
Das ist alles? Mehr sagst du nicht?

MIRA
(schiebt ihm die Banane hin)
Doch. Fahr vorsichtig.`;

async function loadDemo() {
  const parsed = parseLines(textToLines(DEMO), 'Nachtschicht (Demo)');
  const s = { id: uid(), title: parsed.title, created: new Date().toISOString(), blocks: parsed.blocks, characters: parsed.characters, me: ['JONAS'], src: 'demo', voices: {} };
  await db.put('scripts', s);
  go('skript-' + s.id);
}

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
render();
// Neue Castings im Hintergrund prüfen, wenn die App wieder geöffnet wird
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const { list } = await loadRadar();
  updateBadge(newOnes(list).length);
});
