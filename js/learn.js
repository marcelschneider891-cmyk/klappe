// Lern-Modus: Lückentext, Fortschritt pro Szene, Erinnerungen über ntfy.
import { db, ls } from './db.js';
import { initials } from './runner.js';
import { topic } from './profile.js';

// Anzeigestufen beim Proben, von leicht nach schwer
export const MODES = [
  { k: 'zeigen', l: 'Ganzer Text' },
  { k: 'luecke1', l: 'Lückentext leicht' },
  { k: 'luecke2', l: 'Lückentext schwer' },
  { k: 'anfang', l: 'Nur Anfangsbuchstaben' },
  { k: 'aus', l: 'Text versteckt' }
];

// Wörter durch Striche ersetzen. Gleiche Lücken bei jedem Durchgang, damit man sie lernt.
export function gaps(text, level) {
  let i = 0;
  return text.replace(/(\([^)]*\))|([\p{L}\p{N}'’\-]+)/gu, (m, paren, w) => {
    if (paren) return m;
    i++;
    const hide = level === 1 ? (i % 3 === 2 && w.length > 2) : (i % 3 !== 1);
    return hide ? '_'.repeat(Math.min(w.length, 10)) : w;
  });
}
export function display(text, mode) {
  if (mode === 'luecke1') return gaps(text, 1);
  if (mode === 'luecke2') return gaps(text, 2);
  if (mode === 'anfang') return initials(text);
  return text;
}

// Ergebnis für einen eigenen Satz speichern (nur wenn der Text nicht voll sichtbar war)
export async function record(script, blockId, clean, mode) {
  if (mode === 'zeigen') return;
  const s = await db.get('scripts', script.id);
  if (!s) return;
  s.learn = s.learn || {};
  const hist = s.learn[blockId] || [];
  hist.push(clean ? (mode === 'aus' || mode === 'anfang' ? 2 : 1) : 0);
  s.learn[blockId] = hist.slice(-4);
  s.practiced = new Date().toISOString();
  await db.put('scripts', s);
  script.learn = s.learn; script.practiced = s.practiced;
}

// Wie gut sitzt der Text? Ein Satz "sitzt", wenn er die letzten zwei Male ohne Hilfe kam.
export function mastery(s) {
  const mine = s.blocks.filter(b => b.type === 'line' && (s.me || []).includes(b.who));
  if (!mine.length) return null;
  let score = 0;
  for (const b of mine) {
    const h = (s.learn || {})[b.id] || [];
    const last = h.slice(-2);
    if (last.length === 2 && last.every(x => x === 2)) score += 1;
    else if (last.length && last[last.length - 1] > 0) score += last[last.length - 1] === 2 ? 0.6 : 0.4;
  }
  return Math.round(score / mine.length * 100);
}
export const masteryLabel = s => { const m = mastery(s); return m == null ? '' : m === 0 && !s.practiced ? 'noch nicht geübt' : `sitzt zu ${m} %`; };

// ---------- Erinnerungen (ntfy liefert zeitversetzt, bis zu 3 Tage im Voraus) ----------
export const remindCfg = () => Object.assign({ on: false, time: '19:00', castings: true }, ls.get('remind', {}));
export function setRemindCfg(v) { ls.set('remind', { ...remindCfg(), ...v }); ls.set('remind.sent', []); }

async function post(at, title, text) {
  const t = topic();
  if (!t) return false;
  try {
    await fetch(`https://ntfy.sh/${encodeURIComponent(t)}`, { method: 'POST', headers: { Title: title, At: String(Math.floor(at / 1000)), Tags: 'clapper', Click: location.origin + location.pathname + '#skripte' }, body: text });
    return true;
  } catch { return false; }
}
const ascii = s => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss');

export async function scheduleReminders() {
  const cfg = remindCfg();
  if (!topic()) return;
  const sent = new Set(ls.get('remind.sent', []));
  const now = Date.now();
  const [hh, mm] = cfg.time.split(':').map(Number);
  if (cfg.on) {
    const scripts = (await db.all('scripts')).filter(s => s.me?.length);
    const weakest = scripts.map(s => ({ s, m: mastery(s) ?? 0 })).sort((a, b) => a.m - b.m)[0];
    for (let d = 0; d < 3; d++) {
      const at = new Date(); at.setDate(at.getDate() + d); at.setHours(hh, mm, 0, 0);
      const key = 'p:' + at.toISOString().slice(0, 10);
      if (at.getTime() < now + 60e3 || at.getTime() > now + 3 * 86400e3 - 60e3 || sent.has(key)) continue;
      const txt = weakest ? `„${weakest.s.title}“ ${weakest.m ? `sitzt zu ${weakest.m} %` : 'wartet auf dich'}. 10 Minuten reichen.` : 'Lade eine Szene und lern ein paar Sätze.';
      if (await post(at.getTime(), ascii('Zeit zum Proben'), txt)) sent.add(key);
    }
  }
  if (cfg.castings) {
    const aud = await db.all('auditions');
    for (const a of aud) {
      if (!a.datum || !['Live-Casting', 'Callback'].includes(a.typ)) continue;
      const at = new Date(a.datum + 'T18:00:00'); at.setDate(at.getDate() - 1);
      const key = 'a:' + a.id + ':' + a.datum;
      if (at.getTime() < now + 60e3 || at.getTime() > now + 3 * 86400e3 - 60e3 || sent.has(key)) continue;
      if (await post(at.getTime(), ascii('Morgen: ' + (a.projekt || 'Casting')), `${a.typ}${a.zeit ? ' um ' + a.zeit + ' Uhr' : ''}${a.buero ? ' bei ' + a.buero : ''}. Text nochmal durchgehen?`)) sent.add(key);
    }
  }
  ls.set('remind.sent', [...sent].slice(-60));
}
