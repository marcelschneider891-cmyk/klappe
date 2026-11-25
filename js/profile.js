// Profil (bearbeitbar), Einstellungen und Abgleich mit dem Casting-Radar
import { db, ls } from './db.js';
import { $, $$, esc, ICON, setTop, setFab, largeTitle, toast, buzz, openSheet, closeSheet, fmtDate, safeUrl, ask } from './ui.js';
import { tts, srAvailable } from './speech.js';
import { SOURCES, defaults as voiceDefaults, setDefaults as setVoiceDefaults, eleven, cleanKey } from './voices.js';
import { defaultOpts } from './rehearse.js';
import { remindCfg, setRemindCfg, scheduleReminders } from './learn.js';
import { syncSection } from './syncui.js';
import { lastBackup, makeBackup, saveBackup, readBackup, summary, applyBackup } from './backup.js';
import { pattern as takePattern, takeName, PATTERN_DEFAULT } from './takes.js';

// Start-Profil aus Marcels Website (öffentliche Angaben)
const BASE = {
  name: 'Marcel Schneider', beruf: 'Schauspieler', geschlecht: 'männlich', spielalterVon: 18, spielalterBis: 29,
  groesse: 193, augen: 'blau-grün', haare: '', statur: 'sportlich', wohnort: 'Alpirsbach, Schwarzwald',
  gebiet: 'bund-tape', sprachen: ['Deutsch', 'Englisch'], dialekte: [], skills: ['Grundausbildung Bundeswehr'],
  fuehrerschein: '', agentur: '', formate: ['Kino', 'Serie', 'TV-Film', 'Kurzfilm', 'Werbung', 'Theater', 'Musikvideo'],
  nurBezahlt: true, verfuegbarAb: '2026-12-15', email: '',
  erfahrung: 'Kino: Die Tribute von Panem – The Ballad of Songbirds and Snakes (District Tribute), internationale Kinoproduktion (demnächst). Serie: Spuren (Polizist), Mein Traum – Meine Geschichte. Film: Pitfall (Teen), Im Rosengarten. Kurzfilm: ANNA – A Tale for Tomorrow (Soldat). TV: First Dates (VOX).',
  links: { imdb: 'https://www.imdb.com/de/name/nm16978409/', stagepool: 'https://de.stagepool.com/cv/marcel.snd/1080464', instagram: 'https://www.instagram.com/_marcel.snd_', tiktok: 'https://www.tiktok.com/@.marcelofficial', website: 'https://marcel-schauspieler.de' },
  updated: '2026-11-25T00:00:00.000Z'
};
export const GEBIET = [
  { k: 'nah', l: 'Nur vor Ort in Baden-Württemberg' },
  { k: 'sued', l: 'Süddeutschland vor Ort, sonst Self-Tape' },
  { k: 'bund-tape', l: 'Vor Ort in BW, bundesweit per Self-Tape' },
  { k: 'bund', l: 'Bundesweit, auch vor Ort' },
  { k: 'intl', l: 'Auch international' }
];
const FORMATE = ['Kino', 'Serie', 'TV-Film', 'Kurzfilm', 'Werbung', 'Theater', 'Musikvideo', 'Studentenfilm'];

export async function getProfile() { return Object.assign({}, BASE, (await db.kv('profile')) || {}); }
async function saveProfile(p) { p.updated = new Date().toISOString(); await db.kv('profile', p); await syncRadar(p, true); }
export async function getPhotoUrl() { const b = await db.kv('profilePhoto'); return b ? URL.createObjectURL(b) : null; }
export const initials = n => (n || '?').split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();

