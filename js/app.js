// Klappe – Navigation, Heute, Skripte
import { db, uid, ls } from './db.js';
import { $, $$, esc, ICON, openSheet, closeSheet, toast, ask, fmtDate, setTop, setFab, largeTitle, daysUntil, relDays, buzz } from './ui.js';
import { pdfToLines, textToLines, parseLines } from './parser.js';
import { rehearseView } from './rehearse.js';
import { tapeView, reviewTake, downloadTake, shareTake } from './tape.js';
import { castingsView, loadAuditions, stats, statsHtml, auditionRow, auditionSheet } from './castings.js';
import { radarView, loadRadar, newOnes, updateBadge, miniHtml } from './radar.js';
import { profileView, profileEdit, settingsView, getProfile, getPhotoUrl, initials, captureSetupLink, syncRadar } from './profile.js';
import { openVoiceSheet, voiceLabel } from './voicesheet.js';

const view = $('#view');
let cleanup = null;

// ---------- Router ----------
export function go(route, replace = false) {
  const h = '#' + route;
  if (location.hash === h) render();
  else if (replace) { history.replaceState(null, '', h); render(); }
  else location.hash = h;
}
window.addEventListener('hashchange', () => { captureSetupLink(); render(); });
$('#back').onclick = () => { if (history.length > 1) history.back(); else go('start'); };