// ---------- Abgleich mit dem Radar (über den privaten ntfy-Kanal) ----------
export const topic = () => ls.get('ntfy.topic', '');
export function captureSetupLink() {
  const m = location.hash.match(/^#verbinden:([a-z0-9-]{8,64})$/i);
  if (!m) return false;
  ls.set('ntfy.topic', m[1]);
  history.replaceState(null, '', '#einstellungen');
  setTimeout(() => toast('Benachrichtigungen verbunden'), 400);
  return true;
}
function radarFields(p) {
  return {
    geschlecht: p.geschlecht, spielalter: `${p.spielalterVon}–${p.spielalterBis}`, groesse: p.groesse ? p.groesse + ' cm' : '', augen: p.augen, haare: p.haare, statur: p.statur,
    wohnort: p.wohnort, gebiet: GEBIET.find(g => g.k === p.gebiet)?.l || p.gebiet, sprachen: p.sprachen, dialekte: p.dialekte, skills: p.skills,
    fuehrerschein: p.fuehrerschein, formate: p.formate, nur_bezahlt: p.nurBezahlt, verfuegbar_ab: p.verfuegbarAb, erfahrung: p.erfahrung, stand: p.updated
  };
}
export async function syncRadar(p, force = false, radarStand = null) {
  const t = topic();
  if (!t) return false;
  p = p || await getProfile();
  if (!force) {
    if (radarStand && radarStand >= p.updated) return false;
    if (Date.now() - ls.get('profil.sent', 0) < 6 * 3600e3) return false;
  }
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(t)}-profil`, { method: 'POST', body: JSON.stringify(radarFields(p)) });
    ls.set('profil.sent', Date.now());
    return true;
  } catch { return false; }
}

// ---------- Profil ansehen ----------
export async function profileView(view, { go }) {
  const p = await getProfile();
  const photo = await getPhotoUrl();
  setTop({ title: 'Profil', back: true, actions: `<button class="ic" id="pSet" type="button" aria-label="Einstellungen">${ICON.gear}</button>` });
  setFab({ label: 'Bearbeiten', icon: ICON.edit, onClick: () => go('profilbearbeiten') });
  const lk = Object.entries(p.links || {}).filter(([, u]) => safeUrl(u));
  const LBL = { imdb: 'IMDb', stagepool: 'Stagepool', instagram: 'Instagram', tiktok: 'TikTok', website: 'Website', castforward: 'Castforward', filmmakers: 'Filmmakers' };
  view.innerHTML = `
   <div class="ph">
    <button class="photo" id="pPhoto" type="button" aria-label="Profilfoto ändern">${photo ? `<img src="${photo}" alt="">` : esc(initials(p.name))}</button>
    <span class="cam" aria-hidden="true">${ICON.cam}</span>
    <h2>${esc(p.name)}</h2>
    <p>${esc(p.beruf)}${p.wohnort ? ' · ' + esc(p.wohnort) : ''}</p>
   </div>
   <div class="facts sec">
    <div><b>${esc(p.spielalterVon)}–${esc(p.spielalterBis)}</b><span>Spielalter</span></div>
    <div><b>${p.groesse ? esc(p.groesse) + ' cm' : '–'}</b><span>Größe</span></div>
    <div><b>${esc(p.augen || '–')}</b><span>Augen</span></div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Für das Casting-Radar</h2></div>
    <div class="list">
     <div class="set"><span class="tile">${ICON.pin}</span><div class="li-main"><b>${esc(GEBIET.find(g => g.k === p.gebiet)?.l || '')}</b><small>Gebiet</small></div></div>
     <div class="set"><span class="tile">${ICON.film}</span><div class="li-main"><b>${esc((p.formate || []).join(', '))}</b><small>Formate</small></div></div>
     <div class="set"><span class="tile">${ICON.euro}</span><div class="li-main"><b>${p.nurBezahlt ? 'Nur bezahlte Castings' : 'Auch unbezahlte Projekte'}</b><small>Gage</small></div></div>
     <div class="set"><span class="tile">${ICON.cal}</span><div class="li-main"><b>${p.verfuegbarAb ? 'ab ' + esc(fmtDate(p.verfuegbarAb, { long: true, year: true })) : 'sofort'}</b><small>Verfügbar</small></div></div>
    </div>
    <p class="muted small" style="padding:8px 4px 0">${topic() ? 'Änderungen gehen beim Speichern ans Radar und gelten ab dem nächsten Suchlauf.' : 'Verbinde in den Einstellungen die Benachrichtigungen, damit das Radar dein Profil bekommt.'}</p>
   </div>
   <div class="sec"><div class="sec-h"><h2>Sprachen und Können</h2></div>
    <div class="card pad stack">
     <div class="tagbox">${[...(p.sprachen || []), ...(p.dialekte || [])].map(x => `<span class="tag">${esc(x)}</span>`).join('') || '<span class="muted">–</span>'}</div>
     <div class="tagbox">${(p.skills || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}${p.fuehrerschein ? `<span class="tag">Führerschein ${esc(p.fuehrerschein)}</span>` : ''}</div>
    </div></div>
   <div class="sec"><div class="sec-h"><h2>Erfahrung</h2></div><div class="card pad"><p>${esc(p.erfahrung || '–')}</p></div></div>
   ${p.agentur ? `<div class="sec"><div class="sec-h"><h2>Agentur</h2></div><div class="card pad"><p>${esc(p.agentur)}</p></div></div>` : ''}
   ${lk.length ? `<div class="sec"><div class="sec-h"><h2>Profile</h2></div><div class="list">${lk.map(([k, u]) => `<a class="li" href="${esc(u)}" target="_blank" rel="noopener"><span class="tile">${ICON.ext}</span><span class="li-main"><b>${esc(LBL[k] || k)}</b><small>${esc(u.replace(/^https:\/\/(www\.)?/, ''))}</small></span></a>`).join('')}</div></div>` : ''}`;
  $('#pSet').onclick = () => go('einstellungen');
  $('#pPhoto', view).onclick = () => $('#photoInput').click();
  $('#photoInput').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    await db.kv('profilePhoto', await shrink(f, 800));
    toast('Foto gespeichert'); go('profil', true);
  };
  return () => { if (photo) URL.revokeObjectURL(photo); };
}

async function shrink(file, max) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
}

// ---------- Profil bearbeiten ----------
export async function profileEdit(view, { go }) {
  const p = await getProfile();
  setTop({ title: 'Profil bearbeiten', back: true, actions: `<button class="btn text" id="peSave" type="button">Speichern</button>` });
  setFab(null);
  const tagField = (id, label, arr, ph) => `<div class="field"><span class="flabel">${label}</span><div class="tagin" data-tags="${id}">${(arr || []).map(x => `<span class="tag">${esc(x)} ✕</span>`).join('')}<input placeholder="${esc(ph)}" aria-label="${label} hinzufügen" enterkeyhint="done"></div></div>`;
  const links = p.links || {};
  view.innerHTML = `
   <div class="stack" style="gap:18px;padding-top:8px">
    <div class="field"><label for="e1">Name</label><input class="inp" id="e1" value="${esc(p.name)}" autocomplete="name"></div>
    <div class="field"><label for="e2">Beruf</label><input class="inp" id="e2" value="${esc(p.beruf)}"></div>
    <div class="grid2">
     <div class="field"><label for="e3">Spielalter von</label><input class="inp" id="e3" type="number" inputmode="numeric" min="1" max="99" value="${esc(p.spielalterVon)}"></div>
     <div class="field"><label for="e4">bis</label><input class="inp" id="e4" type="number" inputmode="numeric" min="1" max="99" value="${esc(p.spielalterBis)}"></div>
    </div>
    <div class="grid2">
     <div class="field"><label for="e5">Größe (cm)</label><input class="inp" id="e5" type="number" inputmode="numeric" value="${esc(p.groesse)}"></div>
     <div class="field"><label for="e6">Geschlecht</label><select class="inp" id="e6">${['männlich', 'weiblich', 'divers'].map(x => `<option${x === p.geschlecht ? ' selected' : ''}>${x}</option>`).join('')}</select></div>
    </div>
    <div class="grid2">
     <div class="field"><label for="e7">Augen</label><input class="inp" id="e7" value="${esc(p.augen)}"></div>
     <div class="field"><label for="e8">Haare</label><input class="inp" id="e8" value="${esc(p.haare)}" placeholder="z. B. dunkelblond"></div>
    </div>
    <div class="grid2">
     <div class="field"><label for="e9">Statur</label><input class="inp" id="e9" value="${esc(p.statur)}"></div>
     <div class="field"><label for="e10">Führerschein</label><input class="inp" id="e10" value="${esc(p.fuehrerschein)}" placeholder="z. B. B"></div>
    </div>
    <div class="field"><label for="e11">Wohnort</label><input class="inp" id="e11" value="${esc(p.wohnort)}"></div>
    <div class="field"><label for="e12">Wo spielst du?</label><select class="inp" id="e12">${GEBIET.map(g => `<option value="${g.k}"${g.k === p.gebiet ? ' selected' : ''}>${g.l}</option>`).join('')}</select></div>
    <div class="field"><span class="flabel">Formate fürs Radar</span><div class="chips" id="eFormate" style="flex-wrap:wrap;margin:0;padding:0">${FORMATE.map(f => `<button type="button" class="chip${(p.formate || []).includes(f) ? ' on' : ''}" data-f="${f}">${f}</button>`).join('')}</div></div>
    <div class="set card"><div class="li-main"><b>Nur bezahlte Castings</b><small>Projekte ohne Gage ausblenden</small></div><label class="switch"><input type="checkbox" id="e13"${p.nurBezahlt ? ' checked' : ''} aria-label="Nur bezahlte Castings"><i></i></label></div>
    <div class="field"><label for="e14">Verfügbar ab</label><input class="inp" id="e14" type="date" value="${esc(p.verfuegbarAb)}"></div>
    ${tagField('sprachen', 'Sprachen', p.sprachen, 'Sprache hinzufügen')}
    ${tagField('dialekte', 'Dialekte und Akzente', p.dialekte, 'z. B. Schwäbisch')}
    ${tagField('skills', 'Besondere Fähigkeiten', p.skills, 'z. B. Reiten, Kampfsport, Gitarre')}
    <div class="field"><label for="e15">Erfahrung</label><textarea class="inp" id="e15">${esc(p.erfahrung)}</textarea></div>
    <div class="field"><label for="e16">Agentur</label><input class="inp" id="e16" value="${esc(p.agentur)}" placeholder="Ohne Agentur leer lassen"></div>
    <div class="field"><label for="e17">E-Mail für Castings (bleibt auf dem Handy)</label><input class="inp" id="e17" type="email" value="${esc(p.email)}" autocomplete="email"></div>
    ${['imdb', 'stagepool', 'castforward', 'filmmakers', 'instagram', 'tiktok', 'website'].map(k => `<div class="field"><label for="l-${k}">${{ imdb: 'IMDb', stagepool: 'Stagepool', castforward: 'Castforward', filmmakers: 'Filmmakers', instagram: 'Instagram', tiktok: 'TikTok', website: 'Website' }[k]}</label><input class="inp" id="l-${k}" type="url" inputmode="url" value="${esc(links[k] || '')}" placeholder="https://"></div>`).join('')}
    <button class="btn fill wide" id="peSave2" type="button">Speichern</button>
   </div>`;

  $$('[data-tags]', view).forEach(box => {
    const inp = $('input', box);
    const add = () => { const v = inp.value.replace(/,/g, '').trim(); if (!v) return; const t = document.createElement('span'); t.className = 'tag'; t.textContent = v + ' ✕'; box.insertBefore(t, inp); inp.value = ''; };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } });
    inp.addEventListener('blur', add);
    box.addEventListener('click', e => { if (e.target.classList.contains('tag')) e.target.remove(); else inp.focus(); });
  });
  $('#eFormate', view).onclick = e => { const c = e.target.closest('.chip'); if (c) c.classList.toggle('on'); };
  const tags = id => $$(`[data-tags="${id}"] .tag`, view).map(t => t.textContent.replace(/\s*✕$/, ''));

  const save = async () => {
    const v = id => $('#' + id, view).value.trim();
    const n = {
      ...p, name: v('e1') || p.name, beruf: v('e2'), spielalterVon: +v('e3') || p.spielalterVon, spielalterBis: +v('e4') || p.spielalterBis,
      groesse: +v('e5') || '', geschlecht: v('e6'), augen: v('e7'), haare: v('e8'), statur: v('e9'), fuehrerschein: v('e10'), wohnort: v('e11'),
      gebiet: v('e12'), formate: $$('#eFormate .chip.on', view).map(c => c.dataset.f), nurBezahlt: $('#e13', view).checked, verfuegbarAb: v('e14'),
      sprachen: tags('sprachen'), dialekte: tags('dialekte'), skills: tags('skills'), erfahrung: v('e15'), agentur: v('e16'), email: v('e17'),
      links: Object.fromEntries(['imdb', 'stagepool', 'castforward', 'filmmakers', 'instagram', 'tiktok', 'website'].map(k => [k, safeUrl(v('l-' + k)) || '']))
    };
    if (n.spielalterVon > n.spielalterBis) return toast('Spielalter: „von“ muss kleiner sein als „bis“.');
    await saveProfile(n);
    buzz(12);
    toast(topic() ? 'Gespeichert. Das Radar sucht ab dem nächsten Lauf damit.' : 'Gespeichert');
    go('profil', true);
  };
  $('#peSave').onclick = save;
  $('#peSave2', view).onclick = save;
}

// Sicherung einlesen (aus der Dateiauswahl oder per Ziehen und Ablegen am PC)
export async function importBackupFile(f, go) {
  try {
    const b = await readBackup(f);
    const s = summary(b.data);
    const ok = await ask('Sicherung laden?', `Vom ${new Date(b.head.created).toLocaleDateString('de-DE')}: ${s.scripts} Skripte, ${s.auditions} Castings, ${s.takes} Takes. Gleiche Einträge werden überschrieben, alles andere bleibt.`, 'Laden');
    if (!ok) return;
    toast('Wird geladen …');
    await applyBackup(b);
    toast('Sicherung geladen'); go('start', true);
  } catch (err) { toast(err.message || 'Die Datei konnte nicht gelesen werden.'); }
}

// ---------- Einstellungen ----------
export async function settingsView(view, { go }) {
  setTop({ title: 'Einstellungen', back: true });
  setFab(null);
  const vd = voiceDefaults();
  const ro = defaultOpts();
  const t = topic();
  let est = null;
  try { est = await navigator.storage?.estimate?.(); } catch {}
  const persisted = await navigator.storage?.persisted?.().catch(() => false);
  const dv = tts.germanVoices();
  const rc = remindCfg();
  const lb = await lastBackup();
  view.innerHTML = `
   <div class="sec" style="margin-top:8px"><div class="sec-h"><h2>Partnerstimme</h2></div>
    <div class="card pad stack">
     <span class="flabel">Standard für neue Skripte</span>
     <div class="seg" id="sSrc">${SOURCES.map(x => `<button type="button" data-k="${x.k}"${x.k === vd.source ? ' class="on"' : ''}>${x.l}</button>`).join('')}</div>
     <p class="muted small">In jedem Skript kannst du die Stimme pro Figur ändern.</p>
    </div>
    <div class="card pad stack" style="margin-top:12px">
     <div class="row" style="justify-content:space-between"><b>ElevenLabs</b><span class="tag${eleven.key() ? ' ok' : ''}" id="elState">${eleven.key() ? 'Verbunden' : 'Nicht verbunden'}</span></div>
     <p class="muted small">Natürliche Stimmen mit deinem eigenen ElevenLabs-Konto. Den API-Schlüssel findest du auf elevenlabs.io unter „Developers › API Keys“. Er braucht die Rechte „Text to Speech“ und „Voices: Read“. Ist der Abgleich an, kommt er automatisch auch auf dein anderes Gerät.</p>
     <div class="field"><label for="sKey">API-Schlüssel</label><input class="inp" id="sKey" type="password" autocomplete="off" spellcheck="false" value="${esc(eleven.key())}" placeholder="sk_…"></div>
     <div class="grid2"><button class="btn tonal" id="sKeySave" type="button">Prüfen und speichern</button><button class="btn out" id="sKeyDel" type="button"${eleven.key() ? '' : ' disabled'}>Entfernen</button></div>
     <div id="sElVoice"></div>
    </div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Proben</h2></div>
    <div class="list">
     <div class="set"><div class="li-main"><b>Wann geht es weiter?</b><small>Nach deinem Satz</small></div>
      <select class="inp" id="sListen" style="width:auto;min-height:44px;padding:8px">${[...(srAvailable ? [['sr', 'Zuhören']] : []), ['vad', 'Pause erkennen'], ['tap', 'Tippen'], ['auto', 'Nach Zeit']].map(([k, l]) => `<option value="${k}"${ro.listen === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
     <div class="set"><div class="li-main"><b>Deutsche Handy-Stimmen</b><small>${dv.length ? dv.length + ' installiert' : 'Keine gefunden. In Android unter Sprachausgabe Deutsch installieren.'}</small></div></div>
    </div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Benachrichtigungen</h2></div>
    <div class="card pad stack">
     ${t ? `<p>Verbunden. Neue Castings kommen über die App <b>ntfy</b>.</p><div class="grid2"><button class="btn tonal" id="sTest" type="button">${ICON.bell} Test senden</button><button class="btn out" id="sSync" type="button">Profil senden</button></div>`
       : '<p>Noch nicht verbunden. Öffne einmal den Verbindungs-Link, den du von Claude bekommen hast.</p>'}
    </div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Erinnerungen</h2></div>
    <div class="list">
     <div class="set"><div class="li-main"><b>Täglich proben</b><small>Kurze Nachricht über ntfy, welche Szene noch nicht sitzt</small></div><label class="switch"><input type="checkbox" id="rOn"${rc.on ? ' checked' : ''}${t ? '' : ' disabled'} aria-label="Täglich ans Proben erinnern"><i></i></label></div>
     <div class="set"><div class="li-main"><b>Uhrzeit</b></div><input class="inp" id="rTime" type="time" value="${esc(rc.time)}" style="width:auto;min-height:44px;padding:8px"></div>
     <div class="set"><div class="li-main"><b>Vor Live-Castings und Callbacks</b><small>Am Abend vorher um 18 Uhr</small></div><label class="switch"><input type="checkbox" id="rCast"${rc.castings ? ' checked' : ''}${t ? '' : ' disabled'} aria-label="Vor Castings erinnern"><i></i></label></div>
    </div>
    ${t ? '' : '<p class="muted small" style="padding:8px 4px 0">Erinnerungen kommen über ntfy. Verbinde dafür zuerst die Benachrichtigungen.</p>'}
   </div>
   <div class="sec"><div class="sec-h"><h2>Self-Tape-Dateiname</h2></div>
    <div class="card pad stack">
     <div class="field"><label for="tpPat">Muster</label><input class="inp" id="tpPat" value="${esc(takePattern())}" spellcheck="false"></div>
     <p class="muted small">Bausteine: {Name} {Vorname} {Nachname} {Rolle} {Projekt} {Nr} {Datum}. Beispiel: <b id="tpEx"></b></p>
    </div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Abgleich Handy ↔ PC</h2></div><div id="syncBox"></div></div>
   <div class="sec"><div class="sec-h"><h2>Sicherung</h2></div>
    <div class="card pad stack">
     <p>${lb ? 'Letzte Sicherung: ' + esc(new Date(lb).toLocaleString('de-DE', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + ' Uhr' : 'Noch keine Sicherung.'}</p>
     <p class="muted small">Sichert Skripte, Tagebuch, Profil, Foto, Stimmen und Einstellungen in eine Datei. Speicher sie in Google Drive, dann kannst du alles auch auf einem neuen Handy wiederholen. Dein ElevenLabs-Schlüssel kommt nicht mit hinein.</p>
     <div class="set" style="padding:0"><div class="li-main"><b>Videos (Takes) mitsichern</b><small>Macht die Datei deutlich größer</small></div><label class="switch"><input type="checkbox" id="bkTakes" aria-label="Takes mitsichern"><i></i></label></div>
     <div class="grid2"><button class="btn fill" id="bkShare" type="button">${ICON.share} In Drive sichern</button><button class="btn out" id="bkDl" type="button">${ICON.dl} Als Datei</button></div>
     <button class="btn text" id="bkLoad" type="button">Sicherung laden</button>
    </div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Speicher</h2></div>
    <div class="list">
     <div class="set"><div class="li-main"><b>${est ? (est.usage / 1048576).toFixed(0) + ' MB belegt' : 'Speicher'}</b><small>Skripte, Takes und Stimmen liegen nur auf diesem Handy</small></div></div>
     <div class="set"><div class="li-main"><b>Vor dem Löschen schützen</b><small>${persisted ? 'Aktiv: Android räumt deine Daten nicht automatisch weg' : 'Verhindert, dass Android bei wenig Speicher aufräumt'}</small></div>${persisted ? `<span class="tag ok">An</span>` : `<button class="btn sm tonal" id="sPersist" type="button">Aktivieren</button>`}</div>
    </div>
   </div>
   <div class="sec"><div class="sec-h"><h2>Hilfe</h2></div>
    <div class="list">
     <a class="li" href="#neu"><span class="tile">${ICON.star}</span><span class="li-main"><b>Was ist neu</b><small>Alle Neuerungen und Verbesserungen</small></span>${ICON.chev}</a>
     <a class="li" href="#" id="sTut"><span class="tile">${ICON.info}</span><span class="li-main"><b>Tutorial ansehen</b><small>Die wichtigsten Funktionen in einer Minute</small></span>${ICON.chev}</a>
    </div>
   </div>
   <p class="legal">Klappe · Stand 25. November 2026</p>`;
  $('#sTut', view).onclick = e => { e.preventDefault(); window.dispatchEvent(new Event('klappe-tutorial')); };

  $('#sSrc', view).onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; setVoiceDefaults({ source: b.dataset.k }); $$('#sSrc button', view).forEach(x => x.classList.toggle('on', x === b)); toast('Standard: ' + b.textContent); };
  $('#sListen', view).onchange = e => { ls.set('rehearse.opts', { ...ls.get('rehearse.opts', {}), listen: e.target.value }); toast('Gespeichert'); };

  const drawElVoice = async () => {
    const box = $('#sElVoice', view);
    if (!eleven.key()) { box.innerHTML = ''; return; }
    try {
      const list = await eleven.voices();
      const cur = voiceDefaults().elevenVoice?.id || '';
      box.innerHTML = `<div class="field"><label for="sElV">Standard-Stimme</label><select class="inp" id="sElV"><option value="">Bitte wählen …</option>${list.map(v => `<option value="${esc(v.id)}"${v.id === cur ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></div>`;
      $('#sElV', box).onchange = e => { setVoiceDefaults({ elevenVoice: e.target.value ? { id: e.target.value, name: e.target.selectedOptions[0].textContent } : null }); toast('Gespeichert'); };
    } catch (err) { box.innerHTML = `<p class="small" style="color:var(--bad)">${esc(err.message)}</p>`; }
  };
  drawElVoice();
  $('#sKeySave', view).onclick = async () => {
    const k = $('#sKey', view).value;
    const b = $('#sKeySave', view); b.disabled = true;
    try { await eleven.checkAndSave(k); $('#sKey', view).value = eleven.key(); $('#elState', view).textContent = 'Verbunden'; $('#elState', view).className = 'tag ok'; $('#sKeyDel', view).disabled = false; toast('ElevenLabs verbunden'); drawElVoice(); }
    catch (err) { toast(err.message + (eleven.key() && eleven.key() !== cleanKey(k) ? ' Dein bisheriger Schlüssel bleibt gespeichert.' : '')); }
    finally { b.disabled = false; }
  };
  $('#sKeyDel', view).onclick = () => { eleven.setKey(''); $('#sKey', view).value = ''; go('einstellungen', true); toast('Schlüssel entfernt'); };
  $('#sTest', view)?.addEventListener('click', async () => {
    try { await fetch(`https://ntfy.sh/${encodeURIComponent(t)}`, { method: 'POST', headers: { Title: 'Klappe Test' }, body: 'Benachrichtigungen funktionieren.' }); toast('Test gesendet. Kommt gleich in ntfy an.'); }
    catch { toast('Senden fehlgeschlagen. Bist du online?'); }
  });
  $('#sSync', view)?.addEventListener('click', async () => toast(await syncRadar(null, true) ? 'Profil ans Radar gesendet' : 'Senden fehlgeschlagen'));
  // Abgleich
  const drawSync = () => syncSection($('#syncBox', view), drawSync);
  drawSync();
  // Erinnerungen
  const saveRemind = () => { setRemindCfg({ on: $('#rOn', view).checked, castings: $('#rCast', view).checked, time: $('#rTime', view).value || '19:00' }); scheduleReminders(); toast('Gespeichert'); };
  ['rOn', 'rCast', 'rTime'].forEach(id => $('#' + id, view).addEventListener('change', saveRemind));
  // Dateiname
  const ex = async () => { $('#tpEx', view).textContent = await takeName({ n: 1, type: 'video/mp4', created: new Date().toISOString() }, { title: 'Halbmond 103', me: ['LUKE'] }); };
  $('#tpPat', view).addEventListener('input', e => { ls.set('take.pattern', e.target.value.trim() || PATTERN_DEFAULT); ex(); });
  ex();
  // Sicherung
  const doBackup = async how => {
    const btns = ['#bkShare', '#bkDl'].map(s => $(s, view)); btns.forEach(b => b.disabled = true);
    toast('Sicherung wird erstellt …');
    try {
      const f = await makeBackup({ withTakes: $('#bkTakes', view).checked });
      const r = await saveBackup(f, how);
      if (r !== 'cancel') { toast(`Gesichert (${(f.size / 1048576).toFixed(1)} MB)`); go('einstellungen', true); }
    } catch (e) { console.error(e); toast('Sicherung fehlgeschlagen.'); }
    btns.forEach(b => b.disabled = false);
  };
  $('#bkShare', view).onclick = () => doBackup('share');
  $('#bkDl', view).onclick = () => doBackup('download');
  $('#bkLoad', view).onclick = () => $('#backupInput').click();
  $('#backupInput').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) importBackupFile(f, go);
  };
  $('#sPersist', view)?.addEventListener('click', async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? 'Geschützt' : 'Android hat abgelehnt. Installiere die App auf dem Startbildschirm und versuch es nochmal.'); go('einstellungen', true); });
}