const TABS = ['start', 'skripte', 'castings', 'radar'];
async function render() {
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  closeSheet();
  const h = location.hash.slice(1) || 'start';
  const [name, ...rest] = h.split('-');
  const id = rest.join('-');
  const parent = name === 'skript' ? 'skripte' : ['profil', 'profilbearbeiten', 'einstellungen'].includes(name) ? 'start' : name;
  $$('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === parent));
  const full = name === 'proben' || name === 'tape';
  document.body.classList.toggle('full', full);
  $('#app').classList.toggle('full', full);
  setFab(null);
  view.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    if (name === 'start') cleanup = await startView();
    else if (name === 'skripte') await scriptsView();
    else if (name === 'skript') await scriptView(id);
    else if (full) {
      const s = await db.get('scripts', id);
      if (!s) return go('skripte', true);
      if (!s.me?.length) { toast('Wähle zuerst deine Rolle.'); return go('skript-' + id, true); }
      const exit = () => go('skript-' + id, true);
      cleanup = name === 'proben' ? await rehearseView(view, s, { exit }) : await tapeView(view, s, { exit, profile: await getProfile() });
    }
    else if (name === 'castings') await castingsView(view, { go });
    else if (name === 'radar') await radarView(view, { go });
    else if (name === 'profil') cleanup = await profileView(view, { go });
    else if (name === 'profilbearbeiten') await profileEdit(view, { go });
    else if (name === 'einstellungen') await settingsView(view, { go });
    else if (name === 'import') await importShared();
    else go('start', true);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="empty" style="margin-top:24px"><b>Da ist etwas schiefgelaufen</b>${esc(e.message || e)}</div>`;
  }
}

// ---------- Heute ----------
async function startView() {
  const [scripts, auditions, radar, profile, photo] = await Promise.all([db.all('scripts'), loadAuditions(), loadRadar(), getProfile(), getPhotoUrl()]);
  setTop({ title: 'Heute', large: true, actions: `<button class="ic" id="toProfile" type="button" aria-label="Profil">${photo ? `<img class="avatar" src="${photo}" alt="">` : `<span class="avatar">${esc(initials(profile.name))}</span>`}</button>` });
  setFab({ label: 'Skript laden', icon: ICON.upload, onClick: importSheet });
  const fresh = newOnes(radar.list);
  updateBadge(fresh.length);
  syncRadar(profile, false, radar.profilStand);
  const freshIds = new Set(fresh.map(c => c.id));
  const teaser = radar.list.filter(c => !ls.get('radar.hidden', []).includes(c.id)).sort((a, b) => (freshIds.has(b.id) - freshIds.has(a.id)) || (b.match || 0) - (a.match || 0)).slice(0, 6);
  scripts.sort((a, b) => (b.used || b.created).localeCompare(a.used || a.created));
  const saved = new Set(ls.get('radar.saved', []));
  const due = radar.list.filter(c => c.frist && saved.has(c.id) && daysUntil(c.frist) <= 5).sort((a, b) => a.frist.localeCompare(b.frist))[0];
  const first = (profile.name || '').split(' ')[0];
  const recent = auditions.slice(0, 3);

  view.innerHTML = `${largeTitle('Heute', esc(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })) + (first ? ` · Hallo ${esc(first)}` : ''))}
   ${due ? `<a class="due" href="#radar" data-open="${esc(due.id)}"><span class="tile">${ICON.clock}</span><span class="li-main"><b>${esc(due.titel)}</b><small>Frist ${esc(relDays(due.frist))}</small></span></a>` : ''}
   <section class="sec"><div class="sec-h"><h2>Neu im Radar${fresh.length ? ` · ${fresh.length}` : ''}</h2><a href="#radar">Alle</a></div>
    ${teaser.length ? `<div class="hscroll" id="teaser">${teaser.map(c => miniHtml(c, freshIds.has(c.id))).join('')}</div>`
      : `<div class="empty">${ICON.search}<b>Noch nichts Passendes</b>${radar.offline ? 'Du bist offline.' : 'Das Radar sucht jeden Tag neu.'}</div>`}
   </section>
   <section class="sec"><div class="sec-h"><h2>Weiter proben</h2>${scripts.length ? '<a href="#skripte">Alle</a>' : ''}</div>
    ${scripts.length ? `<div class="list">${scripts.slice(0, 3).map(scriptRow).join('')}</div>`
      : `<button class="empty" id="demoBtn" type="button">${ICON.doc}<b>Probier die Demo-Szene</b>„Nachtschicht“, zwei Figuren, eine Tankstelle um drei Uhr nachts.</button>`}
   </section>
   <section class="sec"><div class="sec-h"><h2>Castings</h2><a href="#castings">Tagebuch</a></div>
    ${statsHtml(stats(auditions))}
    ${recent.length ? `<div class="list" id="recent" style="margin-top:12px">${recent.map(auditionRow).join('')}</div>` : ''}
   </section>`;
  $('#toProfile').onclick = () => go('profil');
  $('#demoBtn', view)?.addEventListener('click', loadDemo);
  $('#teaser', view)?.addEventListener('click', e => { const m = e.target.closest('[data-id]'); if (m) ls.set('radar.open', m.dataset.id); });
  $('.due', view)?.addEventListener('click', e => ls.set('radar.open', e.currentTarget.dataset.open));
  $('#recent', view)?.addEventListener('click', e => { const r = e.target.closest('[data-id]'); if (r) auditionSheet(recent.find(a => a.id === r.dataset.id), () => go('start', true)); });
  return () => { if (photo) URL.revokeObjectURL(photo); };
}

function thumb(s) {
  return s.blocks.slice(0, 8).map(b => b.type === 'act' ? `<span>${esc(b.text.slice(0, 60))}</span>` : `<i>${esc(b.who)}</i><u${s.me?.includes(b.who) ? ' class="me"' : ''}>${esc(b.text.slice(0, 50))}</u>`).join('');
}
function scriptRow(s) {
  const n = s.blocks.filter(b => b.type === 'line' && s.me?.includes(b.who)).length;
  return `<a class="li" href="#skript-${esc(s.id)}"><span class="thumb page-p" aria-hidden="true">${thumb(s)}</span><span class="li-main"><b>${esc(s.title)}</b><small>${s.me?.length ? `${esc(s.me.join(', '))} · ${n} Sätze` : 'Rolle wählen'}</small></span>${ICON.chev}</a>`;
}

// ---------- Skripte ----------
async function scriptsView() {
  const scripts = (await db.all('scripts')).sort((a, b) => b.created.localeCompare(a.created));
  setTop({ title: 'Skripte', large: true });
  setFab({ label: 'Importieren', icon: ICON.upload, onClick: importSheet });
  view.innerHTML = `${largeTitle('Skripte', scripts.length ? `${scripts.length} ${scripts.length === 1 ? 'Szene' : 'Szenen'}` : '')}
   ${scripts.length ? `<div class="pages">${scripts.map(s => {
      const n = s.blocks.filter(b => b.type === 'line' && s.me?.includes(b.who)).length;
      return `<a class="page" href="#skript-${esc(s.id)}"><div class="page-p" aria-hidden="true">${thumb(s)}</div><b>${esc(s.title)}</b><small>${s.me?.length ? `${n} Sätze für dich` : 'Rolle wählen'}</small></a>`;
    }).join('')}</div>`
    : `<button class="empty" id="demoBtn" type="button">${ICON.doc}<b>Noch keine Szene</b>Lade dein PDF über „Importieren“ oder probier die Demo-Szene.</button>
       <p class="muted small" style="padding:16px 4px">Sides aus der Mail: in Gmail aufs PDF tippen, dann Teilen und Klappe wählen.</p>`}`;
  $('#demoBtn', view)?.addEventListener('click', loadDemo);
}

function importSheet() {
  openSheet('Skript importieren', `
   <div class="list">
    <button class="li" id="iPdf" type="button"><span class="tile">${ICON.upload}</span><span class="li-main"><b>PDF wählen</b><small>Sides vom Handy</small></span></button>
    <button class="li" id="iTxt" type="button"><span class="tile">${ICON.edit}</span><span class="li-main"><b>Text einfügen</b><small>Aus einer Mail oder Notiz</small></span></button>
    <button class="li" id="iDemo" type="button"><span class="tile">${ICON.doc}</span><span class="li-main"><b>Demo-Szene</b><small>„Nachtschicht“ zum Ausprobieren</small></span></button>
   </div>
   <p class="muted small">Direkt aus Gmail: PDF öffnen, Teilen, Klappe. Klappt, sobald die App installiert ist.</p>`, body => {
    $('#iPdf', body).onclick = () => { closeSheet(); $('#pdfInput').click(); };
    $('#iTxt', body).onclick = pasteSheet;
    $('#iDemo', body).onclick = () => { closeSheet(); loadDemo(); };
  });
}

function pasteSheet() {
  openSheet('Text einfügen', `
   <div class="field"><label for="pT">Titel</label><input class="inp" id="pT" autocomplete="off"></div>
   <div class="field"><label for="pX">Szene</label><textarea class="inp mono" id="pX" placeholder="MIRA&#10;Eine Banane. Um drei Uhr morgens.&#10;&#10;JONAS&#10;Ich hab Hunger auf was Gesundes."></textarea></div>
   <p class="muted small">Namen in GROSSBUCHSTABEN über dem Text oder „Name: Text“.</p>
   <button class="btn fill wide" id="pGo" type="button">Szene anlegen</button>`, body => {
    $('#pGo', body).onclick = async () => {
      const text = $('#pX', body).value;
      if (!text.trim()) return toast('Füge zuerst den Text ein.');
      const parsed = parseLines(textToLines(text), $('#pT', body).value.trim() || 'Neue Szene');
      if (!parsed.characters.length) return toast('Keine Figuren erkannt.');
      closeSheet();
      await saveScript(parsed, 'text');
    };
  });
}

$('#pdfInput').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) await importFile(f); });

async function importFile(f) {
  const title = f.name.replace(/\.(pdf|txt)$/i, '').replace(/[_]+/g, ' ').trim() || 'Neue Szene';
  toast('Skript wird gelesen …');
  try {
    const lines = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name) ? await pdfToLines(await f.arrayBuffer()) : textToLines(await f.text());
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
    if (err.code === 'scan') openSheet('PDF ist ein Scan', '<p class="muted">In diesem PDF steckt nur ein Bild, kein Text. Nimm das Original-PDF aus der Mail oder füge den Text ein.</p><button class="btn fill wide" type="button" data-close>OK</button>');
    else if (err.message === 'offline') toast('Für den ersten PDF-Import braucht die App einmal Internet.');
    else { console.error(err); toast('Das PDF konnte nicht gelesen werden.'); }
  }
}

async function saveScript(parsed, src) {
  const s = { id: uid(), title: parsed.title, created: new Date().toISOString(), blocks: parsed.blocks, characters: parsed.characters, me: [], src, voice: null };
  await db.put('scripts', s);
  buzz(12);
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
  s.me = s.me || [];
  setTop({ title: s.title, back: true, actions: `<button class="ic" id="sVoice" type="button" aria-label="Partnerstimme">${ICON.voice}</button><button class="ic" id="sMenu" type="button" aria-label="Mehr">${ICON.more}</button>` });
  const takes = (await db.all('takes')).filter(t => t.scriptId === id).sort((a, b) => b.created.localeCompare(a.created));
  const cnt = c => s.blocks.filter(b => b.type === 'line' && b.who === c).length;
  view.innerHTML = `
   <div class="sec" style="margin-top:4px">
    <div class="sec-h"><h2>Deine Rolle</h2></div>
    <div class="chips" id="roles" style="flex-wrap:wrap;margin:0;padding:0">${s.characters.map(c => `<button class="chip${s.me.includes(c) ? ' on' : ''}" data-c="${esc(c)}" type="button">${esc(c)} · ${cnt(c)}</button>`).join('')}</div>
   </div>
   <div class="list sec"><button class="li" id="sVoice2" type="button"><span class="tile">${ICON.voice}</span><span class="li-main"><b>Partnerstimme</b><small>${esc(voiceLabel(s))}</small></span>${ICON.chev}</button></div>
   ${takes.length ? `<div class="sec"><div class="sec-h"><h2>Takes</h2></div><div class="takes">${takes.map(t => `<button class="take" type="button" data-t="${esc(t.id)}"><video muted playsinline preload="metadata"></video><b>Take ${t.n}</b><small>${esc(fmtDate(t.created))} · ${t.dur} s</small></button>`).join('')}</div></div>` : ''}
   <div class="sec"><div class="sec-h"><h2>Skript</h2><span class="muted small">Zeile antippen zum Korrigieren</span></div>
    <div class="script" id="paper">${s.blocks.map((b, i) => b.type === 'act'
      ? `<p class="act" data-edit="${i}">${esc(b.text)}</p>`
      : `<p class="ln${s.me.includes(b.who) ? ' me' : ''}" data-edit="${i}"><span class="who">${s.me.includes(b.who) ? `<mark>${esc(b.who)}</mark>` : esc(b.who)}</span><span class="txt">${esc(b.text)}</span></p>`).join('')}</div>
   </div>
   <div style="height:84px"></div>
   <div class="bar">
    <a class="btn tonal" href="#proben-${esc(id)}" id="goR">${ICON.play} Proben</a>
    <a class="btn red" href="#tape-${esc(id)}" id="goT">${ICON.rec} Aufnehmen</a>
   </div>`;

  const urls = [];
  $$('.take', view).forEach(el => {
    const t = takes.find(x => x.id === el.dataset.t);
    const u = URL.createObjectURL(t.blob); urls.push(u);
    $('video', el).src = u + '#t=0.5';
    el.onclick = () => takeSheet(t, s);
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
  const voice = () => openVoiceSheet(s, () => go('skript-' + id, true));
  $('#sVoice').onclick = voice;
  $('#sVoice2', view).onclick = voice;
  $('#paper', view).onclick = e => { const p = e.target.closest('[data-edit]'); if (p) editBlock(s, +p.dataset.edit); };
  $('#sMenu').onclick = () => openSheet('Skript', `
    <div class="field"><label for="eT">Titel</label><input class="inp" id="eT" value="${esc(s.title)}"></div>
    <button class="btn fill wide" id="eSave" type="button">Speichern</button>
    <button class="btn danger wide" id="eDel" type="button">Skript löschen</button>`, body => {
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

function takeSheet(t, s) {
  openSheet(`Take ${t.n}`, `
   <div class="list">
    <button class="li" data-a="play" type="button"><span class="tile">${ICON.play}</span><span class="li-main"><b>Ansehen</b></span></button>
    <button class="li" data-a="share" type="button"><span class="tile">${ICON.share}</span><span class="li-main"><b>Teilen</b><small>An Agentur, WhatsApp, Drive …</small></span></button>
    <button class="li" data-a="dl" type="button"><span class="tile">${ICON.dl}</span><span class="li-main"><b>Auf dem Handy speichern</b></span></button>
    <button class="li" data-a="del" type="button"><span class="tile" style="color:var(--bad)">${ICON.trash}</span><span class="li-main"><b>Löschen</b></span></button>
   </div>`, body => {
    body.onclick = async e => {
      const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return;
      if (a === 'play') reviewTake(t, s);
      else if (a === 'share') shareTake(t, s.title);
      else if (a === 'dl') downloadTake(t, s.title);
      else if (await ask('Take löschen?', `Take ${t.n} wird aus der App gelöscht. Gespeicherte Kopien bleiben.`)) { await db.del('takes', t.id); go('skript-' + s.id, true); }
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
   <div class="field"><label for="bX">Text</label><textarea class="inp" id="bX" style="min-height:120px">${esc(b.text)}</textarea></div>
   <button class="btn fill wide" id="bSave" type="button">Speichern</button>
   <button class="btn danger wide" id="bDel" type="button">Zeile löschen</button>`, body => {
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
  const s = { id: uid(), title: parsed.title, created: new Date().toISOString(), blocks: parsed.blocks, characters: parsed.characters, me: ['JONAS'], src: 'demo', voice: null };
  await db.put('scripts', s);
  go('skript-' + s.id);
}

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
captureSetupLink();
render().finally(() => { window.__klappeOk = true; document.getElementById('rescue')?.remove(); });
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  const { list } = await loadRadar();
  updateBadge(newOnes(list).length);
});
